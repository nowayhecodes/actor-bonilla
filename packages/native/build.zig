const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const lib = b.addSharedLibrary(.{
        .name = "actor_bonilla_native",
        .root_source_file = b.path("src/root.zig"),
        .target = target,
        .optimize = optimize,
    });

    // Link against Node.js headers — path provided via NODE_INCLUDE_PATH env var.
    const node_include = std.process.getEnvVarOwned(b.allocator, "NODE_INCLUDE_PATH") catch
        b.dupe("/usr/include/node");
    lib.addIncludePath(.{ .cwd_relative = node_include });
    lib.linkLibC();

    const install = b.addInstallArtifact(lib, .{
        .dest_dir = .{ .override = .{ .custom = "." } },
    });
    b.getInstallStep().dependOn(&install.step);
}
