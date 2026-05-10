import type { ActorRef, ActorContext, Receive, Props, SupervisionStrategy, CancelToken } from './types.js';
import type { Dispatcher } from './dispatcher.js';
import type { ActorSystem } from './actor-system.js';
/**
 * ActorCell is the internal implementation behind every ActorRef.
 * It is never exposed to user code — only the ActorRef facade is visible.
 */
export declare class ActorCell<T = unknown> implements ActorRef<T>, ActorContext<T> {
    readonly path: string;
    readonly name: string;
    private state;
    private currentBehavior;
    private behaviorStack;
    private readonly props;
    private readonly mailbox;
    private readonly dispatcher;
    private readonly _system;
    private readonly _parent;
    private _children;
    private watchers;
    private watching;
    private supervisionStrategy;
    private restartCount;
    private restartWindowStart;
    private stashedMessages;
    private pendingAsks;
    private askCounter;
    private scheduledTimers;
    private processing;
    private currentSender;
    private currentEnvelope;
    private readonly throughput;
    /**
     * @internal Created by `ActorSystem.createCell` — not part of the public API.
     * @param system     The owning ActorSystem.
     * @param parent     The parent ActorCell (null for top-level actors under /user).
     * @param props      Actor configuration: behavior, mailbox type, dispatcher type, supervision.
     * @param name       Simple actor name; combined with the parent path to form the full path.
     * @param dispatcher Scheduler that drives mailbox processing.
     * @param throughput Maximum messages processed per scheduling run before yielding.
     */
    constructor(system: ActorSystem, parent: ActorCell<any> | null, props: Props<T>, name: string, dispatcher: Dispatcher, throughput?: number);
    /**
     * Fire-and-forget message delivery. The call returns immediately.
     * If the actor is already stopped the message is routed to the dead-letter channel.
     * If the mailbox is full (BoundedMailbox) the message is also dead-lettered.
     */
    tell(message: T, sender?: ActorRef<any> | null): void;
    /**
     * Send a message and await a typed reply.
     * The receiving actor replies by calling `ActorCell.reply(context, value)`.
     * @param message   Message to deliver.
     * @param timeoutMs Milliseconds to wait for a reply (default 5 000 ms).
     * @throws After `timeoutMs` with no reply, the returned Promise rejects.
     */
    ask<R>(message: T, timeoutMs?: number): Promise<R>;
    /**
     * Request graceful termination by sending a PoisonPill message.
     * The actor processes any messages already in its mailbox before stopping.
     */
    stop(): void;
    /** The ActorRef handle for this actor itself. */
    get self(): ActorRef<T>;
    /** The sender of the currently processed message, or `null` outside a receive call. */
    get sender(): ActorRef<any> | null;
    /** The parent ActorRef, or `null` for top-level actors directly under /user. */
    get parent(): ActorRef<any> | null;
    /** @internal The owning ActorSystem (typed as `any` to break the forward-reference cycle). */
    get system(): ActorSystem;
    /** Read-only snapshot of all live child actors, keyed by their simple names. */
    get children(): ReadonlyMap<string, ActorRef<any>>;
    /**
     * Spawn a new child actor with the given props and name.
     * The child is started immediately and appears in `children`.
     * @throws If a child with the same name already exists under this actor.
     */
    spawn<U>(props: Props<U>, name: string): ActorRef<U>;
    /** Gracefully stop a direct child actor. No-op if the child is not known. */
    stopChild(child: ActorRef<any>): void;
    /** Implements `ActorContext.stop(child)` — delegates to `stopChild`. */
    contextStop(child: ActorRef<any>): void;
    /**
     * Register a DeathWatch on `target`.
     * A `TerminatedMessage` is delivered to this actor when `target` stops.
     * If `target` is already stopped the message is delivered immediately.
     */
    watch(target: ActorRef<any>): void;
    /** Remove the DeathWatch on a previously watched actor. */
    unwatch(target: ActorRef<any>): void;
    /**
     * Hot-swap the current receive function.
     * @param behavior   New receive function to install.
     * @param discardOld When `true` the current behavior is dropped; when `false`
     *                   it is pushed onto the stack and can be restored with `unbecome()`.
     */
    become(behavior: Receive<T>, discardOld?: boolean): void;
    /** Revert to the previous behavior by popping the behavior stack. No-op when the stack is empty. */
    unbecome(): void;
    /**
     * Schedule a single message delivery to self after `delayMs` milliseconds.
     * @returns A `CancelToken` whose `cancel()` aborts the delivery if not yet fired.
     */
    scheduleOnce(delayMs: number, message: T): CancelToken;
    /**
     * Schedule a repeating message delivery to self every `intervalMs` milliseconds.
     * @returns A `CancelToken` whose `cancel()` stops the interval.
     */
    scheduleRepeatedly(intervalMs: number, message: T): CancelToken;
    /**
     * Forward the current in-flight message to `target`, preserving the original sender.
     * No-op when called outside a receive invocation.
     */
    forward(target: ActorRef<any>): void;
    /**
     * Replace the supervision strategy applied to this actor's children.
     * The strategy is validated at runtime (Typia) before being stored.
     */
    setSupervisionStrategy(strategy: SupervisionStrategy): void;
    /**
     * Stash the current in-flight message for later reprocessing.
     * No-op when called outside a receive invocation.
     */
    stash(): void;
    /**
     * Re-enqueue all previously stashed messages at the front of the mailbox
     * and trigger mailbox processing.
     */
    unstashAll(): void;
    /** @internal Transition to the Started state and deliver the PreStart lifecycle signal. */
    start(): void;
    private invokeLifecycleHook;
    private terminateGracefully;
    private scheduleProcessing;
    private processMailbox;
    private handleFailure;
    handleChildFailure(child: ActorCell<any>, error: Error): void;
    private restartChild;
    private restart;
    private resume;
    /**
     * Helper: if the current message was sent via `ask`, reply to it.
     * This is called from user code via the context.
     */
    static reply<R>(context: ActorContext<any>, value: R): void;
    /** @internal Current mailbox depth — read by the SmallestMailbox router strategy. */
    get mailboxSize(): number;
}
