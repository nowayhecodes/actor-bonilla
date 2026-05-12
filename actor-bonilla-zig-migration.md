# Actor Bonilla — Zig Native Backend: Architecture Analysis

> Analysis of migrating the actor system's concurrency/parallelism layer from Node.js `worker_threads` to a Zig-backed native addon, while preserving the TypeScript public API surface.

---

## Overview

The goal is to replace `worker_threads`-based scheduling with a Zig native addon (`.node`), keeping all TypeScript APIs intact. Zig owns the thread pool, mailboxes, actor registry, and message dispatch. Node/V8 continues to own actor behaviors, supervision logic, I/O, timers, and the event bus.

---

## Layer Diagram

```
┌─────────────────────────────────────────────────────┐
│                  TypeScript / JS                    │
│  ActorRef (tell/ask/stop/path/name)                 │
│  ActorContext (spawn/watch/become/stash/forward...)  │
│  SupervisionStrategy (decider closure)              │
│  Timers (scheduleOnce / scheduleRepeatedly)         │
│  EventBus, Router, Ask pattern                      │
│  DispatcherType.CallingThread                       │
└───────────────────────┬─────────────────────────────┘
                        │  Node-API (napi)
                        │  actor_id: u64
                        │  Envelope (see below)
                        │  SystemSignal enum
                        │  SupervisionDirective enum
┌───────────────────────▼─────────────────────────────┐
│                      Zig                            │
│  Actor registry     HashMap(u64, ActorState)        │
│  Thread pool        work-stealing, std.Thread       │
│  Mailboxes          BoundedMailbox(Envelope)        │
│  Scheduler          dispatch loop                   │
│  Signal routing     SystemSignal enum               │
└─────────────────────────────────────────────────────┘
```

---

## What Zig Owns

| Responsibility | Notes |
|---|---|
| Thread pool / scheduler | `std.Thread` + work-stealing deque per thread |
| Actor registry | `HashMap(u64, ActorState)` — actors are just IDs at this layer |
| Mailboxes | Lock-free ring buffers (`BoundedMailbox`) or linked-chunk unbounded variant |
| Message dispatch | Enqueue/dequeue, wakeup signals to scheduler |
| System signal routing | `PreStart`, `PoisonPill`, `Kill`, etc. as a Zig enum |

## What Stays in TypeScript

| Responsibility | Reason |
|---|---|
| `ActorRef` (full interface) | Carries JS closures (`tell`, `ask`, `stop`) |
| `SupervisionStrategy.decider` | JS closure — can never cross the boundary |
| Timers (`scheduleOnce` / `scheduleRepeatedly`) | libuv-bound |
| `CallingThread` dispatcher | Synchronous, stays in JS entirely |
| EventBus, Router, Ask pattern | JS-only orchestration |
| I/O-bound actors (HTTP, DB) | libuv-bound; live on Node's event loop thread |

---

## The Binding Layer

The standard path is **Node-API (napi)** — a stable C ABI that Zig can target cleanly via `@cImport`.

```
TypeScript (ActorRef, ActorSystem)
        ↓  napi calls
Zig native addon (.node)
   ├── Thread pool (std.Thread)
   ├── Work-stealing deque (per-thread)
   ├── Actor registry (HashMap)
   └── Ring-buffer mailboxes (atomic)
```

Key napi primitive for Zig→JS callbacks: `napi_threadsafe_function`. This is how Zig threads invoke a JS `receive` handler back on the correct V8 thread without data races.

---

## The Envelope at the Zig Boundary

### TypeScript definition

```typescript
interface Envelope<T = unknown> {
  readonly message: T;           // arbitrary JS value
  readonly sender: ActorRef<any> | null;
  readonly timestamp: number;
  readonly messageId: number;
}
```

### Field-by-field analysis

| Field | JS type | Zig representation | Notes |
|---|---|---|---|
| `message` | `T` (arbitrary) | `napi_ref` | V8-rooted opaque handle. Zig never inspects the payload. |
| `sender` | `ActorRef \| null` | `u64` (actor ID, 0 = null) | Full `ActorRef` reconstructed on JS side from registry. |
| `timestamp` | `number` (f64) | `u64` (unix ms) | Safe cast, no precision loss for timestamps. |
| `messageId` | `number` | `u64` | Trivial. |

### Zig struct

```zig
pub const MessageKind = enum(u8) {
    user   = 0,   // normal T message, message_ref is valid
    signal = 1,   // lifecycle/system signal, check signal_id
};

pub const Envelope = extern struct {
    message_ref: napi.napi_ref,  // opaque V8-rooted ref; null for signals
    sender_id:   u64,            // 0 = null sender
    timestamp:   u64,
    message_id:  u64,
    kind:        MessageKind,
    signal_id:   u8,             // SystemSignal; valid only when kind == .signal
    _pad:        [6]u8,          // explicit padding, 8-byte aligned
};
```

`extern struct` guarantees C ABI layout — required for the napi boundary.

### Why `napi_ref` for `message`, not serialization

Actor `receive` handlers are JS behaviors. The payload only ever needs to be a JS value — Zig never inspects it. Serializing to MessagePack/FlatBuffers and back would pay a round-trip cost just to carry an opaque blob. `napi_ref` roots the value in V8's GC for the mailbox lifetime and releases it after dispatch. Zero intermediate copies.

---

## System Signals

JS `Symbol`s cannot cross the napi boundary. They map to a Zig enum:

```zig
pub const SystemSignal = enum(u8) {
    pre_start       = 0,
    post_stop       = 1,
    pre_restart     = 2,
    post_restart    = 3,
    poison_pill     = 4,
    kill            = 5,
    receive_timeout = 6,
    terminated      = 7,
};
```

Translation happens at the boundary: JS Symbol → Zig `SystemSignal` on enqueue, `SystemSignal` → JS Symbol on dispatch.

---

## Dispatcher Mapping

```typescript
DispatcherType.Default        →  Zig thread pool (work-stealing)
DispatcherType.Pinned         →  dedicated std.Thread per actor
DispatcherType.CallingThread  →  stays in JS, Zig is never involved
```

I/O-heavy actors (HTTP, DB) should be kept on `CallingThread` or a dedicated libuv-bound dispatcher. CPU-heavy actors go into Zig's pool. This mirrors Akka's dispatcher concept.

---

## Supervision

`SupervisionStrategy.decider` is a JS closure and can never live in Zig. The contract across the boundary:

1. Zig detects actor crash → sends `{ actor_id, error_bytes }` back to JS via `napi_threadsafe_function`
2. JS calls `decider(error)` → gets a `SupervisionDirective`
3. JS sends the directive back to Zig → Zig executes it (resume / restart / stop / escalate)

```zig
pub const SupervisionDirective = enum(u8) {
    resume   = 0,
    restart  = 1,
    stop     = 2,
    escalate = 3,
};
```

---

## The Mailbox in Zig

`BoundedMailbox` maps most directly — SPSC ring buffer with atomic head/tail.

```zig
pub fn BoundedMailbox(comptime T: type) type {
    return struct {
        const Self = @This();

        buffer:   []T,
        head:     Atomic(usize),
        tail:     Atomic(usize),
        mask:     usize,
        capacity: usize,
        allocator: std.mem.Allocator,

        /// SPSC enqueue. Returns false if full (backpressure).
        pub fn enqueue(self: *Self, item: T) bool {
            const tail = self.tail.load(.monotonic);
            const next_tail = (tail + 1) & self.mask;
            if (next_tail == self.head.load(.acquire)) return false;
            self.buffer[tail] = item;
            self.tail.store(next_tail, .release);
            return true;
        }

        /// SPSC dequeue. Returns null if empty.
        pub fn dequeue(self: *Self) ?T {
            const head = self.head.load(.monotonic);
            if (head == self.tail.load(.acquire)) return null;
            const item = self.buffer[head];
            self.head.store((head + 1) & self.mask, .release);
            return item;
        }
    };
}
```

`.acquire`/`.release` ordering is sufficient for SPSC — one producer (scheduler enqueues), one consumer (actor thread dequeues). No CAS loops, no locks, just memory fences.

### Unbounded variant

`UnboundedMailbox`'s `grow()` is not thread-safe at the Zig level — resizing while another thread dequeues is a data race. Two viable approaches:

- **Linked chunks**: chain of fixed-size `BoundedMailbox` segments. When the tail chunk fills, append a new one. No locking on the hot path.
- **Lock on resize only**: `std.Thread.Mutex` acquired only during the rare grow event. Simpler to implement, acceptable if growth is infrequent.

`PriorityMailbox`'s heap `sinkDown` requires a mutex unconditionally — heap rebalancing is not atomically decomposable.

---

## Hard Problems

### 1. JS callbacks back into V8

When Zig dispatches a message to an actor, it must invoke the JS `receive` handler on the correct thread. This requires `napi_threadsafe_function` — the only safe way for a non-JS thread to call into V8. It is the most complex part of the implementation.

### 2. `napi_ref` lifecycle

`napi_ref` is a manual GC root. Every enqueued message with a `message_ref` must call `napi_create_reference` on enqueue and `napi_delete_reference` after dispatch. A missed delete is a V8 memory leak; a premature delete is a use-after-free.

### 3. Distribution / prebuilds

A `.node` binary is platform-specific. Shipping requires a build matrix:

| Platform | Target |
|---|---|
| `linux-x64` | `x86_64-linux-gnu` |
| `linux-arm64` | `aarch64-linux-gnu` |
| `darwin-arm64` | `aarch64-macos` |
| `darwin-x64` | `x86_64-macos` |
| `win32-x64` | `x86_64-windows-msvc` |

Tools: `prebuildify` or `node-pre-gyp` for prebuilds. A WASM fallback (losing true parallelism) is viable as a portability escape hatch for development.

---

## Recommended Porting Order

1. **`BoundedMailbox(Envelope)` in Zig + napi bindings** for `enqueue`/`dequeue`
   - Benchmarkable in isolation against the TS version
   - Validates the napi boundary design before committing to the full registry

2. **Actor registry** (`HashMap(u64, ActorState)`) + thread pool wiring

3. **Signal translation layer** (JS Symbol ↔ `SystemSignal` enum)

4. **Supervision signal passback** (`napi_threadsafe_function` for crash reporting)

5. **`UnboundedMailbox`** (linked-chunk variant)

6. **`PriorityMailbox`** (mutex-guarded heap)

The mailbox benchmark alone will reveal whether the boundary overhead justifies the migration. If the napi round-trip cost per message is comparable to `worker_threads` structured clone, the win only materializes for CPU-bound actors with high message throughput — which is exactly the target use case.

---

## Summary

| Decision | Choice | Rationale |
|---|---|---|
| Binding layer | napi (`extern "C"`) | Stable ABI, Zig targets cleanly via `@cImport` |
| `message` field | `napi_ref` (opaque) | JS behaviors never need Zig to inspect payload |
| `sender` field | `u64` actor ID | Full `ActorRef` reconstructed on JS side |
| Mailbox model | SPSC ring buffer | Each actor is naturally single-consumer |
| Unbounded growth | Linked chunks | Thread-safe without locking the hot path |
| Supervision | JS-side decider | Closure cannot cross boundary |
| I/O actors | Stay on libuv | `CallingThread` / Node event loop |
| Signals | `SystemSignal` enum | Symbols are not serializable |
