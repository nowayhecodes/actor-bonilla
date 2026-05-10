# Hooks

Hooks let you inject logic at every stage of the request lifecycle without
subclassing `HttpClient`. They are composed when you call `client.extend()` —
child hooks are appended after parent hooks so the whole chain always fires.

---

## Lifecycle order

```
construct
   │
   ▼
 init  ──────────────────────────────── (once per execute(), before everything)
   │
   ▼
 beforeRequest  ─────────────────────── (may mutate / replace NormalizedOptions)
   │
   ├── [cache read] ──────────────────── return early on hit
   │
   ▼
 [network request]
   │
   ├── on error ─────────────────────── beforeError → retry? → throw
   │
   ▼
 [response received]
   │
   ▼
 afterResponse  ─────────────────────── may call retry() to redo the request
   │
   ├── [cache write]
   │
   ▼
 return HttpResponse
```

---

## `init`

Called **once per `execute()` entry**, before `beforeRequest`. Receives the
raw options object and the already-normalised options. Use it to inject
idempotent side-effects (e.g. tracing span creation).

```ts
type InitHook = (
  rawOptions: Partial<Options>,
  normalizedOptions: NormalizedOptions
) => void;
```

```ts
const client = new HttpClient({
  hooks: {
    init: [(raw, normalized) => {
      normalized.headers.set('x-trace-id', crypto.randomUUID());
    }],
  },
});
```

---

## `beforeRequest`

Called after normalisation, just before the network call. May return a
`NormalizedOptions` object to replace the request options entirely, or
`void`/`undefined` to leave them unchanged.

```ts
type BeforeRequestHook = (
  options: NormalizedOptions
) => NormalizedOptions | void | Promise<NormalizedOptions | void>;
```

### Common uses

**Add a dynamic auth header:**

```ts
hooks: {
  beforeRequest: [async (options) => {
    const token = await tokenStore.get();
    options.headers.set('authorization', `Bearer ${token}`);
  }],
}
```

**Log every outgoing request:**

```ts
hooks: {
  beforeRequest: [(options) => {
    console.log(`→ ${options.method} ${options.url.href}`);
  }],
}
```

---

## `afterResponse`

Called once the full response (headers + body) has been received. Receives the
`HttpResponse` and a `retry(mergedOptions)` callback. Return the response
(possibly mutated) or use `retry()` to trigger a new request.

```ts
type AfterResponseHook = (
  response: HttpResponse,
  retry: (mergedOptions: Partial<Options>) => Promise<HttpResponse>
) => HttpResponse | Promise<HttpResponse>;
```

### Common uses

**Refresh a token on 401 and retry:**

```ts
hooks: {
  afterResponse: [async (response, retry) => {
    if (response.statusCode === 401) {
      const newToken = await auth.refresh();
      return retry({
        headers: { authorization: `Bearer ${newToken}` },
      });
    }
    return response;
  }],
}
```

**Normalise a response envelope:**

```ts
hooks: {
  afterResponse: [(response) => {
    if (response.statusCode === 200 && response.body?.data) {
      return { ...response, body: response.body.data };
    }
    return response;
  }],
}
```

---

## `beforeRetry`

Called before each retry delay is applied. Receives `{ options, error, retryCount }`.
Useful for logging, updating auth state, or modifying options before the next attempt.

```ts
type BeforeRetryHook = (state: BeforeRetryState) => void | Promise<void>;

interface BeforeRetryState {
  options: NormalizedOptions;
  error: RequestError;
  retryCount: number;
}
```

```ts
hooks: {
  beforeRetry: [({ error, retryCount }) => {
    console.warn(`Retry #${retryCount + 1} after ${error.code}`);
  }],
}
```

---

## `beforeError`

Called before a `RequestError` (including `HTTPError`, `TimeoutError`, etc.) is
thrown. Must return the same or a replacement error.

```ts
type BeforeErrorHook = (
  error: RequestError
) => RequestError | Promise<RequestError>;
```

```ts
hooks: {
  beforeError: [(error) => {
    if (error instanceof HTTPError && error.response.statusCode === 429) {
      error.message = 'Rate limited — back off and retry';
    }
    return error;
  }],
}
```

---

## `beforeRedirect`

Called before following a redirect. Receives the updated `NormalizedOptions`
(already pointing at the redirect URL) and the response that triggered the redirect.

```ts
type BeforeRedirectHook = (
  options: NormalizedOptions,
  response: HttpResponse
) => void | Promise<void>;
```

```ts
hooks: {
  beforeRedirect: [(options, response) => {
    console.log(`Redirected to ${options.url.href} (was ${response.statusCode})`);
  }],
}
```

---

## Hook composition with `extend()`

Hooks are **appended**, not replaced, when you call `extend()`.

```ts
const base = new HttpClient({
  hooks: { beforeRequest: [hookA] },
});

const child = base.extend({
  hooks: { beforeRequest: [hookB] },
});

// child fires: hookA → hookB
```

This means base-level behaviour (auth, tracing) is always applied first, and
derived clients add their own concerns on top.
