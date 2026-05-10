# Getting started

## Requirements

- **Node.js 20+** (see `engines` in `package.json`).
- **ESM only** — your app should use `"type": "module"` or import this package from `.mjs` / TypeScript compiled to ESM.

## Install

```bash
pnpm add @actor-bonilla/core
# or
npm install @actor-bonilla/core
```

TypeScript users get types via `"types"` / `exports` from the published package.

## Minimal example

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

Use `props(receive, options)` to pass `supervisionStrategy`, `mailboxType`, or `dispatcherType`. Patterns for routers, FSM, `ask`, and the event stream are shown in [Examples](./examples.md).
