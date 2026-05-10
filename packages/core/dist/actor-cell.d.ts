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
    constructor(system: ActorSystem, parent: ActorCell<any> | null, props: Props<T>, name: string, dispatcher: Dispatcher, throughput?: number);
    /** Fire-and-forget send. */
    tell(message: T, sender?: ActorRef<any> | null): void;
    /** Request-response; returns a Promise. */
    ask<R>(message: T, timeoutMs?: number): Promise<R>;
    /** Stop this actor gracefully. */
    stop(): void;
    get self(): ActorRef<T>;
    get sender(): ActorRef<any> | null;
    get parent(): ActorRef<any> | null;
    get system(): ActorSystem;
    get children(): ReadonlyMap<string, ActorRef<any>>;
    spawn<U>(props: Props<U>, name: string): ActorRef<U>;
    stopChild(child: ActorRef<any>): void;
    contextStop(child: ActorRef<any>): void;
    watch(target: ActorRef<any>): void;
    unwatch(target: ActorRef<any>): void;
    become(behavior: Receive<T>, discardOld?: boolean): void;
    unbecome(): void;
    scheduleOnce(delayMs: number, message: T): CancelToken;
    scheduleRepeatedly(intervalMs: number, message: T): CancelToken;
    forward(target: ActorRef<any>): void;
    setSupervisionStrategy(strategy: SupervisionStrategy): void;
    stash(): void;
    unstashAll(): void;
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
    get mailboxSize(): number;
}
