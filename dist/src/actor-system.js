// ============================================================================
// actor-bonilla — ActorSystem
// The top-level container for all actors.
// ============================================================================
import { DispatcherType } from './types.js';
import { ActorCell } from './actor-cell.js';
import { DefaultDispatcher, PinnedDispatcher, CallingThreadDispatcher } from './dispatcher.js';
import { EventStream, DEAD_LETTER_CHANNEL } from './event-stream.js';
/**
 * ActorSystem is the root of the actor hierarchy.
 * All actors are created through the system.
 *
 * Hierarchy:
 *   /            — root guardian
 *   /system      — system actors (dead letters, logging)
 *   /user        — user-created actors
 *   /deadLetters — dead letter actor
 */ export class ActorSystem {
    name;
    eventStream;
    // Dispatchers
    defaultDispatcher;
    pinnedDispatchers = new Set();
    // Actor tree
    userGuardian;
    topLevelActors = new Map();
    // Config
    config;
    // Stats
    deadLetterCount = 0;
    actorCount = 0;
    // Shutdown
    _isTerminated = false;
    constructor(config = {}){
        this.config = {
            name: config.name ?? 'actor-bonilla-system',
            defaultThroughput: config.defaultThroughput ?? 32,
            logDeadLetters: config.logDeadLetters ?? true,
            maxDeadLettersLogged: config.maxDeadLettersLogged ?? 100
        };
        this.name = this.config.name;
        this.eventStream = new EventStream();
        this.defaultDispatcher = new DefaultDispatcher(this.config.defaultThroughput);
        // Create user guardian (virtual root for /user/*)
        this.userGuardian = new ActorCell(this, null, {
            receive: ()=>{}
        }, 'user', this.defaultDispatcher, this.config.defaultThroughput);
        // Subscribe to dead letters
        if (this.config.logDeadLetters) {
            this.eventStream.subscribe(DEAD_LETTER_CHANNEL, (dl)=>{
                this.deadLetterCount++;
                if (this.deadLetterCount <= this.config.maxDeadLettersLogged) {
                    console.warn(`[actor-bonilla] Dead letter: message to ${dl.recipient.path}`, typeof dl.message === 'symbol' ? dl.message.toString() : dl.message);
                }
            });
        }
    }
    // ========================================================================
    // Actor creation — system.actorOf(props, name)
    // ========================================================================
    /**
   * Create a top-level actor under /user.
   */ actorOf(props, name) {
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
   */ actorFor(path) {
        const parts = path.split('/').filter(Boolean);
        if (parts[0] !== 'user' || parts.length < 2) return undefined;
        return this.topLevelActors.get(parts[1]);
    }
    // ========================================================================
    // Internal — cell factory
    // ========================================================================
    /** @internal Create an ActorCell with the appropriate dispatcher. */ createCell(parent, props, name) {
        const dispatcher = this.getDispatcher(props.dispatcherType);
        const cell = new ActorCell(this, parent, props, name, dispatcher, this.config.defaultThroughput);
        this.actorCount++;
        return cell;
    }
    getDispatcher(type) {
        switch(type){
            case DispatcherType.Pinned:
                {
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
    /** Total number of actors ever created. */ get totalActorsCreated() {
        return this.actorCount;
    }
    /** Total dead letters received. */ get totalDeadLetters() {
        return this.deadLetterCount;
    }
    /** Whether the system has been terminated. */ get isTerminated() {
        return this._isTerminated;
    }
    /**
   * Gracefully terminate the entire actor system.
   * Stops all actors and shuts down dispatchers.
   */ async terminate() {
        if (this._isTerminated) return;
        this._isTerminated = true;
        // Stop all top-level actors
        for (const [, cell] of this.topLevelActors){
            cell.stop();
        }
        // Give actors a moment to process PoisonPill
        await new Promise((resolve)=>setImmediate(resolve));
        // Shutdown dispatchers
        this.defaultDispatcher.shutdown();
        for (const d of this.pinnedDispatchers){
            d.shutdown();
        }
        this.eventStream.clear();
        this.topLevelActors.clear();
    }
}
