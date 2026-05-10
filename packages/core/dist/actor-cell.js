import { SupervisionDirective, MailboxType, PreStart, PostStop, PreRestart, PostRestart, Terminated, PoisonPill, Kill, AskReply, } from './types.js';
import { UnboundedMailbox, BoundedMailbox, PriorityMailbox, } from './mailbox.js';
import { DEAD_LETTER_CHANNEL, LIFECYCLE_CHANNEL } from './event-stream.js';
import { assertSupervisionStrategy } from './validation.js';
// Global monotonic message ID counter for ordering
let globalMessageId = 0;
/** Actor lifecycle states */
var ActorState;
(function (ActorState) {
    ActorState[ActorState["New"] = 0] = "New";
    ActorState[ActorState["Started"] = 1] = "Started";
    ActorState[ActorState["Suspended"] = 2] = "Suspended";
    ActorState[ActorState["Stopped"] = 3] = "Stopped";
})(ActorState || (ActorState = {}));
/**
 * ActorCell is the internal implementation behind every ActorRef.
 * It is never exposed to user code — only the ActorRef facade is visible.
 */
export class ActorCell {
    // Identity
    path;
    name;
    // Internal state
    state = ActorState.New;
    currentBehavior;
    behaviorStack = [];
    props;
    mailbox;
    dispatcher;
    _system;
    _parent;
    // Children
    _children = new Map();
    // Watchers & watched
    watchers = new Set();
    watching = new Set();
    // Supervision
    supervisionStrategy;
    restartCount = 0;
    restartWindowStart = 0;
    // Stash
    stashedMessages = [];
    // Ask pattern
    pendingAsks = new Map();
    askCounter = 0;
    // Scheduling
    scheduledTimers = new Set();
    // Processing
    processing = false;
    currentSender = null;
    currentEnvelope = null;
    // Throughput — messages per schedule run
    throughput;
    /**
     * @internal Created by `ActorSystem.createCell` — not part of the public API.
     * @param system     The owning ActorSystem.
     * @param parent     The parent ActorCell (null for top-level actors under /user).
     * @param props      Actor configuration: behavior, mailbox type, dispatcher type, supervision.
     * @param name       Simple actor name; combined with the parent path to form the full path.
     * @param dispatcher Scheduler that drives mailbox processing.
     * @param throughput Maximum messages processed per scheduling run before yielding.
     */
    constructor(system, parent, props, name, dispatcher, throughput = 32) {
        this._system = system;
        this._parent = parent;
        this.props = props;
        this.name = name;
        this.path = parent ? `${parent.path}/${name}` : `/${name}`;
        this.currentBehavior = props.receive;
        if (props.supervisionStrategy !== undefined) {
            assertSupervisionStrategy(props.supervisionStrategy);
        }
        this.supervisionStrategy = props.supervisionStrategy ?? null;
        this.dispatcher = dispatcher;
        this.throughput = throughput;
        // Create mailbox
        switch (props.mailboxType) {
            case MailboxType.Bounded:
                this.mailbox = new BoundedMailbox(4096);
                break;
            case MailboxType.Priority:
                this.mailbox = new PriorityMailbox();
                break;
            default:
                this.mailbox = new UnboundedMailbox(64);
        }
    }
    // ========================================================================
    // ActorRef interface — the public-facing handle
    // ========================================================================
    /**
     * Fire-and-forget message delivery. The call returns immediately.
     * If the actor is already stopped the message is routed to the dead-letter channel.
     * If the mailbox is full (BoundedMailbox) the message is also dead-lettered.
     */
    tell(message, sender = null) {
        if (this.state === ActorState.Stopped) {
            this._system.eventStream.publish(DEAD_LETTER_CHANNEL, {
                message,
                sender,
                recipient: this,
            });
            return;
        }
        const envelope = {
            message,
            sender,
            timestamp: Date.now(),
            messageId: ++globalMessageId,
        };
        const enqueued = this.mailbox.enqueue(envelope);
        if (!enqueued) {
            // Bounded mailbox full — dead letter
            this._system.eventStream.publish(DEAD_LETTER_CHANNEL, {
                message,
                sender,
                recipient: this,
            });
            return;
        }
        this.scheduleProcessing();
    }
    /**
     * Send a message and await a typed reply.
     * The receiving actor replies by calling `ActorCell.reply(context, value)`.
     * @param message   Message to deliver.
     * @param timeoutMs Milliseconds to wait for a reply (default 5 000 ms).
     * @throws After `timeoutMs` with no reply, the returned Promise rejects.
     */
    ask(message, timeoutMs = 5000) {
        return new Promise((resolve, reject) => {
            const correlationId = ++this.askCounter;
            const timer = setTimeout(() => {
                this.pendingAsks.delete(correlationId);
                reject(new Error(`Ask timed out after ${timeoutMs}ms for ${this.path}`));
            }, timeoutMs);
            this.pendingAsks.set(correlationId, { resolve, reject, timer });
            // Create a temporary ActorRef that captures the reply
            const replyTo = {
                tell: (reply) => {
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
                stop: () => { },
            };
            // Attach the correlation ID so the receiving actor can reply
            const augmented = message;
            if (typeof augmented === 'object' && augmented !== null) {
                augmented.__askReplyTo = replyTo;
                augmented.__askCorrelationId = correlationId;
            }
            this.tell(message, replyTo);
        });
    }
    /**
     * Request graceful termination by sending a PoisonPill message.
     * The actor processes any messages already in its mailbox before stopping.
     */
    stop() {
        this.tell(PoisonPill);
    }
    // ========================================================================
    // ActorContext interface — available inside receive
    // ========================================================================
    /** The ActorRef handle for this actor itself. */
    get self() {
        return this;
    }
    /** The sender of the currently processed message, or `null` outside a receive call. */
    get sender() {
        return this.currentSender;
    }
    /** The parent ActorRef, or `null` for top-level actors directly under /user. */
    get parent() {
        return this._parent;
    }
    /** @internal The owning ActorSystem (typed as `any` to break the forward-reference cycle). */
    get system() {
        return this._system;
    }
    /** Read-only snapshot of all live child actors, keyed by their simple names. */
    get children() {
        return this._children;
    }
    /**
     * Spawn a new child actor with the given props and name.
     * The child is started immediately and appears in `children`.
     * @throws If a child with the same name already exists under this actor.
     */
    spawn(props, name) {
        if (this._children.has(name)) {
            throw new Error(`Child actor "${name}" already exists under ${this.path}`);
        }
        const child = this._system.createCell(this, props, name);
        this._children.set(name, child);
        child.start();
        return child;
    }
    /** Gracefully stop a direct child actor. No-op if the child is not known. */
    stopChild(child) {
        const cell = child;
        if (this._children.has(cell.name)) {
            cell.terminateGracefully();
        }
    }
    /** Implements `ActorContext.stop(child)` — delegates to `stopChild`. */
    contextStop(child) {
        this.stopChild(child);
    }
    /**
     * Register a DeathWatch on `target`.
     * A `TerminatedMessage` is delivered to this actor when `target` stops.
     * If `target` is already stopped the message is delivered immediately.
     */
    watch(target) {
        const cell = target;
        cell.watchers.add(this);
        this.watching.add(cell);
        // If already stopped, send Terminated immediately
        if (cell.state === ActorState.Stopped) {
            this.tell({ signal: Terminated, ref: target });
        }
    }
    /** Remove the DeathWatch on a previously watched actor. */
    unwatch(target) {
        const cell = target;
        cell.watchers.delete(this);
        this.watching.delete(cell);
    }
    /**
     * Hot-swap the current receive function.
     * @param behavior   New receive function to install.
     * @param discardOld When `true` the current behavior is dropped; when `false`
     *                   it is pushed onto the stack and can be restored with `unbecome()`.
     */
    become(behavior, discardOld = false) {
        if (!discardOld) {
            this.behaviorStack.push(this.currentBehavior);
        }
        this.currentBehavior = behavior;
    }
    /** Revert to the previous behavior by popping the behavior stack. No-op when the stack is empty. */
    unbecome() {
        const prev = this.behaviorStack.pop();
        if (prev) {
            this.currentBehavior = prev;
        }
    }
    /**
     * Schedule a single message delivery to self after `delayMs` milliseconds.
     * @returns A `CancelToken` whose `cancel()` aborts the delivery if not yet fired.
     */
    scheduleOnce(delayMs, message) {
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
    /**
     * Schedule a repeating message delivery to self every `intervalMs` milliseconds.
     * @returns A `CancelToken` whose `cancel()` stops the interval.
     */
    scheduleRepeatedly(intervalMs, message) {
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
    /**
     * Forward the current in-flight message to `target`, preserving the original sender.
     * No-op when called outside a receive invocation.
     */
    forward(target) {
        if (this.currentEnvelope) {
            target.tell(this.currentEnvelope.message, this.currentEnvelope.sender);
        }
    }
    /**
     * Replace the supervision strategy applied to this actor's children.
     * The strategy is validated at runtime (Typia) before being stored.
     */
    setSupervisionStrategy(strategy) {
        assertSupervisionStrategy(strategy);
        this.supervisionStrategy = strategy;
    }
    /**
     * Stash the current in-flight message for later reprocessing.
     * No-op when called outside a receive invocation.
     */
    stash() {
        if (this.currentEnvelope) {
            this.stashedMessages.push(this.currentEnvelope);
        }
    }
    /**
     * Re-enqueue all previously stashed messages at the front of the mailbox
     * and trigger mailbox processing.
     */
    unstashAll() {
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
    /** @internal Transition to the Started state and deliver the PreStart lifecycle signal. */
    start() {
        if (this.state !== ActorState.New)
            return;
        this.state = ActorState.Started;
        // Deliver PreStart
        this.invokeLifecycleHook(PreStart);
    }
    async invokeLifecycleHook(signal) {
        try {
            await this.currentBehavior(signal, this);
        }
        catch {
            // Lifecycle hooks failing is non-fatal
        }
    }
    async terminateGracefully() {
        if (this.state === ActorState.Stopped)
            return;
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
            const terminated = { signal: Terminated, ref: this };
            watcher.tell(terminated);
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
            const env = this.mailbox.dequeue();
            this._system.eventStream.publish(DEAD_LETTER_CHANNEL, {
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
    scheduleProcessing() {
        if (this.processing ||
            this.state === ActorState.Stopped ||
            this.state === ActorState.Suspended)
            return;
        this.processing = true;
        this.dispatcher.dispatch(() => this.processMailbox());
    }
    processMailbox() {
        if (this.state === ActorState.Stopped) {
            this.processing = false;
            return;
        }
        let processed = 0;
        while (processed < this.throughput && !this.mailbox.isEmpty) {
            const envelope = this.mailbox.dequeue();
            if (!envelope)
                break;
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
                    result.catch((err) => this.handleFailure(err));
                }
            }
            catch (err) {
                this.handleFailure(err);
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
    handleFailure(error) {
        if (this._parent) {
            this._parent.handleChildFailure(this, error);
        }
        else {
            // Top-level actor — log and stop
            console.error(`[actor-bonilla] Top-level actor ${this.path} failed:`, error);
            this.terminateGracefully();
        }
    }
    handleChildFailure(child, error) {
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
                }
                else if (strategy.type === 'all-for-one') {
                    for (const [, c] of this._children) {
                        this.restartChild(c);
                    }
                }
                else {
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
    restartChild(child) {
        child.restart();
    }
    async restart() {
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
    resume() {
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
    static reply(context, value) {
        const msg = context.currentEnvelope?.message;
        if (msg && typeof msg === 'object' && msg.__askReplyTo) {
            const replyTo = msg.__askReplyTo;
            const reply = {
                signal: AskReply,
                correlationId: msg.__askCorrelationId,
                value,
            };
            replyTo.tell(reply);
        }
        else if (context.sender) {
            // Fallback: tell sender directly
            context.sender.tell(value);
        }
    }
    /** @internal Current mailbox depth — read by the SmallestMailbox router strategy. */
    get mailboxSize() {
        return this.mailbox.size;
    }
}
//# sourceMappingURL=actor-cell.js.map