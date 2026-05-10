import type { ActorRef, ActorSystemConfig } from './types.js';
import { ActorSystem } from './actor-system.js';
import { ThreadPool, type ThreadPoolConfig, type ThreadedProps } from './thread-pool.js';
export interface ThreadedActorSystemConfig extends ActorSystemConfig {
    /** Thread pool configuration. */
    threadPool?: ThreadPoolConfig;
}
/**
 * ThreadedActorSystem supports both:
 *  - Local actors (processed on the main thread event loop, like before)
 *  - Threaded actors (processed on worker threads, for CPU-heavy work)
 *
 * Both types of actors can `tell` each other seamlessly.
 */
export declare class ThreadedActorSystem extends ActorSystem {
    private pool;
    constructor(config?: ThreadedActorSystemConfig);
    /**
     * Create a threaded actor that runs on a worker thread.
     *
     * Usage:
     * ```ts
     * const ref = await system.threadedActorOf({
     *   behaviorModule: '/absolute/path/to/my-behaviors.js',
     *   behaviorExport: 'createCounterBehavior',
     *   behaviorArgs: [0], // initial count
     * }, 'counter');
     * ref.tell({ type: 'increment' });
     * const count = await ref.ask<number>({ type: 'getCount' });
     * ```
     */
    threadedActorOf<T>(threadedProps: ThreadedProps, name: string, workerIndex?: number): Promise<ActorRef<T>>;
    /**
     * Resolve an actor path to an ActorRef, checking both local and threaded actors.
     */
    resolveRef(path: string): ActorRef<any> | undefined;
    /** Get the thread pool. */
    get threadPool(): ThreadPool;
    /** Get the number of worker threads. */
    get poolSize(): number;
    /**
     * Gracefully terminate everything — workers + local actors.
     */
    terminate(): Promise<void>;
}
