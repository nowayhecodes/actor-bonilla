import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import { HttpClient } from '../src/client.ts';
import { HTTPError, TimeoutError } from '../src/errors.ts';
import { MemoryCache } from '../src/cache.ts';
import { Semaphore } from '../src/semaphore.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetch(responses: Array<{ status: number; body?: string; headers?: Record<string, string> }>) {
  let call = 0;
  return async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    const r = responses[Math.min(call++, responses.length - 1)];
    return new Response(r.body ?? '', {
      status: r.status,
      headers: r.headers ?? {},
    });
  };
}

// ---------------------------------------------------------------------------
// URL + Header resolution
// ---------------------------------------------------------------------------

describe('URL and header resolution', () => {
  it('resolves relative URLs against prefixUrl', async () => {
    let capturedUrl = '';
    const client = new HttpClient({
      prefixUrl: 'https://api.example.test/v1/',
    });
    // Monkey-patch globalThis.fetch for this test
    const orig = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL) => {
      capturedUrl = typeof input === 'string' ? input : (input as Request).url ?? String(input);
      return new Response('ok', { status: 200 });
    };
    try {
      await client.get('users');
    } finally {
      globalThis.fetch = orig;
      await client.destroy();
    }
    expect(capturedUrl).toBe('https://api.example.test/v1/users');
  });

  it('merges default headers with per-request headers', async () => {
    let capturedHeaders: Headers | null = null;
    const client = new HttpClient({ headers: { 'x-app': 'test' } });
    const orig = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedHeaders = init?.headers
        ? new Headers(init.headers as HeadersInit)
        : new Headers();
      return new Response('', { status: 200 });
    };
    try {
      await client.get('https://example.test/', { headers: { 'x-req': 'yes' } });
    } finally {
      globalThis.fetch = orig;
      await client.destroy();
    }
    expect(capturedHeaders!.get('x-app')).toBe('test');
    expect(capturedHeaders!.get('x-req')).toBe('yes');
  });

  it('sets Content-Type and Accept for json requests', async () => {
    let capturedHeaders: Headers | null = null;
    const client = new HttpClient();
    const orig = globalThis.fetch;
    globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers as HeadersInit);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    try {
      await client.post('https://example.test/', { json: { hello: 'world' } });
    } finally {
      globalThis.fetch = orig;
      await client.destroy();
    }
    expect(capturedHeaders!.get('content-type')).toBe('application/json');
    expect(capturedHeaders!.get('accept')).toBe('application/json');
  });
});

// ---------------------------------------------------------------------------
// Retry
// ---------------------------------------------------------------------------

describe('Retry', () => {
  it('retries retryable status codes and eventually succeeds', async () => {
    let calls = 0;
    const client = new HttpClient({ retry: { limit: 2 } });
    const orig = globalThis.fetch;
    globalThis.fetch = async () => {
      calls++;
      if (calls < 3) return new Response('', { status: 503 });
      return new Response('ok', { status: 200 });
    };
    try {
      const resp = await client.get('https://example.test/r');
      expect(resp.statusCode).toBe(200);
      expect(resp.retryCount).toBe(2);
      expect(calls).toBe(3);
    } finally {
      globalThis.fetch = orig;
      await client.destroy();
    }
  });

  it('does not retry POST requests by default', async () => {
    let calls = 0;
    const client = new HttpClient({ retry: { limit: 2 }, throwHttpErrors: false });
    const orig = globalThis.fetch;
    globalThis.fetch = async () => {
      calls++;
      return new Response('', { status: 503 });
    };
    try {
      await client.post('https://example.test/', { body: 'data' });
      expect(calls).toBe(1);
    } finally {
      globalThis.fetch = orig;
      await client.destroy();
    }
  });

  it('throws HTTPError after exhausting retries', async () => {
    const client = new HttpClient({ retry: { limit: 1 } });
    const orig = globalThis.fetch;
    globalThis.fetch = async () => new Response('fail', { status: 500 });
    try {
      await expect(client.get('https://example.test/')).rejects.toBeInstanceOf(HTTPError);
    } finally {
      globalThis.fetch = orig;
      await client.destroy();
    }
  });
});

// ---------------------------------------------------------------------------
// JSON mode
// ---------------------------------------------------------------------------

describe('JSON mode', () => {
  it('parses response body as JSON with responseType=json', async () => {
    const payload = { id: 42, name: 'Alice' };
    const client = new HttpClient();
    const orig = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    try {
      const resp = await client.get<typeof payload>('https://example.test/', { responseType: 'json' });
      expect(resp.body).toEqual(payload);
    } finally {
      globalThis.fetch = orig;
      await client.destroy();
    }
  });

  it('getJson returns the parsed body directly', async () => {
    const payload = [1, 2, 3];
    const client = new HttpClient();
    const orig = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify(payload), { status: 200 });
    try {
      const body = await client.getJson('https://example.test/');
      expect(body).toEqual(payload);
    } finally {
      globalThis.fetch = orig;
      await client.destroy();
    }
  });

  it('serializes json option as request body', async () => {
    let capturedBody = '';
    const client = new HttpClient();
    const orig = globalThis.fetch;
    globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response('{}', { status: 200 });
    };
    try {
      await client.post('https://example.test/', { json: { x: 1 } });
      expect(capturedBody).toBe('{"x":1}');
    } finally {
      globalThis.fetch = orig;
      await client.destroy();
    }
  });
});

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

describe('Hooks', () => {
  it('beforeRequest hook can mutate options', async () => {
    let capturedHeaders: Headers | null = null;
    const client = new HttpClient({
      hooks: {
        beforeRequest: [(opts) => {
          opts.headers.set('x-injected', 'hook');
        }],
      },
    });
    const orig = globalThis.fetch;
    globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers as HeadersInit);
      return new Response('', { status: 200 });
    };
    try {
      await client.get('https://example.test/');
    } finally {
      globalThis.fetch = orig;
      await client.destroy();
    }
    expect(capturedHeaders!.get('x-injected')).toBe('hook');
  });

  it('afterResponse hook can augment the response', async () => {
    const client = new HttpClient({
      hooks: {
        afterResponse: [async (resp) => {
          return { ...resp, statusCode: 999, statusMessage: 'Overridden' };
        }],
      },
    });
    const orig = globalThis.fetch;
    globalThis.fetch = async () => new Response('', { status: 200 });
    try {
      const resp = await client.get('https://example.test/', { throwHttpErrors: false });
      expect(resp.statusCode).toBe(999);
    } finally {
      globalThis.fetch = orig;
      await client.destroy();
    }
  });

  it('beforeRetry hook is called on each retry', async () => {
    const retryCalls: number[] = [];
    let fetchCount = 0;
    const client = new HttpClient({
      retry: { limit: 2 },
      hooks: {
        beforeRetry: [({ retryCount }) => { retryCalls.push(retryCount); }],
      },
    });
    const orig = globalThis.fetch;
    globalThis.fetch = async () => {
      fetchCount++;
      if (fetchCount < 3) return new Response('', { status: 503 });
      return new Response('', { status: 200 });
    };
    try {
      await client.get('https://example.test/');
    } finally {
      globalThis.fetch = orig;
      await client.destroy();
    }
    expect(retryCalls).toHaveLength(2);
  });

  it('beforeError hook can transform errors', async () => {
    const client = new HttpClient({
      hooks: {
        beforeError: [(err) => {
          err.message = `[wrapped] ${err.message}`;
          return err;
        }],
      },
    });
    const orig = globalThis.fetch;
    globalThis.fetch = async () => new Response('', { status: 404 });
    try {
      await client.get('https://example.test/');
    } catch (e) {
      expect((e as Error).message).toMatch(/^\[wrapped\]/);
    } finally {
      globalThis.fetch = orig;
      await client.destroy();
    }
  });
});

// ---------------------------------------------------------------------------
// throwHttpErrors
// ---------------------------------------------------------------------------

describe('throwHttpErrors', () => {
  it('throws HTTPError on 4xx by default', async () => {
    const client = new HttpClient();
    const orig = globalThis.fetch;
    globalThis.fetch = async () => new Response('not found', { status: 404 });
    try {
      await expect(client.get('https://example.test/')).rejects.toBeInstanceOf(HTTPError);
    } finally {
      globalThis.fetch = orig;
      await client.destroy();
    }
  });

  it('does not throw when throwHttpErrors is false', async () => {
    const client = new HttpClient({ throwHttpErrors: false });
    const orig = globalThis.fetch;
    globalThis.fetch = async () => new Response('', { status: 404 });
    try {
      const resp = await client.get('https://example.test/');
      expect(resp.statusCode).toBe(404);
    } finally {
      globalThis.fetch = orig;
      await client.destroy();
    }
  });
});

// ---------------------------------------------------------------------------
// extend
// ---------------------------------------------------------------------------

describe('extend', () => {
  it('inherits base options and merges hooks', async () => {
    const calls: string[] = [];
    const base = new HttpClient({
      headers: { 'x-base': '1' },
      hooks: { beforeRequest: [() => { calls.push('base'); }] },
    });
    const child = base.extend({
      headers: { 'x-child': '2' },
      hooks: { beforeRequest: [() => { calls.push('child'); }] },
    });

    let capturedHeaders: Headers | null = null;
    const orig = globalThis.fetch;
    globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers as HeadersInit);
      return new Response('', { status: 200 });
    };
    try {
      await child.get('https://example.test/');
    } finally {
      globalThis.fetch = orig;
      await base.destroy();
      await child.destroy();
    }
    expect(capturedHeaders!.get('x-base')).toBe('1');
    expect(capturedHeaders!.get('x-child')).toBe('2');
    expect(calls).toContain('base');
    expect(calls).toContain('child');
  });
});

// ---------------------------------------------------------------------------
// Semaphore (unit)
// ---------------------------------------------------------------------------

describe('Semaphore', () => {
  it('allows up to maxPermits concurrent acquires without blocking', async () => {
    const sem = new Semaphore(3);
    await sem.acquire();
    await sem.acquire();
    await sem.acquire();
    expect(sem.available).toBe(0);
    sem.release();
    expect(sem.available).toBe(1);
  });

  it('queues waiters when permits are exhausted', async () => {
    const sem = new Semaphore(1);
    await sem.acquire();
    let second = false;
    const p = sem.acquire().then(() => { second = true; });
    expect(second).toBe(false);
    sem.release();
    await p;
    expect(second).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// MemoryCache (unit)
// ---------------------------------------------------------------------------

describe('MemoryCache', () => {
  it('stores and retrieves entries', () => {
    const cache = new MemoryCache();
    const entry = { statusCode: 200, headers: {}, body: 'hi', url: 'https://x.test/', timestamp: Date.now(), ttl: 60 };
    cache.set('k1', entry, 60);
    expect(cache.get('k1')).toBe(entry);
  });

  it('returns undefined for missing keys', () => {
    const cache = new MemoryCache();
    expect(cache.get('nope')).toBeUndefined();
  });

  it('expires entries past their TTL', async () => {
    const cache = new MemoryCache();
    const entry = { statusCode: 200, headers: {}, body: '', url: 'https://x.test/', timestamp: Date.now(), ttl: 0 };
    // TTL of 0 seconds means it expires immediately
    cache.set('k', entry, 0);
    // Let time pass
    await new Promise((r) => setTimeout(r, 5));
    expect(cache.get('k')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// searchParams normalization
// ---------------------------------------------------------------------------

describe('searchParams', () => {
  it('appends searchParams to the URL', async () => {
    let capturedUrl = '';
    const client = new HttpClient();
    const orig = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL) => {
      capturedUrl = typeof input === 'string' ? input : (input as Request).url ?? String(input);
      return new Response('', { status: 200 });
    };
    try {
      await client.get('https://example.test/search', {
        searchParams: { q: 'hello', limit: 10 },
      });
    } finally {
      globalThis.fetch = orig;
      await client.destroy();
    }
    const parsed = new URL(capturedUrl);
    expect(parsed.searchParams.get('q')).toBe('hello');
    expect(parsed.searchParams.get('limit')).toBe('10');
  });
});
