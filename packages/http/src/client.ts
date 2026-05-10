/**
 * Fetch-based HTTP client with timeouts, retries, and hooks (Got-inspired ergonomics).
 * Uses global `fetch` (Node 20+ ships Undici-backed fetch).
 */

export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'HEAD'
  | 'OPTIONS'
  | 'TRACE';

/** Status codes that default retry considers retryable (along with network failures). */
export const DEFAULT_RETRY_STATUS_CODES: ReadonlySet<number> = new Set([
  408, 413, 429, 500, 502, 503, 504, 521, 522, 524,
]);

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
  afterResponse?: (
    response: Response,
    request: Request
  ) => Response | Promise<Response>;
  beforeRetry?: (
    error: unknown,
    attempt: number,
    request: Request
  ) => void | Promise<void>;
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

function mergeHeaders(...parts: (HeadersInit | undefined)[]): Headers {
  const out = new Headers();
  for (const part of parts) {
    if (part === undefined) continue;
    new Headers(part).forEach((value, key) => {
      out.set(key, value);
    });
  }
  return out;
}

export function defaultRetryDelay(attempt: number): number {
  const jitter = Math.random() * 80;
  return Math.min(350 * 2 ** (attempt - 1), 35_000) + jitter;
}

function methodAllowsRetry(method: string, retry: HttpRetryOptions): boolean {
  const allowed = retry.methods ?? [
    'GET',
    'PUT',
    'HEAD',
    'DELETE',
    'OPTIONS',
    'TRACE',
  ];
  return allowed.includes(method.toUpperCase() as HttpMethod);
}

function shouldRetryStatus(
  code: number,
  retry: HttpRetryOptions,
  method: string
): boolean {
  if (!methodAllowsRetry(method, retry)) return false;
  const set = retry.statusCodes ?? DEFAULT_RETRY_STATUS_CODES;
  return set.has(code);
}

function combineSignals(signals: AbortSignal[]): AbortSignal | undefined {
  if (signals.length === 0) return undefined;
  if (signals.length === 1) return signals[0];
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any(signals);
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  for (const s of signals) {
    if (s.aborted) {
      controller.abort();
      break;
    }
    s.addEventListener('abort', onAbort, { once: true });
  }
  return controller.signal;
}

export class HttpClient {
  private readonly options: HttpClientOptions;

  constructor(options: HttpClientOptions = {}) {
    this.options = options;
  }

  private resolveUrl(url: string | URL): string {
    const href = typeof url === 'string' ? url : url.href;
    if (!this.options.prefixUrl) return href;
    return new URL(href, this.options.prefixUrl).href;
  }

  private async buildRequest(url: string, init: RequestInit): Promise<Request> {
    const headers = mergeHeaders(this.options.headers, init.headers);
    let req = new Request(url, { ...init, headers });
    if (this.options.hooks?.beforeRequest) {
      req = await this.options.hooks.beforeRequest(req);
    }
    return req;
  }

  async request(url: string | URL, init: RequestInit = {}): Promise<Response> {
    const fetchFn = this.options.fetch ?? globalThis.fetch;
    const resolved = this.resolveUrl(url);
    const retryCfg = this.options.retry;
    const maxAttempts = retryCfg ? retryCfg.limit + 1 : 1;

    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const timeoutController =
        this.options.timeoutMs !== undefined
          ? new AbortController()
          : null;
      const timer =
        timeoutController &&
        setTimeout(() => timeoutController.abort(), this.options.timeoutMs);

      try {
        const signals: AbortSignal[] = [];
        if (init.signal) signals.push(init.signal);
        if (timeoutController) signals.push(timeoutController.signal);
        const mergedSignal = combineSignals(signals);

        let req = await this.buildRequest(resolved, {
          ...init,
          signal: mergedSignal ?? init.signal,
        });

        let res = await fetchFn(req);

        if (timer) clearTimeout(timer);

        if (
          retryCfg &&
          attempt < maxAttempts &&
          shouldRetryStatus(
            res.status,
            retryCfg,
            req.method
          )
        ) {
          await this.options.hooks?.beforeRetry?.(
            new Error(`HTTP ${res.status}`),
            attempt,
            req
          );
          await sleep(
            retryCfg.calculateDelay?.(attempt) ?? defaultRetryDelay(attempt)
          );
          continue;
        }

        if (this.options.hooks?.afterResponse) {
          res = await this.options.hooks.afterResponse(res, req);
        }

        return res;
      } catch (err) {
        lastError = err;
        if (timer) clearTimeout(timer);

        if (
          !retryCfg ||
          attempt >= maxAttempts ||
          !methodAllowsRetry(
            (init.method ?? 'GET').toUpperCase(),
            retryCfg
          )
        ) {
          throw err;
        }

        await this.options.hooks?.beforeRetry?.(err, attempt, new Request(resolved, init));
        await sleep(
          retryCfg.calculateDelay?.(attempt) ?? defaultRetryDelay(attempt)
        );
      }
    }

    throw lastError ?? new Error('HTTP request failed');
  }

  get(url: string | URL, init?: RequestInit): Promise<Response> {
    return this.request(url, { ...init, method: 'GET' });
  }

  post(url: string | URL, init?: RequestInit): Promise<Response> {
    return this.request(url, { ...init, method: 'POST' });
  }

  put(url: string | URL, init?: RequestInit): Promise<Response> {
    return this.request(url, { ...init, method: 'PUT' });
  }

  patch(url: string | URL, init?: RequestInit): Promise<Response> {
    return this.request(url, { ...init, method: 'PATCH' });
  }

  delete(url: string | URL, init?: RequestInit): Promise<Response> {
    return this.request(url, { ...init, method: 'DELETE' });
  }

  head(url: string | URL, init?: RequestInit): Promise<Response> {
    return this.request(url, { ...init, method: 'HEAD' });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
