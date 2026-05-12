// root.zig — Node-API (napi) entry point for the actor-bonilla native addon.
// Exports Zig functions to the JS runtime via napi_define_properties.

const std = @import("std");
const napi = @cImport({
    @cInclude("node_api.h");
});

const mailbox = @import("mailbox.zig");
const registry = @import("registry.zig");
const thread_pool = @import("thread_pool.zig");
const supervision = @import("supervision.zig");
const signals = @import("signals.zig");

// ============================================================================
// Module-level allocator (GPA — freed on process exit)
// ============================================================================

var gpa = std.heap.GeneralPurposeAllocator(.{}){};
const allocator = gpa.allocator();

// ============================================================================
// RegistryBox — owns a Registry; supports explicit early teardown.
// ============================================================================

pub const RegistryBox = struct {
    reg: registry.Registry,
    /// Set to false after explicit destroy so the GC finalizer is a no-op.
    alive: bool,
};

// ============================================================================
// PoolHandle — wraps ThreadPool + optional SupervisionBridge
// ============================================================================

pub const PoolHandle = struct {
    pool: *thread_pool.ThreadPool,
    supervision_bridge: ?supervision.SupervisionBridge,
};

// ============================================================================
// Helpers
// ============================================================================

fn checkStatus(status: napi.napi_status, env: napi.napi_env, msg: [*:0]const u8) bool {
    if (status != napi.napi_ok) {
        _ = napi.napi_throw_error(env, null, msg);
        return false;
    }
    return true;
}

fn getUndefined(env: napi.napi_env) napi.napi_value {
    var result: napi.napi_value = undefined;
    _ = napi.napi_get_undefined(env, &result);
    return result;
}

fn getArgs(
    env: napi.napi_env,
    info: napi.napi_callback_info,
    comptime count: usize,
    out: *[count]napi.napi_value,
) bool {
    var argc: usize = count;
    var this: napi.napi_value = undefined;
    const status = napi.napi_get_cb_info(env, info, &argc, out, &this, null);
    return checkStatus(status, env, "Failed to get callback arguments");
}

fn getExternalPtr(env: napi.napi_env, val: napi.napi_value, out: *?*anyopaque) bool {
    const status = napi.napi_get_value_external(env, val, out);
    return checkStatus(status, env, "Failed to get external pointer");
}

fn getBigIntU64(env: napi.napi_env, val: napi.napi_value, out: *u64) bool {
    var lossless: bool = undefined;
    const status = napi.napi_get_value_bigint_uint64(env, val, out, &lossless);
    return checkStatus(status, env, "Failed to get BigInt value");
}

fn getInt32(env: napi.napi_env, val: napi.napi_value, out: *i32) bool {
    const status = napi.napi_get_value_int32(env, val, out);
    return checkStatus(status, env, "Failed to get int32 value");
}

// ============================================================================
// Registry external finalizer
// ============================================================================

fn finalizeRegistry(
    _env: napi.napi_env,
    data: ?*anyopaque,
    _hint: ?*anyopaque,
) callconv(.C) void {
    _ = _env;
    _ = _hint;
    const box: *RegistryBox = @ptrCast(@alignCast(data orelse return));
    if (box.alive) {
        box.reg.deinit();
    }
    allocator.destroy(box);
}

// ============================================================================
// Pool external finalizer
// ============================================================================

fn finalizePool(
    _env: napi.napi_env,
    data: ?*anyopaque,
    _hint: ?*anyopaque,
) callconv(.C) void {
    _ = _env;
    _ = _hint;
    const handle: *PoolHandle = @ptrCast(@alignCast(data orelse return));
    handle.pool.shutdown();
    handle.pool.deinit();
    if (handle.supervision_bridge) |*bridge| {
        bridge.deinit();
    }
    allocator.destroy(handle);
}

// ============================================================================
// Receive callback JS call — invoked on the JS thread for each envelope
// ============================================================================

fn receiveCallJs(
    env: napi.napi_env,
    js_callback: napi.napi_value,
    _context: ?*anyopaque,
    data: ?*anyopaque,
) callconv(.C) void {
    _ = _context;

    const envelope_ptr: *mailbox.Envelope = @ptrCast(@alignCast(data orelse return));
    defer allocator.destroy(envelope_ptr);

    var undefined_val: napi.napi_value = undefined;
    var global: napi.napi_value = undefined;
    if (napi.napi_get_undefined(env, &undefined_val) != napi.napi_ok) return;
    if (napi.napi_get_global(env, &global) != napi.napi_ok) return;

    var actor_id_val: napi.napi_value = undefined;
    var message_ref_val: napi.napi_value = undefined;
    var sender_id_val: napi.napi_value = undefined;
    var timestamp_val: napi.napi_value = undefined;
    var message_id_val: napi.napi_value = undefined;
    var signal_id_val: napi.napi_value = undefined;
    var is_signal_val: napi.napi_value = undefined;

    // actor_id (BigInt)
    if (napi.napi_create_bigint_uint64(env, envelope_ptr.actor_id, &actor_id_val) != napi.napi_ok) return;

    // message or null
    if (envelope_ptr.kind == .user) {
        if (envelope_ptr.message_ref) |ref| {
            var js_val: napi.napi_value = undefined;
            if (napi.napi_get_reference_value(env, @ptrCast(ref), &js_val) != napi.napi_ok) {
                js_val = undefined_val;
            }
            message_ref_val = js_val;
        } else {
            message_ref_val = undefined_val;
        }
    } else {
        message_ref_val = undefined_val;
    }

    // sender_id (BigInt)
    if (napi.napi_create_bigint_uint64(env, envelope_ptr.sender_id, &sender_id_val) != napi.napi_ok) return;

    // timestamp (BigInt)
    if (napi.napi_create_bigint_uint64(env, envelope_ptr.timestamp, &timestamp_val) != napi.napi_ok) return;

    // message_id (BigInt)
    if (napi.napi_create_bigint_uint64(env, envelope_ptr.message_id, &message_id_val) != napi.napi_ok) return;

    // signal_id (number)
    if (napi.napi_create_uint32(env, envelope_ptr.signal_id, &signal_id_val) != napi.napi_ok) return;

    // is_signal (boolean)
    if (napi.napi_get_boolean(env, envelope_ptr.kind == .signal, &is_signal_val) != napi.napi_ok) return;

    var args = [_]napi.napi_value{
        actor_id_val,
        message_ref_val,
        sender_id_val,
        timestamp_val,
        message_id_val,
        signal_id_val,
        is_signal_val,
    };
    _ = napi.napi_call_function(env, global, js_callback, args.len, &args, null);

    // Release the napi_ref for user messages after delivery.
    if (envelope_ptr.kind == .user) {
        if (envelope_ptr.message_ref) |ref| {
            _ = napi.napi_delete_reference(env, @ptrCast(ref));
        }
    }
}

// ============================================================================
// nativeCreateRegistry
// ============================================================================

fn nativeCreateRegistry(env: napi.napi_env, info: napi.napi_callback_info) callconv(.C) napi.napi_value {
    _ = info;
    const box = allocator.create(RegistryBox) catch {
        _ = napi.napi_throw_error(env, null, "Failed to allocate Registry");
        return getUndefined(env);
    };
    box.* = .{ .reg = registry.Registry.init(allocator), .alive = true };

    var result: napi.napi_value = undefined;
    if (!checkStatus(
        napi.napi_create_external(env, box, finalizeRegistry, null, &result),
        env,
        "Failed to create Registry external",
    )) {
        box.reg.deinit();
        allocator.destroy(box);
        return getUndefined(env);
    }
    return result;
}

// ============================================================================
// nativeDestroyRegistry — explicit destroy (also called by GC finalizer)
// ============================================================================

fn nativeDestroyRegistry(env: napi.napi_env, info: napi.napi_callback_info) callconv(.C) napi.napi_value {
    var args: [1]napi.napi_value = undefined;
    if (!getArgs(env, info, 1, &args)) return getUndefined(env);

    var ptr: ?*anyopaque = null;
    if (!getExternalPtr(env, args[0], &ptr)) return getUndefined(env);
    const box: *RegistryBox = @ptrCast(@alignCast(ptr orelse return getUndefined(env)));
    if (box.alive) {
        box.alive = false;
        box.reg.deinit();
    }
    return getUndefined(env);
}

// ============================================================================
// nativeCreatePool — args: [registryHandle, poolSize]
// ============================================================================

fn nativeCreatePool(env: napi.napi_env, info: napi.napi_callback_info) callconv(.C) napi.napi_value {
    var args: [2]napi.napi_value = undefined;
    if (!getArgs(env, info, 2, &args)) return getUndefined(env);

    var reg_ptr: ?*anyopaque = null;
    if (!getExternalPtr(env, args[0], &reg_ptr)) return getUndefined(env);
    const reg_box: *RegistryBox = @ptrCast(@alignCast(reg_ptr orelse return getUndefined(env)));
    const reg: *registry.Registry = &reg_box.reg;

    var pool_size_raw: i32 = 0;
    if (!getInt32(env, args[1], &pool_size_raw)) return getUndefined(env);
    const pool_size: usize = if (pool_size_raw > 0) @intCast(pool_size_raw) else 1;

    const handle = allocator.create(PoolHandle) catch {
        _ = napi.napi_throw_error(env, null, "Failed to allocate PoolHandle");
        return getUndefined(env);
    };

    const pool = thread_pool.ThreadPool.init(allocator, pool_size, reg) catch {
        allocator.destroy(handle);
        _ = napi.napi_throw_error(env, null, "Failed to create ThreadPool");
        return getUndefined(env);
    };

    handle.* = .{ .pool = pool, .supervision_bridge = null };

    var result: napi.napi_value = undefined;
    if (!checkStatus(
        napi.napi_create_external(env, handle, finalizePool, null, &result),
        env,
        "Failed to create Pool external",
    )) {
        pool.shutdown();
        pool.deinit();
        allocator.destroy(handle);
        return getUndefined(env);
    }
    return result;
}

// ============================================================================
// nativeShutdownPool — args: [poolHandle]
// ============================================================================

fn nativeShutdownPool(env: napi.napi_env, info: napi.napi_callback_info) callconv(.C) napi.napi_value {
    var args: [1]napi.napi_value = undefined;
    if (!getArgs(env, info, 1, &args)) return getUndefined(env);

    var ptr: ?*anyopaque = null;
    if (!getExternalPtr(env, args[0], &ptr)) return getUndefined(env);
    const handle: *PoolHandle = @ptrCast(@alignCast(ptr orelse return getUndefined(env)));
    handle.pool.shutdown();
    return getUndefined(env);
}

// ============================================================================
// nativeRegisterActor — args: [poolHandle, actorId (BigInt), supervisorId (BigInt),
//                               jsReceiveCallback, mailboxType (number), capacity (number)]
// ============================================================================

fn nativeRegisterActor(env: napi.napi_env, info: napi.napi_callback_info) callconv(.C) napi.napi_value {
    var args: [6]napi.napi_value = undefined;
    if (!getArgs(env, info, 6, &args)) return getUndefined(env);

    var ptr: ?*anyopaque = null;
    if (!getExternalPtr(env, args[0], &ptr)) return getUndefined(env);
    const handle: *PoolHandle = @ptrCast(@alignCast(ptr orelse return getUndefined(env)));

    var actor_id: u64 = 0;
    if (!getBigIntU64(env, args[1], &actor_id)) return getUndefined(env);

    var supervisor_id: u64 = 0;
    if (!getBigIntU64(env, args[2], &supervisor_id)) return getUndefined(env);

    var mailbox_type_raw: i32 = 0;
    if (!getInt32(env, args[4], &mailbox_type_raw)) return getUndefined(env);

    var capacity_raw: i32 = 256;
    if (!getInt32(env, args[5], &capacity_raw)) return getUndefined(env);
    const capacity: usize = if (capacity_raw > 0) @intCast(capacity_raw) else 256;

    const mailbox_kind: registry.MailboxKind = switch (mailbox_type_raw) {
        0 => .unbounded,
        1 => .bounded,
        2 => .priority,
        else => .unbounded,
    };

    // Allocate the mailbox based on kind.
    const mailbox_ptr: usize = switch (mailbox_kind) {
        .unbounded => blk: {
            const mb = allocator.create(mailbox.UnboundedMailbox) catch {
                _ = napi.napi_throw_error(env, null, "Failed to allocate UnboundedMailbox");
                return getUndefined(env);
            };
            mb.* = mailbox.UnboundedMailbox.init(allocator) catch {
                allocator.destroy(mb);
                _ = napi.napi_throw_error(env, null, "Failed to init UnboundedMailbox");
                return getUndefined(env);
            };
            break :blk @intFromPtr(mb);
        },
        .bounded => blk: {
            // Use a fixed-capacity of 1024 for bounded (capacity arg rounds up).
            const mb = allocator.create(mailbox.BoundedMailbox(1024)) catch {
                _ = napi.napi_throw_error(env, null, "Failed to allocate BoundedMailbox");
                return getUndefined(env);
            };
            mb.* = mailbox.BoundedMailbox(1024).init();
            _ = capacity;
            break :blk @intFromPtr(mb);
        },
        .priority => blk: {
            const mb = allocator.create(mailbox.PriorityMailbox) catch {
                _ = napi.napi_throw_error(env, null, "Failed to allocate PriorityMailbox");
                return getUndefined(env);
            };
            mb.* = mailbox.PriorityMailbox.init(allocator);
            break :blk @intFromPtr(mb);
        },
    };

    // Create the threadsafe receive function.
    var async_name: napi.napi_value = undefined;
    if (napi.napi_create_string_utf8(env, "actorReceive", 12, &async_name) != napi.napi_ok) {
        _ = napi.napi_throw_error(env, null, "Failed to create async resource name");
        return getUndefined(env);
    }

    var tsfn: napi.napi_threadsafe_function = undefined;
    if (napi.napi_create_threadsafe_function(
        env,
        args[3], // jsReceiveCallback
        null,
        async_name,
        0,
        1,
        null,
        null,
        null,
        receiveCallJs,
        &tsfn,
    ) != napi.napi_ok) {
        _ = napi.napi_throw_error(env, null, "Failed to create threadsafe function");
        return getUndefined(env);
    }

    const actor_state = registry.ActorState{
        .id = actor_id,
        .status = .alive,
        .mailbox_ptr = mailbox_ptr,
        .mailbox_kind = mailbox_kind,
        .mailbox_capacity = capacity,
        .receive_fn = tsfn,
        .supervisor_id = supervisor_id,
    };

    handle.pool.registry_ref.register(actor_state) catch |err| {
        _ = napi.napi_release_threadsafe_function(tsfn, napi.napi_tsfn_release);
        switch (err) {
            error.AlreadyRegistered => _ = napi.napi_throw_error(env, null, "Actor already registered"),
            error.OutOfMemory => _ = napi.napi_throw_error(env, null, "Out of memory"),
        }
        return getUndefined(env);
    };

    return getUndefined(env);
}

// ============================================================================
// nativeUnregisterActor — args: [poolHandle, actorId (BigInt)]
// ============================================================================

fn nativeUnregisterActor(env: napi.napi_env, info: napi.napi_callback_info) callconv(.C) napi.napi_value {
    var args: [2]napi.napi_value = undefined;
    if (!getArgs(env, info, 2, &args)) return getUndefined(env);

    var ptr: ?*anyopaque = null;
    if (!getExternalPtr(env, args[0], &ptr)) return getUndefined(env);
    const handle: *PoolHandle = @ptrCast(@alignCast(ptr orelse return getUndefined(env)));

    var actor_id: u64 = 0;
    if (!getBigIntU64(env, args[1], &actor_id)) return getUndefined(env);

    if (handle.pool.registry_ref.get(actor_id)) |state| {
        _ = napi.napi_release_threadsafe_function(state.receive_fn, napi.napi_tsfn_release);
        freeMailbox(state);
    }
    _ = handle.pool.registry_ref.remove(actor_id);
    return getUndefined(env);
}

fn freeMailbox(state: registry.ActorState) void {
    switch (state.mailbox_kind) {
        .unbounded => {
            const mb: *mailbox.UnboundedMailbox = @ptrFromInt(state.mailbox_ptr);
            mb.deinit();
            allocator.destroy(mb);
        },
        .bounded => {
            const mb: *mailbox.BoundedMailbox(1024) = @ptrFromInt(state.mailbox_ptr);
            allocator.destroy(mb);
        },
        .priority => {
            const mb: *mailbox.PriorityMailbox = @ptrFromInt(state.mailbox_ptr);
            mb.deinit();
            allocator.destroy(mb);
        },
    }
}

// ============================================================================
// nativeEnqueueMessage — args: [poolHandle, actorId (BigInt), messageRef (any),
//                                senderId (BigInt), timestamp (BigInt), messageId (BigInt)]
// ============================================================================

fn nativeEnqueueMessage(env: napi.napi_env, info: napi.napi_callback_info) callconv(.C) napi.napi_value {
    var args: [6]napi.napi_value = undefined;
    if (!getArgs(env, info, 6, &args)) return getUndefined(env);

    var ptr: ?*anyopaque = null;
    if (!getExternalPtr(env, args[0], &ptr)) return getUndefined(env);
    const handle: *PoolHandle = @ptrCast(@alignCast(ptr orelse return getUndefined(env)));

    var actor_id: u64 = 0;
    if (!getBigIntU64(env, args[1], &actor_id)) return getUndefined(env);

    var sender_id: u64 = 0;
    if (!getBigIntU64(env, args[3], &sender_id)) return getUndefined(env);

    var timestamp: u64 = 0;
    if (!getBigIntU64(env, args[4], &timestamp)) return getUndefined(env);

    var message_id: u64 = 0;
    if (!getBigIntU64(env, args[5], &message_id)) return getUndefined(env);

    // Create a persistent napi_ref for the message so it survives across threads.
    var msg_ref: napi.napi_ref = undefined;
    if (napi.napi_create_reference(env, args[2], 1, &msg_ref) != napi.napi_ok) {
        _ = napi.napi_throw_error(env, null, "Failed to create message reference");
        return getUndefined(env);
    }

    const envelope = mailbox.Envelope{
        .message_ref = msg_ref,
        .actor_id = actor_id,
        .sender_id = sender_id,
        .timestamp = timestamp,
        .message_id = message_id,
        .kind = .user,
        .signal_id = 0,
        ._pad = [6]u8{ 0, 0, 0, 0, 0, 0 },
    };

    handle.pool.dispatch(actor_id, envelope);
    return getUndefined(env);
}

// ============================================================================
// nativeEnqueueSignal — args: [poolHandle, actorId (BigInt), signalId (number), senderId (BigInt)]
// ============================================================================

fn nativeEnqueueSignal(env: napi.napi_env, info: napi.napi_callback_info) callconv(.C) napi.napi_value {
    var args: [4]napi.napi_value = undefined;
    if (!getArgs(env, info, 4, &args)) return getUndefined(env);

    var ptr: ?*anyopaque = null;
    if (!getExternalPtr(env, args[0], &ptr)) return getUndefined(env);
    const handle: *PoolHandle = @ptrCast(@alignCast(ptr orelse return getUndefined(env)));

    var actor_id: u64 = 0;
    if (!getBigIntU64(env, args[1], &actor_id)) return getUndefined(env);

    var signal_id_raw: i32 = 0;
    if (!getInt32(env, args[2], &signal_id_raw)) return getUndefined(env);

    var sender_id: u64 = 0;
    if (!getBigIntU64(env, args[3], &sender_id)) return getUndefined(env);

    const now = @as(u64, @intCast(std.time.milliTimestamp()));
    const envelope = mailbox.Envelope{
        .message_ref = null,
        .actor_id = actor_id,
        .sender_id = sender_id,
        .timestamp = now,
        .message_id = 0,
        .kind = .signal,
        .signal_id = @as(u8, @intCast(@max(0, signal_id_raw))),
        ._pad = [6]u8{ 0, 0, 0, 0, 0, 0 },
    };

    handle.pool.dispatch(actor_id, envelope);
    return getUndefined(env);
}

// ============================================================================
// nativeGetMailboxSize — args: [poolHandle, actorId (BigInt)]
// ============================================================================

fn nativeGetMailboxSize(env: napi.napi_env, info: napi.napi_callback_info) callconv(.C) napi.napi_value {
    var args: [2]napi.napi_value = undefined;
    if (!getArgs(env, info, 2, &args)) return getUndefined(env);

    var ptr: ?*anyopaque = null;
    if (!getExternalPtr(env, args[0], &ptr)) return getUndefined(env);
    const handle: *PoolHandle = @ptrCast(@alignCast(ptr orelse return getUndefined(env)));

    var actor_id: u64 = 0;
    if (!getBigIntU64(env, args[1], &actor_id)) return getUndefined(env);

    const state = handle.pool.registry_ref.get(actor_id) orelse {
        var result: napi.napi_value = undefined;
        _ = napi.napi_create_uint32(env, 0, &result);
        return result;
    };

    const size: usize = switch (state.mailbox_kind) {
        .unbounded => blk: {
            const mb: *mailbox.UnboundedMailbox = @ptrFromInt(state.mailbox_ptr);
            break :blk mb.len();
        },
        .bounded => blk: {
            const mb: *mailbox.BoundedMailbox(1024) = @ptrFromInt(state.mailbox_ptr);
            break :blk mb.len();
        },
        .priority => blk: {
            const mb: *mailbox.PriorityMailbox = @ptrFromInt(state.mailbox_ptr);
            break :blk mb.len();
        },
    };

    var result: napi.napi_value = undefined;
    _ = napi.napi_create_uint32(env, @as(u32, @intCast(@min(size, std.math.maxInt(u32)))), &result);
    return result;
}

// ============================================================================
// nativeSetSupervisionCallback — args: [poolHandle, jsCallback]
// ============================================================================

fn nativeSetSupervisionCallback(env: napi.napi_env, info: napi.napi_callback_info) callconv(.C) napi.napi_value {
    var args: [2]napi.napi_value = undefined;
    if (!getArgs(env, info, 2, &args)) return getUndefined(env);

    var ptr: ?*anyopaque = null;
    if (!getExternalPtr(env, args[0], &ptr)) return getUndefined(env);
    const handle: *PoolHandle = @ptrCast(@alignCast(ptr orelse return getUndefined(env)));

    if (handle.supervision_bridge) |*old_bridge| {
        old_bridge.deinit();
        handle.supervision_bridge = null;
    }

    const bridge = supervision.SupervisionBridge.init(env, args[1], allocator) catch {
        _ = napi.napi_throw_error(env, null, "Failed to create SupervisionBridge");
        return getUndefined(env);
    };
    handle.supervision_bridge = bridge;
    return getUndefined(env);
}

// ============================================================================
// nativeSendDirective — args: [poolHandle, actorId (BigInt), directive (number)]
// ============================================================================

fn nativeSendDirective(env: napi.napi_env, info: napi.napi_callback_info) callconv(.C) napi.napi_value {
    var args: [3]napi.napi_value = undefined;
    if (!getArgs(env, info, 3, &args)) return getUndefined(env);

    var ptr: ?*anyopaque = null;
    if (!getExternalPtr(env, args[0], &ptr)) return getUndefined(env);
    const handle: *PoolHandle = @ptrCast(@alignCast(ptr orelse return getUndefined(env)));

    var actor_id: u64 = 0;
    if (!getBigIntU64(env, args[1], &actor_id)) return getUndefined(env);

    var directive_raw: i32 = 0;
    if (!getInt32(env, args[2], &directive_raw)) return getUndefined(env);

    const directive = std.meta.intToEnum(signals.SupervisionDirective, @as(u8, @intCast(@max(0, directive_raw)))) catch .stop;

    switch (directive) {
        .@"resume" => {
            _ = handle.pool.registry_ref.update_status(actor_id, .alive);
        },
        .restart => {
            _ = handle.pool.registry_ref.update_status(actor_id, .alive);
            const signal_envelope = mailbox.Envelope{
                .message_ref = null,
                .actor_id = actor_id,
                .sender_id = 0,
                .timestamp = @as(u64, @intCast(std.time.milliTimestamp())),
                .message_id = 0,
                .kind = .signal,
                .signal_id = @intFromEnum(signals.SystemSignal.pre_restart),
                ._pad = [6]u8{ 0, 0, 0, 0, 0, 0 },
            };
            handle.pool.dispatch(actor_id, signal_envelope);
        },
        .stop => {
            _ = handle.pool.registry_ref.update_status(actor_id, .stopped);
            const stop_envelope = mailbox.Envelope{
                .message_ref = null,
                .actor_id = actor_id,
                .sender_id = 0,
                .timestamp = @as(u64, @intCast(std.time.milliTimestamp())),
                .message_id = 0,
                .kind = .signal,
                .signal_id = @intFromEnum(signals.SystemSignal.post_stop),
                ._pad = [6]u8{ 0, 0, 0, 0, 0, 0 },
            };
            handle.pool.dispatch(actor_id, stop_envelope);
        },
        .escalate => {
            // Escalate: stop the actor and report to its supervisor.
            if (handle.pool.registry_ref.get(actor_id)) |state| {
                if (state.supervisor_id != 0) {
                    const escalate_envelope = mailbox.Envelope{
                        .message_ref = null,
                        .actor_id = state.supervisor_id,
                        .sender_id = actor_id,
                        .timestamp = @as(u64, @intCast(std.time.milliTimestamp())),
                        .message_id = 0,
                        .kind = .signal,
                        .signal_id = @intFromEnum(signals.SystemSignal.terminated),
                        ._pad = [6]u8{ 0, 0, 0, 0, 0, 0 },
                    };
                    handle.pool.dispatch(state.supervisor_id, escalate_envelope);
                }
            }
            _ = handle.pool.registry_ref.update_status(actor_id, .stopped);
        },
    }
    return getUndefined(env);
}

// ============================================================================
// Module registration
// ============================================================================

export fn napi_register_module_v1(env: napi.napi_env, exports: napi.napi_value) napi.napi_value {
    const properties = [_]napi.napi_property_descriptor{
        .{
            .utf8name = "nativeCreateRegistry",
            .name = null,
            .method = nativeCreateRegistry,
            .getter = null,
            .setter = null,
            .value = null,
            .attributes = napi.napi_default,
            .data = null,
        },
        .{
            .utf8name = "nativeDestroyRegistry",
            .name = null,
            .method = nativeDestroyRegistry,
            .getter = null,
            .setter = null,
            .value = null,
            .attributes = napi.napi_default,
            .data = null,
        },
        .{
            .utf8name = "nativeCreatePool",
            .name = null,
            .method = nativeCreatePool,
            .getter = null,
            .setter = null,
            .value = null,
            .attributes = napi.napi_default,
            .data = null,
        },
        .{
            .utf8name = "nativeShutdownPool",
            .name = null,
            .method = nativeShutdownPool,
            .getter = null,
            .setter = null,
            .value = null,
            .attributes = napi.napi_default,
            .data = null,
        },
        .{
            .utf8name = "nativeRegisterActor",
            .name = null,
            .method = nativeRegisterActor,
            .getter = null,
            .setter = null,
            .value = null,
            .attributes = napi.napi_default,
            .data = null,
        },
        .{
            .utf8name = "nativeUnregisterActor",
            .name = null,
            .method = nativeUnregisterActor,
            .getter = null,
            .setter = null,
            .value = null,
            .attributes = napi.napi_default,
            .data = null,
        },
        .{
            .utf8name = "nativeEnqueueMessage",
            .name = null,
            .method = nativeEnqueueMessage,
            .getter = null,
            .setter = null,
            .value = null,
            .attributes = napi.napi_default,
            .data = null,
        },
        .{
            .utf8name = "nativeEnqueueSignal",
            .name = null,
            .method = nativeEnqueueSignal,
            .getter = null,
            .setter = null,
            .value = null,
            .attributes = napi.napi_default,
            .data = null,
        },
        .{
            .utf8name = "nativeGetMailboxSize",
            .name = null,
            .method = nativeGetMailboxSize,
            .getter = null,
            .setter = null,
            .value = null,
            .attributes = napi.napi_default,
            .data = null,
        },
        .{
            .utf8name = "nativeSetSupervisionCallback",
            .name = null,
            .method = nativeSetSupervisionCallback,
            .getter = null,
            .setter = null,
            .value = null,
            .attributes = napi.napi_default,
            .data = null,
        },
        .{
            .utf8name = "nativeSendDirective",
            .name = null,
            .method = nativeSendDirective,
            .getter = null,
            .setter = null,
            .value = null,
            .attributes = napi.napi_default,
            .data = null,
        },
    };

    _ = napi.napi_define_properties(env, exports, properties.len, &properties);
    return exports;
}
