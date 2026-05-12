// thread_pool.zig — Work-stealing thread pool.
// Each worker has a local deque; workers steal from random peers when idle.

const std = @import("std");
const napi = @cImport({
    @cInclude("node_api.h");
});
const mailbox = @import("mailbox.zig");
const registry = @import("registry.zig");
const signals = @import("signals.zig");

// ============================================================================
// Task
// ============================================================================

pub const Task = struct {
    actor_id: u64,
    envelope: mailbox.Envelope,
};

// ============================================================================
// WorkerThread
// ============================================================================

pub const WorkerThread = struct {
    deque: std.ArrayListUnmanaged(Task),
    mutex: std.Thread.Mutex,
    pool: *ThreadPool,
    index: usize,

    pub fn init(pool: *ThreadPool, index: usize) WorkerThread {
        return .{
            .deque = .{},
            .mutex = .{},
            .pool = pool,
            .index = index,
        };
    }

    pub fn deinit(self: *WorkerThread, allocator: std.mem.Allocator) void {
        self.deque.deinit(allocator);
    }

    /// Push a task to this worker's local deque.
    pub fn push(self: *WorkerThread, allocator: std.mem.Allocator, task: Task) !void {
        self.mutex.lock();
        defer self.mutex.unlock();
        try self.deque.append(allocator, task);
    }

    /// Pop a task from the back of the local deque (LIFO for cache locality).
    pub fn pop(self: *WorkerThread) ?Task {
        self.mutex.lock();
        defer self.mutex.unlock();
        if (self.deque.items.len == 0) return null;
        return self.deque.pop();
    }

    /// Steal a task from the front of the deque (FIFO steal for fairness).
    pub fn steal(self: *WorkerThread) ?Task {
        self.mutex.lock();
        defer self.mutex.unlock();
        if (self.deque.items.len == 0) return null;
        const task = self.deque.items[0];
        self.deque.replaceRangeAssumeCapacity(0, 1, &.{});
        return task;
    }

    /// Return queue length snapshot.
    pub fn local_len(self: *WorkerThread) usize {
        self.mutex.lock();
        defer self.mutex.unlock();
        return self.deque.items.len;
    }
};

// ============================================================================
// ThreadPool
// ============================================================================

pub const ThreadPool = struct {
    workers: []WorkerThread,
    threads: []std.Thread,
    global_queue: std.ArrayListUnmanaged(Task),
    global_mutex: std.Thread.Mutex,
    idle_cond: std.Thread.Condition,
    idle_mutex: std.Thread.Mutex,
    idle_count: std.atomic.Value(usize),
    alive: std.atomic.Value(bool),
    registry_ref: *registry.Registry,
    allocator: std.mem.Allocator,
    pool_size: usize,

    /// Maximum items in a local deque before overflow to global queue.
    const LOCAL_OVERFLOW_THRESHOLD = 64;

    pub fn init(
        allocator: std.mem.Allocator,
        pool_size: usize,
        reg: *registry.Registry,
    ) !*ThreadPool {
        std.debug.assert(pool_size > 0);

        const self = try allocator.create(ThreadPool);
        self.* = .{
            .workers = try allocator.alloc(WorkerThread, pool_size),
            .threads = try allocator.alloc(std.Thread, pool_size),
            .global_queue = .{},
            .global_mutex = .{},
            .idle_cond = .{},
            .idle_mutex = .{},
            .idle_count = std.atomic.Value(usize).init(0),
            .alive = std.atomic.Value(bool).init(true),
            .registry_ref = reg,
            .allocator = allocator,
            .pool_size = pool_size,
        };

        for (self.workers, 0..) |*w, i| {
            w.* = WorkerThread.init(self, i);
        }

        for (self.threads, 0..) |*t, i| {
            t.* = try std.Thread.spawn(.{}, workerLoop, .{ self, i });
        }

        return self;
    }

    pub fn deinit(self: *ThreadPool) void {
        for (self.workers) |*w| {
            w.deinit(self.allocator);
        }
        self.allocator.free(self.workers);
        self.allocator.free(self.threads);
        self.global_queue.deinit(self.allocator);
        self.allocator.destroy(self);
    }

    /// Dispatch a task to the worker that owns the actor (round-robin by id),
    /// falling back to the global queue if the local deque is too full.
    pub fn dispatch(self: *ThreadPool, actor_id: u64, envelope: mailbox.Envelope) void {
        const task = Task{ .actor_id = actor_id, .envelope = envelope };
        const target_worker = actor_id % self.pool_size;
        const worker = &self.workers[target_worker];

        const enqueued_local = blk: {
            worker.mutex.lock();
            defer worker.mutex.unlock();
            if (worker.deque.items.len < LOCAL_OVERFLOW_THRESHOLD) {
                worker.deque.append(self.allocator, task) catch break :blk false;
                break :blk true;
            }
            break :blk false;
        };

        if (!enqueued_local) {
            self.global_mutex.lock();
            self.global_queue.append(self.allocator, task) catch {
                self.global_mutex.unlock();
                return;
            };
            self.global_mutex.unlock();
        }

        // Wake an idle thread if any.
        if (self.idle_count.load(.acquire) > 0) {
            self.idle_mutex.lock();
            self.idle_cond.signal();
            self.idle_mutex.unlock();
        }
    }

    pub fn shutdown(self: *ThreadPool) void {
        self.alive.store(false, .release);
        // Wake all sleeping workers.
        self.idle_mutex.lock();
        self.idle_cond.broadcast();
        self.idle_mutex.unlock();
        for (self.threads) |t| {
            t.join();
        }
    }
};

// ============================================================================
// Worker loop — runs on each std.Thread
// ============================================================================

fn dispatchEnvelope(pool: *ThreadPool, task: Task) void {
    const state = pool.registry_ref.get(task.actor_id) orelse return;
    if (state.status != .alive) return;

    const env_ptr = pool.allocator.create(mailbox.Envelope) catch return;
    env_ptr.* = task.envelope;
    env_ptr.actor_id = task.actor_id;

    const status = napi.napi_call_threadsafe_function(
        state.receive_fn,
        env_ptr,
        napi.napi_tsfn_nonblocking,
    );
    if (status != napi.napi_ok) {
        pool.allocator.destroy(env_ptr);
    }
}

fn workerLoop(pool: *ThreadPool, worker_index: usize) void {
    const worker = &pool.workers[worker_index];
    var rng = std.Random.DefaultPrng.init(@intCast(worker_index * 6364136223846793005 + 1442695040888963407));

    while (pool.alive.load(.acquire)) {
        var did_work = false;

        // 1. Drain own local deque.
        while (worker.pop()) |task| {
            dispatchEnvelope(pool, task);
            did_work = true;
        }

        // 2. Try to steal from a random other worker.
        if (!did_work and pool.pool_size > 1) {
            const victim_index = rng.random().intRangeLessThan(usize, 0, pool.pool_size - 1);
            const actual_victim = if (victim_index >= worker_index) victim_index + 1 else victim_index;
            if (pool.workers[actual_victim].steal()) |task| {
                dispatchEnvelope(pool, task);
                did_work = true;
            }
        }

        // 3. Drain global queue.
        if (!did_work) {
            pool.global_mutex.lock();
            if (pool.global_queue.items.len > 0) {
                const task = pool.global_queue.items[0];
                pool.global_queue.replaceRangeAssumeCapacity(0, 1, &.{});
                pool.global_mutex.unlock();
                dispatchEnvelope(pool, task);
                did_work = true;
            } else {
                pool.global_mutex.unlock();
            }
        }

        // 4. Nothing to do — sleep until signalled.
        if (!did_work) {
            _ = pool.idle_count.fetchAdd(1, .release);
            pool.idle_mutex.lock();
            // Re-check alive and queues before sleeping to avoid missed wake-ups.
            if (pool.alive.load(.acquire) and
                worker.local_len() == 0 and
                blk: {
                    pool.global_mutex.lock();
                    const empty = pool.global_queue.items.len == 0;
                    pool.global_mutex.unlock();
                    break :blk empty;
                })
            {
                pool.idle_cond.timedWait(&pool.idle_mutex, 1 * std.time.ns_per_ms) catch {};
            }
            pool.idle_mutex.unlock();
            _ = pool.idle_count.fetchSub(1, .release);
        }
    }

    // Drain remaining work on exit.
    while (worker.pop()) |task| {
        dispatchEnvelope(pool, task);
    }
    pool.global_mutex.lock();
    while (pool.global_queue.items.len > 0) {
        const task = pool.global_queue.items[0];
        pool.global_queue.replaceRangeAssumeCapacity(0, 1, &.{});
        pool.global_mutex.unlock();
        dispatchEnvelope(pool, task);
        pool.global_mutex.lock();
    }
    pool.global_mutex.unlock();
}
