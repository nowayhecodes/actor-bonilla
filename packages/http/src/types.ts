// ============================================================================
// @actor-bonilla/http — Types
// ============================================================================

import type { ActorSystem } from '@actor-bonilla/core';
import type { tags } from 'typia';

export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'HEAD'
  | 'OPTIONS'
  | 'TRACE';

// ─── Timeout ────────────────────────────────────────────────────────────────

export interface TimeoutOptions {
  /** ms until the socket is connected. Must be >= 0. */
  connect?: number & tags.Minimum<0>;
  /** ms until first byte of the response body arrives. Must be >= 0. */
  response?: number & tags.Minimum<0>;
  /** ms of inactivity between received bytes. Must be >= 0. */
  read?: number & tags.Minimum<0>;
  /** ms until the full request body is sent. Must be >= 0. */
  send?: number & tags.Minimum<0>;
  /** Hard cap on the total request lifecycle (ms). 0 = disabled. */
  request?: number & tags.Minimum<0>;
}

// ─── Retry ──────────────────────────────────────────────────────────────────

export interface RetryObject {
  retryCount: number;
  /** Delay derived from Retry-After header, in ms. */
  retryAfter?: number;
  error: Error;
  computedValue: number;
}

export interface RetryOptions {
  /** Number of retries after the first attempt. Must be >= 0. Default 2. */
  limit: number & tags.Minimum<0>;
  /** Eligible HTTP methods. Default: idempotent set. */
  methods: HttpMethod[];
  /** Response status codes that trigger a retry. */
  statusCodes: number[];
  /** Network error codes that trigger a retry. */
  errorCodes: string[];
  /** Returns delay before the next attempt (ms). */
  calculateDelay: (retryObject: RetryObject) => number;
  /** Upper cap on calculateDelay result (ms). Must be >= 0. */
  backoffLimit: number & tags.Minimum<0>;
  /** Max Retry-After header value honoured (ms). Must be >= 0. Default: unlimited. */
  maxRetryAfter: number & tags.Minimum<0>;
}

// ─── Progress ────────────────────────────────────────────────────────────────

export interface ProgressEvent {
  percent: number;
  transferred: number;
  total?: number;
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

export interface BeforeRetryState {
  options: NormalizedOptions;
  error: Error;
  retryCount: number;
}

export type BeforeRequestHook = (
  options: NormalizedOptions
) => void | NormalizedOptions | Promise<void | NormalizedOptions>;

export type AfterResponseHook = (
  response: HttpResponse,
  retryWithMergedOptions: (options: Partial<Options>) => Promise<never>
) => HttpResponse | Promise<HttpResponse>;

export type BeforeErrorHook = (
  error: RequestError
) => RequestError | Promise<RequestError>;

export type BeforeRetryHook = (
  state: BeforeRetryState
) => void | Promise<void>;

export type BeforeRedirectHook = (
  updatedOptions: NormalizedOptions,
  response: Response
) => void | Promise<void>;

export type InitHook = (
  plain: Partial<Options>,
  options: NormalizedOptions
) => void;

export interface Hooks {
  init: InitHook[];
  beforeRequest: BeforeRequestHook[];
  afterResponse: AfterResponseHook[];
  beforeError: BeforeErrorHook[];
  beforeRetry: BeforeRetryHook[];
  beforeRedirect: BeforeRedirectHook[];
}

// ─── Cache ────────────────────────────────────────────────────────────────────

export interface CacheEntry {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  url: string;
  timestamp: number;
  /** TTL in seconds. */
  ttl?: number;
  etag?: string;
  lastModified?: string;
  vary?: Record<string, string>;
}

export interface CacheStore {
  get(key: string): CacheEntry | undefined | Promise<CacheEntry | undefined>;
  set(key: string, value: CacheEntry, ttl?: number): void | Promise<void>;
  delete(key: string): void | Promise<void>;
  clear?(): void | Promise<void>;
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginationOptions<T = unknown> {
  /**
   * Extract items from each page response.
   * Defaults to treating the response body as an array.
   */
  transform?: (response: HttpResponse) => T[] | Promise<T[]>;
  /**
   * Given the current response and all collected items, return the options for
   * the next page or `false` to stop.
   */
  paginate?: (
    response: HttpResponse,
    allItems: T[],
    currentItems: T[]
  ) => Partial<Options> | false | Promise<Partial<Options> | false>;
  /** Keep only items for which this returns true. */
  filter?: (item: T, allItems: T[], currentItems: T[]) => boolean;
  /** Return false to stop before countLimit. */
  shouldContinue?: (item: T, allItems: T[], currentItems: T[]) => boolean;
  /** Stop once this many items have been yielded. Must be >= 1. */
  countLimit?: number & tags.Minimum<1>;
  /** Delay (ms) between page requests. Must be >= 0. */
  backoff?: number & tags.Minimum<0>;
  /** Stop after this many HTTP requests. Must be >= 1. */
  requestLimit?: number & tags.Minimum<1>;
  /** Accumulate all items in memory (default true). */
  stackAllItems?: boolean;
}

// ─── HTTPS ────────────────────────────────────────────────────────────────────

export interface HttpsOptions {
  rejectUnauthorized?: boolean;
  /** PEM or array of PEMs for a custom CA. */
  certificateAuthority?: string | string[];
  certificate?: string;
  key?: string;
  passphrase?: string;
}

// ─── User-facing options ─────────────────────────────────────────────────────

export interface Options {
  url?: string | URL;
  /** Prepended to every relative URL. */
  prefixUrl?: string | URL;
  method?: HttpMethod;
  headers?: HeadersInit;

  // Body (mutually exclusive)
  /** Raw fetch body. */
  body?: BodyInit | null;
  /** Serialized as JSON; sets Content-Type: application/json automatically. */
  json?: unknown;
  /** Encoded as application/x-www-form-urlencoded. */
  form?: Record<string, string | number | boolean>;

  searchParams?:
    | string
    | URLSearchParams
    | Record<string, string | number | boolean>
    | [string, string | number | boolean][];

  timeout?: number | Partial<TimeoutOptions>;
  retry?: number | Partial<RetryOptions>;
  hooks?: Partial<{ [K in keyof Hooks]: Hooks[K] }>;

  followRedirects?: boolean;
  maxRedirects?: number;
  decompress?: boolean;

  username?: string;
  password?: string;

  /** How to parse the response body. Default 'text'; use 'json' to auto-parse. */
  responseType?: 'text' | 'json' | 'buffer' | 'stream';
  /** Resolve the promise with the body instead of the full HttpResponse. */
  resolveBodyOnly?: boolean;
  encoding?: BufferEncoding;

  /** false = disable cache; true = MemoryCache; CacheStore = custom. */
  cache?: boolean | CacheStore;

  /** Throw on 4xx/5xx responses. Default true. */
  throwHttpErrors?: boolean;

  credentials?: RequestCredentials;
  signal?: AbortSignal;

  /** Callback invoked while uploading the request body. */
  onUploadProgress?: (progress: ProgressEvent) => void;
  /** Callback invoked while downloading the response body. */
  onDownloadProgress?: (progress: ProgressEvent) => void;

  pagination?: PaginationOptions;

  // ─── Actor system ─────────────────────────────────────────────────────────
  /** Provide an existing ActorSystem; otherwise one is created per HttpClient. */
  actorSystem?: ActorSystem;
  /** Maximum concurrent in-flight requests. Default 256. */
  maxConcurrent?: number;

  // ─── Advanced ─────────────────────────────────────────────────────────────
  https?: HttpsOptions;
  /** Proxy URL (e.g. 'http://user:pass@proxy:8080'). */
  proxy?: string;
}

// ─── Normalised options (all fields resolved) ────────────────────────────────

export interface NormalizedOptions {
  url: URL;
  method: HttpMethod;
  headers: Headers;
  body?: BodyInit | null;
  json?: unknown;
  form?: Record<string, string | number | boolean>;
  timeout: TimeoutOptions;
  retry: RetryOptions;
  hooks: Hooks;
  followRedirects: boolean;
  maxRedirects: number;
  decompress: boolean;
  username?: string;
  password?: string;
  responseType: 'text' | 'json' | 'buffer' | 'stream';
  resolveBodyOnly: boolean;
  encoding: BufferEncoding;
  cache: false | CacheStore;
  throwHttpErrors: boolean;
  credentials: RequestCredentials;
  signal?: AbortSignal;
  onUploadProgress?: (progress: ProgressEvent) => void;
  onDownloadProgress?: (progress: ProgressEvent) => void;
  pagination?: PaginationOptions;
  maxConcurrent: number;
  proxy?: string;
  https?: HttpsOptions;
}

// ─── Response ─────────────────────────────────────────────────────────────────

export interface Timings {
  start: number;
  /** Time when first response byte arrived (ms since epoch). */
  response?: number;
  /** Time when the full body was read. */
  end?: number;
  phases: {
    /** Time until first byte (ms). */
    firstByte?: number;
    /** Time to download full body (ms). */
    download?: number;
    /** End-to-end (ms). */
    total?: number;
  };
}

export interface HttpResponse<T = unknown> {
  url: string;
  statusCode: number;
  statusMessage: string;
  headers: Headers;
  redirectUrls: string[];
  retryCount: number;
  requestCount: number;
  timings: Timings;
  body: T;
  /** Underlying platform Response (stream may already be consumed). */
  rawResponse: Response;
  fromCache: boolean;
  ip?: string;
}

// ─── Event channel symbols ────────────────────────────────────────────────────

export const HTTP_PROGRESS_CHANNEL = Symbol.for('@actor-bonilla/http.progress');
export const HTTP_REQUEST_CHANNEL = Symbol.for('@actor-bonilla/http.request');
export const HTTP_RESPONSE_CHANNEL = Symbol.for('@actor-bonilla/http.response');
export const HTTP_ERROR_CHANNEL = Symbol.for('@actor-bonilla/http.error');

export interface HttpProgressEvent {
  url: string;
  direction: 'upload' | 'download';
  progress: ProgressEvent;
}

// ─── RequestError (base) — also exported as a class from errors.ts ──────────

export class RequestError extends Error {
  override readonly name: string = 'RequestError';
  readonly code: string;
  readonly options: NormalizedOptions;
  response?: HttpResponse;

  constructor(
    message: string,
    options: NormalizedOptions,
    code = 'ERR_REQUEST',
    response?: HttpResponse
  ) {
    super(message);
    this.code = code;
    this.options = options;
    this.response = response;
  }
}
