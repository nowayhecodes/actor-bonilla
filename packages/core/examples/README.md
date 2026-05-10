# Examples

After `pnpm install` at the **repository root**, run demos via workspace scripts (or `pnpm exec tsx` from `packages/core`).

| File | Description |
|------|-------------|
| [`demo.ts`](./demo.ts) | Walkthrough: actors, supervision, routers, FSM, event stream, mailboxes. |
| [`threaded-demo.ts`](./threaded-demo.ts) | Worker-thread pool, threaded behaviors from [`examples.ts`](./examples.ts), cross-thread `tell` / `ask`. |
| [`examples.ts`](./examples.ts) | **Behavior factories** (`createCounterBehavior`, …) loaded by workers via dynamic `import`. Edit paths in `threaded-demo.ts` if your checkout lives elsewhere. |

### Commands

```bash
pnpm run demo
pnpm --filter @actor-bonilla/core exec tsx examples/threaded-demo.ts
```

### Threaded actors and module paths

Workers load behaviors by **absolute file path** (`behaviorModule`). On your machine, adjust the path built in `threaded-demo.ts` (often `fileURLToPath` + `resolve` relative to `import.meta.url`).
