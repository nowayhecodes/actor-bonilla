import type { ActorRef, ThreadPoolConfig, ThreadedProps } from './types.js';
export declare const enum WorkerMsgType {
    CreateActor = 1,
    Tell = 2,
    StopActor = 3,
    Shutdown = 4,
    Ask = 5,
    ActorCreated = 10,
    DeadLetter = 11,
    TellProxy = 12,// Worker actor wants to tell another actor (possibly on different worker)
    AskReply = 13,
    ActorStopped = 14,
    Log = 15,
    Error = 16
}
/** Main → Worker: create an actor on this worker. */
export interface CreateActorMsg {
    type: WorkerMsgType.CreateActor;
    actorPath: string;
    actorName: string;
    /** Path to the module exporting the behavior factory. */
    behaviorModule: string;
    /** Name of the exported factory function. */
    behaviorExport: string;
    /** Serializable arguments passed to the factory. */
    behaviorArgs: any[];
}
/** Main → Worker: deliver a message to an actor on this worker. */
export interface TellMsg {
    type: WorkerMsgType.Tell;
    targetPath: string;
    message: any;
    senderPath: string | null;
}
/** Main → Worker: ask an actor and get a reply. */
export interface AskMsg {
    type: WorkerMsgType.Ask;
    targetPath: string;
    message: any;
    correlationId: number;
}
/** Worker → Main: an actor wants to send to another actor. */
export interface TellProxyMsg {
    type: WorkerMsgType.TellProxy;
    targetPath: string;
    message: any;
    senderPath: string | null;
}
/** Worker → Main: reply to an ask. */
export interface AskReplyMsg {
    type: WorkerMsgType.AskReply;
    correlationId: number;
    value: any;
    error?: string;
}
/** Main → Worker: gracefully stop a specific actor on this worker. */
export interface StopActorMsg {
    type: WorkerMsgType.StopActor;
    actorPath: string;
}
/** Main → Worker: shut down the entire WorkerShard (process will exit). */
export interface ShutdownMsg {
    type: WorkerMsgType.Shutdown;
}
/** Worker → Main: confirmation that an actor was successfully created. */
export interface ActorCreatedMsg {
    type: WorkerMsgType.ActorCreated;
    actorPath: string;
}
/** Worker → Main: confirmation that an actor was successfully stopped. */
export interface ActorStoppedMsg {
    type: WorkerMsgType.ActorStopped;
    actorPath: string;
}
/** Worker → Main: a log message emitted from inside a worker actor. */
export interface LogMsg {
    type: WorkerMsgType.Log;
    level: 'info' | 'warn' | 'error';
    message: string;
}
/** Worker → Main: an unhandled error thrown inside a worker actor. */
export interface ErrorMsg {
    type: WorkerMsgType.Error;
    actorPath: string;
    /** Serialized error message (functions cannot cross thread boundaries). */
    error: string;
}
/** Discriminated union of all messages the main thread can send to a worker. */
export type MainToWorkerMsg = CreateActorMsg | TellMsg | AskMsg | StopActorMsg | ShutdownMsg;
/** Discriminated union of all messages a worker can send back to the main thread. */
export type WorkerToMainMsg = ActorCreatedMsg | TellProxyMsg | AskReplyMsg | ActorStoppedMsg | LogMsg | ErrorMsg;
/**
 * ThreadedReceive is the handler function running inside a worker.
 * It gets a simplified context (no direct ActorRef objects — only paths
 * and a `tell` function that routes through the main thread).
 */
export interface ThreadedActorContext {
    readonly selfPath: string;
    readonly selfName: string;
    /** Send a message to any actor by path (routes through main thread). */
    tell(targetPath: string, message: any): void;
    /** Reply to the current ask, if applicable. */
    reply(value: any): void;
    /** Sender path, if available. */
    readonly senderPath: string | null;
    /** Signal to stop this actor. */
    stop(): void;
}
export type ThreadedReceive<T = any> = (message: T, context: ThreadedActorContext) => void | Promise<void>;
/**
 * A proxy ActorRef that lives on the main thread and transparently forwards
 * messages to the real ActorCell running on a worker thread.
 * Forwards to an actor hosted on a worker thread.
 */
export declare class ThreadPoolRef<T = unknown> implements ActorRef<T> {
    readonly path: string;
    readonly name: string;
    private readonly pool;
    private readonly workerIndex;
    /**
     * @param pool        The owning ThreadPool instance.
     * @param workerIndex Index of the worker thread hosting this actor.
     * @param path        Full hierarchical path of the actor (e.g. `/user/counter`).
     * @param name        Simple actor name.
     */
    constructor(pool: ThreadPool, workerIndex: number, path: string, name: string);
    /** Serialize and forward a fire-and-forget message to the worker-side actor. */
    tell(message: T, sender?: ActorRef<any> | null): void;
    /**
     * Serialize and forward a request; awaits the worker's reply.
     * @param timeoutMs Milliseconds before the returned Promise rejects (default 5 000 ms).
     */
    ask<R>(message: T, timeoutMs?: number): Promise<R>;
    /** Request graceful termination of the worker-side actor. */
    stop(): void;
}
/**
 * ThreadPool manages a pool of worker threads, each running a WorkerShard.
 * Actors are distributed across workers using round-robin or explicit assignment.
 *
 * Pool size and worker script follow the usual fork/join–style layout.
 */
export declare class ThreadPool {
    private workers;
    private readonly poolSize;
    private nextWorker;
    private alive;
    private actorRegistry;
    private askCounter;
    private pendingAsks;
    private pendingCreations;
    private onTellProxy;
    /**
     * @param config Thread pool options.
     *               - `poolSize` — number of worker threads (default: logical CPUs − 1, min 1).
     *               - `workerScript` — absolute path to the worker entry point (default: this file).
     */
    constructor(config?: ThreadPoolConfig);
    /** Register a callback for when a worker actor wants to tell another actor. */
    setTellProxyHandler(handler: (targetPath: string, message: any, senderPath: string | null) => void): void;
    /** Get the pool size. */
    get size(): number;
    /**
     * Create an actor on a worker thread.
     * Returns a proxy ActorRef that forwards messages to the worker.
     */
    createActor<T>(name: string, parentPath: string, threadedProps: ThreadedProps, workerIndex?: number): Promise<ThreadPoolRef<T>>;
    /**
     * Deliver a fire-and-forget message to an actor on the specified worker.
     * No-op when the pool has been shut down.
     */
    sendTell(workerIndex: number, targetPath: string, message: any, senderPath: string | null): void;
    /**
     * Send an ask message to an actor on the specified worker and await a reply.
     * @param timeoutMs How long to wait before rejecting the returned Promise.
     */
    sendAsk<R>(workerIndex: number, targetPath: string, message: any, timeoutMs: number): Promise<R>;
    /** Request graceful termination of a specific actor on the given worker. */
    sendStop(workerIndex: number, actorPath: string): void;
    /** Route a message to the correct worker based on actor path. */
    routeMessage(targetPath: string, message: any, senderPath: string | null): boolean;
    /** Look up which worker owns an actor. */
    getWorkerForActor(path: string): number | undefined;
    private handleWorkerMessage;
    private pickWorker;
    /**
     * Gracefully shut down the pool.
     * Cancels all in-flight asks, sends a Shutdown message to each worker,
     * and waits for all worker processes to exit (force-terminates after 2 s).
     */
    shutdown(): Promise<void>;
}
