/**
 * V3 P1 영웅 마일스톤 (Lv3/6/9/12/15): 65종 × Lv1~15를 하나씩 확인한다 (평균 아님).
 *  1) 기존 효과 보존: 공격력% ≥ (Lv−1)×4%, 공속·치명·사거리·관통은 기존 이상, 특색 수치(params)는 마일스톤 없는 보간과 **똑같다**,
 *     오라·제어 지속은 기존 이상.
 *  2) 헛 마일스톤 없음: 마일스톤 레벨마다 그 마일스톤의 효과가 실제 최종 수치(bp·틱)를 올린다 — 공속 상한·치명 상한·오라 내림에 막히지 않는다.
 *  3) Lv1·2는 마일스톤이 없다 (예전 판과 같은 결과 — 리플레이 r1·r2·r7 해시 그대로).
 */
import { describe, expect, it } from 'vitest';
import { abilityOf, abilityParams } from '../../src/sim/abilities';
import { ParamReader } from '../../src/sim/abilities/params';
import { createMatch } from '../../src/sim/match';
import { buildMatchRules, type MatchRules } from '../../src/sim/rules';
import { NO_MODS, effectiveStats, towerRange } from '../../src/sim/stats';
import { auraSpecOf, towerBonus } from '../../src/sim/systems/Aura';
import { placeTower } from '../../src/sim/systems/Summon';
import { ccTicks, milestoneBonus, traitKindOf } from '../../src/sim/milestones';
import type { MatchContext } from '../../src/sim/state';
import { data } from '../helpers/match';

const rules = buildMatchRules(data);
const noMs: MatchRules = { ...rules, milestones: [] };
const ids = data.towers.towers.map((t) => t.id);
const LEVELS = Array.from({ length: 15 }, (_, i) => i + 1);

/** 그 타워 하나만 그 레벨로 놓은 판 → (마일스톤 있음, 없음) 문맥과 타워 */
function setup(id: string, level: number) {
  const m = createMatch(data, { seed: 1, mode: 'infinite', levels: [level >= 2 ? { [id]: level } : {}] });
  const [x, y] = m.map.buildable[0]!;
  const t = placeTower(m.world, id, 0, x, y);
  const base: MatchContext = { ...m.ctx, rules: noMs, cache: new Map() };
  return { m, t, ctx: m.ctx, base };
}

function measure(ctx: MatchContext, t: ReturnType<typeof setup>['t']) {
  const stats = ctx.rules.towers.get(t.tower)!;
  const b = towerBonus(ctx, t, new Map());
  const eff = effectiveStats(ctx.rules, stats, NO_MODS, b);
  const aura = auraSpecOf(ctx, t);
  const def = abilityOf(t.tower);
  return {
    atkPct: b.atkPctBp,
    aps: eff.apsMulBp,
    crit: eff.critBp,
    armorPen: eff.armorPenBp,
    magicPen: eff.magicPenBp,
    range: towerRange(ctx.state, 0, stats.range),
    auraAtk: aura?.atkPctBp ?? 0,
    auraAps: aura?.apsPctBp ?? 0,
    cc: ccTicks(ctx, 0, t.tower, 100),
    params: def ? JSON.stringify(abilityParams(ctx, 0, def)) : '',
  };
}

describe('V3 P1 마일스톤 데이터', () => {
  it('Lv3 공격력 +5% · Lv6 특색 1 · Lv9 공속 +5% · Lv12 특색 2 · Lv15 공격력 +5%·공속 +5%', () => {
    expect(rules.milestones.map((m) => [m.level, m.atkBp, m.apsBp, m.trait])).toEqual([
      [3, 500, 0, false],
      [6, 0, 0, true],
      [9, 0, 500, false],
      [12, 0, 0, true],
      [15, 500, 500, false],
    ]);
  });
  it('특색 강화 종류는 sim에 실제로 있는 특색만: 오라 = aura 훅이 있는 타워, 제어 = 제어를 거는 3종', () => {
    for (const id of ids) {
      const kind = traitKindOf(rules, id);
      if (kind === 'aura') expect(abilityOf(id)?.aura, id).toBeDefined();
      if (kind === 'cc') expect(['icemage', 'chronomancer', 'mudshaman'], id).toContain(id);
    }
    // 오라 훅이 있는 타워는 모두 aura 종류 (지원 영웅이 치명 강화를 받아 의미 없게 되지 않게)
    for (const id of ids) if (abilityOf(id)?.aura) expect(traitKindOf(rules, id), id).toBe('aura');
  });
  it('Lv1·2는 마일스톤 없음', () => {
    for (const id of ids) for (const lv of [1, 2]) expect(milestoneBonus(rules, id, lv).traitSteps + milestoneBonus(rules, id, lv).atkBp + milestoneBonus(rules, id, lv).apsBp, id).toBe(0);
  });
});

describe('65종 × Lv1~15: 기존 효과 보존 (마일스톤 없는 같은 판과 비교)', () => {
  for (const id of ids) {
    it(id, () => {
      for (const lv of LEVELS) {
        const s = setup(id, lv);
        const now = measure(s.ctx, s.t);
        const before = measure(s.base, s.t);
        const where = `${id} Lv${lv}`;
        // 기존 +4%/Lv 그대로 (마일스톤 없는 값이 정확히 (Lv−1)×4%)
        expect(before.atkPct, where).toBe((lv - 1) * rules.atkPerLevelBp);
        expect(now.atkPct, where).toBeGreaterThanOrEqual(before.atkPct);
        expect(now.aps, where).toBeGreaterThanOrEqual(before.aps);
        expect(now.crit, where).toBeGreaterThanOrEqual(before.crit);
        expect(now.armorPen, where).toBe(before.armorPen);
        expect(now.magicPen, where).toBe(before.magicPen);
        expect(now.range, where).toBe(before.range);
        expect(now.auraAtk, where).toBeGreaterThanOrEqual(before.auraAtk);
        expect(now.auraAps, where).toBeGreaterThanOrEqual(before.auraAps);
        expect(now.cc, where).toBeGreaterThanOrEqual(before.cc);
        // 특색 보간은 손대지 않는다: params는 마일스톤 없는 판과, 그리고 ParamReader 직접 보간과 같다
        expect(now.params, where).toBe(before.params);
        const def = abilityOf(id);
        if (def) expect(now.params, where).toBe(JSON.stringify(def.compile(new ParamReader(id, rules.towers.get(id)!.params, lv, rules.towerLevelMax))));
      }
    });
  }
});

describe('65종: 마일스톤마다 실제 효과가 오른다 (헛 마일스톤 없음)', () => {
  for (const id of ids) {
    it(id, () => {
      const kind = traitKindOf(rules, id);
      for (const ms of rules.milestones) {
        const prev = measure(setup(id, ms.level - 1).ctx, setup(id, ms.level - 1).t);
        const s = setup(id, ms.level);
        const cur = measure(s.ctx, s.t);
        const where = `${id} Lv${ms.level}`;
        if (ms.atkBp > 0) expect(cur.atkPct - prev.atkPct, where).toBe(rules.atkPerLevelBp + ms.atkBp);
        if (ms.apsBp > 0) expect(cur.aps, where).toBeGreaterThan(prev.aps);
        if (ms.trait) {
          if (kind === 'crit') expect(cur.crit, where).toBeGreaterThan(prev.crit);
          if (kind === 'aura') expect(cur.auraAtk + cur.auraAps, where).toBeGreaterThan(prev.auraAtk + prev.auraAps);
          if (kind === 'cc') expect(cur.cc, where).toBeGreaterThan(prev.cc);
        }
      }
    });
  }
});

describe('제어 마일스톤이 실제 판에서 지속을 늘린다', () => {
  it('얼음술사 Lv12 빙결 지속 = Lv11 보간 값 기준 ×1.2 (특색 2단계 × 10%)', () => {
    const m = createMatch(data, { seed: 1, mode: 'infinite', levels: [{ icemage: 12 }] });
    const p = abilityParams(m.ctx, 0, abilityOf('icemage')!) as { freezeTicks: number };
    expect(ccTicks(m.ctx, 0, 'icemage', p.freezeTicks)).toBe(Math.floor((p.freezeTicks * 12000) / 10000));
  });
});

describe('화면 모델 (로비 영웅 상세 띠)', async () => {
  const { heroMilestones, newMilestones, heroTotalAtkBp } = await import('../../src/meta/v3/milestones');
  const { heroDetail } = await import('../../src/ui/lobby/lobbyModel');
  const { loadProgression } = await import('../../src/meta/progressionData');
  const { newProgress } = await import('../../src/meta/progress');
  const pd = loadProgression(data);

  it('5칸 · 이미 Lv12인 영웅은 구매 없이 Lv3/6/9/12 적용됨 (기존 계정 소급)', () => {
    const items = heroMilestones(data, 'archer', 12);
    expect(items.map((m) => [m.level, m.reached])).toEqual([[3, true], [6, true], [9, true], [12, true], [15, false]]);
    expect(items[1]!.detail).toContain('치명타 확률 +4%p');
    expect(items[3]!.detail).toContain('치명타 확률 +8%p');
    expect(heroMilestones(data, 'scholar', 1)[1]!.detail).toContain('지원 효과 +10%');
    expect(heroMilestones(data, 'icemage', 1)[3]!.detail).toContain('정지 시간 +20%');
  });
  it('레벨업 5 → 6이면 새 마일스톤 Lv6, 2 → 3이면 Lv3, 같은 칸 안이면 없음', () => {
    expect(newMilestones(data, 'archer', 5, 6).map((m) => m.level)).toEqual([6]);
    expect(newMilestones(data, 'archer', 2, 3).map((m) => m.level)).toEqual([3]);
    expect(newMilestones(data, 'archer', 3, 4)).toEqual([]);
  });
  it('상세 전투 공격력 = (Lv−1)×4% + 마일스톤 공격력 (Lv2 +4% → Lv3 +13%)', () => {
    expect(heroTotalAtkBp(data, 'archer', 2)).toBe(400);
    expect(heroTotalAtkBp(data, 'archer', 3)).toBe(1300);
    expect(heroTotalAtkBp(data, 'archer', 15)).toBe(6600);
    const s = newProgress(pd, data, 1);
    s.heroes.archer!.level = 2;
    const d = heroDetail(s, pd, data, 'archer')!;
    expect([d.bonus, d.nextBonus]).toEqual(['+4%', '+13%']);
    expect(d.milestones.filter((m) => m.reached)).toEqual([]);
  });
});
