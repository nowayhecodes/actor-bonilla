// ============================================================================
// actor-bonilla — Router
// Distributes messages across a pool
// of routee actors using configurable strategies.
// ============================================================================
import { RoutingStrategy } from './types.js';
/**
 * Router distributes incoming messages to a pool of routee actors.
 * Supports round-robin, random, broadcast, smallest-mailbox,
 * and consistent-hash strategies.
 */ export class Router {
    config;
    context;
    routees = [];
    roundRobinIndex = 0;
    strategy;
    constructor(config, context){
        this.config = config;
        this.context = context;
        this.strategy = config.strategy;
        // Create the routee pool
        for(let i = 0; i < config.nrOfInstances; i++){
            const name = `$routee-${i}`;
            const routee = context.spawn(config.props, name);
            this.routees.push(routee);
        }
    }
    /**
   * Route a message according to the configured strategy.
   */ route(message, sender) {
        if (this.routees.length === 0) return;
        switch(this.strategy){
            case RoutingStrategy.RoundRobin:
                this.roundRobin(message, sender);
                break;
            case RoutingStrategy.Random:
                this.random(message, sender);
                break;
            case RoutingStrategy.SmallestMailbox:
                this.smallestMailbox(message, sender);
                break;
            case RoutingStrategy.Broadcast:
                this.broadcast(message, sender);
                break;
            case RoutingStrategy.ConsistentHash:
                this.consistentHash(message, sender);
                break;
        }
    }
    /** Get all routees. */ getRoutees() {
        return this.routees;
    }
    /** Add a routee dynamically. */ addRoutee(routee) {
        this.routees.push(routee);
    }
    /** Remove a routee dynamically. */ removeRoutee(routee) {
        const idx = this.routees.indexOf(routee);
        if (idx !== -1) this.routees.splice(idx, 1);
    }
    // ---------- Strategies ----------
    roundRobin(message, sender) {
        const target = this.routees[this.roundRobinIndex % this.routees.length];
        this.roundRobinIndex++;
        target.tell(message, sender);
    }
    random(message, sender) {
        const idx = Math.random() * this.routees.length | 0;
        this.routees[idx].tell(message, sender);
    }
    smallestMailbox(message, sender) {
        let min = Infinity;
        let target = this.routees[0];
        for (const routee of this.routees){
            const size = routee.mailboxSize ?? 0;
            if (size < min) {
                min = size;
                target = routee;
            }
        }
        target.tell(message, sender);
    }
    broadcast(message, sender) {
        for (const routee of this.routees){
            routee.tell(message, sender);
        }
    }
    consistentHash(message, sender) {
        // Simple consistent hashing — use message's hashKey if available,
        // otherwise hash the stringified message
        const key = typeof message === 'object' && message !== null && 'hashKey' in message ? String(message.hashKey) : String(message);
        const hash = fnv1a(key);
        const idx = hash % this.routees.length;
        this.routees[idx].tell(message, sender);
    }
}
/**
 * FNV-1a hash — fast, simple, good distribution.
 */ function fnv1a(str) {
    let hash = 0x811c9dc5;
    for(let i = 0; i < str.length; i++){
        hash ^= str.charCodeAt(i);
        hash = hash * 0x01000193 >>> 0;
    }
    return hash;
}
