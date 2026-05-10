// ============================================================================
// @actor-bonilla/http — Runtime validation (Typia)
// ============================================================================

import typia from 'typia';

import type {
  TimeoutOptions,
  RetryOptions,
  PaginationOptions,
} from './types.js';

/**
 * Validates a fully-resolved `TimeoutOptions` object.
 * All numeric fields carry `tags.Minimum<0>` so Typia enforces >= 0 at runtime.
 */
export const assertTimeoutOptions = typia.createAssert<TimeoutOptions>();

/**
 * Validates a fully-resolved `RetryOptions` object.
 * Enforces `limit >= 0`, `backoffLimit >= 0`, `maxRetryAfter >= 0`.
 * `calculateDelay` is verified to be a function (`typeof === 'function'`).
 */
export const assertRetryOptions = typia.createAssert<RetryOptions>();

/**
 * Validates a `PaginationOptions` object.
 * Enforces `countLimit >= 1`, `requestLimit >= 1`, `backoff >= 0`.
 * Callback fields are verified to be functions when present.
 */
export const assertPaginationOptions =
  typia.createAssert<PaginationOptions<unknown>>();
