/**
 * 몹 등장 (DEV_PLAN M1-4, ENEMIES.md 3.2).
 *
 * - 단계가 시작되면 등장 구성표에서 그 단계의 20칸을 펼쳐 **세계 난수**로 섞는다.
 *   섞은 뒤 치유사는 무리 가운데(8~12번째), 투명 몹은 무리 뒤쪽(15번째 이후)에 놓는다 (enemies.json spawnOrder).
 * - 2.5초(50틱) 간격으로 한 칸씩 나온다 → 20칸이 50초 동안. 첫 칸은 단계 시작 틱에 바로.
 * - 암흑 고블린 떼처럼 swarm이 있는 몹은 1칸에 그 수만큼 같은 틱에 붙어서 나온다 (몹 수는 마리마다 1).
 * - 보스 단계(10의 배수)에는 일반 몹이 나오지 않는다 (GDD 2.2). 보스 등장은 M4.
 * - 몹 스탯 = 기준 체력 HP(s) × 몹 체력 배율 × 테마 배율, 방어·마저는 단계 성장, 보상은 (10 + ⌊s/10⌋) × 배율 (rules.ts).
 */
import type { Rng } from '../Rng';
import type { System, World } from '../World';
import { STREAM_WORLD } from '../World';
import { MOB_KIND, emptyMobStatus, type Mob } from '../entities/Mob';
import { compositionFor, isBossStage, spawnStats, type MatchRules } from '../rules';
import type { MatchContext } from '../state';

/** 그 단계의 칸 목록 (섞기 전, 몹 순서 = enemies.json 순서). 구성이 없으면 빈 배열. */
export function stageSlots(rules: MatchRules, stage: number): string[] {
  const band = compositionFor(rules, stage);
  if (!band) return [];
  const out: string[] = [];
  for (const [id, count] of band.mix) for (let i = 0; i < count; i++) out.push(id);
  return out;
}

/**
 * [from, to] 범위(0부터, 양 끝 포함)의 빈 칸 중에서 count개를 고를 후보.
 * - 범위 안 빈 칸이 count개 이상이면 범위 안 빈 칸 전부 (그중 무작위로 고른다).
 * - 모자라면 범위 밖으로 가까운 칸부터 넓혀 정확히 count개: dir = 'down'이면 앞쪽(작은 번호)부터, 'both'면 앞뒤 번갈아.
 *   (예: 투명 몹이 뒤쪽 6칸보다 많으면 14번째, 13번째 … 칸으로)
 */
function candidates(free: readonly boolean[], from: number, to: number, count: number, dir: 'down' | 'both'): number[] {
  const n = free.length;
  const lo = from < 0 ? 0 : from;
  const hi = to >= n ? n - 1 : to;
  const inside: number[] = [];
  for (let i = lo; i <= hi; i++) if (free[i]) inside.push(i);
  if (inside.length >= count) return inside;
  // 범위 밖 칸을 가까운 순서로 줄 세우기
  const outside: number[] = [];
  if (dir === 'down') {
    for (let i = lo - 1; i >= 0; i--) outside.push(i);
    for (let i = hi + 1; i < n; i++) outside.push(i);
  } else {
    for (let d = 1; lo - d >= 0 || hi + d < n; d++) {
      if (lo - d >= 0) outside.push(lo - d);
      if (hi + d < n) outside.push(hi + d);
    }
  }
  const out = inside;
  for (const i of outside) {
    if (out.length >= count) break;
    if (free[i]) out.push(i);
  }
  return out;
}

/**
 * 칸 목록을 섞어 등장 순서를 정한다 (같은 난수 → 같은 순서).
 * 1) 투명 몹: 뒤쪽 범위 안 무작위 자리  2) 가운데 몹(치유사): 가운데 범위 안 무작위 자리  3) 나머지: 섞어서 남은 자리에 차례로.
 */
export function arrangeSlots(slots: readonly string[], rules: MatchRules, rng: Rng): string[] {
  const n = slots.length;
  const out = new Array<string>(n).fill('');
  const free = new Array<boolean>(n).fill(true);
  const back: string[] = [];
  const middle: string[] = [];
  const rest: string[] = [];
  for (const id of slots) {
    if (rules.mobs.get(id)?.invisible) back.push(id);
    else if (rules.spawnOrder.middleMobs.has(id)) middle.push(id);
    else rest.push(id);
  }
  const place = (group: string[], from: number, to: number, dir: 'down' | 'both'): void => {
    if (group.length === 0) return;
    const spots = rng.shuffle(candidates(free, from, to, group.length, dir)).slice(0, group.length);
    group.forEach((id, i) => {
      const at = spots[i] as number;
      out[at] = id;
      free[at] = false;
    });
  };
  const so = rules.spawnOrder;
  place(back, so.backFrom, so.backTo, 'down');
  place(middle, so.middleFrom, so.middleTo, 'both');
  rng.shuffle(rest);
  let k = 0;
  for (let i = 0; i < n; i++) if (free[i]) out[i] = rest[k++] as string;
  return out;
}

/** 몹 한 마리를 경로 시작점에 만든다 (떼의 한 마리, 분열 몹, 테스트용으로도 씀). */
export function spawnMob(ctx: MatchContext, world: World, mobId: string, swarmIndex = 0): Mob {
  const stats = ctx.rules.mobs.get(mobId);
  if (!stats) throw new Error(`없는 몹: ${mobId}`);
  const stage = ctx.state.stage;
  const s = spawnStats(ctx.rules, stats, stage, ctx.theme);
  const mob = world.entities.add({
    kind: MOB_KIND,
    mob: mobId,
    stage,
    hp: s.hp,
    maxHp: s.hp,
    armor: s.armor,
    magicRes: s.magicRes,
    speed: stats.speed,
    ccResistBp: stats.ccResistBp,
    lifeDamage: stats.lifeDamage,
    reward: s.reward,
    progress: 0,
    moveRem: 0,
    swarmIndex,
    invisible: stats.invisible,
    legion: stats.legion,
    boss: false,
    vulnBp: 0,
    markBp: 0,
    ...emptyMobStatus(),
  } satisfies Omit<Mob, 'id'>) as Mob;
  ctx.state.spawned += 1;
  return mob;
}

/** 칸 하나를 내보낸다: swarm 수만큼 같은 틱에. */
export function spawnSlot(ctx: MatchContext, world: World, mobId: string): Mob[] {
  const stats = ctx.rules.mobs.get(mobId);
  if (!stats) throw new Error(`없는 몹: ${mobId}`);
  const out: Mob[] = [];
  for (let i = 0; i < stats.swarm; i++) out.push(spawnMob(ctx, world, mobId, i));
  world.emit('spawn', { mob: mobId, count: stats.swarm, first: (out[0] as Mob).id });
  return out;
}

/** 새 단계의 등장 대기열 만들기 (보스 단계는 빈 대기열). */
export function startStageQueue(ctx: MatchContext, world: World): void {
  const { state, rules } = ctx;
  state.spawnStage = state.stage;
  state.spawnNext = 0;
  state.spawnNextTick = world.tick;
  if (isBossStage(rules, state.stage)) {
    state.spawnQueue = [];
    return;
  }
  state.spawnQueue = arrangeSlots(stageSlots(rules, state.stage), rules, world.rng(STREAM_WORLD));
}

export function createSpawnSystem(ctx: MatchContext): System {
  return (world) => {
    const { state, rules } = ctx;
    if (state.phase !== 'playing') return;
    if (state.stage > 0 && state.spawnStage !== state.stage) startStageQueue(ctx, world);
    while (state.spawnNext < state.spawnQueue.length && world.tick >= state.spawnNextTick) {
      spawnSlot(ctx, world, state.spawnQueue[state.spawnNext] as string);
      state.spawnNext += 1;
      state.spawnNextTick += rules.spawnIntervalTicks;
    }
    if (state.spawnQueue.length > 0 && state.spawnNext >= state.spawnQueue.length) {
      // 다 나왔으면 비운다 (해시를 작게)
      state.spawnQueue = [];
      state.spawnNext = 0;
    }
  };
}
