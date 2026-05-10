# Caching

`@actor-bonilla/http` ships an RFC-compliant HTTP cache backed by an actor
(`CacheActor`) so all cache reads and writes are fully asynchronous and
thread-safe within the actor system.

---

## Enabling the cache

```ts
// Built-in in-memory cache
const client = new HttpClient({ cache: true });

// Bring your own CacheStore implementation
import { MemoryCache } from '@actor-bonilla/http';
const store = new MemoryCache();
const client = new HttpClient({ cache: store });

// Disable caching (default)
const client = new HttpClient({ cache: false });
```

---

## What gets cached

Only **safe, idempotent methods** are cached: `GET` and `HEAD`.

Responses are stored only when the status code is one of:
`200`, `203`, `204`, `206`, `300`, `301`, `404`, `405`, `410`, `414`, `501`.

The TTL is derived from the response headers in this priority order:

| Header directive | Behaviour |
|---|---|
| `cache-control: no-store` | Never cached |
| `cache-control: immutable` | TTL = 1 year |
| `cache-control: s-maxage=N` | TTL = N seconds |
| `cache-control: max-age=N` | TTL = N seconds |
| `cache-control: no-cache` | TTL = 0 (always revalidate) |
| `expires: <date>` | TTL = (date − now) seconds |
| _(none)_ | Not stored |

---

## Cache-key construction

The cache key is:

```
{METHOD}:{url}[|v:{vary-header-name}:{value}|…]
```

`Vary` response headers are respected. If the server returns `Vary: Accept-Encoding`,
separate cache entries are kept for `gzip` and `identity` requests.

---

## `HttpResponse.fromCache`

Every response carries a `fromCache: boolean` field.

```ts
const first  = await client.get('/resource', { responseType: 'json' });
const second = await client.get('/resource', { responseType: 'json' });

console.log(first.fromCache);   // false — network hit
console.log(second.fromCache);  // true  — served from CacheActor
```

---

## Manual cache invalidation

```ts
// Purge all entries managed by this client instance
client.clearCache();
```

---

## `MemoryCache` API

`MemoryCache` is exported for direct use or as the basis for custom stores.

```ts
import { MemoryCache } from '@actor-bonilla/http';

const cache = new MemoryCache();

cache.set('key', entry, 60);   // TTL = 60 seconds
cache.get('key');               // CacheEntry | undefined
cache.delete('key');
cache.clear();
console.log(cache.size);        // number of live entries
```

---

## Implementing a custom `CacheStore`

```ts
import type { CacheStore, CacheEntry } from '@actor-bonilla/http';

class RedisStore implements CacheStore {
  async get(key: string): Promise<CacheEntry | undefined> {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as CacheEntry) : undefined;
  }

  async set(key: string, value: CacheEntry, ttlSec?: number): Promise<void> {
    const serialised = JSON.stringify(value);
    if (ttlSec !== undefined && ttlSec > 0) {
      await redis.set(key, serialised, 'EX', ttlSec);
    } else {
      await redis.set(key, serialised);
    }
  }

  async delete(key: string): Promise<void> {
    await redis.del(key);
  }
}

const client = new HttpClient({ cache: new RedisStore() });
```

The `CacheEntry` shape:

```ts
interface CacheEntry {
  statusCode: number;
  headers: Record<string, string>;
  body: string;            // JSON.stringify'd for objects, raw for text
  url: string;
  timestamp: number;       // Date.now() at write time
  ttl?: number;            // seconds; undefined = immortal
  etag?: string;
  lastModified?: string;
  vary?: Record<string, string>;
}
```

---

## Architecture: CacheActor

Internally, each `HttpClient` instance spawns a dedicated `CacheActor` in the
actor system. All cache reads are performed via `ask()` (awaited reply) and
writes via `tell()` (fire-and-forget), ensuring zero contention and predictable
memory behaviour within the actor model.

```
HttpClient
  └─ CacheActor  (ActorRef<CacheMsg>)
       ├─ tell({ type:'SET', key, entry, ttl })
       ├─ ask ({ type:'GET', key })   → CacheEntry | null
       └─ tell({ type:'CLEAR' })
```
