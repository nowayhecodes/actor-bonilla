# Examples

All examples assume you run them from the **repository root** after `pnpm install`.

| File | Description |
|------|-------------|
| [`demo.ts`](./demo.ts) | Walkthrough: actors, supervision, routers, FSM, event stream, mailboxes. |
| [`threaded-demo.ts`](./threaded-demo.ts) | Worker-thread pool, threaded behaviors from [`examples.ts`](./examples.ts), cross-thread `tell` / `ask`. |
| [`examples.ts`](./examples.ts) | **Behavior factories** (`createCounterBehavior`, …) loaded by workers via dynamic `import`. Edit paths in `threaded-demo.ts` if your checkout lives elsewhere. |

### Commands

```bash
pnpm exec tsx examples/demo.ts
pnpm exec tsx examples/threaded-demo.ts
```

### Threaded actors and module paths

Workers load behaviors by **absolute file path** (`behaviorModule`). On your machine, adjust the path built in `threaded-demo.ts` (often `fileURLToPath` + `resolve` relative to `import.meta.url`).
