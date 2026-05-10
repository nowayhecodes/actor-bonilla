import type { CacheEntry, CacheStore } from './types.js';
export declare class MemoryCache implements CacheStore {
    private store;
    get(key: string): CacheEntry | undefined;
    set(key: string, value: CacheEntry, ttlSec?: number): void;
    delete(key: string): void;
    clear(): void;
    get size(): number;
}
export declare function buildCacheKey(method: string, url: URL, varyHeaders?: Record<string, string>): string;
export declare function parseCacheControl(header: string): Map<string, string | true>;
/**
 * Returns the TTL in seconds derived from Cache-Control or Expires headers,
 * or `undefined` if the response must not be cached.
 */
export declare function computeTtl(headers: Headers): number | undefined;
/** Collect request headers listed in Vary for the cache key. */
export declare function extractVaryHeaders(responseHeaders: Headers, requestHeaders: Headers): Record<string, string>;
export declare function isCacheableMethod(method: string): boolean;
export declare function isCacheableStatus(status: number): boolean;
export declare function isStale(entry: CacheEntry): boolean;
