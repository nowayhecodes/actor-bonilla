// registry.zig — Actor registry: maps actor IDs to ActorState records.
// Protected by an RwLock for concurrent reads and exclusive writes.

const std = @import("std");
const napi = @cImport({
    @cInclude("node_api.h");
});

// ============================================================================
// ActorStatus
// ============================================================================

pub const ActorStatus = enum(u8) {
    alive = 0,
    suspended = 1,
    stopped = 2,
};

// ============================================================================
// MailboxKind — mirrors the JS MailboxType enum
// ============================================================================

pub const MailboxKind = enum(u8) {
    unbounded = 0,
    bounded = 1,
    priority = 2,
};

// ============================================================================
// ActorState
// ============================================================================

pub const ActorState = struct {
    id: u64,
    status: ActorStatus,
    /// Opaque pointer cast to the concrete mailbox type by the dispatcher.
    mailbox_ptr: usize,
    /// Type tag so the dispatcher knows how to cast mailbox_ptr.
    mailbox_kind: MailboxKind,
    /// Capacity for bounded mailboxes; 0 for unbounded/priority.
    mailbox_capacity: usize,
    /// JS receive callback, called via napi_threadsafe_function from worker threads.
    receive_fn: napi.napi_threadsafe_function,
    /// Parent supervisor ID; 0 means no supervisor.
    supervisor_id: u64,
};

// ============================================================================
// Registry
// ============================================================================

const ActorMap = std.HashMap(
    u64,
    ActorState,
    std.hash_map.AutoContext(u64),
    std.hash_map.default_max_load_percentage,
);

pub const Registry = struct {
    map: ActorMap,
    lock: std.Thread.RwLock,

    pub fn init(allocator: std.mem.Allocator) Registry {
        return .{
            .map = ActorMap.init(allocator),
            .lock = .{},
        };
    }

    pub fn deinit(self: *Registry) void {
        self.map.deinit();
    }

    /// Register a new actor. Returns error.OutOfMemory if allocation fails,
    /// or error.AlreadyRegistered if the ID already exists.
    pub fn register(self: *Registry, state: ActorState) !void {
        self.lock.lock();
        defer self.lock.unlock();

        const result = try self.map.getOrPut(state.id);
        if (result.found_existing) {
            return error.AlreadyRegistered;
        }
        result.value_ptr.* = state;
    }

    /// Look up an actor by ID. Returns null if not found.
    pub fn get(self: *Registry, id: u64) ?ActorState {
        self.lock.lockShared();
        defer self.lock.unlockShared();
        return self.map.get(id);
    }

    /// Update the status of an existing actor. Returns false if not found.
    pub fn update_status(self: *Registry, id: u64, status: ActorStatus) bool {
        self.lock.lock();
        defer self.lock.unlock();
        const entry = self.map.getPtr(id) orelse return false;
        entry.status = status;
        return true;
    }

    /// Remove an actor from the registry. Returns false if not found.
    pub fn remove(self: *Registry, id: u64) bool {
        self.lock.lock();
        defer self.lock.unlock();
        return self.map.remove(id);
    }

    /// Iterator over all entries (caller must hold the lock externally
    /// when using this for safe iteration in hot paths).
    pub fn iterator(self: *Registry) ActorMap.Iterator {
        return self.map.iterator();
    }
};
