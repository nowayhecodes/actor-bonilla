/**
 * Test stub: Typia transforms only run under `tsc`; Jest's SWC transform skips them.
 * This module mirrors the combined public API of both `src/validation.ts` files
 * (core + http) as no-ops so tests exercise the rest of the runtime without
 * failing at import time.
 */

// ── @actor-bonilla/core validation stubs ────────────────────────────────────

export function assertActorSystemConfig(_config: unknown): void {}

export function assertThreadPoolConfig(_config: unknown): void {}

export function assertThreadedProps(_props: unknown): void {}

export function assertSupervisionStrategy(_strategy: unknown): void {}

export function assertRouterConfig(_config: unknown): void {}

// ── @actor-bonilla/http validation stubs ────────────────────────────────────

export function assertTimeoutOptions(_opts: unknown): void {}

export function assertRetryOptions(_opts: unknown): void {}

export function assertPaginationOptions(_opts: unknown): void {}
