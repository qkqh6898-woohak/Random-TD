/**
 * V3 P2 유물 sim 효과: 12종 각각 Lv1~최대에서 정수(bp·원) 값이 레벨마다 오르고, 판에서 실제로 보이는지.
 * 유물이 없는 판은 예전과 같다(리플레이 8개 끝 해시 그대로 — replay.test). 경제 유물은 기존 수치를 바꾸지 않고 더하기만.
 */
import { describe, expect, it } from 'vitest';
import { createMatch } from '../../src/sim/match';
import { buildMatchRules } from '../../src/sim/rules';
import { NO_MODS, effectiveStats } from '../../src/sim/stats';
import { relicAtkBp, towerBonus } from '../../src/sim/systems/Aura';
import { placeTower } from '../../src/sim/systems/Summon';
import { stageInterest } from '../../src/sim/systems/Stage';
import { workerIncome } from '../../src/sim/systems/Economy';
import { relicGoldAtkBp, relicValue } from '../../src/sim/relics';
import { ccTicks } from '../../src/sim/milestones';
import { matchInputs, replayMatchOptions } from '../../src/sim/replay';
import { command, data, eventsOf } from '../helpers/match';

const rules = buildMatchRules(data);
const inf = (relics: Record<string, number> = {}, seed = 1) => createMatch(data, { seed, mode: 'infinite', relics: [relics], debug: true });

describe('유물 데이터 → 정수 규칙', () => {
  it('첫 12종, progression.json 공개 풀과 같은 id, 숫돌은 relic-whetstone 하나', () => {
    expect([...rules.relics.keys()]).toHaveLength(12);
    expect([...rules.relics.keys()]).toContain('relic-whetstone');
    expect([...rules.relics.keys()].some((id) => id.includes('smith'))).toBe(false);
  });
  it('모든 유물: Lv1 > 0, 레벨마다 정수 값이 엄격히 오른다 (헛 레벨 없음)', () => {
    for (const r of rules.relics.values()) {
      expect(Number.isInteger(r.base) && Number.isInteger(r.perLevel), r.id).toBe(true);
      expect(relicValue(r, 1), r.id).toBeGreaterThan(0);
      for (let lv = 2; lv <= r.maxLevel; lv++) expect(relicValue(r, lv), `${r.id} Lv${lv}`).toBeGreaterThan(relicValue(r, lv - 1));
    }
  });
  it('후보값 (Lv1 → 최대): 숫돌 5% → 9.5% · 바람개비 4% → 7.6% · 표식 8% → 15.2% · 저금통 상한 +2,000 → +6,500 · 장갑 +1 → +5', () => {
    const v = (id: string, lv: number) => relicValue(rules.relics.get(id)!, lv);
    expect([v('relic-whetstone', 1), v('relic-whetstone', 10)]).toEqual([500, 950]);
    expect([v('relic-pinwheel', 1), v('relic-pinwheel', 10)]).toEqual([400, 760]);
    expect([v('relic-hunter-mark', 1), v('relic-hunter-mark', 10)]).toEqual([800, 1520]);
    expect([v('relic-acorn-bank', 1), v('relic-acorn-bank', 10)]).toEqual([2000, 6500]);
    expect([v('relic-work-gloves', 1), v('relic-work-gloves', 5)]).toEqual([1, 5]);
    expect([v('relic-sturdy-fence', 1), v('relic-sturdy-fence', 5)]).toEqual([1, 5]);
  });
  it('없는 유물·범위 밖 레벨은 판을 만들 때 에러', () => {
    expect(() => inf({ 'relic-nope': 1 })).toThrow(/없는 유물/);
    expect(() => inf({ 'relic-work-gloves': 6 })).toThrow(/1~5/);
    expect(() => inf({ 'relic-whetstone': 0 })).toThrow(/1~10/);
  });
});

describe('전투 유물', () => {
  const place = (m: ReturnType<typeof inf>, id: string, i = 0) => {
    const [x, y] = m.map.buildable[i]!;
    return placeTower(m.world, id, 0, x, y);
  };
  it('숫돌: 모든 타워 공격력% 합연산 (Lv1 +5%, Lv10 +9.5%)', () => {
    for (const [lv, bp] of [[1, 500], [10, 950]] as const) {
      const m = inf({ 'relic-whetstone': lv });
      expect(towerBonus(m.ctx, place(m, 'archer'), new Map()).atkPctBp).toBe(bp);
    }
    const m0 = inf();
    expect(towerBonus(m0.ctx, place(m0, 'archer'), new Map()).atkPctBp).toBe(0);
  });
  it('쇠뇌 깃털 = 물리·혼합만, 별빛 잉크 = 마법·혼합만', () => {
    const m = inf({ 'relic-crossbow-feather': 1, 'relic-starlight-ink': 1 });
    expect(relicAtkBp(m.ctx, { owner: 0, tower: 'archer' })).toBe(500); // 물리
    expect(relicAtkBp(m.ctx, { owner: 0, tower: 'apprentice' })).toBe(500); // 마법
    expect(relicAtkBp(m.ctx, { owner: 0, tower: 'gambler' })).toBe(1000); // 혼합
    expect(relicAtkBp(m.ctx, { owner: 0, tower: 'fate' })).toBe(0); // 고정 피해
  });
  it('바람개비: 공속% (기존 상한 그대로), 사냥꾼 표식: 보스 배율 ×1.08', () => {
    const m = inf({ 'relic-pinwheel': 1, 'relic-hunter-mark': 1 });
    const t = place(m, 'archer');
    const b = towerBonus(m.ctx, t, new Map());
    expect(b.apsPctBp).toBe(400);
    expect(b.bossMulBp).toBe(10800);
    const eff = effectiveStats(rules, rules.towers.get('archer')!, NO_MODS, b);
    expect(eff.apsMulBp).toBe(10400);
  });
  it('금화 망치: 보유금 1,000원당 +0.3%, 합 +30% 상한 (상한 뒤로는 돈이 늘어도 그대로)', () => {
    const m = inf({ 'relic-coin-hammer': 1 });
    expect(relicGoldAtkBp(m.ctx, 0, 999)).toBe(0);
    expect(relicGoldAtkBp(m.ctx, 0, 5_500)).toBe(150);
    expect(relicGoldAtkBp(m.ctx, 0, 100_000)).toBe(3000);
    expect(relicGoldAtkBp(m.ctx, 0, 10_000_000)).toBe(3000);
    const m10 = inf({ 'relic-coin-hammer': 10 });
    expect(relicGoldAtkBp(m10.ctx, 0, 10_000)).toBe(570);
    expect(relicGoldAtkBp(m10.ctx, 0, 1_000_000)).toBe(3000);
  });
  it('서리 결정: 거는 제어 시간% (마일스톤 제어%와 합연산)', () => {
    const m = inf({ 'relic-frost-crystal': 1 });
    expect(ccTicks(m.ctx, 0, 'icemage', 100)).toBe(105);
    const both = createMatch(data, { seed: 1, mode: 'infinite', levels: [{ icemage: 6 }], relics: [{ 'relic-frost-crystal': 10 }] });
    expect(ccTicks(both.ctx, 0, 'icemage', 100)).toBe(119); // +10% + 9.5%
  });
});

describe('경제·유틸 유물 (기존 값은 그대로, 더하기만)', () => {
  it('여행 지갑: 시작 자금 1,000 + 50 (Lv10 +140)', () => {
    expect(inf().state.gold).toBe(1000);
    expect(inf({ 'relic-travel-wallet': 1 }).state.gold).toBe(1050);
    expect(inf({ 'relic-travel-wallet': 10 }).state.gold).toBe(1140);
  });
  it('도토리 저금통: 기존 100원당 10원·상한 10,000 → 100원당 11원·상한 +2,000', () => {
    const m0 = inf();
    expect(stageInterest(m0.ctx, 5_000)).toBe(500);
    expect(stageInterest(m0.ctx, 1_000_000)).toBe(10_000);
    const m = inf({ 'relic-acorn-bank': 1 });
    expect(stageInterest(m.ctx, 5_000)).toBe(550);
    expect(stageInterest(m.ctx, 1_000_000)).toBe(12_000);
    expect(stageInterest(inf({ 'relic-acorn-bank': 10 }).ctx, 1_000_000)).toBe(16_500);
  });
  it('성실 장갑: 일꾼 1명당 5원 → 6원 (일꾼 열정 배율은 그 뒤)', () => {
    const m = inf({ 'relic-work-gloves': 1 });
    m.state.workers = 3;
    expect(workerIncome(m.ctx)).toBe(18);
    const m0 = inf();
    m0.state.workers = 3;
    expect(workerIncome(m0.ctx)).toBe(15);
  });
  it('튼튼 울타리: 무한 몹 한도 +1(Lv5 +5), 캠페인 목숨 +1', () => {
    const base = inf().state.mobLimit;
    expect(inf({ 'relic-sturdy-fence': 1 }).state.mobLimit).toBe(base + 1);
    expect(inf({ 'relic-sturdy-fence': 5 }).state.mobLimit).toBe(base + 5);
    const c0 = createMatch(data, { seed: 1, mode: 'campaign', theme: 1 });
    const c = createMatch(data, { seed: 1, mode: 'campaign', theme: 1, relics: [{ 'relic-sturdy-fence': 1 }] });
    expect([c.state.lives, c.state.maxLives]).toEqual([c0.state.lives + 1, c0.state.maxLives + 1]);
  });
  it('위로의 쿠키: ×0일 때만 비용의 10% 한 번 환급, 배율·잭팟 게이지 순서는 유물 없는 판과 똑같다', () => {
    const run = (relics: Record<string, number>) => {
      const m = inf(relics, 7);
      m.state.gold = 100_000;
      const out: { mul: number; win: number; gauge: number; refund: number }[] = [];
      for (let i = 0; i < 60; i++) {
        command(m, { type: 'gamble', t: 1, player: 0 });
        for (const e of eventsOf(m, 'gamble')) {
          const p = e as unknown as { mul: number; win: number; gauge: number; refund?: number };
          out.push({ mul: p.mul, win: p.win, gauge: p.gauge, refund: p.refund ?? 0 });
        }
      }
      return { out, gold: m.state.gold };
    };
    const a = run({});
    const b = run({ 'relic-comfort-cookie': 1 });
    expect(b.out.map((x) => [x.mul, x.win, x.gauge])).toEqual(a.out.map((x) => [x.mul, x.win, x.gauge]));
    const zeros = a.out.filter((x) => x.mul === 0).length;
    expect(zeros).toBeGreaterThan(5);
    for (const x of b.out) expect(x.refund).toBe(x.mul === 0 ? 10 : 0); // 100원 테이블 × 10%
    expect(b.gold - a.gold).toBe(zeros * 10);
  });
});

describe('판 입력 기록 (리플레이·판 저장)', () => {
  it('유물이 있으면 matchInputs.relics, 없으면 필드 없음 (예전 파일 모양) — 되살린 판도 같은 유물', () => {
    const m = inf({ 'relic-whetstone': 3 });
    const inputs = matchInputs(m);
    expect(inputs.relics).toEqual([{ 'relic-whetstone': 3 }]);
    expect('relics' in matchInputs(inf())).toBe(false);
    const again = createMatch(data, replayMatchOptions(inputs));
    expect(again.ctx.relics).toEqual([{ 'relic-whetstone': 3 }]);
    expect(again.state.gold).toBe(m.state.gold);
  });
});
