// ============================================================================
// @actor-bonilla/http — Options normalization
// ============================================================================

import type {
  Options,
  NormalizedOptions,
  RetryOptions,
  TimeoutOptions,
  Hooks,
  CacheStore,
  PaginationOptions,
} from './types.js';
import {
  DEFAULT_TIMEOUT,
  DEFAULT_RETRY,
  DEFAULT_HOOKS,
  defaultRetryDelay,
} from './defaults.js';
import { MemoryCache } from './cache.js';
import {
  assertRetryOptions,
  assertTimeoutOptions,
  assertPaginationOptions,
} from './validation.js';

// ─── URL helpers ─────────────────────────────────────────────────────────────

export function resolveUrl(url: string | URL, prefixUrl?: string | URL): URL {
  const href = typeof url === 'string' ? url : url.href;
  if (!prefixUrl) return new URL(href);
  const base = typeof prefixUrl === 'string' ? prefixUrl : prefixUrl.href;
  const normalBase = base.endsWith('/') ? base : `${base}/`;
  const relative = href.startsWith('/') ? href.slice(1) : href;
  return new URL(relative, normalBase);
}

export function applySearchParams(
  url: URL,
  searchParams: Options['searchParams']
): URL {
  if (!searchParams) return url;
  const out = new URL(url.href);
  const usp =
    searchParams instanceof URLSearchParams
      ? searchParams
      : new URLSearchParams(searchParams as Record<string, string>);
  usp.forEach((v, k) => out.searchParams.append(k, v));
  return out;
}

// ─── Header helpers ───────────────────────────────────────────────────────────

export function mergeHeaders(
  ...parts: (HeadersInit | Headers | undefined)[]
): Headers {
  const out = new Headers();
  for (const part of parts) {
    if (!part) continue;
    const h = part instanceof Headers ? part : new Headers(part as HeadersInit);
    h.forEach((v, k) => out.set(k, v));
  }
  return out;
}

// ─── Retry normalization ─────────────────────────────────────────────────────

function normalizeRetry(retry: Options['retry']): RetryOptions {
  let base: RetryOptions;
  if (retry === undefined || retry === null) {
    base = { ...DEFAULT_RETRY };
  } else if (typeof retry === 'number') {
    base = { ...DEFAULT_RETRY, limit: retry };
  } else {
    base = { ...DEFAULT_RETRY };
    if (retry.limit !== undefined) base.limit = retry.limit;
    if (retry.methods) base.methods = retry.methods;
    if (retry.statusCodes) base.statusCodes = retry.statusCodes;
    if (retry.errorCodes) base.errorCodes = retry.errorCodes;
    if (retry.calculateDelay) base.calculateDelay = retry.calculateDelay;
    if (retry.backoffLimit !== undefined) base.backoffLimit = retry.backoffLimit;
    if (retry.maxRetryAfter !== undefined) base.maxRetryAfter = retry.maxRetryAfter;
  }
  assertRetryOptions(base);
  return base;
}

// ─── Timeout normalization ────────────────────────────────────────────────────

function normalizeTimeout(timeout: Options['timeout']): TimeoutOptions {
  let resolved: TimeoutOptions;
  if (timeout === undefined) {
    resolved = { ...DEFAULT_TIMEOUT };
  } else if (typeof timeout === 'number') {
    resolved = { request: timeout };
  } else {
    resolved = { ...DEFAULT_TIMEOUT, ...timeout };
  }
  assertTimeoutOptions(resolved);
  return resolved;
}

// ─── Hooks normalization ──────────────────────────────────────────────────────

function normalizeHooks(hooks: Options['hooks']): Hooks {
  if (!hooks) return { ...DEFAULT_HOOKS };
  return {
    init: [...DEFAULT_HOOKS.init, ...(hooks.init ?? [])],
    beforeRequest: [...DEFAULT_HOOKS.beforeRequest, ...(hooks.beforeRequest ?? [])],
    afterResponse: [...DEFAULT_HOOKS.afterResponse, ...(hooks.afterResponse ?? [])],
    beforeError: [...DEFAULT_HOOKS.beforeError, ...(hooks.beforeError ?? [])],
    beforeRetry: [...DEFAULT_HOOKS.beforeRetry, ...(hooks.beforeRetry ?? [])],
    beforeRedirect: [...DEFAULT_HOOKS.beforeRedirect, ...(hooks.beforeRedirect ?? [])],
  };
}

// ─── Cache normalization ──────────────────────────────────────────────────────

function normalizeCache(cache: Options['cache']): false | CacheStore {
  if (!cache) return false;
  if (cache === true) return new MemoryCache();
  return cache;
}

// ─── Main normalize function ──────────────────────────────────────────────────

export function normalizeOptions(
  base: Partial<Options>,
  override: Partial<Options> = {}
): NormalizedOptions {
  const merged = mergeOptionObjects(base, override);

  if (!merged.url && !merged.prefixUrl) {
    throw new TypeError('A URL is required');
  }

  const rawUrl = merged.url ?? merged.prefixUrl!;
  let url = resolveUrl(rawUrl, merged.prefixUrl && merged.url ? merged.prefixUrl : undefined);
  url = applySearchParams(url, merged.searchParams);

  const retry = normalizeRetry(merged.retry);

  // Fill in calculateDelay if not set
  if (retry.calculateDelay === DEFAULT_RETRY.calculateDelay) {
    const userCalc = retry.calculateDelay;
    retry.calculateDelay = (obj) => {
      const computed = defaultRetryDelay(obj.retryCount, obj.retryAfter);
      return Math.min(
        userCalc({ ...obj, computedValue: computed }),
        retry.backoffLimit
      );
    };
  }

  const headers = buildHeaders(merged);

  const maxRedirects = merged.maxRedirects ?? 10;
  if (maxRedirects < 0) {
    throw new RangeError(`maxRedirects must be >= 0, got ${maxRedirects}`);
  }

  const maxConcurrent = merged.maxConcurrent ?? 256;
  if (maxConcurrent < 1) {
    throw new RangeError(`maxConcurrent must be >= 1, got ${maxConcurrent}`);
  }

  if (merged.pagination !== undefined) {
    assertPaginationOptions(merged.pagination as PaginationOptions<unknown>);
  }

  return {
    url,
    method: (merged.method?.toUpperCase() as NormalizedOptions['method']) ?? 'GET',
    headers,
    body: merged.body,
    json: merged.json,
    form: merged.form,
    timeout: normalizeTimeout(merged.timeout),
    retry,
    hooks: normalizeHooks(merged.hooks),
    followRedirects: merged.followRedirects ?? true,
    maxRedirects,
    decompress: merged.decompress ?? true,
    username: merged.username,
    password: merged.password,
    responseType: merged.responseType ?? 'text',
    resolveBodyOnly: merged.resolveBodyOnly ?? false,
    encoding: merged.encoding ?? 'utf8',
    cache: normalizeCache(merged.cache),
    throwHttpErrors: merged.throwHttpErrors ?? true,
    credentials: merged.credentials ?? 'same-origin',
    signal: merged.signal,
    onUploadProgress: merged.onUploadProgress,
    onDownloadProgress: merged.onDownloadProgress,
    pagination: merged.pagination,
    maxConcurrent,
    proxy: merged.proxy,
    https: merged.https,
  };
}

/** Deep-merge two option objects (headers merged, hook arrays concatenated). */
export function mergeOptionObjects(
  a: Partial<Options>,
  b: Partial<Options>
): Partial<Options> {
  const merged: Partial<Options> = { ...a, ...b };

  // Merge headers (b wins per-key, both preserved)
  if (a.headers || b.headers) {
    merged.headers = mergeHeaders(a.headers, b.headers);
  }

  // Merge hooks arrays
  if (a.hooks || b.hooks) {
    merged.hooks = {};
    const allKeys: (keyof Required<Options>['hooks'])[] = [
      'init', 'beforeRequest', 'afterResponse', 'beforeError', 'beforeRetry', 'beforeRedirect',
    ];
    for (const key of allKeys) {
      const aArr = (a.hooks?.[key] ?? []) as unknown[];
      const bArr = (b.hooks?.[key] ?? []) as unknown[];
      (merged.hooks as Record<string, unknown[]>)[key] = [...aArr, ...bArr];
    }
  }

  return merged;
}

function buildHeaders(options: Partial<Options>): Headers {
  const h = mergeHeaders(options.headers);

  if (options.json !== undefined) {
    if (!h.has('content-type')) {
      h.set('content-type', 'application/json');
    }
    if (!h.has('accept')) {
      h.set('accept', 'application/json');
    }
  }

  if (options.form !== undefined) {
    if (!h.has('content-type')) {
      h.set('content-type', 'application/x-www-form-urlencoded');
    }
  }

  if (options.username || options.password) {
    const encoded = Buffer.from(
      `${options.username ?? ''}:${options.password ?? ''}`
    ).toString('base64');
    h.set('authorization', `Basic ${encoded}`);
  }

  return h;
}
