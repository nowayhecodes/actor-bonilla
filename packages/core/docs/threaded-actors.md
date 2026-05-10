# Threaded actors

CPU-heavy work can run on **`worker_threads`** instead of the main event loop.

Functions cannot be serialized across threads. Behaviors are loaded by **absolute module path** + **exported factory name** + **serializable factory arguments** (similar to passing a class name and ctor args in other actor systems).

```typescript
import { ThreadedActorSystem } from '@actor-bonilla/core';

const system = new ThreadedActorSystem({});

await system.threadedActorOf(
  {
    behaviorModule: '/absolute/path/to/your-behaviors.js',
    behaviorExport: 'createCounterBehavior',
    behaviorArgs: [0],
  },
  'counter'
);
```

Use **`ThreadPool`**, **`ThreadPoolRef`**, and **`ThreadedActorSystem`** from the package root. Cross-thread `tell` / `ask` is routed through the pool.

See [Examples](./examples.md) for `examples/examples.ts` (factories) and `examples/threaded-demo.ts`.
