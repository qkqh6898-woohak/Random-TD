/**
 * M5-2 도전 10단계: 단계별 5분 쿨타임, 30초 제한, 해금 순서(판마다 초기화), 동시 1개, 몹 수 미포함, 실패 패널티 없음,
 * '보스' 취급, 특수 능력(쌍둥이 체력 공유·둔화 면역·순간이동·타워 동결·회복·화상 면역·투명·무적).
 */
import { describe, expect, it } from 'vitest';
import { BP_ONE } from '../../src/sim/Fixed';
import { countMobs, isMob, listMobs, type Mob } from '../../src/sim/entities/Mob';
import { buildMatchRules } from '../../src/sim/rules';
import { applyHit } from '../../src/sim/systems/Combat';
import { challengeCheck, challengeCooldownLeft, challengesAvailable } from '../../src/sim/systems/Challenge';
import { bossAlive, killMob } from '../../src/sim/systems/Kill';
import { applyDot, applySlow, isDisabled } from '../../src/sim/systems/Status';
import { skipStage } from '../../src/sim/systems/Stage';
import { placeTower } from '../../src/sim/systems/Summon';
import { arena, campaign, command, data, eventsOf, mobAt } from '../helpers/match';
import type { Match } from '../../src/sim/match';

const rules = buildMatchRules(data);

/** 시험장에서 lv단계 도전을 바로 시작 (해금은 열어 둠). 보스(첫 마리)를 돌려준다. */
function start(m: Match, lv: number): Mob {
  m.state.challengeOpen = Math.max(m.state.challengeOpen, lv);
  command(m, { type: 'startChallenge', lv });
  const boss = listMobs(m.world).find((e) => e.challenge === lv);
  if (!boss) throw new Error(`도전 ${lv} 보스가 없다`);
  return boss;
}

function hitFor(m: Match, mob: Mob, damage: number): void {
  applyHit(m.ctx, m.world, mob, { p: 0, m: 0, t: damage * 100 }, { x: 0, y: 0 }, 0);
}

describe('도전 데이터 (GDD 6장, ENEMIES.md 7장)', () => {
  it('10단계: 체력 2700 × 2.2^(n−1) 표, 보상 20 … 6000원, 30초 제한, 5분 쿨타임', () => {
    expect(rules.challenges.map((c) => c.hp)).toEqual([2700, 5940, 13068, 28750, 63249, 139148, 306126, 673477, 1481649, 3259627]);
    expect(rules.challenges.map((c) => c.reward)).toEqual([20, 50, 100, 200, 400, 800, 1500, 2500, 4000, 6000]);
    expect(rules.challengeTimeTicks).toBe(600);
    expect(rules.challengeCooldownTicks).toBe(6000);
    expect(rules.challenges[1]?.speed).toBe(1800); // 도둑 고블린 1.8
    expect(rules.challenges[0]?.speed).toBe(1200);
  });
});

describe('startChallenge', () => {
  it('1단계: 경로 시작점에 황금 슬라임 (보스 취급, 몹 수에 안 셈), 30초 제한', () => {
    const m = arena(1);
    command(m, { type: 'startChallenge', lv: 1 });
    const mobs = listMobs(m.world);
    expect(mobs).toHaveLength(1);
    const b = mobs[0]!;
    expect(b).toMatchObject({ mob: 'goldslime', challenge: 1, boss: true, hp: 2700, maxHp: 2700, armor: 0, reward: 0, lifeDamage: 0 });
    expect(b.progress).toBeLessThan(200); // 시작점에서 막 출발
    expect(countMobs(m.world)).toBe(0);
    expect(bossAlive(m.world)).toBe(false); // 판의 보스와 따로
    expect(m.state).toMatchObject({ challengeLevel: 1, challengePlayer: 0, challengeMaxHp: 2700 });
    expect(m.state.challengeUntil - m.state.challengeStart).toBe(600);
    expect(eventsOf(m, 'challengeStart')).toEqual([expect.objectContaining({ lv: 1, hp: 2700, id: b.id })]);
  });

  it('해금 순서: 처음엔 1단계만, 동시에 1개, 끝난 단계는 쿨타임', () => {
    const m = arena(1);
    expect(challengeCheck(m.ctx, 2, m.tick)).toBe('locked');
    expect(challengeCheck(m.ctx, 11, m.tick)).toBe('unknown');
    expect(challengesAvailable(m.ctx, m.tick)).toBe(1);
    command(m, { type: 'startChallenge', lv: 2 });
    expect(eventsOf(m, 'challengeStartFail').map((e) => e.reason)).toEqual(['locked']);
    command(m, { type: 'startChallenge', lv: 1 });
    m.state.challengeOpen = 3;
    expect(challengeCheck(m.ctx, 2, m.tick)).toBe('busy');
    expect(challengesAvailable(m.ctx, m.tick)).toBe(0);
    m.state.phase = 'defeat';
    expect(challengeCheck(m.ctx, 1, m.tick)).toBe('phase');
  });

  it('처치: 보상(황금 손 적용) + 처음이면 다음 단계 해금, 그 단계만 5분 쿨타임 → 끝나면 challengeReady', () => {
    const m = arena(1);
    m.state.goldPctBp = 2500;
    const b = start(m, 1);
    const g0 = m.state.gold;
    hitFor(m, b, 2700);
    expect(m.world.entities.has(b.id)).toBe(false);
    expect(m.state.gold).toBe(g0 + 25); // 20 × 1.25
    expect(m.state).toMatchObject({ challengeLevel: 0, challengeOpen: 2, challengeBest: 1, challengeClears: 1 });
    const ev = eventsOf(m, 'challengeClear');
    expect(ev).toEqual([expect.objectContaining({ lv: 1, reward: 25, first: true, open: 2 })]);
    expect(challengeCooldownLeft(m.ctx, 1, m.tick)).toBe(6000);
    expect(challengeCheck(m.ctx, 1, m.tick)).toBe('cooldown');
    expect(challengeCheck(m.ctx, 2, m.tick)).toBeNull(); // 다른 단계는 쿨타임이 없다
    m.stepN(6000); // 처치한 틱 + 6000틱에 준비 완료
    expect(eventsOf(m, 'challengeReady')).toEqual([]);
    m.step();
    expect(eventsOf(m, 'challengeReady')).toEqual([expect.objectContaining({ lv: 1 })]);
    expect(challengeCheck(m.ctx, 1, m.tick)).toBeNull();
    // 두 번째 처치: first = false, 해금은 그대로
    const b2 = start(m, 1);
    hitFor(m, b2, 2700);
    expect(eventsOf(m, 'challengeClear')[0]).toMatchObject({ first: false, open: 2 });
    expect(m.state.challengeClears).toBe(2);
  });

  it('30초 안에 못 잡으면 실패: 보스가 사라지고 쿨타임, 패배·목숨 감소 없음', () => {
    const m = arena(1);
    const b = start(m, 1);
    b.speed = 0;
    const lives = m.state.lives;
    m.stepN(599); // 시작 틱 + 600틱에 실패
    expect(m.world.entities.has(b.id)).toBe(true);
    m.step();
    expect(m.world.entities.has(b.id)).toBe(false);
    expect(eventsOf(m, 'challengeFail')).toEqual([expect.objectContaining({ lv: 1, reason: 'time' })]);
    expect(m.state).toMatchObject({ challengeLevel: 0, challengeOpen: 1, phase: 'playing', lives });
    expect(challengeCooldownLeft(m.ctx, 1, m.tick - 1)).toBe(6000); // 실패한 틱부터 5분
  });

  it('캠페인 출구에 닿으면 목숨 감소 없이 실패 (보스 성문 패배가 아님)', () => {
    const m = campaign(1);
    m.state.nextStageTick = 1_000_000;
    const b = start(m, 1);
    b.progress = m.map.path.length - 10;
    m.step();
    expect(m.world.entities.has(b.id)).toBe(false);
    expect(eventsOf(m, 'challengeFail')).toEqual([expect.objectContaining({ reason: 'escape' })]);
    expect(m.state.lives).toBe(m.state.maxLives);
    expect(m.state.phase).toBe('playing');
  });

  it('판 보스와 따로: debug 단계 건너뛰기가 도전 보스를 지우지 않는다', () => {
    const m = arena(1, { debug: true });
    const b = start(m, 1);
    m.state.bossId = 'batqueen';
    skipStage(m.ctx, m.world);
    expect(m.world.entities.has(b.id)).toBe(true);
  });
});

describe('보스 취급 (GDD 6장)', () => {
  it('보스 피해 배율이 들어가고, 둔화는 절반', () => {
    const m = arena(1);
    const b = start(m, 1);
    applyHit(m.ctx, m.world, b, { p: 0, m: 0, t: 10000, bossMulBp: 20000 }, { x: 0, y: 0 }, 0);
    expect(b.maxHp - b.hp).toBe(200);
    applySlow(rules.status, b, m.tick, 'test', 4000, 100);
    expect(b.slowBp).toBe(Math.floor(4000 * rules.status.bossSlowMulBp / BP_ONE));
  });
});

describe('특수 능력', () => {
  it('쌍둥이 박쥐: 2마리가 체력 하나 — 한 마리를 치면 둘 다 깎이고, 죽으면 함께 사라지며 보상은 한 번', () => {
    const m = arena(1);
    const a = start(m, 4);
    const twins = listMobs(m.world).filter((e) => e.challenge === 4);
    expect(twins).toHaveLength(2);
    const b = twins[1]!;
    expect(a.link).toBe(a.id);
    expect(b.link).toBe(a.id);
    hitFor(m, b, 1000);
    expect(a.hp).toBe(28750 - 1000);
    expect(b.hp).toBe(28750 - 1000);
    const g0 = m.state.gold;
    hitFor(m, a, 30000);
    expect(listMobs(m.world).filter((e) => e.challenge)).toHaveLength(0);
    expect(m.state.gold).toBe(g0 + 200);
    expect(eventsOf(m, 'challengeClear')).toHaveLength(1);
  });

  it('강철 골렘: 둔화 면역 (기절은 걸림)', () => {
    const m = arena(1);
    const b = start(m, 5);
    expect(applySlow(rules.status, b, m.tick, 'mud', 5000, 100)).toBe(false);
    expect(b.slows).toHaveLength(0);
  });

  it('그림자 늑대: 5초마다 경로를 2칸 앞으로 순간이동', () => {
    const m = arena(1);
    const b = start(m, 6);
    b.speed = 0;
    const p0 = b.progress;
    m.stepN(99); // 시작 틱 + 100틱에 첫 순간이동
    expect(b.progress).toBe(p0);
    m.step();
    expect(b.progress).toBe(p0 + 2000);
    expect(eventsOf(m, 'challengeTeleport')).toHaveLength(1);
    m.stepN(100);
    expect(b.progress).toBe(p0 + 4000);
  });

  it('서리 거인: 8초마다 반경 2칸 안 타워 2초 동결 (공격·주기 능력 불가), 먼 타워는 그대로', () => {
    const m = arena(1);
    const near = placeTower(m.world, 'archer', 0, 2, 2); // 시작점 (1500, 1500)에서 약 1.41칸
    const far = placeTower(m.world, 'archer', 0, 6, 6);
    const b = start(m, 7);
    b.speed = 0;
    m.stepN(160); // 시작 틱 + 160틱
    const ev = eventsOf(m, 'challengeFreeze');
    expect(ev).toHaveLength(1);
    expect(ev[0]?.towers).toBe(String(near.id));
    expect(near.stunUntil).toBe(m.tick - 1 + 40);
    expect(far.stunUntil).toBe(0);
  });

  it('화염 정령왕: 화상 면역 + 1초마다 최대 체력 1% 회복 (행동 불가 동안은 쉰다)', () => {
    const m = arena(1);
    const b = start(m, 8);
    b.speed = 0;
    expect(applyDot(b, m.tick, 'flamemage', 'burn', 100, 100, 1)).toBe(false);
    expect(applyDot(b, m.tick, 'poison', 'poison', 100, 100, 1)).toBe(true);
    b.dots.length = 0;
    hitFor(m, b, 100_000);
    const hp = b.hp;
    m.stepN(20); // 시작 틱 + 20틱
    expect(b.hp).toBe(hp + 6734); // 673,477 × 1%
    expect(eventsOf(m, 'heal').length).toBeGreaterThan(0);
  });

  it('망령 기사: 투명 (감지 필요), challengeInvisible 사건', () => {
    const m = arena(1);
    const b = start(m, 9);
    expect(b.invisible).toBe(true);
    expect(eventsOf(m, 'challengeInvisible')).toHaveLength(1);
  });

  it('고대 드래곤: 체력 50% 이하가 된 다음 틱에 5초 무적 + 이동속도 2배 (무적이 끝나도 속도는 그대로)', () => {
    const m = arena(1);
    const b = start(m, 10);
    hitFor(m, b, 1_700_000);
    m.step();
    expect(b.dmgCutBp).toBe(BP_ONE);
    expect(b.speedBonusBp).toBe(BP_ONE);
    expect(eventsOf(m, 'challengeGuard')).toHaveLength(1);
    const hp = b.hp;
    hitFor(m, b, 50_000);
    expect(b.hp).toBe(hp);
    m.stepN(100);
    expect(b.dmgCutBp).toBe(0);
    hitFor(m, b, 50_000);
    expect(b.hp).toBe(hp - 50_000);
    expect(b.speedBonusBp).toBe(BP_ONE);
    // 한 번만
    m.stepN(5);
    expect(eventsOf(m, 'challengeGuard')).toHaveLength(0);
  });

  it('주기 능력은 행동 불가 동안 미뤘다가 풀리면 바로 (그림자 늑대)', () => {
    const m = arena(1);
    const b = start(m, 6);
    b.speed = 0;
    b.stunUntil = m.tick + 200;
    b.ccEnd = m.tick + 200;
    const p0 = b.progress;
    m.stepN(150);
    expect(isDisabled(b, m.tick)).toBe(true);
    expect(b.progress).toBe(p0);
    m.stepN(60);
    expect(b.progress).toBe(p0 + 2000);
  });

  it('처치하면 Kill이 무리를 정리 — 직접 killMob을 불러도 같은 결과', () => {
    const m = arena(1);
    const a = start(m, 4);
    killMob(m.ctx, m.world, a, 0, 0);
    expect(m.world.entities.list().filter((e) => isMob(e))).toHaveLength(0);
    expect(m.state.challengeLevel).toBe(0);
  });

  it('몹 수 한도에 안 셈: 몹 149마리 + 도전 보스여도 몹 수 149', () => {
    const m = arena(1);
    for (let i = 0; i < 149; i++) mobAt(m, 'slime', 100 + i);
    start(m, 1);
    expect(countMobs(m.world)).toBe(149);
  });
});
