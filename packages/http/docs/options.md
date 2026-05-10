# Options reference

All fields are optional unless noted. Pass them to `new HttpClient(options)` or to any
per-request call such as `client.get(url, options)`.

---

## URL & method

| Option | Type | Default | Description |
|---|---|---|---|
| `url` | `string \| URL` | — | Target URL. Required when not set via `prefixUrl`. |
| `prefixUrl` | `string \| URL` | — | Prefix prepended to every relative URL. |
| `method` | `HttpMethod` | `'GET'` | HTTP method. |
| `searchParams` | `string \| Record<string,…> \| URLSearchParams` | — | Appended to the URL query string. |

### `prefixUrl` behaviour

```ts
const client = new HttpClient({ prefixUrl: 'https://api.example.com/v2' });

// Resolves to https://api.example.com/v2/users
await client.get('users');
```

Leading slashes in the path are stripped when a `prefixUrl` is set.

---

## Request body

| Option | Type | Default | Description |
|---|---|---|---|
| `json` | `unknown` | — | Serialised with `JSON.stringify`, sets `Content-Type: application/json`. |
| `body` | `BodyInit` | — | Raw fetch body. Not combined with `json`. |
| `form` | `Record<string, string \| number \| boolean>` | — | URL-encoded form body. Sets `Content-Type: application/x-www-form-urlencoded`. |
| `headers` | `HeadersInit` | — | Per-request headers merged with instance headers. |

---

## Response

| Option | Type | Default | Description |
|---|---|---|---|
| `responseType` | `'text' \| 'json' \| 'buffer' \| 'stream'` | `'text'` | How to parse the response body. `'buffer'` returns `Uint8Array`. `'stream'` keeps the raw `ReadableStream`. |
| `resolveBodyOnly` | `boolean` | `false` | When `true`, the Promise resolves to the body directly instead of an `HttpResponse`. |
| `throwHttpErrors` | `boolean` | `true` | Throw `HTTPError` for non-2xx / non-3xx responses. |

---

## Timeout

Pass a number (milliseconds applied to `request`) or the full `TimeoutOptions` object.

```ts
// shorthand
await client.get(url, { timeout: 5_000 });

// fine-grained
await client.get(url, {
  timeout: {
    request: 5_000,   // total request+response time
    response: 3_000,  // time until first byte
  },
});
```

| Field | Type | Default | Description |
|---|---|---|---|
| `request` | `number` | `0` (disabled) | Milliseconds before the entire request is aborted. |
| `response` | `number` | `0` (disabled) | Milliseconds until the response headers arrive. |

---

## Retry

Pass a number (retry limit) or the full `RetryOptions` object.

```ts
// shorthand
await client.get(url, { retry: 3 });

// fine-grained
await client.get(url, {
  retry: {
    limit: 3,
    methods: ['GET', 'PUT'],
    statusCodes: [429, 502, 503, 504],
    calculateDelay: ({ retryCount, retryAfter }) =>
      retryAfter ?? Math.min(1_000 * 2 ** retryCount, 30_000),
    backoffLimit: 30_000,
  },
});
```

| Field | Type | Default | Description |
|---|---|---|---|
| `limit` | `number` | `2` | Maximum number of retries. |
| `methods` | `HttpMethod[]` | `['GET','PUT','HEAD','DELETE','OPTIONS','TRACE']` | Methods eligible for retry. |
| `statusCodes` | `number[]` | `[408,413,429,500,502,503,504,521,522,524]` | Status codes that trigger a retry. |
| `errorCodes` | `string[]` | `['ETIMEDOUT','ECONNRESET',…]` | Node.js error codes that trigger a retry. |
| `calculateDelay` | `(obj: RetryObject) => number` | Exponential back-off | Custom delay in ms. |
| `backoffLimit` | `number` | `Infinity` | Hard upper limit on calculated delay. |

---

## Authentication

```ts
const client = new HttpClient({
  username: 'user',
  password: 'pass',
});
// Adds Authorization: Basic <base64> to every request
```

| Option | Type | Description |
|---|---|---|
| `username` | `string` | HTTP Basic Auth username. |
| `password` | `string` | HTTP Basic Auth password. |

---

## Redirects

| Option | Type | Default | Description |
|---|---|---|---|
| `followRedirect` | `boolean` | `true` | Follow 3xx redirects. |
| `maxRedirects` | `number ≥ 0` | `10` | Maximum redirect chain length. |

---

## Concurrency

| Option | Type | Default | Description |
|---|---|---|---|
| `maxConcurrent` | `number ≥ 1` | `256` | Maximum simultaneous in-flight requests. Backed by an async `Semaphore` actor. |

---

## Progress events

```ts
const client = new HttpClient({
  onDownloadProgress: (event) => {
    console.log(`${(event.progress.percent * 100).toFixed(0)}% downloaded`);
  },
  onUploadProgress: (event) => {
    console.log(`${(event.progress.percent * 100).toFixed(0)}% uploaded`);
  },
});
```

Progress is also published on the actor event stream (`HTTP_PROGRESS_CHANNEL`).

---

## Caching

```ts
// Use the built-in MemoryCache
const client = new HttpClient({ cache: true });

// Bring your own CacheStore
import { MemoryCache } from '@actor-bonilla/http';
const store = new MemoryCache();
const client2 = new HttpClient({ cache: store });
```

See [caching.md](./caching.md) for full details.

---

## Hooks

```ts
const client = new HttpClient({
  hooks: {
    beforeRequest: [(options) => { /* mutate or log */ }],
    afterResponse:  [(response, retry) => response],
    beforeRetry:    [({ options, error, retryCount }) => { /* delay, log */ }],
    beforeError:    [(error) => error],
    beforeRedirect: [(options, response) => { /* mutate options */ }],
    init:           [(raw, normalized) => { /* called once on execute entry */ }],
  },
});
```

See [hooks.md](./hooks.md) for the full lifecycle and signatures.

---

## Pagination

```ts
import { paginateByLinkHeader } from '@actor-bonilla/http';

for await (const item of client.paginate('/items', {
  pagination: { paginate: paginateByLinkHeader() },
})) { /* ... */ }
```

See [pagination.md](./pagination.md) for all strategies and options.

---

## Actor System

```ts
import { ActorSystem } from '@actor-bonilla/core';

const system = new ActorSystem({ name: 'my-app' });
const client = new HttpClient({ actorSystem: system });

// Subscribe to HTTP events on your own system
system.eventStream.subscribe(HTTP_RESPONSE_CHANNEL, ({ statusCode }) => { /* ... */ });
```

When `actorSystem` is not provided, the client creates its own private system and
shuts it down on `client.destroy()`.
