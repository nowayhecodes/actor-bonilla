<div align="center">

<img style="width:150px;" alt="Hector Bonilla" src="https://conteudo.imguol.com.br/c/entretenimento/6a/2019/01/17/o-ator-mexicano-hector-bonilla-em-1979-e-atualmente-1547766366759_v2_1x1.jpg" />

# Actor Bonilla

**Actor-system runtime for Node.js and TypeScript (ESM)** — mailboxes, supervision, routers, FSM helpers, pub/sub, and optional **worker-thread** actors.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

## Installation

```bash
pnpm add @actor-bonilla/core
# or
npm install @actor-bonilla/core
```

Requires **Node.js 20+**. The package is **ESM-only**.

## Quick start

```typescript
import { ActorSystem, props, PoisonPill } from '@actor-bonilla/core';

const system = new ActorSystem({ name: 'demo', logDeadLetters: false });

const greeter = system.actorOf<string>(
  props((msg) => {
    console.log(`hello ${msg}`);
  }),
  'greeter'
);

greeter.tell('world');
greeter.tell(PoisonPill);

await system.terminate();
```

## Documentation

Guides for library users and contributors live in **[`docs/`](https://github.com/nowayhecodes/actor-bonilla/tree/main/packages/core/docs)**:

| | |
|--|--|
| [Getting started](https://github.com/nowayhecodes/actor-bonilla/blob/main/packages/core/docs/getting-started.md) | Install, ESM, first actor |
| [Features](https://github.com/nowayhecodes/actor-bonilla/blob/main/packages/core/docs/features.md) | Mailboxes, dispatchers, supervision, router, FSM, events |
| [Runtime validation](https://github.com/nowayhecodes/actor-bonilla/blob/main/packages/core/docs/runtime-validation.md) | Typia config asserts |
| [Threaded actors](https://github.com/nowayhecodes/actor-bonilla/blob/main/packages/core/docs/threaded-actors.md) | `worker_threads` pool |
| [HTTP client](https://github.com/nowayhecodes/actor-bonilla/blob/main/packages/core/docs/http-client.md) | `@actor-bonilla/http` fetch client |
| [API reference](https://github.com/nowayhecodes/actor-bonilla/blob/main/packages/core/docs/api-reference.md) | Main exports |
| [Examples](https://github.com/nowayhecodes/actor-bonilla/blob/main/packages/core/docs/examples.md) | Repo demos |
| [Developing](https://github.com/nowayhecodes/actor-bonilla/blob/main/packages/core/docs/developing.md) | Build, test, release (clone only) |

After install, open `node_modules/@actor-bonilla/core/docs/` for the same files offline.

## Links

- [Issues](https://github.com/nowayhecodes/actor-bonilla/issues)
- [Changelog](https://github.com/nowayhecodes/actor-bonilla/blob/main/packages/core/CHANGELOG.md)

## License

MIT © Gustavo Cavalcante
