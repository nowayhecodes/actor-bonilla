// ============================================================================
// actor-bonilla — ActorCell
// The internal engine of an actor. Manages mailbox, behavior stack,
// lifecycle, supervision, and scheduling. This is the beating heart.
// ============================================================================
import { SupervisionDirective, MailboxType, PreStart, PostStop, PreRestart, PostRestart, Terminated, PoisonPill, Kill, AskReply } from './types.js';
import { UnboundedMailbox, BoundedMailbox, PriorityMailbox } from './mailbox.js';
import { DEAD_LETTER_CHANNEL, LIFECYCLE_CHANNEL } from './event-stream.js';
// Global monotonic message ID counter for ordering
let globalMessageId = 0;
/**
 * ActorCell is the internal implementation behind every ActorRef.
 * It is never exposed to user code — only the ActorRef facade is visible.
 */ export class ActorCell {
    // Identity
    path;
    name;
    // Internal state
    state = 0;
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
    constructor(system, parent, props, name, dispatcher, throughput = 32){
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
        switch(props.mailboxType){
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
    /** Fire-and-forget send. */ tell(message, sender = null) {
        if (this.state === 3) {
            this._system.eventStream.publish(DEAD_LETTER_CHANNEL, {
                message,
                sender,
                recipient: this
            });
            return;
        }
        const envelope = {
            message,
            sender,
            timestamp: Date.now(),
            messageId: ++globalMessageId
        };
        const enqueued = this.mailbox.enqueue(envelope);
        if (!enqueued) {
            // Bounded mailbox full — dead letter
            this._system.eventStream.publish(DEAD_LETTER_CHANNEL, {
                message,
                sender,
                recipient: this
            });
            return;
        }
        this.scheduleProcessing();
    }
    /** Request-response; returns a Promise. */ ask(message, timeoutMs = 5000) {
        return new Promise((resolve, reject)=>{
            const correlationId = ++this.askCounter;
            const timer = setTimeout(()=>{
                this.pendingAsks.delete(correlationId);
                reject(new Error(`Ask timed out after ${timeoutMs}ms for ${this.path}`));
            }, timeoutMs);
            this.pendingAsks.set(correlationId, {
                resolve,
                reject,
                timer
            });
            // Create a temporary ActorRef that captures the reply
            const replyTo = {
                tell: (reply)=>{
                    const pending = this.pendingAsks.get(correlationId);
                    if (pending) {
                        clearTimeout(pending.timer);
                        this.pendingAsks.delete(correlationId);
                        pending.resolve(reply.value);
                    }
                },
                ask: ()=>Promise.reject(new Error('Cannot ask a reply ref')),
                path: `${this.path}/$ask-${correlationId}`,
                name: `$ask-${correlationId}`,
                stop: ()=>{}
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
    /** Stop this actor gracefully. */ stop() {
        this.tell(PoisonPill);
    }
    // ========================================================================
    // ActorContext interface — available inside receive
    // ========================================================================
    get self() {
        return this;
    }
    get sender() {
        return this.currentSender;
    }
    get parent() {
        return this._parent;
    }
    get system() {
        return this._system;
    }
    get children() {
        return this._children;
    }
    spawn(props, name) {
        if (this._children.has(name)) {
            throw new Error(`Child actor "${name}" already exists under ${this.path}`);
        }
        const child = this._system.createCell(this, props, name);
        this._children.set(name, child);
        child.start();
        return child;
    }
    stopChild(child) {
        const cell = child;
        if (this._children.has(cell.name)) {
            cell.terminateGracefully();
        }
    }
    // Context.stop — overloaded: stop self or stop a child
    // Supervision window and retry accounting
    contextStop(child) {
        this.stopChild(child);
    }
    watch(target) {
        const cell = target;
        cell.watchers.add(this);
        this.watching.add(cell);
        // If already stopped, send Terminated immediately
        if (cell.state === 3) {
            this.tell({
                signal: Terminated,
                ref: target
            });
        }
    }
    unwatch(target) {
        const cell = target;
        cell.watchers.delete(this);
        this.watching.delete(cell);
    }
    become(behavior, discardOld = false) {
        if (!discardOld) {
            this.behaviorStack.push(this.currentBehavior);
        }
        this.currentBehavior = behavior;
    }
    unbecome() {
        const prev = this.behaviorStack.pop();
        if (prev) {
            this.currentBehavior = prev;
        }
    }
    scheduleOnce(delayMs, message) {
        const timer = setTimeout(()=>{
            this.scheduledTimers.delete(timer);
            this.tell(message);
        }, delayMs);
        this.scheduledTimers.add(timer);
        return {
            cancel: ()=>{
                clearTimeout(timer);
                this.scheduledTimers.delete(timer);
            }
        };
    }
    scheduleRepeatedly(intervalMs, message) {
        const timer = setInterval(()=>{
            this.tell(message);
        }, intervalMs);
        this.scheduledTimers.add(timer);
        return {
            cancel: ()=>{
                clearInterval(timer);
                this.scheduledTimers.delete(timer);
            }
        };
    }
    forward(target) {
        if (this.currentEnvelope) {
            target.tell(this.currentEnvelope.message, this.currentEnvelope.sender);
        }
    }
    setSupervisionStrategy(strategy) {
        this.supervisionStrategy = strategy;
    }
    stash() {
        if (this.currentEnvelope) {
            this.stashedMessages.push(this.currentEnvelope);
        }
    }
    unstashAll() {
        const stashed = this.stashedMessages;
        this.stashedMessages = [];
        // Re-enqueue at the front by processing them before the next mailbox drain
        for(let i = stashed.length - 1; i >= 0; i--){
            this.mailbox.enqueue(stashed[i]);
        }
        this.scheduleProcessing();
    }
    // ========================================================================
    // Lifecycle
    // ========================================================================
    start() {
        if (this.state !== 0) return;
        this.state = 1;
        // Deliver PreStart
        this.invokeLifecycleHook(PreStart);
    }
    async invokeLifecycleHook(signal) {
        try {
            await this.currentBehavior(signal, this);
        } catch  {
        // Lifecycle hooks failing is non-fatal
        }
    }
    async terminateGracefully() {
        if (this.state === 3) return;
        // Stop all children first
        for (const [, child] of this._children){
            await child.terminateGracefully();
        }
        this.state = 3;
        // Invoke PostStop
        await this.invokeLifecycleHook(PostStop);
        // Clear timers
        for (const timer of this.scheduledTimers){
            if (typeof timer === 'object' && 'unref' in timer) {
                clearTimeout(timer);
                clearInterval(timer);
            }
        }
        this.scheduledTimers.clear();
        // Cancel pending asks
        for (const [, ask] of this.pendingAsks){
            clearTimeout(ask.timer);
            ask.reject(new Error(`Actor ${this.path} stopped`));
        }
        this.pendingAsks.clear();
        // Notify watchers
        for (const watcher of this.watchers){
            const terminated = {
                signal: Terminated,
                ref: this
            };
            watcher.tell(terminated);
        }
        this.watchers.clear();
        // Unwatch everything
        for (const watched of this.watching){
            watched.watchers.delete(this);
        }
        this.watching.clear();
        // Remove from parent
        if (this._parent) {
            this._parent._children.delete(this.name);
        }
        // Drain remaining messages to dead letters
        while(!this.mailbox.isEmpty){
            const env = this.mailbox.dequeue();
            this._system.eventStream.publish(DEAD_LETTER_CHANNEL, {
                message: env.message,
                sender: env.sender,
                recipient: this
            });
        }
        this._system.eventStream.publish(LIFECYCLE_CHANNEL, {
            type: 'stopped',
            path: this.path
        });
    }
    // ========================================================================
    // Message Processing
    // ========================================================================
    scheduleProcessing() {
        if (this.processing || this.state === 3 || this.state === 2) return;
        this.processing = true;
        this.dispatcher.dispatch(()=>this.processMailbox());
    }
    processMailbox() {
        if (this.state === 3) {
            this.processing = false;
            return;
        }
        let processed = 0;
        while(processed < this.throughput && !this.mailbox.isEmpty){
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
                    result.catch((err)=>this.handleFailure(err));
                }
            } catch (err) {
                this.handleFailure(err);
            }
            this.currentSender = null;
            this.currentEnvelope = null;
            processed++;
        }
        this.processing = false;
        // If there are more messages, re-schedule
        if (!this.mailbox.isEmpty && this.state === 1) {
            this.scheduleProcessing();
        }
    }
    // ========================================================================
    // Supervision — failure handling
    // ========================================================================
    handleFailure(error) {
        if (this._parent) {
            this._parent.handleChildFailure(this, error);
        } else {
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
        switch(directive){
            case SupervisionDirective.Resume:
                child.resume();
                break;
            case SupervisionDirective.Restart:
                this.restartCount++;
                if (this.restartCount > strategy.maxRetries) {
                    child.terminateGracefully();
                } else if (strategy.type === 'all-for-one') {
                    for (const [, c] of this._children){
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
    restartChild(child) {
        child.restart();
    }
    async restart() {
        await this.invokeLifecycleHook(PreRestart);
        // Stop all children
        for (const [, child] of this._children){
            await child.terminateGracefully();
        }
        this._children.clear();
        // Reset behavior
        this.currentBehavior = this.props.receive;
        this.behaviorStack.length = 0;
        // Clear stash
        this.stashedMessages.length = 0;
        this.state = 1;
        await this.invokeLifecycleHook(PostRestart);
    }
    resume() {
        if (this.state === 2) {
            this.state = 1;
            this.scheduleProcessing();
        }
    }
    // ========================================================================
    // Utility for reply in ask pattern
    // ========================================================================
    /**
   * Helper: if the current message was sent via `ask`, reply to it.
   * This is called from user code via the context.
   */ static reply(context, value) {
        const msg = context.currentEnvelope?.message;
        if (msg && typeof msg === 'object' && msg.__askReplyTo) {
            const replyTo = msg.__askReplyTo;
            const reply = {
                signal: AskReply,
                correlationId: msg.__askCorrelationId,
                value
            };
            replyTo.tell(reply);
        } else if (context.sender) {
            // Fallback: tell sender directly
            context.sender.tell(value);
        }
    }
    // Expose mailbox size for router
    get mailboxSize() {
        return this.mailbox.size;
    }
}
