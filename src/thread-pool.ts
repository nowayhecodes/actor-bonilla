// ============================================================================
// actor-bonilla — ThreadPoolDispatcher
//
// True multi-threaded actor processing via Node.js worker_threads.
//
// Architecture (main thread proxies, worker-side mailboxes):
// ┌─────────────────────────────────────────────────────────────┐
// │  Main Thread                                                │
// │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
// │  │ ProxyRef "a" │  │ ProxyRef "b" │  │ ProxyRef "c" │      │
// │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
// │         │ MessagePort     │                  │              │
// ├─────────┼─────────────────┼──────────────────┼──────────────┤
// │ Worker 0│          Worker 1│           Worker 2│             │
// │  ┌──────▼───────┐  ┌──────▼───────┐  ┌──────▼───────┐      │
// │  │ ActorCell "a"│  │ ActorCell "b"│  │ ActorCell "c"│      │
// │  │  (mailbox)   │  │  (mailbox)   │  │  (mailbox)   │      │
// │  │  (behavior)  │  │  (behavior)  │  │  (behavior)  │      │
// │  └──────────────┘  └──────────────┘  └──────────────┘      │
// └─────────────────────────────────────────────────────────────┘
//
// Key insight: Functions cannot be serialized across threads.
// So the user provides a "behavior factory" (a module path + export name),
// and each worker instantiates its own copy of the behavior.
//
// Props carry a recipe (module + factory args), not a live function.
// The worker loads the module and constructs behavior on its thread.
// ============================================================================

import {
  Worker,
  isMainThread,
  parentPort,
  workerData,
  type MessagePort,
} from 'node:worker_threads';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import type { ActorRef, CancelToken } from './types.js';
import { assertThreadPoolConfig, assertThreadedProps } from './validation.js';

// ============================================================================
// Protocol — messages between main thread and workers
// ============================================================================

export const enum WorkerMsgType {
  // Main → Worker
  CreateActor = 1,
  Tell = 2,
  StopActor = 3,
  Shutdown = 4,
  Ask = 5,

  // Worker → Main
  ActorCreated = 10,
  DeadLetter = 11,
  TellProxy = 12, // Worker actor wants to tell another actor (possibly on different worker)
  AskReply = 13,
  ActorStopped = 14,
  Log = 15,
  Error = 16,
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

export type MainToWorkerMsg =
  | CreateActorMsg
  | TellMsg
  | AskMsg
  | StopActorMsg
  | ShutdownMsg;
export type WorkerToMainMsg =
  | ActorCreatedMsg
  | TellProxyMsg
  | AskReplyMsg
  | ActorStoppedMsg
  | LogMsg
  | ErrorMsg;

// ============================================================================
// BehaviorFactory — the serializable "Props" for threaded actors
// ============================================================================

/**
 * A ThreadedProps describes how to create an actor on a worker thread.
 * Since functions can't cross thread boundaries, we specify the behavior
 * as a module path + export name (factory pattern).
 *
 * The module must export a factory function:
 *   export function myBehavior(arg1: string, arg2: number): ThreadedReceive<MyMsg> { ... }
 *
 * The factory returns a ThreadedReceive — the message handler.
 */
export interface ThreadedProps {
  /** Absolute path or URL to the module. */
  behaviorModule: string;
  /** Name of the exported factory function. */
  behaviorExport: string;
  /** Serializable arguments for the factory. */
  behaviorArgs?: any[];
}

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

export type ThreadedReceive<T = any> = (
  message: T,
  context: ThreadedActorContext
) => void | Promise<void>;

// ============================================================================
// WorkerShard — runs inside a worker thread
// ============================================================================

/**
 * Each worker manages a set of actors. Messages arrive via the MessagePort,
 * get dispatched to the right actor, and outbound messages are sent back
 * to the main thread for routing.
 */
class WorkerShard {
  private actors = new Map<
    string,
    {
      name: string;
      receive: ThreadedReceive;
      mailbox: any[];
      processing: boolean;
    }
  >();
  private port: MessagePort;
  private currentAskCorrelationId: number | null = null;

  constructor(port: MessagePort) {
    this.port = port;
    port.on('message', (msg: MainToWorkerMsg) => this.handleMessage(msg));
  }

  private async handleMessage(msg: MainToWorkerMsg): Promise<void> {
    switch (msg.type) {
      case WorkerMsgType.CreateActor:
        await this.createActor(msg);
        break;
      case WorkerMsgType.Tell:
        this.deliverTell(msg);
        break;
      case WorkerMsgType.Ask:
        this.deliverAsk(msg);
        break;
      case WorkerMsgType.StopActor:
        this.stopActor(msg.actorPath);
        break;
      case WorkerMsgType.Shutdown:
        this.shutdown();
        break;
    }
  }

  private async createActor(msg: CreateActorMsg): Promise<void> {
    try {
      // Dynamically import the behavior module
      const mod = await import(msg.behaviorModule);
      const factory = mod[msg.behaviorExport];
      if (typeof factory !== 'function') {
        throw new Error(
          `Export "${msg.behaviorExport}" is not a function in ${msg.behaviorModule}`
        );
      }
      const receive: ThreadedReceive = factory(...(msg.behaviorArgs ?? []));

      this.actors.set(msg.actorPath, {
        name: msg.actorName,
        receive,
        mailbox: [],
        processing: false,
      });

      this.port.postMessage({
        type: WorkerMsgType.ActorCreated,
        actorPath: msg.actorPath,
      } satisfies ActorCreatedMsg);
    } catch (e: any) {
      this.port.postMessage({
        type: WorkerMsgType.Error,
        actorPath: msg.actorPath,
        error: e.message ?? String(e),
      } satisfies ErrorMsg);
    }
  }

  private deliverTell(msg: TellMsg): void {
    const actor = this.actors.get(msg.targetPath);
    if (!actor) {
      // Dead letter — actor doesn't exist on this worker
      return;
    }
    actor.mailbox.push({
      message: msg.message,
      senderPath: msg.senderPath,
      correlationId: null,
    });
    this.scheduleProcessing(msg.targetPath, actor);
  }

  private deliverAsk(msg: AskMsg): void {
    const actor = this.actors.get(msg.targetPath);
    if (!actor) {
      this.port.postMessage({
        type: WorkerMsgType.AskReply,
        correlationId: msg.correlationId,
        value: null,
        error: `Actor ${msg.targetPath} not found`,
      } satisfies AskReplyMsg);
      return;
    }
    actor.mailbox.push({
      message: msg.message,
      senderPath: null,
      correlationId: msg.correlationId,
    });
    this.scheduleProcessing(msg.targetPath, actor);
  }

  private scheduleProcessing(
    path: string,
    actor: {
      name: string;
      receive: ThreadedReceive;
      mailbox: any[];
      processing: boolean;
    }
  ): void {
    if (actor.processing) return;
    actor.processing = true;

    // Use queueMicrotask for maximum throughput within this worker
    queueMicrotask(() => this.processMailbox(path, actor));
  }

  private async processMailbox(
    path: string,
    actor: {
      name: string;
      receive: ThreadedReceive;
      mailbox: any[];
      processing: boolean;
    }
  ): Promise<void> {
    const batch = actor.mailbox;
    actor.mailbox = [];

    // Process up to 64 messages per batch
    const limit = Math.min(batch.length, 64);
    for (let i = 0; i < limit; i++) {
      const envelope = batch[i];
      this.currentAskCorrelationId = envelope.correlationId;

      const context: ThreadedActorContext = {
        selfPath: path,
        selfName: actor.name,
        senderPath: envelope.senderPath,
        tell: (targetPath: string, message: any) => {
          this.port.postMessage({
            type: WorkerMsgType.TellProxy,
            targetPath,
            message,
            senderPath: path,
          } satisfies TellProxyMsg);
        },
        reply: (value: any) => {
          if (envelope.correlationId !== null) {
            this.port.postMessage({
              type: WorkerMsgType.AskReply,
              correlationId: envelope.correlationId,
              value,
            } satisfies AskReplyMsg);
          } else if (envelope.senderPath) {
            // Reply via tell
            this.port.postMessage({
              type: WorkerMsgType.TellProxy,
              targetPath: envelope.senderPath,
              message: value,
              senderPath: path,
            } satisfies TellProxyMsg);
          }
        },
        stop: () => {
          this.stopActor(path);
        },
      };

      try {
        await actor.receive(envelope.message, context);
      } catch (e: any) {
        this.port.postMessage({
          type: WorkerMsgType.Error,
          actorPath: path,
          error: e.message ?? String(e),
        } satisfies ErrorMsg);
      }

      this.currentAskCorrelationId = null;
    }

    // If there are remaining messages, re-enqueue
    if (limit < batch.length) {
      actor.mailbox = batch.slice(limit).concat(actor.mailbox);
    }

    actor.processing = false;

    // If new messages arrived during processing, schedule again
    if (actor.mailbox.length > 0) {
      this.scheduleProcessing(path, actor);
    }
  }

  private stopActor(path: string): void {
    this.actors.delete(path);
    this.port.postMessage({
      type: WorkerMsgType.ActorStopped,
      actorPath: path,
    } satisfies ActorStoppedMsg);
  }

  private shutdown(): void {
    this.actors.clear();
    process.exit(0);
  }
}

// ============================================================================
// Worker entry point — if this module is loaded as a worker
// ============================================================================

if (!isMainThread && parentPort) {
  new WorkerShard(parentPort);
}

// ============================================================================
// ThreadPoolRef — a proxy ActorRef on the main thread
// ============================================================================

/**
 * A proxy ActorRef that lives on the main thread and transparently forwards
 * messages to the real ActorCell running on a worker thread.
 * Forwards to an actor hosted on a worker thread.
 */
export class ThreadPoolRef<T = unknown> implements ActorRef<T> {
  readonly path: string;
  readonly name: string;
  private readonly pool: ThreadPool;
  private readonly workerIndex: number;

  constructor(
    pool: ThreadPool,
    workerIndex: number,
    path: string,
    name: string
  ) {
    this.pool = pool;
    this.workerIndex = workerIndex;
    this.path = path;
    this.name = name;
  }

  tell(message: T, sender?: ActorRef<any> | null): void {
    this.pool.sendTell(
      this.workerIndex,
      this.path,
      message,
      sender?.path ?? null
    );
  }

  ask<R>(message: T, timeoutMs = 5000): Promise<R> {
    return this.pool.sendAsk<R>(
      this.workerIndex,
      this.path,
      message,
      timeoutMs
    );
  }

  stop(): void {
    this.pool.sendStop(this.workerIndex, this.path);
  }
}

// ============================================================================
// ThreadPool — manages a pool of worker threads (main thread side)
// ============================================================================

export interface ThreadPoolConfig {
  /** Number of worker threads. Defaults to (cpus - 1), min 1. */
  poolSize?: number;
  /** Path to the worker script. Defaults to this file. */
  workerScript?: string;
}

/**
 * ThreadPool manages a pool of worker threads, each running a WorkerShard.
 * Actors are distributed across workers using round-robin or explicit assignment.
 *
 * Pool size and worker script follow the usual fork/join–style layout.
 */
export class ThreadPool {
  private workers: Worker[] = [];
  private readonly poolSize: number;
  private nextWorker = 0;
  private alive = true;

  // Actor registry: path → worker index
  private actorRegistry = new Map<string, number>();

  // Ask tracking
  private askCounter = 0;
  private pendingAsks = new Map<
    number,
    {
      resolve: (value: any) => void;
      reject: (reason: any) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  // Creation promises
  private pendingCreations = new Map<
    string,
    {
      resolve: (ref: ThreadPoolRef) => void;
      reject: (reason: any) => void;
    }
  >();

  // External handler for cross-worker routing
  private onTellProxy:
    | ((targetPath: string, message: any, senderPath: string | null) => void)
    | null = null;

  constructor(config: ThreadPoolConfig = {}) {
    assertThreadPoolConfig(config);
    this.poolSize = config.poolSize ?? Math.max(cpus().length - 1, 1);
    const workerScript = config.workerScript ?? fileURLToPath(import.meta.url);

    for (let i = 0; i < this.poolSize; i++) {
      const worker = new Worker(workerScript, {
        workerData: { shardIndex: i },
      });
      worker.on('message', (msg: WorkerToMainMsg) =>
        this.handleWorkerMessage(i, msg)
      );
      worker.on('error', (err: unknown) => {
        console.error(`[actor-bonilla/ThreadPool] Worker ${i} error:`, err);
      });
      this.workers.push(worker);
    }
  }

  /** Register a callback for when a worker actor wants to tell another actor. */
  setTellProxyHandler(
    handler: (
      targetPath: string,
      message: any,
      senderPath: string | null
    ) => void
  ): void {
    this.onTellProxy = handler;
  }

  /** Get the pool size. */
  get size(): number {
    return this.poolSize;
  }

  // ========================================================================
  // Actor lifecycle
  // ========================================================================

  /**
   * Create an actor on a worker thread.
   * Returns a proxy ActorRef that forwards messages to the worker.
   */
  async createActor<T>(
    name: string,
    parentPath: string,
    threadedProps: ThreadedProps,
    workerIndex?: number
  ): Promise<ThreadPoolRef<T>> {
    assertThreadedProps(threadedProps);
    if (!this.alive) throw new Error('ThreadPool is shut down');

    const idx = workerIndex ?? this.pickWorker();
    const actorPath = `${parentPath}/${name}`;

    return new Promise<ThreadPoolRef<T>>((resolve, reject) => {
      this.pendingCreations.set(actorPath, {
        resolve: (ref) => resolve(ref as ThreadPoolRef<T>),
        reject,
      });

      this.workers[idx].postMessage({
        type: WorkerMsgType.CreateActor,
        actorPath,
        actorName: name,
        behaviorModule: threadedProps.behaviorModule,
        behaviorExport: threadedProps.behaviorExport,
        behaviorArgs: threadedProps.behaviorArgs ?? [],
      } satisfies CreateActorMsg);

      this.actorRegistry.set(actorPath, idx);
    });
  }

  // ========================================================================
  // Message routing
  // ========================================================================

  sendTell(
    workerIndex: number,
    targetPath: string,
    message: any,
    senderPath: string | null
  ): void {
    if (!this.alive) return;
    this.workers[workerIndex].postMessage({
      type: WorkerMsgType.Tell,
      targetPath,
      message,
      senderPath,
    } satisfies TellMsg);
  }

  sendAsk<R>(
    workerIndex: number,
    targetPath: string,
    message: any,
    timeoutMs: number
  ): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      const correlationId = ++this.askCounter;
      const timer = setTimeout(() => {
        this.pendingAsks.delete(correlationId);
        reject(
          new Error(
            `Threaded ask timed out after ${timeoutMs}ms for ${targetPath}`
          )
        );
      }, timeoutMs);

      this.pendingAsks.set(correlationId, { resolve, reject, timer });

      this.workers[workerIndex].postMessage({
        type: WorkerMsgType.Ask,
        targetPath,
        message,
        correlationId,
      } satisfies AskMsg);
    });
  }

  sendStop(workerIndex: number, actorPath: string): void {
    if (!this.alive) return;
    this.workers[workerIndex].postMessage({
      type: WorkerMsgType.StopActor,
      actorPath,
    } satisfies StopActorMsg);
  }

  /** Route a message to the correct worker based on actor path. */
  routeMessage(
    targetPath: string,
    message: any,
    senderPath: string | null
  ): boolean {
    const workerIndex = this.actorRegistry.get(targetPath);
    if (workerIndex === undefined) return false;
    this.sendTell(workerIndex, targetPath, message, senderPath);
    return true;
  }

  /** Look up which worker owns an actor. */
  getWorkerForActor(path: string): number | undefined {
    return this.actorRegistry.get(path);
  }

  // ========================================================================
  // Worker message handling
  // ========================================================================

  private handleWorkerMessage(workerIndex: number, msg: WorkerToMainMsg): void {
    switch (msg.type) {
      case WorkerMsgType.ActorCreated: {
        const pending = this.pendingCreations.get(msg.actorPath);
        if (pending) {
          this.pendingCreations.delete(msg.actorPath);
          const name = msg.actorPath.split('/').pop() ?? msg.actorPath;
          const ref = new ThreadPoolRef(this, workerIndex, msg.actorPath, name);
          pending.resolve(ref);
        }
        break;
      }

      case WorkerMsgType.TellProxy: {
        // Worker actor wants to send to another actor — route it
        if (this.onTellProxy) {
          this.onTellProxy(msg.targetPath, msg.message, msg.senderPath);
        } else {
          // Default: try to route to another worker
          this.routeMessage(msg.targetPath, msg.message, msg.senderPath);
        }
        break;
      }

      case WorkerMsgType.AskReply: {
        const pending = this.pendingAsks.get(msg.correlationId);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingAsks.delete(msg.correlationId);
          if (msg.error) {
            pending.reject(new Error(msg.error));
          } else {
            pending.resolve(msg.value);
          }
        }
        break;
      }

      case WorkerMsgType.ActorStopped: {
        this.actorRegistry.delete(msg.actorPath);
        break;
      }

      case WorkerMsgType.Log: {
        const fn =
          msg.level === 'error'
            ? console.error
            : msg.level === 'warn'
              ? console.warn
              : console.log;
        fn(`[actor-bonilla/Worker-${workerIndex}]`, msg.message);
        break;
      }

      case WorkerMsgType.Error: {
        console.error(
          `[actor-bonilla/Worker-${workerIndex}] Actor ${msg.actorPath} error:`,
          msg.error
        );
        break;
      }
    }
  }

  // ========================================================================
  // Worker selection
  // ========================================================================

  private pickWorker(): number {
    const idx = this.nextWorker;
    this.nextWorker = (this.nextWorker + 1) % this.poolSize;
    return idx;
  }

  // ========================================================================
  // Shutdown
  // ========================================================================

  async shutdown(): Promise<void> {
    if (!this.alive) return;
    this.alive = false;

    // Cancel pending asks
    for (const [, ask] of this.pendingAsks) {
      clearTimeout(ask.timer);
      ask.reject(new Error('ThreadPool shutting down'));
    }
    this.pendingAsks.clear();

    // Send shutdown to all workers
    const exits = this.workers.map((worker, i) => {
      return new Promise<void>((resolve) => {
        worker.once('exit', () => resolve());
        worker.postMessage({
          type: WorkerMsgType.Shutdown,
        } satisfies ShutdownMsg);
        // Force kill after 2 seconds
        setTimeout(() => {
          worker
            .terminate()
            .then(() => resolve())
            .catch(() => resolve());
        }, 2000);
      });
    });

    await Promise.all(exits);
    this.workers = [];
    this.actorRegistry.clear();
  }
}
