### Tasks

1. **Done** — Integrated [Typia](https://typia.io/) with `ts-patch` + `tsc` build; runtime asserts for `ActorSystemConfig`, `ThreadPoolConfig`, and `ThreadedProps`; exported assertion helpers from the package root.

2. **Done** — Wired `LifecycleSignal` into `ActorCell.invokeLifecycleHook`; removed unused dependencies (`rxjs`, `reflect-metadata`, `@swc/cli`).

3. **Done** — TypeScript 6-oriented tweaks: `isolatedModules`, `moduleDetection`, `resolveJsonModule`; safer router hashing; typed worker error handler.

4. **Done** — npm-oriented `package.json` (`exports`, `files`, repo URLs), README + `examples/README.md`, public exports for threaded APIs.

5. **Done** — Jest + ts-jest (ESM), Typia validation stub via `moduleNameMapper`, coverage thresholds on instrumented sources (worker-thread modules and Typia-generated validators excluded from coverage collection). Full statement coverage is not practical for `actor-cell` without many more scenarios; adjustable in `jest.config.cjs`.
