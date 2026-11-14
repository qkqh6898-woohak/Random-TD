/**
 * M3-8 특색 능력 레지스트리: abilities/<id>.ts 모듈, params [Lv1, Lv15] 정수 보간, 타워 레벨 주입(기본 1), 레벨당 공격력 +4%.
 */
import { describe, expect, it } from 'vitest';
import { DECK_GRADES } from '../../src/data/deck';
import { abilityIds, abilityOf, abilityParams, checkAllAbilityParams, gambleZeroReduction } from '../../src/sim/abilities';
import { lerpLevel, ParamReader } from '../../src/sim/abilities/params';
import { createMatch } from '../../src/sim/match';
import { buildMatchRules } from '../../src/sim/rules';
import { NO_MODS, effectiveStats } from '../../src/sim/stats';
import { computeAuras, towerBonus } from '../../src/sim/systems/Aura';
import { placeTower } from '../../src/sim/systems/Summon';
import { arena, data, infinite, mobAt } from '../helpers/match';

const rules = buildMatchRules(data);

describe('레지스트리', () => {
  it('기본 덱의 특색 타워 15종(노말 1·레어 2·유니크 3·히어로 4·레전드 5) + 광전사(능력) = 16종 모듈, 모든 모듈 id는 towers.json에 있다', () => {
    const ids = abilityIds();
    expect(ids).toHaveLength(16);
    const base = DECK_GRADES.flatMap((g) => data.decks.base[g]);
    const special = base.filter((id) => data.towers.towers.find((t) => t.id === id)?.special === 1);
    expect(special).toHaveLength(15);
    for (const id of special) expect(abilityOf(id), id).toBeDefined();
    expect(abilityOf('berserker')).toBeDefined();
    for (const id of ids) expect(rules.towers.has(id), id).toBe(true);
    // 능력 없는 기본 타워: 스탯·dot만으로 동작
    for (const id of ['goblin', 'archer', 'apprentice', 'warrior', 'flamemage', 'cleaver', 'duelist', 'sniper', 'swordsaint']) {
      expect(abilityOf(id), id).toBeUndefined();
    }
  });

  it('모든 모듈의 params가 레벨 1·15에서 정수로 읽힌다 (createMatch도 판을 만들 때 검사)', () => {
    expect(() => checkAllAbilityParams({ rules })).not.toThrow();
  });
});

describe('레벨 보간 lerp(params[0], params[1], (lv − 1) / 14)', () => {
  it('정수 보간: Lv1 = 앞 값, Lv15 = 뒤 값, 사이는 0 쪽으로 자름', () => {
    expect(lerpLevel(160, 100, 1, 15)).toBe(160);
    expect(lerpLevel(160, 100, 15, 15)).toBe(100);
    expect(lerpLevel(160, 100, 8, 15)).toBe(130);
    expect(lerpLevel(100, 2000, 8, 15)).toBe(1050);
    expect(lerpLevel(100, 2000, 2, 15)).toBe(235); // 100 + 1900/14 = 235.7 → 235
  });

  it('ParamReader: 비율 → bp, 초 → 틱, 칸 → 단위, 배율 → bp, 상수는 레벨과 무관', () => {
    const r1 = new ParamReader('mudshaman', rules.towers.get('mudshaman')!.params, 1, 15);
    const r15 = new ParamReader('mudshaman', rules.towers.get('mudshaman')!.params, 15, 15);
    expect([r1.bp('slow'), r15.bp('slow')]).toEqual([2500, 4000]);
    expect([r1.ticks('puddleCd'), r15.ticks('puddleCd')]).toEqual([160, 100]);
    expect([r1.ticks('slowDur'), r15.ticks('slowDur')]).toEqual([40, 40]);
    expect(r1.units('puddleRadius')).toBe(750);
    const a = new ParamReader('assassin', rules.towers.get('assassin')!.params, 15, 15);
    expect(a.mul('bossMul')).toBe(35_000);
  });

  it('잘못된 params·레벨은 경로가 든 에러', () => {
    const r = new ParamReader('miner', { goldChance: 'x', gold: [1, 2, 3] }, 1, 15);
    expect(() => r.bp('goldChance')).toThrow('towers.json miner.params.goldChance');
    expect(() => r.int('gold')).toThrow('towers.json miner.params.gold');
    expect(() => r.bp('nothing')).toThrow('towers.json miner.params.nothing');
    expect(() => new ParamReader('miner', {}, 16, 15)).toThrow('1~15');
    expect(() => new ParamReader('x', { t: 0.07 }, 1, 15).ticks('t')).toThrow('1틱');
  });
});

describe('타워 레벨 주입 (기본 1, 나중에 계정 M9)', () => {
  it('레벨을 주지 않으면 모두 Lv1 수치', () => {
    const m = infinite(1);
    expect(abilityParams(m.ctx, 0, abilityOf('mudshaman')!)).toMatchObject({ slowBp: 2500, puddleCdTicks: 160 });
  });

  it('MatchOptions.levels로 플레이어별 레벨을 넣으면 특색 수치가 그 레벨로 (진흙 주술사 Lv15 둔화 40%)', () => {
    const m = arena(1, { levels: [{ mudshaman: 15 }] });
    const mob = mobAt(m, 'slime', 3000);
    mob.hp = 100_000;
    placeTower(m.world, 'mudshaman', 0, 4, 2);
    m.stepN(3);
    expect(mob.slowBp).toBe(4000);
  });

  it('레벨당 공격력 +4% (Lv15 = +56%)', () => {
    const m = infinite(1, { levels: [{ archer: 15 }] });
    const archer = placeTower(m.world, 'archer', 0, 4, 4);
    expect(towerBonus(m.ctx, archer, computeAuras(m.ctx, m.world)).atkPctBp).toBe(5600);
    expect(effectiveStats(rules, rules.towers.get('archer')!, NO_MODS, towerBonus(m.ctx, archer, new Map())).atkMulBp).toBe(15_600);
  });

  it('잘못된 레벨·없는 타워는 판을 만들 때 에러', () => {
    expect(() => createMatch(data, { seed: 1, mode: 'infinite', levels: [{ archer: 0 }] })).toThrow('1~15');
    expect(() => createMatch(data, { seed: 1, mode: 'infinite', levels: [{ nope: 2 }] })).toThrow('없는 타워');
  });
});

describe('도박꾼 도박 ×0 확률 (M5가 읽는 값)', () => {
  it('판 위에 있으면 −3%p(Lv1), 2개여도 한 번만, 없으면 0', () => {
    const m = infinite(1);
    expect(gambleZeroReduction(m.ctx, m.world, 0)).toBe(0);
    placeTower(m.world, 'gambler', 0, 4, 4);
    expect(gambleZeroReduction(m.ctx, m.world, 0)).toBe(300);
    placeTower(m.world, 'gambler', 0, 4, 5);
    expect(gambleZeroReduction(m.ctx, m.world, 0)).toBe(300);
  });
});
