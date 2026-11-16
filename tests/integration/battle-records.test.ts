/** A-1 전투 기록 · 최근 5판 (Codex 갈래 battle-records.test.ts를 우리 저장소·규칙에 맞춰 옮김). */
import { describe, expect, it } from 'vitest';
import { BattleRecords, LEGACY_RECORDS_KEY, RECORDS_KEY, parseRecord } from '../../src/save/BattleRecords';
import { MatchSaves } from '../../src/save/MatchSaves';
import { MemoryStorage } from '../../src/save/storage';
import { startChallenge } from '../../src/sim/systems/Challenge';
import { declareDefeat } from '../../src/sim/systems/Defeat';
import { killMob } from '../../src/sim/systems/Kill';
import { buildRecordsView, durationText } from '../../src/ui/screens/BattleRecordsDialog';
import { arenaData, data, infinite, jumpToStage } from '../helpers/match';

const opts = { version: 't', dev: false };

describe('전투 기록', () => {
  it('이어 한 판의 처치한 보스도 기록하고 최고 기록을 지킨다, 같은 판은 한 번만', () => {
    const storage = new MemoryStorage();
    const records = new BattleRecords(storage);
    const saves = new MatchSaves(arenaData, storage, opts);
    const match = infinite();
    jumpToStage(match, 10);
    const boss = match.mobs().find((m) => m.boss);
    expect(boss).toBeDefined();
    killMob(match.ctx, match.world, boss!, 0, 0);
    const golden = startChallenge(match.ctx, match.world, 0, 1);
    expect(golden).toBeTruthy();
    killMob(match.ctx, match.world, golden!, 0, 0);
    // 아직 패배 전 → 기록 안 함
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

    const short = infinite(2);
    jumpToStage(short, 8);
    declareDefeat(short.ctx, short.world, 'mobLimit');
    expect(records.complete(short, 'short')).toEqual({ bestStage: 20, newBest: false });

    const reloaded = new BattleRecords(storage).read();
    expect(reloaded).toMatchObject({ bestStage: 20, bestChallenge: 1, bossClears: { batqueen: 10 } });
    expect(reloaded.recent).toEqual([
      { id: 'short', stage: 8, durationSeconds: 0, bossIds: [], bestChallenge: 0 },
      { id: 'resumed', stage: 20, durationSeconds: Math.floor((resumed.state.defeatTick + 1) / 20), bossIds: ['batqueen'], bestChallenge: 1 },
    ]);
  });

  it('개발자 판·치트를 쓴 판·캠페인은 기록하지 않는다', () => {
    const storage = new MemoryStorage();
    const records = new BattleRecords(storage);
    const dev = infinite(1, { debug: true });
    jumpToStage(dev, 10);
    declareDefeat(dev.ctx, dev.world, 'bossTime');
    expect(records.complete(dev, 'dev')).toBeNull();
    const cheated = infinite(2);
    cheated.state.debugUsed = true;
    declareDefeat(cheated.ctx, cheated.world, 'mobLimit');
    expect(records.complete(cheated, 'cheat')).toBeNull();
    expect(records.read().bestStage).toBe(0);
    expect(storage.getItem(RECORDS_KEY)).toBeNull();
  });

  it('망가진 값은 빈 기록, v0.1.7(Codex 갈래) 키·형식 v1·v2는 그대로 읽고 새 키에 쓴다', () => {
    expect(parseRecord('{"version":1,"bestStage":9000,"bossClears":null,"bestChallenge":0}')).toMatchObject({ bestStage: 0 });
    expect(parseRecord('not json').bestStage).toBe(0);
    expect(parseRecord('{"version":2,"bestStage":5,"bossClears":{"batqueen":10},"bestChallenge":0,"recent":[]}').bestStage).toBe(0);
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_RECORDS_KEY, '{"version":1,"bestStage":30,"bossClears":{"batqueen":10},"bestChallenge":1}');
    const records = new BattleRecords(storage);
    expect(records.read()).toEqual({ version: 2, bestStage: 30, bossClears: { batqueen: 10 }, bestChallenge: 1, recent: [] });
    for (let round = 1; round <= 6; round++) {
      const m = infinite(1);
      jumpToStage(m, 8);
      declareDefeat(m.ctx, m.world, 'mobLimit');
      records.complete(m, `round-${round}`);
    }
    const saved = records.read();
    expect(saved.bestStage).toBe(30);
    expect(saved.bossClears).toEqual({ batqueen: 10 });
    expect(saved.recent.map((r) => r.id)).toEqual(['round-6', 'round-5', 'round-4', 'round-3', 'round-2']);
    expect(storage.getItem(RECORDS_KEY)).not.toBeNull();
  });

  it('기록 창 모양: 보스 이름·도전 이름·시간 글자', () => {
    const view = buildRecordsView(
      { version: 2, bestStage: 20, bossClears: { kingslime: 20, batqueen: 10 }, bestChallenge: 2, recent: [{ id: 'a', stage: 20, durationSeconds: 754, bossIds: ['batqueen', 'kingslime'], bestChallenge: 1 }] },
      data.enemies.bosses,
      data.enemies.challenges,
    );
    expect(view.bosses.map((b) => b.name)).toEqual(['박쥐 여왕', '킹 슬라임']);
    expect(view.challenges).toEqual([
      { name: '황금 슬라임', stage: 1 },
      { name: '도둑 고블린', stage: 2 },
    ]);
    expect(view.recent[0]).toEqual({ stage: 20, durationSeconds: 754, bosses: ['박쥐 여왕', '킹 슬라임'], challenges: ['황금 슬라임'] });
    expect(durationText(754)).toBe('12분 34초');
    expect(durationText(42)).toBe('42초');
  });
});
