/**
 * Fetch-based HTTP client with timeouts, retries, and hooks (Got-inspired ergonomics).
 * Uses global `fetch` (Node 20+ ships Undici-backed fetch).
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'TRACE';
/** Status codes that default retry considers retryable (along with network failures). */
export declare const DEFAULT_RETRY_STATUS_CODES: ReadonlySet<number>;
export interface HttpRetryOptions {
    /** Max retry attempts after the first request (total tries = limit + 1). */
    limit: number;
    /** HTTP methods eligible for retry; defaults to GET, PUT, HEAD, DELETE, OPTIONS, TRACE */
    methods?: HttpMethod[];
    /** Override retryable status codes (defaults to {@link DEFAULT_RETRY_STATUS_CODES}). */
    statusCodes?: ReadonlySet<number>;
    /** Delay before attempt `attempt` (1-based). */
    calculateDelay?: (attempt: number) => number;
}
export interface HttpHooks {
    beforeRequest?: (request: Request) => Request | Promise<Request>;
    afterResponse?: (response: Response, request: Request) => Response | Promise<Response>;
    beforeRetry?: (error: unknown, attempt: number, request: Request) => void | Promise<void>;
}
export interface HttpClientOptions {
    /** Prepended to relative URLs (trailing slash optional). */
    prefixUrl?: string | URL;
    /** Default headers merged into every request. */
    headers?: HeadersInit;
    /** Abort after this many milliseconds (merged with `init.signal`). */
    timeoutMs?: number;
    retry?: HttpRetryOptions;
    hooks?: HttpHooks;
    /** Inject fetch (tests or custom Undici dispatcher). */
    fetch?: typeof fetch;
}
export declare function defaultRetryDelay(attempt: number): number;
export declare class HttpClient {
    private readonly options;
    constructor(options?: HttpClientOptions);
    private resolveUrl;
    private buildRequest;
    request(url: string | URL, init?: RequestInit): Promise<Response>;
    get(url: string | URL, init?: RequestInit): Promise<Response>;
    post(url: string | URL, init?: RequestInit): Promise<Response>;
    put(url: string | URL, init?: RequestInit): Promise<Response>;
    patch(url: string | URL, init?: RequestInit): Promise<Response>;
    delete(url: string | URL, init?: RequestInit): Promise<Response>;
    head(url: string | URL, init?: RequestInit): Promise<Response>;
}
