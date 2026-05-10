# Actor System integration

`@actor-bonilla/http` is built on top of `@actor-bonilla/core`.  
Every `HttpClient` instance owns (or shares) an `ActorSystem` and uses it for:

- **Cache actor** — serialises all cache reads and writes.
- **Semaphore** — concurrency gate backed by the actor message queue.
- **Event stream** — publishes structured events for every request lifecycle phase.
- **Progress events** — upload / download progress published as actor messages.

---

## Sharing an `ActorSystem`

By default, each `HttpClient` creates its own private system. To share one
across clients — and subscribe to all HTTP events from a single place — pass
your system at construction time:

```ts
import { ActorSystem } from '@actor-bonilla/core';
import { HttpClient, HTTP_REQUEST_CHANNEL, HTTP_RESPONSE_CHANNEL, HTTP_ERROR_CHANNEL } from '@actor-bonilla/http';
import type { EventClassifier } from '@actor-bonilla/core';

const system = new ActorSystem({ name: 'my-app' });

const apiClient  = new HttpClient({ actorSystem: system, prefixUrl: 'https://api.example.com' });
const cdnClient  = new HttpClient({ actorSystem: system, prefixUrl: 'https://cdn.example.com' });

// All events from both clients flow through the same stream
system.eventStream.subscribe<{ url: string; method: string }>(
  HTTP_REQUEST_CHANNEL as EventClassifier,
  ({ url, method }) => logger.info('http.request', { url, method })
);
```

When the system is supplied externally, `client.destroy()` **does not** shut it
down — you manage its lifecycle.

---

## Event stream channels

| Constant | Payload type | When fired |
|---|---|---|
| `HTTP_REQUEST_CHANNEL` | `{ url: string; method: string }` | Before the network call |
| `HTTP_RESPONSE_CHANNEL` | `{ url: string; statusCode: number }` | After a successful response |
| `HTTP_ERROR_CHANNEL` | `{ url: string; error: RequestError }` | When an error is thrown |
| `HTTP_PROGRESS_CHANNEL` | `HttpProgressEvent` | During upload / download progress |

### `HttpProgressEvent`

```ts
interface HttpProgressEvent {
  direction: 'upload' | 'download';
  progress: {
    transferred: number;   // bytes so far
    total?: number;        // total bytes (undefined if Content-Length absent)
    percent: number;       // 0–1; NaN when total is unknown
  };
}
```

---

## Subscribing to events

```ts
import type { HttpProgressEvent } from '@actor-bonilla/http';
import type { EventClassifier } from '@actor-bonilla/core';

client.actorSystem.eventStream.subscribe<HttpProgressEvent>(
  HTTP_PROGRESS_CHANNEL as EventClassifier,
  (event) => {
    if (event.direction === 'download') {
      const pct = isNaN(event.progress.percent)
        ? '??'
        : `${(event.progress.percent * 100).toFixed(0)}%`;
      process.stdout.write(`\rDownload: ${pct} (${event.progress.transferred} B)`);
    }
  }
);
```

---

## `onDownloadProgress` / `onUploadProgress` callbacks

For simpler use-cases you can attach per-request callbacks in `Options`:

```ts
await client.get('/large-file', {
  responseType: 'buffer',
  onDownloadProgress: ({ progress }) => {
    const pct = (progress.percent * 100).toFixed(0);
    process.stdout.write(`\r${pct}%`);
  },
});
```

These are fired in addition to the event stream — not instead of it.

---

## Concurrency control — Semaphore

Every `HttpClient` instance gates requests through an async `Semaphore`.  
The maximum number of simultaneous in-flight requests is controlled by
`options.maxConcurrent` (default `256`).

```ts
// Limit to 10 parallel requests
const client = new HttpClient({ maxConcurrent: 10 });

// Fire 100 requests — only 10 run at once
const results = await Promise.all(
  urls.map((url) => client.getJson(url))
);
```

The `Semaphore` itself is a standalone export:

```ts
import { Semaphore } from '@actor-bonilla/http';

const sem = new Semaphore(5);

await sem.acquire();
try {
  // exclusive section
} finally {
  sem.release();
}

console.log(sem.available); // remaining permits
console.log(sem.waiting);   // queue length
```

---

## Cache actor internals

The `CacheActor` is a plain actor spawned during `HttpClient` construction.

```
HttpClient
  │
  ├─ ActorSystem
  │     └─ CacheActor (/http-cache-<id>)
  │           receive: CacheMsg → { type: 'GET' | 'SET' | 'CLEAR' }
  │
  └─ Semaphore  (maxConcurrent permits)
```

Messages:

| Type | Direction | Description |
|---|---|---|
| `GET` | `ask()` — awaited | Returns `CacheEntry \| null` |
| `SET` | `tell()` — fire-and-forget | Stores entry with optional TTL |
| `CLEAR` | `tell()` — fire-and-forget | Purges all entries |

---

## Graceful shutdown

```ts
// Stops the CacheActor; terminates the ActorSystem if owned by this client
await client.destroy();
```

Always call `destroy()` before your process exits to avoid dangling actor
message queues and worker threads.

When multiple clients share the same `ActorSystem`, call `destroy()` on each
client, then `await system.terminate()` once all clients are done.

```ts
await Promise.all([apiClient.destroy(), cdnClient.destroy()]);
await system.terminate();
```
