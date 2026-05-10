# HTTP client (`@actor-bonilla/http`)

Outbound HTTP from actor applications can use the sibling package **`@actor-bonilla/http`**: a **`fetch`-centric client** (Node 20+ global `fetch`) with **timeouts**, **retries** on transient status codes and network errors, and **beforeRequest** / **afterResponse** hooks — shaped similarly to [Got](https://github.com/sindresorhus/got) for familiarity.

Install alongside core:

```bash
pnpm add @actor-bonilla/core @actor-bonilla/http
```

Construct `HttpClient` once (or per bounded context), then **call it from inside your actor `receive` handler** so HTTP side effects stay ordered with the rest of your mailbox processing.

See the package readme: [`../../http/README.md`](../../http/README.md).
