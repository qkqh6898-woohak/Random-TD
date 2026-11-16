/**
 * M2-4~M2-6: 공격 타이머(누적, 한 틱 다중 공격), 투사체(초속 12칸, 헛발), 기본 피해(방어 감소), 처치·보상, 처치가 패배 판정보다 먼저.
 */
import { describe, expect, it } from 'vitest';
import { listProjectiles, stepToward } from '../../src/sim/entities/Projectile';
import { ATTACK_COST, chargeAttacks, type Tower } from '../../src/sim/entities/Tower';
import type { Mob } from '../../src/sim/entities/Mob';
import { positionAt } from '../../src/sim/map';
import { buildMatchRules } from '../../src/sim/rules';
import { applyHit, damageAgainst, reduceDamage, rollHit, splitAtk } from '../../src/sim/systems/Combat';
import { placeTower } from '../../src/sim/systems/Summon';
import { addMob, data, infinite } from '../helpers/match';

const rules = buildMatchRules(data);

/** 공속 apsMilli 타워가 늘 대상이 있을 때 틱마다 몇 번 쏘는지 (n틱). */
function shotsPerTick(apsMilli: number, ticks: number, start = ATTACK_COST): number[] {
  let acc = start;
  const out: number[] = [];
  for (let i = 0; i < ticks; i++) {
    const r = chargeAttacks(acc, apsMilli, () => true);
    acc = r.acc;
    out.push(r.shots);
  }
  return out;
}

/** 무한 판 + 1단계 슬라임 하나를 진행도 progress에 세워 둔다 (속도 0). */
function setup(progress: number, mobId = 'slime'): { m: ReturnType<typeof infinite>; mob: Mob } {
  const m = infinite(1);
  m.state.stage = 1;
  const mob = addMob(m, mobId);
  mob.progress = progress;
  mob.speed = 0;
  // 단계·등장 시스템이 끼어들지 않게: 다음 단계를 멀리, 1단계 등장 대기열은 이미 만든 것으로
  m.state.nextStageTick = 1_000_000;
  m.state.spawnStage = 1;
  return { m, mob };
}

describe('공격 타이머 (M2-4)', () => {
  it('공속 1회/초: 준비 상태에서 바로 1발, 그다음 정확히 20틱마다 (0, 20, 40 …)', () => {
    const shots = shotsPerTick(1000, 61);
    const at = shots.flatMap((n, i) => (n > 0 ? [i] : []));
    expect(at).toEqual([0, 20, 40, 60]);
  });

  it('공속 12.5회/초: 어느 1초(20틱)를 잘라도 12~13회, 10초 평균 12.5회', () => {
    const shots = shotsPerTick(12_500, 220);
    for (let s = 0; s + 20 <= shots.length; s++) {
      const n = shots.slice(s, s + 20).reduce((a, b) => a + b, 0);
      expect(n).toBeGreaterThanOrEqual(12);
      expect(n).toBeLessThanOrEqual(13);
    }
    expect(shots.slice(20, 220).reduce((a, b) => a + b, 0)).toBe(125);
  });

  it('공속 45회/초: 첫 틱 1발(준비분) 뒤로는 한 틱에 2~3번 공격 (누적 방식), 1초에 45회', () => {
    const shots = shotsPerTick(45_000, 21);
    expect(shots[0]).toBe(1);
    expect(Math.max(...shots)).toBe(3);
    expect(shots.slice(1).every((n) => n >= 2)).toBe(true);
    expect(shots.slice(1, 21).reduce((a, b) => a + b, 0)).toBe(45);
  });

  it('대상이 없으면 1회분까지만 모은다: 오래 기다려도 몹이 오면 1발 쏘고 다음은 정상 간격', () => {
    let acc = 0;
    for (let i = 0; i < 200; i++) acc = chargeAttacks(acc, 2500, () => false).acc;
    expect(acc).toBe(ATTACK_COST);
    const shots = shotsPerTick(2500, 17, acc);
    expect(shots.flatMap((n, i) => (n > 0 ? [i] : []))).toEqual([0, 8, 16]);
  });
});

describe('피해 (M2-6 기본 피해)', () => {
  it('방어 감소 A ÷ (A + 100), × 100 단위에서 내림: 방어 0 → 100, 25 → 80, 100 → 50, 300 → 25, 600 vs 10 → 545', () => {
    expect(reduceDamage(100, 0)).toBe(100);
    expect(reduceDamage(100, 25)).toBe(80);
    expect(reduceDamage(100, 100)).toBe(50);
    expect(reduceDamage(100, 300)).toBe(25);
    expect(reduceDamage(600, 10)).toBe(545); // 6 × 100/110 = 5.45 (예전처럼 정수 6에서 자르면 5)
    expect(reduceDamage(0, 50)).toBe(0);
  });

  it('물리는 방어력, 마법은 마법 저항, 고정은 막히지 않음 — 종류별로 자르지 않고 × 100 값으로 합친다', () => {
    // 도박꾼 물리 39 + 마법 39 vs 방어 100 → 19.5 + 39 = 58.5 (× 100 = 5850)
    expect(damageAgainst({ p: 3900, m: 3900, t: 0 }, { armor: 100, magicRes: 0 })).toEqual({ p: 1950, m: 3900, t: 0, total: 5850 });
    expect(damageAgainst({ p: 0, m: 10_000, t: 0 }, { armor: 0, magicRes: 60 })).toMatchObject({ m: 6250, total: 6250 });
    expect(damageAgainst({ p: 0, m: 0, t: 10_000 }, { armor: 300, magicRes: 300 })).toMatchObject({ total: 10_000 });
  });

  it('정수 피해 누적: splitAtk 6.5 회귀 + 견습 마법사 9.75의 10회 합 97·나머지 0.5', () => {
    expect(splitAtk(650, 0)).toEqual({ dmg: 6, rem: 50 });
    expect(splitAtk(650, 50)).toEqual({ dmg: 7, rem: 0 });
    expect(rollHit(rules.towers.get('apprentice')!)).toMatchObject({ p: 0, m: 975, t: 0, crit: false });
    const { m, mob } = setup(3000);
    mob.hp = 1_000_000;
    mob.maxHp = 1_000_000;
    const t = placeTower(m.world, 'apprentice', 0, 4, 0);
    const hits: number[] = [];
    while (hits.length < 10) {
      m.step();
      for (const e of m.world.drainEvents()) if (e.type === 'hit') hits.push(Number(e.damage));
    }
    expect(hits.slice(0, 4)).toEqual([9, 10, 10, 10]);
    expect(hits.reduce((a, b) => a + b, 0)).toBe(97);
    expect(t.remDmg).toBe(50);
  });

  it('회귀: 고블린 공격력 6 vs 방어 1, 소수 나머지를 누적해 100회 합 594', () => {
    const { m, mob } = setup(3000);
    mob.armor = 1;
    mob.hp = 1_000_000;
    mob.maxHp = 1_000_000;
    const g = placeTower(m.world, 'goblin', 0, 4, 0); // 근접 물리 6
    while (g.attacks < 100) m.step();
    expect(g.attacks).toBe(100);
    expect(1_000_000 - mob.hp).toBe(594);
  });

  it('회귀: 방어가 있는 몹 상대 피해 합 = 이론값 ±1 (골렘 방어 61: 광부·고블린·궁수, 400틱)', () => {
    for (const towerId of ['miner', 'goblin', 'archer']) {
      const { m, mob } = setup(3000, 'golem');
      expect(mob.armor).toBe(61);
      mob.hp = 1_000_000_000;
      mob.maxHp = mob.hp;
      const t = placeTower(m.world, towerId, 0, 4, 0);
      const stats = rules.towers.get(towerId)!;
      let hits = 0;
      for (let i = 0; i < 400; i++) {
        m.step();
        for (const e of m.world.drainEvents()) if (e.type === 'hit' && e.source === t.id) hits++;
      }
      expect(hits).toBeGreaterThanOrEqual(20);
      const ideal = (hits * stats.atkC) / (mob.armor + 100); // 공격력 × 100/(A+100), × 100 단위 → ÷ 100
      expect(Math.abs(1_000_000_000 - mob.hp - ideal)).toBeLessThanOrEqual(1);
    }
  });

  it('혼합 피해(물리 + 마법)는 한 번만 자른다: 39 + 39 vs 방어 100 → 58, 59, 58, 59 … (평균 58.5)', () => {
    const { m, mob } = setup(3000);
    mob.armor = 100;
    mob.magicRes = 0;
    mob.hp = 1_000_000;
    mob.maxHp = 1_000_000;
    const t = placeTower(m.world, 'goblin', 0, 4, 0);
    const hit = { p: 3900, m: 3900, t: 0 };
    const out: number[] = [];
    for (let i = 0; i < 4; i++) {
      applyHit(m.ctx, m.world, mob, hit, { x: 0, y: 0 }, t.id);
      out.push(1_000_000 - mob.hp - out.reduce((a, b) => a + b, 0));
    }
    expect(out).toEqual([58, 59, 58, 59]);
  });

  it('쏜 타워가 없어도 피해는 들어간다 (나머지 없이 자름)', () => {
    const { m, mob } = setup(3000);
    mob.hp = 100;
    applyHit(m.ctx, m.world, mob, { p: 650, m: 0, t: 0 }, { x: 0, y: 0 }, 99_999);
    expect(mob.hp).toBe(94);
  });
});

describe('근접 공격: 즉시 피해', () => {
  it('고블린(근접, 물리 6, 공속 2.5)이 옆 몹을 소환된 틱부터 8틱마다 즉시 때린다', () => {
    // 순환의 정원: 진행도 3000 = (4500, 1500) = 칸 (4, 1) 중심. 고블린은 바로 위 (4, 0)
    const { m, mob } = setup(3000);
    const g = placeTower(m.world, 'goblin', 0, 4, 0);
    m.step();
    expect(mob.hp).toBe(114);
    const evs = m.world.drainEvents();
    expect(evs.find((e) => e.type === 'attack')).toMatchObject({ tower: g.id, target: mob.id, instant: true });
    expect(evs.find((e) => e.type === 'hit')).toMatchObject({ target: mob.id, source: g.id, damage: 6, p: 600, kill: false });
    expect(listProjectiles(m.world)).toHaveLength(0);
    m.stepN(39); // 0, 8, 16, 24, 32 → 5회
    expect(g.attacks).toBe(5);
    expect(mob.hp).toBe(120 - 30);
  });

  it('선두를 친다: 사거리 안 두 몹 중 앞선(먼저 나온) 쪽', () => {
    const { m, mob } = setup(3000);
    const back = addMob(m, 'slime');
    back.progress = 2700;
    back.speed = 0;
    placeTower(m.world, 'goblin', 0, 4, 0);
    m.step();
    expect(mob.hp).toBe(114);
    expect(back.hp).toBe(120);
  });

  it('사거리 밖이면 공격하지 않고, 타이머는 1회분에서 멈춘다', () => {
    const { m, mob } = setup(0); // (1500, 1500)
    const g = placeTower(m.world, 'goblin', 0, 6, 4); // 멀리
    m.stepN(100);
    expect(mob.hp).toBe(120);
    expect(g.attacks).toBe(0);
    expect(g.atkAcc).toBe(ATTACK_COST);
  });

  it('드러나지 않은 투명 몹은 때리지 않는다', () => {
    const { m, mob } = setup(3000, 'thief');
    const g = placeTower(m.world, 'goblin', 0, 4, 0);
    m.stepN(20);
    expect(mob.hp).toBe(mob.maxHp);
    expect(g.attacks).toBe(0);
  });
});

describe('투사체 (M2-5)', () => {
  it('stepToward: 600단위씩 가다가 남은 거리가 600 이하이면 도착', () => {
    expect(stepToward(0, 0, 1000, 0, 600)).toEqual({ x: 600, y: 0, arrived: false });
    expect(stepToward(600, 0, 1000, 0, 600)).toEqual({ x: 1000, y: 0, arrived: true });
    expect(stepToward(0, 0, 3000, 4000, 600)).toEqual({ x: 360, y: 480, arrived: false });
    expect(stepToward(0, 0, -3000, -4000, 600)).toEqual({ x: -360, y: -480, arrived: false });
  });

  it('궁수(물리 15, 사거리 3.5): 1칸 떨어진 몹 → 쏜 틱에 600 날고 다음 틱 도착해 피해', () => {
    const { m, mob } = setup(3000); // (4500, 1500)
    const a = placeTower(m.world, 'archer', 0, 4, 0); // (4500, 500), 거리 1000
    m.step();
    expect(mob.hp).toBe(120);
    const [p] = listProjectiles(m.world);
    expect(p).toMatchObject({ source: a.id, target: mob.id, x: 4500, y: 1100, dmgP: 1500, speed: 600 });
    m.step();
    expect(listProjectiles(m.world)).toHaveLength(0);
    expect(mob.hp).toBe(105);
  });

  it('먼 몹: 거리 √(3000² + 1000²) ≈ 3162 → 6틱째(틱 0~5)에 도착, 움직이는 몹을 따라간다', () => {
    const { m, mob } = setup(0); // (1500, 1500)
    placeTower(m.world, 'archer', 0, 4, 0);
    m.stepN(5);
    expect(mob.hp).toBe(120);
    m.step();
    expect(mob.hp).toBe(105);

    // 움직이는 몹 (1.5칸/초)도 초속 12칸 투사체가 따라잡는다
    const { m: m2, mob: mover } = setup(0);
    mover.speed = 1500;
    placeTower(m2.world, 'archer', 0, 4, 0);
    m2.stepN(8);
    expect(mover.hp).toBe(105);
  });

  it('헛발: 날아가는 중 대상이 사라지면 그 자리에서 사라지고 피해·보상 없음', () => {
    const { m, mob } = setup(0);
    placeTower(m.world, 'archer', 0, 4, 0);
    m.step();
    const [p] = listProjectiles(m.world);
    m.world.entities.remove(mob.id); // 다른 이유로 사라짐 (처치·출구)
    m.world.drainEvents();
    m.step();
    expect(listProjectiles(m.world).filter((x) => x.id === p!.id)).toHaveLength(0);
    const evs = m.world.drainEvents();
    expect(evs.find((e) => e.type === 'miss')).toMatchObject({ id: p!.id });
    expect(evs.filter((e) => e.type === 'hit')).toHaveLength(0);
    expect(m.state.gold).toBe(1000);
  });

  it('같은 몹을 노린 두 번째 화살은 앞 화살이 죽이면 헛발', () => {
    const { m, mob } = setup(0);
    mob.hp = 5;
    placeTower(m.world, 'archer', 0, 4, 0);
    placeTower(m.world, 'archer', 0, 3, 0);
    m.stepN(8);
    expect(m.mobCount()).toBe(0);
    const evs = m.world.drainEvents();
    expect(evs.filter((e) => e.type === 'kill')).toHaveLength(1);
    expect(evs.filter((e) => e.type === 'miss')).toHaveLength(1);
    expect(m.state.gold).toBe(1010);
    expect(m.state.kills).toBe(1);
  });
});

describe('처치·보상과 패배 판정 순서', () => {
  it('처치 → 몹 제거, 돈 + 보상, kill 사건 (위치 = 맞은 곳)', () => {
    const { m, mob } = setup(3000);
    mob.hp = 4;
    placeTower(m.world, 'goblin', 0, 4, 0);
    m.step();
    expect(m.mobCount()).toBe(0);
    expect(m.state.gold).toBe(1010);
    const kill = m.world.drainEvents().find((e) => e.type === 'kill');
    expect(kill).toMatchObject({ id: mob.id, reward: 10, ...positionAt(m.map.path, 3000) });
  });

  it('같은 틱에 몹 수가 한도를 넘어도 그 틱의 처치가 먼저 반영된다 (UI.md 9장)', () => {
    const run = (withTower: boolean): boolean => {
      const { m, mob } = setup(3000);
      m.state.mobLimit = 2;
      mob.hp = 1;
      for (let i = 0; i < 2; i++) addMob(m, 'slime').speed = 0;
      if (withTower) placeTower(m.world, 'goblin', 0, 4, 0);
      m.step();
      return m.defeated;
    };
    expect(run(false)).toBe(true); // 3마리 > 한도 2 → 패배
    expect(run(true)).toBe(false); // 처치 먼저 → 2마리 → 생존
  });

  it('패배한 판에서는 공격하지 않는다', () => {
    const { m, mob } = setup(3000);
    const g: Tower = placeTower(m.world, 'goblin', 0, 4, 0);
    m.state.phase = 'defeat';
    m.stepN(10);
    expect(g.attacks).toBe(0);
    expect(mob.hp).toBe(120);
  });
});
