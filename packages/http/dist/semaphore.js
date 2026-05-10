// ============================================================================
// @actor-bonilla/http — Async semaphore for request concurrency control
// ============================================================================
/** Async counting semaphore — acquire waits until a permit is available. */
export class Semaphore {
    maxPermits;
    permits;
    queue = [];
    constructor(maxPermits) {
        this.maxPermits = maxPermits;
        if (maxPermits < 1) {
            throw new RangeError(`Semaphore maxPermits must be >= 1, got ${maxPermits}`);
        }
        this.permits = maxPermits;
    }
    acquire() {
        if (this.permits > 0) {
            this.permits--;
            return Promise.resolve();
        }
        return new Promise((resolve) => this.queue.push(resolve));
    }
    release() {
        if (this.queue.length > 0) {
            const next = this.queue.shift();
            // Slot handed directly to the waiter; permits unchanged
            next();
        }
        else {
            this.permits++;
        }
    }
    get available() {
        return this.permits;
    }
    get waiting() {
        return this.queue.length;
    }
}
//# sourceMappingURL=semaphore.js.map