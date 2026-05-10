# @actor-bonilla/http

HTTP utilities built for composition with [`@actor-bonilla/core`](../core/README.md): a **`fetch`-first client** (Node 20+ exposes Undici-backed `fetch` globally) with timeouts, retries, and hooks inspired by [Got](https://github.com/sindresorhus/got).

## Installation

```bash
pnpm add @actor-bonilla/http
# optional peer — use when wiring HTTP into actors
pnpm add @actor-bonilla/core
```

## Usage

```typescript
import { HttpClient } from '@actor-bonilla/http';

const http = new HttpClient({
  prefixUrl: 'https://api.example.com/v1/',
  headers: { Authorization: `Bearer ${token}` },
  timeoutMs: 10_000,
  retry: { limit: 2 },
  hooks: {
    afterResponse: async (response) => {
      if (response.status === 401) {
        await refreshToken();
      }
      return response;
    },
  },
});

const res = await http.get('users/me');
```

### Actors

There is no mandatory coupling: import **`HttpClient` inside your actor `receive` handler** (or inject it via closure when you call `props(...)`) so all outbound HTTP stays serialized with the rest of your actor messaging.

## Requirements

- **Node.js 20+** (ESM, global `fetch`).

## License

MIT © Gustavo Cavalcante
