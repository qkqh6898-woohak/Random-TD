/**
 * M3-4 피해 공식 전체 (GDD 5.4): 물리·마법·고정, 감소율 A ÷ (A + 100) 정수 계산, 방어·마법 관통(최대 90%), 고정 관통,
 * 치명타(확률·배율), 공격력% 합연산, 약화(받는 피해 +%, 최대 +100%), 보스 배율, 공속 한도(기본 ×5·초당 15회).
 * DEV_PLAN M3 '테스트 목록 (피해 공식 예시 값)'의 피해 행을 모두 확인한다 (둔화·기절 행은 상태 이상 M3-6).
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/sim/Rng';
import { STREAM_COMBAT } from '../../src/sim/World';
import type { Mob } from '../../src/sim/entities/Mob';
import { ATTACK_COST, chargeAttacks } from '../../src/sim/entities/Tower';
import { buildMatchRules, type TowerStats } from '../../src/sim/rules';
import { NO_MODS, cappedAps, effectiveStats, newPlayerMods } from '../../src/sim/stats';
import {
  applyHit,
  chainFalloffBp,
  damageAgainst,
  damageCaps,
  reduceDamage,
  rollCrit,
  rollHit,
  splitAtk,
  type RawHit,
} from '../../src/sim/systems/Combat';
import { placeTower } from '../../src/sim/systems/Summon';
import { addMob, data, infinite } from '../helpers/match';

const rules = buildMatchRules(data);
const caps = damageCaps(rules);

/** 1회 피해 (정수, 예시 표 단위): 공격력은 칸 단위 그대로 넣고 × 100 정수로 계산한 뒤 나머지 없이 자른다. */
function oneHit(hit: Partial<RawHit> & { p?: number; m?: number; t?: number }, mob: Partial<Mob>): number {
  const scaled: RawHit = { ...hit, p: (hit.p ?? 0) * 100, m: (hit.m ?? 0) * 100, t: (hit.t ?? 0) * 100 };
  const d = damageAgainst(scaled, { armor: 0, magicRes: 0, ...mob }, caps);
  return splitAtk(d.total, 0).dmg;
}

describe('DEV_PLAN M3 피해 공식 예시 표', () => {
  it('물리 100, 방어 0 → 100', () => {
    expect(oneHit({ p: 100 }, { armor: 0 })).toBe(100);
  });

  it('물리 100, 방어 100 → 50', () => {
    expect(oneHit({ p: 100 }, { armor: 100 })).toBe(50);
  });

  it('물리 100, 방어 100, 방어 관통 50% → A = 50 → 66 (정수 내림)', () => {
    expect(oneHit({ p: 100, armorPenBp: 5000 }, { armor: 100 })).toBe(66);
    expect(reduceDamage(100, 100, 5000)).toBe(66);
  });

  it('마법 100, 마법 저항 60, 마법 관통 20% → A = 48 → 67', () => {
    expect(oneHit({ m: 100, magicPenBp: 2000 }, { magicRes: 60 })).toBe(67);
    expect(reduceDamage(100, 60, 2000)).toBe(67);
  });

  it('고정 100, 방어 300 → 100 (아무것에도 막히지 않음)', () => {
    expect(oneHit({ t: 100 }, { armor: 300, magicRes: 300 })).toBe(100);
  });

  it('물리 100, 치명타 ×2, 약화 +25%, 방어 0 → 250', () => {
    const stats = { ...rules.towers.get('archer')!, atkC: 10_000, critMulBp: 20_000 } as TowerStats;
    const hit = rollHit(stats, effectiveStats(rules, stats), true);
    expect(hit).toMatchObject({ p: 20_000, crit: true });
    const d = damageAgainst(hit, { armor: 0, magicRes: 0, vulnBp: 2500 }, caps);
    expect(splitAtk(d.total, 0).dmg).toBe(250);
  });
});

describe('감소율 A ÷ (A + 100) (GDD 5.4 표)', () => {
  it('방어(관통 후) 0·25·50·100·200·300 → 감소 0%·20%·33%·50%·67%·75% (공격력 300 기준 내림)', () => {
    const out = [0, 25, 50, 100, 200, 300].map((a) => reduceDamage(300, a));
    expect(out).toEqual([300, 240, 200, 150, 100, 75]);
  });

  it('A가 소수여도 한 번만 내린다: 방어 61 × (1 − 0.3) = 42.7 → 100 × 100 ÷ 142.7 = 70.07 → 70', () => {
    expect(reduceDamage(10_000, 61, 3000)).toBe(7007);
    expect(reduceDamage(100, 61, 3000)).toBe(70);
  });

  it('고정 관통: A = max(0, 방어 × (1 − 관통) − 고정) — 방어 100, 고정 30 → A 70 / 고정이 더 크면 A = 0', () => {
    expect(reduceDamage(170, 100, 0, 30)).toBe(100);
    expect(reduceDamage(100, 20, 0, 50)).toBe(100);
    expect(reduceDamage(100, 100, 5000, 50)).toBe(100); // 100 × 0.5 − 50 = 0
  });

  it('관통 최대 90%: 관통 120%를 넣어도 A = 방어 × 0.1 (방어 1000 → 100 → 절반)', () => {
    expect(oneHit({ p: 100, armorPenBp: 12_000 }, { armor: 1000 })).toBe(50);
    expect(oneHit({ m: 100, magicPenBp: 9000 }, { magicRes: 1000 })).toBe(50);
    expect(rules.penMaxBp).toBe(9000);
  });

  it('표식은 관통 합에 더해진다 (방어·마법 저항 모두), 합도 90%까지', () => {
    expect(oneHit({ p: 100 }, { armor: 100, markBp: 5000 })).toBe(66);
    expect(oneHit({ m: 100, magicPenBp: 2000 }, { magicRes: 100, markBp: 2000 })).toBe(62); // A = 60 → 62.5
    expect(oneHit({ p: 100, armorPenBp: 6000 }, { armor: 1000, markBp: 6000 })).toBe(50); // 120% → 90%
  });

  it('혼합(물리 + 마법): 종류마다 따로 깎고 합친 뒤 한 번만 자른다', () => {
    // 물리 39 vs 방어 100 → 19.5, 마법 39 vs 마저 0 → 39 → 58.5 → 58
    expect(oneHit({ p: 39, m: 39 }, { armor: 100, magicRes: 0 })).toBe(58);
  });
});

describe('배율: 공격력% 합연산 · 치명타 · 약화 · 보스', () => {
  it('공격력%는 모두 더한 뒤 한 번 곱한다 (+20% + +30% = ×1.5)', () => {
    const stats = rules.towers.get('archer')!; // 물리 10
    const mods = { ...newPlayerMods(), atkPctBp: 2000 + 3000 };
    const hit = rollHit(stats, effectiveStats(rules, stats, mods));
    expect(hit.p).toBe(1500);
  });

  it('치명타 배율은 타워 값(저격수 ×3) + 치명타 피해 강화', () => {
    const sniper = rules.towers.get('sniper')!;
    expect(sniper.critBp).toBe(3000);
    expect(sniper.critMulBp).toBe(30_000);
    expect(rollHit(sniper, effectiveStats(rules, sniper), true).p).toBe(29_000 * 3);
    const mods = { ...newPlayerMods(), critMulBp: 5000 };
    expect(rollHit(sniper, effectiveStats(rules, sniper, mods), true).p).toBe(29_000 * 3.5);
    expect(rollHit(sniper, effectiveStats(rules, sniper, mods), false).p).toBe(29_000);
  });

  it('치명타 확률: 타워 + 강화, 최대 100% / 0%면 난수를 쓰지 않음 / 100%면 난수 없이 치명타', () => {
    const duelist = rules.towers.get('duelist')!;
    expect(effectiveStats(rules, duelist).critBp).toBe(2000);
    expect(effectiveStats(rules, duelist, { ...newPlayerMods(), critChanceBp: 9000 }).critBp).toBe(10_000);
    const a = new Rng(1);
    const b = new Rng(1);
    expect(rollCrit(a, 0)).toBe(false);
    expect(rollCrit(a, 10_000)).toBe(true);
    expect(a.nextU32()).toBe(b.nextU32());
    // 20%: 1만 번에 약 2000번
    const rng = new Rng(2026);
    let n = 0;
    for (let i = 0; i < 10_000; i++) if (rollCrit(rng, 2000)) n++;
    expect(n).toBeGreaterThan(1850);
    expect(n).toBeLessThan(2150);
  });

  it('약화(받는 피해 증가)는 합산, 최대 +100%', () => {
    expect(oneHit({ p: 100 }, { vulnBp: 1000 + 1500 })).toBe(125);
    expect(oneHit({ p: 100 }, { vulnBp: 30_000 })).toBe(200);
    expect(rules.vulnMaxBp).toBe(10_000);
  });

  it('보스 피해 배율은 대상이 보스일 때만 (보스 피해 +100% → ×2)', () => {
    const stats = rules.towers.get('archer')!;
    const hit = rollHit(stats, effectiveStats(rules, stats, { ...newPlayerMods(), bossDmgPctBp: 10_000 }));
    expect(hit.bossMulBp).toBe(20_000);
    expect(splitAtk(damageAgainst(hit, { armor: 0, magicRes: 0, boss: true }, caps).total, 0).dmg).toBe(20);
    expect(splitAtk(damageAgainst(hit, { armor: 0, magicRes: 0, boss: false }, caps).total, 0).dmg).toBe(10);
  });

  it('모든 배율을 곱한 뒤 방어로 깎는다: 물리 100 × 1.5(공격력) × 2(치명) × 1.2(약화) × 2(보스) vs 방어 100·관통 50% → 720 × 2/3 = 480', () => {
    const stats = { ...rules.towers.get('archer')!, atkC: 10_000, critMulBp: 20_000, armorPenBp: 5000 } as TowerStats;
    const mods = { ...newPlayerMods(), atkPctBp: 5000, bossDmgPctBp: 10_000 };
    const hit = rollHit(stats, effectiveStats(rules, stats, mods), true);
    const d = damageAgainst(hit, { armor: 100, magicRes: 0, vulnBp: 2000, boss: true }, caps);
    expect(splitAtk(d.total, 0).dmg).toBe(480);
  });

  it('연쇄 감소: 튕길 때마다 × 0.8 (곱연산) → 1, 0.8, 0.64, 0.512', () => {
    expect(rules.chainKeepBp).toBe(8000);
    expect([0, 1, 2, 3].map((k) => chainFalloffBp(rules.chainKeepBp, k))).toEqual([10_000, 8000, 6400, 5120]);
  });
});

describe('판 안에서: 관통·치명타 타워가 실제로 그렇게 때린다', () => {
  function setup(mobId = 'slime') {
    const m = infinite(5);
    m.state.stage = 1;
    m.state.nextStageTick = 1_000_000;
    m.state.spawnStage = 1;
    const mob = addMob(m, mobId);
    mob.progress = 3000; // (4500, 1500)
    mob.speed = 0;
    mob.hp = 1_000_000;
    mob.maxHp = 1_000_000;
    return { m, mob };
  }

  it('전사(물리 18, 방어 관통 10%) vs 방어 100 → A = 90 → 1회 18 × 100/190 = 9.47 (10번 합 94~95)', () => {
    const { m, mob } = setup();
    mob.armor = 100;
    const w = placeTower(m.world, 'warrior', 0, 4, 0);
    while (w.attacks < 10) m.step();
    expect(1_000_000 - mob.hp).toBe(94);
  });

  it('단일딜 전사(치명타 20% ×2, 관통 30%): 치명타가 섞이고 hit 사건에 crit 표시, 평균 = 이론값 ±2%', () => {
    const { m, mob } = setup();
    const d = placeTower(m.world, 'duelist', 0, 4, 0);
    let crits = 0;
    let hits = 0;
    while (d.attacks < 2000) {
      m.step();
      for (const e of m.world.drainEvents()) {
        if (e.type !== 'hit') continue;
        hits++;
        if (e.crit === true) {
          crits++;
          expect(e.damage === 96 || e.damage === 95 || e.damage === 97).toBe(true);
        }
      }
    }
    expect(hits).toBe(2000);
    expect(crits / hits).toBeGreaterThan(0.17);
    expect(crits / hits).toBeLessThan(0.23);
    const ideal = 2000 * 48 * 1.2;
    expect(Math.abs(1_000_000 - mob.hp - ideal) / ideal).toBeLessThan(0.02);
  });

  it('치명타 판정은 전투 난수 흐름만 쓴다 (세계·소환 흐름은 그대로)', () => {
    const { m } = setup();
    const before = { world: m.world.rng('world').snapshot(), summon: m.world.rng('p0.summon').snapshot() };
    const combat = m.world.rng(STREAM_COMBAT).snapshot();
    placeTower(m.world, 'duelist', 0, 4, 0);
    m.stepN(60);
    expect(m.world.rng('world').snapshot()).toEqual(before.world);
    expect(m.world.rng('p0.summon').snapshot()).toEqual(before.summon);
    expect(m.world.rng(STREAM_COMBAT).snapshot()).not.toEqual(combat);
  });

  it('판 내 보정(state.mods): 공격력 +100% → 궁수 1회 20', () => {
    const { m, mob } = setup();
    m.state.mods[0]!.atkPctBp = 10_000;
    const a = placeTower(m.world, 'archer', 0, 4, 0);
    while (a.attacks < 5) m.step();
    m.stepN(3);
    expect(1_000_000 - mob.hp).toBe(100);
  });

  it('applyHit은 판 규칙의 한도로 자른다 (관통 200% → 90%)', () => {
    const { m, mob } = setup();
    mob.armor = 1000;
    mob.hp = 1000;
    applyHit(m.ctx, m.world, mob, { p: 10_000, m: 0, t: 0, armorPenBp: 20_000 }, { x: 0, y: 0 }, 0);
    expect(mob.hp).toBe(950);
  });
});

describe('공격속도 한도 (DEV_PLAN 3.1: +500% → ×5 · 초당 15회)', () => {
  it('cappedAps: 1회/초 +500% → 5회/초, +900%여도 5회/초 (기본의 5배)', () => {
    expect(rules.apsMaxMul).toBe(5);
    expect(rules.apsMaxMilli).toBe(15_000);
    expect(cappedAps(rules, 1000, 50_000)).toBe(5000);
    expect(cappedAps(rules, 1000, 90_000)).toBe(5000);
    expect(cappedAps(rules, 1000, 25_000)).toBe(3500);
  });

  it('초당 15회를 넘지 않는다: 기관총 3회/초 +500% → 15회/초, 고블린 2.5회/초 +500% → 12.5회/초', () => {
    expect(cappedAps(rules, 3000, 50_000)).toBe(15_000);
    expect(cappedAps(rules, 3000, 30_000)).toBe(12_000);
    expect(cappedAps(rules, 2500, 50_000)).toBe(12_500);
  });

  it('공속%가 음수여도 0 아래로는 안 내려간다', () => {
    expect(cappedAps(rules, 1000, -20_000)).toBe(0);
  });

  it('effectiveStats: 배율 표시값(×2.6 = 26000)과 한도 표시', () => {
    const scholar = rules.towers.get('scholar')!; // 1회/초
    const e = effectiveStats(rules, scholar, { ...newPlayerMods(), apsPctBp: 16_000 });
    expect(e.apsMilli).toBe(2600);
    expect(e.apsMulBp).toBe(26_000);
    expect(e.apsCapped).toBe(false);
    const capped = effectiveStats(rules, scholar, { ...newPlayerMods(), apsPctBp: 60_000 });
    expect(capped).toMatchObject({ apsMilli: 5000, apsMulBp: 50_000, apsCapped: true });
    expect(effectiveStats(rules, scholar, NO_MODS)).toMatchObject({ apsMilli: 1000, apsMulBp: 10_000, atkMulBp: 10_000, bossMulBp: 10_000 });
  });

  it('판 안에서: 공속 +2000%여도 1초에 15회 이하 (한 틱 1회, 기관총 3회/초 → 15회/초)', () => {
    const m = infinite(9);
    m.state.stage = 1;
    m.state.nextStageTick = 1_000_000;
    m.state.spawnStage = 1;
    const mob = addMob(m, 'golem');
    mob.progress = 3000;
    mob.speed = 0;
    mob.hp = 1_000_000_000;
    m.state.mods[0]!.apsPctBp = 200_000;
    const g = placeTower(m.world, 'gunner', 0, 4, 0);
    m.stepN(20); // 준비 1발 + 이후
    const start = g.attacks;
    m.stepN(200);
    expect(g.attacks - start).toBe(150);
    // 누적 타이머로 보면 한 틱에 2발 이상 나가지 않는다
    let acc = ATTACK_COST;
    for (let i = 0; i < 40; i++) {
      const r = chargeAttacks(acc, 15_000, () => true);
      expect(r.shots).toBeLessThanOrEqual(1);
      acc = r.acc;
    }
  });
});
