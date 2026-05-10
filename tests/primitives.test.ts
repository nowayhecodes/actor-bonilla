import { describe, it, expect, jest } from '@jest/globals';
import {
  DefaultDispatcher,
  PinnedDispatcher,
  CallingThreadDispatcher,
  UnboundedMailbox,
  BoundedMailbox,
  PriorityMailbox,
  EventStream,
  Router,
  RoutingStrategy,
  props,
  oneForOneStrategy,
  allForOneStrategy,
  SupervisionDirective,
  DEAD_LETTER_CHANNEL,
  LOG_CHANNEL,
  LIFECYCLE_CHANNEL,
  ActorSystem,
} from '../src/index.ts';

describe('dispatchers', () => {
  it('DefaultDispatcher batches and yields with setImmediate when backlog remains', async () => {
    const d = new DefaultDispatcher(2);
    const order: string[] = [];
    for (let i = 0; i < 5; i++) {
      d.dispatch(() => order.push(`t${i}`));
    }
    for (let i = 0; i < 20 && order.length < 5; i++) {
      await new Promise<void>((r) => setImmediate(r));
    }
    expect(order.length).toBe(5);
    d.shutdown();
  });

  it('PinnedDispatcher runs task via setImmediate', async () => {
    const d = new PinnedDispatcher();
    let ran = false;
    d.dispatch(() => {
      ran = true;
    });
    await new Promise<void>((r) => setImmediate(r));
    expect(ran).toBe(true);
    d.shutdown();
  });

  it('CallingThreadDispatcher runs synchronously', () => {
    const d = new CallingThreadDispatcher();
    let x = 0;
    d.dispatch(() => {
      x = 1;
    });
    expect(x).toBe(1);
    d.shutdown();
    d.dispatch(() => {
      x = 2;
    });
    expect(x).toBe(1);
  });
});

describe('mailboxes', () => {
  it('UnboundedMailbox grows and clears', () => {
    const m = new UnboundedMailbox<number>(2);
    expect(m.isEmpty).toBe(true);
    const env = (msg: number) =>
      ({
        message: msg,
        sender: null,
        timestamp: 0,
        messageId: 0,
      }) as const;
    expect(m.enqueue(env(1))).toBe(true);
    expect(m.size).toBe(1);
    expect(m.dequeue()?.message).toBe(1);
    m.enqueue(env(2));
    m.clear();
    expect(m.isEmpty).toBe(true);
  });

  it('BoundedMailbox drops when full', () => {
    const m = new BoundedMailbox<number>(1);
    const env = (msg: number) =>
      ({
        message: msg,
        sender: null,
        timestamp: 0,
        messageId: 0,
      }) as const;
    expect(m.enqueue(env(1))).toBe(true);
    expect(m.enqueue(env(2))).toBe(false);
    expect(m.size).toBe(1);
  });

  it('PriorityMailbox orders by comparator', () => {
    const m = new PriorityMailbox<number>((a, b) => {
      const na = a.message as number;
      const nb = b.message as number;
      return na - nb;
    });
    const env = (msg: number) =>
      ({
        message: msg,
        sender: null,
        timestamp: 0,
        messageId: 0,
      }) as const;
    m.enqueue(env(10));
    m.enqueue(env(2));
    expect(m.dequeue()?.message).toBe(2);
    expect(m.dequeue()?.message).toBe(10);
  });
});

describe('event stream', () => {
  it('subscribe, publish, unsubscribe, hasSubscribers, clear', () => {
    const es = new EventStream();
    const sym = Symbol('t');
    let n = 0;
    const sub = (v: number) => {
      n += v;
    };
    es.subscribe(sym, sub);
    expect(es.hasSubscribers(sym)).toBe(true);
    es.publish(sym, 3);
    expect(n).toBe(3);
    expect(es.unsubscribe(sym, sub)).toBe(true);
    expect(es.unsubscribe(sym, sub)).toBe(false);
    es.subscribe(sym, sub);
    es.clear();
    expect(es.hasSubscribers(sym)).toBe(false);
  });

  it('subscriber errors are isolated', () => {
    const es = new EventStream();
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    es.subscribe('x', () => {
      throw new Error('boom');
    });
    es.publish('x', 1);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('well-known channels exist', () => {
    expect(typeof DEAD_LETTER_CHANNEL).toBe('symbol');
    expect(typeof LOG_CHANNEL).toBe('symbol');
    expect(typeof LIFECYCLE_CHANNEL).toBe('symbol');
  });
});

describe('router', () => {
  async function routeOnce(strategy: RoutingStrategy, msg: unknown) {
    const system = new ActorSystem({ logDeadLetters: false });
    const hub = system.actorOf(
      props((_signal, ctx) => {
        const r = new Router(
          {
            strategy,
            nrOfInstances: 2,
            props: props(() => {}),
          },
          ctx
        );
        r.route(msg as never);
      }),
      `hub-${strategy}-${Math.random()}`
    );
    hub.tell('run');
    await new Promise<void>((r) => setImmediate(r));
    await system.terminate();
  }

  it('covers routing strategies', async () => {
    await routeOnce(RoutingStrategy.RoundRobin, 'a');
    await routeOnce(RoutingStrategy.Random, 'b');
    await routeOnce(RoutingStrategy.SmallestMailbox, 'c');
    await routeOnce(RoutingStrategy.Broadcast, 'd');
    await routeOnce(RoutingStrategy.ConsistentHash, { hashKey: 'k' });
    await routeOnce(RoutingStrategy.ConsistentHash, 'plain');
  });

  it('Router addRoutee removeRoutee getRoutees', async () => {
    const system = new ActorSystem({ logDeadLetters: false });
    const ref = system.actorOf(
      props((_msg, ctx) => {
        const r = new Router(
          {
            strategy: RoutingStrategy.RoundRobin,
            nrOfInstances: 1,
            props: props(() => {}),
          },
          ctx
        );
        const extra = ctx.spawn(props(() => {}), 'extra');
        r.addRoutee(extra);
        r.removeRoutee(extra);
        expect(r.getRoutees().length).toBeGreaterThan(0);
      }),
      'rt'
    );
    ref.tell('x');
    await new Promise<void>((r) => setImmediate(r));
    await system.terminate();
  });
});

describe('strategy factories', () => {
  it('oneForOneStrategy and allForOneStrategy', () => {
    const s1 = oneForOneStrategy(3, 1000, () => SupervisionDirective.Resume);
    expect(s1.type).toBe('one-for-one');
    const s2 = allForOneStrategy(2, 500, () => SupervisionDirective.Stop);
    expect(s2.type).toBe('all-for-one');
  });
});
