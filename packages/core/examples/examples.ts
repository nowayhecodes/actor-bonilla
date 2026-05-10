// ============================================================================
// actor-bonilla — Example behavior factories for threaded actors
//
// Each export is a factory function that returns a ThreadedReceive.
// These are loaded by workers via dynamic import — functions can't cross
// thread boundaries, so the idiomatic pattern is a module path + factory
// name and serializable args (a recipe, not a function value).
// ============================================================================

import type {
  ThreadedReceive,
  ThreadedActorContext,
} from '../src/thread-pool.ts';

// ============================================================================
// Counter — simple stateful actor
// ============================================================================

export function createCounterBehavior(
  initialValue: number = 0
): ThreadedReceive {
  let count = initialValue;

  return (message: any, context: ThreadedActorContext) => {
    if (typeof message === 'object' && message !== null) {
      switch (message.type) {
        case 'increment':
          count += message.amount ?? 1;
          break;
        case 'decrement':
          count -= message.amount ?? 1;
          break;
        case 'getCount':
          context.reply(count);
          break;
        case 'reset':
          count = initialValue;
          break;
      }
    }
  };
}

// ============================================================================
// CPU-bound worker — simulates heavy computation
// ============================================================================

export function createCpuWorkerBehavior(): ThreadedReceive {
  return (message: any, context: ThreadedActorContext) => {
    if (typeof message === 'object' && message !== null) {
      switch (message.type) {
        case 'fibonacci': {
          const result = fibonacci(message.n);
          context.reply(result);
          break;
        }
        case 'primes': {
          const result = sieveOfEratosthenes(message.limit);
          context.reply(result.length);
          break;
        }
        case 'hash': {
          // Simulate CPU-intensive hashing
          let hash = 0;
          const str = message.data as string;
          for (let round = 0; round < (message.rounds ?? 1000); round++) {
            for (let i = 0; i < str.length; i++) {
              hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
            }
          }
          context.reply(hash);
          break;
        }
      }
    }
  };
}

function fibonacci(n: number): number {
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

function sieveOfEratosthenes(limit: number): number[] {
  const sieve = new Uint8Array(limit + 1);
  const primes: number[] = [];
  for (let i = 2; i <= limit; i++) {
    if (!sieve[i]) {
      primes.push(i);
      for (let j = i * i; j <= limit; j += i) {
        sieve[j] = 1;
      }
    }
  }
  return primes;
}

// ============================================================================
// Ping-pong partner — for cross-thread benchmarking
// ============================================================================

export function createPingBehavior(
  pongPath: string,
  totalRounds: number
): ThreadedReceive {
  let count = 0;
  let startTime = 0;

  return (message: any, context: ThreadedActorContext) => {
    if (typeof message === 'object' && message !== null) {
      switch (message.type) {
        case 'start':
          count = 0;
          startTime = performance.now();
          context.tell(pongPath, { type: 'ping', from: context.selfPath });
          break;
        case 'pong':
          count++;
          if (count < totalRounds) {
            context.tell(pongPath, { type: 'ping', from: context.selfPath });
          } else {
            const elapsed = performance.now() - startTime;
            // Reply with benchmark results
            context.reply({
              rounds: totalRounds,
              elapsedMs: elapsed,
              msgsPerSec: Math.round((totalRounds * 2) / (elapsed / 1000)),
            });
          }
          break;
      }
    }
  };
}

export function createPongBehavior(): ThreadedReceive {
  return (message: any, context: ThreadedActorContext) => {
    if (typeof message === 'object' && message !== null) {
      if (message.type === 'ping') {
        context.tell(message.from, { type: 'pong' });
      }
    }
  };
}

// ============================================================================
// Throughput sink — receives and counts messages as fast as possible
// ============================================================================

export function createSinkBehavior(expectedCount: number): ThreadedReceive {
  let count = 0;
  let startTime = 0;

  return (message: any, context: ThreadedActorContext) => {
    if (typeof message === 'object' && message !== null) {
      if (message.type === 'start') {
        count = 0;
        startTime = performance.now();
      } else if (message.type === 'msg') {
        count++;
        if (count >= expectedCount) {
          const elapsed = performance.now() - startTime;
          context.reply({
            count,
            elapsedMs: elapsed,
            msgsPerSec: Math.round(count / (elapsed / 1000)),
          });
        }
      } else if (message.type === 'getCount') {
        context.reply(count);
      }
    }
  };
}
