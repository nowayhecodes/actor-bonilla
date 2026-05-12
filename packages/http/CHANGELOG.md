# 1.0.0 (2026-05-10)


### Bug Fixes

* merge conflict ([5d90c45](https://github.com/nowayhecodes/actor-bonilla/commit/5d90c459338479858ba00167995e5a9da48db442))
* **test:** satisfy Receive<void> in smoke actor props ([ae15934](https://github.com/nowayhecodes/actor-bonilla/commit/ae159342f38509426874e6f139600688c08ca7bf))


### Features

* :incoming_envelope: message class ([adabcbf](https://github.com/nowayhecodes/actor-bonilla/commit/adabcbf75c8c4a2a6c3419e632ec35bb1629ed34))
* add http package ([87a8aea](https://github.com/nowayhecodes/actor-bonilla/commit/87a8aeabb9ac09042891d34774d8ae09eba57336))
* basechannel abstract ([9bf6bae](https://github.com/nowayhecodes/actor-bonilla/commit/9bf6bae40e9ba83ddb15c2345c78967861a9acc6))
* fiber acquire ([59ec64e](https://github.com/nowayhecodes/actor-bonilla/commit/59ec64ead8edcb0a934f820f3cad4b330d42351a))
* **http:** add @actor-bonilla/http fetch client ([11b2c58](https://github.com/nowayhecodes/actor-bonilla/commit/11b2c5875c99f88f9eeb03bdcf44d614aa170a06))
* **http:** complete @actor-bonilla/http with Got-feature parity and core integration ([a723d09](https://github.com/nowayhecodes/actor-bonilla/commit/a723d09cb3b38b97b4e09769b2e25664cbfd4974))
* integrate typia runtime validation for configs ([42eae4e](https://github.com/nowayhecodes/actor-bonilla/commit/42eae4ec4070479a85549f4e966427b7e3be7ad1))
* mailbox :mail: ([e7f0609](https://github.com/nowayhecodes/actor-bonilla/commit/e7f0609658131d9d60496807de4d6342dbd480b5))
* Provider<T> type ([0232f78](https://github.com/nowayhecodes/actor-bonilla/commit/0232f78ad8ba6eb303388bc8a39d8c6006d21b41))
* sub again ([cfc1997](https://github.com/nowayhecodes/actor-bonilla/commit/cfc199766264bbabfdc078eb1c0ddc66939c8a06))
* subscription ([09d5ffc](https://github.com/nowayhecodes/actor-bonilla/commit/09d5ffc79debc7eb5b3e4e9cba3310ef3f290762))
* **supervisor:** added supervision strategy ([fc158d4](https://github.com/nowayhecodes/actor-bonilla/commit/fc158d49921cb665b3115b2c1b5a8a8f8fbddb33))

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
