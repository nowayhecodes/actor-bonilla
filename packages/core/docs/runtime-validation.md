# Runtime validation

Configuration objects can be validated at runtime using **[Typia](https://typia.io/)**. Assertions are compiled into fast checks when **your app** builds with `tsc` and the Typia transform (`typia/lib/transform` via `ts-patch`). They ship from this package as plain entrypoints:

| Export | Validates |
|--------|-----------|
| `assertActorSystemConfig` | Options for `ActorSystem` / `ThreadedActorSystem` |
| `assertThreadPoolConfig` | Worker pool size and optional worker script path |
| `assertThreadedProps` | `behaviorModule`, `behaviorExport`, `behaviorArgs` for threaded actors |

Import from **`@actor-bonilla/core`** when merging JSON configs or other untrusted input before constructing the system.

If your toolchain does not run Typia’s compiler plugin, use manual guards instead of these asserts.
