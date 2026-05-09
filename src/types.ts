// ============================================================================
// Actor Bonilla - Core Types
// ============================================================================

/**
 * Envelope wraps every message with metadata for routing, dead-letter
 * handling, and sender tracking.
 */
export interface Envelope<T = unknown> {
  readonly message: T;
  readonly sender: ActorRef<any> | null;
  readonly timestamp: number;
  readonly messageId: number;
}

/**
 * An ActorRef is a location-transparent handle to an actor.
 * It never exposes the actor's internals — only allows sending messages.
 */
export interface ActorRef<T = unknown> {
  /** Send a message (fire-and-forget). */
  tell(message: T, sender?: ActorRef<any> | null): void;
  /** Send a message and receive a Promise with the reply. */
  ask<R>(message: T, timeoutMs?: number): Promise<R>;
  /** The hierarchical path of this actor, e.g. "/user/parent/child". */
  readonly path: string;
  /** The actor's simple name. */
  readonly name: string;
  /** Stop the actor gracefully. */
  stop(): void;
}

/**
 * The ActorContext is available inside an actor's receive function.
 * It provides the actor's identity, ability to create children, access
 * the system, change behavior, set timers, and supervise.
 */
export interface ActorContext<T = unknown> {
  readonly self: ActorRef<T>;
  readonly sender: ActorRef<any> | null;
  readonly parent: ActorRef<any> | null;
  readonly system: any; // ActorSystem (forward ref)
  readonly children: ReadonlyMap<string, ActorRef<any>>;

  /** Spawn a child actor. */
  spawn<U>(props: Props<U>, name: string): ActorRef<U>;

  /** Stop a child actor. */
  stop(child: ActorRef<any>): void;

  /** Watch another actor for termination. */
  watch(target: ActorRef<any>): void;

  /** Unwatch a previously watched actor. */
  unwatch(target: ActorRef<any>): void;

  /** Hot-swap behavior. */
  become(behavior: Receive<T>, discardOld?: boolean): void;

  /** Revert to previous behavior. */
  unbecome(): void;

  /** Schedule a message to self after a delay. */
  scheduleOnce(delayMs: number, message: T): CancelToken;

  /** Schedule a repeating message to self. */
  scheduleRepeatedly(intervalMs: number, message: T): CancelToken;

  /** Forward current message to another actor, preserving original sender. */
  forward(target: ActorRef<any>): void;

  /** Set the supervision strategy for children. */
  setSupervisionStrategy(strategy: SupervisionStrategy): void;

  /** Stash the current message for later processing. */
  stash(): void;

  /** Unstash all previously stashed messages. */
  unstashAll(): void;
}

/** A receive function processes a single message. */
export type Receive<T> = (
  message: T,
  context: ActorContext<T>
) => void | Promise<void>;

/** Props define how to create an actor (factory description). */
export interface Props<T> {
  /** The receive function (behavior). */
  receive: Receive<T>;
  /** Optional supervision strategy applied to this actor's children. */
  supervisionStrategy?: SupervisionStrategy;
  /** Optional mailbox type. */
  mailboxType?: MailboxType;
  /** Optional dispatcher type. */
  dispatcherType?: DispatcherType;
}

/** Convenience factory for Props. */
export function props<T>(
  receive: Receive<T>,
  options?: Partial<Omit<Props<T>, 'receive'>>
): Props<T> {
  return { receive, ...options };
}

// ============================================================================
// Supervision (one-for-one / all-for-one strategies)
// ============================================================================

export enum SupervisionDirective {
  Resume = 'resume',
  Restart = 'restart',
  Stop = 'stop',
  Escalate = 'escalate',
}

export interface SupervisionStrategy {
  readonly type: 'one-for-one' | 'all-for-one';
  readonly maxRetries: number;
  readonly withinMs: number;
  readonly decider: (error: Error) => SupervisionDirective;
}

export function oneForOneStrategy(
  maxRetries: number,
  withinMs: number,
  decider: (error: Error) => SupervisionDirective
): SupervisionStrategy {
  return { type: 'one-for-one', maxRetries, withinMs, decider };
}

export function allForOneStrategy(
  maxRetries: number,
  withinMs: number,
  decider: (error: Error) => SupervisionDirective
): SupervisionStrategy {
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

export interface TerminatedMessage {
  readonly signal: typeof Terminated;
  readonly ref: ActorRef<any>;
}

export type LifecycleSignal =
  | typeof PreStart
  | typeof PostStop
  | typeof PreRestart
  | typeof PostRestart;

// ============================================================================
// Mailbox & Dispatcher types
// ============================================================================

export enum MailboxType {
  Default = 'default', // Unbounded FIFO
  Bounded = 'bounded', // Bounded with backpressure
  Priority = 'priority', // Priority queue
}

export enum DispatcherType {
  Default = 'default', // Shared microtask dispatcher
  Pinned = 'pinned', // Dedicated processing (for blocking actors)
  CallingThread = 'calling-thread', // Execute in caller's context
}

export interface CancelToken {
  cancel(): void;
}

// ============================================================================
// Event bus / pub-sub types
// ============================================================================

export type EventClassifier = string | symbol;
export type EventSubscriber<T = unknown> = (event: T) => void;

// ============================================================================
// Router types
// ============================================================================

export enum RoutingStrategy {
  RoundRobin = 'round-robin',
  Random = 'random',
  SmallestMailbox = 'smallest-mailbox',
  Broadcast = 'broadcast',
  ConsistentHash = 'consistent-hash',
}

export interface RouterConfig {
  readonly strategy: RoutingStrategy;
  readonly nrOfInstances: number;
  readonly props: Props<any>;
}

// ============================================================================
// Ask pattern types
// ============================================================================

export const AskReply = Symbol.for('actor-bonilla.AskReply');

export interface AskReplyMessage<R = unknown> {
  readonly signal: typeof AskReply;
  readonly correlationId: number;
  readonly value: R;
}

// ============================================================================
// Dead Letter
// ============================================================================

export interface DeadLetter<T = unknown> {
  readonly message: T;
  readonly sender: ActorRef<any> | null;
  readonly recipient: ActorRef<any>;
}
