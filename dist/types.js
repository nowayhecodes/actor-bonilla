/** Convenience factory for Props. */
export function props(receive, options) {
    return { receive, ...options };
}
// ============================================================================
// Supervision (one-for-one / all-for-one strategies)
// ============================================================================
export var SupervisionDirective;
(function (SupervisionDirective) {
    SupervisionDirective["Resume"] = "resume";
    SupervisionDirective["Restart"] = "restart";
    SupervisionDirective["Stop"] = "stop";
    SupervisionDirective["Escalate"] = "escalate";
})(SupervisionDirective || (SupervisionDirective = {}));
export function oneForOneStrategy(maxRetries, withinMs, decider) {
    return { type: 'one-for-one', maxRetries, withinMs, decider };
}
export function allForOneStrategy(maxRetries, withinMs, decider) {
    return { type: 'all-for-one', maxRetries, withinMs, decider };
}
// ============================================================================
// Lifecycle signals
// ============================================================================
export const PreStart = Symbol.for('actor-bonilla.PreStart');
export const PostStop = Symbol.for('actor-bonilla.PostStop');
export const PreRestart = Symbol.for('actor-bonilla.PreRestart');
export const PostRestart = Symbol.for('actor-bonilla.PostRestart');
export const Terminated = Symbol.for('actor-bonilla.Terminated');
export const PoisonPill = Symbol.for('actor-bonilla.PoisonPill');
export const Kill = Symbol.for('actor-bonilla.Kill');
export const ReceiveTimeout = Symbol.for('actor-bonilla.ReceiveTimeout');
// ============================================================================
// Mailbox & Dispatcher types
// ============================================================================
export var MailboxType;
(function (MailboxType) {
    MailboxType["Default"] = "default";
    MailboxType["Bounded"] = "bounded";
    MailboxType["Priority"] = "priority";
})(MailboxType || (MailboxType = {}));
export var DispatcherType;
(function (DispatcherType) {
    DispatcherType["Default"] = "default";
    DispatcherType["Pinned"] = "pinned";
    DispatcherType["CallingThread"] = "calling-thread";
})(DispatcherType || (DispatcherType = {}));
// ============================================================================
// Router types
// ============================================================================
export var RoutingStrategy;
(function (RoutingStrategy) {
    RoutingStrategy["RoundRobin"] = "round-robin";
    RoutingStrategy["Random"] = "random";
    RoutingStrategy["SmallestMailbox"] = "smallest-mailbox";
    RoutingStrategy["Broadcast"] = "broadcast";
    RoutingStrategy["ConsistentHash"] = "consistent-hash";
})(RoutingStrategy || (RoutingStrategy = {}));
// ============================================================================
// Ask pattern types
// ============================================================================
export const AskReply = Symbol.for('actor-bonilla.AskReply');
//# sourceMappingURL=types.js.map