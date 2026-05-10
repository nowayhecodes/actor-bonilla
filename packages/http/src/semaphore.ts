// ============================================================================
// @actor-bonilla/http — Async semaphore for request concurrency control
// ============================================================================

/** Async counting semaphore — acquire waits until a permit is available. */
export class Semaphore {
  private permits: number;
  private readonly queue: Array<() => void> = [];

  constructor(readonly maxPermits: number) {
    if (maxPermits < 1) {
      throw new RangeError(`Semaphore maxPermits must be >= 1, got ${maxPermits}`);
    }
    this.permits = maxPermits;
  }

  acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => this.queue.push(resolve));
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      // Slot handed directly to the waiter; permits unchanged
      next();
    } else {
      this.permits++;
    }
  }

  get available(): number {
    return this.permits;
  }

  get waiting(): number {
    return this.queue.length;
  }
}
