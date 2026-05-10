import type { ActorRef, Props, ActorSystemConfig } from './types.js';
import { ActorCell } from './actor-cell.js';
import { EventStream } from './event-stream.js';
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
export declare class ActorSystem {
    readonly name: string;
    readonly eventStream: EventStream;
    private readonly defaultDispatcher;
    private readonly pinnedDispatchers;
    private readonly userGuardian;
    private readonly topLevelActors;
    private readonly config;
    private deadLetterCount;
    private actorCount;
    private _isTerminated;
    constructor(config?: ActorSystemConfig);
    /**
     * Create a top-level actor under /user.
     */
    actorOf<T>(props: Props<T>, name: string): ActorRef<T>;
    /**
     * Look up an actor by path (simplified — only supports /user/name).
     */
    actorFor(path: string): ActorRef<any> | undefined;
    /** @internal Create an ActorCell with the appropriate dispatcher. */
    createCell<T>(parent: ActorCell<any>, props: Props<T>, name: string): ActorCell<T>;
    private getDispatcher;
    /** Total number of actors ever created. */
    get totalActorsCreated(): number;
    /** Total dead letters received. */
    get totalDeadLetters(): number;
    /** Whether the system has been terminated. */
    get isTerminated(): boolean;
    /**
     * Gracefully terminate the entire actor system.
     * Stops all actors and shuts down dispatchers.
     */
    terminate(): Promise<void>;
}
