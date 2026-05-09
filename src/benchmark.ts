// ============================================================================
// actor-bonilla — Benchmark
// Measures raw message throughput, latency, and actor creation speed.
// ============================================================================

import { ActorSystem, props, type ActorRef } from './index.js';

function formatNum(n: number): string {
  return n.toLocaleString('en-US');
}

// ============================================================================
// 1. Throughput: ping-pong between two actors
// ============================================================================

async function benchPingPong(totalMessages: number): Promise<void> {
  console.log(
    `\n--- Ping-Pong Throughput (${formatNum(totalMessages)} messages) ---`
  );

  const system = new ActorSystem({
    logDeadLetters: false,
    defaultThroughput: 128,
  });

  return new Promise<void>((resolve) => {
    let count = 0;
    const half = totalMessages / 2;
    let start: number;

    let pong: ActorRef<string>;

    const ping = system.actorOf<string>(
      props((msg, ctx) => {
        if (msg === 'start') {
          start = performance.now();
          pong.tell('ping', ctx.self);
          return;
        }
        if (msg === 'pong') {
          count++;
          if (count < half) {
            pong.tell('ping', ctx.self);
          } else {
            const elapsed = performance.now() - start;
            const throughput = (totalMessages / elapsed) * 1000;
            console.log(`  Time: ${elapsed.toFixed(1)}ms`);
            console.log(
              `  Throughput: ${formatNum(Math.round(throughput))} msg/sec`
            );
            system.terminate().then(resolve);
          }
        }
      }),
      'ping'
    );

    pong = system.actorOf<string>(
      props((msg, ctx) => {
        if (msg === 'ping' && ctx.sender) {
          ctx.sender.tell('pong', ctx.self);
        }
      }),
      'pong'
    );

    // Warm up
    setTimeout(() => {
      ping.tell('start');
    }, 10);
  });
}

// ============================================================================
// 2. Fan-out: single producer, many consumers
// ============================================================================

async function benchFanOut(
  numWorkers: number,
  messagesPerWorker: number
): Promise<void> {
  const total = numWorkers * messagesPerWorker;
  console.log(
    `\n--- Fan-Out (${numWorkers} workers × ${formatNum(messagesPerWorker)} msgs = ${formatNum(total)}) ---`
  );

  const system = new ActorSystem({
    logDeadLetters: false,
    defaultThroughput: 64,
  });

  return new Promise<void>((resolve) => {
    let completed = 0;
    const start = performance.now();

    const workers: ActorRef<number>[] = [];
    for (let i = 0; i < numWorkers; i++) {
      workers.push(
        system.actorOf<number>(
          props((msg) => {
            if (typeof msg === 'number') {
              completed++;
              if (completed >= total) {
                const elapsed = performance.now() - start;
                const throughput = (total / elapsed) * 1000;
                console.log(`  Time: ${elapsed.toFixed(1)}ms`);
                console.log(
                  `  Throughput: ${formatNum(Math.round(throughput))} msg/sec`
                );
                system.terminate().then(resolve);
              }
            }
          }),
          `worker-${i}`
        )
      );
    }

    // Fire messages
    for (let i = 0; i < messagesPerWorker; i++) {
      for (const worker of workers) {
        worker.tell(i);
      }
    }
  });
}

// ============================================================================
// 3. Actor creation speed
// ============================================================================

async function benchActorCreation(count: number): Promise<void> {
  console.log(`\n--- Actor Creation (${formatNum(count)} actors) ---`);

  const system = new ActorSystem({ logDeadLetters: false });

  const start = performance.now();
  for (let i = 0; i < count; i++) {
    system.actorOf(
      props(() => {}),
      `actor-${i}`
    );
  }
  const elapsed = performance.now() - start;
  const rate = (count / elapsed) * 1000;

  console.log(`  Time: ${elapsed.toFixed(1)}ms`);
  console.log(`  Rate: ${formatNum(Math.round(rate))} actors/sec`);

  await system.terminate();
}

// ============================================================================
// 4. Chain (pipeline): message passes through N actors in series
// ============================================================================

async function benchChain(
  chainLength: number,
  totalMessages: number
): Promise<void> {
  console.log(
    `\n--- Chain Pipeline (${chainLength} actors, ${formatNum(totalMessages)} messages) ---`
  );

  const system = new ActorSystem({
    logDeadLetters: false,
    defaultThroughput: 128,
  });

  return new Promise<void>((resolve) => {
    let received = 0;
    const start = performance.now();

    // Create chain from tail to head
    let next: ActorRef<number> = system.actorOf<number>(
      props((msg) => {
        if (typeof msg === 'number') {
          received++;
          if (received >= totalMessages) {
            const elapsed = performance.now() - start;
            const totalHops = totalMessages * chainLength;
            const throughput = (totalHops / elapsed) * 1000;
            console.log(`  Time: ${elapsed.toFixed(1)}ms`);
            console.log(`  Total hops: ${formatNum(totalHops)}`);
            console.log(
              `  Throughput: ${formatNum(Math.round(throughput))} hops/sec`
            );
            system.terminate().then(resolve);
          }
        }
      }),
      'tail'
    );

    for (let i = chainLength - 2; i >= 0; i--) {
      const target = next;
      next = system.actorOf<number>(
        props((msg) => {
          if (typeof msg === 'number') {
            target.tell(msg + 1);
          }
        }),
        `chain-${i}`
      );
    }

    const head = next;

    // Fire messages into the head
    for (let i = 0; i < totalMessages; i++) {
      head.tell(0);
    }
  });
}

// ============================================================================
// 5. Mailbox throughput (single actor, flood of messages)
// ============================================================================

async function benchMailboxFlood(totalMessages: number): Promise<void> {
  console.log(
    `\n--- Mailbox Flood (${formatNum(totalMessages)} messages → single actor) ---`
  );

  const system = new ActorSystem({
    logDeadLetters: false,
    defaultThroughput: 256,
  });

  return new Promise<void>((resolve) => {
    let count = 0;
    const start = performance.now();

    const actor = system.actorOf<number>(
      props((msg) => {
        if (typeof msg === 'number') {
          count++;
          if (count >= totalMessages) {
            const elapsed = performance.now() - start;
            const throughput = (totalMessages / elapsed) * 1000;
            console.log(`  Time: ${elapsed.toFixed(1)}ms`);
            console.log(
              `  Throughput: ${formatNum(Math.round(throughput))} msg/sec`
            );
            system.terminate().then(resolve);
          }
        }
      }),
      'sink'
    );

    for (let i = 0; i < totalMessages; i++) {
      actor.tell(i);
    }
  });
}

// ============================================================================
// Run all benchmarks
// ============================================================================

async function main() {
  console.log('🏎️  actor-bonilla benchmarks\n');
  console.log(
    `Node.js ${process.version}, ${process.platform} ${process.arch}`
  );

  await benchActorCreation(100_000);
  await benchMailboxFlood(1_000_000);
  await benchPingPong(1_000_000);
  await benchFanOut(100, 10_000);
  await benchChain(50, 10_000);

  console.log('\n✅ All benchmarks complete.\n');
}

main().catch(console.error);
