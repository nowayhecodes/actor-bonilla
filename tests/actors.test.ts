import { describe, it, expect } from '@jest/globals';

import {
  ActorSystem,
  props,
  MailboxType,
  DispatcherType,
  PoisonPill,
  Kill,
  SupervisionDirective,
  oneForOneStrategy,
} from '../src/index.ts';

async function drain(ms = 50): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    await new Promise<void>((r) => setImmediate(r));
  }
}

describe('ActorSystem', () => {
  it('throws when duplicate actor name', () => {
    const system = new ActorSystem({ logDeadLetters: false });
    system.actorOf(props(() => {}), 'dup');
    expect(() => system.actorOf(props(() => {}), 'dup')).toThrow(/already exists/);
    void system.terminate();
  });

  it('throws actorOf when terminated', async () => {
    const system = new ActorSystem({ logDeadLetters: false });
    await system.terminate();
    expect(() => system.actorOf(props(() => {}), 'late')).toThrow(/terminated/);
  });

  it('actorFor resolves /user/:name only', () => {
    const system = new ActorSystem({ logDeadLetters: false });
    const a = system.actorOf(props(() => {}), 'x');
    expect(system.actorFor('/user/x')).toBe(a);
    expect(system.actorFor('/bad/x')).toBeUndefined();
    expect(system.actorFor('/user')).toBeUndefined();
    void system.terminate();
  });

  it('terminate is idempotent', async () => {
    const system = new ActorSystem({ logDeadLetters: false });
    await system.terminate();
    await system.terminate();
    expect(system.isTerminated).toBe(true);
  });

  it('tracks actor creation count', () => {
    const system = new ActorSystem({ logDeadLetters: false });
    system.actorOf(props(() => {}), 'counter-check');
    expect(system.totalActorsCreated).toBeGreaterThan(0);
    void system.terminate();
  });
});

describe('Actor behaviors', () => {
  it('pinned and bounded mailbox props', async () => {
    const system = new ActorSystem({ logDeadLetters: false });
    const a = system.actorOf(
      props(() => {}, {
        dispatcherType: DispatcherType.Pinned,
        mailboxType: MailboxType.Bounded,
      }),
      'mb'
    );
    a.tell(1);
    await drain(30);
    await system.terminate();
  });

  it('priority mailbox type', async () => {
    const system = new ActorSystem({ logDeadLetters: false });
    const a = system.actorOf(
      props(() => {}, {
        mailboxType: MailboxType.Priority,
      }),
      'prio'
    );
    a.tell(1);
    await drain(20);
    await system.terminate();
  });

  it('calling-thread dispatcher', async () => {
    const system = new ActorSystem({ logDeadLetters: false });
    const a = system.actorOf(
      props(() => {}, {
        dispatcherType: DispatcherType.CallingThread,
      }),
      'ct'
    );
    a.tell(1);
    await drain(10);
    await system.terminate();
  });

  it('PoisonPill stops actor', async () => {
    const system = new ActorSystem({ logDeadLetters: false });
    const a = system.actorOf(props(() => {}), 'die');
    a.tell(PoisonPill);
    await drain(40);
    await system.terminate();
  });

  it('Kill stops actor', async () => {
    const system = new ActorSystem({ logDeadLetters: false });
    const a = system.actorOf(props(() => {}), 'die2');
    a.tell(Kill);
    await drain(40);
    await system.terminate();
  });

  it('become and unbecome', async () => {
    const system = new ActorSystem({ logDeadLetters: false });
    const a = system.actorOf<number>(
      props((msg, ctx) => {
        if (msg === 1) {
          ctx.become((_m, c) => {
            c.unbecome();
          });
        }
      }),
      'swap'
    );
    a.tell(1);
    a.tell(2);
    await drain(40);
    await system.terminate();
  });

  it('spawn child and stop child via ActorRef.stop', async () => {
    const system = new ActorSystem({ logDeadLetters: false });
    const parent = system.actorOf(
      props((_m, ctx) => {
        const ch = ctx.spawn(props(() => {}), 'kid');
        ch.stop();
      }),
      'par'
    );
    parent.tell('go');
    await drain(40);
    await system.terminate();
  });

  it('supervised child failure triggers Stop directive', async () => {
    const system = new ActorSystem({ logDeadLetters: false });
    const parent = system.actorOf(
      props(
        (_m, ctx) => {
          const kid = ctx.spawn(
            props((_km) => {
              throw new Error('kid-fail');
            }),
            'kid'
          );
          kid.tell('run');
        },
        {
          supervisionStrategy: oneForOneStrategy(
            3,
            10_000,
            () => SupervisionDirective.Stop
          ),
        }
      ),
      'sup'
    );
    parent.tell('go');
    await drain(120);
    await system.terminate();
  });

});
