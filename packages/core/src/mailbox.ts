// ============================================================================
// actor-bonilla — Mailbox implementations
// Optimized ring-buffer based mailboxes for minimal GC pressure.
// ============================================================================

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

// ============================================================================
// UnboundedMailbox — growable ring buffer (default)
// ============================================================================

/**
 * Lock-free unbounded FIFO queue backed by a growable ring buffer.
 * Amortized O(1) enqueue/dequeue. Grows by doubling, never shrinks
 * to avoid repeated allocations.
 */
export class UnboundedMailbox<T = unknown> implements Mailbox<T> {
  private buffer: (Envelope<T> | undefined)[];
  private head = 0;
  private tail = 0;
  private count = 0;
  private mask: number;

  /**
   * @param initialCapacity Starting buffer size (rounded up to the next power of two).
   *                        The buffer doubles automatically when full — it never shrinks.
   */
  constructor(initialCapacity = 64) {
    // Round up to next power of two for fast modulo via bitwise AND
    const cap = nextPowerOfTwo(initialCapacity);
    this.buffer = new Array(cap);
    this.mask = cap - 1;
  }

  enqueue(envelope: Envelope<T>): boolean {
    if (this.count === this.buffer.length) {
      this.grow();
    }
    this.buffer[this.tail] = envelope;
    this.tail = (this.tail + 1) & this.mask;
    this.count++;
    return true;
  }

  dequeue(): Envelope<T> | undefined {
    if (this.count === 0) return undefined;
    const envelope = this.buffer[this.head];
    this.buffer[this.head] = undefined; // Allow GC
    this.head = (this.head + 1) & this.mask;
    this.count--;
    return envelope;
  }

  get size(): number {
    return this.count;
  }

  get isEmpty(): boolean {
    return this.count === 0;
  }

  clear(): void {
    this.buffer.fill(undefined);
    this.head = 0;
    this.tail = 0;
    this.count = 0;
  }

  private grow(): void {
    const oldCap = this.buffer.length;
    const newCap = oldCap * 2;
    const newBuf: (Envelope<T> | undefined)[] = new Array(newCap);

    // Linearize the ring buffer into the new array
    for (let i = 0; i < this.count; i++) {
      newBuf[i] = this.buffer[(this.head + i) & this.mask];
    }
    this.buffer = newBuf;
    this.head = 0;
    this.tail = this.count;
    this.mask = newCap - 1;
  }
}

// ============================================================================
// BoundedMailbox — fixed-size ring buffer with backpressure
// ============================================================================

/**
 * Fixed-capacity FIFO ring buffer with backpressure.
 * When full, `enqueue` returns `false`; the ActorCell dead-letters the rejected message.
 * Capacity is rounded up to the next power of two for efficient bitwise modulo arithmetic.
 */
export class BoundedMailbox<T = unknown> implements Mailbox<T> {
  private buffer: (Envelope<T> | undefined)[];
  private head = 0;
  private tail = 0;
  private count = 0;
  private mask: number;
  private readonly capacity: number;

  /**
   * @param capacity Maximum number of enqueued messages (rounded up to the next power of two).
   *                 Default 1 024.
   */
  constructor(capacity = 1024) {
    const cap = nextPowerOfTwo(capacity);
    this.capacity = cap;
    this.buffer = new Array(cap);
    this.mask = cap - 1;
  }

  /** Returns false if the mailbox is full (backpressure signal). */
  enqueue(envelope: Envelope<T>): boolean {
    if (this.count >= this.capacity) return false;
    this.buffer[this.tail] = envelope;
    this.tail = (this.tail + 1) & this.mask;
    this.count++;
    return true;
  }

  dequeue(): Envelope<T> | undefined {
    if (this.count === 0) return undefined;
    const envelope = this.buffer[this.head];
    this.buffer[this.head] = undefined;
    this.head = (this.head + 1) & this.mask;
    this.count--;
    return envelope;
  }

  get size(): number {
    return this.count;
  }

  get isEmpty(): boolean {
    return this.count === 0;
  }

  clear(): void {
    this.buffer.fill(undefined);
    this.head = 0;
    this.tail = 0;
    this.count = 0;
  }
}

// ============================================================================
// PriorityMailbox — binary heap
// ============================================================================

/**
 * Priority queue backed by a binary min-heap.
 * The default comparator gives lower `messageId` values (earlier messages) higher priority,
 * preserving FIFO order among messages of equal priority.
 * Supply a custom comparator to order by message content or type.
 */
export class PriorityMailbox<T = unknown> implements Mailbox<T> {
  private heap: Envelope<T>[] = [];
  private readonly comparator: (a: Envelope<T>, b: Envelope<T>) => number;

  /**
   * @param comparator Optional ordering function. Returns a negative value when `a`
   *                   should be dequeued before `b`. Defaults to ascending `messageId`
   *                   (standard FIFO order).
   */
  constructor(comparator?: (a: Envelope<T>, b: Envelope<T>) => number) {
    // Default: lower messageId = higher priority (FIFO tiebreak)
    this.comparator = comparator ?? ((a, b) => a.messageId - b.messageId);
  }

  enqueue(envelope: Envelope<T>): boolean {
    this.heap.push(envelope);
    this.bubbleUp(this.heap.length - 1);
    return true;
  }

  dequeue(): Envelope<T> | undefined {
    const len = this.heap.length;
    if (len === 0) return undefined;
    const top = this.heap[0];
    if (len === 1) {
      this.heap.length = 0;
    } else {
      this.heap[0] = this.heap[len - 1];
      this.heap.length = len - 1;
      this.sinkDown(0);
    }
    return top;
  }

  get size(): number {
    return this.heap.length;
  }

  get isEmpty(): boolean {
    return this.heap.length === 0;
  }

  clear(): void {
    this.heap.length = 0;
  }

  private bubbleUp(idx: number): void {
    const heap = this.heap;
    const cmp = this.comparator;
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if (cmp(heap[idx], heap[parent]) < 0) {
        const tmp = heap[idx];
        heap[idx] = heap[parent];
        heap[parent] = tmp;
        idx = parent;
      } else {
        break;
      }
    }
  }

  private sinkDown(idx: number): void {
    const heap = this.heap;
    const cmp = this.comparator;
    const len = heap.length;
    while (true) {
      const left = 2 * idx + 1;
      const right = 2 * idx + 2;
      let smallest = idx;
      if (left < len && cmp(heap[left], heap[smallest]) < 0) smallest = left;
      if (right < len && cmp(heap[right], heap[smallest]) < 0) smallest = right;
      if (smallest !== idx) {
        const tmp = heap[idx];
        heap[idx] = heap[smallest];
        heap[smallest] = tmp;
        idx = smallest;
      } else {
        break;
      }
    }
  }
}

// ============================================================================
// Utilities
// ============================================================================

/** Round `n` up to the nearest power of two. Used for fast ring-buffer modulo via bitwise AND. */
function nextPowerOfTwo(n: number): number {
  if (n <= 0) return 1;
  n--;
  n |= n >> 1;
  n |= n >> 2;
  n |= n >> 4;
  n |= n >> 8;
  n |= n >> 16;
  return n + 1;
}
