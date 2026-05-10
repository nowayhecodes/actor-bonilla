import { ActorSystem } from '@actor-bonilla/core';
import { type Options, type HttpResponse, HTTP_PROGRESS_CHANNEL, HTTP_REQUEST_CHANNEL, HTTP_RESPONSE_CHANNEL, HTTP_ERROR_CHANNEL } from './types.js';
export { HTTP_PROGRESS_CHANNEL, HTTP_REQUEST_CHANNEL, HTTP_RESPONSE_CHANNEL, HTTP_ERROR_CHANNEL };
export declare class HttpClient {
    private readonly baseOptions;
    private readonly system;
    private readonly ownedSystem;
    private readonly semaphore;
    private readonly cacheActor;
    /**
     * The underlying actor system — subscribe to `HTTP_PROGRESS_CHANNEL`,
     * `HTTP_REQUEST_CHANNEL`, etc. via `client.actorSystem.eventStream`.
     */
    get actorSystem(): ActorSystem;
    constructor(options?: Partial<Options>);
    request<T = unknown>(url: string | URL, options?: Partial<Options>): Promise<HttpResponse<T>>;
    private execute;
    private retryAfterDelay;
    private checkCache;
    private storeCache;
    get<T = unknown>(url: string | URL, options?: Partial<Options>): Promise<HttpResponse<T>>;
    post<T = unknown>(url: string | URL, options?: Partial<Options>): Promise<HttpResponse<T>>;
    put<T = unknown>(url: string | URL, options?: Partial<Options>): Promise<HttpResponse<T>>;
    patch<T = unknown>(url: string | URL, options?: Partial<Options>): Promise<HttpResponse<T>>;
    delete<T = unknown>(url: string | URL, options?: Partial<Options>): Promise<HttpResponse<T>>;
    head<T = unknown>(url: string | URL, options?: Partial<Options>): Promise<HttpResponse<T>>;
    options<T = unknown>(url: string | URL, options?: Partial<Options>): Promise<HttpResponse<T>>;
    /**
     * Returns the raw ReadableStream<Uint8Array> body without consuming it.
     * The underlying Response is in 'stream' mode — no retries or body parsing.
     */
    stream(url: string | URL, options?: Partial<Options>): Promise<ReadableStream<Uint8Array>>;
    /**
     * GET and parse the response body as JSON.
     * Equivalent to `.get(url, { responseType: 'json' })` then `.body`.
     */
    getJson<T = unknown>(url: string | URL, options?: Partial<Options>): Promise<T>;
    /**
     * POST JSON and return the parsed response body.
     */
    postJson<T = unknown>(url: string | URL, json: unknown, options?: Partial<Options>): Promise<T>;
    paginate<T = unknown>(url: string | URL, options?: Partial<Options>): AsyncGenerator<T>;
    /**
     * Create a new HttpClient that inherits the current client's options,
     * deep-merging hooks arrays. The new client shares the same ActorSystem
     * unless `options.actorSystem` is overridden.
     */
    extend(options: Partial<Options>): HttpClient;
    /**
     * Gracefully shut down the actor system (only when this client created it).
     * Noop when the system was provided externally.
     */
    destroy(): Promise<void>;
    /** Purge all cached responses managed by this client's cache actor. */
    clearCache(): void;
}
export declare const http: HttpClient;
