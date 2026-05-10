// ============================================================================
// actor-bonilla — Runtime validation (Typia)
// ============================================================================

import typia from 'typia';

import type { ActorSystemConfig } from './types.js';
import type { ThreadPoolConfig, ThreadedProps } from './thread-pool.js';

/** Validates user-supplied actor system options before construction. */
export const assertActorSystemConfig =
  typia.createAssert<ActorSystemConfig>();

/** Validates thread pool options (worker count, script path). */
export const assertThreadPoolConfig =
  typia.createAssert<ThreadPoolConfig>();

/** Validates threaded actor factory references (module path + export name). */
export const assertThreadedProps = typia.createAssert<ThreadedProps>();
