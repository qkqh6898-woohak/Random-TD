/**
 * V2 검토 M2: (b) 진행 중 판 저장의 지문은 앱 버전이 아니라 SIM_VERSION(+ 형식 + 데이터 지문) — 화면만 바뀐 릴리스는 이어 하기 유지.
 * (a) 업데이트(규칙·데이터·형식)로 버리는 판은 버리기 전에 저장 JSON에서 정산한다 (보상·최고 웨이브·전투 기록, runId로 한 번만).
 */
import { describe, expect, it } from 'vitest';
import { MATCH_SLOT, MatchSaves, abandonedRunOf, decodeSave, encodeSave, type AbandonedRun } from '../../src/save/MatchSaves';
import { BattleRecords } from '../../src/save/BattleRecords';
import { settleAbandonedRun, abandonedMatchResult } from '../../src/save/settleAbandoned';
import { MemoryStorage } from '../../src/save/storage';
import { ProgressStore } from '../../src/meta/progressStore';
import { loadProgression } from '../../src/meta/progressionData';
import { matchResultOf } from '../../src/meta/matchResult';
import { buildMatchRules } from '../../src/sim/rules';
import { SIM_VERSION } from '../../src/sim/version';
import { abandonedRunToast } from '../../src/ui/messages';
import type { Match } from '../../src/sim/match';
import { data, jumpToStage, realInfinite } from '../helpers/match';

const pd = loadProgression(data);
const rules = buildMatchRules(data);

/** 12단계, 보스 1마리 처치, 소환 7 · 승급 2인 진행 중 판 */
function midRun(seed = 11): Match {
  const m = realInfinite(seed, { legacyCommands: false });
  jumpToStage(m, 12);
  m.state.bossesKilled = 1;
  m.state.summons = 7;
  m.state.merges = 2;
  return m;
}

function env(simVersion?: number) {
  const storage = new MemoryStorage();
  const progress = new ProgressStore(storage, pd, data, { seed: 5, now: () => new Date(2026, 10, 19, 9) });
  const records = new BattleRecords(storage);
  const abandoned: AbandonedRun[] = [];
  const saves = new MatchSaves(data, storage, {
    version: '0.2.0',
    dev: false,
    ...(simVersion !== undefined ? { simVersion } : {}),
    onAbandoned: (run) => {
      abandoned.push(run);
      return settleAbandonedRun(run, { progress, records, rules: () => rules });
    },
  });
  return { storage, progress, records, saves, abandoned };
}

describe('M2b SIM_VERSION 지문', () => {
  it('SIM_VERSION은 1 이상 정수', () => {
    expect(Number.isSafeInteger(SIM_VERSION) && SIM_VERSION >= 1).toBe(true);
  });

  it('같은 SIM_VERSION + 다른 앱 버전 → 저장을 그대로 이어 한다 (정산 없음)', () => {
    const a = env();
    const m = midRun();
    expect(a.saves.write(m, 1, null, 'run-keep')).not.toBeNull();
    const newerApp = new MatchSaves(data, a.storage, { version: '9.9.9', dev: false, onAbandoned: () => { throw new Error('정산하면 안 됨'); } });
    const saved = newerApp.read();
    expect(saved, newerApp.lastDiscard ?? '').not.toBeNull();
    expect(saved!.match.hash()).toBe(m.hash());
    expect(newerApp.discardedByUpdate).toBe(false);
  });

  it('저장에 sim 규칙 버전을 적는다 (앱 버전은 적어만 둔다)', () => {
    const a = env();
    a.saves.write(midRun(), 1, null, 'run-x');
    const p = decodeSave(a.storage.getItem(MATCH_SLOT)!) as { sim: number; app: string };
    expect(p.sim).toBe(SIM_VERSION);
    expect(p.app).toBe('0.2.0');
  });
});

describe('M2a 업데이트로 버리는 판은 먼저 정산', () => {
  it('다른 SIM_VERSION → 저장 JSON으로 정산(보상·최고 웨이브·전투 기록) 뒤 버린다', () => {
    const old = env();
    const m = midRun();
    old.saves.write(m, 1, null, 'run-sim');
    const next = env(SIM_VERSION + 1);
    // 같은 저장소를 보게 옮긴다
    next.storage.setItem(MATCH_SLOT, old.storage.getItem(MATCH_SLOT)!);
    const before = { gold: next.progress.state.gold, best: next.progress.state.bestWave, matches: next.progress.state.totals.matches };
    expect(next.saves.read()).toBeNull();
    expect(next.saves.discardedByUpdate).toBe(true);
    expect(next.saves.lastDiscard).toContain('규칙 버전');
    expect(next.storage.getItem(MATCH_SLOT)).toBeNull();
    // 정산 입력 = 패배 화면이 쓰는 matchResultOf와 같은 값
    expect(next.abandoned).toHaveLength(1);
    expect(abandonedMatchResult(next.abandoned[0]!)).toEqual(matchResultOf(m, 'run-sim'));
    expect(next.saves.lastAbandoned).toMatchObject({ credited: true, run: { stage: 12, runId: 'run-sim' } });
    expect(next.progress.state.gold).toBeGreaterThan(before.gold);
    expect(next.progress.state.bestWave).toBe(Math.max(before.best, 12));
    expect(next.progress.state.totals.matches).toBe(before.matches + 1);
    expect(next.progress.state.rewardedRuns).toContain('run-sim');
    const rec = next.records.read();
    expect(rec.bestStage).toBe(12);
    expect(rec.recent[0]).toMatchObject({ id: 'run-sim', stage: 12 });
    expect(abandonedRunToast(next.saves.lastAbandoned)).toContain('12단계');
  });

  it('같은 판을 두 번 만나도(슬롯을 못 지움·다른 창) 한 번만 보상한다 (runId)', () => {
    const old = env();
    old.saves.write(midRun(), 1, null, 'run-dup');
    const raw = old.storage.getItem(MATCH_SLOT)!;
    const next = env(SIM_VERSION + 1);
    next.storage.setItem(MATCH_SLOT, raw);
    next.saves.read();
    const gold = next.progress.state.gold;
    const matches = next.progress.state.totals.matches;
    // 슬롯이 다시 생김 (지우기 실패 흉내) → 새 MatchSaves(다음 실행)로 읽어도 progress가 runId로 거른다
    next.storage.setItem(MATCH_SLOT, raw);
    const again = new MatchSaves(data, next.storage, {
      version: '0.2.0',
      dev: false,
      simVersion: SIM_VERSION + 1,
      onAbandoned: (run) => settleAbandonedRun(run, { progress: next.progress, records: next.records, rules: () => rules }),
    });
    expect(again.read()).toBeNull();
    expect(again.lastAbandoned?.credited).toBe(false);
    expect(next.progress.state.gold).toBe(gold);
    expect(next.progress.state.totals.matches).toBe(matches);
    expect(next.records.read().recent.filter((r) => r.id === 'run-dup')).toHaveLength(1);
    expect(abandonedRunToast(again.lastAbandoned)).toContain('이어 할 수 없어요');
  });

  it('V2 통합: 버린 판 정산도 🔥 불꽃을 준다 — 패배 화면과 같은 양, 같은 판은 한 번만', () => {
    const old = env();
    const m = midRun();
    old.saves.write(m, 1, null, 'run-flame');
    const raw = old.storage.getItem(MATCH_SLOT)!;
    const next = env(SIM_VERSION + 1);
    const flame0 = next.progress.state.flame;
    // 기대값: matchRewardSpec(12단계·보스 1) — 패배 화면 정산과 같은 공식
    const expected = pd.matchRewards.flamePerStage * 12 + pd.matchRewards.flamePerBoss * 1;
    expect(expected).toBeGreaterThan(0);
    next.storage.setItem(MATCH_SLOT, raw);
    expect(next.saves.read()).toBeNull();
    expect(next.saves.lastAbandoned?.credited).toBe(true);
    expect(next.progress.state.flame).toBe(flame0 + expected);
    // 슬롯이 되살아나 다음 실행에서 또 만나도 불꽃은 더 늘지 않는다
    next.storage.setItem(MATCH_SLOT, raw);
    const again = new MatchSaves(data, next.storage, {
      version: '0.2.0',
      dev: false,
      simVersion: SIM_VERSION + 1,
      onAbandoned: (run) => settleAbandonedRun(run, { progress: next.progress, records: next.records, rules: () => rules }),
    });
    expect(again.read()).toBeNull();
    expect(again.lastAbandoned?.credited).toBe(false);
    expect(next.progress.state.flame).toBe(flame0 + expected);
  });

  it('데이터가 바뀐 업데이트도 정산한다', () => {
    const old = env();
    old.saves.write(midRun(), 1, null, 'run-data');
    const changed = { ...data, game: { ...data.game, match: { ...data.game.match, startGold: data.game.match.startGold + 1 } } };
    const runs: AbandonedRun[] = [];
    const s = new MatchSaves(changed as typeof data, old.storage, { version: '0.2.0', dev: false, onAbandoned: (r) => { runs.push(r); return true; } });
    expect(s.read()).toBeNull();
    expect(s.lastDiscard).toBe('게임 데이터가 바뀜');
    expect(runs.map((r) => r.runId)).toEqual(['run-data']);
  });

  it('SIM_VERSION 전의 옛 저장(sim 칸 없음)도 정산하고 버린다', () => {
    const old = env();
    old.saves.write(midRun(), 1, null, 'run-legacy');
    const p = decodeSave(old.storage.getItem(MATCH_SLOT)!) as Record<string, unknown>;
    delete p.sim;
    p.app = '0.1.19';
    old.storage.setItem(MATCH_SLOT, encodeSave(p));
    const runs: AbandonedRun[] = [];
    const s = new MatchSaves(data, old.storage, { version: '0.2.0', dev: false, onAbandoned: (r) => { runs.push(r); return true; } });
    expect(s.read()).toBeNull();
    expect(s.discardedByUpdate).toBe(true);
    expect(runs.map((r) => r.stage)).toEqual([12]);
  });

  it('망가진 저장·개발자 표시가 다른 저장은 정산하지 않는다', () => {
    const old = env();
    old.saves.write(midRun(), 1, null, 'run-bad');
    const raw = old.storage.getItem(MATCH_SLOT)!;
    old.storage.setItem(MATCH_SLOT, raw.replace('"runId":"run-bad"', '"runId":"run-evil"'));
    const runs: AbandonedRun[] = [];
    const s = new MatchSaves(data, old.storage, { version: '0.2.0', dev: false, simVersion: SIM_VERSION + 1, onAbandoned: (r) => { runs.push(r); return true; } });
    expect(s.read()).toBeNull();
    expect(s.lastDiscard).toBe('망가진 저장');
    expect(runs).toHaveLength(0);
  });

  it('abandonedRunOf: 값이 모자라거나 끝난 판이면 null', () => {
    expect(abandonedRunOf(null, 'x')).toBeNull();
    expect(abandonedRunOf({ runId: 'a', inputs: { seed: 1, players: 1 }, world: { tick: 5, state: { mode: 'infinite', stage: 'x' } } }, 'x')).toBeNull();
    const ok = { runId: 'a', inputs: { seed: 1, players: 1 }, world: { tick: 5, state: { mode: 'infinite', phase: 'playing', stage: 3, bossesKilled: 0, summons: 1, merges: 0 } } };
    expect(abandonedRunOf(ok, 'x')).toMatchObject({ runId: 'a', stage: 3, dev: false, challengeBest: 0 });
    expect(abandonedRunOf({ ...ok, world: { ...ok.world, state: { ...ok.world.state, phase: 'defeat' } } }, 'x')).toBeNull();
  });

  it('정산 훅이 예외를 던져도 저장은 버린다', () => {
    const old = env();
    old.saves.write(midRun(), 1, null, 'run-throw');
    const s = new MatchSaves(data, old.storage, { version: '0.2.0', dev: false, simVersion: SIM_VERSION + 1, onAbandoned: () => { throw new Error('x'); } });
    expect(s.read()).toBeNull();
    expect(old.storage.getItem(MATCH_SLOT)).toBeNull();
    expect(s.lastAbandoned?.credited).toBe(false);
  });
});
