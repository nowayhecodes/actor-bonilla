/**
 * Test stub: Typia transforms only run under `tsc`; Jest’s SWC transform skips them.
 * This module mirrors the public API of `src/validation.ts` as no-ops so tests
 * exercise the rest of the runtime without failing at import time.
 */
import type { ActorSystemConfig } from '../../src/types.ts';
import type { ThreadPoolConfig, ThreadedProps } from '../../src/thread-pool.ts';

export function assertActorSystemConfig(_config: ActorSystemConfig): void {}

export function assertThreadPoolConfig(_config: ThreadPoolConfig): void {}

export function assertThreadedProps(_props: ThreadedProps): void {}
