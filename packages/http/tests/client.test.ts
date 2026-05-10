import { describe, expect, it, jest } from '@jest/globals';
import { HttpClient } from '../src/client.ts';

describe('HttpClient', () => {
  it('resolves relative URLs against prefixUrl and merges headers', async () => {
    const fetchMock = jest.fn(
      async (_input: RequestInfo | URL) => new Response('ok', { status: 200 })
    );
    const client = new HttpClient({
      prefixUrl: 'https://example.test/api/',
      headers: { 'x-app': 'bonilla' },
      fetch: fetchMock as unknown as typeof fetch,
    });

    await client.get('hello');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const req = fetchMock.mock.calls[0][0] as Request;
    expect(req.url).toBe('https://example.test/api/hello');
    expect(req.headers.get('x-app')).toBe('bonilla');
  });

  it('retries retryable status codes then succeeds', async () => {
    let count = 0;
    const fetchMock = jest.fn(async () => {
      count += 1;
      if (count === 1) return new Response('temp', { status: 503 });
      return new Response('ok', { status: 200 });
    });

    const client = new HttpClient({
      retry: { limit: 2 },
      fetch: fetchMock as unknown as typeof fetch,
    });

    const res = await client.get('https://example.test/r');
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('applies afterResponse hook', async () => {
    const fetchMock = jest.fn(
      async () => new Response('x', { status: 200 })
    );
    const client = new HttpClient({
      fetch: fetchMock as unknown as typeof fetch,
      hooks: {
        afterResponse: async (response) => {
          const headers = new Headers(response.headers);
          headers.set('x-wrapped', '1');
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
          });
        },
      },
    });

    const res = await client.get('https://example.test/z');
    expect(res.headers.get('x-wrapped')).toBe('1');
  });

});
