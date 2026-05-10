// ============================================================================
// @actor-bonilla/http — Feature demo
//
// Runs a self-contained local HTTP server and walks through the library's
// main features so you can see every API in action without any external deps.
//
//   pnpm --filter @actor-bonilla/http run demo
// ============================================================================

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { ActorSystem } from '@actor-bonilla/core';
import type { EventClassifier } from '@actor-bonilla/core';

import {
  HttpClient,
  HTTP_PROGRESS_CHANNEL,
  HTTP_REQUEST_CHANNEL,
  HTTP_RESPONSE_CHANNEL,
  HTTP_ERROR_CHANNEL,
  HTTPError,
  TimeoutError,
  paginateByPage,
  paginateByLinkHeader,
} from '@actor-bonilla/http';
import type { HttpProgressEvent } from '@actor-bonilla/http';

// ─── Colour helpers ───────────────────────────────────────────────────────────

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
};

function section(title: string) {
  console.log(`\n${c.bold}${c.blue}── ${title} ${'─'.repeat(Math.max(0, 55 - title.length))}${c.reset}`);
}
function ok(msg: string) { console.log(`  ${c.green}✓${c.reset}  ${msg}`); }
function info(msg: string) { console.log(`  ${c.dim}ℹ${c.reset}  ${c.dim}${msg}${c.reset}`); }

// ─── Mock server ─────────────────────────────────────────────────────────────

type RouteHandler = (req: IncomingMessage, res: ServerResponse) => void;
const routes = new Map<string, RouteHandler>();

function route(path: string, handler: RouteHandler) {
  routes.set(path, handler);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
  });
}

let requestCount = 0;

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost`);
  const handler = routes.get(url.pathname);
  if (handler) {
    await handler(req, res);
  } else {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found', path: url.pathname }));
  }
});

// ─── Routes ───────────────────────────────────────────────────────────────────

route('/hello', (_req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ message: 'Hello from @actor-bonilla/http!' }));
});

route('/post', async (req, res) => {
  const payload = await readBody(req);
  const parsed = JSON.parse(payload);
  res.writeHead(201, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ received: parsed, echo: true }));
});

route('/flaky', (_req, res) => {
  requestCount++;
  if (requestCount < 3) {
    res.writeHead(503, { 'content-type': 'application/json', 'retry-after': '0' });
    res.end(JSON.stringify({ error: 'Service unavailable', attempt: requestCount }));
  } else {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, succeededOnAttempt: requestCount }));
  }
});

route('/stream', (_req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' });
  let i = 0;
  const t = setInterval(() => {
    res.write(`chunk-${i++} `);
    if (i >= 5) { clearInterval(t); res.end(); }
  }, 10);
});

route('/cached', (_req, res) => {
  res.writeHead(200, {
    'content-type': 'application/json',
    'cache-control': 'max-age=60',
  });
  res.end(JSON.stringify({ servedAt: Date.now() }));
});

route('/page', (req, res) => {
  const host = req.headers.host ?? 'localhost';
  const url = new URL(req.url!, `http://${host}`);
  const page = parseInt(url.searchParams.get('page') ?? '1', 10);
  const perPage = 3;
  const total = 9;
  const items = Array.from({ length: perPage }, (_, i) => ({
    id: (page - 1) * perPage + i + 1,
    page,
  }));
  const hasNext = page * perPage < total;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (hasNext) headers['link'] = `<http://${host}/page?page=${page + 1}>; rel="next"`;
  res.writeHead(200, headers);
  res.end(JSON.stringify(items));
});

route('/auth', (req, res) => {
  const auth = req.headers['authorization'] ?? '';
  if (!auth.startsWith('Basic ')) {
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }
  const decoded = Buffer.from(auth.slice(6), 'base64').toString();
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ authenticated: true, user: decoded.split(':')[0] }));
});

route('/not-found', (_req, res) => {
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'Resource not found' }));
});

route('/slow', (_req, res) => {
  setTimeout(() => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ slow: true }));
  }, 2_000);
});

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const BASE = `http://127.0.0.1:${port}`;

  console.log(`${c.bold}${c.cyan}@actor-bonilla/http — Feature Demo${c.reset}`);
  console.log(`${c.dim}Mock server running on ${BASE}${c.reset}`);

  // ── 1. Actor System event stream ──────────────────────────────────────────

  section('1. Actor System — Event Stream');

  const system = new ActorSystem({ name: 'http-demo', logDeadLetters: false });

  const requestLog: string[] = [];
  const responseLog: string[] = [];
  const downloadLog: string[] = [];

  system.eventStream.subscribe<{ url: string; method: string }>(
    HTTP_REQUEST_CHANNEL as EventClassifier,
    ({ url, method }) => requestLog.push(`${method} ${url}`)
  );

  system.eventStream.subscribe<{ url: string; statusCode: number }>(
    HTTP_RESPONSE_CHANNEL as EventClassifier,
    ({ statusCode }) => responseLog.push(String(statusCode))
  );

  system.eventStream.subscribe<HttpProgressEvent>(
    HTTP_PROGRESS_CHANNEL as EventClassifier,
    ({ direction, progress }) => {
      if (direction === 'download' && progress.percent === 1) {
        downloadLog.push(`${(progress.percent * 100).toFixed(0)}%`);
      }
    }
  );

  const client = new HttpClient({ actorSystem: system });

  ok('Subscribed to HTTP_REQUEST_CHANNEL, HTTP_RESPONSE_CHANNEL, HTTP_PROGRESS_CHANNEL');

  // ── 2. Basic requests ─────────────────────────────────────────────────────

  section('2. Basic requests — GET / POST / JSON');

  const getResp = await client.get<{ message: string }>(`${BASE}/hello`, {
    responseType: 'json',
  });
  ok(`GET /hello → ${getResp.statusCode}  body: "${getResp.body.message}"`);
  info(`timings: total=${getResp.timings.phases.total}ms`);

  interface PostResult { received: { name: string }; echo: boolean }
  const postBody = await client.postJson<PostResult>(`${BASE}/post`, { name: 'actor-bonilla' });
  ok(`POST /post → received.name="${postBody.received.name}", echo=${postBody.echo}`);

  // ── 3. Hooks ─────────────────────────────────────────────────────────────

  section('3. Hooks — beforeRequest / afterResponse / beforeRetry / beforeError');

  const hookLog: string[] = [];

  const hookedClient = client.extend({
    hooks: {
      beforeRequest: [(opts) => { hookLog.push(`beforeRequest: ${opts.url.pathname}`); }],
      afterResponse: [(resp) => { hookLog.push(`afterResponse: ${resp.statusCode}`); return resp; }],
      beforeRetry: [({ retryCount }) => { hookLog.push(`beforeRetry: attempt ${retryCount + 1}`); }],
      beforeError: [(err) => { hookLog.push(`beforeError: ${err.name}`); return err; }],
    },
  });

  requestCount = 0;
  await hookedClient.get(`${BASE}/flaky`, { responseType: 'json' });
  ok(`Hooks fired: ${hookLog.join(' → ')}`);

  // ── 4. Automatic retry ────────────────────────────────────────────────────

  section('4. Retry — exponential backoff on 503');

  requestCount = 0;
  const retryLogs: string[] = [];

  const retryClient = client.extend({
    retry: { limit: 3, statusCodes: [503], calculateDelay: () => 10 },
    hooks: {
      beforeRetry: [({ retryCount }) => { retryLogs.push(`retry #${retryCount + 1}`); }],
    },
  });

  const retryResp = await retryClient.get<{ succeededOnAttempt: number }>(
    `${BASE}/flaky`,
    { responseType: 'json' }
  );
  ok(`Succeeded after ${retryLogs.length} retries → attempt ${retryResp.body.succeededOnAttempt}`);
  info(`retry log: ${retryLogs.join(', ')}`);

  // ── 5. Error handling ─────────────────────────────────────────────────────

  section('5. Error handling — HTTPError / TimeoutError');

  try {
    await client.get(`${BASE}/not-found`);
  } catch (err) {
    if (err instanceof HTTPError) {
      ok(`HTTPError caught: status=${err.response.statusCode}, code=${err.code}`);
    }
  }

  try {
    await client.get(`${BASE}/slow`, { timeout: 50 });
  } catch (err) {
    if (err instanceof TimeoutError) {
      ok(`TimeoutError caught: event="${err.event}", code=${err.code}`);
    }
  }

  // ── 6. Basic Auth via extend ──────────────────────────────────────────────

  section('6. Basic Auth + extend()');

  const authClient = client.extend({
    username: 'gustavo',
    password: 's3cr3t',
    prefixUrl: `${BASE}`,
  });

  const authResp = await authClient.get<{ authenticated: boolean; user: string }>(
    'auth',
    { responseType: 'json' }
  );
  ok(`Authenticated: user="${authResp.body.user}"`);

  // ── 7. Caching ────────────────────────────────────────────────────────────

  section('7. RFC-lite caching — MemoryCache via CacheActor');

  const cachingClient = client.extend({ cache: true });

  const first = await cachingClient.get<{ servedAt: number }>(
    `${BASE}/cached`,
    { responseType: 'json' }
  );
  const second = await cachingClient.get<{ servedAt: number }>(
    `${BASE}/cached`,
    { responseType: 'json' }
  );

  ok(`First request  fromCache=${first.fromCache}, servedAt=${first.body.servedAt}`);
  ok(`Second request fromCache=${second.fromCache}, servedAt=${second.body.servedAt}`);
  ok(`Cache hit confirmed: servedAt identical = ${first.body.servedAt === second.body.servedAt}`);

  // ── 8. Pagination — paginateByLinkHeader ─────────────────────────────────

  section('8. Pagination — paginateByLinkHeader (Link: rel="next")');

  const items: Array<{ id: number; page: number }> = [];

  for await (const item of client.paginate<{ id: number; page: number }>(
    `${BASE}/page`,
    {
      responseType: 'json',
      pagination: {
        paginate: paginateByLinkHeader(),
      },
    }
  )) {
    items.push(item);
  }

  ok(`Collected ${items.length} items across ${items[items.length - 1]!.page} pages`);
  info(`IDs: ${items.map((i) => i.id).join(', ')}`);

  // ── 9. Pagination — paginateByPage ────────────────────────────────────────

  section('9. Pagination — paginateByPage (countLimit)');

  const limited: Array<{ id: number }> = [];
  for await (const item of client.paginate<{ id: number }>(
    `${BASE}/page`,
    {
      responseType: 'json',
      pagination: {
        paginate: paginateByPage(3),
        countLimit: 5,
      },
    }
  )) {
    limited.push(item);
  }
  ok(`countLimit=5 → collected ${limited.length} items (expected ≤ 5)`);

  // ── 10. Streaming ─────────────────────────────────────────────────────────

  section('10. Streaming — ReadableStream<Uint8Array>');

  const stream = await client.stream(`${BASE}/stream`);
  const reader = stream.getReader();
  const chunks: string[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(new TextDecoder().decode(value).trim());
  }
  ok(`Read ${chunks.length} chunks: ${chunks.slice(0, 3).join(' ')} …`);

  // ── 11. Event stream recap ────────────────────────────────────────────────

  section('11. Actor System — Event Stream recap');

  ok(`HTTP_REQUEST_CHANNEL  fired: ${requestLog.length}  events`);
  ok(`HTTP_RESPONSE_CHANNEL fired: ${responseLog.length} events`);
  ok(`HTTP_PROGRESS_CHANNEL download-complete events: ${downloadLog.length}`);
  info(`Response codes seen: ${[...new Set(responseLog)].join(', ')}`);

  // ── 12. Error channel ─────────────────────────────────────────────────────

  section('12. HTTP_ERROR_CHANNEL');

  let errorCount = 0;
  system.eventStream.subscribe<{ url: string; error: Error }>(
    HTTP_ERROR_CHANNEL as EventClassifier,
    () => errorCount++
  );

  try { await client.get(`${BASE}/not-found`); } catch { /* expected */ }
  ok(`HTTP_ERROR_CHANNEL received ${errorCount} event(s)`);

  // ─── Teardown ─────────────────────────────────────────────────────────────

  await client.destroy();
  await system.terminate();
  server.close();

  console.log(`\n${c.bold}${c.green}Demo complete.${c.reset}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
