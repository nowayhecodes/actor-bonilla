import type { Envelope } from './types.js';
/**
 * Mailbox interface — all mailbox implementations satisfy this contract.
 * The ActorCell interacts with the mailbox only through this interface.
 */
export interface Mailbox<T = unknown> {
    /**
     * Add an envelope to the mailbox.
     * @returns `true` on success, `false` if the mailbox rejected the message
     *          (e.g. BoundedMailbox is full — caller should dead-letter it).
     */
    enqueue(envelope: Envelope<T>): boolean;
    /**
     * Remove and return the next envelope, or `undefined` when empty.
     * Callers must check `isEmpty` or handle `undefined`.
     */
    dequeue(): Envelope<T> | undefined;
    /** Number of messages currently in the mailbox. */
    readonly size: number;
    /** `true` when no messages are queued. */
    readonly isEmpty: boolean;
    /** Remove all queued messages (called during actor restart / stop). */
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
    /**
     * @param initialCapacity Starting buffer size (rounded up to the next power of two).
     *                        The buffer doubles automatically when full — it never shrinks.
     */
    constructor(initialCapacity?: number);
    enqueue(envelope: Envelope<T>): boolean;
    dequeue(): Envelope<T> | undefined;
    get size(): number;
    get isEmpty(): boolean;
    clear(): void;
    private grow;
}
/**
 * Fixed-capacity FIFO ring buffer with backpressure.
 * When full, `enqueue` returns `false`; the ActorCell dead-letters the rejected message.
 * Capacity is rounded up to the next power of two for efficient bitwise modulo arithmetic.
 */
export declare class BoundedMailbox<T = unknown> implements Mailbox<T> {
    private buffer;
    private head;
    private tail;
    private count;
    private mask;
    private readonly capacity;
    /**
     * @param capacity Maximum number of enqueued messages (rounded up to the next power of two).
     *                 Default 1 024.
     */
    constructor(capacity?: number);
    /** Returns false if the mailbox is full (backpressure signal). */
    enqueue(envelope: Envelope<T>): boolean;
    dequeue(): Envelope<T> | undefined;
    get size(): number;
    get isEmpty(): boolean;
    clear(): void;
}
/**
 * Priority queue backed by a binary min-heap.
 * The default comparator gives lower `messageId` values (earlier messages) higher priority,
 * preserving FIFO order among messages of equal priority.
 * Supply a custom comparator to order by message content or type.
 */
export declare class PriorityMailbox<T = unknown> implements Mailbox<T> {
    private heap;
    private readonly comparator;
    /**
     * @param comparator Optional ordering function. Returns a negative value when `a`
     *                   should be dequeued before `b`. Defaults to ascending `messageId`
     *                   (standard FIFO order).
     */
    constructor(comparator?: (a: Envelope<T>, b: Envelope<T>) => number);
    enqueue(envelope: Envelope<T>): boolean;
    dequeue(): Envelope<T> | undefined;
    get size(): number;
    get isEmpty(): boolean;
    clear(): void;
    private bubbleUp;
    private sinkDown;
}
