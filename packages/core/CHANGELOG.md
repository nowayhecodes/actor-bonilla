# Changelog

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [1.1.0] — 2026-05-10

### Changed

- **`validation.ts`** — switched from `typia.createAssert` to `typia.createAssertEquals` for all three config validators (`assertActorSystemConfig`, `assertThreadPoolConfig`, `assertThreadedProps`). `assertEquals` rejects objects with unknown extra properties in addition to the existing type-shape checks.
- **`types.ts`** — added `tags.ExclusiveMinimum<0>` to `SupervisionStrategy.maxRetries` and `withinMs` (both must be strictly positive; zero restarts / zero windows make no sense). Added `tags.Minimum<1>` to `RouterConfig.nrOfInstances` and `tags.MinLength<1>` to `ActorSystemConfig.name` (already present; documented).

### Fixed

- `ActorContext.system` typed as `any` annotated with a `@internal` JSDoc comment to clarify this is intentional (forward-reference cycle) and is never part of the public API surface.

---



## [1.0.0] — 2026-05-09

### Added

- **Actor runtime:** `ActorSystem`, `ActorCell`, hierarchical paths under `/user`, mailboxes (`UnboundedMailbox`, `BoundedMailbox`, `PriorityMailbox`), dispatchers (`DefaultDispatcher`, `PinnedDispatcher`, `CallingThreadDispatcher`), pub/sub `EventStream`, routing (`Router` + strategies), and FSM helpers (`FSM`).
- **Supervision:** configurable one-for-one / all-for-one strategies and failure handling on children (`feat(supervisor)` lineage).
- **Worker threads:** `ThreadPool`, worker shard protocol, and `ThreadedActorSystem` for actors whose behavior is loaded from a module factory on worker threads (`worker_threads`), with cross-thread message routing.
- **Runtime validation:** [Typia](https://typia.io/)-backed asserts for `ActorSystemConfig`, `ThreadPoolConfig`, and `ThreadedProps`, exported as `assertActorSystemConfig`, `assertThreadPoolConfig`, `assertThreadedProps` (compiled with `tsc` + `ts-patch`; production build uses Typia transforms).
- **Tests:** Jest (ESM, `NODE_OPTIONS=--experimental-vm-modules`), coverage thresholds on selected `src/` files, validation stub under tests so Jest does not execute Typia transforms, and `benchmark.ts` guarded so it only runs as the script entrypoint—not when imported.
- **Docs & packaging:** richer `README.md`, `examples/README.md`, `package.json` `exports` / `files` / repository URLs, and public barrel exports including threaded APIs (`ThreadedActorSystem`, `ThreadPool`, related types).

### Changed

- **Build:** library emit uses **`tsc`** with Typia’s compiler plugin instead of relying on SWC alone for the main package output.
- **Types:** `ActorSystemConfig` lives with core types; `LifecycleSignal` is used when invoking lifecycle hooks; router consistent-hash path avoids `any` for `hashKey`; worker pool error handlers use `unknown`.
- **Tooling:** TypeScript options aligned with TS 6 usage (`isolatedModules`, `moduleDetection`, `resolveJsonModule`, Node typings).
- **Tests:** test runner compiles tests with **`@swc/jest`** (faster than ts-jest); `package.json` devDependency pins normalized (caret prefixes dropped where applied).

### Removed

- Unused dependencies dropped during cleanup (e.g. `rxjs`, `reflect-metadata`, `@swc/cli` where no longer required).
- **`ts-jest`** removed in favor of `@swc/jest` for test transforms.

### Fixed

- Smoke test actor `Receive` handler updated so it returns `void`, matching `Receive<T>` (`void | Promise<void>`).

---

## Earlier history (high level)

Commits prior to the consolidated “actor-bonilla” stack trace back to initial scaffolding (messages, mailboxes, subscriptions), TS upgrades, typed channels/fibers, parallel spawning experiments, and refactors toward the current `src/` layout. See `git log` for full detail.
