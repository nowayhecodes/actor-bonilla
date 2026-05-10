<div align="center">

<img style="width:150px;" alt="Hector Bonilla" src="https://conteudo.imguol.com.br/c/entretenimento/6a/2019/01/17/o-ator-mexicano-hector-bonilla-em-1979-e-atualmente-1547766366759_v2_1x1.jpg" />

# Actor Bonilla

**A typed actor-system runtime for Node.js and TypeScript** — mailboxes, supervision, routers, FSM helpers, pub/sub, and optional **worker-thread** actors with message routing across threads.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

## Installation

```bash
pnpm add actor-bonilla
# or
npm install actor-bonilla
```

Requires **Node.js 20+** (see `engines` in `package.json`). The library is **ESM-only** (`"type": "module"`).

## Quick start

```typescript
import { ActorSystem, props, PoisonPill } from 'actor-bonilla';

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

Use `props(receive, { supervisionStrategy, mailboxType, dispatcherType })` to tune supervision, mailboxes, and dispatchers. See `examples/demo.ts` for routers, FSM, `ask`, and event stream usage.

## Runtime validation (Typia)

Configuration objects are validated at runtime with **[Typia](https://typia.io/)** (compiled via `tsc` + `ts-patch`):

- `assertActorSystemConfig` — `ActorSystem` / `ThreadedActorSystem` options  
- `assertThreadPoolConfig` — worker pool size and worker script path  
- `assertThreadedProps` — `behaviorModule`, `behaviorExport`, `behaviorArgs` for threaded actors  

Import them from `actor-bonilla` if you build configs from JSON or untrusted input.

## Worker-thread actors

CPU-heavy behaviors can run on **`worker_threads`**. Behaviors cannot cross threads as closures; use a **module path + exported factory** (see `examples/examples.ts`).

```typescript
import { ThreadedActorSystem } from 'actor-bonilla';

const system = new ThreadedActorSystem({});

await system.threadedActorOf(
  {
    behaviorModule: '/absolute/path/to/examples.js',
    behaviorExport: 'createCounterBehavior',
    behaviorArgs: [0],
  },
  'counter'
);
```

Run `pnpm exec tsx examples/threaded-demo.ts` for a full demo (see `examples/README.md`).

## Package exports

The root export (`actor-bonilla`) includes:

| Area | Symbols |
|------|---------|
| Core | `ActorSystem`, `ActorCell`, `props`, lifecycle symbols, `DeadLetter`, … |
| Mailboxes | `UnboundedMailbox`, `BoundedMailbox`, `PriorityMailbox` |
| Dispatchers | `DefaultDispatcher`, `PinnedDispatcher`, `CallingThreadDispatcher` |
| Routing | `Router`, `RoutingStrategy` |
| FSM | `FSM`, `StateHandler`, … |
| Events | `EventStream`, `DEAD_LETTER_CHANNEL`, … |
| Threads | `ThreadedActorSystem`, `ThreadPool`, `ThreadPoolRef`, … |
| Validation | `assertActorSystemConfig`, `assertThreadPoolConfig`, `assertThreadedProps` |

## Scripts (clone / development)

| Script | Command |
|--------|---------|
| Build | `pnpm run build` (`tsc`, Typia transforms enabled) |
| Tests | `pnpm run test` (ESM + `@swc/jest`; stub for `validation.ts` because Jest does not run Typia’s compiler plugin) |
| Coverage | `pnpm run test:coverage` |
| Bench | `pnpm run bench` |
| Demo | `pnpm run demo` |

First install runs `prepare` → `ts-patch install` so local `tsc` applies Typia transforms.

## Repository

- Source: [github.com/nowayhecodes/actor-bonilla](https://github.com/nowayhecodes/actor-bonilla)

## License

MIT © Gustavo Cavalcante
