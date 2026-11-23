/**
 * M3-9 기본 덱 25종 (unlock 'base') — 타워마다 1개 이상: 특색 15종 + 능력(광전사) + 스탯·형태·dot만으로 동작하는 타워 9종.
 * 시험장(tests/helpers arena): 순환의 정원, 진행도 3000 = 칸 (4, 1) 중심 (4500, 1500). 칸 (4, 2) 타워와 1칸.
 */
import { describe, expect, it } from 'vitest';
import { DECK_GRADES } from '../../src/data/deck';
import { rollMerge } from '../../src/sim/Deck';
import { Rng } from '../../src/sim/Rng';
import { abilityOf, abilityParams } from '../../src/sim/abilities';
import { berserkerMaxStacks } from '../../src/sim/abilities/berserker';
import { listPuddles } from '../../src/sim/entities/Puddle';
import { listSoldiers } from '../../src/sim/entities/Soldier';
import type { Mob } from '../../src/sim/entities/Mob';
import { positionAt } from '../../src/sim/map';
import { buildMatchRules } from '../../src/sim/rules';
import { NO_MODS, effectiveStats } from '../../src/sim/stats';
import { computeAuras, towerBonus } from '../../src/sim/systems/Aura';
import { detectAuras } from '../../src/sim/systems/Detection';
import { killMob } from '../../src/sim/systems/Kill';
import { isFrozen, isStopped } from '../../src/sim/systems/Status';
import { placeTower, rollSummon, summonRareChance } from '../../src/sim/systems/Summon';
import { arena, data, eventsOf, infinite, mobAt } from '../helpers/match';

const rules = buildMatchRules(data);

/** 체력을 크게 잡은 제자리 몹 */
function tank(m: ReturnType<typeof arena>, progress: number, hp = 1_000_000, mobId = 'slime'): Mob {
  const mob = mobAt(m, mobId, progress);
  mob.hp = hp;
  mob.maxHp = hp;
  return mob;
}

describe('기본 덱 = unlock base 25종', () => {
  it('decks.json base 25종이 모두 towers.json unlock = base', () => {
    const base = DECK_GRADES.flatMap((g) => data.decks.base[g]);
    expect(base).toHaveLength(25);
    for (const id of base) expect(data.towers.towers.find((t) => t.id === id)?.unlock, id).toBe('base');
  });
});

describe('노말', () => {
  it('★ 광부: 공격마다 확률로 +5원 — Lv1 1%, Lv15 20% (100번 공격에 대략 20번)', () => {
    expect(abilityParams(infinite(1).ctx, 0, abilityOf('miner')!)).toEqual({ chanceBp: 100, gold: 5 });
    const m = arena(3, { levels: [{ miner: 15 }] });
    tank(m, 3000);
    const miner = placeTower(m.world, 'miner', 0, 4, 2);
    const gold0 = m.state.gold;
    m.stepN(2000);
    // 공속 1회/초 × 100초 = 100번 + V3 P1 마일스톤 Lv9·Lv15 공속 +5%·+5% → 110번
    expect(miner.attacks).toBe(110);
    const gains = eventsOf(m, 'abilityGold');
    expect(gains.length).toBeGreaterThanOrEqual(8);
    expect(gains.length).toBeLessThanOrEqual(35);
    for (const g of gains) expect(g.amount).toBe(5);
    expect(m.state.gold - gold0).toBe(5 * gains.length);
  });

  it('고블린: 근접 단일 6 × 공속 2.5 → 20초(400틱)에 50번, 피해 300', () => {
    const m = arena();
    const mob = tank(m, 3000, 10_000);
    const g = placeTower(m.world, 'goblin', 0, 4, 2);
    m.stepN(400);
    expect(g.attacks).toBe(50);
    expect(10_000 - mob.hp).toBe(300);
  });

  it('궁수: 사거리 3.5 — 4칸 떨어진 몹은 못 맞히고 3칸 떨어진 몹을 쏜다', () => {
    const m = arena();
    const far = tank(m, 3000); // (4500, 1500) ↔ (4500, 5500) = 4000
    const near = tank(m, 10_000); // (7500, 5500) ↔ (4500, 5500) = 3000
    placeTower(m.world, 'archer', 0, 4, 5);
    m.stepN(10);
    expect(far.hp).toBe(1_000_000);
    expect(near.hp).toBeLessThan(1_000_000);
  });

  it('견습 마법사: 광역 r0.8 — 대상과 0.5칸 옆 몹은 맞고 1칸 옆 몹은 안 맞는다', () => {
    const m = arena();
    const a = tank(m, 3000);
    const b = tank(m, 3500);
    const c = tank(m, 4000);
    placeTower(m.world, 'apprentice', 0, 4, 2);
    m.stepN(3);
    expect([a.hp < 1_000_000, b.hp < 1_000_000, c.hp < 1_000_000]).toEqual([true, true, false]);
  });

  it('전사: 방어 관통 10% — 공격력 27 vs 방어 100 → A = 90 → 첫 타 14 (나머지 이어 감)', () => {
    expect(rules.towers.get('warrior')?.armorPenBp).toBe(1000);
    const m = arena();
    const mob = tank(m, 3000, 1000);
    mob.armor = 100;
    placeTower(m.world, 'warrior', 0, 4, 2);
    m.step();
    expect(1000 - mob.hp).toBe(14);
  });
});

describe('레어', () => {
  it('★ 상인: 사거리 안에서 처치된 몹 1마리당 +1원 (누가 잡아도), 사거리 밖은 0, 상인 2개면 각자', () => {
    const m = arena();
    const merchant = placeTower(m.world, 'merchant', 0, 4, 2);
    const inside = mobAt(m, 'slime', 3000);
    const outside = mobAt(m, 'slime', 15_000);
    const g0 = m.state.gold;
    const pIn = positionAt(m.map.path, inside.progress);
    killMob(m.ctx, m.world, inside, pIn.x, pIn.y);
    expect(m.state.gold - g0).toBe(inside.reward + 1);
    const pOut = positionAt(m.map.path, outside.progress);
    killMob(m.ctx, m.world, outside, pOut.x, pOut.y);
    expect(m.state.gold - g0).toBe(inside.reward + 1 + outside.reward);
    placeTower(m.world, 'merchant', 0, 3, 2);
    const third = mobAt(m, 'slime', 3000);
    const g1 = m.state.gold;
    killMob(m.ctx, m.world, third, pIn.x, pIn.y);
    expect(m.state.gold - g1).toBe(third.reward + 2);
    expect(merchant.tower).toBe('merchant');
  });

  it('★ 진흙 주술사: 8초마다 사거리 안 선두 자리에 웅덩이 (둔화 50%, 3초) → 안에 있는 몹은 둔화 50%, 3초 뒤 사라짐', () => {
    const m = arena();
    const mob = tank(m, 3000);
    placeTower(m.world, 'mudshaman', 0, 4, 2);
    m.stepN(160);
    expect(listPuddles(m.world)).toHaveLength(0);
    m.step(); // 놓인 틱 + 160
    const [puddle] = listPuddles(m.world);
    expect(puddle).toMatchObject({ x: 4500, y: 1500, r: 750, slowBp: 5000 });
    expect(mob.slowBp).toBe(5000); // 맞은 몹 둔화 25%보다 강한 웅덩이 50%만
    m.stepN(60);
    expect(listPuddles(m.world)).toHaveLength(0);
    m.stepN(41); // 웅덩이 둔화가 풀리고 맞은 몹 둔화(25%, 2초)만 남는다
    expect(mob.slowBp).toBe(2500);
  });

  it('진흙 주술사: 사거리 안에 몹이 없으면 웅덩이를 만들지 않고 기다린다 (몹이 오면 바로)', () => {
    const m = arena();
    placeTower(m.world, 'mudshaman', 0, 4, 2);
    m.stepN(300);
    expect(listPuddles(m.world)).toHaveLength(0);
    tank(m, 3000);
    m.step();
    expect(listPuddles(m.world)).toHaveLength(1);
  });

  it('화염 마법사: 광역 r1 + 화상 (towers.json dot) — 화상 피해는 고정이라 방어가 높아도 들어간다', () => {
    const m = arena();
    const mob = tank(m, 3000, 100_000);
    mob.magicRes = 1000;
    placeTower(m.world, 'flamemage', 0, 4, 2);
    m.stepN(3);
    expect(mob.dots).toHaveLength(1);
    m.world.drainEvents();
    m.stepN(20);
    const dot = eventsOf(m, 'hit').filter((e) => e.dot === true);
    expect(dot.reduce((a, e) => a + Number(e.damage), 0)).toBeGreaterThanOrEqual(3);
  });

  it('광역딜 전사: 근접 광역 r1.2 — 타워 중심 1.2칸 안 몹 둘은 맞고 1.28칸 몹은 안 맞는다', () => {
    const m = arena();
    const a = tank(m, 3000); // 1000
    const b = tank(m, 2500); // √(500² + 1000²) = 1118
    const c = tank(m, 3800); // √(800² + 1000²) = 1280
    placeTower(m.world, 'cleaver', 0, 4, 2);
    m.step();
    expect([a.hp < 1_000_000, b.hp < 1_000_000, c.hp < 1_000_000]).toEqual([true, true, false]);
  });

  it('단일딜 전사: 치명타 20% ×2·방어 관통 30% — 200번 공격에 치명타 약 20%', () => {
    expect(rules.towers.get('duelist')).toMatchObject({ critBp: 2000, critMulBp: 20_000, armorPenBp: 3000 });
    const m = arena(5);
    tank(m, 3000);
    const d = placeTower(m.world, 'duelist', 0, 4, 2);
    m.stepN(5714);
    const hits = eventsOf(m, 'hit').filter((e) => e.source === d.id);
    expect(hits.length).toBe(200);
    const crits = hits.filter((e) => e.crit === true).length;
    expect(crits).toBeGreaterThan(25);
    expect(crits).toBeLessThan(60);
  });
});

describe('유니크', () => {
  it('★ 얼음 마법사: 빙결 0.5초(10틱), 같은 몹은 3초(60틱)에 1번', () => {
    const m = arena();
    const mob = tank(m, 3000);
    placeTower(m.world, 'icemage', 0, 4, 2);
    const freezes: number[] = [];
    let was = false;
    for (let i = 0; i < 400; i++) {
      m.step();
      const now = isFrozen(mob, m.tick);
      if (now && !was) freezes.push(m.tick);
      was = now;
    }
    expect(freezes.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < freezes.length; i++) expect(freezes[i]! - freezes[i - 1]!).toBeGreaterThanOrEqual(60);
    expect(mob.freezeUntil - mob.ccEnd).toBeLessThanOrEqual(0);
  });

  it('★ 도박꾼: 공격마다 주사위 1~6 → 피해 = 공격력 × 눈 ÷ 3.5 (평균 공격력 그대로)', () => {
    const m = arena(9);
    const mob = tank(m, 3000, 10_000_000);
    const g = placeTower(m.world, 'gambler', 0, 4, 2);
    m.stepN(6000);
    const dice = eventsOf(m, 'dice').filter((e) => e.tower === g.id);
    expect(dice.length).toBe(300);
    expect(new Set(dice.map((e) => e.value))).toEqual(new Set([1, 2, 3, 4, 5, 6]));
    // 58.5 + 58.5 = 117 × Σ(2·눈/7) — 투사체 도착 전 마지막 한두 발은 빼고 비교
    const expected = dice.reduce((a, e) => a + (117 * 2 * Number(e.value)) / 7, 0);
    expect(10_000_000 - mob.hp).toBeGreaterThan(expected - 200);
    expect(10_000_000 - mob.hp).toBeLessThanOrEqual(expected);
  });

  it('★ 대장장이: 주변 8칸 공격력 +10% (Lv1) → +25% (Lv15)', () => {
    const m15 = infinite(1, { levels: [{ blacksmith: 15 }] });
    expect(abilityParams(m15.ctx, 0, abilityOf('blacksmith')!)).toEqual({ atkBp: 2500, area: 'around8' });
    const m = infinite(1);
    placeTower(m.world, 'blacksmith', 0, 4, 4);
    const t = placeTower(m.world, 'sniper', 0, 3, 3);
    expect(computeAuras(m.ctx, m.world).get(t.id)?.atkPctBp).toBe(1000);
  });

  it('저격수: 최대 체력 우선 · 치명타 30% ×3 · 방어 관통 40% · 감지(자신)', () => {
    expect(rules.towers.get('sniper')).toMatchObject({ target: 'maxhp', critBp: 3000, critMulBp: 30_000, armorPenBp: 4000, detect: 'self' });
    const m = arena();
    const small = tank(m, 3000, 5000);
    const big = tank(m, 3500, 900_000);
    placeTower(m.world, 'sniper', 0, 4, 2);
    m.stepN(3);
    expect(small.hp).toBe(5000);
    expect(big.hp).toBeLessThan(900_000);
  });

  it('광전사: 같은 대상을 이어 칠 때마다 공속 +10%, 최대 +50% (1.2 → 1.8회/초), 대상이 바뀌면 처음부터', () => {
    const p = abilityParams(infinite(1).ctx, 0, abilityOf('berserker')!);
    expect(berserkerMaxStacks(p)).toBe(5);
    const m = arena();
    const first = tank(m, 3000);
    const b = placeTower(m.world, 'berserker', 0, 4, 2);
    m.stepN(200);
    expect(b.stacks).toBe(5);
    const bonus = towerBonus(m.ctx, b, computeAuras(m.ctx, m.world));
    expect(bonus.apsPctBp).toBe(5000);
    expect(effectiveStats(rules, rules.towers.get('berserker')!, NO_MODS, bonus).apsMilli).toBe(1800);
    // 대상이 죽고 다른 몹으로 바뀌면 0부터
    m.world.entities.remove(first.id);
    tank(m, 2800);
    m.stepN(20);
    expect(b.stacks).toBeLessThan(5);
  });
});

describe('히어로', () => {
  it('★ 소환사: 5초마다 병사 — 가장 가까운 경로 지점에서 경로를 거슬러 걷고(진행도 감소) 닿은 몹을 한 번씩 공격', () => {
    const m = arena();
    const a = tank(m, 3000);
    const b = tank(m, 1500);
    placeTower(m.world, 'summoner', 0, 4, 2);
    m.stepN(100);
    expect(listSoldiers(m.world)).toHaveLength(0);
    m.step();
    const [s] = listSoldiers(m.world);
    expect(s).toBeDefined();
    expect(s!.progress).toBeLessThanOrEqual(3000);
    expect(s!.dmgM).toBe(30_000); // 375 × 0.8 (× ATK_SCALE)
    const p0 = s!.progress;
    m.stepN(30);
    expect(s!.progress).toBeLessThan(p0);
    const hits = eventsOf(m, 'soldierHit').map((e) => e.target);
    expect(hits).toEqual([a.id, b.id]);
  });

  it('소환사: 병사는 몹 3마리를 치면 사라지고, 아니면 6초 뒤 사라진다', () => {
    const m = arena();
    for (const p of [3000, 2600, 2200, 1800]) tank(m, p);
    placeTower(m.world, 'summoner', 0, 4, 2);
    m.stepN(101);
    m.world.drainEvents();
    m.stepN(40);
    expect(eventsOf(m, 'soldierEnd')).toEqual([expect.objectContaining({ reason: 'hits' })]);
    const m2 = arena();
    tank(m2, 3000);
    placeTower(m2.world, 'summoner', 0, 4, 2);
    m2.stepN(101);
    m2.world.drainEvents();
    m2.stepN(121);
    expect(eventsOf(m2, 'soldierEnd').map((e) => e.reason)).toContain('life');
  });

  it('★ 학자: 전체 타워 공격력 +20% (자신 포함)', () => {
    const m = infinite(1);
    const s = placeTower(m.world, 'scholar', 0, 0, 0);
    const far = placeTower(m.world, 'archer', 0, 8, 10);
    const auras = computeAuras(m.ctx, m.world);
    expect([auras.get(s.id)?.atkPctBp, auras.get(far.id)?.atkPctBp]).toEqual([2000, 2000]);
  });

  it('★ 시간술사: 15초마다 맵 위 모든 몹 정지 1초 (보스 30% = 6틱)', () => {
    const m = arena();
    const a = tank(m, 3000);
    const boss = tank(m, 20_000);
    boss.boss = true;
    placeTower(m.world, 'chronomancer', 0, 0, 10);
    m.stepN(300);
    expect(isStopped(a, m.tick)).toBe(false);
    const t = m.tick;
    m.step();
    expect(a.stopUntil).toBe(t + 1 + 20);
    expect(boss.stopUntil).toBe(t + 1 + 6);
    expect(eventsOf(m, 'timeStop')).toHaveLength(1);
  });

  it('★ 연금술사: 10초마다 +20원 (몹이 없어도), 맞은 몹 방어·마저 −15% (3초)', () => {
    const m = arena();
    placeTower(m.world, 'alchemist', 0, 0, 10);
    const g0 = m.state.gold;
    m.stepN(201);
    expect(m.state.gold - g0).toBe(20);
    m.stepN(200);
    expect(m.state.gold - g0).toBe(40);
    const m2 = arena();
    const mob = tank(m2, 3000);
    placeTower(m2.world, 'alchemist', 0, 4, 2);
    m2.stepN(3);
    expect(mob.markBp).toBe(1500);
    expect(mob.marks[0]?.src).toBe('alchemist');
  });

  it('검성: 근접 광역 r1.5 · 방어 관통 30%', () => {
    expect(rules.towers.get('swordsaint')).toMatchObject({ shape: 'melee_aoe', radius: 1500, armorPenBp: 3000 });
    const m = arena();
    const a = tank(m, 3000);
    const b = tank(m, 3900); // √(900² + 1000²) = 1345 ≤ 1500
    placeTower(m.world, 'swordsaint', 0, 4, 2);
    m.step();
    expect([a.hp < 1_000_000, b.hp < 1_000_000]).toEqual([true, true]);
  });
});

describe('레전드', () => {
  it('★ 용 소환사: 브레스(광역 r1.5)에 맞은 몹 모두 받는 피해 +10% (5초)', () => {
    const m = arena();
    const a = tank(m, 3000);
    const b = tank(m, 3800);
    placeTower(m.world, 'dragoncaller', 0, 4, 2);
    m.stepN(3);
    expect([a.vulnBp, b.vulnBp]).toEqual([1000, 1000]);
    expect(a.vulns[0]?.until).toBeGreaterThan(m.tick + 90);
  });

  it('★ 전쟁 군주: 전체 공속 +15% (자신 포함 — 0.8 → 0.92회/초)', () => {
    const m = infinite(1);
    const w = placeTower(m.world, 'warlord', 0, 4, 4);
    const eff = effectiveStats(rules, rules.towers.get('warlord')!, NO_MODS, towerBonus(m.ctx, w, computeAuras(m.ctx, m.world)));
    expect(eff.apsMilli).toBe(920);
  });

  it('★ 대마법사: 12초마다 운석 — 드러난 모든 몹에 현재 체력 8% (보스 2%, 최소 1), 고정 피해', () => {
    const m = arena();
    const a = tank(m, 3000, 10_000);
    a.magicRes = 500;
    const boss = tank(m, 20_000, 10_000);
    boss.boss = true;
    const tiny = tank(m, 10_000, 5);
    const thief = tank(m, 12_000, 10_000, 'thief');
    placeTower(m.world, 'archmage', 0, 8, 0); // 몹들과 멀리 (사거리 3.5 밖 — 자기 공격은 안 닿게)
    m.stepN(241);
    expect(eventsOf(m, 'meteor')).toHaveLength(1);
    expect([a.hp, boss.hp, tiny.hp, thief.hp]).toEqual([9200, 9800, 4, 10_000]);
  });

  it('대마법사: 운석 피해의 hit 사건에만 fx = meteor (자기 투사체 피해에는 없음 — 화면이 운석 자리만 고르게, 검토 반영)', () => {
    const m = arena();
    tank(m, 3000, 100_000_000); // 사거리 안: 투사체도 맞는다
    const tower = placeTower(m.world, 'archmage', 0, 4, 2);
    m.stepN(260);
    const hits = eventsOf(m, 'hit').filter((e) => e.source === tower.id);
    const meteorHits = hits.filter((e) => e.fx === 'meteor');
    expect(meteorHits).toHaveLength(1);
    expect(hits.length).toBeGreaterThan(meteorHits.length); // 일반 공격 피해는 fx 없음
    for (const e of hits.filter((h) => h.fx !== 'meteor')) expect(e.fx).toBeUndefined();
  });

  it('대마법사: 운석은 전체 피해라 방패병 보호막에 2배로 들어간다 (ENEMIES.md 6장, 검토 반영 — 예전엔 1배)', () => {
    const m = arena();
    const s = tank(m, 3000, 1_000_000, 'shield');
    s.shield = s.maxShield = 300_000;
    placeTower(m.world, 'archmage', 0, 8, 0); // 사거리 밖: 운석만 맞는다
    m.stepN(241);
    const evs = m.world.drainEvents();
    expect(evs.filter((e) => e.type === 'meteor')).toHaveLength(1);
    const hit = evs.find((e) => e.type === 'hit' && e.fx === 'meteor')!;
    expect(Number(hit.damage)).toBe(80_000); // 현재 체력 8%
    expect(Number(hit.shield)).toBe(80_000); // 피해 단위로는 전부 보호막이 막음
    expect(300_000 - s.shield).toBe(160_000); // 보호막은 ×2
    expect(s.hp).toBe(1_000_000);
  });

  it('★ 그림자 암살자: 보스 피해 ×2, 체력 5% 이하 일반 몹 즉사 (보스는 아님), 감지 오라 r3', () => {
    const m = arena();
    const boss = tank(m, 3000, 100_000);
    boss.boss = true;
    placeTower(m.world, 'assassin', 0, 4, 2);
    m.stepN(3);
    expect(100_000 - boss.hp).toBe(4500); // 2250 × 2 (방어 0)
    // 일반 몹: 2250을 맞고 100 남음 (≤ 5% = 5000) → 즉사
    const m2 = arena();
    const mob = tank(m2, 3000, 100_000);
    mob.hp = 2350;
    placeTower(m2.world, 'assassin', 0, 4, 2);
    m2.stepN(3);
    expect(m2.world.entities.has(mob.id)).toBe(false);
    expect(eventsOf(m2, 'execute')).toHaveLength(1);
    // 같은 체력의 보스는 즉사하지 않는다
    const m3 = arena();
    const b3 = tank(m3, 3000, 100_000);
    b3.boss = true;
    b3.hp = 4600;
    const a3 = placeTower(m3.world, 'assassin', 0, 4, 2);
    m3.stepN(3);
    expect(b3.hp).toBe(100);
    expect(detectAuras(m3.ctx, m3.world)).toEqual([{ tower: a3.id, owner: 0, x: 4500, y: 2500, r: 3000 }]);
  });

  it('★ 행운의 여신: 소환 레어 직행 3%(Lv1) → 10%(Lv15), 2개여도 한 번만, 없으면 0', () => {
    const m = infinite(1);
    expect(summonRareChance(m.ctx, m.world, 0)).toBe(0);
    placeTower(m.world, 'fortuna', 0, 4, 4);
    placeTower(m.world, 'fortuna', 0, 4, 5);
    expect(summonRareChance(m.ctx, m.world, 0)).toBe(300);
    const rng = new Rng(11);
    let rare = 0;
    for (let i = 0; i < 20_000; i++) if (rollSummon(rng, rules, rules.baseDeck, 1000).rare) rare++;
    expect(rare / 20_000).toBeGreaterThan(0.09);
    expect(rare / 20_000).toBeLessThan(0.11);
    const r = rollSummon(new Rng(1), rules, rules.baseDeck, 10_000);
    expect(r.rare && rules.baseDeck.rare.includes(r.tower)).toBe(true);
  });

  it('★ 행운의 여신: 승급 2등급 상승 (노말 → 유니크), 히어로 승급은 레전드가 끝이라 해당 없음, 판 위에서 소환 사건에 rare 표시', () => {
    const up = rollMerge(new Rng(2), rules, rules.baseDeck, 'normal', 10_000);
    expect(up.double).toBe(true);
    expect(rules.baseDeck.unique).toContain(up.tower);
    const hero = rollMerge(new Rng(2), rules, rules.baseDeck, 'hero', 10_000);
    expect(hero.double).toBe(false);
    expect(rules.baseDeck.legend).toContain(hero.tower);
    // 판에서: Lv15 여신이 있으면 소환 사건 중 약 10%가 rare
    const m = infinite(4, { levels: [{ fortuna: 15 }] });
    placeTower(m.world, 'fortuna', 0, 0, 0);
    let rare = 0;
    let total = 0;
    for (let i = 0; i < 40; i++) {
      for (const [x, y] of m.map.buildable.slice(1, 61)) m.world.enqueue({ type: 'summon', x, y });
      m.state.gold = 1_000_000;
      m.step();
      for (const e of eventsOf(m, 'summon')) {
        total++;
        if (e.rare === true) rare++;
      }
      for (const t of m.towers()) if (t.tower !== 'fortuna') m.world.entities.remove(t.id);
    }
    expect(total).toBe(2400);
    expect(rare).toBeGreaterThan(160);
    expect(rare).toBeLessThan(330);
  });
});
