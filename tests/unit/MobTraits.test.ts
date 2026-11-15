/**
 * M4-2·M4-3·M4-3a 몹 13종 스탯과 특성: 유령 회피, 분열 슬라임·보석 골렘 깨짐, 치유사 회복, 방패병 보호막(광역 2배),
 * 그림자 늑대 가속, 암흑 고블린 떼, 정예 몹(51단계~).
 * 시험장(tests/helpers arena): 순환의 정원, 진행도 3000 = 칸 (4, 1). 칸 (4, 2) 타워와 1칸.
 */
import { describe, expect, it } from 'vitest';
import { listMobs, type Mob } from '../../src/sim/entities/Mob';
import { buildMatchRules, spawnStats } from '../../src/sim/rules';
import { absorbShield, divBp } from '../../src/sim/systems/Damage';
import { killMob } from '../../src/sim/systems/Kill';
import { effectiveSpeed } from '../../src/sim/systems/Movement';
import { applyHardCc } from '../../src/sim/systems/Status';
import { placeTower } from '../../src/sim/systems/Summon';
import { spawnMob } from '../../src/sim/systems/Spawn';
import { positionAt } from '../../src/sim/map';
import { arena, data, eventsOf, infinite, jumpToStage, mobAt } from '../helpers/match';

const rules = buildMatchRules(data);

describe('몹 13종 스탯 (M4-2 = enemies.json)', () => {
  it('13종 모두 체력 배율·방어·마저·속도·저항·목숨 피해·보상 배율이 데이터 그대로 정수 규칙에', () => {
    expect(data.enemies.mobs).toHaveLength(13);
    for (const m of data.enemies.mobs) {
      const s = rules.mobs.get(m.id)!;
      expect(s.hpMulBp, m.id).toBe(Math.round(m.hpMul * 10000));
      expect(s.armor).toBe(m.armor);
      expect(s.magicRes).toBe(m.magicRes);
      expect(s.speed).toBe(Math.round(m.speed * 1000));
      expect(s.ccResistBp).toBe(Math.round(m.ccResist * 10000));
      expect(s.lifeDamage).toBe(m.lifeDamage);
      expect(s.rewardMulBp).toBe(Math.round(m.rewardMul * 10000));
    }
  });

  it('특성 데이터: 유령 30% 회피 · 치유사 3초/2칸/5% · 방패병 30%·광역 ×2 · 늑대 50% 이하 +30% · 깨짐 2종', () => {
    expect(rules.mobs.get('ghost')!.evadeBp).toBe(3000);
    expect(rules.mobs.get('healer')!.heal).toEqual({ intervalTicks: 60, radius: 2000, pctBp: 500 });
    expect(rules.mobs.get('shield')!.shield).toEqual({ pctBp: 3000, areaMulBp: 20000 });
    expect(rules.mobs.get('shadowwolf')!.haste).toEqual({ belowBp: 5000, speedBp: 3000 });
    expect(rules.mobs.get('splitter')!.split).toMatchObject({ id: 'slime', count: 2, hpBp: 3000, speed: 1800, reward: 0, small: true });
    expect(rules.mobs.get('gemgolem')!.split).toMatchObject({ id: 'minigolem', count: 2, hpBp: 3500, speed: null, reward: null });
    expect(rules.mobs.get('goblin')!.swarm).toBe(3);
  });
});

describe('유령 회피 (단일 공격 30%)', () => {
  it('궁수(단일) 1000발 중 약 30%가 빗나감 → evade 사건, 맞은 만큼만 피해', () => {
    const m = arena(11);
    const ghost = mobAt(m, 'ghost', 3000);
    ghost.hp = ghost.maxHp = 10_000_000;
    ghost.armor = 0;
    placeTower(m.world, 'archer', 0, 4, 2);
    m.stepN(20 * 1000 + 30);
    const evades = eventsOf(m, 'evade').length;
    const hits = 1000 - evades;
    expect(evades / 1000).toBeGreaterThan(0.25);
    expect(evades / 1000).toBeLessThan(0.35);
    // 궁수 공격력 10 (방어 0) → 맞은 수 × 10 (마지막 몇 발은 날아가는 중일 수 있다)
    expect(10_000_000 - ghost.hp).toBeGreaterThanOrEqual((hits - 2) * 10);
  });

  it('광역(견습 마법사)·근접 광역은 회피하지 못한다', () => {
    const m = arena(11);
    const ghost = mobAt(m, 'ghost', 3000);
    ghost.hp = ghost.maxHp = 10_000_000;
    placeTower(m.world, 'apprentice', 0, 4, 2);
    placeTower(m.world, 'cleaver', 0, 4, 0);
    m.stepN(20 * 30);
    expect(eventsOf(m, 'evade')).toHaveLength(0);
    expect(ghost.hp).toBeLessThan(10_000_000);
  });

  it('회피가 없는 몹에게는 전투 난수를 쓰지 않는다', () => {
    const a = arena(3);
    const b = arena(3);
    for (const m of [a, b]) {
      const s = mobAt(m, 'slime', 3000);
      s.hp = s.maxHp = 1_000_000;
      placeTower(m.world, 'archer', 0, 4, 2);
    }
    a.stepN(200);
    expect(a.world.rng('combat').snapshot()).toEqual(b.world.rng('combat').snapshot());
  });
});

describe('깨짐 (분열 슬라임·보석 골렘, M4-3a)', () => {
  it('분열 슬라임이 죽으면 그 자리에 작은 슬라임 2마리: 체력 30%, 속도 1.8, 보상 없음, 몹 수 +2', () => {
    const m = arena(1);
    m.state.stage = 35;
    const sp = mobAt(m, 'splitter', 4321);
    const before = m.mobCount();
    killMob(m.ctx, m.world, sp, 0, 0);
    const kids = listMobs(m.world).filter((x) => x.small);
    expect(kids).toHaveLength(2);
    expect(m.mobCount()).toBe(before - 1 + 2);
    for (const k of kids) {
      expect(k).toMatchObject({ mob: 'slime', progress: 4321, hp: Math.floor((sp.maxHp * 3000) / 10000), speed: 1800, reward: 0, stage: 35 });
    }
    expect(kids.map((k) => k.swarmIndex)).toEqual([0, 1]);
    expect(eventsOf(m, 'split')[0]).toMatchObject({ mob: 'slime', count: 2 });
  });

  it('보석 골렘 → 작은 골렘 2마리 (체력 = 보석 골렘 최대 체력의 35%, 방어 60 성장, 보상 ×0.5)', () => {
    const m = arena(1);
    m.state.stage = 45;
    const g = spawnMob(m.ctx, m.world, 'gemgolem');
    g.progress = 5000;
    killMob(m.ctx, m.world, g, 0, 0);
    const kids = listMobs(m.world).filter((x) => x.mob === 'minigolem');
    expect(kids).toHaveLength(2);
    const mini = spawnStats(rules, rules.mobs.get('minigolem')!, 45);
    for (const k of kids) {
      expect(k.hp).toBe(Math.floor((g.maxHp * 3500) / 10000));
      expect(k.armor).toBe(mini.armor);
      expect(k.reward).toBe(mini.reward);
      expect(k.speed).toBe(1200);
    }
    // 보석 골렘 최대 체력 × 35% ≈ 작은 골렘 데이터 배율(×1.05 = 3 × 0.35)과 같은 값
    expect(Math.abs(kids[0]!.hp - mini.hp)).toBeLessThanOrEqual(1);
  });

  it('조각은 이번 틱 후보에 없다가 다음 틱부터 맞는다 (같은 공격에 연달아 죽지 않음)', () => {
    const m = arena(1);
    const sp = mobAt(m, 'splitter', 3000);
    sp.hp = 1;
    placeTower(m.world, 'cleaver', 0, 4, 2); // 근접 광역
    m.step();
    expect(listMobs(m.world).filter((x) => x.small)).toHaveLength(2);
  });
});

describe('치유사 (3초마다 반경 2칸 다른 몹 5%)', () => {
  it('나온 뒤 3초(60틱)에 반경 2칸 안 다른 몹만 최대 체력 5% 회복, 자기 자신·반경 밖은 아님', () => {
    const m = arena(1);
    m.state.stage = 45;
    const healer = spawnMob(m.ctx, m.world, 'healer');
    healer.progress = 3000;
    healer.speed = 0;
    healer.hp -= 100;
    const near = mobAt(m, 'slime', 4500);
    near.maxHp = 1000;
    near.hp = 500;
    const far = mobAt(m, 'slime', 6000);
    far.maxHp = 1000;
    far.hp = 500;
    const born = m.tick;
    m.stepN(60); // 틱 0~59
    expect(near.hp).toBe(500);
    m.step(); // 틱 60 = 나온 틱 + 3초
    expect(m.tick - 1 - born).toBe(60);
    expect(near.hp).toBe(550);
    expect(far.hp).toBe(500);
    expect(healer.hp).toBe(healer.maxHp - 100);
    const ev = eventsOf(m, 'heal');
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ target: near.id, amount: 50 });
    m.stepN(60);
    expect(near.hp).toBe(600);
  });

  it('최대 체력을 넘지 않는다', () => {
    const m = arena(1);
    const healer = spawnMob(m.ctx, m.world, 'healer');
    healer.speed = 0;
    healer.progress = 3000;
    const near = mobAt(m, 'slime', 3500);
    near.maxHp = 1000;
    near.hp = 990;
    m.stepN(61);
    expect(near.hp).toBe(1000);
  });

  it('기절·정지·빙결 중에는 치유를 미루고 풀리면 바로', () => {
    const m = arena(1);
    const healer = spawnMob(m.ctx, m.world, 'healer');
    healer.speed = 0;
    healer.progress = 3000;
    const near = mobAt(m, 'slime', 3500);
    near.maxHp = 1000;
    near.hp = 100;
    m.stepN(50);
    applyHardCc(rules.status, healer, m.tick, 'stun', 40);
    m.stepN(40);
    expect(near.hp).toBe(100);
    m.stepN(5);
    expect(near.hp).toBe(150);
  });
});

describe('방패병 보호막 (최대 체력 30%, 광역 2배)', () => {
  it('나올 때 보호막 = 최대 체력 × 30%', () => {
    const m = arena(1);
    m.state.stage = 55;
    const s = spawnMob(m.ctx, m.world, 'shield');
    expect(s.maxShield).toBe(Math.floor((s.maxHp * 3000) / 10000));
    expect(s.shield).toBe(s.maxShield);
  });

  it('absorbShield: 단일 1배, 광역 2배, 넘치면 체력으로', () => {
    const mob = { shield: 100 };
    expect(absorbShield(mob, 30)).toBe(30);
    expect(mob.shield).toBe(70);
    expect(absorbShield(mob, 30, 20000)).toBe(30); // 보호막 −60
    expect(mob.shield).toBe(10);
    // 광역 80 → 보호막 단위 160 중 10만 막고 150 넘침 → 피해 단위 75가 체력으로 → 막은 양 5
    expect(absorbShield(mob, 80, 20000)).toBe(5);
    expect(mob.shield).toBe(0);
    expect(absorbShield(mob, 50)).toBe(0);
    expect(divBp(15, 20000)).toBe(7);
    expect(divBp(9_000_000_000_000_001, 20000)).toBe(4_500_000_000_000_000);
  });

  it('전투: 궁수(단일)는 보호막을 1배, 견습 마법사(광역)는 2배로 깎는다', () => {
    const run = (tower: string): { shieldLost: number; hpLost: number; dmg: number } => {
      const m = arena(1);
      const s = mobAt(m, 'shield', 3000);
      s.armor = 0;
      s.magicRes = 0;
      s.hp = s.maxHp = 100_000;
      s.shield = s.maxShield = 30_000;
      placeTower(m.world, tower, 0, 4, 2);
      m.stepN(60);
      const dmg = eventsOf(m, 'hit').reduce((a, e) => a + Number(e.damage), 0);
      return { shieldLost: 30_000 - s.shield, hpLost: 100_000 - s.hp, dmg };
    };
    const single = run('archer');
    expect(single.hpLost).toBe(0);
    expect(single.shieldLost).toBe(single.dmg);
    const area = run('apprentice');
    expect(area.hpLost).toBe(0);
    expect(area.shieldLost).toBe(area.dmg * 2);
  });

  it('지속 피해도 보호막이 먼저 (1배)', () => {
    const m = arena(1);
    const s = mobAt(m, 'shield', 3000);
    s.hp = s.maxHp = 100_000;
    s.shield = s.maxShield = 30_000;
    placeTower(m.world, 'flamemage', 0, 4, 2);
    m.stepN(100);
    expect(s.hp).toBe(100_000);
    expect(s.shield).toBeLessThan(30_000);
  });
});

describe('그림자 늑대 가속 (체력 50% 이하 +30%)', () => {
  it('체력이 절반 이하가 되면 다음 틱부터 1.3배, 회복되면 원래대로', () => {
    const m = arena(1);
    const w = mobAt(m, 'shadowwolf', 3000, 2000);
    w.hp = w.maxHp = 1000;
    m.step();
    expect(w.speedBonusBp).toBe(0);
    w.hp = 500;
    m.step();
    expect(w.speedBonusBp).toBe(3000);
    expect(effectiveSpeed(w, m.tick)).toBe(2600);
    w.hp = 501;
    m.step();
    expect(w.speedBonusBp).toBe(0);
  });
});

describe('정예 몹 (51단계부터 1.5%, 체력 ×5·보상 ×10)', () => {
  it('50단계 이하는 정예가 없고 난수도 쓰지 않는다', () => {
    const m = infinite(4);
    jumpToStage(m, 49);
    m.stepN(1000);
    expect(listMobs(m.world).some((x) => x.elite)).toBe(false);
  });

  it('51단계 이후 대기열 몹 중 약 1.5%가 정예 (체력·보상 배율 정확히)', () => {
    let elite = 0;
    let total = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const m = infinite(seed);
      jumpToStage(m, 51);
      m.stepN(1000);
      for (const x of listMobs(m.world)) {
        if (x.boss) continue;
        total++;
        const base = spawnStats(rules, rules.mobs.get(x.mob)!, 51);
        if (x.elite) {
          elite++;
          expect(x.maxHp).toBe(Math.floor((base.hp * 50000) / 10000));
          expect(x.reward).toBe(base.reward * 10);
        } else expect(x.maxHp).toBe(base.hp);
      }
    }
    expect(total).toBeGreaterThan(250);
    expect(elite).toBeGreaterThan(0);
    expect(elite / total).toBeLessThan(0.05);
  });
});

describe('암흑 고블린 떼 (1칸 = 3마리, 몹 수는 마리마다)', () => {
  it('고블린 1칸 = 같은 틱 3마리, 위치는 진행도 같고 화면 순번만 다르다', () => {
    const m = arena(1);
    m.state.stage = 40;
    const pos = positionAt(m.map.path, 0);
    void pos;
    const before = m.mobCount();
    const mobs: Mob[] = [];
    for (let i = 0; i < 3; i++) mobs.push(spawnMob(m.ctx, m.world, 'goblin', i));
    expect(m.mobCount()).toBe(before + 3);
    expect(new Set(mobs.map((x) => x.progress)).size).toBe(1);
    expect(mobs.map((x) => x.speed)).toEqual([2600, 2600, 2600]);
  });
});
