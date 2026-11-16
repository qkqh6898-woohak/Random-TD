/**
 * M5-6 판 안 미션 41개 (GDD 8장, src/data/missions.json): 이벤트 구독 방식 추적기, 미션별 조건, [받기]·[모두 받기], 히든.
 */
import { describe, expect, it } from 'vitest';
import { buildMatchRules } from '../../src/sim/rules';
import { MISSION_CLAIMED, MISSION_DONE, MISSION_OPEN } from '../../src/sim/state';
import { claimCheck, missionProgress, missionsClaimable, towerCensus, censusMet } from '../../src/sim/systems/Mission';
import { addMob, arena, campaign, command, data, eventsOf, infinite, jumpToStage, summonAt } from '../helpers/match';
import { createMatch, type Match } from '../../src/sim/match';

const rules = buildMatchRules(data);

/** 미션 번호 (missions.json 순서). */
function idx(id: string): number {
  const i = rules.missions.findIndex((m) => m.id === id);
  if (i < 0) throw new Error(`없는 미션 ${id}`);
  return i;
}

function status(m: Match, id: string): number {
  return m.state.missionStatus[idx(id)] ?? -1;
}

function done(m: Match, id: string): boolean {
  return status(m, id) !== MISSION_OPEN;
}

/** debug 시험장 (치트 명령으로 타워를 놓는다). */
function dbg(extra: Parameters<typeof arena>[1] = {}): Match {
  return arena(1, { debug: true, ...extra });
}

/** 빈 배치 칸 목록 (순서대로). */
function freeCells(m: Match): [number, number][] {
  const taken = new Set(m.towers().map((t) => `${t.tx},${t.ty}`));
  return m.map.buildable.filter(([x, y]) => !taken.has(`${x},${y}`)).map(([x, y]) => [x, y]);
}

/** 타워 id들을 빈 칸에 차례로 놓는다 (debugTower 명령 = 소환 사건). 마지막 명령 뒤 1틱 더 진행해 미션 시스템이 센다. */
function put(m: Match, ids: readonly string[]): void {
  const cells = freeCells(m);
  ids.forEach((id, j) => {
    const cell = cells[j];
    if (!cell) throw new Error('빈 칸이 모자라다');
    const t = rules.towerOrder.indexOf(id);
    if (t < 0) throw new Error(`없는 타워 ${id}`);
    m.world.enqueue({ type: 'debugTower', t, x: cell[0], y: cell[1], player: 0 });
  });
  m.step();
}

function towersOf(grade: string): string[] {
  return data.towers.towers.filter((t) => t.grade === grade).map((t) => t.id);
}

/** 가짜 도박 사건 (확률과 상관없이 추적기만 시험). 배율은 bp. */
function fakeGamble(m: Match, t: number, mulBp: number, before = 100_000): void {
  const cost = rules.gambleTables[t]?.cost ?? 0;
  m.world.emit('gamble', { player: 0, t, cost, mul: mulBp, win: Math.floor((cost * mulBp) / 10000), jackpot: false, gauge: 0, before });
}

describe('missions.json (GDD 8장)', () => {
  it('일반 30개 + 히든 11개, 번호·보상이 표와 같다', () => {
    const normal = rules.missions.filter((m) => !m.hidden);
    const hidden = rules.missions.filter((m) => m.hidden);
    expect(normal).toHaveLength(30);
    expect(hidden).toHaveLength(11);
    expect(normal.map((m) => m.reward)).toEqual([
      100, 300, 800, 1500, 200, 500, 300, 2000, 100, 400, 1000, 300, 800, 300, 200, 600, 800, 100, 300, 300, 800, 300, 1000, 300, 1000,
      300, 400, 500, 1000, 500,
    ]);
    expect(hidden.map((m) => m.reward)).toEqual([1500, 1000, 500, 1000, 1500, 777, 1000, 2000, 10000, 3000, 3000]);
    expect(new Set(rules.missions.map((m) => m.id)).size).toBe(41);
  });

  it('판 시작: 모두 진행 중, 받을 보상 0', () => {
    const m = infinite();
    expect(m.state.missionStatus).toHaveLength(41);
    expect(m.state.missionStatus.every((s) => s === MISSION_OPEN)).toBe(true);
    expect(missionsClaimable(m.state)).toBe(0);
  });
});

describe('수집 (타워 보유 — 타워가 바뀐 틱에 센다)', () => {
  it('n01 서로 다른 노말 5종 (4종은 아님, 같은 종 여러 개는 1종)', () => {
    const m = dbg();
    const nm = towersOf('normal');
    put(m, [nm[0]!, nm[0]!, nm[1]!, nm[2]!, nm[3]!]);
    expect(done(m, 'n01')).toBe(false);
    put(m, [nm[4]!]);
    expect(done(m, 'n01')).toBe(true);
    expect(eventsOf(m, 'missionDone')).toContainEqual(expect.objectContaining({ id: 'n01', hidden: false, reward: 100 }));
  });

  it('n02 레어 5종 · n03 유니크 5종 · n04 히어로 3종', () => {
    const m = dbg();
    put(m, towersOf('rare').slice(0, 5));
    expect(done(m, 'n02')).toBe(true);
    expect(done(m, 'n03')).toBe(false);
    put(m, towersOf('unique').slice(0, 5));
    expect(done(m, 'n03')).toBe(true);
    put(m, towersOf('hero').slice(0, 2));
    expect(done(m, 'n04')).toBe(false);
    put(m, towersOf('hero').slice(2, 3));
    expect(done(m, 'n04')).toBe(true);
  });

  it('n05 같은 타워 5개 (아무 등급) · n06 같은 레어 5개 (노말 5개로는 안 됨)', () => {
    const m = dbg();
    const archer = 'archer';
    put(m, [archer, archer, archer, archer]);
    expect(done(m, 'n05')).toBe(false);
    put(m, [archer]);
    expect(done(m, 'n05')).toBe(true);
    expect(done(m, 'n06')).toBe(false);
    put(m, ['merchant', 'merchant', 'merchant', 'merchant', 'merchant']);
    expect(done(m, 'n06')).toBe(true);
  });

  it('n07 타워 20개 동시 보유', () => {
    const m = dbg();
    const nm = towersOf('normal');
    put(m, Array.from({ length: 19 }, (_, j) => nm[j % nm.length]!));
    expect(done(m, 'n07')).toBe(false);
    put(m, [nm[0]!]);
    expect(done(m, 'n07')).toBe(true);
  });

  it('n08 레전드 첫 획득 · h09 신 타워 획득', () => {
    const m = dbg();
    put(m, ['warlord']);
    expect(done(m, 'n08')).toBe(true);
    expect(done(m, 'h09')).toBe(false);
    put(m, ['fate']);
    expect(done(m, 'h09')).toBe(true);
    expect(eventsOf(m, 'missionDone')).toContainEqual(expect.objectContaining({ id: 'h09', hidden: true, reward: 10000 }));
  });

  it('h07 고블린 왕국: 고블린·고블린 족장·고블린 대왕 합쳐 10개', () => {
    const m = dbg();
    put(m, ['goblin', 'goblin', 'goblin', 'goblin', 'goblinchief', 'goblinchief', 'goblinchief', 'goblinking', 'goblinking']);
    expect(done(m, 'h07')).toBe(false);
    put(m, ['archer']);
    expect(done(m, 'h07')).toBe(false);
    put(m, ['goblinking']);
    expect(done(m, 'h07')).toBe(true);
  });

  it('보유 조건은 동시 보유: 승급으로 재료가 사라지면 다시 세지 않지만 이미 달성한 것은 그대로', () => {
    const m = dbg();
    put(m, ['archer', 'archer', 'archer', 'archer', 'archer']);
    expect(done(m, 'n05')).toBe(true);
    const t = m.towers()[0]!;
    command(m, { type: 'merge', x: t.tx, y: t.ty, player: 0 });
    expect(m.towers()).toHaveLength(3);
    expect(done(m, 'n05')).toBe(true);
  });

  it('censusMet·towerCensus: 순수 판정', () => {
    const m = dbg();
    put(m, ['archer', 'archer', 'miner']);
    const cs = towerCensus(m.world);
    expect(cs.total).toBe(3);
    expect(cs.byId.get('archer')).toBe(2);
    expect(censusMet(rules, { type: 'same', n: 2 }, cs)).toBe(true);
    expect(censusMet(rules, { type: 'distinct', grade: 'normal', n: 3 }, cs)).toBe(false);
    expect(censusMet(rules, { type: 'stat', key: 'summons', n: 1 }, cs)).toBe(false); // 보유 조건이 아니면 false
  });
});

describe('횟수·상태 (stat)', () => {
  it('n09 소환 10회 (실제 소환) · n10·n11 50·100회', () => {
    const m = arena();
    m.state.gold = 100_000;
    const cells = freeCells(m);
    for (let j = 0; j < 9; j++) summonAt(m, cells[j]![0], cells[j]![1]);
    expect(done(m, 'n09')).toBe(false);
    summonAt(m, cells[9]![0], cells[9]![1]);
    expect(m.state.summons).toBe(10);
    expect(done(m, 'n09')).toBe(true);
    m.state.summons = 50;
    m.step();
    expect(done(m, 'n10')).toBe(true);
    expect(done(m, 'n11')).toBe(false);
    m.state.summons = 100;
    m.step();
    expect(done(m, 'n11')).toBe(true);
  });

  it('n12·n13 승급 10·30회', () => {
    const m = arena();
    m.state.merges = 9;
    m.step();
    expect(done(m, 'n12')).toBe(false);
    m.state.merges = 10;
    m.step();
    expect(done(m, 'n12')).toBe(true);
    m.state.merges = 30;
    m.step();
    expect(done(m, 'n13')).toBe(true);
  });

  it('n15·n16 강화 5·20회 (실제 강화 명령), n17 일반 강화 Lv10', () => {
    const m = arena();
    m.state.gold = 1_000_000;
    for (let j = 0; j < 4; j++) command(m, { type: 'upgrade', k: 0, player: 0 });
    expect(done(m, 'n15')).toBe(false);
    command(m, { type: 'upgrade', k: 3, player: 0 }); // 능력치 강화도 1회
    expect(m.state.upgradesBought).toBe(5);
    expect(done(m, 'n15')).toBe(true);
    expect(done(m, 'n17')).toBe(false);
    for (let j = 0; j < 6; j++) command(m, { type: 'upgrade', k: 0, player: 0 });
    expect(done(m, 'n17')).toBe(true); // 일반 강화 Lv10
    expect(done(m, 'n16')).toBe(false);
    for (let j = 0; j < 9; j++) command(m, { type: 'upgrade', k: 4, player: 0 });
    expect(m.state.upgradesBought).toBe(20);
    expect(done(m, 'n16')).toBe(true);
  });

  it('n18 도박 10회 (결과와 상관없이)', () => {
    const m = arena();
    m.state.gold = 100_000;
    for (let j = 0; j < 9; j++) command(m, { type: 'gamble', t: 0, player: 0 });
    expect(done(m, 'n18')).toBe(false);
    command(m, { type: 'gamble', t: 0, player: 0 });
    expect(done(m, 'n18')).toBe(true);
  });

  it('n20·n21 일꾼 5·10명 (실제 고용)', () => {
    const m = arena();
    m.state.gold = 100_000;
    for (let j = 0; j < 4; j++) command(m, { type: 'hireWorker', player: 0 });
    expect(done(m, 'n20')).toBe(false);
    command(m, { type: 'hireWorker', player: 0 });
    expect(done(m, 'n20')).toBe(true);
    for (let j = 0; j < 5; j++) command(m, { type: 'hireWorker', player: 0 });
    expect(m.state.workers).toBe(10);
    expect(done(m, 'n21')).toBe(true);
  });

  it('n22·n23 보유금 3,000·10,000원 (그 순간 보유 — 나중에 써도 달성 유지)', () => {
    const m = arena();
    m.state.gold = 2999;
    m.step();
    expect(done(m, 'n22')).toBe(false);
    m.state.gold = 3000;
    m.step();
    expect(done(m, 'n22')).toBe(true);
    m.state.gold = 0;
    m.step();
    expect(done(m, 'n22')).toBe(true);
    expect(done(m, 'n23')).toBe(false);
    m.state.gold = 10_000;
    m.step();
    expect(done(m, 'n23')).toBe(true);
  });

  it('n24·n25 처치 500·2000 · n26 보스 첫 처치 · n29 20단계 도달', () => {
    const m = arena();
    m.state.kills = 500;
    m.state.bossesKilled = 1;
    m.step();
    expect(done(m, 'n24')).toBe(true);
    expect(done(m, 'n25')).toBe(false);
    expect(done(m, 'n26')).toBe(true);
    m.state.kills = 2000;
    m.step();
    expect(done(m, 'n25')).toBe(true);
    const g = infinite(1, { debug: true });
    jumpToStage(g, 19);
    expect(done(g, 'n29')).toBe(false);
    jumpToStage(g, 20);
    expect(done(g, 'n29')).toBe(true);
  });

  it('n27 도전 3단계 클리어 · n28 도전 누적 5회 클리어', () => {
    const m = arena();
    m.state.challengeBest = 2;
    m.state.challengeClears = 4;
    m.step();
    expect(done(m, 'n27')).toBe(false);
    expect(done(m, 'n28')).toBe(false);
    m.state.challengeBest = 3;
    m.state.challengeClears = 5;
    m.step();
    expect(done(m, 'n27')).toBe(true);
    expect(done(m, 'n28')).toBe(true);
  });

  it('패배한 판에서는 더 달성하지 않는다', () => {
    const m = arena();
    m.state.phase = 'defeat';
    m.state.summons = 100;
    m.step();
    expect(done(m, 'n09')).toBe(false);
  });
});

describe('방치 (idle): 마지막 플레이어 명령부터, noop은 조작이 아니다', () => {
  it('n14 1분: 판 시작부터 1200틱 명령 없으면 달성, 중간에 명령이 있으면 그때부터 다시', () => {
    const m = arena();
    m.stepN(600);
    command(m, { type: 'hireWorker', player: 0 }); // 실패한 명령도 조작 (돈 부족이어도)
    const at = m.tick - 1; // 명령이 실행된 틱
    m.stepN(at + 1200 - m.tick); // at + 1199틱까지 실행
    expect(done(m, 'n14')).toBe(false);
    m.step(); // at + 1200틱
    expect(done(m, 'n14')).toBe(true);
    expect(done(m, 'h01')).toBe(false);
  });

  it('noop(락스텝 빈 명령)은 방치를 깨지 않는다 · h01 3분', () => {
    const m = arena();
    m.stepN(500);
    command(m, { type: 'noop', player: 0 });
    m.stepN(1200 - m.tick); // 1199틱까지
    expect(done(m, 'n14')).toBe(false);
    m.step(); // 1200틱 = 판 시작부터 1분
    expect(done(m, 'n14')).toBe(true);
    m.stepN(3600 - m.tick);
    expect(done(m, 'h01')).toBe(false);
    m.step();
    expect(done(m, 'h01')).toBe(true);
  });

  it('진행도 = 지난 초 / 목표 초', () => {
    const m = arena();
    m.stepN(400);
    expect(missionProgress(m.ctx, m.world, idx('n14'))).toEqual([20, 60]);
  });
});

describe('도박 미션 (사건 구독: 연속·조건)', () => {
  it('n19 1000원 도박에서 본전 이상 (×1 이상) — 다른 테이블·×0.5는 아님', () => {
    const m = arena();
    fakeGamble(m, 1, 50_000); // 100원 ×5
    fakeGamble(m, 2, 5000); // 1000원 ×0.5
    expect(done(m, 'n19')).toBe(false);
    fakeGamble(m, 2, 10_000);
    expect(done(m, 'n19')).toBe(true);
  });

  it('h02 도박 연속 5번 0원: 중간에 0원이 아니면 0부터', () => {
    const m = arena();
    for (let j = 0; j < 4; j++) fakeGamble(m, 0, 0);
    fakeGamble(m, 0, 5000);
    for (let j = 0; j < 4; j++) fakeGamble(m, 1, 0);
    expect(done(m, 'h02')).toBe(false);
    expect(missionProgress(m.ctx, m.world, idx('h02'))).toEqual([4, 5]);
    fakeGamble(m, 0, 0);
    expect(done(m, 'h02')).toBe(true);
  });

  it('h03 인생 역전: 보유금 10원 이하에서 10원 도박 ×5', () => {
    const m = arena();
    fakeGamble(m, 0, 50_000, 11);
    expect(done(m, 'h03')).toBe(false);
    fakeGamble(m, 1, 50_000, 10);
    expect(done(m, 'h03')).toBe(false);
    fakeGamble(m, 0, 50_000, 10);
    expect(done(m, 'h03')).toBe(true);
  });

  it('h10 도박왕: 1000원 도박 ×5 2연속 (1000원 테이블에서 ×5가 아닌 결과가 끼면 0부터, 다른 테이블 도박은 끊지 않음 — T-2)', () => {
    const m = arena();
    fakeGamble(m, 2, 50_000);
    fakeGamble(m, 2, 10_000);
    fakeGamble(m, 2, 50_000);
    expect(done(m, 'h10')).toBe(false);
    // 10원 테이블을 함께 돌려도 (테이블 동시 도박) 1000원 연속은 이어진다
    fakeGamble(m, 0, 0);
    fakeGamble(m, 2, 50_000);
    expect(done(m, 'h10')).toBe(true);
  });

  it('실제 도박 명령도 사건으로 센다 (n19: 계정 Lv7, 1000원 ×1 이상이 나올 때까지)', () => {
    const m = arena(3, { accountLevels: [7] });
    let hits = 0;
    for (let j = 0; j < 40 && !done(m, 'n19'); j++) {
      m.state.gold = 100_000;
      command(m, { type: 'gamble', t: 2, player: 0 });
      const ev = eventsOf(m, 'gamble')[0];
      if (ev && (ev.mul as number) >= 10_000) hits++;
    }
    expect(hits).toBeGreaterThan(0);
    expect(done(m, 'n19')).toBe(true);
  });
});

describe('단계 도달 (reach)·위기 버티기 (danger)·아슬아슬 (edge)', () => {
  it('h04 노말 타워만으로 10단계 (레어 하나라도 있으면 아님, 타워 0개도 아님)', () => {
    const a = infinite(1, { debug: true });
    put(a, ['archer', 'miner']);
    jumpToStage(a, 10);
    expect(done(a, 'h04')).toBe(true);
    const b = infinite(1, { debug: true });
    put(b, ['archer', 'merchant']);
    jumpToStage(b, 10);
    expect(done(b, 'h04')).toBe(false);
    const c = infinite(1, { debug: true });
    jumpToStage(c, 10);
    expect(done(c, 'h04')).toBe(false);
  });

  it('h05 일꾼 공화국: 일꾼 10 + 타워 5개 이하로 10단계', () => {
    const a = infinite(1, { debug: true });
    a.state.workers = 10;
    put(a, ['archer', 'archer', 'archer', 'archer', 'archer']);
    jumpToStage(a, 10);
    expect(done(a, 'h05')).toBe(true);
    const b = infinite(1, { debug: true });
    b.state.workers = 10;
    put(b, ['archer', 'archer', 'archer', 'archer', 'archer', 'archer']);
    jumpToStage(b, 10);
    expect(done(b, 'h05')).toBe(false);
    const c = infinite(1, { debug: true });
    c.state.workers = 9;
    jumpToStage(c, 10);
    expect(done(c, 'h05')).toBe(false);
  });

  it('h08 소환 거부: 5단계 시작까지 소환 0회', () => {
    const a = infinite(1, { debug: true });
    jumpToStage(a, 5);
    expect(done(a, 'h08')).toBe(true);
    const b = infinite(1, { debug: true });
    b.state.summons = 1;
    jumpToStage(b, 5);
    expect(done(b, 'h08')).toBe(false);
  });

  it('h11 짠돌이: 강화 0회로 30단계', () => {
    const a = infinite(1, { debug: true });
    jumpToStage(a, 30);
    expect(done(a, 'h11')).toBe(true);
    const b = infinite(1, { debug: true });
    b.state.upgradesBought = 1;
    jumpToStage(b, 30);
    expect(done(b, 'h11')).toBe(false);
  });

  it('n30 무한: 몹 100마리 이상으로 시작한 단계를 넘기면 (다음 단계 시작 때) 달성, 99마리면 아님', () => {
    const m = infinite(1, { debug: true });
    /** 몹을 정확히 n마리로 맞추고 이번 단계 등장 대기열을 비운다 (다음 단계 시작 순간 몹 수 = n). */
    const setMobs = (n: number): void => {
      m.state.spawnNext = m.state.spawnQueue.length;
      for (const mob of m.mobs()) m.world.entities.remove(mob.id);
      for (let j = 0; j < n; j++) addMob(m, 'slime').speed = 0;
    };
    jumpToStage(m, 2);
    setMobs(99);
    jumpToStage(m, 3); // 99마리로 시작
    expect(m.state.dangerStage).toBe(0);
    setMobs(99);
    jumpToStage(m, 4);
    expect(done(m, 'n30')).toBe(false);
    setMobs(100);
    jumpToStage(m, 5); // 100마리로 시작
    expect(done(m, 'n30')).toBe(false);
    expect(m.state.dangerStage).toBe(5);
    setMobs(0); // 다 잡아도 그 단계를 넘기면 버틴 것
    jumpToStage(m, 6);
    expect(done(m, 'n30')).toBe(true);
  });

  it('n30 캠페인: 목숨 5 이하로 시작한 단계를 넘김', () => {
    const m = campaign(1);
    jumpToStage(m, 2);
    m.state.lives = 5;
    jumpToStage(m, 3);
    expect(done(m, 'n30')).toBe(false);
    jumpToStage(m, 4);
    expect(done(m, 'n30')).toBe(true);
  });

  it('h06 아슬아슬: 무한 몹 정확히 149마리 (150은 아님) / 캠페인 목숨 정확히 1', () => {
    const m = arena();
    for (let j = 0; j < 150; j++) addMob(m, 'slime').speed = 0;
    m.step();
    expect(m.mobCount()).toBe(150);
    expect(done(m, 'h06')).toBe(false);
    m.world.entities.remove(m.mobs()[0]!.id);
    m.step();
    expect(done(m, 'h06')).toBe(true);
    const c = campaign(1);
    c.state.lives = 2;
    c.step();
    expect(done(c, 'h06')).toBe(false);
    c.state.lives = 1;
    c.step();
    expect(done(c, 'h06')).toBe(true);
  });
});

describe('받기·모두 받기 (claimMission·claimAllMissions)', () => {
  it('[받기]: 보상(황금 손 보너스) + 받음 상태, 다시 받기·진행 중 받기는 실패', () => {
    const m = arena();
    m.state.goldPctBp = 2500;
    m.state.summons = 10;
    m.step();
    expect(status(m, 'n09')).toBe(MISSION_DONE);
    expect(missionsClaimable(m.state)).toBe(1);
    expect(claimCheck(m.ctx, idx('n09'))).toBeNull();
    const g0 = m.state.gold;
    command(m, { type: 'claimMission', i: idx('n09'), player: 0 });
    expect(m.state.gold - g0).toBe(125);
    expect(status(m, 'n09')).toBe(MISSION_CLAIMED);
    expect(missionsClaimable(m.state)).toBe(0);
    expect(eventsOf(m, 'missionClaim')).toEqual([expect.objectContaining({ id: 'n09', reward: 125 })]);
    command(m, { type: 'claimMission', i: idx('n09'), player: 0 });
    command(m, { type: 'claimMission', i: idx('n10'), player: 0 });
    command(m, { type: 'claimMission', i: 200, player: 0 });
    expect(eventsOf(m, 'missionClaimFail').map((e) => e.reason)).toEqual(['claimed', 'open', 'unknown']);
    expect(claimCheck(m.ctx, idx('n10'))).toBe('open');
  });

  it('[모두 받기]: 받을 수 있는 것 모두 번호 순, 합계 사건 · 없으면 none', () => {
    const m = arena();
    command(m, { type: 'claimAllMissions', player: 0 });
    expect(eventsOf(m, 'missionClaimFail').map((e) => e.reason)).toEqual(['none']);
    m.state.summons = 10;
    m.state.merges = 10;
    m.state.workers = 5;
    m.step();
    expect(missionsClaimable(m.state)).toBe(3);
    const g0 = m.state.gold;
    command(m, { type: 'claimAllMissions', player: 0 });
    const evs = m.world.drainEvents();
    expect(evs.filter((e) => e.type === 'missionClaim').map((e) => e.id)).toEqual(['n09', 'n12', 'n20']);
    expect(evs.find((e) => e.type === 'missionClaimAll')).toMatchObject({ count: 3, total: 700 });
    // 받은 뒤 보유금이 오르면 다른 미션이 달성될 수 있다 (같은 틱 미션 시스템) — 받은 돈은 정확히 700
    expect(m.state.gold - g0).toBe(700);
    expect(missionsClaimable(m.state)).toBe(0);
  });

  it('패배한 판에서는 받을 수 없다', () => {
    const m = arena();
    m.state.summons = 10;
    m.step();
    m.state.phase = 'defeat';
    expect(claimCheck(m.ctx, idx('n09'))).toBe('phase');
  });

  it('진행도: 받은 미션은 가득, stat은 목표에서 자름', () => {
    const m = arena();
    m.state.summons = 7;
    expect(missionProgress(m.ctx, m.world, idx('n09'))).toEqual([7, 10]);
    m.state.summons = 70;
    m.step();
    expect(missionProgress(m.ctx, m.world, idx('n09'))).toEqual([10, 10]);
    expect(missionProgress(m.ctx, m.world, idx('n11'))).toEqual([70, 100]);
    expect(missionProgress(m.ctx, m.world, idx('h04'))).toEqual([0, 1]);
  });
});

describe('결정성', () => {
  it('같은 시드·같은 명령이면 미션 상태·해시가 같다', () => {
    const run = (): [number[], number] => {
      const m = createMatch(data, { seed: 9, mode: 'infinite', debug: true });
      m.world.enqueue({ type: 'debugAddGold', amount: 50_000, player: 0, tick: 0 });
      for (let j = 0; j < 12; j++) m.world.enqueue({ type: 'gamble', t: 0, player: 0, tick: 2 + j });
      for (let j = 0; j < 5; j++) m.world.enqueue({ type: 'upgrade', k: 0, player: 0, tick: 30 + j });
      m.stepN(1300);
      return [[...m.state.missionStatus], m.hash()];
    };
    const [a, ha] = run();
    const [b, hb] = run();
    expect(a).toEqual(b);
    expect(ha).toBe(hb);
    expect(a.filter((s) => s !== MISSION_OPEN).length).toBeGreaterThanOrEqual(2); // 강화 5회(n15)·도박 10회(n18) 등
  });
});
