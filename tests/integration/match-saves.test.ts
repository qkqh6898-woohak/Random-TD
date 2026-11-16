import { expect, it } from 'vitest';
import { MatchSaves } from '../../src/save/MatchSaves';
import { command, data, infinite, summonAt } from '../helpers/match';

function testSaves() {
  const files = new Map<string, string>();
  const store = new MatchSaves(data, () => ({
    getItem: (key) => files.get(key) ?? null,
    setItem: (key, value) => { files.set(key, value); },
    removeItem: (key) => { files.delete(key); },
  }));
  return { store, files };
}

it('restores live combat, RNG, entity numbering and pending commands exactly', () => {
  const { store } = testSaves();
  const match = infinite(61);
  summonAt(match, 2, 2);
  summonAt(match, 3, 2);
  summonAt(match, 4, 2);
  command(match, { type: 'hireWorker' });
  command(match, { type: 'upgrade', k: 0 });
  command(match, { type: 'finishPrep' });
  match.stepN(440);
  expect(match.state.stage).toBe(1);
  expect(match.world.enqueue({ type: 'upgrade', k: 0, tick: match.tick + 3 }).ok).toBe(true);
  const token = store.write(match, 2, null);

  const saved = store.read()!;
  expect(saved.token).toBe(token);
  expect(saved.speed).toBe(2);
  expect(saved.match.hash()).toBe(match.hash());
  expect(saved.match.world.executed).toEqual(match.world.executed);
  expect(saved.match.world.queue.pending()).toEqual(match.world.queue.pending());
  expect(saved.match.world.queue.peekNextSeq(0)).toBe(match.world.queue.peekNextSeq(0));

  for (const game of [match, saved.match]) {
    command(game, { type: 'summon', x: 5, y: 2 });
    game.stepN(380);
  }
  expect(saved.match.hash()).toBe(match.hash());
  expect(saved.match.state.upgrades[0]?.[0]).toBe(2);
});

it('does not restore corrupted data or allow an older session to overwrite a newer match', () => {
  const { store, files } = testSaves();
  const first = store.write(infinite(11), 1, null)!;
  const second = store.write(infinite(12), 1, null)!;
  expect(store.write(infinite(11), 1, first)).toBeNull();
  store.clear(first);
  expect(store.read()?.match.world.seed).toBe(12);
  store.clear(second);
  expect(store.read()).toBeNull();

  store.write(infinite(13), 1, null);
  const [key, raw] = [...files][0]!;
  files.set(key, raw.replace('\\"seed\\":13', '\\"seed\\":99'));
  expect(store.read()).toBeNull();
});
