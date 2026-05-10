# 1.0.0 (2026-05-10)


### Bug Fixes

* **test:** satisfy Receive<void> in smoke actor props ([ae15934](https://github.com/nowayhecodes/actor-bonilla/commit/ae159342f38509426874e6f139600688c08ca7bf))


### Features

* :incoming_envelope: message class ([adabcbf](https://github.com/nowayhecodes/actor-bonilla/commit/adabcbf75c8c4a2a6c3419e632ec35bb1629ed34))
* basechannel abstract ([9bf6bae](https://github.com/nowayhecodes/actor-bonilla/commit/9bf6bae40e9ba83ddb15c2345c78967861a9acc6))
* fiber acquire ([59ec64e](https://github.com/nowayhecodes/actor-bonilla/commit/59ec64ead8edcb0a934f820f3cad4b330d42351a))
* integrate typia runtime validation for configs ([42eae4e](https://github.com/nowayhecodes/actor-bonilla/commit/42eae4ec4070479a85549f4e966427b7e3be7ad1))
* mailbox :mail: ([e7f0609](https://github.com/nowayhecodes/actor-bonilla/commit/e7f0609658131d9d60496807de4d6342dbd480b5))
* Provider<T> type ([0232f78](https://github.com/nowayhecodes/actor-bonilla/commit/0232f78ad8ba6eb303388bc8a39d8c6006d21b41))
* sub again ([cfc1997](https://github.com/nowayhecodes/actor-bonilla/commit/cfc199766264bbabfdc078eb1c0ddc66939c8a06))
* subscription ([09d5ffc](https://github.com/nowayhecodes/actor-bonilla/commit/09d5ffc79debc7eb5b3e4e9cba3310ef3f290762))
* **supervisor:** added supervision strategy ([fc158d4](https://github.com/nowayhecodes/actor-bonilla/commit/fc158d49921cb665b3115b2c1b5a8a8f8fbddb33))

# Changelog

The format is inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
