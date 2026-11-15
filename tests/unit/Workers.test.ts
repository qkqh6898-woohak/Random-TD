/**
 * M4-1 일꾼: 300원 고용·최대 10명·100틱(5초)마다 1명당 +5원, 실패 사유, 카드 배율·황금 손.
 */
import { describe, expect, it } from 'vitest';
import { buildMatchRules } from '../../src/sim/rules';
import { earnGold, hireCheck, workerIncome } from '../../src/sim/systems/Economy';
import { arena, command, data, eventsOf, infinite } from '../helpers/match';

const rules = buildMatchRules(data);

describe('일꾼 (M4-1, GDD 3장)', () => {
  it('데이터: 300원, 최대 10명, 5초(100틱)마다 1명당 5원', () => {
    expect(rules.workerCost).toBe(300);
    expect(rules.workerMax).toBe(10);
    expect(rules.workerIntervalTicks).toBe(100);
    expect(rules.workerIncome).toBe(5);
  });

  it('고용: 300원을 내고 일꾼 +1, hire 사건', () => {
    const m = infinite(1);
    command(m, { type: 'hireWorker' });
    expect(m.state.workers).toBe(1);
    expect(m.state.gold).toBe(1000 - 300);
    expect(eventsOf(m, 'hire')).toHaveLength(1);
  });

  it('돈이 모자라면 실패 (상태 그대로) → hireFail gold', () => {
    const m = infinite(1);
    m.state.gold = 299;
    command(m, { type: 'hireWorker' });
    expect(m.state.workers).toBe(0);
    expect(m.state.gold).toBe(299);
    const ev = eventsOf(m, 'hireFail');
    expect(ev[0]?.reason).toBe('gold');
  });

  it('최대 10명: 11번째는 hireFail max, 돈은 그대로', () => {
    const m = infinite(1);
    m.state.gold = 100_000;
    for (let i = 0; i < 11; i++) m.world.enqueue({ type: 'hireWorker' });
    m.step();
    expect(m.state.workers).toBe(10);
    expect(m.state.gold).toBe(100_000 - 10 * 300);
    expect(eventsOf(m, 'hireFail').map((e) => e.reason)).toEqual(['max']);
    expect(hireCheck(m.ctx)).toBe('max');
  });

  it('수입: 판 시작부터 100틱마다 일꾼 수 × 5원 (100·200틱, 0틱은 아님)', () => {
    const m = arena(1);
    m.state.workers = 3;
    const g0 = m.state.gold;
    m.stepN(100); // 틱 0~99
    expect(m.state.gold).toBe(g0);
    m.step(); // 틱 100
    expect(m.state.gold).toBe(g0 + 15);
    m.stepN(100); // 101~200
    expect(m.state.gold).toBe(g0 + 30);
    const ev = eventsOf(m, 'workerIncome');
    expect(ev.map((e) => e.tick)).toEqual([100, 200]);
    expect(ev[0]?.amount).toBe(15);
  });

  it('1분 = 일꾼 1명당 60원 (GDD 3장 분당 60원)', () => {
    const m = arena(1);
    m.state.workers = 1;
    const g0 = m.state.gold;
    m.stepN(1201); // 틱 0~1200 → 100·200 … 1200 = 12번
    expect(m.state.gold - g0).toBe(60);
  });

  it('일꾼 열정 배율과 황금 손 보너스가 수입에 곱해진다', () => {
    const m = arena(1);
    m.state.workers = 2;
    m.state.workerMul = 3;
    expect(workerIncome(m.ctx)).toBe(30);
    m.state.goldPctBp = 2500;
    const g0 = m.state.gold;
    m.stepN(101);
    expect(m.state.gold - g0).toBe(37); // 30 × 1.25 = 37.5 → 37
  });

  it('earnGold: 황금 손 +25%·+50%는 내림, 번 돈 합계도 같은 값', () => {
    const s = { gold: 0, goldEarned: 0, goldPctBp: 2500 };
    expect(earnGold(s, 11)).toBe(13);
    s.goldPctBp = 5000;
    expect(earnGold(s, 10)).toBe(15);
    expect(s).toMatchObject({ gold: 28, goldEarned: 28 });
  });

  it('패배한 판에서는 고용·수입 없음', () => {
    const m = arena(1);
    m.state.workers = 2;
    m.state.phase = 'defeat';
    command(m, { type: 'hireWorker' });
    m.stepN(200);
    expect(m.state.workers).toBe(2);
    expect(eventsOf(m, 'hireFail')[0]?.reason).toBe('phase');
    expect(eventsOf(m, 'workerIncome')).toHaveLength(0);
  });
});
