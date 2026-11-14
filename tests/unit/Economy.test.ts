/**
 * M2-2 경제: 시작 1000원, 돈 내기·받기, 처치 보상 (10 + ⌊s/10⌋) × 배율 — 10단계 처치 = 11원.
 */
import { describe, expect, it } from 'vitest';
import { buildMatchRules, killReward } from '../../src/sim/rules';
import { applyHit } from '../../src/sim/systems/Combat';
import { canAfford, earnGold, spendGold } from '../../src/sim/systems/Economy';
import { addMob, campaign, data, infinite } from '../helpers/match';

const rules = buildMatchRules(data);

describe('돈', () => {
  it('시작 자금 1000원 (무한·캠페인)', () => {
    expect(infinite().state.gold).toBe(1000);
    expect(campaign().state.gold).toBe(1000);
  });

  it('spendGold: 모자라면 false + 그대로, 충분하면 차감 / earnGold: 더하고 번 돈 합계에도', () => {
    const st = { gold: 150, goldEarned: 0 };
    expect(canAfford(st, 100)).toBe(true);
    expect(spendGold(st, 100)).toBe(true);
    expect(st.gold).toBe(50);
    expect(canAfford(st, 100)).toBe(false);
    expect(spendGold(st, 100)).toBe(false);
    expect(st.gold).toBe(50);
    earnGold(st, 11);
    expect(st).toEqual({ gold: 61, goldEarned: 11 });
    expect(() => earnGold(st, 1.5)).toThrow();
    expect(() => spendGold(st, -1)).toThrow();
  });
});

describe('처치 보상 (10 + ⌊s/10⌋) × 배율', () => {
  it('단계별: 1·9단계 10원, 10단계 11원, 19단계 11원, 50단계 15원 / 고블린 떼(×0.4) 1단계 4원, 투명 도둑(×2) 35단계 26원', () => {
    expect(killReward(rules, 1, 10_000)).toBe(10);
    expect(killReward(rules, 9, 10_000)).toBe(10);
    expect(killReward(rules, 10, 10_000)).toBe(11);
    expect(killReward(rules, 19, 10_000)).toBe(11);
    expect(killReward(rules, 50, 10_000)).toBe(15);
    expect(killReward(rules, 1, rules.mobs.get('goblin')!.rewardMulBp)).toBe(4);
    expect(killReward(rules, 35, rules.mobs.get('thief')!.rewardMulBp)).toBe(26);
  });

  it('10단계 슬라임을 처치하면 돈 +11원, 처치 수·번 돈 증가, kill 사건', () => {
    const m = infinite(1);
    m.state.stage = 10;
    const mob = addMob(m, 'slime');
    expect(mob.reward).toBe(11);
    const killed = applyHit(m.ctx, m.world, mob, { p: mob.hp, m: 0, t: 0 }, { x: 0, y: 0 }, 0);
    expect(killed).toBe(true);
    expect(m.state.gold).toBe(1011);
    expect(m.state.kills).toBe(1);
    expect(m.state.goldEarned).toBe(11);
    expect(m.mobCount()).toBe(0);
    expect(m.world.drainEvents().find((e) => e.type === 'kill')).toMatchObject({ id: mob.id, mob: 'slime', reward: 11 });
  });
});
