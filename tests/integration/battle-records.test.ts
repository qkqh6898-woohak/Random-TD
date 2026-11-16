import { expect, it } from 'vitest';
import { BattleRecords } from '../../src/save/BattleRecords';
import { MatchSaves } from '../../src/save/MatchSaves';
import { startChallenge } from '../../src/sim/systems/Challenge';
import { declareDefeat } from '../../src/sim/systems/Defeat';
import { killMob } from '../../src/sim/systems/Kill';
import { data, infinite, jumpToStage } from '../helpers/match';

function testStorage() {
  const files = new Map<string, string>();
  const storage = () => ({
    getItem: (key: string) => files.get(key) ?? null,
    setItem: (key: string, value: string) => { files.set(key, value); },
    removeItem: (key: string) => { files.delete(key); },
  });
  return { files, storage };
}

it('remembers cleared bosses from a resumed match and keeps the highest record', () => {
  const { storage } = testStorage();
  const records = new BattleRecords(storage);
  const saves = new MatchSaves(data, storage);
  const match = infinite();
  jumpToStage(match, 10);
  killMob(match.ctx, match.world, match.mobs().find((mob) => mob.boss)!, 0, 0);
  killMob(match.ctx, match.world, startChallenge(match.ctx, match.world, 0, 1)!, 0, 0);
  expect(records.complete(match, 'resumed')).toBeNull();
  expect(records.read()).toMatchObject({ bestStage: 0, bossClears: {}, bestChallenge: 0 });

  saves.write(match, 2, null, 'resumed');
  const { match: resumed, runId } = saves.read()!;
  expect(runId).toBe('resumed');
  jumpToStage(resumed, 20);
  resumed.stepN(resumed.rules.bossTimeTicks);
  expect(resumed.state.defeatReason).toBe('bossTime');
  expect(records.complete(resumed, runId)).toEqual({ bestStage: 20, newBest: true });
  expect(records.complete(resumed, runId)).toEqual({ bestStage: 20, newBest: false });

  const shortMatch = infinite(2);
  jumpToStage(shortMatch, 8);
  declareDefeat(shortMatch.ctx, shortMatch.world, 'mobLimit');
  expect(records.complete(shortMatch, 'short')).toEqual({ bestStage: 20, newBest: false });
  const reloaded = new BattleRecords(storage).read();
  expect(reloaded).toMatchObject({ bestStage: 20, bestChallenge: 1 });
  expect(Object.entries(reloaded.bossClears)).toEqual([[match.rules.bossOrder.find((id) => match.rules.bosses.get(id)?.name === '박쥐 여왕'), 10]]);
  expect(reloaded.recent).toEqual([
    { id: 'short', stage: 8, durationSeconds: 0, bossIds: [], bestChallenge: 0 },
    { id: 'resumed', stage: 20, durationSeconds: 60, bossIds: ['batqueen'], bestChallenge: 1 },
  ]);
});

it('ignores debug matches and recovers from invalid stored records', () => {
  const { files, storage } = testStorage();
  const records = new BattleRecords(storage);
  files.set('random-td.battle-records', '{"version":1,"bestStage":9000,"bossClears":null,"bestChallenge":0}');
  expect(records.read()).toMatchObject({ bestStage: 0, bossClears: {}, bestChallenge: 0 });

  const match = infinite(1, { debug: true });
  jumpToStage(match, 10);
  declareDefeat(match.ctx, match.world, 'bossTime');
  expect(records.complete(match, 'debug')).toBeNull();
  expect(records.read().bestStage).toBe(0);
});

it('preserves v1 records and keeps the newest five completed runs even when seeds repeat', () => {
  const { files, storage } = testStorage();
  const records = new BattleRecords(storage);
  const saves = new MatchSaves(data, storage);
  files.set('random-td.battle-records', '{"version":1,"bestStage":30,"bossClears":{"batqueen":10},"bestChallenge":1}');
  expect(records.read()).toEqual({
    version: 2, bestStage: 30, bossClears: { batqueen: 10 }, bestChallenge: 1, recent: [],
  });
  const match = infinite(1);
  jumpToStage(match, 8);
  saves.write(match, 1, null);
  const oldSave = saves.read()!;
  expect(oldSave.runId).toBe(saves.read()?.runId);
  declareDefeat(oldSave.match.ctx, oldSave.match.world, 'mobLimit');
  records.complete(oldSave.match, oldSave.runId);
  expect(records.read().recent).toHaveLength(1);

  for (let round = 1; round <= 6; round++) {
    const repeated = infinite(1);
    jumpToStage(repeated, 8);
    declareDefeat(repeated.ctx, repeated.world, 'mobLimit');
    records.complete(repeated, `round-${round}`);
  }
  const saved = records.read();
  expect(saved.bestStage).toBe(30);
  expect(saved.bossClears).toEqual({ batqueen: 10 });
  expect(saved.bestChallenge).toBe(1);
  expect(saved.recent.map(({ id }) => id)).toEqual(['round-6', 'round-5', 'round-4', 'round-3', 'round-2']);
});
