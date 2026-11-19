/**
 * V2.0 PR-A 경제 (docs/v2/economy.md): 소환 비용 22원부터 소환마다 +2원 · 최대 200원 · 웨이브가 바뀌어도 그대로,
 * 할인 카드 = 비율(합 최대 50%, 기본 비용 아래로 안 내려감), 판매가는 소환 비용과 따로(sell.baseValue) +
 * 검토 H2 '되팔기 돈벌이': 일반 소환이 낼 수 있는 등급(노말·레어·신)은 판매가가 늘 지금 소환 비용보다 낮다.
 */
import { describe, expect, it } from 'vitest';
import { createMatch } from '../../src/sim/match';
import { GRADES } from '../../src/data/grades';
import { isTower } from '../../src/sim/entities/Tower';
import { summonBaseCost, summonCost, summonCountOf } from '../../src/sim/systems/Summon';
import { isAutoSellSummon, sellPrice, sellPriceFor } from '../../src/sim/systems/Sell';
import { applyCard } from '../../src/sim/systems/Cards';
import { data } from '../helpers/match';
import { crossCheck } from '../../src/data/load';

const fresh = (seed = 1, players = 1) => createMatch(data, { seed, mode: 'infinite', players });
const card = (id: string) => {
  const m = fresh();
  const c = m.rules.cardById.get(id);
  if (!c) throw new Error(id);
  return c;
};
const idsOf = (grade: string) => data.towers.towers.filter((t) => t.grade === grade).map((t) => t.id);

describe('V2.0 PR-A 소환 비용', () => {
  it('데이터: 기본 22원 · +2원 · 최대 200원 → 22, 24, 26 … 89번째부터 200', () => {
    const m = fresh();
    expect([m.rules.summonCost, m.rules.summonCostStep, m.rules.summonCostMax]).toEqual([22, 2, 200]);
    expect([0, 1, 2, 10, 88, 89, 500].map((n) => summonBaseCost(m.rules, n))).toEqual([22, 24, 26, 42, 198, 200, 200]);
  });

  it('소환할 때마다 그 플레이어 비용만 +2원, 낸 돈 = 그때 비용 · 웨이브가 바뀌어도 초기화 없음', () => {
    const m = fresh(3, 2);
    m.state.gold = 100_000;
    const paid: number[] = [];
    for (let i = 0; i < 5; i++) {
      const before = m.state.gold;
      m.world.enqueue({ type: 'summonAuto', player: 0 });
      m.step();
      paid.push(before - m.state.gold);
    }
    expect(paid).toEqual([22, 24, 26, 28, 30]);
    expect(summonCountOf(m.state, 0)).toBe(5);
    expect(summonCountOf(m.state, 1)).toBe(0);
    expect(summonCost(m.ctx, 0)).toBe(32);
    expect(summonCost(m.ctx, 1)).toBe(22);
    // 단계를 몇 번 넘겨도 그대로
    m.stepN(m.rules.prepTicks + m.rules.stageTicks * 2);
    expect(m.state.stage).toBeGreaterThanOrEqual(2);
    expect(summonCost(m.ctx, 0)).toBe(32);
  });

  it('소환 도박·쌍둥이 덤은 비용을 올리지 않는다 · 돈 부족이면 횟수 그대로', () => {
    const m = fresh(4);
    m.state.gold = 100_000;
    m.world.enqueue({ type: 'gacha', k: 0, f: 0 });
    m.step();
    expect(m.state.summons).toBe(1); // 판 소환 수(미션·모집)는 센다
    expect(summonCountOf(m.state, 0)).toBe(0);
    applyCard(m.ctx, m.world, 0, card('twinSummon'), 1);
    m.world.enqueue({ type: 'summonAuto' });
    m.step();
    expect(m.towers().length).toBe(3); // 도박 1 + 소환 1 + 쌍둥이 1
    expect(summonCountOf(m.state, 0)).toBe(1);
    m.state.gold = 0;
    m.world.enqueue({ type: 'summonAuto' });
    m.step();
    expect(summonCountOf(m.state, 0)).toBe(1);
  });

  it('할인 카드: −20%·−10% 비율, 합 최대 50%, 기본 22원 아래로는 안 내려감', () => {
    const m = fresh(5);
    m.state.summonCount[0] = 89; // 200원
    expect(summonCost(m.ctx, 0)).toBe(200);
    applyCard(m.ctx, m.world, 0, card('summonDiscount'), 1);
    expect(summonCost(m.ctx, 0)).toBe(160);
    applyCard(m.ctx, m.world, 0, card('pickDiscount'), 1);
    expect(summonCost(m.ctx, 0)).toBe(140);
    for (let i = 0; i < 5; i++) applyCard(m.ctx, m.world, 0, card('summonDiscount'), 1);
    expect(m.state.summonDiscountBp).toBe(5000);
    expect(summonCost(m.ctx, 0)).toBe(100);
    m.state.summonCount[0] = 0;
    expect(summonCost(m.ctx, 0)).toBe(22);
    m.state.summonCount[0] = 20; // 62 × 50% = 31
    expect(summonCost(m.ctx, 0)).toBe(31);
  });

  it('소환 횟수는 판 상태(해시)에 들어간다', () => {
    const a = fresh(6);
    const b = fresh(6);
    b.state.summonCount[0] = 1;
    expect(a.hash()).not.toBe(b.hash());
  });
});

describe('V2.0 PR-A 판매가 (소환 비용과 따로) · 검토 H2 되팔기 돈벌이 없음', () => {
  it('표 판매가: 노말 15 · 레어 45 · 유니크 135 · 히어로 405 · 레전드 1,215 · 신 = 레전드 (sell.baseValue 30 × 등급 배율 × 50%)', () => {
    const m = fresh();
    const want: Record<string, number> = { normal: 15, rare: 45, unique: 135, hero: 405, legend: 1215, god: 1215 };
    for (const [g, v] of Object.entries(want)) for (const id of idsOf(g)) expect(sellPrice(m.rules, id), id).toBe(v);
  });

  it('모든 할인 상태 × 소환 횟수에서 일반 소환이 낼 수 있는 등급(노말·레어·신)의 실제 판매가 < 지금 소환 비용', () => {
    const m = fresh();
    expect([...m.rules.summonOutcomeGrades]).toEqual(['normal', 'rare', 'god']);
    for (let disc = 0; disc <= m.rules.summonDiscountMaxBp; disc += 500) {
      m.state.summonDiscountBp = disc;
      for (let n = 0; n <= 120; n++) {
        m.state.summonCount[0] = n;
        const cost = summonCost(m.ctx, 0);
        expect(cost).toBeGreaterThanOrEqual(m.rules.summonCost);
        for (const g of m.rules.summonOutcomeGrades) for (const id of idsOf(g)) expect(sellPriceFor(m.ctx, id, 0), `${id} 할인 ${disc} 횟수 ${n}`).toBeLessThan(cost);
      }
    }
  });

  it('승급으로 만든 등급의 판매가 < 재료를 가장 싸게 소환한 비용 합 (3^k × 22원) · 리미티드 = 재료 가치 합', () => {
    const m = fresh();
    let need = 1;
    for (const g of GRADES.slice(0, 5)) {
      for (const id of idsOf(g)) expect(sellPrice(m.rules, id)).toBeLessThan(m.rules.summonCost * need);
      need *= m.rules.mergeCount;
    }
  });

  it('데이터 검사: 노말 판매가 ≥ 기본 소환 비용이거나 최대 < 기본이면 잡는다', () => {
    expect(crossCheck(data)).toEqual([]);
    const bad = { ...data, game: { ...data.game, sell: { ...data.game.sell, baseValue: 44 } } };
    expect(crossCheck(bad).some((i) => i.path === 'sell.gradeMul.normal')).toBe(true);
    const bad2 = { ...data, game: { ...data.game, summon: { ...data.game.summon, costMax: 10 } } };
    expect(crossCheck(bad2).some((i) => i.path === 'summon.costMax')).toBe(true);
  });

  it('소환 도박 결과는 어느 등급이 나와도 그 도박 비용보다 싸게 팔린다', () => {
    const m = fresh();
    for (const k of m.rules.gachaKinds) {
      for (const o of k.outcomes) {
        if (o.grade === 'none') continue;
        for (const id of idsOf(o.grade)) expect(sellPriceFor(m.ctx, id, 0), `${k.id} ${id}`).toBeLessThan(k.cost);
      }
    }
  });

  it('몬테카를로: 할인 최대 · 레어 직행 100% · 신 확률 크게 올려도 소환 → 바로 판매 되풀이는 돈을 잃는다', () => {
    for (const setup of ['none', 'max'] as const) {
      const m = fresh(42);
      if (setup === 'max') {
        m.state.summonDiscountBp = m.rules.summonDiscountMaxBp;
        m.state.chanceOv = { summonRare: 10_000, god: 500 };
      }
      m.state.gold = 50_000;
      const g0 = m.state.gold;
      const e0 = m.state.goldEarned;
      let summons = 0;
      let grades = new Set<string>();
      for (let i = 0; i < 400 && m.state.phase === 'playing'; i++) {
        m.world.enqueue({ type: 'summonAuto' });
        m.step();
        for (const ev of m.world.drainEvents()) {
          if (ev.type !== 'summon') continue;
          summons++;
          grades.add(String(ev.grade));
          m.world.enqueue({ type: 'sellTower', x: Number(ev.x), y: Number(ev.y) });
        }
        m.step();
        m.world.drainEvents();
      }
      const net = m.state.gold - g0 - (m.state.goldEarned - e0); // 처치·이자 수입 빼고
      expect(summons, setup).toBeGreaterThan(300);
      expect(net, `${setup} 순손익`).toBeLessThanOrEqual(-summons);
      if (setup === 'max') expect(grades.has('rare')).toBe(true);
      expect(m.world.entities.list().filter(isTower).length).toBe(0);
      grades = new Set();
    }
  });

  it('자동 판매는 일반 소환만 — 개발자 놓기·소환 도박 결과는 팔지 않는다 (검토 L4)', () => {
    expect(isAutoSellSummon({ player: 0 }, 0)).toBe(true);
    expect(isAutoSellSummon({ player: 1 }, 0)).toBe(false);
    expect(isAutoSellSummon({ player: 0, debug: true }, 0)).toBe(false);
    expect(isAutoSellSummon({ player: 0, gacha: 0 }, 0)).toBe(false);
  });
});
