// signals.zig — SystemSignal and SupervisionDirective boundary types.
// JS Symbols map to these values at the napi boundary.

pub const SystemSignal = enum(u8) {
    pre_start = 0,
    post_stop = 1,
    pre_restart = 2,
    post_restart = 3,
    poison_pill = 4,
    kill = 5,
    receive_timeout = 6,
    terminated = 7,
};

pub const SupervisionDirective = enum(u8) {
    @"resume" = 0,
    restart = 1,
    stop = 2,
    escalate = 3,
};

pub const MessageKind = enum(u8) {
    user = 0,
    signal = 1,
};
