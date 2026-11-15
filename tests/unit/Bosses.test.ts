/**
 * M4-5 기본 대장 5종 패턴 (상태 기계) + M4-6 보스 60초 제한 패배 + 보스 처치 보상·카드 + 캠페인 보스 출구 도달 패배.
 */
import { describe, expect, it } from 'vitest';
import { listMobs, type Mob } from '../../src/sim/entities/Mob';
import { listTowers } from '../../src/sim/entities/Tower';
import { buildMatchRules, stageArmor, stageHp } from '../../src/sim/rules';
import { bossDefOf, bossModuleIds, bossParams } from '../../src/sim/bosses';
import { applyHit } from '../../src/sim/systems/Combat';
import { damageAgainst } from '../../src/sim/systems/Damage';
import { killMob } from '../../src/sim/systems/Kill';
import { effectiveSpeed } from '../../src/sim/systems/Movement';
import { applyHardCc } from '../../src/sim/systems/Status';
import { placeTower } from '../../src/sim/systems/Summon';
import { spawnBoss } from '../../src/sim/systems/Spawn';
import { arena, campaign, command, data, eventsOf, infinite, jumpToStage } from '../helpers/match';

const rules = buildMatchRules(data);

/** 시험장에 보스를 세운다 (단계 s 스탯, 진행도 progress, 기본 제자리). */
function boss(m: ReturnType<typeof arena>, id: string, stage: number, progress = 3000, speed = 0): Mob {
  m.state.stage = stage;
  m.state.spawnStage = stage; // 등장 시스템이 그 단계 보스를 또 내보내지 않게
  const b = spawnBoss(m.ctx, m.world, rules.bosses.get(id)!, stage);
  b.progress = progress;
  b.speed = speed;
  return b;
}

const bosses = (m: ReturnType<typeof arena>) => listMobs(m.world).filter((x) => x.boss);

describe('보스 데이터·모듈 (M4-5)', () => {
  it('기본 대장 5종 모두 패턴 모듈이 있고 수치를 정수로 읽는다', () => {
    expect(bossModuleIds().sort()).toEqual([...rules.bossOrder].sort());
    const m = arena(1);
    expect(bossParams(m.ctx, bossDefOf('batqueen')!)).toMatchObject({ summonTicks: 200, count: 5, flyEveryTicks: 300, flyTicks: 60, flyBlock: 2000 });
    expect(bossParams(m.ctx, bossDefOf('chaosdragon')!)).toMatchObject({ stunEveryTicks: 300, towers: 3, stunTicks: 100, guardAt: [6600, 3300], cutBp: 5000 });
  });

  it('보스 등장: 단계 시작 틱에 1마리, 체력 = HP(s) × 배율, 방어·마저 성장, 보스 표시·상태', () => {
    const m = infinite(1);
    jumpToStage(m, 20);
    const list = listMobs(m.world);
    expect(list).toHaveLength(1);
    const b = list[0]!;
    expect(b).toMatchObject({ mob: 'kingslime', boss: true, progress: 45 }); // 나온 틱에 첫 걸음 (0.9칸/초 ÷ 20)
    expect(b.hp).toBe(stageHp(rules, 20) * 40);
    expect(b.armor).toBe(stageArmor(rules, 20, 20));
    expect(m.state).toMatchObject({ bossId: 'kingslime', bossNum: 2, bossMaxHp: b.hp, bossDeadline: m.tick - 1 + 1200 });
    expect(eventsOf(m, 'bossSpawn')[0]).toMatchObject({ boss: 'kingslime', stage: 20 });
  });

  it('캠페인 테마 보정이 보스 체력·방어에도 들어간다', () => {
    const m = campaign(1, 2);
    jumpToStage(m, 10);
    const b = listMobs(m.world).find((x) => x.boss)!;
    expect(b.hp).toBe(stageHp(rules, 10) * 45); // 테마 1 = ×1, +0
  });
});

describe('보스 제한 시간 (M4-6, 60초)', () => {
  it('보스 단계 + 60초에 보스가 살아 있으면 그 단계에서 패배 (bossTime), 다음 단계로 넘어가지 않는다', () => {
    const m = infinite(1);
    jumpToStage(m, 10);
    const start = m.tick - 1;
    while (!m.defeated && m.tick < start + 2000) m.step();
    expect(m.state.defeatReason).toBe('bossTime');
    expect(m.state.defeatTick).toBe(start + 1200);
    expect(m.state.stage).toBe(10);
    expect(eventsOf(m, 'defeat')[0]).toMatchObject({ reason: 'bossTime', stage: 10 });
  });

  it('보스를 일찍 잡으면 패배 없이 다음 단계는 원래 시각에 (남은 시간은 휴식)', () => {
    const m = infinite(1);
    jumpToStage(m, 10);
    const next = m.state.nextStageTick;
    const b = bosses(m)[0]!;
    m.stepN(100);
    killMob(m.ctx, m.world, b, 0, 0);
    expect(m.state.bossId).toBe('');
    expect(m.state.bossDeadline).toBe(0);
    while (m.tick <= next) m.step();
    expect(m.defeated).toBe(false);
    expect(m.state.stage).toBe(11);
  });

  it('보스 처치: +200원 (1번) + 카드 3장 묶음 + bossKill 사건', () => {
    const m = arena(1);
    const b = boss(m, 'batqueen', 10);
    const g0 = m.state.gold;
    killMob(m.ctx, m.world, b, 0, 0);
    expect(m.state.gold - g0).toBe(200);
    expect(m.state.bossesKilled).toBe(1);
    expect(m.state.cardOffers).toHaveLength(1);
    expect(m.state.cardOffers[0]).toMatchObject({ player: 0, boss: 1 });
    expect(m.state.cardOffers[0]!.cards).toHaveLength(3);
    expect(eventsOf(m, 'bossKill')[0]).toMatchObject({ boss: 'batqueen', reward: 200 });
  });

  it('캠페인: 보스가 출구에 닿으면 즉시 패배 (bossLeak)', () => {
    const m = campaign(1, 1);
    jumpToStage(m, 10);
    const b = bosses(m)[0]!;
    b.progress = m.map.path.length - 1;
    m.step();
    expect(m.state.defeatReason).toBe('bossLeak');
  });

  it('debug 단계 건너뛰기는 보스를 보상 없이 지운다 (제한 시간 패배 없음)', () => {
    const m = infinite(1, { debug: true });
    jumpToStage(m, 10);
    const g0 = m.state.gold;
    command(m, { type: 'debugSkipStage' });
    expect(m.state.stage).toBe(11);
    expect(bosses(m)).toHaveLength(0);
    expect(m.state.bossId).toBe('');
    expect(m.state.gold).toBe(g0);
    expect(m.state.cardOffers).toHaveLength(0);
  });
});

describe('킹 슬라임: 체력 50%에서 둘로 분열 (각각 남은 체력의 50%), 둘 다 잡아야 처치', () => {
  it('문턱을 넘은 다음 틱에 조각 2개 (체력 합 = 남은 체력), 조각은 다시 분열하지 않음', () => {
    const m = arena(1);
    const b = boss(m, 'kingslime', 10);
    const max = b.maxHp;
    b.hp = Math.floor(max / 2) - 10;
    const remain = b.hp;
    m.step();
    const parts = bosses(m);
    expect(parts).toHaveLength(2);
    for (const p of parts) {
      expect(p.hp).toBe(Math.floor(remain / 2));
      expect(p.maxHp).toBe(Math.floor(max / 2));
      expect(p.part).toBe(true);
      expect(p.progress).toBe(3000);
    }
    parts[0]!.hp = 10;
    m.step();
    expect(bosses(m)).toHaveLength(2);
    expect(eventsOf(m, 'bossSplit')).toHaveLength(1);
  });

  it('하나만 잡으면 보스 처치가 아니고, 둘 다 잡으면 처치 (보상 한 번)', () => {
    const m = arena(1);
    const b = boss(m, 'kingslime', 10);
    b.hp = 100;
    m.step();
    const [p1, p2] = bosses(m);
    const g0 = m.state.gold;
    killMob(m.ctx, m.world, p1!, 0, 0);
    expect(m.state.bossId).toBe('kingslime');
    expect(m.state.gold).toBe(g0);
    killMob(m.ctx, m.world, p2!, 0, 0);
    expect(m.state.bossId).toBe('');
    expect(m.state.gold - g0).toBe(200);
  });
});

describe('박쥐 여왕: 10초마다 박쥐 5마리, 15초마다 3초 날기 (사거리 2 이하 타워 공격 무효)', () => {
  it('나온 뒤 10초마다 자기 자리에 박쥐 5마리', () => {
    const m = arena(1);
    boss(m, 'batqueen', 10, 5000);
    m.stepN(200);
    expect(listMobs(m.world).filter((x) => x.mob === 'bat')).toHaveLength(0);
    m.step();
    const bats = listMobs(m.world).filter((x) => x.mob === 'bat');
    expect(bats).toHaveLength(5);
    expect(bats.every((x) => x.stage === 10 && !x.boss)).toBe(true);
    m.stepN(200);
    expect(listMobs(m.world).filter((x) => x.mob === 'bat')).toHaveLength(10);
  });

  it('날아오른 3초 동안 근접(사거리 1.5) 타워는 못 치고, 궁수(사거리 3.5)는 친다', () => {
    const m = arena(1);
    const b = boss(m, 'batqueen', 10);
    b.hp = b.maxHp = 100_000_000;
    const melee = placeTower(m.world, 'warrior', 0, 4, 2);
    const archer = placeTower(m.world, 'archer', 0, 4, 0);
    m.stepN(300); // 틱 300에 날아오름
    m.world.drainEvents();
    m.step();
    expect(b.flyUntil).toBe(300 + 60);
    m.stepN(50);
    const hits = eventsOf(m, 'hit').filter((e) => e.target === b.id);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((e) => e.source === archer.id)).toBe(true);
    m.stepN(30);
    const after = eventsOf(m, 'hit').filter((e) => e.target === b.id);
    expect(after.some((e) => e.source === melee.id)).toBe(true);
  });

  it('보스가 기절·정지 중이면 패턴을 미뤘다가 풀리면 바로', () => {
    const m = arena(1);
    const b = boss(m, 'batqueen', 10);
    m.stepN(190);
    applyHardCc(rules.status, b, m.tick, 'stop', 100); // 보스 30% → 30틱
    m.stepN(25);
    expect(listMobs(m.world).filter((x) => x.mob === 'bat')).toHaveLength(0);
    m.stepN(10);
    expect(listMobs(m.world).filter((x) => x.mob === 'bat')).toHaveLength(5);
  });
});

describe('고대 골렘: 체력 30% 이하에서 이동속도 2배, 방어력 0', () => {
  it('문턱 다음 틱부터 영구 (방어 0·속도 ×2), 사건 한 번', () => {
    const m = arena(1);
    const b = boss(m, 'ancientgolem', 30, 3000, 700);
    expect(b.armor).toBe(stageArmor(rules, 150, 30));
    b.hp = Math.floor((b.maxHp * 3) / 10);
    m.step();
    expect(b.armor).toBe(0);
    expect(b.speedBonusBp).toBe(10000);
    expect(effectiveSpeed(b, m.tick)).toBe(1400);
    b.hp = b.maxHp;
    m.step();
    expect(b.armor).toBe(0);
    expect(eventsOf(m, 'bossEnrage')).toHaveLength(1);
  });
});

describe('망령 군주: 항상 투명, 12초마다 주변 몹 10% 회복 + 투명 유령 3마리', () => {
  it('항상 투명 → 감지가 없으면 어떤 타워도 못 친다', () => {
    const m = arena(1);
    const b = boss(m, 'wraithlord', 40);
    expect(b.invisible).toBe(true);
    placeTower(m.world, 'archer', 0, 4, 2);
    placeTower(m.world, 'apprentice', 0, 4, 0);
    m.stepN(200);
    expect(b.hp).toBe(b.maxHp);
  });

  it('감지 오라 안이면 맞는다', () => {
    const m = arena(1);
    const b = boss(m, 'wraithlord', 40);
    placeTower(m.world, 'scout', 0, 4, 2);
    placeTower(m.world, 'archer', 0, 4, 0);
    m.stepN(60);
    expect(b.hp).toBeLessThan(b.maxHp);
  });

  it('12초(240틱)마다 반경 3칸 다른 몹 10% 회복 (자기는 아님) + 투명 유령 3마리', () => {
    const m = arena(1);
    const b = boss(m, 'wraithlord', 40);
    b.hp -= 1000;
    const hurt = boss(m, 'kingslime', 40, 4000); // 다른 몹 (회복 대상)
    hurt.hp = hurt.maxHp - 100_000;
    const before = hurt.hp;
    m.stepN(241);
    expect(hurt.hp).toBe(Math.min(hurt.maxHp, before + Math.floor(hurt.maxHp / 10)));
    expect(b.hp).toBe(b.maxHp - 1000);
    const ghosts = listMobs(m.world).filter((x) => x.mob === 'ghost');
    expect(ghosts).toHaveLength(3);
    expect(ghosts.every((g) => g.invisible)).toBe(true);
  });
});

describe('혼돈의 용: 15초마다 무작위 타워 3개 5초 기절, 66%·33%에서 5초 받는 피해 −50%', () => {
  it('15초에 서로 다른 타워 3개 기절 5초 → 그동안 공격하지 않는다 (보스 난수 흐름)', () => {
    const m = arena(1);
    const b = boss(m, 'chaosdragon', 50);
    b.hp = b.maxHp = 100_000_000;
    for (const x of [2, 3, 4, 5, 6]) placeTower(m.world, 'archer', 0, x, 2);
    const world0 = m.world.rng('world').snapshot();
    m.stepN(301);
    const stunned = listTowers(m.world).filter((t) => t.stunUntil > m.tick);
    expect(stunned).toHaveLength(3);
    expect(stunned.every((t) => t.stunUntil === 300 + 100)).toBe(true);
    expect(m.world.rng('world').snapshot()).toEqual(world0);
    m.world.drainEvents();
    m.stepN(50);
    const sources = new Set(eventsOf(m, 'attack').map((e) => e.tower));
    for (const t of stunned) expect(sources.has(t.id)).toBe(false);
    expect(eventsOf(m, 'bossStun')).toHaveLength(0);
  });

  it('체력 66% 이하 → 5초 동안 받는 피해 −50%, 33%에서 한 번 더', () => {
    const m = arena(1);
    const b = boss(m, 'chaosdragon', 50);
    const hit = { p: 0, m: 0, t: 10_000 };
    expect(damageAgainst(hit, b).total).toBe(10_000);
    b.hp = Math.floor((b.maxHp * 66) / 100);
    m.step();
    expect(b.dmgCutBp).toBe(5000);
    expect(damageAgainst(hit, b).total).toBe(5000);
    m.stepN(100);
    expect(b.dmgCutBp).toBe(0);
    b.hp = Math.floor((b.maxHp * 33) / 100);
    m.step();
    expect(b.dmgCutBp).toBe(5000);
    expect(eventsOf(m, 'bossGuard')).toHaveLength(2);
    // 실제 피해에도
    const hp0 = b.hp;
    applyHit(m.ctx, m.world, b, { p: 0, m: 0, t: 100_00 }, { x: 0, y: 0 }, 0);
    expect(hp0 - b.hp).toBe(50);
  });
});
