/**
 * V2 검토 L3: 전투 기록이 칸 하나만 이상해도 통째로 빈 기록이 되고, 다음 패배 때 빈 기록을 덮어써 최고 기록이 사라지던 것.
 * 이상한 칸·항목만 버리고, 더 높은 형식(새 앱이 쓴 기록)은 덮어쓰지 않는다.
 */
import { describe, expect, it } from 'vitest';
import { BattleRecords, RECORDS_KEY, parseRecord, parseRecordInfo } from '../../src/save/BattleRecords';
import { MemoryStorage } from '../../src/save/storage';
import { declareDefeat } from '../../src/sim/systems/Defeat';
import { infinite, jumpToStage } from '../helpers/match';

const GOOD_RUN = { id: 'a', stage: 40, durationSeconds: 900, bossIds: ['batqueen'], bestChallenge: 2 };

describe('L3 전투 기록: 이상한 항목만 버린다', () => {
  it('보스 처치 칸 하나가 이상해도 나머지 보스·최고 단계·최근 판은 남는다', () => {
    const raw = JSON.stringify({
      version: 2,
      bestStage: 40,
      bossClears: { batqueen: 10, golem: 'x', lich: 99, ok: 30 },
      bestChallenge: 3,
      recent: [GOOD_RUN, { id: '', stage: -1 }],
    });
    expect(parseRecord(raw)).toEqual({ version: 2, bestStage: 40, bossClears: { batqueen: 10, ok: 30 }, bestChallenge: 3, recent: [GOOD_RUN] });
  });

  it('최고 도전이 이상하면 그 칸만 0', () => {
    expect(parseRecord(JSON.stringify({ version: 2, bestStage: 12, bossClears: {}, bestChallenge: -4, recent: [] }))).toMatchObject({ bestStage: 12, bestChallenge: 0 });
  });

  it('다음 패배 뒤에도 남은 최고 기록을 지우지 않는다', () => {
    const storage = new MemoryStorage();
    storage.setItem(RECORDS_KEY, JSON.stringify({ version: 2, bestStage: 40, bossClears: { batqueen: 10, bad: null }, bestChallenge: 3, recent: [GOOD_RUN] }));
    const records = new BattleRecords(storage);
    const m = infinite(1);
    jumpToStage(m, 8);
    declareDefeat(m.ctx, m.world, 'mobLimit');
    expect(records.complete(m, 'new-run')).toEqual({ bestStage: 40, newBest: false });
    const after = records.read();
    expect(after.bestStage).toBe(40);
    expect(after.bossClears.batqueen).toBe(10);
    expect(after.recent.map((r) => r.id)).toEqual(['new-run', 'a']);
  });

  it('더 높은 형식(새 앱이 쓴 기록)은 읽기만 하고 덮어쓰지 않는다', () => {
    const storage = new MemoryStorage();
    const future = JSON.stringify({ version: 3, bestStage: 70, bossClears: { batqueen: 10 }, bestChallenge: 5, recent: [], extra: { x: 1 } });
    storage.setItem(RECORDS_KEY, future);
    expect(parseRecordInfo(future)).toMatchObject({ future: true, record: { bestStage: 70 } });
    const records = new BattleRecords(storage);
    const m = infinite(2);
    jumpToStage(m, 80);
    declareDefeat(m.ctx, m.world, 'mobLimit');
    expect(records.complete(m, 'r')).toEqual({ bestStage: 80, newBest: true });
    expect(storage.getItem(RECORDS_KEY)).toBe(future);
  });
});
