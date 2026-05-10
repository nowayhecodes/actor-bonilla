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
export interface StopActorMsg {
    type: WorkerMsgType.StopActor;
    actorPath: string;
}
export interface ShutdownMsg {
    type: WorkerMsgType.Shutdown;
}
export interface ActorCreatedMsg {
    type: WorkerMsgType.ActorCreated;
    actorPath: string;
}
export interface ActorStoppedMsg {
    type: WorkerMsgType.ActorStopped;
    actorPath: string;
}
export interface LogMsg {
    type: WorkerMsgType.Log;
    level: 'info' | 'warn' | 'error';
    message: string;
}
export interface ErrorMsg {
    type: WorkerMsgType.Error;
    actorPath: string;
    error: string;
}
export type MainToWorkerMsg = CreateActorMsg | TellMsg | AskMsg | StopActorMsg | ShutdownMsg;
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
    constructor(pool: ThreadPool, workerIndex: number, path: string, name: string);
    tell(message: T, sender?: ActorRef<any> | null): void;
    ask<R>(message: T, timeoutMs?: number): Promise<R>;
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
    sendTell(workerIndex: number, targetPath: string, message: any, senderPath: string | null): void;
    sendAsk<R>(workerIndex: number, targetPath: string, message: any, timeoutMs: number): Promise<R>;
    sendStop(workerIndex: number, actorPath: string): void;
    /** Route a message to the correct worker based on actor path. */
    routeMessage(targetPath: string, message: any, senderPath: string | null): boolean;
    /** Look up which worker owns an actor. */
    getWorkerForActor(path: string): number | undefined;
    private handleWorkerMessage;
    private pickWorker;
    shutdown(): Promise<void>;
}
