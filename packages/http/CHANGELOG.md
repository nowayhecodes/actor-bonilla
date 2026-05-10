# Changelog

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.1.0] — 2026-05-10

### Added

- **Full options surface** — `json` body mode (auto Content-Type + Accept), `form` encoding (`application/x-www-form-urlencoded`), `searchParams`, `prefixUrl`, `credentials`, `decompress`, `resolveBodyOnly`, `encoding`, `proxy`, `https` options.
- **Rich error hierarchy** — `HTTPError`, `TimeoutError`, `ParseError`, `RetryError`, `CacheError`, `MaxRedirectsError`, `UnsupportedProtocolError`, each carrying the originating options and optional `HttpResponse`.
- **Advanced retry** — `Retry-After` header awareness, configurable `methods`/`statusCodes`/`errorCodes`, `backoffLimit`, custom `calculateDelay`, exponential back-off with jitter.
- **Full hooks pipeline** — `init`, `beforeRequest`, `afterResponse` (with `retryWith`), `beforeError`, `beforeRetry`, `beforeRedirect`.
- **RFC-lite caching** — `Cache-Control`/`Expires` TTL parsing, `ETag`/`Last-Modified` metadata storage, `Vary` header key extraction, pluggable `CacheStore` interface, built-in `MemoryCache`.
- **Download progress** — streamed chunk-by-chunk via `ReadableStream` reader; `onDownloadProgress` callback and `HTTP_PROGRESS_CHANNEL` EventStream events.
- **Streaming mode** — `responseType: 'stream'` returns raw `ReadableStream<Uint8Array>`; `.stream()` convenience helper.
- **Pagination** — `.paginate<T>()` async generator with `transform`, `paginate`, `filter`, `shouldContinue`, `countLimit`, `backoff`, `requestLimit`, `stackAllItems` options. Five ready-made helpers: `paginateByNextUrl`, `paginateByOffset`, `paginateByPage`, `paginateByLinkHeader`, `paginateByCursor`.
- **Instance extension** — `.extend(options)` inherits base options and concatenates hook arrays; shared `ActorSystem` across the chain.
- **`@actor-bonilla/core` integration** — `ActorSystem` EventStream channels (`HTTP_PROGRESS_CHANNEL`, `HTTP_REQUEST_CHANNEL`, `HTTP_RESPONSE_CHANNEL`, `HTTP_ERROR_CHANNEL`); `CacheActor` manages cache state as actor-system state; `Semaphore` enforces `maxConcurrent` request throttling.
- **Typia tags** — Numeric constraint annotations (`tags.Minimum`) on `RetryOptions`, `TimeoutOptions`, and `PaginationOptions` fields for type-level validation.
- **`Semaphore`** — standalone async counting semaphore, exported for general use.
- **Default `http` singleton** — module-level `HttpClient` instance for quick one-liner requests.

### Changed

- Chunk concatenation in `readBody` rewritten to single pre-allocated `Uint8Array` (O(n) instead of O(n²)).
- Retry status-code lookup now uses a `Set` for O(1) membership test.
- Network-error code lookup uses a frozen `Set` rather than an array.

### Fixed

- `mergeOptionObjects` now deep-merges `headers` (both parent and child headers are preserved; child wins on conflicts) instead of replacing.
- `MemoryCache.set` with `ttl = 0` now correctly marks the entry as immediately expired (`expiresAt = 0`).
- Hoisted `MemoryCache` import moved to top of `client.ts` to avoid temporal-dead-zone risk.

---

## [1.0.0] — 2026-05-09

### Added

- Initial **`@actor-bonilla/http`** package: `HttpClient` on Node's native `fetch` (Undici on Node 20+), with `prefixUrl`, default headers, timeouts, retry (status codes + network errors), and `beforeRequest` / `afterResponse` / `beforeRetry` hooks.
