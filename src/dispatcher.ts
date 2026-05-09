// ============================================================================
// actor-bonilla — Dispatchers
// Controls how and when actors process their mailbox.
// ============================================================================

/**
 * A Dispatcher is responsible for scheduling actor mailbox processing.
 * Schedules mailbox processing — the bridge between actors and the
 * underlying execution mechanism.
 *
 * In Node.js, we leverage the event loop via queueMicrotask / setImmediate
 * for maximum throughput without thread pools (since JS is single-threaded,
 * but actors still need fair scheduling).
 */
export interface Dispatcher {
  /**
   * Schedule a unit of work. The dispatcher decides when/how to run it.
   * @param task - The processing function
   * @param throughput - Max messages to process before yielding
   */
  dispatch(task: () => void): void;

  /** Shutdown the dispatcher. */
  shutdown(): void;
}

// ============================================================================
// DefaultDispatcher — batched microtask scheduling
// ============================================================================

/**
 * Uses queueMicrotask for minimal latency. Processes messages in batches
 * (throughput parameter) before yielding back to the event loop.
 *
 * This is the workhorse dispatcher — it interleaves actor processing
 * fairly across the event loop (batched scheduling).
 */
export class DefaultDispatcher implements Dispatcher {
  private pending: (() => void)[] = [];
  private scheduled = false;
  private alive = true;
  private readonly throughput: number;

  constructor(throughput = 32) {
    this.throughput = throughput;
  }

  dispatch(task: () => void): void {
    if (!this.alive) return;
    this.pending.push(task);

    if (!this.scheduled) {
      this.scheduled = true;
      // queueMicrotask gives us the lowest possible latency
      // but we also need to yield periodically for I/O — use setImmediate
      // for batches to avoid starving the event loop.
      queueMicrotask(() => this.run());
    }
  }

  private run(): void {
    const batch = this.pending;
    this.pending = [];
    this.scheduled = false;

    const len = Math.min(batch.length, this.throughput);
    for (let i = 0; i < len; i++) {
      try {
        batch[i]();
      } catch (e) {
        // Dispatcher should never crash — errors are handled at actor level
        console.error('[actor-bonilla] Uncaught error in dispatcher:', e);
      }
    }

    // If there are remaining tasks, re-schedule with setImmediate
    // to yield to the event loop for I/O fairness
    if (len < batch.length) {
      const remaining = batch.slice(len);
      this.pending = remaining.concat(this.pending);
      if (!this.scheduled) {
        this.scheduled = true;
        setImmediate(() => this.run());
      }
    }
  }

  shutdown(): void {
    this.alive = false;
    this.pending.length = 0;
  }
}

// ============================================================================
// PinnedDispatcher — dedicated setImmediate loop per actor
// ============================================================================

/**
 * Each actor using a PinnedDispatcher gets its own scheduling loop.
 * Useful for actors doing blocking work (via worker threads or native addons).
 * In a pure Node.js context, this simply uses setImmediate per invocation.
 */
export class PinnedDispatcher implements Dispatcher {
  private alive = true;

  dispatch(task: () => void): void {
    if (!this.alive) return;
    setImmediate(() => {
      if (this.alive) {
        try {
          task();
        } catch (e) {
          console.error('[actor-bonilla] Uncaught error in pinned dispatcher:', e);
        }
      }
    });
  }

  shutdown(): void {
    this.alive = false;
  }
}

// ============================================================================
// CallingThreadDispatcher — synchronous execution
// ============================================================================

/**
 * Runs the task immediately in the caller's context.
 * Useful for testing or when you need deterministic ordering.
 * ⚠️ Can cause stack overflow with deeply recursive tell chains.
 */
export class CallingThreadDispatcher implements Dispatcher {
  private alive = true;

  dispatch(task: () => void): void {
    if (!this.alive) return;
    task();
  }

  shutdown(): void {
    this.alive = false;
  }
}
