# Pagination API

`HttpClient.paginate()` is an `AsyncGenerator` that abstracts multi-page traversal.
You supply a `paginate` function that inspects each response and returns the
options for the next request, or `null`/`false` to stop.

---

## Signature

```ts
async *paginate<T = unknown>(
  url: string | URL,
  options: Partial<Options> = {}
): AsyncGenerator<T>
```

`T` is the type of each **item** yielded, not the full page body.

---

## `PaginationOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `paginate` | `(response, allItems, pageItems) => Partial<Options> \| false \| null \| Promise<…>` | — | **Required.** Return the next page's options, or falsy to stop. |
| `transform` | `(response) => T[] \| Promise<T[]>` | `response.body` if array | Extract items from the raw response. |
| `filter` | `(item, allItems, pageItems) => boolean` | — | Keep only matching items. |
| `shouldContinue` | `(item, allItems, pageItems) => boolean` | — | Stop iteration when this returns `false`. |
| `countLimit` | `number` | — | Stop after this many total items. |
| `requestLimit` | `number` | — | Stop after this many HTTP requests. |
| `backoff` | `number` | `0` | Milliseconds to wait between pages. |
| `stackAllItems` | `boolean` | `true` | Pass all previously yielded items to `paginate` / `filter` / `shouldContinue`. |

---

## Built-in strategies

Import from `@actor-bonilla/http`:

```ts
import {
  paginateByNextUrl,
  paginateByOffset,
  paginateByPage,
  paginateByLinkHeader,
  paginateByCursor,
} from '@actor-bonilla/http';
```

---

### `paginateByLinkHeader()`

Follows the `Link: <url>; rel="next"` response header. This is the most common
REST pagination pattern (GitHub, GitLab, etc.).

```ts
for await (const repo of client.paginate('https://api.github.com/user/repos', {
  responseType: 'json',
  headers: { authorization: 'Bearer token' },
  pagination: {
    paginate: paginateByLinkHeader(),
    countLimit: 200,
  },
})) {
  console.log(repo.full_name);
}
```

---

### `paginateByNextUrl(getNextUrl)`

Extract the next URL from the response body using a custom accessor.

```ts
// API returns: { items: [...], next: "https://api.example.com/items?cursor=abc" }
for await (const item of client.paginate('/items', {
  responseType: 'json',
  pagination: {
    paginate: paginateByNextUrl((resp) => (resp.body as any)?.next ?? null),
    transform: (resp) => (resp.body as any).items,
  },
})) {
  console.log(item);
}
```

---

### `paginateByPage(perPage?)`

Increments `searchParams.page` on each request. Stops when the response body
is an empty array.

```ts
for await (const user of client.paginate('/users', {
  responseType: 'json',
  pagination: {
    paginate: paginateByPage(50),   // per_page=50
    requestLimit: 10,               // never more than 10 pages
  },
})) {
  console.log(user.name);
}
```

---

### `paginateByOffset(pageSize)`

Increments `searchParams.offset` by `pageSize` on each request. Stops on an
empty page.

```ts
for await (const record of client.paginate('/records', {
  responseType: 'json',
  pagination: {
    paginate: paginateByOffset(100),
  },
})) {
  process(record);
}
```

---

### `paginateByCursor(getCursor)`

Uses a cursor token returned in the response body. Passes the cursor as
`searchParams.cursor` on the next request.

```ts
// API returns: { data: [...], nextCursor: "tok_xyz" }
for await (const event of client.paginate('/events', {
  responseType: 'json',
  pagination: {
    paginate: paginateByCursor((resp) => (resp.body as any)?.nextCursor ?? null),
    transform: (resp) => (resp.body as any).data,
  },
})) {
  console.log(event);
}
```

---

## Custom paginate function

When none of the built-ins fit, write your own:

```ts
for await (const item of client.paginate('/search', {
  searchParams: { q: 'actor model', page: 1, per_page: 20 },
  responseType: 'json',
  pagination: {
    paginate(response, _allItems, pageItems) {
      // Stop when last page returned fewer items than requested
      if (pageItems.length < 20) return false;

      const current = Number(response.requestOptions?.searchParams?.page ?? 1);
      return { searchParams: { page: current + 1, per_page: 20 } };
    },
    filter: (item) => (item as any).score > 0.5,
    countLimit: 100,
  },
})) {
  console.log(item);
}
```

---

## Collecting all items

If you need an array rather than a generator:

```ts
const items: Post[] = [];
for await (const post of client.paginate<Post>('/posts', options)) {
  items.push(post);
}
```

Or with a helper:

```ts
async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const v of gen) out.push(v);
  return out;
}

const posts = await collect(client.paginate<Post>('/posts', options));
```
