// ============================================================================
// @actor-bonilla/http — HttpClient
//
// Full-featured HTTP client built on Node 20's global fetch (Undici-backed).
// Integration with @actor-bonilla/core:
//   • ActorSystem's EventStream publishes download/upload progress.
//   • A shared CacheActor manages RFC-lite response caching as actor state.
//   • A Semaphore enforces maxConcurrent request limits.
// ============================================================================

import { ActorSystem, type ActorRef, type EventClassifier } from '@actor-bonilla/core';
import { MemoryCache } from './cache.js';
import {
  type Options,
  type NormalizedOptions,
  type HttpResponse,
  type Timings,
  type ProgressEvent,
  type CacheEntry,
  type CacheStore,
  HTTP_PROGRESS_CHANNEL,
  HTTP_REQUEST_CHANNEL,
  HTTP_RESPONSE_CHANNEL,
  HTTP_ERROR_CHANNEL,
  type HttpProgressEvent,
} from './types.js';
import { HTTPError, TimeoutError, ParseError, normalizeError, RequestError } from './errors.js';
import { normalizeOptions, mergeOptionObjects } from './normalize.js';
import {
  buildCacheKey,
  computeTtl,
  extractVaryHeaders,
  isCacheableMethod,
  isCacheableStatus,
  isStale,
} from './cache.js';
import { Semaphore } from './semaphore.js';
import { defaultRetryDelay, IDEMPOTENT_METHODS, RETRY_ERROR_CODES } from './defaults.js';
import { cacheActorProps, type CacheMsg } from './actors/cache.js';

export { HTTP_PROGRESS_CHANNEL, HTTP_REQUEST_CHANNEL, HTTP_RESPONSE_CHANNEL, HTTP_ERROR_CHANNEL };

// ─── Retry-With sentinel ─────────────────────────────────────────────────────

const RETRY_WITH = Symbol('retryWith');

class RetryWithMergedOptions {
  readonly [RETRY_WITH] = true as const;
  constructor(readonly merged: NormalizedOptions) {}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function combineAbortSignals(signals: (AbortSignal | undefined)[]): {
  signal: AbortSignal | undefined;
  cleanup: () => void;
} {
  const valid = signals.filter((s): s is AbortSignal => s !== undefined);
  if (valid.length === 0) return { signal: undefined, cleanup: () => {} };
  if (valid.length === 1) return { signal: valid[0], cleanup: () => {} };
  if (typeof AbortSignal.any === 'function') {
    return { signal: AbortSignal.any(valid), cleanup: () => {} };
  }
  const ctrl = new AbortController();
  const listeners: Array<() => void> = [];
  for (const s of valid) {
    const fn = () => ctrl.abort(s.reason);
    s.addEventListener('abort', fn, { once: true });
    listeners.push(() => s.removeEventListener('abort', fn));
  }
  return {
    signal: ctrl.signal,
    cleanup: () => listeners.forEach((fn) => fn()),
  };
}

function parseRetryAfter(header: string): number | undefined {
  const n = Number(header);
  if (Number.isFinite(n) && n >= 0) return n * 1_000; // seconds → ms
  const d = new Date(header).getTime();
  if (Number.isFinite(d)) return Math.max(0, d - Date.now());
  return undefined;
}

async function readBody<T>(
  response: Response,
  options: NormalizedOptions,
  system: ActorSystem,
  onDownloadProgress?: (e: ProgressEvent) => void
): Promise<{ body: T; downloadMs: number }> {
  const start = Date.now();
  const contentLength = response.headers.get('content-length');
  const total = contentLength ? parseInt(contentLength, 10) : undefined;
  const url = options.url.href;

  const emit = (transferred: number) => {
    const pct = total ? transferred / total : 0;
    const event: ProgressEvent = { percent: pct, transferred, total };
    onDownloadProgress?.(event);
    system.eventStream.publish<HttpProgressEvent>(HTTP_PROGRESS_CHANNEL as EventClassifier, {
      url,
      direction: 'download',
      progress: event,
    });
  };

  if (options.responseType === 'stream') {
    // Return the raw stream body — don't consume
    return { body: response.body as unknown as T, downloadMs: 0 };
  }

  if (!response.body) {
    return { body: '' as unknown as T, downloadMs: 0 };
  }

  // Stream body reading with progress tracking
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let transferred = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        transferred += value.byteLength;
        emit(transferred);
      }
    }
  } finally {
    reader.releaseLock();
  }

  emit(transferred);

  const downloadMs = Date.now() - start;

  // Single pre-allocated copy — O(n) instead of O(n²) reduce
  const totalSize = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const allBytes = new Uint8Array(totalSize);
  let byteOffset = 0;
  for (const chunk of chunks) {
    allBytes.set(chunk, byteOffset);
    byteOffset += chunk.byteLength;
  }

  switch (options.responseType) {
    case 'buffer': {
      return { body: Buffer.from(allBytes) as unknown as T, downloadMs };
    }
    case 'json': {
      const text = new TextDecoder(options.encoding).decode(allBytes);
      try {
        return { body: JSON.parse(text) as T, downloadMs };
      } catch (e) {
        throw new ParseError(e as Error, options);
      }
    }
    default: {
      // 'text'
      return {
        body: new TextDecoder(options.encoding).decode(allBytes) as unknown as T,
        downloadMs,
      };
    }
  }
}

function buildFetchInit(options: NormalizedOptions, signal?: AbortSignal): RequestInit {
  const init: RequestInit = {
    method: options.method,
    headers: options.headers,
    credentials: options.credentials,
    signal,
  };

  // Body selection: json > form > body
  if (options.json !== undefined) {
    init.body = JSON.stringify(options.json);
  } else if (options.form !== undefined) {
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(options.form)) {
      usp.append(k, String(v));
    }
    init.body = usp.toString();
  } else if (options.body !== undefined) {
    init.body = options.body;
  }

  return init;
}

const NETWORK_ERROR_CODES = new Set(RETRY_ERROR_CODES);

function isNetworkError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code;
  return code !== undefined && NETWORK_ERROR_CODES.has(code);
}

// ─── HttpClient ───────────────────────────────────────────────────────────────

export class HttpClient {
  private readonly baseOptions: Partial<Options>;
  private readonly system: ActorSystem;
  private readonly ownedSystem: boolean;
  private readonly semaphore: Semaphore;
  private readonly cacheActor: ActorRef<CacheMsg>;

  /**
   * The underlying actor system — subscribe to `HTTP_PROGRESS_CHANNEL`,
   * `HTTP_REQUEST_CHANNEL`, etc. via `client.actorSystem.eventStream`.
   */
  get actorSystem(): ActorSystem {
    return this.system;
  }

  constructor(options: Partial<Options> = {}) {
    this.baseOptions = options;
    this.ownedSystem = !options.actorSystem;
    this.system =
      options.actorSystem ??
      new ActorSystem({ name: '@actor-bonilla/http', logDeadLetters: false });

    this.semaphore = new Semaphore(options.maxConcurrent ?? 256);

    const cacheStore = resolveCacheStore(options.cache);
    this.cacheActor = this.system.actorOf<CacheMsg>(
      cacheActorProps(cacheStore),
      `http-cache-${Math.random().toString(36).slice(2)}`
    );
  }

  // ─── Core request method ────────────────────────────────────────────────────

  async request<T = unknown>(
    url: string | URL,
    options: Partial<Options> = {}
  ): Promise<HttpResponse<T>> {
    const normalized = normalizeOptions(
      mergeOptionObjects(this.baseOptions, { url, ...options })
    );

    // Publish request start
    this.system.eventStream.publish(HTTP_REQUEST_CHANNEL as EventClassifier, {
      url: normalized.url.href,
      method: normalized.method,
    });

    await this.semaphore.acquire();
    try {
      const result = await this.execute<T>(normalized, 0, []);
      if (normalized.resolveBodyOnly) {
        return result.body as unknown as HttpResponse<T>;
      }
      return result;
    } finally {
      this.semaphore.release();
    }
  }

  // ─── Private execution engine ────────────────────────────────────────────────

  private async execute<T>(
    options: NormalizedOptions,
    retryCount: number,
    redirectUrls: string[]
  ): Promise<HttpResponse<T>> {
    // Run init hooks (called once per execute, before beforeRequest)
    for (const hook of options.hooks.init) {
      hook(options as unknown as Partial<Options>, options);
    }

    // Run beforeRequest hooks
    let currentOptions = options;
    for (const hook of currentOptions.hooks.beforeRequest) {
      const result = await hook(currentOptions);
      if (result && typeof result === 'object' && 'url' in result) {
        currentOptions = result as NormalizedOptions;
      }
    }

    // Check cache
    if (currentOptions.cache && isCacheableMethod(currentOptions.method)) {
      const cached = await this.checkCache<T>(currentOptions);
      if (cached) return { ...cached, retryCount, redirectUrls };
    }

    // Timeout logic
    const timers: ReturnType<typeof setTimeout>[] = [];
    const timeoutController = new AbortController();
    const { request: reqTimeout } = currentOptions.timeout;

    if (reqTimeout && reqTimeout > 0) {
      const t = setTimeout(() => timeoutController.abort(), reqTimeout);
      timers.push(t);
    }

    const { signal: mergedSignal, cleanup } = combineAbortSignals([
      currentOptions.signal,
      timeoutController.signal,
    ]);

    const timings: Timings = {
      start: Date.now(),
      phases: {},
    };

    let rawResponse: Response;
    try {
      const init = buildFetchInit(currentOptions, mergedSignal);
      rawResponse = await globalThis.fetch(currentOptions.url.href, init);
      timings.response = Date.now();
      timings.phases.firstByte = timings.response - timings.start;
    } catch (err) {
      timers.forEach(clearTimeout);
      cleanup();

      const isTimeout =
        timeoutController.signal.aborted ||
        (err instanceof Error && err.name === 'AbortError');

      const normalised = isTimeout
        ? new TimeoutError('request', currentOptions)
        : normalizeError(err, currentOptions);

      // Run beforeError hooks
      let finalErr: RequestError = normalised;
      for (const hook of currentOptions.hooks.beforeError) {
        finalErr = await hook(finalErr);
      }

      // Retry on network error
      if (
        isNetworkError(err) &&
        retryCount < currentOptions.retry.limit &&
        IDEMPOTENT_METHODS.has(currentOptions.method)
      ) {
        return this.retryAfterDelay<T>(currentOptions, retryCount, redirectUrls, finalErr);
      }

      this.system.eventStream.publish(HTTP_ERROR_CHANNEL as EventClassifier, {
        url: currentOptions.url.href,
        error: finalErr,
      });
      throw finalErr;
    }

    timers.forEach(clearTimeout);
    cleanup();

    // Read body
    let body: T;
    let downloadMs: number;
    try {
      ({ body, downloadMs } = await readBody<T>(
        rawResponse,
        currentOptions,
        this.system,
        currentOptions.onDownloadProgress
      ));
    } catch (err) {
      if (err instanceof RequestError) {
        throw err;
      }
      throw normalizeError(err, currentOptions);
    }

    timings.end = Date.now();
    timings.phases.download = downloadMs;
    timings.phases.total = timings.end - timings.start;

    let httpResponse: HttpResponse<T> = {
      url: rawResponse.url || currentOptions.url.href,
      statusCode: rawResponse.status,
      statusMessage: rawResponse.statusText,
      headers: rawResponse.headers,
      redirectUrls,
      retryCount,
      requestCount: retryCount + 1 + redirectUrls.length,
      timings,
      body,
      rawResponse,
      fromCache: false,
    };

    // Run afterResponse hooks
    for (const hook of currentOptions.hooks.afterResponse) {
      try {
        httpResponse = (await hook(httpResponse, async (retryOpts) => {
          const merged = normalizeOptions(
            mergeOptionObjects(currentOptions as unknown as Partial<Options>, retryOpts)
          );
          throw new RetryWithMergedOptions(merged);
        })) as HttpResponse<T>;
      } catch (err) {
        if (err instanceof RetryWithMergedOptions) {
          return this.execute<T>(err.merged, retryCount, redirectUrls);
        }
        throw err;
      }
    }

    // Retry on status code — build Set once per execute call for O(1) lookup
    const retryStatusSet = new Set(currentOptions.retry.statusCodes);
    if (
      retryCount < currentOptions.retry.limit &&
      retryStatusSet.has(httpResponse.statusCode) &&
      IDEMPOTENT_METHODS.has(currentOptions.method)
    ) {
      const retryAfterMs = parseRetryAfter(
        rawResponse.headers.get('retry-after') ?? ''
      );
      const error = new HTTPError(httpResponse, currentOptions);
      return this.retryAfterDelay<T>(currentOptions, retryCount, redirectUrls, error, retryAfterMs);
    }

    // Throw on HTTP errors
    if (
      currentOptions.throwHttpErrors &&
      httpResponse.statusCode >= 400
    ) {
      let error: RequestError = new HTTPError(httpResponse, currentOptions);
      for (const hook of currentOptions.hooks.beforeError) {
        error = await hook(error);
      }
      this.system.eventStream.publish(HTTP_ERROR_CHANNEL as EventClassifier, {
        url: currentOptions.url.href,
        error,
      });
      throw error;
    }

    // Store in cache
    if (
      currentOptions.cache &&
      isCacheableMethod(currentOptions.method) &&
      isCacheableStatus(httpResponse.statusCode)
    ) {
      await this.storeCache(currentOptions, httpResponse);
    }

    // Publish response event
    this.system.eventStream.publish(HTTP_RESPONSE_CHANNEL as EventClassifier, {
      url: httpResponse.url,
      statusCode: httpResponse.statusCode,
    });

    return httpResponse;
  }

  // ─── Retry helper ─────────────────────────────────────────────────────────

  private async retryAfterDelay<T>(
    options: NormalizedOptions,
    retryCount: number,
    redirectUrls: string[],
    error: RequestError,
    retryAfterMs?: number
  ): Promise<HttpResponse<T>> {
    const computedDelay = defaultRetryDelay(retryCount + 1, undefined);
    const delay = Math.min(
      options.retry.calculateDelay({
        retryCount: retryCount + 1,
        retryAfter: retryAfterMs,
        error,
        computedValue: computedDelay,
      }),
      options.retry.backoffLimit
    );

    for (const hook of options.hooks.beforeRetry) {
      await hook({ options, error, retryCount });
    }

    await sleep(delay);
    return this.execute<T>(options, retryCount + 1, redirectUrls);
  }

  // ─── Cache helpers ─────────────────────────────────────────────────────────

  private async checkCache<T>(
    options: NormalizedOptions
  ): Promise<HttpResponse<T> | null> {
    const key = buildCacheKey(options.method, options.url);
    let entry: CacheEntry | null;
    try {
      entry = await this.cacheActor.ask<CacheEntry | null>(
        { type: 'GET', key } as CacheMsg,
        2_000
      );
    } catch {
      return null;
    }
    if (!entry || isStale(entry)) return null;

    const headers = new Headers(entry.headers);
    const body = options.responseType === 'json'
      ? (JSON.parse(entry.body) as T)
      : (entry.body as unknown as T);

    const response: HttpResponse<T> = {
      url: entry.url,
      statusCode: entry.statusCode,
      statusMessage: 'OK',
      headers,
      redirectUrls: [],
      retryCount: 0,
      requestCount: 1,
      timings: { start: entry.timestamp, phases: {} },
      body,
      rawResponse: new Response(entry.body, {
        status: entry.statusCode,
        headers,
      }),
      fromCache: true,
    };
    return response;
  }

  private async storeCache(
    options: NormalizedOptions,
    response: HttpResponse
  ): Promise<void> {
    const headers: Record<string, string> = {};
    response.headers.forEach((v, k) => { headers[k] = v; });

    const ttl = computeTtl(response.headers);
    if (ttl === undefined) return; // no-store

    const vary = extractVaryHeaders(response.headers, options.headers);
    const key = buildCacheKey(options.method, options.url, vary);

    const entry: CacheEntry = {
      statusCode: response.statusCode,
      headers,
      body: typeof response.body === 'string'
        ? response.body
        : JSON.stringify(response.body),
      url: response.url,
      timestamp: Date.now(),
      ttl,
      etag: response.headers.get('etag') ?? undefined,
      lastModified: response.headers.get('last-modified') ?? undefined,
      vary,
    };

    this.cacheActor.tell({ type: 'SET', key, entry, ttl } as CacheMsg);
  }

  // ─── Convenience HTTP methods ───────────────────────────────────────────────

  get<T = unknown>(url: string | URL, options?: Partial<Options>): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...options, method: 'GET' });
  }

  post<T = unknown>(url: string | URL, options?: Partial<Options>): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...options, method: 'POST' });
  }

  put<T = unknown>(url: string | URL, options?: Partial<Options>): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...options, method: 'PUT' });
  }

  patch<T = unknown>(url: string | URL, options?: Partial<Options>): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...options, method: 'PATCH' });
  }

  delete<T = unknown>(url: string | URL, options?: Partial<Options>): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...options, method: 'DELETE' });
  }

  head<T = unknown>(url: string | URL, options?: Partial<Options>): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...options, method: 'HEAD' });
  }

  options<T = unknown>(url: string | URL, options?: Partial<Options>): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...options, method: 'OPTIONS' });
  }

  // ─── Streaming ─────────────────────────────────────────────────────────────

  /**
   * Returns the raw ReadableStream<Uint8Array> body without consuming it.
   * The underlying Response is in 'stream' mode — no retries or body parsing.
   */
  async stream(url: string | URL, options?: Partial<Options>): Promise<ReadableStream<Uint8Array>> {
    const resp = await this.request<ReadableStream<Uint8Array>>(url, {
      ...options,
      responseType: 'stream',
    });
    if (!resp.body) throw new Error('Response has no body stream');
    return resp.body;
  }

  // ─── JSON shortcut ─────────────────────────────────────────────────────────

  /**
   * GET and parse the response body as JSON.
   * Equivalent to `.get(url, { responseType: 'json' })` then `.body`.
   */
  async getJson<T = unknown>(url: string | URL, options?: Partial<Options>): Promise<T> {
    const resp = await this.get<T>(url, { ...options, responseType: 'json' });
    return resp.body;
  }

  /**
   * POST JSON and return the parsed response body.
   */
  async postJson<T = unknown>(
    url: string | URL,
    json: unknown,
    options?: Partial<Options>
  ): Promise<T> {
    const resp = await this.post<T>(url, { ...options, json, responseType: 'json' });
    return resp.body;
  }

  // ─── Pagination (async generator) ─────────────────────────────────────────

  async *paginate<T = unknown>(
    url: string | URL,
    options: Partial<Options> = {}
  ): AsyncGenerator<T> {
    const paginateOptions = options.pagination;
    if (!paginateOptions?.paginate) {
      throw new TypeError('options.pagination.paginate function is required for .paginate()');
    }

    const allItems: T[] = [];
    let currentOptions: Partial<Options> = { ...options, url };
    let requestCount = 0;

    for (;;) {
      const resp = await this.request<unknown>(url, currentOptions);
      requestCount++;

      const rawItems: T[] = paginateOptions.transform
        ? (await paginateOptions.transform(resp as HttpResponse)) as T[]
        : Array.isArray(resp.body)
          ? (resp.body as T[])
          : [];

      const filtered: T[] = paginateOptions.filter
        ? rawItems.filter((item: T) => paginateOptions.filter!(item, allItems, rawItems))
        : rawItems;

      for (const item of filtered) {
        if (paginateOptions.countLimit !== undefined && allItems.length >= paginateOptions.countLimit) {
          return;
        }
        if (
          paginateOptions.shouldContinue &&
          !paginateOptions.shouldContinue(item, allItems, filtered)
        ) {
          return;
        }
        if (paginateOptions.stackAllItems !== false) {
          allItems.push(item);
        }
        yield item;
      }

      if (
        paginateOptions.requestLimit !== undefined &&
        requestCount >= paginateOptions.requestLimit
      ) {
        return;
      }

      const next = await paginateOptions.paginate(
        resp as HttpResponse,
        allItems,
        filtered
      );
      if (!next) return;

      if (paginateOptions.backoff && paginateOptions.backoff > 0) {
        await sleep(paginateOptions.backoff);
      }

      currentOptions = mergeOptionObjects(currentOptions, next);
      url = (next.url ?? (next.searchParams ? currentOptions.url! : url)) as string | URL;
    }
  }

  // ─── Extend (create a derived client inheriting all options) ───────────────

  /**
   * Create a new HttpClient that inherits the current client's options,
   * deep-merging hooks arrays. The new client shares the same ActorSystem
   * unless `options.actorSystem` is overridden.
   */
  extend(options: Partial<Options>): HttpClient {
    const merged = mergeOptionObjects(this.baseOptions, {
      actorSystem: this.system,
      ...options,
    });
    return new HttpClient(merged);
  }

  /**
   * Gracefully shut down the actor system (only when this client created it).
   * Noop when the system was provided externally.
   */
  async destroy(): Promise<void> {
    this.cacheActor.stop();
    if (this.ownedSystem) {
      await this.system.terminate();
    }
  }

  // ─── Cache control ─────────────────────────────────────────────────────────

  /** Purge all cached responses managed by this client's cache actor. */
  clearCache(): void {
    this.cacheActor.tell({ type: 'CLEAR' } as CacheMsg);
  }
}

// ─── Module-level default instance ───────────────────────────────────────────

export const http = new HttpClient();

// ─── Internal helpers ─────────────────────────────────────────────────────────

function resolveCacheStore(cache: Options['cache']): CacheStore {
  if (!cache) return new MemoryCache();
  if (cache === true) return new MemoryCache();
  return cache;
}
