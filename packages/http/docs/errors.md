# Error hierarchy

All errors thrown by `@actor-bonilla/http` extend `RequestError`, which extends
the built-in `Error` class. This lets you catch any library error with a single
`instanceof RequestError` guard while still being able to discriminate on the
specific subclass.

---

## Hierarchy

```
Error
 └─ RequestError         — base class, always has .options and .code
      ├─ HTTPError       — non-2xx / non-3xx response
      ├─ TimeoutError    — request or response phase timed out
      ├─ RetryError      — all retry attempts exhausted
      ├─ ParseError      — body could not be parsed (e.g. malformed JSON)
      ├─ CacheError      — cache read/write failed
      ├─ MaxRedirectsError — redirect chain exceeded maxRedirects
      └─ UnsupportedProtocolError — URL protocol is not http: or https:
```

---

## `RequestError`

```ts
class RequestError extends Error {
  readonly options: NormalizedOptions;  // request options at throw time
  readonly code?: string;               // Node.js error code, e.g. 'ETIMEDOUT'
  readonly response?: HttpResponse;     // present when the server replied
}
```

```ts
import { RequestError } from '@actor-bonilla/http';

try {
  await client.get(url);
} catch (err) {
  if (err instanceof RequestError) {
    console.error(err.message, err.code, err.options.url.href);
  }
}
```

---

## `HTTPError`

Thrown when `throwHttpErrors: true` (default) and the status code is ≥ 400.

```ts
import { HTTPError } from '@actor-bonilla/http';

try {
  await client.get('/resource');
} catch (err) {
  if (err instanceof HTTPError) {
    console.error(
      err.response.statusCode,
      err.response.statusMessage,
      await err.response.rawResponse.text(),
    );
  }
}
```

Disable for specific requests:

```ts
const resp = await client.get('/resource', { throwHttpErrors: false });
if (resp.statusCode === 404) { /* handle gracefully */ }
```

---

## `TimeoutError`

Thrown when the `timeout.request` or `timeout.response` limit is exceeded.

```ts
import { TimeoutError } from '@actor-bonilla/http';

try {
  await client.get(url, { timeout: { request: 3_000 } });
} catch (err) {
  if (err instanceof TimeoutError) {
    console.error(`Timed out at phase: ${err.event}`); // 'request' | 'response'
  }
}
```

---

## `RetryError`

Thrown when all retry attempts have been exhausted.

```ts
import { RetryError } from '@actor-bonilla/http';

try {
  await client.get(url, { retry: { limit: 3, statusCodes: [503] } });
} catch (err) {
  if (err instanceof RetryError) {
    console.error(`Gave up after retries: ${err.message}`);
  }
}
```

---

## `ParseError`

Thrown when `responseType: 'json'` is set and the response body is not valid JSON.

```ts
import { ParseError } from '@actor-bonilla/http';

try {
  await client.get(url, { responseType: 'json' });
} catch (err) {
  if (err instanceof ParseError) {
    console.error('JSON parse failed:', err.cause.message);
  }
}
```

---

## `MaxRedirectsError`

Thrown when the redirect chain exceeds `maxRedirects` (default 10).

```ts
import { MaxRedirectsError } from '@actor-bonilla/http';

try {
  await client.get(url);
} catch (err) {
  if (err instanceof MaxRedirectsError) {
    console.error(`Too many redirects (>${err.options.maxRedirects})`);
    console.error('Redirect chain:', err.response?.redirectUrls);
  }
}
```

---

## `UnsupportedProtocolError`

Thrown when the URL uses a protocol other than `http:` or `https:`.

```ts
import { UnsupportedProtocolError } from '@actor-bonilla/http';

try {
  await client.get('ftp://example.com/file');
} catch (err) {
  if (err instanceof UnsupportedProtocolError) {
    console.error(err.message); // "Unsupported protocol: ftp:"
  }
}
```

---

## Error codes

| Code | Thrown by |
|---|---|
| `ERR_NON_2XX_3XX_RESPONSE` | `HTTPError` |
| `ETIMEDOUT` | `TimeoutError` |
| `ERR_RETRIES_EXHAUSTED` | `RetryError` |
| `ERR_BODY_PARSE` | `ParseError` |
| `ERR_CACHE` | `CacheError` |
| `ERR_TOO_MANY_REDIRECTS` | `MaxRedirectsError` |
| `ERR_UNSUPPORTED_PROTOCOL` | `UnsupportedProtocolError` |
| `ERR_REQUEST` | Generic `RequestError` |

---

## Enriching errors with `beforeError` hook

```ts
const client = new HttpClient({
  hooks: {
    beforeError: [async (error) => {
      if (error instanceof HTTPError) {
        const body = await error.response.rawResponse.text().catch(() => '');
        error.message += ` — server said: ${body.slice(0, 200)}`;
      }
      return error;
    }],
  },
});
```

The `beforeError` hook is called for every error before it is thrown, including
during retries. Return the same or a new `RequestError`.

---

## Error events on the actor event stream

Every thrown error is also published to `HTTP_ERROR_CHANNEL`:

```ts
import { HTTP_ERROR_CHANNEL } from '@actor-bonilla/http';
import type { EventClassifier } from '@actor-bonilla/core';

client.actorSystem.eventStream.subscribe<{ url: string; error: RequestError }>(
  HTTP_ERROR_CHANNEL as EventClassifier,
  ({ url, error }) => {
    metrics.increment('http.error', { url, code: error.code });
  }
);
```
