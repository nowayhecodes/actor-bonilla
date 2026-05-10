# @actor-bonilla/http

A production-grade HTTP client built on the native `fetch` API and powered by the
`@actor-bonilla/core` actor system.

---

## Contents

| Document | Description |
|---|---|
| [options.md](./options.md) | Full `Options` reference |
| [hooks.md](./hooks.md) | Lifecycle hooks |
| [pagination.md](./pagination.md) | Pagination API |
| [caching.md](./caching.md) | RFC-lite caching |
| [errors.md](./errors.md) | Error hierarchy |
| [actor-integration.md](./actor-integration.md) | Actor system, event stream & concurrency |

---

## Quick start

```ts
import { HttpClient } from '@actor-bonilla/http';

const client = new HttpClient({ prefixUrl: 'https://api.example.com' });

// GET + JSON
const user = await client.getJson<User>('/users/1');

// POST JSON
const created = await client.postJson<User>('/users', { name: 'Gustavo' });

// Cleanup when done
await client.destroy();
```

## HTTP methods

Every method returns `Promise<HttpResponse<T>>`.

```ts
await client.get('/path');
await client.post('/path', { json: { key: 'value' } });
await client.put('/path', { json: payload });
await client.patch('/path', { json: patch });
await client.delete('/path');
await client.head('/path');
await client.options('/path');
```

## JSON shortcuts

```ts
// GET body directly
const body = await client.getJson<MyType>('/endpoint');

// POST JSON body, return parsed response
const result = await client.postJson<MyType>('/endpoint', { key: 'value' });
```

## Request options

```ts
await client.get('/search', {
  searchParams: { q: 'actor model', page: 1 },
  headers: { 'x-api-key': 'my-key' },
  responseType: 'json',
  timeout: { request: 5_000 },
  retry: { limit: 3 },
});
```

See [options.md](./options.md) for the full reference.

## Extending a client

```ts
// Derive a new client that inherits all options, deep-merges hooks
const apiClient = new HttpClient({ prefixUrl: 'https://api.example.com' });

const authedClient = apiClient.extend({
  headers: { authorization: 'Bearer token' },
});

const adminClient = authedClient.extend({
  headers: { 'x-admin': 'true' },
  timeout: { request: 30_000 },
});
```

## Streaming

```ts
const stream = await client.stream('https://api.example.com/large-file');
const reader = stream.getReader();

for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  process.stdout.write(new TextDecoder().decode(value));
}
```

## Pagination

```ts
import { paginateByLinkHeader } from '@actor-bonilla/http';

for await (const item of client.paginate('/posts', {
  responseType: 'json',
  pagination: { paginate: paginateByLinkHeader() },
})) {
  console.log(item);
}
```

See [pagination.md](./pagination.md) for all built-in strategies.

## Lifecycle

```ts
const client = new HttpClient(options);

// ...use client...

await client.destroy(); // gracefully shuts down the internal actor system
```

If you supply your own `ActorSystem` via `options.actorSystem`, `destroy()` is a
no-op for the system — you manage its lifecycle.
