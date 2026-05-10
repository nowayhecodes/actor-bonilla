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
/**
 * Uses queueMicrotask for minimal latency. Processes messages in batches
 * (throughput parameter) before yielding back to the event loop.
 *
 * This is the workhorse dispatcher — it interleaves actor processing
 * fairly across the event loop (batched scheduling).
 */
export declare class DefaultDispatcher implements Dispatcher {
    private pending;
    private scheduled;
    private alive;
    private readonly throughput;
    constructor(throughput?: number);
    dispatch(task: () => void): void;
    private run;
    shutdown(): void;
}
/**
 * Each actor using a PinnedDispatcher gets its own scheduling loop.
 * Useful for actors doing blocking work (via worker threads or native addons).
 * In a pure Node.js context, this simply uses setImmediate per invocation.
 */
export declare class PinnedDispatcher implements Dispatcher {
    private alive;
    dispatch(task: () => void): void;
    shutdown(): void;
}
/**
 * Runs the task immediately in the caller's context.
 * Useful for testing or when you need deterministic ordering.
 * ⚠️ Can cause stack overflow with deeply recursive tell chains.
 */
export declare class CallingThreadDispatcher implements Dispatcher {
    private alive;
    dispatch(task: () => void): void;
    shutdown(): void;
}
