import type { ActorSystemConfig } from './types.js';
import type { ThreadPoolConfig, ThreadedProps } from './thread-pool.js';
/** Validates user-supplied actor system options before construction. */
export declare const assertActorSystemConfig: (input: unknown) => ActorSystemConfig;
/** Validates thread pool options (worker count, script path). */
export declare const assertThreadPoolConfig: (input: unknown) => ThreadPoolConfig;
/** Validates threaded actor factory references (module path + export name). */
export declare const assertThreadedProps: (input: unknown) => ThreadedProps;
