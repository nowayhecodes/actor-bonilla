// ============================================================================
// actor-bonilla — ThreadedActorSystem
//
// Extends the base ActorSystem with the ability to spawn actors on worker
// threads via the ThreadPool. Local actors and threaded actors can
// communicate transparently.
// ============================================================================

import type {
  ActorRef,
  Props,
  ActorSystemConfig,
  ThreadPoolConfig,
  ThreadedProps,
} from './types.js';
import { ActorSystem } from './actor-system.js';
import { ThreadPool, ThreadPoolRef } from './thread-pool.js';

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
export class ThreadedActorSystem extends ActorSystem {
  private pool: ThreadPool;

  constructor(config: ThreadedActorSystemConfig = {}) {
    super(config);

    this.pool = new ThreadPool(config.threadPool);

    // Wire up cross-worker routing:
    // When a threaded actor tells another actor, it goes through here.
    this.pool.setTellProxyHandler((targetPath, message, senderPath) => {
      // First try: is it a threaded actor on another worker?
      const routed = this.pool.routeMessage(targetPath, message, senderPath);
      if (routed) return;

      // Second try: is it a local actor on the main thread?
      const localActor = this.actorFor(targetPath);
      if (localActor) {
        // Create a proxy sender if sender is a threaded actor
        const senderRef = senderPath ? this.resolveRef(senderPath) : undefined;
        localActor.tell(message, senderRef);
        return;
      }

      // Dead letter
      console.warn(
        `[actor-bonilla/Threaded] Dead letter: no actor at ${targetPath}`
      );
    });
  }

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
  async threadedActorOf<T>(
    threadedProps: ThreadedProps,
    name: string,
    workerIndex?: number
  ): Promise<ActorRef<T>> {
    return this.pool.createActor<T>(name, '/user', threadedProps, workerIndex);
  }

  /**
   * Resolve an actor path to an ActorRef, checking both local and threaded actors.
   */
  resolveRef(path: string): ActorRef<any> | undefined {
    // Check local first
    const local = this.actorFor(path);
    if (local) return local;

    // Check threaded
    const workerIndex = this.pool.getWorkerForActor(path);
    if (workerIndex !== undefined) {
      const name = path.split('/').pop() ?? path;
      return new ThreadPoolRef(this.pool, workerIndex, path, name);
    }

    return undefined;
  }

  /** Get the thread pool. */
  get threadPool(): ThreadPool {
    return this.pool;
  }

  /** Get the number of worker threads. */
  get poolSize(): number {
    return this.pool.size;
  }

  /**
   * Gracefully terminate everything — workers + local actors.
   */
  override async terminate(): Promise<void> {
    await this.pool.shutdown();
    await super.terminate();
  }
}
