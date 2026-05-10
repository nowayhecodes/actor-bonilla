// ============================================================================
// @actor-bonilla/http — RFC-lite HTTP cache
// ============================================================================

import type { CacheEntry, CacheStore } from './types.js';

// ─── In-memory cache store ────────────────────────────────────────────────────

interface StoredItem {
  entry: CacheEntry;
  expiresAt: number; // ms epoch; Infinity = immortal
}

export class MemoryCache implements CacheStore {
  private store = new Map<string, StoredItem>();

  get(key: string): CacheEntry | undefined {
    const item = this.store.get(key);
    if (!item) return undefined;
    if (Date.now() > item.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return item.entry;
  }

  set(key: string, value: CacheEntry, ttlSec?: number): void {
    let expiresAt: number;
    if (ttlSec === undefined) {
      expiresAt = Infinity;
    } else if (ttlSec <= 0) {
      expiresAt = 0; // already expired (ttl=0 means no-cache / revalidate)
    } else {
      expiresAt = Date.now() + ttlSec * 1_000;
    }
    this.store.set(key, { entry: value, expiresAt });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

// ─── Cache key ────────────────────────────────────────────────────────────────

export function buildCacheKey(
  method: string,
  url: URL,
  varyHeaders?: Record<string, string>
): string {
  const vary =
    varyHeaders
      ? Object.entries(varyHeaders)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => `${k}:${v}`)
          .join('|')
      : '';
  return `${method.toUpperCase()}:${url.href}${vary ? `|v:${vary}` : ''}`;
}

// ─── Cache-Control parsing ───────────────────────────────────────────────────

export function parseCacheControl(
  header: string
): Map<string, string | true> {
  const out = new Map<string, string | true>();
  for (const part of header.split(',')) {
    const [rawKey, rawValue] = part.split('=');
    const key = rawKey.trim().toLowerCase();
    if (rawValue !== undefined) {
      out.set(key, rawValue.trim().replace(/^"|"$/g, ''));
    } else {
      out.set(key, true);
    }
  }
  return out;
}

// ─── TTL computation ──────────────────────────────────────────────────────────

/**
 * Returns the TTL in seconds derived from Cache-Control or Expires headers,
 * or `undefined` if the response must not be cached.
 */
export function computeTtl(headers: Headers): number | undefined {
  const cc = headers.get('cache-control');
  if (cc) {
    const d = parseCacheControl(cc);
    if (d.has('no-store')) return undefined;
    if (d.has('immutable')) return 365 * 24 * 3600;

    const smaxage = d.get('s-maxage');
    if (typeof smaxage === 'string') {
      const n = parseInt(smaxage, 10);
      if (Number.isFinite(n)) return Math.max(0, n);
    }

    const maxAge = d.get('max-age');
    if (typeof maxAge === 'string') {
      const n = parseInt(maxAge, 10);
      if (Number.isFinite(n)) return Math.max(0, n);
    }

    if (d.has('no-cache')) return 0;
  }

  const expires = headers.get('expires');
  if (expires) {
    const expiresMs = new Date(expires).getTime();
    if (Number.isFinite(expiresMs)) {
      return Math.max(0, Math.floor((expiresMs - Date.now()) / 1_000));
    }
  }

  return undefined;
}

// ─── Vary header helpers ──────────────────────────────────────────────────────

/** Collect request headers listed in Vary for the cache key. */
export function extractVaryHeaders(
  responseHeaders: Headers,
  requestHeaders: Headers
): Record<string, string> {
  const vary = responseHeaders.get('vary');
  if (!vary || vary === '*') return {};
  const result: Record<string, string> = {};
  for (const name of vary.split(',')) {
    const key = name.trim().toLowerCase();
    const val = requestHeaders.get(key);
    if (val !== null) result[key] = val;
  }
  return result;
}

// ─── Cacheability helpers ─────────────────────────────────────────────────────

export function isCacheableMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD';
}

export function isCacheableStatus(status: number): boolean {
  return [200, 203, 204, 206, 300, 301, 404, 405, 410, 414, 501].includes(status);
}

export function isStale(entry: CacheEntry): boolean {
  if (entry.ttl === undefined) return false;
  const ageSeconds = (Date.now() - entry.timestamp) / 1_000;
  return ageSeconds > entry.ttl;
}
