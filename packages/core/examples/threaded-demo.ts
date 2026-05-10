// ============================================================================
// actor-bonilla — Multi-threaded demo and benchmark
//
// Demonstrates true parallel actor processing across CPU cores using
// worker_threads, then benchmarks single-threaded vs multi-threaded
// performance on CPU-bound workloads.
// ============================================================================

import { isMainThread } from 'node:worker_threads';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { ThreadedActorSystem } from '../src/threaded-actor-system.ts';
import { props, type ActorRef } from '../src/index.ts';

// Only run on main thread (workers load thread-pool.ts directly)
if (!isMainThread) {
  // This file was loaded as a worker — the WorkerShard in thread-pool.ts
  // will handle it. We just need to ensure thread-pool.ts is imported.
  await import('../src/thread-pool.ts');
  // Worker is now active, no further code needed here.
} else {
  // ============================================================================
  // Resolve the behavior module path
  // ============================================================================

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const behaviorsModule = resolve(__dirname, 'behaviors', 'examples.ts');
  const threadPoolModule = resolve(__dirname, '../src/thread-pool.ts');

  function formatNum(n: number): string {
    return n.toLocaleString('en-US');
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  const divider = (title: string) =>
    console.log(`\n${'='.repeat(60)}\n  ${title}\n${'='.repeat(60)}`);

  // ============================================================================
  // Demo 1: Basic Threaded Actor
  // ============================================================================

  async function demoThreadedCounter() {
    divider('1. Threaded Counter Actor');

    const system = new ThreadedActorSystem({
      name: 'threaded-demo',
      logDeadLetters: false,
      threadPool: { poolSize: 2, workerScript: threadPoolModule },
    });

    try {
      const counter = await system.threadedActorOf<any>(
        {
          behaviorModule: behaviorsModule,
          behaviorExport: 'createCounterBehavior',
          behaviorArgs: [0],
        },
        'counter'
      );

      console.log(`  Created threaded actor: ${counter.path}`);
      console.log(`  Pool size: ${system.poolSize} workers`);

      counter.tell({ type: 'increment', amount: 10 });
      counter.tell({ type: 'increment', amount: 5 });
      counter.tell({ type: 'decrement', amount: 3 });

      await sleep(50);

      const count = await counter.ask<number>({ type: 'getCount' });
      console.log(`  Counter value: ${count} (expected: 12)`);

      counter.tell({ type: 'reset' });
      await sleep(20);
      const resetCount = await counter.ask<number>({ type: 'getCount' });
      console.log(`  After reset: ${resetCount} (expected: 0)`);
    } finally {
      await system.terminate();
    }
  }

  // ============================================================================
  // Demo 2: CPU-Bound Work on Worker Threads
  // ============================================================================

  async function demoCpuBound() {
    divider('2. CPU-Bound Work on Worker Threads');

    const numWorkers = Math.max(cpus().length - 1, 2);

    const system = new ThreadedActorSystem({
      name: 'cpu-demo',
      logDeadLetters: false,
      threadPool: { poolSize: numWorkers, workerScript: threadPoolModule },
    });

    try {
      // Create CPU workers on different threads
      const workers: ActorRef<any>[] = [];
      for (let i = 0; i < numWorkers; i++) {
        const w = await system.threadedActorOf<any>(
          {
            behaviorModule: behaviorsModule,
            behaviorExport: 'createCpuWorkerBehavior',
          },
          `cpu-worker-${i}`,
          i
        );
        workers.push(w);
      }
      console.log(
        `  Created ${numWorkers} CPU workers across ${numWorkers} threads`
      );

      // Parallel fibonacci computation
      console.log('\n  Computing fibonacci numbers in parallel...');
      const fibInputs = [40, 41, 42, 43, 44, 45];
      const start = performance.now();

      const fibResults = await Promise.all(
        fibInputs.map((n, i) =>
          workers[i % workers.length].ask<number>({ type: 'fibonacci', n })
        )
      );

      const parallelTime = performance.now() - start;
      console.log(
        `  Results: ${fibInputs.map((n, i) => `fib(${n})=${fibResults[i]}`).join(', ')}`
      );
      console.log(`  Parallel time: ${parallelTime.toFixed(1)}ms`);

      // Compare with sequential on main thread (single-threaded)
      console.log('\n  Same computation sequentially on main thread...');
      const seqStart = performance.now();
      const seqResults: number[] = [];
      for (const n of fibInputs) {
        seqResults.push(fibSeq(n));
      }
      const seqTime = performance.now() - seqStart;
      console.log(`  Sequential time: ${seqTime.toFixed(1)}ms`);
      console.log(`  Speedup: ${(seqTime / parallelTime).toFixed(2)}x`);

      // Parallel prime sieve
      console.log('\n  Parallel prime sieve (finding primes up to N)...');
      const sieveInputs = [5_000_000, 10_000_000, 15_000_000, 20_000_000];
      const sieveStart = performance.now();

      const sieveResults = await Promise.all(
        sieveInputs.map((limit, i) =>
          workers[i % workers.length].ask<number>({ type: 'primes', limit })
        )
      );

      const sieveTime = performance.now() - sieveStart;
      for (let i = 0; i < sieveInputs.length; i++) {
        console.log(
          `  Primes up to ${formatNum(sieveInputs[i])}: ${formatNum(sieveResults[i])}`
        );
      }
      console.log(`  Parallel sieve time: ${sieveTime.toFixed(1)}ms`);
    } finally {
      await system.terminate();
    }
  }

  function fibSeq(n: number): number {
    if (n <= 1) return n;
    let a = 0,
      b = 1;
    for (let i = 2; i <= n; i++) {
      const tmp = a + b;
      a = b;
      b = tmp;
    }
    return b;
  }

  // ============================================================================
  // Demo 3: Mixed Local + Threaded Actors
  // ============================================================================

  async function demoMixed() {
    divider('3. Mixed Local + Threaded Actors');

    const system = new ThreadedActorSystem({
      name: 'mixed-demo',
      logDeadLetters: false,
      threadPool: { poolSize: 2, workerScript: threadPoolModule },
    });

    try {
      // Create a local actor (main thread)
      const localActor = system.actorOf<any>(
        props((msg, ctx) => {
          if (
            typeof msg === 'object' &&
            msg !== null &&
            msg.type === 'fromThread'
          ) {
            console.log(
              `  [Local Actor] Received from threaded actor: "${msg.data}"`
            );
          }
        }),
        'local-handler'
      );
      console.log(`  Local actor: ${localActor.path}`);

      // Create a threaded actor
      const threadedCounter = await system.threadedActorOf<any>(
        {
          behaviorModule: behaviorsModule,
          behaviorExport: 'createCounterBehavior',
          behaviorArgs: [100],
        },
        'threaded-counter'
      );
      console.log(`  Threaded actor: ${threadedCounter.path}`);

      // Threaded actor can be asked from main thread
      const val = await threadedCounter.ask<number>({ type: 'getCount' });
      console.log(`  Ask threaded actor for count: ${val}`);

      // Mixed interaction works through the routing layer
      threadedCounter.tell({ type: 'increment', amount: 42 });
      await sleep(30);
      const newVal = await threadedCounter.ask<number>({ type: 'getCount' });
      console.log(`  After increment: ${newVal}`);
    } finally {
      await system.terminate();
    }
  }

  // ============================================================================
  // Benchmark: Parallel CPU-bound throughput
  // ============================================================================

  async function benchParallelCpu() {
    divider('Benchmark: Parallel CPU Hash Throughput');

    const numWorkers = Math.max(cpus().length - 1, 2);

    const system = new ThreadedActorSystem({
      name: 'bench-parallel',
      logDeadLetters: false,
      threadPool: { poolSize: numWorkers, workerScript: threadPoolModule },
    });

    try {
      const workers: ActorRef<any>[] = [];
      for (let i = 0; i < numWorkers; i++) {
        const w = await system.threadedActorOf<any>(
          {
            behaviorModule: behaviorsModule,
            behaviorExport: 'createCpuWorkerBehavior',
          },
          `hash-worker-${i}`,
          i
        );
        workers.push(w);
      }

      const data = 'The quick brown fox jumps over the lazy dog. '.repeat(100);
      const rounds = 10_000;
      const tasksPerWorker = 4;
      const totalTasks = numWorkers * tasksPerWorker;

      console.log(
        `  ${numWorkers} workers, ${tasksPerWorker} tasks each, ${rounds} hash rounds per task`
      );

      // Parallel
      const pStart = performance.now();
      const parallelResults = await Promise.all(
        Array.from({ length: totalTasks }, (_, i) =>
          workers[i % numWorkers].ask<number>({ type: 'hash', data, rounds })
        )
      );
      const pTime = performance.now() - pStart;

      // Sequential (main thread)
      const sStart = performance.now();
      for (let t = 0; t < totalTasks; t++) {
        let hash = 0;
        for (let round = 0; round < rounds; round++) {
          for (let i = 0; i < data.length; i++) {
            hash = ((hash << 5) - hash + data.charCodeAt(i)) | 0;
          }
        }
      }
      const sTime = performance.now() - sStart;

      console.log(`  Parallel:   ${pTime.toFixed(1)}ms`);
      console.log(`  Sequential: ${sTime.toFixed(1)}ms`);
      console.log(
        `  Speedup:    ${(sTime / pTime).toFixed(2)}x across ${numWorkers} threads`
      );
    } finally {
      await system.terminate();
    }
  }

  // ============================================================================
  // Run
  // ============================================================================

  async function main() {
    console.log('\n🧵 actor-bonilla — multi-threaded actor system demo');
    console.log(
      `   CPU cores: ${cpus().length}, Worker threads: ${Math.max(cpus().length - 1, 2)}\n`
    );

    await demoThreadedCounter();
    await demoCpuBound();
    await demoMixed();
    await benchParallelCpu();

    divider('All multi-threaded demos complete!');
  }

  main().catch(console.error);
} // end isMainThread
