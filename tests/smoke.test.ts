import { describe, it, expect } from '@jest/globals';
import { ActorSystem, props } from '../src/index.ts';

describe('smoke', () => {
  it('creates system and actor', async () => {
    const system = new ActorSystem({ logDeadLetters: false });
    const n = system.actorOf<number>(props((msg) => msg), 'x');
    expect(n.path).toContain('/user/x');
    await system.terminate();
  });
});
