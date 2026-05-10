export class MemoryCache {
    store = new Map();
    get(key) {
        const item = this.store.get(key);
        if (!item)
            return undefined;
        if (Date.now() > item.expiresAt) {
            this.store.delete(key);
            return undefined;
        }
        return item.entry;
    }
    set(key, value, ttlSec) {
        let expiresAt;
        if (ttlSec === undefined) {
            expiresAt = Infinity;
        }
        else if (ttlSec <= 0) {
            expiresAt = 0; // already expired (ttl=0 means no-cache / revalidate)
        }
        else {
            expiresAt = Date.now() + ttlSec * 1_000;
        }
        this.store.set(key, { entry: value, expiresAt });
    }
    delete(key) {
        this.store.delete(key);
    }
    clear() {
        this.store.clear();
    }
    get size() {
        return this.store.size;
    }
}
// ─── Cache key ────────────────────────────────────────────────────────────────
export function buildCacheKey(method, url, varyHeaders) {
    const vary = varyHeaders
        ? Object.entries(varyHeaders)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}:${v}`)
            .join('|')
        : '';
    return `${method.toUpperCase()}:${url.href}${vary ? `|v:${vary}` : ''}`;
}
// ─── Cache-Control parsing ───────────────────────────────────────────────────
export function parseCacheControl(header) {
    const out = new Map();
    for (const part of header.split(',')) {
        const [rawKey, rawValue] = part.split('=');
        const key = rawKey.trim().toLowerCase();
        if (rawValue !== undefined) {
            out.set(key, rawValue.trim().replace(/^"|"$/g, ''));
        }
        else {
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
export function computeTtl(headers) {
    const cc = headers.get('cache-control');
    if (cc) {
        const d = parseCacheControl(cc);
        if (d.has('no-store'))
            return undefined;
        if (d.has('immutable'))
            return 365 * 24 * 3600;
        const smaxage = d.get('s-maxage');
        if (typeof smaxage === 'string') {
            const n = parseInt(smaxage, 10);
            if (Number.isFinite(n))
                return Math.max(0, n);
        }
        const maxAge = d.get('max-age');
        if (typeof maxAge === 'string') {
            const n = parseInt(maxAge, 10);
            if (Number.isFinite(n))
                return Math.max(0, n);
        }
        if (d.has('no-cache'))
            return 0;
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
export function extractVaryHeaders(responseHeaders, requestHeaders) {
    const vary = responseHeaders.get('vary');
    if (!vary || vary === '*')
        return {};
    const result = {};
    for (const name of vary.split(',')) {
        const key = name.trim().toLowerCase();
        const val = requestHeaders.get(key);
        if (val !== null)
            result[key] = val;
    }
    return result;
}
// ─── Cacheability helpers ─────────────────────────────────────────────────────
export function isCacheableMethod(method) {
    return method === 'GET' || method === 'HEAD';
}
export function isCacheableStatus(status) {
    return [200, 203, 204, 206, 300, 301, 404, 405, 410, 414, 501].includes(status);
}
export function isStale(entry) {
    if (entry.ttl === undefined)
        return false;
    const ageSeconds = (Date.now() - entry.timestamp) / 1_000;
    return ageSeconds > entry.ttl;
}
//# sourceMappingURL=cache.js.map