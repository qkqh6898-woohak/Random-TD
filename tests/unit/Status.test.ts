/**
 * M3-6 상태 이상·원소 (GDD 5.5 표 전부 + DEV_PLAN M3 예시 표의 둔화·보스 둔화·기절 면역 행 + 원소 5종).
 * 규칙 함수는 틱을 직접 넣어 확인하고, 이동·지속 피해·원소는 판을 실제로 돌려 확인한다.
 * 걸린 틱 T의 효과는 이동에는 T+1틱부터 (전투가 이동 뒤라서) → 판 밖에서 직접 걸 때는 tick = 지금 − 1 로 건다.
 */
import { describe, expect, it } from 'vitest';
import { buildMatchRules } from '../../src/sim/rules';
import { damageAgainst } from '../../src/sim/systems/Damage';
import {
  applyDot,
  applyHardCc,
  applyMark,
  applyReturn,
  applySlow,
  applyVuln,
  ccDuration,
  dotStacks,
  isCcImmune,
  isDisabled,
  isFrozen,
  isStopped,
  isStunned,
  refreshStatus,
  slowStrength,
} from '../../src/sim/systems/Status';
import { placeTower } from '../../src/sim/systems/Summon';
import { arena, data, eventsOf, mobAt } from '../helpers/match';

const rules = buildMatchRules(data);
const S = rules.status;

describe('데이터 → 정수 규칙 (game.json status)', () => {
  it('둔화 최대 70% · 보스 둔화 절반 · 보스 지속 30% · 면역 1초 · 빙결 +10% · 지속 피해 0.5초 간격', () => {
    expect(S).toEqual({ slowMaxBp: 7000, bossSlowMulBp: 5000, bossCcDurMulBp: 3000, ccImmuneTicks: 20, freezeVulnBp: 1000, dotIntervalTicks: 10 });
  });

  it('화상·독·출혈은 towers.json dot → 초당 비율 bp·지속 틱·최대 중첩', () => {
    expect(rules.towers.get('flamemage')?.dot).toEqual({ kind: 'burn', perSecBp: 3000, durTicks: 60, stacks: 1 });
    expect(rules.towers.get('poisonarcher')?.dot).toEqual({ kind: 'poison', perSecBp: 5000, durTicks: 100, stacks: 5 });
    expect(rules.towers.get('k9')?.dot).toEqual({ kind: 'bleed', perSecBp: 5000, durTicks: 40, stacks: 1 });
    expect(rules.towers.get('archer')?.dot).toBeNull();
  });
});

describe('둔화 — 가장 강한 것만, 최대 70%, 보스 절반', () => {
  it('둔화 30% + 둔화 45% → 45%만 적용 (DEV_PLAN 예시), 45%가 먼저 풀리면 30%가 남는다', () => {
    const m = arena();
    const mob = mobAt(m, 'slime', 3000);
    applySlow(S, mob, 100, 'a', 3000, 40); // until 141
    applySlow(S, mob, 100, 'b', 4500, 20); // until 121
    expect(mob.slowBp).toBe(4500);
    refreshStatus(S, mob, 121);
    expect(mob.slowBp).toBe(3000);
    refreshStatus(S, mob, 141);
    expect(mob.slowBp).toBe(0);
    expect(mob.slows).toEqual([]);
  });

  it('최대 70%: 둔화 80%는 70%', () => {
    expect(slowStrength(S, { boss: false, ccResistBp: 0 }, 8000)).toBe(7000);
    expect(slowStrength(S, { boss: false, ccResistBp: 0 }, 7000)).toBe(7000);
  });

  it('보스에 둔화 60% → 30% (절반, DEV_PLAN 예시), 둔화 90% → 35% (최대 70%의 절반)', () => {
    expect(slowStrength(S, { boss: true, ccResistBp: 0 }, 6000)).toBe(3000);
    expect(slowStrength(S, { boss: true, ccResistBp: 0 }, 9000)).toBe(3500);
  });

  it('상태이상 저항 (보스 아닌 몹): 암흑 골렘 20% → 둔화 50%가 40%, 방패병 30% → 35%', () => {
    expect(rules.mobs.get('golem')?.ccResistBp).toBe(2000);
    expect(slowStrength(S, { boss: false, ccResistBp: 2000 }, 5000)).toBe(4000);
    expect(slowStrength(S, { boss: false, ccResistBp: 3000 }, 5000)).toBe(3500);
  });

  it('보스는 상태이상 저항(데이터 70%)을 겹쳐 곱하지 않는다 — 보스 규칙(절반)만', () => {
    expect(slowStrength(S, { boss: true, ccResistBp: 7000 }, 6000)).toBe(3000);
  });

  it('같은 출처는 중첩 없이 갱신 (더 늦게 풀리는 쪽)', () => {
    const m = arena();
    const mob = mobAt(m, 'slime', 3000);
    applySlow(S, mob, 100, 'mud', 2500, 40);
    applySlow(S, mob, 110, 'mud', 2500, 40);
    expect(mob.slows).toEqual([{ src: 'mud', bp: 2500, until: 151 }]);
  });

  it('둔화된 슬라임: 1.5칸/초 × (1 − 50%) → 1초에 750단위, 풀리면 다시 1500', () => {
    const m = arena();
    const mob = mobAt(m, 'slime', 3000, 1500);
    m.step();
    applySlow(S, mob, m.tick - 1, 'test', 5000, 20);
    const p0 = mob.progress;
    m.stepN(20);
    expect(mob.progress - p0).toBe(750);
    m.stepN(20);
    expect(mob.progress - p0).toBe(750 + 1500);
  });
});

describe('기절·정지·빙결 — 행동 불가', () => {
  it('기절: 지속 동안 이동 정지, 끝나면 다시 걷는다 (걸린 다음 틱부터 정확히 20틱)', () => {
    const m = arena();
    const mob = mobAt(m, 'slime', 3000, 1500);
    m.step();
    expect(applyHardCc(S, mob, m.tick - 1, 'stun', 20)).toBe(true);
    const p0 = mob.progress;
    m.stepN(20);
    expect(mob.progress).toBe(p0);
    expect(isStunned(mob, m.tick)).toBe(false);
    m.stepN(20);
    expect(mob.progress - p0).toBe(1500);
  });

  it('지속시간 갱신: 걸려 있는 동안 다시 걸면 더 늦게 풀리는 쪽으로', () => {
    const m = arena();
    const mob = mobAt(m, 'slime', 3000);
    applyHardCc(S, mob, 100, 'stun', 20); // 121
    applyHardCc(S, mob, 110, 'stun', 20); // 131
    expect(mob.stunUntil).toBe(131);
    applyHardCc(S, mob, 115, 'stun', 4); // 120 < 131 → 그대로
    expect(mob.stunUntil).toBe(131);
    expect(mob.ccEnd).toBe(131);
  });

  it('기절 직후 다시 기절 → 1초(20틱) 면역 동안 무시 (DEV_PLAN 예시), 면역이 끝나면 다시 걸린다', () => {
    const m = arena();
    const mob = mobAt(m, 'slime', 3000);
    applyHardCc(S, mob, 100, 'stun', 20); // 101 ~ 120틱 기절, 121틱에 풀림
    expect(isDisabled(mob, 120)).toBe(true);
    expect(isDisabled(mob, 121)).toBe(false);
    expect(isCcImmune(S, mob, 121)).toBe(true);
    expect(applyHardCc(S, mob, 121, 'stun', 20)).toBe(false);
    expect(applyHardCc(S, mob, 140, 'stun', 20)).toBe(false);
    expect(isCcImmune(S, mob, 141)).toBe(false);
    expect(applyHardCc(S, mob, 141, 'stun', 20)).toBe(true);
  });

  it('면역은 행동 불가 전체: 기절이 끝난 직후에는 빙결·정지도 무시', () => {
    const m = arena();
    const mob = mobAt(m, 'slime', 3000);
    applyHardCc(S, mob, 100, 'stun', 10); // 111에 풀림
    expect(applyHardCc(S, mob, 115, 'freeze', 20, 1000)).toBe(false);
    expect(applyHardCc(S, mob, 115, 'stop', 20)).toBe(false);
    expect(isFrozen(mob, 116)).toBe(false);
  });

  it('보스: 기절·정지·빙결 지속 30% (20틱 → 6틱), 상태이상 저항은 겹쳐 곱하지 않음', () => {
    expect(ccDuration(S, { boss: true, ccResistBp: 0 }, 20)).toBe(6);
    expect(ccDuration(S, { boss: true, ccResistBp: 7000 }, 20)).toBe(6);
    const m = arena();
    const boss = mobAt(m, 'slime', 3000);
    boss.boss = true;
    applyHardCc(S, boss, 100, 'freeze', 10, 1000);
    expect(boss.freezeUntil).toBe(104); // 3틱 (10 × 30% = 3)
  });

  it('상태이상 저항: 기절 지속 × (1 − 저항) — 방패병 30% → 20틱이 14틱, 0틱이 되면 걸리지 않음', () => {
    expect(ccDuration(S, { boss: false, ccResistBp: 3000 }, 20)).toBe(14);
    expect(ccDuration(S, { boss: false, ccResistBp: 9000 }, 5)).toBe(0);
    const m = arena();
    const mob = mobAt(m, 'slime', 3000);
    mob.ccResistBp = 9000;
    expect(applyHardCc(S, mob, 100, 'stun', 5)).toBe(false);
    expect(mob.ccEnd).toBe(0);
  });

  it('정지(시간): 이동 정지 + 정지 상태 (회복·능력 정지는 M4 몹 특성이 읽는다)', () => {
    const m = arena();
    const mob = mobAt(m, 'slime', 3000, 1500);
    m.step();
    applyHardCc(S, mob, m.tick - 1, 'stop', 30);
    expect(isStopped(mob, m.tick)).toBe(true);
    const p0 = mob.progress;
    m.stepN(30);
    expect(mob.progress).toBe(p0);
    expect(isStopped(mob, m.tick)).toBe(false);
  });

  it('빙결: 일시 정지 + 받는 피해 +10%, 풀리면 약화도 사라진다', () => {
    const m = arena();
    const mob = mobAt(m, 'slime', 3000, 1500);
    m.step();
    applyHardCc(S, mob, m.tick - 1, 'freeze', 10, S.freezeVulnBp);
    expect(mob.vulnBp).toBe(1000);
    expect(damageAgainst({ p: 10_000, m: 0, t: 0 }, mob).total).toBe(11_000);
    const p0 = mob.progress;
    m.stepN(10);
    expect(mob.progress).toBe(p0);
    expect(isFrozen(mob, m.tick)).toBe(false);
    // 다음 틱 맨 앞(상태 이상 시스템)에서 빙결 약화를 지우고, 그 틱에 다시 걷는다 (그 틱의 피해는 약화 없이)
    m.step();
    expect(mob.vulnBp).toBe(0);
    expect(mob.freezeVulnBp).toBe(0);
    expect(mob.progress).toBeGreaterThan(p0);
  });
});

describe('되돌리기 — 출발 지점으로, 보스 면역', () => {
  it('일반 몹은 진행도 0으로, 보스는 그대로', () => {
    const m = arena();
    const mob = mobAt(m, 'slime', 9000);
    mob.moveRem = 7;
    expect(applyReturn(mob)).toBe(true);
    expect([mob.progress, mob.moveRem]).toEqual([0, 0]);
    const boss = mobAt(m, 'slime', 9000);
    boss.boss = true;
    expect(applyReturn(boss)).toBe(false);
    expect(boss.progress).toBe(9000);
  });
});

describe('지속 피해 — 화상·독·출혈 (고정 피해, 치명타 없음)', () => {
  it('방어 무시: 초당 10 × 3초 = 30 (방어 300이어도)', () => {
    const m = arena();
    const mob = mobAt(m, 'slime', 3000);
    mob.armor = 300;
    mob.magicRes = 300;
    mob.hp = 1000;
    m.step();
    applyDot(mob, m.tick - 1, 'test', 'burn', 1000, 60, 1);
    m.stepN(80);
    expect(1000 - mob.hp).toBe(30);
    expect(mob.dots).toEqual([]);
  });

  it('0.5초(10틱)마다 들어간다 — hit 사건 { dot: true }', () => {
    const m = arena();
    const mob = mobAt(m, 'slime', 3000);
    mob.hp = 1000;
    m.step();
    m.world.drainEvents();
    applyDot(mob, m.tick - 1, 'test', 'poison', 2000, 40, 5);
    m.stepN(50);
    const dots = eventsOf(m, 'hit').filter((e) => e.dot === true);
    expect(dots.length).toBeGreaterThanOrEqual(4);
    for (const e of dots) expect(e.tick % 10).toBe(0);
    expect(1000 - mob.hp).toBe(40); // 초당 20 × 2초
  });

  it('받는 피해 증가(약화)가 곱해진다: 초당 10 × 3초 × (1 + 50%) = 45', () => {
    const m = arena();
    const mob = mobAt(m, 'slime', 3000);
    mob.hp = 1000;
    m.step();
    applyVuln(S, mob, m.tick - 1, 'v', 5000, 200);
    applyDot(mob, m.tick - 1, 'test', 'burn', 1000, 60, 1);
    m.stepN(80);
    expect(1000 - mob.hp).toBe(45);
  });

  it('독: 최대 5중첩, 6번째는 가장 먼저 풀릴 중첩을 새로 갱신 (중첩 수 그대로)', () => {
    const m = arena();
    const mob = mobAt(m, 'slime', 3000);
    for (let i = 0; i < 5; i++) applyDot(mob, 100 + i, 'poisonarcher', 'poison', 100, 100, 5);
    expect(dotStacks(mob, 'poison', 106)).toBe(5);
    applyDot(mob, 110, 'poisonarcher', 'poison', 100, 100, 5);
    expect(dotStacks(mob, 'poison', 111)).toBe(5);
    expect(mob.dots.map((d) => d.until)).toEqual([211, 202, 203, 204, 205]);
  });

  it('화상 (화염 마법사 데이터: 1중첩) — 다시 맞으면 시간만 갱신, 다른 타워의 화상은 따로 중첩', () => {
    const m = arena();
    const mob = mobAt(m, 'slime', 3000);
    applyDot(mob, 100, 'flamemage', 'burn', 390, 60, 1);
    applyDot(mob, 130, 'flamemage', 'burn', 390, 60, 1);
    expect(mob.dots).toEqual([{ src: 'flamemage', kind: 'burn', dps: 390, until: 191 }]);
    applyDot(mob, 130, 'elemental', 'burn', 6600, 60, 1);
    expect(dotStacks(mob, 'burn', 131)).toBe(2);
  });

  it('지속 피해로 죽어도 처치 보상을 받는다', () => {
    const m = arena();
    const mob = mobAt(m, 'slime', 3000);
    mob.hp = 5;
    m.step();
    const gold = m.state.gold;
    applyDot(mob, m.tick - 1, 'test', 'bleed', 1000, 40, 1);
    m.stepN(20);
    expect(m.world.entities.has(mob.id)).toBe(false);
    expect(m.state.gold).toBe(gold + mob.reward);
    expect(m.state.kills).toBe(1);
  });
});

describe('표식·약화', () => {
  it('표식: 가장 강한 것만 (20% + 15% → 20%), 관통 합에 더해진다 (물리 100 vs 방어 100, 표식 20% → A = 80 → 55)', () => {
    const m = arena();
    const mob = mobAt(m, 'slime', 3000);
    mob.armor = 100;
    applyMark(S, mob, 100, 'scout', 2000, 100);
    applyMark(S, mob, 100, 'alchemist', 1500, 100);
    expect(mob.markBp).toBe(2000);
    expect(damageAgainst({ p: 10_000, m: 0, t: 0 }, mob).total).toBe(5555);
  });

  it('약화: 서로 다른 출처는 합산 (10% + 10% = 20%), 같은 출처는 갱신만', () => {
    const m = arena();
    const mob = mobAt(m, 'slime', 3000);
    applyVuln(S, mob, 100, 'dragoncaller', 1000, 100);
    applyVuln(S, mob, 100, 'dragoncaller', 1000, 100);
    expect(mob.vulnBp).toBe(1000);
    applyHardCc(S, mob, 100, 'freeze', 20, 1000);
    expect(mob.vulnBp).toBe(2000);
  });

  it('약화 합 최대 +100% (판 규칙 vulnMax): +150%여도 ×2', () => {
    const m = arena();
    const mob = mobAt(m, 'slime', 3000);
    applyVuln(S, mob, 100, 'a', 10_000, 100);
    applyVuln(S, mob, 100, 'b', 5000, 100);
    expect(mob.vulnBp).toBe(15_000);
    expect(damageAgainst({ p: 0, m: 0, t: 10_000 }, mob, { penMaxBp: rules.penMaxBp, vulnMaxBp: rules.vulnMaxBp }).total).toBe(20_000);
  });

  it('보스에도 표식·약화·지속 피해는 그대로 적용', () => {
    const m = arena();
    const boss = mobAt(m, 'slime', 3000);
    boss.boss = true;
    applyMark(S, boss, 100, 'alchemist', 1500, 60);
    applyVuln(S, boss, 100, 'dragoncaller', 1000, 60);
    applyDot(boss, 100, 'poisonarcher', 'poison', 100, 100, 5);
    expect([boss.markBp, boss.vulnBp, dotStacks(boss, 'poison', 101)]).toEqual([1500, 1000, 1]);
  });
});

describe('원소 5종 — 판 안 실제 타워', () => {
  /** 칸 (4, 2)에 타워, 진행도 3000(칸 4, 1)에 제자리 슬라임 → n틱 */
  function duel(towerId: string, ticks: number, hp = 100_000) {
    const m = arena();
    const mob = mobAt(m, 'slime', 3000);
    mob.hp = hp;
    mob.maxHp = hp;
    const tower = placeTower(m.world, towerId, 0, 4, 2);
    m.stepN(ticks);
    return { m, mob, tower };
  }

  it('🔥 화염 (화염 마법사): 맞은 몹에 화상 3초 — 초당 공격력 13 × 30% = 3.9 (× ATK_SCALE 390), 고정 피해가 들어간다', () => {
    const { m, mob } = duel('flamemage', 3);
    expect(mob.dots).toEqual([expect.objectContaining({ src: 'flamemage', kind: 'burn', dps: 390 })]);
    m.world.drainEvents();
    m.stepN(30);
    expect(eventsOf(m, 'hit').some((e) => e.dot === true && Number(e.t) > 0)).toBe(true);
  });

  it('⚡ 번개 (번개 마법사): 연쇄 3 — 줄 선 몹 3마리가 맞는다 (2번째부터 −20%씩)', () => {
    const m = arena();
    const mobs = [3000, 3600, 4200, 4800].map((p) => {
      const x = mobAt(m, 'slime', p);
      x.hp = 100_000;
      return x;
    });
    placeTower(m.world, 'lightning', 0, 4, 2);
    m.stepN(4);
    const hit = mobs.filter((x) => x.hp < 100_000);
    expect(hit).toHaveLength(3);
  });

  it('☠ 독 (독 궁수): 맞을 때마다 1중첩, 최대 5중첩', () => {
    const { m, mob } = duel('poisonarcher', 200);
    expect(dotStacks(mob, 'poison', m.tick)).toBe(5);
  });

  it('❄ 얼음 (얼음 마법사): 맞은 몹이 빙결 (일시 정지)', () => {
    const { m, mob } = duel('icemage', 3);
    expect(isFrozen(mob, m.tick)).toBe(true);
    expect(mob.vulnBp).toBe(S.freezeVulnBp);
  });

  it('🟫 진흙 (진흙 주술사): 맞은 몹 둔화 25% (Lv1)', () => {
    const { mob } = duel('mudshaman', 3);
    expect(mob.slowBp).toBe(2500);
  });

  it('출혈 (군견병): 맞은 몹에 2초 출혈 — 초당 공격력 4.6 × 50% = 2.3 (× ATK_SCALE 230), 고정 피해', () => {
    const { m, mob } = duel('k9', 3);
    expect(mob.dots).toEqual([expect.objectContaining({ src: 'k9', kind: 'bleed', dps: 230 })]);
    expect(dotStacks(mob, 'bleed', m.tick)).toBe(1);
  });

  it('드러나지 않은 투명 몹은 광역에 맞지 않아 상태 이상도 걸리지 않는다 (GDD 5.7)', () => {
    const m = arena();
    const target = mobAt(m, 'slime', 3000);
    target.hp = 100_000;
    const thief = mobAt(m, 'thief', 3200);
    placeTower(m.world, 'icemage', 0, 4, 2);
    m.stepN(3);
    expect(isFrozen(target, m.tick)).toBe(true);
    expect(isFrozen(thief, m.tick)).toBe(false);
    expect(thief.slows.length + thief.dots.length + thief.vulns.length).toBe(0);
  });
});
