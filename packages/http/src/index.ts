// ============================================================================
// @actor-bonilla/http — Public API
// ============================================================================

// Types
export type {
  HttpMethod,
  TimeoutOptions,
  RetryOptions,
  RetryObject,
  ProgressEvent,
  BeforeRetryState,
  BeforeRequestHook,
  AfterResponseHook,
  BeforeErrorHook,
  BeforeRetryHook,
  BeforeRedirectHook,
  InitHook,
  Hooks,
  CacheEntry,
  CacheStore,
  PaginationOptions,
  HttpsOptions,
  Options,
  NormalizedOptions,
  Timings,
  HttpResponse,
  HttpProgressEvent,
} from './types.js';

export {
  RequestError,
  HTTP_PROGRESS_CHANNEL,
  HTTP_REQUEST_CHANNEL,
  HTTP_RESPONSE_CHANNEL,
  HTTP_ERROR_CHANNEL,
} from './types.js';

// Errors
export {
  HTTPError,
  TimeoutError,
  RetryError,
  ParseError,
  CacheError,
  MaxRedirectsError,
  UnsupportedProtocolError,
  normalizeError,
} from './errors.js';

// Cache
export {
  MemoryCache,
  buildCacheKey,
  parseCacheControl,
  computeTtl,
  isCacheableMethod,
  isCacheableStatus,
  isStale,
} from './cache.js';

// Concurrency
export { Semaphore } from './semaphore.js';

// Client
export {
  HttpClient,
  http,
} from './client.js';

// Pagination helpers
export {
  paginateByNextUrl,
  paginateByOffset,
  paginateByPage,
  paginateByLinkHeader,
  paginateByCursor,
} from './paginator.js';

// Defaults
export {
  DEFAULT_RETRY,
  DEFAULT_TIMEOUT,
  DEFAULT_HOOKS,
  RETRY_METHODS,
  RETRY_STATUS_CODES,
  RETRY_ERROR_CODES,
  IDEMPOTENT_METHODS,
  defaultRetryDelay,
} from './defaults.js';
