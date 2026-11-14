/**
 * M3-7 오라 (GDD 5.6): 주변 8칸(3×3)·24칸(5×5)은 자신 제외, 전체는 자신 포함, 같은 타워 효과는 중첩 안 함·다른 타워는 중첩,
 * 이동하면 다시 계산 (DEV_PLAN 3.1), 학자 2개 = +20% (DEV_PLAN M3-7 완료 조건).
 */
import { describe, expect, it } from 'vitest';
import { towerAt } from '../../src/sim/entities/Tower';
import { NO_MODS, effectiveStats } from '../../src/sim/stats';
import { auraCovers, computeAuras, towerBonus } from '../../src/sim/systems/Aura';
import { placeTower } from '../../src/sim/systems/Summon';
import { arena, command, data, infinite, mobAt } from '../helpers/match';
import { buildMatchRules } from '../../src/sim/rules';

const rules = buildMatchRules(data);
const at = (id: number, tx: number, ty: number) => ({ id, tx, ty });

describe('범위 (auraCovers)', () => {
  it('주변 8칸 = 3×3에서 자신 제외, 주변 24칸 = 5×5에서 자신 제외, 전체 = 자신 포함', () => {
    const src = at(1, 4, 5);
    const around8 = [];
    const around24 = [];
    for (let y = 0; y < 11; y++) {
      for (let x = 0; x < 9; x++) {
        const dst = at(x === 4 && y === 5 ? 1 : 100 + y * 9 + x, x, y);
        if (auraCovers(rules, 'around8', src, dst)) around8.push(dst);
        if (auraCovers(rules, 'around24', src, dst)) around24.push(dst);
      }
    }
    expect(around8).toHaveLength(8);
    expect(around24).toHaveLength(24);
    expect(auraCovers(rules, 'global', src, src)).toBe(true);
    expect(auraCovers(rules, 'around8', src, src)).toBe(false);
    expect(auraCovers(rules, 'around8', src, at(2, 6, 5))).toBe(false);
  });
});

describe('대장장이 (주변 8칸 공격력 +10%)', () => {
  it('붙어 있는 타워는 +10%, 대장장이 자신은 받지 않는다, 두 칸 떨어진 타워는 0', () => {
    const m = infinite(1);
    const smith = placeTower(m.world, 'blacksmith', 0, 4, 4);
    const near = placeTower(m.world, 'archer', 0, 5, 5);
    const far = placeTower(m.world, 'archer', 0, 6, 4);
    const auras = computeAuras(m.ctx, m.world);
    expect(auras.get(near.id)).toMatchObject({ atkPctBp: 1000, apsPctBp: 0, from: ['blacksmith'] });
    expect(auras.get(smith.id)).toBeUndefined();
    expect(auras.get(far.id)).toBeUndefined();
  });

  it('같은 타워는 중첩 안 함: 대장장이 둘 사이 타워 = +10%만, 대장장이끼리는 서로에게 +10%', () => {
    const m = infinite(1);
    const a = placeTower(m.world, 'blacksmith', 0, 3, 4);
    const b = placeTower(m.world, 'blacksmith', 0, 5, 4);
    const mid = placeTower(m.world, 'archer', 0, 4, 4);
    const c = placeTower(m.world, 'blacksmith', 0, 4, 5);
    const auras = computeAuras(m.ctx, m.world);
    expect(auras.get(mid.id)?.atkPctBp).toBe(1000);
    expect(auras.get(c.id)?.atkPctBp).toBe(1000); // a·b와 대각선으로 붙음 → +10% 한 번
    expect(auras.get(a.id)?.atkPctBp).toBe(1000); // c가 붙어 있다
    expect(auras.get(b.id)?.atkPctBp).toBe(1000);
  });

  it('붙은 궁수는 실제로 피해가 10% 더 들어간다 (10 → 11)', () => {
    const m = arena();
    const mob = mobAt(m, 'slime', 3000);
    mob.hp = 1000;
    placeTower(m.world, 'archer', 0, 4, 2);
    placeTower(m.world, 'blacksmith', 0, 3, 3);
    m.stepN(3);
    expect(1000 - mob.hp).toBe(11);
  });

  it('이동하면 다시 계산: 대장장이를 멀리 옮기면 이웃의 보너스가 사라진다', () => {
    const m = infinite(1);
    placeTower(m.world, 'blacksmith', 0, 4, 4);
    const archer = placeTower(m.world, 'archer', 0, 4, 5);
    expect(computeAuras(m.ctx, m.world).get(archer.id)?.atkPctBp).toBe(1000);
    command(m, { type: 'move', fx: 4, fy: 4, tx: 4, ty: 8 });
    expect(towerAt(m.world, 4, 8)?.tower).toBe('blacksmith');
    expect(computeAuras(m.ctx, m.world).get(archer.id)).toBeUndefined();
  });

  it('2인 판: 남의 타워는 버프하지 않는다', () => {
    const m = infinite(1, { players: 2 });
    placeTower(m.world, 'blacksmith', 0, 4, 4);
    const mine = placeTower(m.world, 'archer', 0, 4, 5);
    const theirs = placeTower(m.world, 'archer', 1, 5, 5);
    const auras = computeAuras(m.ctx, m.world);
    expect(auras.get(mine.id)?.atkPctBp).toBe(1000);
    expect(auras.get(theirs.id)).toBeUndefined();
  });
});

describe('전체 오라 (학자·전쟁 군주)', () => {
  it('학자 2개 = +20% (같은 타워 비중첩, DEV_PLAN M3-7), 학자 자신도 받는다', () => {
    const m = infinite(1);
    const s1 = placeTower(m.world, 'scholar', 0, 0, 0);
    placeTower(m.world, 'scholar', 0, 8, 10);
    const archer = placeTower(m.world, 'archer', 0, 4, 5);
    const auras = computeAuras(m.ctx, m.world);
    expect(auras.get(archer.id)?.atkPctBp).toBe(2000);
    expect(auras.get(s1.id)?.atkPctBp).toBe(2000);
  });

  it('서로 다른 타워는 중첩: 대장장이 +10% + 학자 +20% = +30% (합연산) → 궁수 공격력 10 × 1.3 = 13', () => {
    const m = infinite(1);
    placeTower(m.world, 'scholar', 0, 0, 0);
    placeTower(m.world, 'blacksmith', 0, 4, 4);
    const archer = placeTower(m.world, 'archer', 0, 4, 5);
    const auras = computeAuras(m.ctx, m.world);
    expect(auras.get(archer.id)).toMatchObject({ atkPctBp: 3000, from: ['scholar', 'blacksmith'] });
    const stats = rules.towers.get('archer')!;
    const eff = effectiveStats(rules, stats, NO_MODS, towerBonus(m.ctx, archer, auras));
    expect(eff.atkMulBp).toBe(13_000);
  });

  it('전쟁 군주: 전체 공속 +15% → 궁수 1회/초가 1.15회/초 (20초에 23번)', () => {
    const m = arena();
    const mob = mobAt(m, 'slime', 3000);
    mob.hp = 1_000_000;
    mob.maxHp = 1_000_000;
    const archer = placeTower(m.world, 'archer', 0, 4, 2);
    placeTower(m.world, 'warlord', 0, 0, 10);
    const eff = effectiveStats(rules, rules.towers.get('archer')!, NO_MODS, towerBonus(m.ctx, archer, computeAuras(m.ctx, m.world)));
    expect(eff.apsMilli).toBe(1150);
    m.stepN(400);
    expect(archer.attacks).toBe(23);
  });
});
