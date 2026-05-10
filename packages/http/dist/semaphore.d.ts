/** Async counting semaphore — acquire waits until a permit is available. */
export declare class Semaphore {
    readonly maxPermits: number;
    private permits;
    private readonly queue;
    constructor(maxPermits: number);
    acquire(): Promise<void>;
    release(): void;
    get available(): number;
    get waiting(): number;
}
