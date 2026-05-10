// ============================================================================
// actor-bonilla — Runtime validation (Typia)
// ============================================================================

import typia from 'typia';

import type {
  ActorSystemConfig,
  ThreadPoolConfig,
  ThreadedProps,
  SupervisionStrategy,
  RouterConfig,
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

/**
 * Validates a supervision strategy object.
 * Ensures `maxRetries >= 0`, `withinMs >= 0`, and `type` is a valid literal.
 * The `decider` function property is type-checked (`typeof === 'function'`).
 */
export const assertSupervisionStrategy =
  typia.createAssert<SupervisionStrategy>();

/**
 * Validates a router configuration object.
 * Ensures `nrOfInstances >= 1` and `strategy` is a valid `RoutingStrategy`.
 * The `props.receive` function is type-checked (`typeof === 'function'`).
 */
export const assertRouterConfig = typia.createAssert<RouterConfig>();
