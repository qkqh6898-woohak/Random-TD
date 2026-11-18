/**
 * 피드백 #59 제안 (제목만, 본문·판 기록 JSON 없음 → 리플레이 재현 대상 없음. 대신 바뀐 판을 replay.ts로 기록·재생해 결정성 확인):
 *  1. 신화 해방 필요 조각 20 → 5개 (progression.json hidden.unlockFragments)
 *  2. 스테이지(웨이브 길) 보상 100까지 — 이미 10~100웨이브 10개 이정표가 있어 데이터 확인만
 *  3. 단계 이자 상한 100 → 10,000원 (game.json interest.max)
 *  4. 기본 인원 한도 +10명: 20 → 30 (game.json board.unitCap)
 *  5. 돈 도박 실제 기대값(잭팟 포함, 화면 표시값) 약 91% → 약 137% (×1.5)
 */
import { describe, expect, it } from 'vitest';
import { listTowers } from '../../src/sim/entities/Tower';
import { loadProgression } from '../../src/meta/progressionData';
import { playReplay, recordReplay, replayToJson } from '../../src/sim/replay';
import { buildMatchRules } from '../../src/sim/rules';
import { unitCap } from '../../src/sim/systems/Board';
import { gambleExpectationBp, gambleRollExpectationBp } from '../../src/sim/systems/Gamble';
import { stageInterest } from '../../src/sim/systems/Stage';
import { command, data, eventsOf, infinite, jumpToStage, realInfinite } from '../helpers/match';

const rules = buildMatchRules(data);
const pd = loadProgression(data);

describe('피드백 #59', () => {
  it('1. 신화 해방에 조각 5개', () => {
    expect(pd.hidden.unlockFragments).toBe(5);
  });

  it('2. 웨이브 길 보상은 10웨이브마다 100웨이브까지 (이미 있음)', () => {
    expect(pd.waveRoad.milestones.map((m) => m.wave)).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });

  it('3. 단계 이자 상한 10,000원 — 100원마다 10원은 그대로', () => {
    expect(data.game.interest).toEqual({ per: 100, amount: 10, max: 10000 });
    const m = infinite(59);
    expect(stageInterest(m.ctx, 1000)).toBe(100);
    expect(stageInterest(m.ctx, 5000)).toBe(500);
    expect(stageInterest(m.ctx, 100000)).toBe(10000);
    expect(stageInterest(m.ctx, 1000000)).toBe(10000);
  });

  it('3. 단계를 넘어갈 때 돈 50,000원 → +5,000원', () => {
    const m = infinite(59);
    jumpToStage(m, 1);
    m.world.drainEvents();
    m.state.gold = 50000;
    jumpToStage(m, 2);
    expect(m.state.gold).toBe(55000);
    expect(eventsOf(m, 'stageInterest')).toEqual([{ type: 'stageInterest', tick: m.tick - 1, stage: 1, amount: 5000 }]);
  });

  it('4. 기본 인원 한도 30명 (예전 20 + 10)', () => {
    expect(data.game.board.unitCap).toBe(30);
    const m = infinite(59);
    expect(unitCap(m.ctx, 0)).toBe(30);
  });

  it('5. 돈 도박 기대값: 잭팟 포함 91.34% → 약 137% (×1.5 ± 2%p), 표만 81% → 128.5%', () => {
    const real = gambleExpectationBp(rules);
    expect(real).toBeGreaterThanOrEqual(Math.floor((9134 * 3) / 2) - 200);
    expect(real).toBeLessThanOrEqual(Math.floor((9134 * 3) / 2) + 200);
    expect(gambleRollExpectationBp(rules)).toBe(12850);
    const sum = rules.gambleOutcomes.reduce((a, o) => a + o.chanceBp, 0);
    expect(sum).toBe(10000);
  });

  it('바뀐 수치로 소환·도박·이자가 든 판을 기록 → JSON → 재생하면 같은 해시 (결정성, src/sim/replay.ts)', () => {
    const m = realInfinite(5959, { debug: true });
    command(m, { type: 'debugAddGold', amount: 200_000 });
    for (let i = 0; i < rules.unitCap + 2; i++) command(m, { type: 'summonAuto' });
    expect(listTowers(m.world).length).toBe(30);
    for (let i = 0; i < 30; i++) command(m, { type: 'gamble', t: 1 });
    m.stepN(20 * 130); // 준비 60초 + 1단계 60초 → 2단계 넘어갈 때 이자
    expect(eventsOf(m, 'stageInterest').some((e) => (e.amount as number) > 100)).toBe(true);
    const file = recordReplay(data, m, { name: 'feedback-59' });
    const back = playReplay(data, JSON.parse(replayToJson(file)));
    expect(back.mismatch).toBeNull();
    expect(back.hash).toBe(m.hash());
  });
});
