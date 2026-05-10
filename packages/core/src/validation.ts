// ============================================================================
// actor-bonilla — Runtime validation (Typia)
// ============================================================================

import typia from 'typia';

import type {
  ActorSystemConfig,
  ThreadPoolConfig,
  ThreadedProps,
} from './types.js';

/**
 * Validates user-supplied actor system options before construction.
 * Uses `assertEquals` to reject objects with unknown extra properties.
 */
export const assertActorSystemConfig =
  typia.createAssertEquals<ActorSystemConfig>();

/**
 * Validates thread pool options (worker count, script path).
 * Uses `assertEquals` to reject objects with unknown extra properties.
 */
export const assertThreadPoolConfig =
  typia.createAssertEquals<ThreadPoolConfig>();

/**
 * Validates threaded actor factory references (module path + export name).
 * Uses `assertEquals` to reject objects with unknown extra properties.
 */
export const assertThreadedProps = typia.createAssertEquals<ThreadedProps>();
