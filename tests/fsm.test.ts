import { describe, it, expect, jest } from '@jest/globals';

import { ActorSystem, FSM } from '../src/index.ts';

type Msg = { type: string };

describe('FSM actor', () => {
  it('warns when current state has no handler', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const build = FSM.create<'a' | 'b', number, Msg>()
      .initialState('a', 0)
      .when('b', (_m, d, f) => f.stay(d))
      .build();

    const system = new ActorSystem({ logDeadLetters: false });
    const ref = system.actorOf(build, 'fsm-missing');
    ref.tell({ type: 'x' });
    await new Promise<void>((r) => setImmediate(r));
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    await system.terminate();
  });

  it('stop(), transitions, and transition listener errors', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});

    const build = FSM.create<'a' | 'b', number, Msg>()
      .initialState('a', 0)
      .when('a', (msg, data, fsm) => {
        if (msg.type === 'go') return fsm.goto('b', data + 1);
        return fsm.stay();
      })
      .when('b', (msg, data, fsm) => {
        if (msg.type === 'halt') return fsm.stop();
        return fsm.stay(data);
      })
      .onTransition(() => {
        throw new Error('transition boom');
      })
      .build();

    const system = new ActorSystem({ logDeadLetters: false });
    const ref = system.actorOf(build, 'fsm-full');
    ref.tell({ type: 'go' });
    await new Promise<void>((r) => setImmediate(r));
    ref.tell({ type: 'halt' });
    await new Promise<void>((r) => setImmediate(r));
    await system.terminate();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
