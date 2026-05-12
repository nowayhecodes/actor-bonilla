// mailbox.zig — Mailbox implementations: BoundedMailbox (SPSC ring buffer),
// UnboundedMailbox (linked chunks), PriorityMailbox (mutex-guarded min-heap).

const std = @import("std");
const signals = @import("signals.zig");

// ============================================================================
// Envelope — the unit of exchange between JS and Zig
// ============================================================================

pub const Envelope = extern struct {
    /// napi_ref wrapping the JS message value; null for signal messages.
    message_ref: ?*anyopaque,
    /// Target actor ID — set by the dispatch path so receiveCallJs can pass it to JS.
    actor_id: u64,
    /// Sender actor ID; 0 means no sender.
    sender_id: u64,
    /// Unix timestamp in milliseconds.
    timestamp: u64,
    /// Monotonic message ID assigned by the JS side.
    message_id: u64,
    /// Whether this is a user message or a system signal.
    kind: signals.MessageKind,
    /// SystemSignal value; only valid when kind == .signal.
    signal_id: u8,
    /// Padding to 8-byte alignment.
    _pad: [6]u8,
};

comptime {
    std.debug.assert(@sizeOf(Envelope) == 48);
    std.debug.assert(@alignOf(Envelope) == 8);
}

// ============================================================================
// BoundedMailbox — SPSC ring buffer
// ============================================================================

pub fn BoundedMailbox(comptime capacity: usize) type {
    comptime {
        std.debug.assert(capacity > 0);
        std.debug.assert(std.math.isPowerOfTwo(capacity));
    }

    return struct {
        const Self = @This();
        const MASK = capacity - 1;

        buffer: [capacity]Envelope = undefined,
        head: std.atomic.Value(usize) = std.atomic.Value(usize).init(0),
        tail: std.atomic.Value(usize) = std.atomic.Value(usize).init(0),

        pub fn init() Self {
            return .{};
        }

        /// Enqueue an envelope. Returns false if the mailbox is full.
        pub fn enqueue(self: *Self, item: Envelope) bool {
            const current_tail = self.tail.load(.monotonic);
            const next_tail = current_tail +% 1;
            const current_head = self.head.load(.acquire);
            if (next_tail -% current_head > capacity) {
                return false;
            }
            self.buffer[current_tail & MASK] = item;
            self.tail.store(next_tail, .release);
            return true;
        }

        /// Dequeue an envelope. Returns null if the mailbox is empty.
        pub fn dequeue(self: *Self) ?Envelope {
            const current_head = self.head.load(.monotonic);
            const current_tail = self.tail.load(.acquire);
            if (current_head == current_tail) {
                return null;
            }
            const item = self.buffer[current_head & MASK];
            self.head.store(current_head +% 1, .release);
            return item;
        }

        pub fn len(self: *const Self) usize {
            const t = self.tail.load(.acquire);
            const h = self.head.load(.acquire);
            return t -% h;
        }

        pub fn is_empty(self: *const Self) bool {
            return self.len() == 0;
        }

        pub fn clear(self: *Self) void {
            const t = self.tail.load(.acquire);
            self.head.store(t, .release);
        }
    };
}

// ============================================================================
// UnboundedMailbox — linked list of fixed-size BoundedMailbox(256) chunks
// ============================================================================

const CHUNK_CAPACITY = 256;
const ChunkRing = BoundedMailbox(CHUNK_CAPACITY);

pub const Chunk = struct {
    ring: ChunkRing,
    next: ?*Chunk,

    pub fn init() Chunk {
        return .{
            .ring = ChunkRing.init(),
            .next = null,
        };
    }
};

pub const UnboundedMailbox = struct {
    allocator: std.mem.Allocator,
    head_chunk: *Chunk,
    tail_chunk: *Chunk,
    /// Protects tail_chunk append (single writer at a time for multi-producer safety).
    mutex: std.Thread.Mutex,
    total: std.atomic.Value(usize),

    pub fn init(allocator: std.mem.Allocator) !UnboundedMailbox {
        const initial_chunk = try allocator.create(Chunk);
        initial_chunk.* = Chunk.init();
        return .{
            .allocator = allocator,
            .head_chunk = initial_chunk,
            .tail_chunk = initial_chunk,
            .mutex = .{},
            .total = std.atomic.Value(usize).init(0),
        };
    }

    pub fn deinit(self: *UnboundedMailbox) void {
        var chunk: ?*Chunk = self.head_chunk;
        while (chunk) |c| {
            const next = c.next;
            self.allocator.destroy(c);
            chunk = next;
        }
    }

    /// Enqueue an envelope. Always succeeds (allocates new chunk if needed).
    pub fn enqueue(self: *UnboundedMailbox, item: Envelope) !void {
        self.mutex.lock();
        defer self.mutex.unlock();

        if (!self.tail_chunk.ring.enqueue(item)) {
            const new_chunk = try self.allocator.create(Chunk);
            new_chunk.* = Chunk.init();
            self.tail_chunk.next = new_chunk;
            self.tail_chunk = new_chunk;
            const ok = new_chunk.ring.enqueue(item);
            std.debug.assert(ok);
        }
        _ = self.total.fetchAdd(1, .monotonic);
    }

    /// Dequeue an envelope. Returns null if empty.
    pub fn dequeue(self: *UnboundedMailbox) ?Envelope {
        while (true) {
            const item = self.head_chunk.ring.dequeue();
            if (item) |env| {
                _ = self.total.fetchSub(1, .monotonic);
                return env;
            }
            // Head chunk is exhausted — try to advance to next.
            const next = self.head_chunk.next orelse return null;
            const old_head = self.head_chunk;
            self.head_chunk = next;
            self.allocator.destroy(old_head);
        }
    }

    pub fn len(self: *const UnboundedMailbox) usize {
        return self.total.load(.monotonic);
    }

    pub fn is_empty(self: *const UnboundedMailbox) bool {
        return self.len() == 0;
    }

    pub fn clear(self: *UnboundedMailbox) void {
        self.mutex.lock();
        defer self.mutex.unlock();

        // Drain all chunks except the first, reset to empty state.
        var chunk: ?*Chunk = self.head_chunk.next;
        while (chunk) |c| {
            const next = c.next;
            self.allocator.destroy(c);
            chunk = next;
        }
        self.head_chunk.ring.clear();
        self.head_chunk.next = null;
        self.tail_chunk = self.head_chunk;
        self.total.store(0, .monotonic);
    }
};

// ============================================================================
// PriorityMailbox — mutex-guarded min-heap ordered by message_id
// ============================================================================

pub const PriorityMailboxEntry = struct {
    envelope: Envelope,

    pub fn lessThan(_: void, a: PriorityMailboxEntry, b: PriorityMailboxEntry) std.math.Order {
        return std.math.order(a.envelope.message_id, b.envelope.message_id);
    }
};

pub const PriorityMailbox = struct {
    allocator: std.mem.Allocator,
    heap: std.PriorityQueue(PriorityMailboxEntry, void, PriorityMailboxEntry.lessThan),
    mutex: std.Thread.Mutex,

    pub fn init(allocator: std.mem.Allocator) PriorityMailbox {
        return .{
            .allocator = allocator,
            .heap = std.PriorityQueue(PriorityMailboxEntry, void, PriorityMailboxEntry.lessThan).init(allocator, {}),
            .mutex = .{},
        };
    }

    pub fn deinit(self: *PriorityMailbox) void {
        self.heap.deinit();
    }

    pub fn enqueue(self: *PriorityMailbox, item: Envelope) !void {
        self.mutex.lock();
        defer self.mutex.unlock();
        try self.heap.add(.{ .envelope = item });
    }

    pub fn dequeue(self: *PriorityMailbox) ?Envelope {
        self.mutex.lock();
        defer self.mutex.unlock();
        const entry = self.heap.removeOrNull() orelse return null;
        return entry.envelope;
    }

    pub fn len(self: *PriorityMailbox) usize {
        self.mutex.lock();
        defer self.mutex.unlock();
        return self.heap.count();
    }

    pub fn is_empty(self: *PriorityMailbox) bool {
        return self.len() == 0;
    }

    pub fn clear(self: *PriorityMailbox) void {
        self.mutex.lock();
        defer self.mutex.unlock();
        while (self.heap.removeOrNull()) |_| {}
    }
};
