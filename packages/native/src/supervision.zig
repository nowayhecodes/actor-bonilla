// supervision.zig — Supervision passback bridge from Zig crash handlers to JS.
// Uses napi_threadsafe_function so Zig worker threads can safely invoke JS.

const std = @import("std");
const napi = @cImport({
    @cInclude("node_api.h");
});

// ============================================================================
// CrashReport — transferred from Zig thread to JS thread
// ============================================================================

pub const CrashReport = struct {
    actor_id: u64,
    error_message: [256]u8,
    error_len: usize,

    pub fn init(actor_id: u64, msg: []const u8) CrashReport {
        var report = CrashReport{
            .actor_id = actor_id,
            .error_message = undefined,
            .error_len = 0,
        };
        const copy_len = @min(msg.len, 255);
        @memcpy(report.error_message[0..copy_len], msg[0..copy_len]);
        report.error_message[copy_len] = 0;
        report.error_len = copy_len;
        return report;
    }

    pub fn message_slice(self: *const CrashReport) []const u8 {
        return self.error_message[0..self.error_len];
    }
};

// ============================================================================
// JS finalizer — called on the JS thread when the threadsafe function is freed
// ============================================================================

fn supervisionFinalize(
    _env: napi.napi_env,
    _finalize_data: ?*anyopaque,
    _finalize_hint: ?*anyopaque,
) callconv(.C) void {
    _ = _env;
    _ = _finalize_data;
    _ = _finalize_hint;
}

// ============================================================================
// JS callback — called on the JS thread to invoke the supervision handler
// ============================================================================

fn supervisionCallJs(
    env: napi.napi_env,
    js_callback: napi.napi_value,
    _context: ?*anyopaque,
    data: ?*anyopaque,
) callconv(.C) void {
    _ = _context;

    const report_ptr: *CrashReport = @ptrCast(@alignCast(data orelse return));
    defer std.heap.c_allocator.destroy(report_ptr);

    var actor_id_val: napi.napi_value = undefined;
    var error_msg_val: napi.napi_value = undefined;
    var undefined_val: napi.napi_value = undefined;
    var global: napi.napi_value = undefined;

    if (napi.napi_get_undefined(env, &undefined_val) != napi.napi_ok) return;
    if (napi.napi_get_global(env, &global) != napi.napi_ok) return;
    if (napi.napi_create_bigint_uint64(env, report_ptr.actor_id, &actor_id_val) != napi.napi_ok) return;
    if (napi.napi_create_string_utf8(
        env,
        &report_ptr.error_message,
        report_ptr.error_len,
        &error_msg_val,
    ) != napi.napi_ok) return;

    var args = [_]napi.napi_value{ actor_id_val, error_msg_val };
    _ = napi.napi_call_function(env, global, js_callback, args.len, &args, null);
}

// ============================================================================
// SupervisionBridge
// ============================================================================

pub const SupervisionBridge = struct {
    js_callback: napi.napi_threadsafe_function,

    /// Create a SupervisionBridge from a JS callback function.
    pub fn init(
        env: napi.napi_env,
        js_fn: napi.napi_value,
        allocator: std.mem.Allocator,
    ) !SupervisionBridge {
        var async_resource_name: napi.napi_value = undefined;
        if (napi.napi_create_string_utf8(
            env,
            "SupervisionBridge",
            std.mem.len("SupervisionBridge"),
            &async_resource_name,
        ) != napi.napi_ok) {
            return error.NapiError;
        }

        var tsfn: napi.napi_threadsafe_function = undefined;
        const status = napi.napi_create_threadsafe_function(
            env,
            js_fn,
            null,
            async_resource_name,
            0,
            1,
            null,
            supervisionFinalize,
            null,
            supervisionCallJs,
            &tsfn,
        );
        if (status != napi.napi_ok) {
            return error.NapiError;
        }

        _ = allocator;
        return .{
            .js_callback = tsfn,
        };
    }

    /// Queue a crash report to be delivered on the JS thread.
    /// Uses the C allocator so that `supervisionCallJs` (a C callback) can free it.
    pub fn report_crash(self: *SupervisionBridge, actor_id: u64, msg: []const u8) void {
        const report = std.heap.c_allocator.create(CrashReport) catch return;
        report.* = CrashReport.init(actor_id, msg);

        const status = napi.napi_call_threadsafe_function(
            self.js_callback,
            report,
            napi.napi_tsfn_nonblocking,
        );
        if (status != napi.napi_ok) {
            std.heap.c_allocator.destroy(report);
        }
        // On success, ownership is transferred to supervisionCallJs which frees via c_allocator.
    }

    pub fn deinit(self: *SupervisionBridge) void {
        _ = napi.napi_release_threadsafe_function(
            self.js_callback,
            napi.napi_tsfn_release,
        );
    }
};
