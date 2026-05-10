# Changelog

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.1.0] — 2026-05-10

### Changed

- **`validation.ts`** — switched from `typia.createAssert` to `typia.createAssertEquals` for all three config validators (`assertActorSystemConfig`, `assertThreadPoolConfig`, `assertThreadedProps`). `assertEquals` rejects objects with unknown extra properties in addition to the existing type-shape checks.
- **`types.ts`** — added `tags.ExclusiveMinimum<0>` to `SupervisionStrategy.maxRetries` and `withinMs` (both must be strictly positive; zero restarts / zero windows make no sense). Added `tags.Minimum<1>` to `RouterConfig.nrOfInstances` and `tags.MinLength<1>` to `ActorSystemConfig.name` (already present; documented).

### Fixed

- `ActorContext.system` typed as `any` annotated with a `@internal` JSDoc comment to clarify this is intentional (forward-reference cycle) and is never part of the public API surface.

---

## [1.0.0] — 2026-05-10

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
