// ============================================================================
// actor-bonilla — ActorCell
// The internal engine of an actor. Manages mailbox, behavior stack,
// lifecycle, supervision, and scheduling. This is the beating heart.
// ============================================================================

import type {
  ActorRef,
  ActorContext,
  Receive,
  Props,
  Envelope,
  SupervisionStrategy,
  SupervisionDirective as SD,
  CancelToken,
  TerminatedMessage,
  DeadLetter,
  AskReplyMessage,
  LifecycleSignal,
} from './types.js';
import {
  SupervisionDirective,
  MailboxType,
  DispatcherType,
  PreStart,
  PostStop,
  PreRestart,
  PostRestart,
  Terminated,
  PoisonPill,
  Kill,
  AskReply,
} from './types.js';
import {
  UnboundedMailbox,
  BoundedMailbox,
  PriorityMailbox,
  type Mailbox,
} from './mailbox.js';
import type { Dispatcher } from './dispatcher.js';
import { DEAD_LETTER_CHANNEL, LIFECYCLE_CHANNEL } from './event-stream.js';
import type { ActorSystem } from './actor-system.js';

// Global monotonic message ID counter for ordering
let globalMessageId = 0;

/** Actor lifecycle states */
const enum ActorState {
  New,
  Started,
  Suspended,
  Stopped,
}

/**
 * ActorCell is the internal implementation behind every ActorRef.
 * It is never exposed to user code — only the ActorRef facade is visible.
 */
export class ActorCell<T = unknown> implements ActorRef<T>, ActorContext<T> {
  // Identity
  readonly path: string;
  readonly name: string;

  // Internal state
  private state: ActorState = ActorState.New;
  private currentBehavior: Receive<T>;
  private behaviorStack: Receive<T>[] = [];
  private readonly props: Props<T>;
  private readonly mailbox: Mailbox<T>;
  private readonly dispatcher: Dispatcher;
  private readonly _system: ActorSystem;
  private readonly _parent: ActorCell<any> | null;

  // Children
  private _children = new Map<string, ActorCell<any>>();

  // Watchers & watched
  private watchers = new Set<ActorCell<any>>();
  private watching = new Set<ActorCell<any>>();

  // Supervision
  private supervisionStrategy: SupervisionStrategy | null;
  private restartCount = 0;
  private restartWindowStart = 0;

  // Stash
  private stashedMessages: Envelope<T>[] = [];

  // Ask pattern
  private pendingAsks = new Map<
    number,
    {
      resolve: (value: any) => void;
      reject: (reason: any) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private askCounter = 0;

  // Scheduling
  private scheduledTimers = new Set<
    ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>
  >();

  // Processing
  private processing = false;
  private currentSender: ActorRef<any> | null = null;
  private currentEnvelope: Envelope<T> | null = null;

  // Throughput — messages per schedule run
  private readonly throughput: number;

  constructor(
    system: ActorSystem,
    parent: ActorCell<any> | null,
    props: Props<T>,
    name: string,
    dispatcher: Dispatcher,
    throughput = 32
  ) {
    this._system = system;
    this._parent = parent;
    this.props = props;
    this.name = name;
    this.path = parent ? `${parent.path}/${name}` : `/${name}`;
    this.currentBehavior = props.receive;
    this.supervisionStrategy = props.supervisionStrategy ?? null;
    this.dispatcher = dispatcher;
    this.throughput = throughput;

    // Create mailbox
    switch (props.mailboxType) {
      case MailboxType.Bounded:
        this.mailbox = new BoundedMailbox<T>(4096);
        break;
      case MailboxType.Priority:
        this.mailbox = new PriorityMailbox<T>();
        break;
      default:
        this.mailbox = new UnboundedMailbox<T>(64);
    }
  }

  // ========================================================================
  // ActorRef interface — the public-facing handle
  // ========================================================================

  /** Fire-and-forget send. */
  tell(message: T, sender: ActorRef<any> | null = null): void {
    if (this.state === ActorState.Stopped) {
      this._system.eventStream.publish<DeadLetter<T>>(DEAD_LETTER_CHANNEL, {
        message,
        sender,
        recipient: this,
      });
      return;
    }

    const envelope: Envelope<T> = {
      message,
      sender,
      timestamp: Date.now(),
      messageId: ++globalMessageId,
    };

    const enqueued = this.mailbox.enqueue(envelope);
    if (!enqueued) {
      // Bounded mailbox full — dead letter
      this._system.eventStream.publish<DeadLetter<T>>(DEAD_LETTER_CHANNEL, {
        message,
        sender,
        recipient: this,
      });
      return;
    }

    this.scheduleProcessing();
  }

  /** Request-response; returns a Promise. */
  ask<R>(message: T, timeoutMs = 5000): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      const correlationId = ++this.askCounter;

      const timer = setTimeout(() => {
        this.pendingAsks.delete(correlationId);
        reject(
          new Error(`Ask timed out after ${timeoutMs}ms for ${this.path}`)
        );
      }, timeoutMs);

      this.pendingAsks.set(correlationId, { resolve, reject, timer });

      // Create a temporary ActorRef that captures the reply
      const replyTo: ActorRef<AskReplyMessage<R>> = {
        tell: (reply: AskReplyMessage<R>) => {
          const pending = this.pendingAsks.get(correlationId);
          if (pending) {
            clearTimeout(pending.timer);
            this.pendingAsks.delete(correlationId);
            pending.resolve(reply.value);
          }
        },
        ask: () => Promise.reject(new Error('Cannot ask a reply ref')),
        path: `${this.path}/$ask-${correlationId}`,
        name: `$ask-${correlationId}`,
        stop: () => {},
      };

      // Attach the correlation ID so the receiving actor can reply
      const augmented = message as any;
      if (typeof augmented === 'object' && augmented !== null) {
        augmented.__askReplyTo = replyTo;
        augmented.__askCorrelationId = correlationId;
      }

      this.tell(message, replyTo as any);
    });
  }

  /** Stop this actor gracefully. */
  stop(): void {
    this.tell(PoisonPill as any);
  }

  // ========================================================================
  // ActorContext interface — available inside receive
  // ========================================================================

  get self(): ActorRef<T> {
    return this;
  }

  get sender(): ActorRef<any> | null {
    return this.currentSender;
  }

  get parent(): ActorRef<any> | null {
    return this._parent;
  }

  get system(): ActorSystem {
    return this._system;
  }

  get children(): ReadonlyMap<string, ActorRef<any>> {
    return this._children;
  }

  spawn<U>(props: Props<U>, name: string): ActorRef<U> {
    if (this._children.has(name)) {
      throw new Error(
        `Child actor "${name}" already exists under ${this.path}`
      );
    }
    const child = this._system.createCell(this, props, name);
    this._children.set(name, child);
    child.start();
    return child;
  }

  stopChild(child: ActorRef<any>): void {
    const cell = child as ActorCell<any>;
    if (this._children.has(cell.name)) {
      cell.terminateGracefully();
    }
  }

  // Context.stop — overloaded: stop self or stop a child
  // Supervision window and retry accounting
  contextStop(child: ActorRef<any>): void {
    this.stopChild(child);
  }

  watch(target: ActorRef<any>): void {
    const cell = target as ActorCell<any>;
    cell.watchers.add(this);
    this.watching.add(cell);
    // If already stopped, send Terminated immediately
    if (cell.state === ActorState.Stopped) {
      this.tell({ signal: Terminated, ref: target } as any);
    }
  }

  unwatch(target: ActorRef<any>): void {
    const cell = target as ActorCell<any>;
    cell.watchers.delete(this);
    this.watching.delete(cell);
  }

  become(behavior: Receive<T>, discardOld = false): void {
    if (!discardOld) {
      this.behaviorStack.push(this.currentBehavior);
    }
    this.currentBehavior = behavior;
  }

  unbecome(): void {
    const prev = this.behaviorStack.pop();
    if (prev) {
      this.currentBehavior = prev;
    }
  }

  scheduleOnce(delayMs: number, message: T): CancelToken {
    const timer = setTimeout(() => {
      this.scheduledTimers.delete(timer);
      this.tell(message);
    }, delayMs);
    this.scheduledTimers.add(timer);
    return {
      cancel: () => {
        clearTimeout(timer);
        this.scheduledTimers.delete(timer);
      },
    };
  }

  scheduleRepeatedly(intervalMs: number, message: T): CancelToken {
    const timer = setInterval(() => {
      this.tell(message);
    }, intervalMs);
    this.scheduledTimers.add(timer);
    return {
      cancel: () => {
        clearInterval(timer);
        this.scheduledTimers.delete(timer);
      },
    };
  }

  forward(target: ActorRef<any>): void {
    if (this.currentEnvelope) {
      target.tell(this.currentEnvelope.message, this.currentEnvelope.sender);
    }
  }

  setSupervisionStrategy(strategy: SupervisionStrategy): void {
    this.supervisionStrategy = strategy;
  }

  stash(): void {
    if (this.currentEnvelope) {
      this.stashedMessages.push(this.currentEnvelope);
    }
  }

  unstashAll(): void {
    const stashed = this.stashedMessages;
    this.stashedMessages = [];
    // Re-enqueue at the front by processing them before the next mailbox drain
    for (let i = stashed.length - 1; i >= 0; i--) {
      this.mailbox.enqueue(stashed[i]);
    }
    this.scheduleProcessing();
  }

  // ========================================================================
  // Lifecycle
  // ========================================================================

  start(): void {
    if (this.state !== ActorState.New) return;
    this.state = ActorState.Started;
    // Deliver PreStart
    this.invokeLifecycleHook(PreStart);
  }

  private async invokeLifecycleHook(signal: LifecycleSignal): Promise<void> {
    try {
      await this.currentBehavior(signal as any, this);
    } catch {
      // Lifecycle hooks failing is non-fatal
    }
  }

  private async terminateGracefully(): Promise<void> {
    if (this.state === ActorState.Stopped) return;

    // Stop all children first
    for (const [, child] of this._children) {
      await child.terminateGracefully();
    }

    this.state = ActorState.Stopped;

    // Invoke PostStop
    await this.invokeLifecycleHook(PostStop);

    // Clear timers
    for (const timer of this.scheduledTimers) {
      if (typeof timer === 'object' && 'unref' in timer) {
        clearTimeout(timer);
        clearInterval(timer);
      }
    }
    this.scheduledTimers.clear();

    // Cancel pending asks
    for (const [, ask] of this.pendingAsks) {
      clearTimeout(ask.timer);
      ask.reject(new Error(`Actor ${this.path} stopped`));
    }
    this.pendingAsks.clear();

    // Notify watchers
    for (const watcher of this.watchers) {
      const terminated: TerminatedMessage = { signal: Terminated, ref: this };
      watcher.tell(terminated as any);
    }
    this.watchers.clear();

    // Unwatch everything
    for (const watched of this.watching) {
      watched.watchers.delete(this);
    }
    this.watching.clear();

    // Remove from parent
    if (this._parent) {
      this._parent._children.delete(this.name);
    }

    // Drain remaining messages to dead letters
    while (!this.mailbox.isEmpty) {
      const env = this.mailbox.dequeue()!;
      this._system.eventStream.publish<DeadLetter<T>>(DEAD_LETTER_CHANNEL, {
        message: env.message,
        sender: env.sender,
        recipient: this,
      });
    }

    this._system.eventStream.publish(LIFECYCLE_CHANNEL, {
      type: 'stopped',
      path: this.path,
    });
  }

  // ========================================================================
  // Message Processing
  // ========================================================================

  private scheduleProcessing(): void {
    if (
      this.processing ||
      this.state === ActorState.Stopped ||
      this.state === ActorState.Suspended
    )
      return;
    this.processing = true;
    this.dispatcher.dispatch(() => this.processMailbox());
  }

  private processMailbox(): void {
    if (this.state === ActorState.Stopped) {
      this.processing = false;
      return;
    }

    let processed = 0;
    while (processed < this.throughput && !this.mailbox.isEmpty) {
      const envelope = this.mailbox.dequeue();
      if (!envelope) break;

      // Handle system messages first
      const msg = envelope.message;

      if (msg === PoisonPill) {
        this.terminateGracefully();
        this.processing = false;
        return;
      }

      if (msg === Kill) {
        // Kill causes ActorKilledException, escalated to supervisor
        const err = new Error(`ActorKilledException: ${this.path}`);
        this.handleFailure(err);
        this.processing = false;
        return;
      }

      this.currentSender = envelope.sender;
      this.currentEnvelope = envelope;

      try {
        const result = this.currentBehavior(msg, this);
        // Handle async behaviors
        if (result instanceof Promise) {
          result.catch((err: Error) => this.handleFailure(err));
        }
      } catch (err) {
        this.handleFailure(err as Error);
      }

      this.currentSender = null;
      this.currentEnvelope = null;
      processed++;
    }

    this.processing = false;

    // If there are more messages, re-schedule
    if (!this.mailbox.isEmpty && this.state === ActorState.Started) {
      this.scheduleProcessing();
    }
  }

  // ========================================================================
  // Supervision — failure handling
  // ========================================================================

  private handleFailure(error: Error): void {
    if (this._parent) {
      this._parent.handleChildFailure(this, error);
    } else {
      // Top-level actor — log and stop
      console.error(`[actor-bonilla] Top-level actor ${this.path} failed:`, error);
      this.terminateGracefully();
    }
  }

  handleChildFailure(child: ActorCell<any>, error: Error): void {
    const strategy = this.supervisionStrategy;
    if (!strategy) {
      // Default: restart
      this.restartChild(child);
      return;
    }

    const directive = strategy.decider(error);

    // Check retry limits
    const now = Date.now();
    if (now - this.restartWindowStart > strategy.withinMs) {
      this.restartCount = 0;
      this.restartWindowStart = now;
    }

    switch (directive) {
      case SupervisionDirective.Resume:
        child.resume();
        break;

      case SupervisionDirective.Restart:
        this.restartCount++;
        if (this.restartCount > strategy.maxRetries) {
          child.terminateGracefully();
        } else if (strategy.type === 'all-for-one') {
          for (const [, c] of this._children) {
            this.restartChild(c);
          }
        } else {
          this.restartChild(child);
        }
        break;

      case SupervisionDirective.Stop:
        child.terminateGracefully();
        break;

      case SupervisionDirective.Escalate:
        this.handleFailure(error);
        break;
    }
  }

  private restartChild(child: ActorCell<any>): void {
    child.restart();
  }

  private async restart(): Promise<void> {
    await this.invokeLifecycleHook(PreRestart);

    // Stop all children
    for (const [, child] of this._children) {
      await child.terminateGracefully();
    }
    this._children.clear();

    // Reset behavior
    this.currentBehavior = this.props.receive;
    this.behaviorStack.length = 0;

    // Clear stash
    this.stashedMessages.length = 0;

    this.state = ActorState.Started;
    await this.invokeLifecycleHook(PostRestart);
  }

  private resume(): void {
    if (this.state === ActorState.Suspended) {
      this.state = ActorState.Started;
      this.scheduleProcessing();
    }
  }

  // ========================================================================
  // Utility for reply in ask pattern
  // ========================================================================

  /**
   * Helper: if the current message was sent via `ask`, reply to it.
   * This is called from user code via the context.
   */
  static reply<R>(context: ActorContext<any>, value: R): void {
    const msg = (context as any).currentEnvelope?.message;
    if (msg && typeof msg === 'object' && msg.__askReplyTo) {
      const replyTo = msg.__askReplyTo as ActorRef<AskReplyMessage<R>>;
      const reply: AskReplyMessage<R> = {
        signal: AskReply,
        correlationId: msg.__askCorrelationId,
        value,
      };
      replyTo.tell(reply);
    } else if (context.sender) {
      // Fallback: tell sender directly
      context.sender.tell(value as any);
    }
  }

  // Expose mailbox size for router
  get mailboxSize(): number {
    return this.mailbox.size;
  }
}
