/**
 * Test stub: Typia transforms only run under `tsc`; Jest's SWC transform skips them.
 * This module mirrors the public API of `src/validation.ts` as no-ops so tests
 * exercise the rest of the runtime without failing at import time.
 */
import type {
  ActorSystemConfig,
  ThreadPoolConfig,
  ThreadedProps,
  SupervisionStrategy,
  RouterConfig,
} from '../../src/types.ts';

export function assertActorSystemConfig(_config: ActorSystemConfig): void {}

export function assertThreadPoolConfig(_config: ThreadPoolConfig): void {}

export function assertThreadedProps(_props: ThreadedProps): void {}

export function assertSupervisionStrategy(_strategy: SupervisionStrategy): void {}

export function assertRouterConfig(_config: RouterConfig): void {}
