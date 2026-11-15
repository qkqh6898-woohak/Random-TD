/**
 * 판 안 미션 (DEV_PLAN M5-6, GDD 8장): 일반 30개 + 히든 11개 (src/data/missions.json). 판마다 초기화.
 *
 * **이벤트 구독 방식 추적기**: World.on으로 sim 사건을 구독해 사건으로만 알 수 있는 조건을 세고(연속 도박·단계 도달·위기 버티기),
 * 판 상태만 보면 되는 조건(횟수·보유금·강화 레벨·방치·몹 수)은 틱 끝의 미션 시스템이 열린 미션만 확인한다.
 * 타워 보유 조건(서로 다른 n종·같은 타워 n개·n개·첫 획득·고블린 계열)은 타워가 바뀐 틱(summon·merge·mergePicked 사건)에만 센다.
 *
 * 조건 종류 (missions.json notes):
 * - distinct / same / towers / own / family: 판 위 타워 (2인 판은 두 사람 것을 함께 — 지갑·미션이 판에 하나).
 * - stat: 판 상태 key가 n 이상 (summons·merges·upgrades(강화 횟수)·gambles·workers·gold·kills·bossesKilled·challengeBest·challengeClears·stage).
 * - upgradeLevel: 등급·능력치 강화 key의 레벨이 n 이상 (어느 플레이어든).
 * - idle: 마지막 플레이어 명령(noop 제외)부터 seconds초 (일시정지 중에는 틱이 멈춰 세지 않는다). 판 시작부터 센다.
 *   sim은 명령만 안다 — 정보 패널·시트를 여는 것처럼 상태를 바꾸지 않는 터치는 방치를 깨지 않는다.
 * - danger: 몹 mobs마리 이상(캠페인: 목숨 lives 이하)으로 시작한 단계를 패배 없이 넘기면 (다음 단계 시작 때) 달성.
 * - gamble: 조건(table·minMul·maxMul·maxGold = 도박 직전 보유금 상한)에 맞는 도박이 n번 연속. 안 맞는 도박이 끼면 0부터.
 *   table을 정한 미션은 그 테이블 도박만 본다 (T-2: 테이블을 동시에 돌려도 다른 테이블 도박이 연속을 끊지 않는다). table이 없으면
 *   모든 테이블의 도박을 실행 순서대로 본다.
 * - reach: stage단계가 시작되는 순간 조건(onlyGrade = 타워 1개 이상이고 모두 그 등급, minWorkers·maxTowers·maxSummons·maxUpgrades).
 * - edge: 무한 = 몹 수가 정확히 한도 − belowLimit (149), 캠페인 = 목숨이 정확히 lives (1).
 *
 * 달성하면 missionStatus[i] = 1 (받을 수 있음) + 'missionDone' { i, id, hidden, reward }. 한 틱에 여럿이면 미션 번호 순.
 * 명령 claimMission {i} → 보상(earnGold, 카드 '황금 손' 보너스 받음) + 상태 2 + 'missionClaim' { i, id, reward }.
 * claimAllMissions → 받을 수 있는 것 모두 번호 순 + 'missionClaimAll' { count, total }.
 * 실패: 'missionClaimFail' { i, reason: phase · unknown · open · claimed · none } (상태 그대로).
 * 히든 미션의 '영구 기록'은 판 밖(meta) 일이라 화면이 missionDone 사건을 받아 저장한다.
 */
import type { Command } from '../Commands';
import type { System, World } from '../World';
import { TICK_HZ } from '../World';
import type { MissionCond, MissionData } from '../../data/load';
import { countMobs } from '../entities/Mob';
import { isTower } from '../entities/Tower';
import type { MatchRules } from '../rules';
import { MISSION_CLAIMED, MISSION_DONE, MISSION_OPEN, type MatchContext, type MatchState } from '../state';
import { earnGold } from './Economy';
import { upgradeLevel } from './Upgrade';

export type MissionClaimFail = 'phase' | 'unknown' | 'open' | 'claimed' | 'none';

/** 판 위 타워 묶음 요약 (보유 조건용). */
export interface TowerCensus {
  /** 타워 수 */
  total: number;
  /** 타워 id → 수 */
  byId: Map<string, number>;
}

/** 판 위 타워를 센다 (ID 순으로 돌지만 결과는 순서와 무관). */
export function towerCensus(world: World): TowerCensus {
  const byId = new Map<string, number>();
  let total = 0;
  for (const e of world.entities.list()) {
    if (!isTower(e)) continue;
    total++;
    byId.set(e.tower, (byId.get(e.tower) ?? 0) + 1);
  }
  return { total, byId };
}

/** 보유 조건 하나를 판 위 타워로 판정. 보유 조건이 아니면 false. */
export function censusMet(rules: Pick<MatchRules, 'towers'>, cond: MissionCond, census: TowerCensus): boolean {
  const gradeOf = (id: string): string | undefined => rules.towers.get(id)?.grade;
  switch (cond.type) {
    case 'towers':
      return census.total >= (cond.n ?? 0);
    case 'distinct': {
      let n = 0;
      for (const id of census.byId.keys()) if (gradeOf(id) === cond.grade) n++;
      return n >= (cond.n ?? 0);
    }
    case 'same': {
      for (const [id, count] of census.byId) {
        if (cond.grade !== undefined && gradeOf(id) !== cond.grade) continue;
        if (count >= (cond.n ?? 0)) return true;
      }
      return false;
    }
    case 'own':
      for (const id of census.byId.keys()) if (gradeOf(id) === cond.grade) return true;
      return false;
    case 'family': {
      let n = 0;
      for (const id of cond.towers ?? []) n += census.byId.get(id) ?? 0;
      return n >= (cond.n ?? 0);
    }
    default:
      return false;
  }
}

const CENSUS_TYPES: ReadonlySet<string> = new Set(['towers', 'distinct', 'same', 'own', 'family']);

/** 보유 조건인가 (타워가 바뀐 틱에만 센다). */
export function isCensusCond(cond: MissionCond): boolean {
  return CENSUS_TYPES.has(cond.type);
}

/** stat 조건이 읽는 판 상태 값. */
export function missionStatValue(state: MatchState, key: string): number {
  switch (key) {
    case 'summons':
      return state.summons;
    case 'merges':
      return state.merges;
    case 'upgrades':
      return state.upgradesBought;
    case 'gambles':
      return state.gambles;
    case 'workers':
      return state.workers;
    case 'gold':
      return state.gold;
    case 'kills':
      return state.kills;
    case 'bossesKilled':
      return state.bossesKilled;
    case 'challengeBest':
      return state.challengeBest;
    case 'challengeClears':
      return state.challengeClears;
    case 'stage':
      return state.stage;
    default:
      return 0;
  }
}

/** 진행도 (화면 진행도 바): [지금, 목표]. 진행도로 나타낼 수 없는 조건은 [0, 1] (달성하면 [1, 1]). */
export function missionProgress(ctx: Pick<MatchContext, 'rules' | 'state'>, world: World, i: number, census?: TowerCensus): [number, number] {
  const m = ctx.rules.missions[i];
  if (!m) return [0, 1];
  const st = ctx.state.missionStatus[i] ?? MISSION_OPEN;
  const c = m.cond;
  const cap = (v: number, n: number): [number, number] => [st !== MISSION_OPEN ? n : v > n ? n : v, n];
  switch (c.type) {
    case 'stat':
      return cap(missionStatValue(ctx.state, c.key ?? ''), c.n ?? 1);
    case 'upgradeLevel': {
      const u = ctx.rules.upgrades.find((x) => x.id === c.key);
      let best = 0;
      if (u) for (let p = 0; p < ctx.state.upgrades.length; p++) best = Math.max(best, upgradeLevel(ctx.state, p, u.k));
      return cap(best, c.n ?? 1);
    }
    case 'idle': {
      const need = idleTicks(c);
      return cap(Math.floor((world.tick - ctx.state.lastActTick) / TICK_HZ), Math.floor(need / TICK_HZ));
    }
    case 'gamble':
      return cap(ctx.state.missionCount[i] ?? 0, c.n ?? 1);
    case 'towers':
    case 'family':
    case 'distinct':
    case 'same': {
      const cs = census ?? towerCensus(world);
      let v = 0;
      if (c.type === 'towers') v = cs.total;
      else if (c.type === 'family') for (const id of c.towers ?? []) v += cs.byId.get(id) ?? 0;
      else if (c.type === 'distinct') for (const id of cs.byId.keys()) v += ctx.rules.towers.get(id)?.grade === c.grade ? 1 : 0;
      else for (const [id, count] of cs.byId) if (c.grade === undefined || ctx.rules.towers.get(id)?.grade === c.grade) v = Math.max(v, count);
      return cap(v, c.n ?? 1);
    }
    default:
      return st !== MISSION_OPEN ? [1, 1] : [0, 1];
  }
}

/** 방치 조건의 틱 수. */
function idleTicks(c: MissionCond): number {
  // seconds는 스키마가 1틱(0.05초) 단위를 보장한다 (tickSeconds) — × TICK_HZ = 정수 틱
  return Math.round((c.seconds ?? 0) * TICK_HZ);
}

/** 미션 i를 달성 처리 (열려 있을 때만). */
function complete(ctx: MatchContext, world: World, i: number): void {
  const { state, rules } = ctx;
  if (state.missionStatus[i] !== MISSION_OPEN) return;
  const m = rules.missions[i] as MissionData;
  state.missionStatus[i] = MISSION_DONE;
  world.emit('missionDone', { i, id: m.id, hidden: m.hidden, reward: m.reward });
}

/** 도박 사건이 gamble 조건에 맞는가. */
function gambleMatches(c: MissionCond, ev: { t: number; mul: number; before: number }, rules: Pick<MatchRules, 'gambleTables'>): boolean {
  const cost = rules.gambleTables[ev.t]?.cost;
  if (c.table !== undefined && cost !== c.table) return false;
  // 배율은 사건에 bp 정수로 실린다 (×0.5 = 5000)
  if (c.minMul !== undefined && ev.mul < Math.round(c.minMul * 10000)) return false;
  if (c.maxMul !== undefined && ev.mul > Math.round(c.maxMul * 10000)) return false;
  if (c.maxGold !== undefined && ev.before > c.maxGold) return false;
  return true;
}

/** stage단계 시작 순간의 reach 조건. */
function reachMet(ctx: MatchContext, c: MissionCond, census: TowerCensus): boolean {
  const { state, rules } = ctx;
  if (state.stage !== c.stage) return false;
  if (c.onlyGrade !== undefined) {
    if (census.total === 0) return false;
    for (const id of census.byId.keys()) if (rules.towers.get(id)?.grade !== c.onlyGrade) return false;
  }
  if (c.minWorkers !== undefined && state.workers < c.minWorkers) return false;
  if (c.maxTowers !== undefined && census.total > c.maxTowers) return false;
  if (c.maxSummons !== undefined && state.summons > c.maxSummons) return false;
  if (c.maxUpgrades !== undefined && state.upgradesBought > c.maxUpgrades) return false;
  return true;
}

/** 위기 단계인가 (무한: 몹 mobs마리 이상, 캠페인: 목숨 lives 이하). */
function inDanger(ctx: MatchContext, world: World, c: MissionCond): boolean {
  const { state } = ctx;
  return state.mode === 'campaign' ? state.lives <= (c.lives ?? 0) : countMobs(world) >= (c.mobs ?? Number.MAX_SAFE_INTEGER);
}

/** 아슬아슬 (edge): 무한 = 몹 수 정확히 한도 − belowLimit, 캠페인 = 목숨 정확히 lives. */
function edgeMet(ctx: MatchContext, world: World, c: MissionCond): boolean {
  const { state } = ctx;
  if (state.mode === 'campaign') return state.lives === c.lives && state.lives > 0;
  return countMobs(world) === state.mobLimit - (c.belowLimit ?? 0);
}

/**
 * 미션 추적기 설치: 사건 구독 + 명령 훅 + 틱 끝 시스템. createMatch가 World를 만든 뒤 부른다.
 * 돌려주는 시스템은 경제 다음·패배 앞에 둔다 (match.ts가 World를 만들 때 자리를 비워 두고 채운다).
 */
export function installMissionTracker(ctx: MatchContext, world: World): System {
  const { rules, state } = ctx;
  const missions = rules.missions;
  let towersDirty = true;
  const markTowers = (): void => {
    towersDirty = true;
  };
  world.on('summon', markTowers);
  world.on('merge', markTowers);
  world.on('mergePicked', markTowers);
  world.on('sell', markTowers);
  world.on('convert', markTowers);
  // 방치: 마지막 플레이어 명령 틱 (noop 제외 — 락스텝 빈 명령은 조작이 아니다)
  world.setBeforeCommand((w: World, cmd: Command) => {
    if (cmd.type !== 'noop') state.lastActTick = w.tick;
  });
  // 연속 도박
  world.on('gamble', (w, ev) => {
    const g = { t: ev.t as number, mul: ev.mul as number, before: ev.before as number };
    missions.forEach((m, i) => {
      if (m.cond.type !== 'gamble' || state.missionStatus[i] !== MISSION_OPEN) return;
      // 테이블을 정한 미션은 그 테이블의 도박만 센다 — 다른 테이블을 함께 돌려도 연속이 끊기지 않는다 (T-2 테이블 동시 도박)
      if (m.cond.table !== undefined && rules.gambleTables[g.t]?.cost !== m.cond.table) return;
      const n = gambleMatches(m.cond, g, rules) ? (state.missionCount[i] ?? 0) + 1 : 0;
      state.missionCount[i] = n;
      if (n >= (m.cond.n ?? 1)) complete(ctx, w, i);
    });
  });
  // 단계 시작: 위기 버티기 확인 → 새 단계 위기 여부, 단계 도달 조건
  world.on('stageStart', (w) => {
    let census: TowerCensus | null = null;
    missions.forEach((m, i) => {
      if (state.missionStatus[i] !== MISSION_OPEN) return;
      const c = m.cond;
      if (c.type === 'danger') {
        if (state.dangerStage > 0 && state.stage > state.dangerStage && state.phase === 'playing') complete(ctx, w, i);
      } else if (c.type === 'reach') {
        census ??= towerCensus(w);
        if (reachMet(ctx, c, census)) complete(ctx, w, i);
      }
    });
    // 이번 단계가 위기로 시작했는가 (위기 미션이 아직 열려 있을 때만 센다)
    let danger = 0;
    missions.forEach((m, i) => {
      if (m.cond.type === 'danger' && state.missionStatus[i] === MISSION_OPEN && inDanger(ctx, w, m.cond)) danger = state.stage;
    });
    state.dangerStage = danger;
  });
  return (w) => {
    if (state.phase !== 'playing') return;
    let census: TowerCensus | null = null;
    const tick = w.tick;
    for (let i = 0; i < missions.length; i++) {
      if (state.missionStatus[i] !== MISSION_OPEN) continue;
      const c = (missions[i] as MissionData).cond;
      switch (c.type) {
        case 'stat':
          if (missionStatValue(state, c.key ?? '') >= (c.n ?? 0)) complete(ctx, w, i);
          break;
        case 'upgradeLevel': {
          const u = rules.upgrades.find((x) => x.id === c.key);
          if (!u) break;
          for (let p = 0; p < state.upgrades.length; p++) {
            if (upgradeLevel(state, p, u.k) >= (c.n ?? 0)) {
              complete(ctx, w, i);
              break;
            }
          }
          break;
        }
        case 'idle':
          if (tick - state.lastActTick >= idleTicks(c)) complete(ctx, w, i);
          break;
        case 'edge':
          if (edgeMet(ctx, w, c)) complete(ctx, w, i);
          break;
        default:
          if (towersDirty && isCensusCond(c)) {
            census ??= towerCensus(w);
            if (censusMet(rules, c, census)) complete(ctx, w, i);
          }
      }
    }
    towersDirty = false;
  };
}

/** 받을 수 있는(달성했지만 받지 않은) 미션 수 — 하단 메뉴 배지 '2 받기'. */
export function missionsClaimable(state: Pick<MatchState, 'missionStatus'>): number {
  let n = 0;
  for (const s of state.missionStatus) if (s === MISSION_DONE) n++;
  return n;
}

/** 미션 i 보상을 받을 수 있는지. 되면 null. */
export function claimCheck(ctx: Pick<MatchContext, 'rules' | 'state'>, i: number): MissionClaimFail | null {
  const { state, rules } = ctx;
  if (state.phase !== 'playing') return 'phase';
  if (!rules.missions[i]) return 'unknown';
  const st = state.missionStatus[i];
  if (st === MISSION_OPEN) return 'open';
  if (st === MISSION_CLAIMED) return 'claimed';
  return null;
}

/** 미션 i 보상 받기 (검사 통과 후). 실제 받은 돈. */
function claimOne(ctx: MatchContext, world: World, i: number): number {
  const m = ctx.rules.missions[i] as MissionData;
  ctx.state.missionStatus[i] = MISSION_CLAIMED;
  const reward = m.reward > 0 ? earnGold(ctx.state, m.reward) : 0;
  world.emit('missionClaim', { i, id: m.id, reward });
  return reward;
}

/** claimMission 명령. 받은 돈, 실패하면 null. */
export function claimMission(ctx: MatchContext, world: World, i: number): number | null {
  const fail = claimCheck(ctx, i);
  if (fail) {
    world.emit('missionClaimFail', { i, reason: fail });
    return null;
  }
  return claimOne(ctx, world, i);
}

/** claimAllMissions 명령: 받을 수 있는 미션 모두 (번호 순). 받은 돈 합, 하나도 없으면 null. */
export function claimAllMissions(ctx: MatchContext, world: World): number | null {
  const { state } = ctx;
  if (state.phase !== 'playing') {
    world.emit('missionClaimFail', { i: -1, reason: 'phase' });
    return null;
  }
  let total = 0;
  let count = 0;
  for (let i = 0; i < state.missionStatus.length; i++) {
    if (state.missionStatus[i] !== MISSION_DONE) continue;
    total += claimOne(ctx, world, i);
    count++;
  }
  if (count === 0) {
    world.emit('missionClaimFail', { i: -1, reason: 'none' });
    return null;
  }
  world.emit('missionClaimAll', { count, total });
  return total;
}
