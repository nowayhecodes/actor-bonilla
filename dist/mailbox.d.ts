import type { Envelope } from './types.js';
/**
 * Mailbox interface — all mailbox types implement this.
 */
export interface Mailbox<T = unknown> {
    enqueue(envelope: Envelope<T>): boolean;
    dequeue(): Envelope<T> | undefined;
    readonly size: number;
    readonly isEmpty: boolean;
    clear(): void;
}
/**
 * Lock-free unbounded FIFO queue backed by a growable ring buffer.
 * Amortized O(1) enqueue/dequeue. Grows by doubling, never shrinks
 * to avoid repeated allocations.
 */
export declare class UnboundedMailbox<T = unknown> implements Mailbox<T> {
    private buffer;
    private head;
    private tail;
    private count;
    private mask;
    constructor(initialCapacity?: number);
    enqueue(envelope: Envelope<T>): boolean;
    dequeue(): Envelope<T> | undefined;
    get size(): number;
    get isEmpty(): boolean;
    clear(): void;
    private grow;
}
export declare class BoundedMailbox<T = unknown> implements Mailbox<T> {
    private buffer;
    private head;
    private tail;
    private count;
    private mask;
    private readonly capacity;
    constructor(capacity?: number);
    /** Returns false if the mailbox is full (backpressure signal). */
    enqueue(envelope: Envelope<T>): boolean;
    dequeue(): Envelope<T> | undefined;
    get size(): number;
    get isEmpty(): boolean;
    clear(): void;
}
export declare class PriorityMailbox<T = unknown> implements Mailbox<T> {
    private heap;
    private readonly comparator;
    constructor(comparator?: (a: Envelope<T>, b: Envelope<T>) => number);
    enqueue(envelope: Envelope<T>): boolean;
    dequeue(): Envelope<T> | undefined;
    get size(): number;
    get isEmpty(): boolean;
    clear(): void;
    private bubbleUp;
    private sinkDown;
}
