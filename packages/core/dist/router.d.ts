import type { ActorRef, RouterConfig, ActorContext } from './types.js';
/**
 * Router distributes incoming messages to a pool of routee actors.
 * Supports round-robin, random, broadcast, smallest-mailbox,
 * and consistent-hash strategies.
 */
export declare class Router<T = unknown> {
    private readonly config;
    private readonly context;
    private routees;
    private roundRobinIndex;
    private readonly strategy;
    constructor(config: RouterConfig, context: ActorContext<any>);
    /**
     * Route a message according to the configured strategy.
     */
    route(message: T, sender?: ActorRef<any>): void;
    /** Get all routees. */
    getRoutees(): readonly ActorRef<T>[];
    /** Add a routee dynamically. */
    addRoutee(routee: ActorRef<T>): void;
    /** Remove a routee dynamically. */
    removeRoutee(routee: ActorRef<T>): void;
    private roundRobin;
    private random;
    private smallestMailbox;
    private broadcast;
    private consistentHash;
}
