import { type Receive } from '@actor-bonilla/core';
import type { CacheEntry, CacheStore } from '../types.js';
export type CacheMsg = {
    readonly type: 'GET';
    readonly key: string;
} | {
    readonly type: 'SET';
    readonly key: string;
    readonly entry: CacheEntry;
    readonly ttl?: number;
} | {
    readonly type: 'DELETE';
    readonly key: string;
} | {
    readonly type: 'CLEAR';
};
export declare function createCacheBehavior(store: CacheStore): Receive<CacheMsg>;
/** Props factory for the cache actor. */
export declare function cacheActorProps(store: CacheStore): import("@actor-bonilla/core").Props<CacheMsg>;
