// ============================================================================
// actor-bonilla — ActorSystem
// The top-level container for all actors.
// ============================================================================

import type { ActorRef, Props, DeadLetter } from './types.js';
import { DispatcherType } from './types.js';
import { ActorCell } from './actor-cell.js';
import {
  DefaultDispatcher,
  PinnedDispatcher,
  CallingThreadDispatcher,
  type Dispatcher,
} from './dispatcher.js';
import { EventStream, DEAD_LETTER_CHANNEL } from './event-stream.js';

export interface ActorSystemConfig {
  /** Name of the actor system. */
  name?: string;
  /** Default dispatcher throughput (messages per batch). */
  defaultThroughput?: number;
  /** Enable dead letter logging. */
  logDeadLetters?: boolean;
  /** Maximum dead letters to log before silencing. */
  maxDeadLettersLogged?: number;
}

/**
 * ActorSystem is the root of the actor hierarchy.
 * All actors are created through the system.
 *
 * Hierarchy:
 *   /            — root guardian
 *   /system      — system actors (dead letters, logging)
 *   /user        — user-created actors
 *   /deadLetters — dead letter actor
 */
export class ActorSystem {
  readonly name: string;
  readonly eventStream: EventStream;

  // Dispatchers
  private readonly defaultDispatcher: DefaultDispatcher;
  private readonly pinnedDispatchers = new Set<PinnedDispatcher>();

  // Actor tree
  private readonly userGuardian: ActorCell<any>;
  private readonly topLevelActors = new Map<string, ActorCell<any>>();

  // Config
  private readonly config: Required<ActorSystemConfig>;

  // Stats
  private deadLetterCount = 0;
  private actorCount = 0;

  // Shutdown
  private _isTerminated = false;

  constructor(config: ActorSystemConfig = {}) {
    this.config = {
      name: config.name ?? 'actor-bonilla-system',
      defaultThroughput: config.defaultThroughput ?? 32,
      logDeadLetters: config.logDeadLetters ?? true,
      maxDeadLettersLogged: config.maxDeadLettersLogged ?? 100,
    };

    this.name = this.config.name;
    this.eventStream = new EventStream();
    this.defaultDispatcher = new DefaultDispatcher(
      this.config.defaultThroughput
    );

    // Create user guardian (virtual root for /user/*)
    this.userGuardian = new ActorCell<any>(
      this,
      null,
      { receive: () => {} },
      'user',
      this.defaultDispatcher,
      this.config.defaultThroughput
    );

    // Subscribe to dead letters
    if (this.config.logDeadLetters) {
      this.eventStream.subscribe<DeadLetter>(DEAD_LETTER_CHANNEL, (dl) => {
        this.deadLetterCount++;
        if (this.deadLetterCount <= this.config.maxDeadLettersLogged) {
          console.warn(
            `[actor-bonilla] Dead letter: message to ${dl.recipient.path}`,
            typeof dl.message === 'symbol' ? dl.message.toString() : dl.message
          );
        }
      });
    }
  }

  // ========================================================================
  // Actor creation — system.actorOf(props, name)
  // ========================================================================

  /**
   * Create a top-level actor under /user.
   */
  actorOf<T>(props: Props<T>, name: string): ActorRef<T> {
    if (this._isTerminated) {
      throw new Error('ActorSystem is terminated');
    }
    if (this.topLevelActors.has(name)) {
      throw new Error(`Actor "${name}" already exists at /user/${name}`);
    }

    const cell = this.createCell(this.userGuardian, props, name);
    this.topLevelActors.set(name, cell);
    cell.start();
    return cell;
  }

  /**
   * Look up an actor by path (simplified — only supports /user/name).
   */
  actorFor(path: string): ActorRef<any> | undefined {
    const parts = path.split('/').filter(Boolean);
    if (parts[0] !== 'user' || parts.length < 2) return undefined;
    return this.topLevelActors.get(parts[1]);
  }

  // ========================================================================
  // Internal — cell factory
  // ========================================================================

  /** @internal Create an ActorCell with the appropriate dispatcher. */
  createCell<T>(
    parent: ActorCell<any>,
    props: Props<T>,
    name: string
  ): ActorCell<T> {
    const dispatcher = this.getDispatcher(props.dispatcherType);
    const cell = new ActorCell<T>(
      this,
      parent,
      props,
      name,
      dispatcher,
      this.config.defaultThroughput
    );
    this.actorCount++;
    return cell;
  }

  private getDispatcher(type?: DispatcherType): Dispatcher {
    switch (type) {
      case DispatcherType.Pinned: {
        const d = new PinnedDispatcher();
        this.pinnedDispatchers.add(d);
        return d;
      }
      case DispatcherType.CallingThread:
        return new CallingThreadDispatcher();
      default:
        return this.defaultDispatcher;
    }
  }

  // ========================================================================
  // System management
  // ========================================================================

  /** Total number of actors ever created. */
  get totalActorsCreated(): number {
    return this.actorCount;
  }

  /** Total dead letters received. */
  get totalDeadLetters(): number {
    return this.deadLetterCount;
  }

  /** Whether the system has been terminated. */
  get isTerminated(): boolean {
    return this._isTerminated;
  }

  /**
   * Gracefully terminate the entire actor system.
   * Stops all actors and shuts down dispatchers.
   */
  async terminate(): Promise<void> {
    if (this._isTerminated) return;
    this._isTerminated = true;

    // Stop all top-level actors
    for (const [, cell] of this.topLevelActors) {
      cell.stop();
    }

    // Give actors a moment to process PoisonPill
    await new Promise((resolve) => setImmediate(resolve));

    // Shutdown dispatchers
    this.defaultDispatcher.shutdown();
    for (const d of this.pinnedDispatchers) {
      d.shutdown();
    }

    this.eventStream.clear();
    this.topLevelActors.clear();
  }
}
