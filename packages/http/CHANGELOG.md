# Changelog

## [1.0.0] — 2026-05-09

### Added

- Initial **`@actor-bonilla/http`** package: `HttpClient` on **Node’s native `fetch`** (Undici on Node 20+), with `prefixUrl`, default headers, timeouts, Got-style **retry** (status codes + network errors), and **beforeRequest** / **afterResponse** hooks.
