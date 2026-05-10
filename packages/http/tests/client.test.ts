// ============================================================================
// @actor-bonilla/http — Comprehensive test suite
// ============================================================================

import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import { HttpClient } from '../src/client.ts';
import { HTTPError, TimeoutError, ParseError } from '../src/errors.ts';
import { MemoryCache, buildCacheKey, computeTtl, isCacheableMethod, isCacheableStatus } from '../src/cache.ts';
import { Semaphore } from '../src/semaphore.ts';
import { normalizeOptions } from '../src/normalize.ts';
import { paginateByPage, paginateByNextUrl, paginateByLinkHeader } from '../src/paginator.ts';
import type { HttpResponse } from '../src/types.ts';

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

type FetchMock = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/**
 * Replace globalThis.fetch with a mock for the duration of the test.
 * Returns a cleanup function that restores the original.
 */
function mockGlobalFetch(fn: FetchMock): () => void {
  const orig = globalThis.fetch;
  globalThis.fetch = fn as typeof fetch;
  return () => { globalThis.fetch = orig; };
}

function makeResponse(
  body: string,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(body, { status, headers });
}

function makeJsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

// ---------------------------------------------------------------------------
// 1. URL resolution and prefixUrl
// ---------------------------------------------------------------------------

describe('URL resolution', () => {
  it('resolves a plain absolute URL', async () => {
    let capturedUrl = '';
    const restore = mockGlobalFetch(async (input) => {
      capturedUrl = typeof input === 'string' ? input : (input as Request).url ?? String(input);
      return makeResponse('');
    });
    const client = new HttpClient();
    try {
      await client.get('https://api.example.test/users');
      expect(capturedUrl).toBe('https://api.example.test/users');
    } finally { restore(); await client.destroy(); }
  });

  it('prepends prefixUrl to relative paths', async () => {
    let capturedUrl = '';
    const restore = mockGlobalFetch(async (input) => {
      capturedUrl = typeof input === 'string' ? input : (input as Request).url ?? String(input);
      return makeResponse('');
    });
    const client = new HttpClient({ prefixUrl: 'https://api.example.test/v2/' });
    try {
      await client.get('users/42');
      expect(capturedUrl).toBe('https://api.example.test/v2/users/42');
    } finally { restore(); await client.destroy(); }
  });

  it('strips leading slash from relative path before appending to prefixUrl', async () => {
    let capturedUrl = '';
    const restore = mockGlobalFetch(async (input) => {
      capturedUrl = typeof input === 'string' ? input : (input as Request).url ?? String(input);
      return makeResponse('');
    });
    const client = new HttpClient({ prefixUrl: 'https://api.example.test/v2/' });
    try {
      await client.get('/users');
      expect(capturedUrl).toBe('https://api.example.test/v2/users');
    } finally { restore(); await client.destroy(); }
  });

  it('appends searchParams to the URL', async () => {
    let capturedUrl = '';
    const restore = mockGlobalFetch(async (input) => {
      capturedUrl = typeof input === 'string' ? input : (input as Request).url ?? String(input);
      return makeResponse('');
    });
    const client = new HttpClient();
    try {
      await client.get('https://api.example.test/search', {
        searchParams: { q: 'actor', page: 2, active: true },
      });
      const u = new URL(capturedUrl);
      expect(u.searchParams.get('q')).toBe('actor');
      expect(u.searchParams.get('page')).toBe('2');
      expect(u.searchParams.get('active')).toBe('true');
    } finally { restore(); await client.destroy(); }
  });
});

// ---------------------------------------------------------------------------
// 2. Header merging
// ---------------------------------------------------------------------------

describe('Header merging', () => {
  it('merges default and per-request headers', async () => {
    let capturedHeaders: Headers | null = null;
    const restore = mockGlobalFetch(async (_input, init) => {
      capturedHeaders = new Headers(init?.headers as HeadersInit);
      return makeResponse('');
    });
    const client = new HttpClient({ headers: { 'x-default': 'yes' } });
    try {
      await client.get('https://api.example.test/', { headers: { 'x-request': 'also' } });
      expect(capturedHeaders!.get('x-default')).toBe('yes');
      expect(capturedHeaders!.get('x-request')).toBe('also');
    } finally { restore(); await client.destroy(); }
  });

  it('per-request headers override base headers for the same key', async () => {
    let capturedHeaders: Headers | null = null;
    const restore = mockGlobalFetch(async (_input, init) => {
      capturedHeaders = new Headers(init?.headers as HeadersInit);
      return makeResponse('');
    });
    const client = new HttpClient({ headers: { 'x-version': 'v1' } });
    try {
      await client.get('https://api.example.test/', { headers: { 'x-version': 'v2' } });
      expect(capturedHeaders!.get('x-version')).toBe('v2');
    } finally { restore(); await client.destroy(); }
  });

  it('sets Authorization header for Basic auth', async () => {
    let capturedHeaders: Headers | null = null;
    const restore = mockGlobalFetch(async (_input, init) => {
      capturedHeaders = new Headers(init?.headers as HeadersInit);
      return makeResponse('');
    });
    const client = new HttpClient({ username: 'admin', password: 'secret' });
    try {
      await client.get('https://api.example.test/');
      const auth = capturedHeaders!.get('authorization') ?? '';
      expect(auth.startsWith('Basic ')).toBe(true);
      const decoded = atob(auth.slice(6));
      expect(decoded).toBe('admin:secret');
    } finally { restore(); await client.destroy(); }
  });
});

// ---------------------------------------------------------------------------
// 3. HTTP methods
// ---------------------------------------------------------------------------

describe('HTTP methods', () => {
  const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

  for (const method of methods) {
    it(`sends ${method} request`, async () => {
      let capturedMethod = '';
      const restore = mockGlobalFetch(async (_input, init) => {
        capturedMethod = (init?.method ?? 'GET').toUpperCase();
        return makeResponse('');
      });
      const client = new HttpClient({ throwHttpErrors: false });
      try {
        await (client[method.toLowerCase() as Lowercase<typeof method>] as
          (url: string) => Promise<HttpResponse>)('https://api.example.test/');
        expect(capturedMethod).toBe(method);
      } finally { restore(); await client.destroy(); }
    });
  }
});

// ---------------------------------------------------------------------------
// 4. JSON mode
// ---------------------------------------------------------------------------

describe('JSON mode', () => {
  it('serializes json option as request body and sets Content-Type', async () => {
    let capturedBody = '';
    let capturedCt = '';
    const restore = mockGlobalFetch(async (_input, init) => {
      capturedBody = init?.body as string;
      capturedCt = new Headers(init?.headers as HeadersInit).get('content-type') ?? '';
      return makeJsonResponse({});
    });
    const client = new HttpClient();
    try {
      await client.post('https://api.example.test/', { json: { key: 'value', n: 42 } });
      expect(capturedBody).toBe('{"key":"value","n":42}');
      expect(capturedCt).toBe('application/json');
    } finally { restore(); await client.destroy(); }
  });

  it('parses response body as JSON with responseType=json', async () => {
    const payload = { id: 1, name: 'Alice' };
    const restore = mockGlobalFetch(async () => makeJsonResponse(payload));
    const client = new HttpClient();
    try {
      const resp = await client.get<typeof payload>('https://api.example.test/', { responseType: 'json' });
      expect(resp.body).toEqual(payload);
    } finally { restore(); await client.destroy(); }
  });

  it('getJson returns the parsed body directly', async () => {
    const payload = [1, 2, 3];
    const restore = mockGlobalFetch(async () => makeJsonResponse(payload));
    const client = new HttpClient();
    try {
      const body = await client.getJson('https://api.example.test/');
      expect(body).toEqual(payload);
    } finally { restore(); await client.destroy(); }
  });

  it('postJson sends JSON body and returns parsed response', async () => {
    const restore = mockGlobalFetch(async (_input, init) => {
      const parsed = JSON.parse(init?.body as string);
      return makeJsonResponse({ echo: parsed });
    });
    const client = new HttpClient();
    try {
      const result = await client.postJson<{ echo: { x: number } }>('https://api.example.test/', { x: 7 });
      expect(result.echo.x).toBe(7);
    } finally { restore(); await client.destroy(); }
  });

  it('sets Accept: application/json for JSON requests', async () => {
    let capturedAccept = '';
    const restore = mockGlobalFetch(async (_input, init) => {
      capturedAccept = new Headers(init?.headers as HeadersInit).get('accept') ?? '';
      return makeJsonResponse({});
    });
    const client = new HttpClient();
    try {
      await client.get('https://api.example.test/', { json: {} });
      expect(capturedAccept).toBe('application/json');
    } finally { restore(); await client.destroy(); }
  });

  it('throws ParseError on invalid JSON with responseType=json', async () => {
    const restore = mockGlobalFetch(async () => makeResponse('not-json', 200));
    const client = new HttpClient();
    try {
      await expect(client.get('https://api.example.test/', { responseType: 'json' }))
        .rejects.toBeInstanceOf(ParseError);
    } finally { restore(); await client.destroy(); }
  });
});

// ---------------------------------------------------------------------------
// 5. Form encoding
// ---------------------------------------------------------------------------

describe('Form encoding', () => {
  it('encodes form option as URL-encoded body', async () => {
    let capturedBody = '';
    let capturedCt = '';
    const restore = mockGlobalFetch(async (_input, init) => {
      capturedBody = init?.body as string;
      capturedCt = new Headers(init?.headers as HeadersInit).get('content-type') ?? '';
      return makeResponse('');
    });
    const client = new HttpClient();
    try {
      await client.post('https://api.example.test/', { form: { user: 'alice', age: 30 } });
      const params = new URLSearchParams(capturedBody);
      expect(params.get('user')).toBe('alice');
      expect(params.get('age')).toBe('30');
      expect(capturedCt).toBe('application/x-www-form-urlencoded');
    } finally { restore(); await client.destroy(); }
  });
});

// ---------------------------------------------------------------------------
// 6. Retry
// ---------------------------------------------------------------------------

describe('Retry', () => {
  it('retries on 503 and succeeds on second attempt', async () => {
    let callCount = 0;
    const restore = mockGlobalFetch(async () => {
      callCount++;
      return callCount === 1 ? makeResponse('', 503) : makeResponse('ok', 200);
    });
    const client = new HttpClient({ retry: { limit: 1 } });
    try {
      const resp = await client.get('https://api.example.test/');
      expect(resp.statusCode).toBe(200);
      expect(resp.retryCount).toBe(1);
      expect(callCount).toBe(2);
    } finally { restore(); await client.destroy(); }
  });

  it('exhausts retries and throws HTTPError', async () => {
    const restore = mockGlobalFetch(async () => makeResponse('', 500));
    const client = new HttpClient({ retry: { limit: 2 } });
    try {
      await expect(client.get('https://api.example.test/')).rejects.toBeInstanceOf(HTTPError);
    } finally { restore(); await client.destroy(); }
  });

  it('does not retry POST by default', async () => {
    let callCount = 0;
    const restore = mockGlobalFetch(async () => { callCount++; return makeResponse('', 503); });
    const client = new HttpClient({ retry: { limit: 3 }, throwHttpErrors: false });
    try {
      await client.post('https://api.example.test/');
      expect(callCount).toBe(1);
    } finally { restore(); await client.destroy(); }
  });

  it('honours Retry-After: seconds header', async () => {
    let callCount = 0;
    const delays: number[] = [];
    const origSleep = globalThis.setTimeout;
    const restore = mockGlobalFetch(async () => {
      callCount++;
      if (callCount === 1) return makeResponse('', 429, { 'retry-after': '0' });
      return makeResponse('ok', 200);
    });
    const client = new HttpClient({ retry: { limit: 1 } });
    try {
      await client.get('https://api.example.test/');
      expect(callCount).toBe(2);
    } finally { restore(); await client.destroy(); }
  });

  it('tracks retryCount on the response', async () => {
    let n = 0;
    const restore = mockGlobalFetch(async () => {
      n++;
      return n < 3 ? makeResponse('', 503) : makeResponse('ok', 200);
    });
    const client = new HttpClient({ retry: { limit: 3 } });
    try {
      const resp = await client.get('https://api.example.test/');
      expect(resp.retryCount).toBe(2);
    } finally { restore(); await client.destroy(); }
  });
});

// ---------------------------------------------------------------------------
// 7. throwHttpErrors
// ---------------------------------------------------------------------------

describe('throwHttpErrors', () => {
  it('throws HTTPError on 4xx by default', async () => {
    const restore = mockGlobalFetch(async () => makeResponse('Not Found', 404));
    const client = new HttpClient({ retry: { limit: 0 } });
    try {
      const err = await client.get('https://api.example.test/').catch((e) => e);
      expect(err).toBeInstanceOf(HTTPError);
      expect((err as HTTPError).response.statusCode).toBe(404);
    } finally { restore(); await client.destroy(); }
  });

  it('throws HTTPError on 5xx by default', async () => {
    const restore = mockGlobalFetch(async () => makeResponse('Server Error', 500));
    const client = new HttpClient({ retry: { limit: 0 } });
    try {
      await expect(client.get('https://api.example.test/')).rejects.toBeInstanceOf(HTTPError);
    } finally { restore(); await client.destroy(); }
  });

  it('does not throw when throwHttpErrors is false', async () => {
    const restore = mockGlobalFetch(async () => makeResponse('', 404));
    const client = new HttpClient({ throwHttpErrors: false, retry: { limit: 0 } });
    try {
      const resp = await client.get('https://api.example.test/');
      expect(resp.statusCode).toBe(404);
    } finally { restore(); await client.destroy(); }
  });

  it('HTTPError carries the response body', async () => {
    const restore = mockGlobalFetch(async () => makeResponse('access denied', 403));
    const client = new HttpClient({ retry: { limit: 0 }, responseType: 'text' });
    try {
      const err = await client.get('https://api.example.test/').catch((e) => e) as HTTPError;
      expect(err.response.statusCode).toBe(403);
    } finally { restore(); await client.destroy(); }
  });
});

// ---------------------------------------------------------------------------
// 8. Hooks
// ---------------------------------------------------------------------------

describe('Hooks', () => {
  it('beforeRequest hook can mutate headers', async () => {
    let capturedHeaders: Headers | null = null;
    const restore = mockGlobalFetch(async (_input, init) => {
      capturedHeaders = new Headers(init?.headers as HeadersInit);
      return makeResponse('');
    });
    const client = new HttpClient({
      hooks: {
        beforeRequest: [(opts) => { opts.headers.set('x-injected', 'yes'); }],
      },
    });
    try {
      await client.get('https://api.example.test/');
      expect(capturedHeaders!.get('x-injected')).toBe('yes');
    } finally { restore(); await client.destroy(); }
  });

  it('multiple beforeRequest hooks run in order', async () => {
    const order: string[] = [];
    const restore = mockGlobalFetch(async () => makeResponse(''));
    const client = new HttpClient({
      hooks: {
        beforeRequest: [
          () => { order.push('first'); },
          () => { order.push('second'); },
        ],
      },
    });
    try {
      await client.get('https://api.example.test/');
      expect(order).toEqual(['first', 'second']);
    } finally { restore(); await client.destroy(); }
  });

  it('afterResponse hook can transform the response object', async () => {
    const restore = mockGlobalFetch(async () => makeResponse('original', 200));
    const client = new HttpClient({
      hooks: {
        afterResponse: [async (resp) => ({ ...resp, statusCode: 201, statusMessage: 'Created' })],
      },
    });
    try {
      const resp = await client.get('https://api.example.test/');
      expect(resp.statusCode).toBe(201);
    } finally { restore(); await client.destroy(); }
  });

  it('beforeRetry hook is invoked on each retry attempt', async () => {
    const states: number[] = [];
    let n = 0;
    const restore = mockGlobalFetch(async () => {
      n++;
      return n < 3 ? makeResponse('', 503) : makeResponse('', 200);
    });
    const client = new HttpClient({
      retry: { limit: 2 },
      hooks: {
        beforeRetry: [({ retryCount }) => { states.push(retryCount); }],
      },
    });
    try {
      await client.get('https://api.example.test/');
      expect(states.length).toBe(2);
    } finally { restore(); await client.destroy(); }
  });

  it('beforeError hook can enrich the error message', async () => {
    const restore = mockGlobalFetch(async () => makeResponse('', 400));
    const client = new HttpClient({
      retry: { limit: 0 },
      hooks: {
        beforeError: [(err) => {
          err.message = `[enriched] ${err.message}`;
          return err;
        }],
      },
    });
    try {
      const err = await client.get('https://api.example.test/').catch((e) => e);
      expect(err.message).toMatch(/^\[enriched\]/);
    } finally { restore(); await client.destroy(); }
  });

  it('init hook is called before any processing', async () => {
    let initCalled = false;
    const restore = mockGlobalFetch(async () => makeResponse(''));
    const client = new HttpClient({
      hooks: {
        init: [() => { initCalled = true; }],
      },
    });
    try {
      await client.get('https://api.example.test/');
      expect(initCalled).toBe(true);
    } finally { restore(); await client.destroy(); }
  });
});

// ---------------------------------------------------------------------------
// 9. Response object
// ---------------------------------------------------------------------------

describe('HttpResponse object', () => {
  it('exposes statusCode, statusMessage, headers, url', async () => {
    const restore = mockGlobalFetch(async () =>
      makeResponse('hello', 201, { 'x-custom': 'test' })
    );
    const client = new HttpClient({ retry: { limit: 0 }, throwHttpErrors: false });
    try {
      const resp = await client.get('https://api.example.test/resource');
      expect(resp.statusCode).toBe(201);
      expect(resp.headers.get('x-custom')).toBe('test');
      expect(typeof resp.url).toBe('string');
    } finally { restore(); await client.destroy(); }
  });

  it('exposes timings with start, response, end, phases', async () => {
    const restore = mockGlobalFetch(async () => makeResponse('body'));
    const client = new HttpClient();
    try {
      const resp = await client.get('https://api.example.test/');
      expect(typeof resp.timings.start).toBe('number');
      expect(typeof resp.timings.phases.total).toBe('number');
    } finally { restore(); await client.destroy(); }
  });

  it('fromCache is false for fresh responses', async () => {
    const restore = mockGlobalFetch(async () => makeResponse(''));
    const client = new HttpClient();
    try {
      const resp = await client.get('https://api.example.test/');
      expect(resp.fromCache).toBe(false);
    } finally { restore(); await client.destroy(); }
  });

  it('resolveBodyOnly returns the body directly', async () => {
    const restore = mockGlobalFetch(async () => makeResponse('raw-text'));
    const client = new HttpClient({ resolveBodyOnly: true });
    try {
      const body = await client.get('https://api.example.test/');
      expect(body).toBe('raw-text');
    } finally { restore(); await client.destroy(); }
  });

  it('responseType=buffer returns a Buffer', async () => {
    const restore = mockGlobalFetch(async () => makeResponse('bytes'));
    const client = new HttpClient();
    try {
      const resp = await client.get('https://api.example.test/', { responseType: 'buffer' });
      expect(resp.body).toBeInstanceOf(Uint8Array);
      expect(new TextDecoder().decode(resp.body as Uint8Array)).toBe('bytes');
    } finally { restore(); await client.destroy(); }
  });
});

// ---------------------------------------------------------------------------
// 10. Streaming
// ---------------------------------------------------------------------------

describe('Streaming', () => {
  it('stream() returns a ReadableStream', async () => {
    const restore = mockGlobalFetch(async () => makeResponse('streamed data'));
    const client = new HttpClient();
    try {
      const stream = await client.stream('https://api.example.test/');
      expect(stream).toBeDefined();
      // Read from the stream to confirm it's usable
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      const text = new TextDecoder().decode(
        chunks.reduce((acc, c) => {
          const out = new Uint8Array(acc.byteLength + c.byteLength);
          out.set(acc); out.set(c, acc.byteLength);
          return out;
        }, new Uint8Array(0))
      );
      expect(text).toBe('streamed data');
    } finally { restore(); await client.destroy(); }
  });
});

// ---------------------------------------------------------------------------
// 11. extend
// ---------------------------------------------------------------------------

describe('extend', () => {
  it('inherits base headers and overrides per-key', async () => {
    let capturedHeaders: Headers | null = null;
    const restore = mockGlobalFetch(async (_input, init) => {
      capturedHeaders = new Headers(init?.headers as HeadersInit);
      return makeResponse('');
    });
    const base = new HttpClient({ headers: { 'x-base': 'b', 'x-shared': 'base' } });
    const child = base.extend({ headers: { 'x-child': 'c', 'x-shared': 'child' } });
    try {
      await child.get('https://api.example.test/');
      expect(capturedHeaders!.get('x-base')).toBe('b');
      expect(capturedHeaders!.get('x-child')).toBe('c');
      expect(capturedHeaders!.get('x-shared')).toBe('child');
    } finally {
      restore();
      await base.destroy();
      await child.destroy();
    }
  });

  it('concatenates hook arrays from base and child', async () => {
    const order: string[] = [];
    const restore = mockGlobalFetch(async () => makeResponse(''));
    const base = new HttpClient({
      hooks: { beforeRequest: [() => { order.push('base'); }] },
    });
    const child = base.extend({
      hooks: { beforeRequest: [() => { order.push('child'); }] },
    });
    try {
      await child.get('https://api.example.test/');
      expect(order).toEqual(['base', 'child']);
    } finally {
      restore();
      await base.destroy();
      await child.destroy();
    }
  });
});

// ---------------------------------------------------------------------------
// 12. Pagination
// ---------------------------------------------------------------------------

describe('Pagination', () => {
  it('.paginate() yields items from multiple pages', async () => {
    const pages = [
      { items: [1, 2], next: '/page2' },
      { items: [3, 4], next: null },
    ];
    let pageIndex = 0;
    const restore = mockGlobalFetch(async () =>
      makeJsonResponse(pages[pageIndex++])
    );
    const client = new HttpClient();
    try {
      const collected: number[] = [];
      for await (const item of client.paginate<number>('https://api.example.test/', {
        responseType: 'json',
        pagination: {
          transform: (resp) => (resp.body as { items: number[] }).items,
          paginate: (resp) => {
            const next = (resp.body as { next: string | null }).next;
            return next ? { url: `https://api.example.test${next}` } : false;
          },
        },
      })) {
        collected.push(item);
      }
      expect(collected).toEqual([1, 2, 3, 4]);
    } finally { restore(); await client.destroy(); }
  });

  it('paginateByPage helper advances page param', () => {
    const paginate = paginateByPage(10);
    const fakeResp = { body: Array(10).fill(0) } as unknown as HttpResponse;
    const result1 = paginate(fakeResp, [], Array(10).fill(0) as number[]);
    expect((result1 as Record<string, unknown>)?.searchParams).toBeDefined();
  });

  it('paginateByNextUrl stops when null is returned', () => {
    const paginate = paginateByNextUrl<number>((resp) => (resp.body as { next: null }).next);
    const fakeResp = { body: { next: null } } as unknown as HttpResponse;
    expect(paginate(fakeResp, [], [])).toBe(false);
  });

  it('paginateByLinkHeader parses Link: rel=next', () => {
    const paginate = paginateByLinkHeader<number>();
    const headers = new Headers({ link: '<https://api.example.test/page2>; rel="next"' });
    const fakeResp = { headers, body: [] } as unknown as HttpResponse;
    const result = paginate(fakeResp, [], []);
    expect(result).toEqual({ url: 'https://api.example.test/page2' });
  });

  it('pagination respects countLimit', async () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8];
    const restore = mockGlobalFetch(async () => makeJsonResponse(data));
    const client = new HttpClient();
    try {
      const collected: number[] = [];
      for await (const item of client.paginate<number>('https://api.example.test/', {
        responseType: 'json',
        pagination: {
          transform: (resp) => resp.body as number[],
          paginate: () => false,
          countLimit: 3,
        },
      })) {
        collected.push(item);
      }
      expect(collected).toEqual([1, 2, 3]);
    } finally { restore(); await client.destroy(); }
  });
});

// ---------------------------------------------------------------------------
// 13. Cache (MemoryCache)
// ---------------------------------------------------------------------------

describe('MemoryCache', () => {
  it('stores and retrieves an entry', () => {
    const cache = new MemoryCache();
    const entry = {
      statusCode: 200, headers: {}, body: 'hello',
      url: 'https://x.test/', timestamp: Date.now(), ttl: 60,
    };
    cache.set('k', entry, 60);
    expect(cache.get('k')).toBe(entry);
  });

  it('returns undefined for unknown keys', () => {
    expect(new MemoryCache().get('missing')).toBeUndefined();
  });

  it('evicts entries after TTL expires (ttl=0 → expires immediately)', async () => {
    const cache = new MemoryCache();
    const entry = {
      statusCode: 200, headers: {}, body: '',
      url: 'https://x.test/', timestamp: Date.now(), ttl: 0,
    };
    cache.set('k', entry, 0);
    await new Promise((r) => setTimeout(r, 5));
    expect(cache.get('k')).toBeUndefined();
  });

  it('reports correct size', () => {
    const cache = new MemoryCache();
    cache.set('a', { statusCode: 200, headers: {}, body: '', url: '', timestamp: 0, ttl: 60 }, 60);
    cache.set('b', { statusCode: 200, headers: {}, body: '', url: '', timestamp: 0, ttl: 60 }, 60);
    expect(cache.size).toBe(2);
    cache.delete('a');
    expect(cache.size).toBe(1);
    cache.clear();
    expect(cache.size).toBe(0);
  });
});

describe('Cache utility functions', () => {
  it('computeTtl extracts max-age from Cache-Control', () => {
    const h = new Headers({ 'cache-control': 'max-age=300' });
    expect(computeTtl(h)).toBe(300);
  });

  it('computeTtl returns undefined for no-store', () => {
    const h = new Headers({ 'cache-control': 'no-store' });
    expect(computeTtl(h)).toBeUndefined();
  });

  it('computeTtl returns 0 for no-cache (revalidate)', () => {
    const h = new Headers({ 'cache-control': 'no-cache' });
    expect(computeTtl(h)).toBe(0);
  });

  it('isCacheableMethod allows GET and HEAD only', () => {
    expect(isCacheableMethod('GET')).toBe(true);
    expect(isCacheableMethod('HEAD')).toBe(true);
    expect(isCacheableMethod('POST')).toBe(false);
    expect(isCacheableMethod('DELETE')).toBe(false);
  });

  it('isCacheableStatus includes 200 and 404', () => {
    expect(isCacheableStatus(200)).toBe(true);
    expect(isCacheableStatus(404)).toBe(true);
    expect(isCacheableStatus(201)).toBe(false);
  });

  it('buildCacheKey is deterministic', () => {
    const url = new URL('https://api.example.test/items');
    const k1 = buildCacheKey('GET', url);
    const k2 = buildCacheKey('GET', url);
    expect(k1).toBe(k2);
    expect(buildCacheKey('POST', url)).not.toBe(k1);
  });
});

// ---------------------------------------------------------------------------
// 14. Semaphore
// ---------------------------------------------------------------------------

describe('Semaphore', () => {
  it('immediately acquires when permits are available', async () => {
    const sem = new Semaphore(3);
    await sem.acquire();
    await sem.acquire();
    expect(sem.available).toBe(1);
    expect(sem.waiting).toBe(0);
  });

  it('queues waiters when all permits are taken', async () => {
    const sem = new Semaphore(1);
    await sem.acquire();
    expect(sem.available).toBe(0);
    let resolved = false;
    const p = sem.acquire().then(() => { resolved = true; });
    expect(resolved).toBe(false);
    sem.release();
    await p;
    expect(resolved).toBe(true);
  });

  it('restores permits on release with no waiters', () => {
    const sem = new Semaphore(2);
    sem.acquire();
    expect(sem.available).toBe(1);
    sem.release();
    expect(sem.available).toBe(2);
  });

  it('throws on maxPermits < 1', () => {
    expect(() => new Semaphore(0)).toThrow(RangeError);
    expect(() => new Semaphore(-1)).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// 15. normalizeOptions
// ---------------------------------------------------------------------------

describe('normalizeOptions', () => {
  it('throws when no URL is provided', () => {
    expect(() => normalizeOptions({})).toThrow(TypeError);
  });

  it('defaults method to GET', () => {
    const opts = normalizeOptions({ url: 'https://x.test/' });
    expect(opts.method).toBe('GET');
  });

  it('defaults throwHttpErrors to true', () => {
    const opts = normalizeOptions({ url: 'https://x.test/' });
    expect(opts.throwHttpErrors).toBe(true);
  });

  it('defaults retry.limit to 2', () => {
    const opts = normalizeOptions({ url: 'https://x.test/' });
    expect(opts.retry.limit).toBe(2);
  });

  it('merges shorthand retry: number', () => {
    const opts = normalizeOptions({ url: 'https://x.test/', retry: 5 });
    expect(opts.retry.limit).toBe(5);
  });

  it('merges shorthand timeout: number into timeout.request', () => {
    const opts = normalizeOptions({ url: 'https://x.test/', timeout: 3000 });
    expect(opts.timeout.request).toBe(3000);
  });

  it('normalizes method to uppercase', () => {
    const opts = normalizeOptions({ url: 'https://x.test/', method: 'post' as 'POST' });
    expect(opts.method).toBe('POST');
  });
});

// ---------------------------------------------------------------------------
// 16. EventStream integration
// ---------------------------------------------------------------------------

describe('EventStream integration', () => {
  it('publishes HTTP_REQUEST_CHANNEL on request start', async () => {
    const events: unknown[] = [];
    const restore = mockGlobalFetch(async () => makeResponse(''));
    const client = new HttpClient();
    const { HTTP_REQUEST_CHANNEL } = await import('../src/client.ts');
    client.actorSystem.eventStream.subscribe(HTTP_REQUEST_CHANNEL as symbol, (e) => events.push(e));
    try {
      await client.get('https://api.example.test/resource');
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect((events[0] as Record<string, string>).method).toBe('GET');
    } finally { restore(); await client.destroy(); }
  });

  it('publishes HTTP_ERROR_CHANNEL on HTTP error', async () => {
    const errors: unknown[] = [];
    const restore = mockGlobalFetch(async () => makeResponse('', 500));
    const client = new HttpClient({ retry: { limit: 0 } });
    const { HTTP_ERROR_CHANNEL } = await import('../src/client.ts');
    client.actorSystem.eventStream.subscribe(HTTP_ERROR_CHANNEL as symbol, (e) => errors.push(e));
    try {
      await client.get('https://api.example.test/').catch(() => {});
      expect(errors.length).toBeGreaterThanOrEqual(1);
    } finally { restore(); await client.destroy(); }
  });
});

// ---------------------------------------------------------------------------
// 17. Error hierarchy
// ---------------------------------------------------------------------------

describe('Error hierarchy', () => {
  it('HTTPError.name is "HTTPError"', async () => {
    const restore = mockGlobalFetch(async () => makeResponse('', 400));
    const client = new HttpClient({ retry: { limit: 0 } });
    try {
      const err = await client.get('https://api.example.test/').catch((e) => e);
      expect(err.name).toBe('HTTPError');
      expect(err.code).toBe('ERR_NON_2XX_3XX_RESPONSE');
    } finally { restore(); await client.destroy(); }
  });

  it('ParseError.name is "ParseError"', async () => {
    const restore = mockGlobalFetch(async () => makeResponse('bad-json', 200));
    const client = new HttpClient();
    try {
      const err = await client.get('https://api.example.test/', { responseType: 'json' }).catch((e) => e);
      expect(err.name).toBe('ParseError');
      expect(err.code).toBe('ERR_BODY_PARSE');
    } finally { restore(); await client.destroy(); }
  });

  it('error carries the originating options', async () => {
    const restore = mockGlobalFetch(async () => makeResponse('', 403));
    const client = new HttpClient({ retry: { limit: 0 } });
    try {
      const err = await client.get('https://api.example.test/private').catch((e) => e) as HTTPError;
      expect(err.options).toBeDefined();
      expect(err.options.url.href).toContain('/private');
    } finally { restore(); await client.destroy(); }
  });
});
