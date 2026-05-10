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
export class DefaultDispatcher {
    pending = [];
    scheduled = false;
    alive = true;
    throughput;
    constructor(throughput = 32) {
        this.throughput = throughput;
    }
    dispatch(task) {
        if (!this.alive)
            return;
        this.pending.push(task);
        if (!this.scheduled) {
            this.scheduled = true;
            // queueMicrotask gives us the lowest possible latency
            // but we also need to yield periodically for I/O — use setImmediate
            // for batches to avoid starving the event loop.
            queueMicrotask(() => this.run());
        }
    }
    run() {
        const batch = this.pending;
        this.pending = [];
        this.scheduled = false;
        const len = Math.min(batch.length, this.throughput);
        for (let i = 0; i < len; i++) {
            try {
                batch[i]();
            }
            catch (e) {
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
    shutdown() {
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
export class PinnedDispatcher {
    alive = true;
    dispatch(task) {
        if (!this.alive)
            return;
        setImmediate(() => {
            if (this.alive) {
                try {
                    task();
                }
                catch (e) {
                    console.error('[actor-bonilla] Uncaught error in pinned dispatcher:', e);
                }
            }
        });
    }
    shutdown() {
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
export class CallingThreadDispatcher {
    alive = true;
    dispatch(task) {
        if (!this.alive)
            return;
        task();
    }
    shutdown() {
        this.alive = false;
    }
}
//# sourceMappingURL=dispatcher.js.map