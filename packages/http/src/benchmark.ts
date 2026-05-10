// ============================================================================
// @actor-bonilla/http — Benchmark
//
// Compares raw globalThis.fetch versus HttpClient across several scenarios:
//   1. Sequential throughput
//   2. Concurrent burst (semaphore gate)
//   3. Cache hit vs miss
//   4. JSON parsing overhead
//   5. Paginated traversal
//
//   pnpm --filter @actor-bonilla/http run bench
// ============================================================================

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { HttpClient, paginateByPage } from '@actor-bonilla/http';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtMs(ms: number): string {
  return `${fmt(ms)} ms`;
}

interface BenchResult {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  opsPerSec: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

async function bench(
  name: string,
  iterations: number,
  warmup: number,
  fn: () => Promise<void>
): Promise<BenchResult> {
  for (let i = 0; i < warmup; i++) {
    await fn();
  }

  const samples: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    await fn();
    samples.push(performance.now() - t0);
  }

  samples.sort((a, b) => a - b);
  const totalMs = samples.reduce((s, v) => s + v, 0);
  const avgMs = totalMs / iterations;
  const opsPerSec = 1_000 / avgMs;
  const p50Ms = samples[Math.floor(iterations * 0.50)]!;
  const p95Ms = samples[Math.floor(iterations * 0.95)]!;
  const p99Ms = samples[Math.floor(iterations * 0.99)]!;

  return { name, iterations, totalMs, avgMs, opsPerSec, p50Ms, p95Ms, p99Ms };
}

function printResult(r: BenchResult) {
  console.log(
    `  ${r.name.padEnd(44)} ` +
    `avg=${fmtMs(r.avgMs).padStart(10)}  ` +
    `p50=${fmtMs(r.p50Ms).padStart(10)}  ` +
    `p95=${fmtMs(r.p95Ms).padStart(10)}  ` +
    `p99=${fmtMs(r.p99Ms).padStart(10)}  ` +
    `ops/s=${fmt(r.opsPerSec, 0).padStart(8)}`
  );
}

function printHeader(title: string) {
  const line = '─'.repeat(112);
  console.log(`\n${line}`);
  console.log(`  ${title}`);
  console.log(line);
  console.log(
    `  ${'name'.padEnd(44)} ${'avg'.padStart(14)} ${'p50'.padStart(14)} ${'p95'.padStart(14)} ${'p99'.padStart(14)} ${'ops/s'.padStart(13)}`
  );
  console.log(line);
}

// ─── Mock server ─────────────────────────────────────────────────────────────

const JSON_BODY = JSON.stringify({ id: 1, name: 'actor-bonilla', value: Math.PI });
const LARGE_BODY = JSON.stringify(
  Array.from({ length: 100 }, (_, i) => ({ id: i, data: 'x'.repeat(64) }))
);

type Handler = (req: IncomingMessage, res: ServerResponse) => void;
const handlers = new Map<string, Handler>();

const server = createServer((req, res) => {
  const path = req.url?.split('?')[0] ?? '/';
  const h = handlers.get(path);
  if (h) { h(req, res); } else { res.writeHead(404); res.end(); }
});

handlers.set('/json', (_req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON_BODY);
});

handlers.set('/large', (_req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(LARGE_BODY);
});

handlers.set('/cached', (_req, res) => {
  res.writeHead(200, {
    'content-type': 'application/json',
    'cache-control': 'max-age=60',
  });
  res.end(JSON_BODY);
});

handlers.set('/page', (req, res) => {
  const url = new URL(req.url!, 'http://localhost');
  const page = parseInt(url.searchParams.get('page') ?? '1', 10);
  const TOTAL_PAGES = 5;
  const items = page <= TOTAL_PAGES
    ? Array.from({ length: 10 }, (_, i) => ({ id: (page - 1) * 10 + i + 1 }))
    : [];
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(items));
});

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await new Promise<void>((res) => server.listen(0, '127.0.0.1', res));
  const { port } = server.address() as AddressInfo;
  const BASE = `http://127.0.0.1:${port}`;

  console.log('\n\x1b[1m\x1b[36m@actor-bonilla/http — Benchmark\x1b[0m');
  console.log(`\x1b[2mMock server on ${BASE}\x1b[0m`);

  const client = new HttpClient({ retry: { limit: 0 }, throwHttpErrors: false });
  const cachingClient = new HttpClient({ cache: true, retry: { limit: 0 }, throwHttpErrors: false });

  const ITER = 200;
  const WARMUP = 10;

  // ── 1. Sequential — raw fetch vs HttpClient ──────────────────────────────

  printHeader('1 · Sequential  (small JSON payload)');

  const r_fetch_seq = await bench('raw globalThis.fetch', ITER, WARMUP, async () => {
    const r = await globalThis.fetch(`${BASE}/json`);
    await r.json();
  });

  const r_client_seq = await bench('HttpClient.getJson', ITER, WARMUP, async () => {
    await client.getJson(`${BASE}/json`);
  });

  printResult(r_fetch_seq);
  printResult(r_client_seq);

  const overhead = r_client_seq.avgMs - r_fetch_seq.avgMs;
  console.log(
    `\n  overhead vs raw fetch: ${fmtMs(Math.abs(overhead))} ` +
    `${overhead >= 0 ? '(+actor overhead)' : '(faster — connection reuse)'}`
  );

  // ── 2. Sequential — large payload ────────────────────────────────────────

  printHeader('2 · Sequential  (large JSON payload — 100 objects × 64 B)');

  const r_fetch_large = await bench('raw globalThis.fetch', ITER, WARMUP, async () => {
    const r = await globalThis.fetch(`${BASE}/large`);
    await r.json();
  });

  const r_client_large = await bench('HttpClient.getJson', ITER, WARMUP, async () => {
    await client.getJson(`${BASE}/large`);
  });

  printResult(r_fetch_large);
  printResult(r_client_large);

  // ── 3. Concurrency ───────────────────────────────────────────────────────

  printHeader('3 · Concurrent burst  (50 requests in-flight)');

  const CONCURRENCY = 50;

  const r_fetch_conc = await bench(`raw fetch ×${CONCURRENCY} concurrent`, 20, 3, async () => {
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        const r = await globalThis.fetch(`${BASE}/json`);
        await r.json();
      })
    );
  });

  const r_client_conc = await bench(`HttpClient ×${CONCURRENCY} concurrent`, 20, 3, async () => {
    await Promise.all(
      Array.from({ length: CONCURRENCY }, () => client.getJson(`${BASE}/json`))
    );
  });

  printResult(r_fetch_conc);
  printResult(r_client_conc);

  // ── 4. Cache hit vs miss ─────────────────────────────────────────────────

  printHeader('4 · Cache — hit vs miss  (max-age=60)');

  await cachingClient.getJson(`${BASE}/cached`);

  const r_miss = await bench('HttpClient (cache miss)', ITER, WARMUP, async () => {
    await client.getJson(`${BASE}/cached`);
  });

  const r_hit = await bench('HttpClient (cache hit)', ITER, WARMUP, async () => {
    await cachingClient.getJson(`${BASE}/cached`);
  });

  printResult(r_miss);
  printResult(r_hit);

  const speedup = r_miss.avgMs / r_hit.avgMs;
  console.log(`\n  cache speedup: ${fmt(speedup)}×  (${fmtMs(r_miss.avgMs)} → ${fmtMs(r_hit.avgMs)})`);

  // ── 5. Pagination traversal ───────────────────────────────────────────────

  printHeader('5 · Pagination traversal  (5 pages × 10 items = 50 items)');

  const r_paginate = await bench('HttpClient.paginate (paginateByPage)', 20, 3, async () => {
    for await (const _item of client.paginate(`${BASE}/page`, {
      responseType: 'json',
      pagination: { paginate: paginateByPage(10) },
    })) { /* consume */ }
  });

  printResult(r_paginate);
  console.log(`  (5 HTTP round-trips per iteration, avg per page = ${fmtMs(r_paginate.avgMs / 5)})`);

  // ─── Teardown ─────────────────────────────────────────────────────────────

  await client.destroy();
  await cachingClient.destroy();
  server.close();

  console.log('\n\x1b[2mBenchmark complete.\x1b[0m\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
