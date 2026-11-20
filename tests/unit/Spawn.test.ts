/**
 * M1-4 몹 등장: 구성표 20칸을 세계 난수로 섞기, 2.5초 간격, 1단계 = 슬라임 20마리 50초 동안,
 * 고블린 떼 1칸 = 3마리, 치유사 가운데(8~12번째)·투명 몹 뒤쪽(15번째~), 몹 스탯 적용.
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/sim/Rng';
import { buildMatchRules, compositionFor, stageArmor, type MatchRules } from '../../src/sim/rules';
import { arrangeSlots, spawnSlot, stageSlots } from '../../src/sim/systems/Spawn';
import { listMobs } from '../../src/sim/entities/Mob';
import { addMob, campaign, data, infinite, jumpToStage, runToStage } from '../helpers/match';

const rules: MatchRules = buildMatchRules(data);

function count(ids: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of ids) out[id] = (out[id] ?? 0) + 1;
  return out;
}

describe('구성표 (ENEMIES.md 3.2)', () => {
  it('모든 구성 줄의 칸 수 합계는 20', () => {
    for (const band of rules.composition) expect(band.mix.reduce((a, [, n]) => a + n, 0)).toBe(20);
  });

  it('단계 → 구성 줄: 1~5 슬라임 20, 6단계 슬라임 16·박쥐 4, 100단계 이후 마지막 줄', () => {
    expect(count(stageSlots(rules, 1))).toEqual({ slime: 20 });
    expect(count(stageSlots(rules, 5))).toEqual({ slime: 20 });
    expect(count(stageSlots(rules, 6))).toEqual({ slime: 16, bat: 4 });
    expect(count(stageSlots(rules, 45))).toEqual({ bat: 2, golem: 2, turtle: 2, ghost: 2, splitter: 2, thief: 3, healer: 2, goblin: 3, gemgolem: 2 });
    expect(compositionFor(rules, 150)?.from).toBe(100);
    expect(stageSlots(rules, 0)).toEqual([]);
  });

  it('1~500단계 모두 구성이 있다 (빈 단계 없음)', () => {
    for (let s = 1; s <= 500; s++) expect(stageSlots(rules, s)).toHaveLength(20);
  });
});

describe('등장 순서 섞기', () => {
  it('같은 난수 → 같은 순서, 다른 시드 → 대체로 다른 순서', () => {
    const slots = stageSlots(rules, 25);
    const a = arrangeSlots(slots, rules, new Rng(7));
    const b = arrangeSlots(slots, rules, new Rng(7));
    const c = arrangeSlots(slots, rules, new Rng(8));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(count(a)).toEqual(count(slots)); // 섞어도 구성은 그대로
  });

  it('치유사는 무리 가운데(8~12번째), 투명 몹은 뒤쪽(15번째 이후) — 시드 300개', () => {
    for (const stage of [45, 55, 70, 100, 200]) {
      const slots = stageSlots(rules, stage);
      for (let seed = 0; seed < 60; seed++) {
        const order = arrangeSlots(slots, rules, new Rng(seed * 31 + stage));
        order.forEach((id, i) => {
          const n = i + 1;
          if (id === 'healer') expect(n >= 8 && n <= 12, `${stage}단계 치유사 ${n}번째`).toBe(true);
          if (id === 'thief' || id === 'shadowwolf') expect(n >= 15, `${stage}단계 투명 ${n}번째`).toBe(true);
        });
      }
    }
  });

  it('투명 몹이 뒤쪽 6칸보다 많으면(그림자 습격 편대 12칸) 14번째, 13번째 … 앞으로 넓힌다', () => {
    const raid = data.enemies.formations.find((f) => f.id === 'shadowraid')!;
    const slots = rules.mobOrder.flatMap((id) => Array.from({ length: raid.mix[id] ?? 0 }, () => id));
    expect(slots).toHaveLength(20);
    const order = arrangeSlots(slots, rules, new Rng(5));
    const invisibleAt = order.map((id, i) => (id === 'thief' || id === 'shadowwolf' ? i + 1 : 0)).filter(Boolean);
    expect(invisibleAt).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(count(order)).toEqual(count(slots));
  });

  it('치유사가 가운데 5칸보다 많아도 가운데에서 가까운 칸부터 채운다', () => {
    const slots = [...Array(7).fill('healer'), ...Array(13).fill('slime')] as string[];
    const order = arrangeSlots(slots, rules, new Rng(1));
    const healerAt = order.map((id, i) => (id === 'healer' ? i + 1 : 0)).filter(Boolean);
    expect(healerAt).toEqual([7, 8, 9, 10, 11, 12, 13]);
  });

  it('섞기는 고르게: 1단계가 아닌 25단계에서 첫 칸 몹 종류가 여러 가지로 나온다', () => {
    const slots = stageSlots(rules, 25);
    const first = new Set<string>();
    for (let seed = 0; seed < 200; seed++) first.add(arrangeSlots(slots, rules, new Rng(seed))[0]!);
    expect([...first].sort()).toEqual(['bat', 'ghost', 'golem', 'slime', 'turtle']);
  });
});

describe('등장 시간 (DEV_PLAN M1-4 완료 조건)', () => {
  it('1단계: 60초 준비 뒤 슬라임 20마리가 2.5초(50틱) 간격으로 50초 동안', () => {
    const match = infinite(11);
    const spawnTicks: number[] = [];
    for (let t = 0; t < 2400; t++) {
      const before = match.state.spawned;
      match.step();
      if (match.state.spawned > before) spawnTicks.push(t);
    }
    expect(spawnTicks).toHaveLength(20);
    expect(spawnTicks[0]).toBe(1200); // 0단계 60초 준비
    expect(spawnTicks[19]).toBe(1200 + 19 * 50);
    for (let i = 1; i < 20; i++) expect(spawnTicks[i]! - spawnTicks[i - 1]!).toBe(50);
    // 첫 등장부터 마지막 등장 + 간격 = 50초
    expect((spawnTicks[19]! + 50 - spawnTicks[0]!) / 20).toBe(50);
    expect(listMobs(match.world).every((m) => m.mob === 'slime')).toBe(true);
    expect(match.mobCount()).toBe(20);
  });

  it('보스 단계(10단계)에는 일반 몹이 나오지 않는다 (보스 1마리 + 패턴 소환 몹만)', () => {
    const match = infinite(12);
    jumpToStage(match, 10);
    expect(match.state.stage).toBe(10);
    expect(match.state.bossStage).toBe(true);
    expect(listMobs(match.world).map((m) => m.mob)).toEqual(['batqueen']);
    match.world.drainEvents();
    match.stepN(1100);
    const events = match.world.drainEvents();
    expect(events.filter((e) => e.type === 'spawn')).toHaveLength(0);
    expect(match.state.stage).toBe(10);
    // 보스 말고는 박쥐 여왕이 부른 박쥐뿐
    const others = listMobs(match.world).filter((m) => !m.boss);
    expect(others.length).toBeGreaterThan(0);
    expect(others.every((m) => m.mob === 'bat')).toBe(true);
  });

  it('앞 단계 몹이 남아 있어도 다음 단계 몹은 예정대로 나온다', () => {
    const match = infinite(13);
    runToStage(match, 3);
    match.stepN(1000);
    expect(match.mobCount()).toBe(60);
  });

  it('등장 순서는 세계 난수 흐름만 쓴다: 같은 시드 = 같은 순서, 소환 흐름은 그대로', () => {
    const a = infinite(21);
    const b = infinite(21);
    runToStage(a, 7);
    runToStage(b, 7);
    expect(a.state.spawnQueue).toEqual(b.state.spawnQueue);
    // 소환 흐름은 쓰지 않았다 = 새로 만든 같은 시드 판과 같은 상태
    expect(a.world.rng('p0.summon').snapshot()).toEqual(infinite(21).world.rng('p0.summon').snapshot());
    expect(a.world.rng('world').snapshot()).not.toEqual(infinite(21).world.rng('world').snapshot());
    expect(a.hash()).toBe(b.hash());
  });
});

describe('몹 스탯 적용', () => {
  it('슬라임 1단계: 체력 120, 방어 0, 속도 1500, 보상 5원 (V2 사용자 결정 D 5 + ⌊s/4⌋)', () => {
    const match = infinite(1);
    runToStage(match, 1);
    const mob = listMobs(match.world)[0]!;
    expect(mob).toMatchObject({ mob: 'slime', stage: 1, hp: 120, maxHp: 120, armor: 0, magicRes: 0, speed: 1500, reward: 5, lifeDamage: 1, legion: 'plague', invisible: false });
  });

  it('체력 배율·방어 성장·보상 배율: 30단계 암흑 골렘 = 3748 × 2, 방어 96, 보상 12원', () => {
    const match = infinite(1);
    match.state.stage = 30;
    const golem = addMob(match, 'golem');
    expect(golem.hp).toBe(3748 * 2);
    expect(golem.armor).toBe(96);
    expect(golem.magicRes).toBe(0);
    expect(golem.speed).toBe(1200);
    expect(golem.ccResistBp).toBe(2000);
    expect(golem.reward).toBe(12);
  });

  it('곱한 뒤 내림: 41단계 박쥐 체력 8740 × 0.6 = 5244, 마저 15 × 1.82 = 27.3 → 27', () => {
    const match = infinite(1);
    match.state.stage = 41;
    const bat = addMob(match, 'bat');
    expect(bat.hp).toBe(5244);
    expect(bat.magicRes).toBe(27);
    expect(bat.magicRes).toBe(stageArmor(rules, 15, 41));
  });

  it('투명 도둑은 invisible, 보상 ×2', () => {
    const match = infinite(1);
    match.state.stage = 35;
    const thief = addMob(match, 'thief');
    expect(thief.invisible).toBe(true);
    expect(thief.reward).toBe(26);
  });

  it('캠페인 테마 보정: 테마 1은 ×1 (+0)', () => {
    const match = campaign(1);
    match.state.stage = 15;
    const golem = addMob(match, 'golem');
    expect(golem.hp).toBe(859 * 2);
    expect(golem.armor).toBe(78);
  });
});

describe('암흑 고블린 떼 (1칸 = 3마리)', () => {
  it('한 칸에서 같은 틱에 3마리, 몹 수는 마리마다 1, 떼 안 순번 0·1·2', () => {
    const match = infinite(1);
    match.state.stage = 40;
    const mobs = spawnSlot(match.ctx, match.world, 'goblin');
    expect(mobs).toHaveLength(3);
    expect(mobs.map((m) => m.swarmIndex)).toEqual([0, 1, 2]);
    expect(mobs.every((m) => m.progress === 0)).toBe(true);
    expect(match.mobCount()).toBe(3);
    // 체력 ×0.35, 보상 ×0.4 내림: 40단계 HP 8093 → 2832, 보상 15 × 0.4 = 6
    expect(mobs[0]).toMatchObject({ hp: 2832, reward: 6, speed: 2600 });
    const ev = match.world.drainEvents().find((e) => e.type === 'spawn');
    expect(ev).toMatchObject({ mob: 'goblin', count: 3 });
  });

  it('46단계 한 단계: 20칸 = 고블린 3칸 × 3 + 17 = 26마리 (45단계는 편대 단계라 46단계로)', () => {
    const match = infinite(5);
    jumpToStage(match, 46);
    match.stepN(1000);
    expect(match.state.stage).toBe(46);
    expect(match.mobCount()).toBe(26);
    expect(listMobs(match.world).filter((m) => m.mob === 'goblin')).toHaveLength(9);
  });
});
