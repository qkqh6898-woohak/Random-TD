/**
 * 피드백 #10 '돈 100원 당 10원씩 스테이지 지날때마다 이자':
 * 한 단계를 마치고 다음 단계로 넘어갈 때 가진 돈 100원마다 10원 (game.json interest — 내림, 준비 단계(0단계)는 단계가 아니라 없음).
 */
import { describe, expect, it } from 'vitest';
import { stageInterest } from '../../src/sim/systems/Stage';
import { data, eventsOf, infinite, jumpToStage } from '../helpers/match';

describe('단계 이자 (피드백 #10)', () => {
  it('수치는 game.json interest: 100원마다 10원', () => {
    expect(data.game.interest).toEqual({ per: 100, amount: 10 });
    const m = infinite(1);
    expect(m.rules.interestPer).toBe(100);
    expect(m.rules.interestAmount).toBe(10);
  });

  it('이자 = ⌊돈 ÷ 100⌋ × 10', () => {
    const m = infinite(1);
    const at = (gold: number): number => stageInterest(m.ctx, gold);
    expect(at(0)).toBe(0);
    expect(at(99)).toBe(0);
    expect(at(100)).toBe(10);
    expect(at(199)).toBe(10);
    expect(at(1000)).toBe(100);
    expect(at(1059)).toBe(100);
  });

  it('준비 단계 → 1단계에는 이자가 없다', () => {
    const m = infinite(1);
    const gold0 = m.state.gold;
    m.stepN(1201); // 틱 1200에 1단계
    expect(m.state.stage).toBe(1);
    expect(m.state.gold).toBe(gold0);
    expect(eventsOf(m, 'stageInterest')).toEqual([]);
  });

  it("1단계 → 2단계: 넘어가는 틱에 가진 돈 1059원 → +100원, 'stageInterest' 사건, 번 돈에도 센다", () => {
    const m = infinite(1);
    jumpToStage(m, 1);
    m.world.drainEvents();
    m.state.gold = 1059;
    const earned0 = m.state.goldEarned;
    jumpToStage(m, 2);
    expect(m.state.stage).toBe(2);
    expect(m.state.gold).toBe(1159);
    expect(m.state.goldEarned).toBe(earned0 + 100);
    expect(eventsOf(m, 'stageInterest')).toEqual([{ type: 'stageInterest', tick: m.tick - 1, stage: 1, amount: 100 }]);
  });

  it('100원 미만이면 이자도 사건도 없다', () => {
    const m = infinite(1);
    jumpToStage(m, 3);
    m.world.drainEvents();
    m.state.gold = 99;
    jumpToStage(m, 4);
    expect(m.state.gold).toBe(99);
    expect(eventsOf(m, 'stageInterest')).toEqual([]);
  });

  it("카드 '황금 손' 보너스는 이자에 붙지 않는다 (도박 당첨금과 같은 규칙 — 이자가 이자를 부풀리지 않게)", () => {
    const m = infinite(1);
    jumpToStage(m, 1);
    m.state.gold = 500;
    m.state.goldPctBp = 5000;
    jumpToStage(m, 2);
    expect(m.state.gold).toBe(550);
  });
});
