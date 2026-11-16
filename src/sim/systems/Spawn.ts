/**
 * 몹 등장 (DEV_PLAN M1-4, ENEMIES.md 3.2).
 *
 * - 단계가 시작되면 등장 구성표에서 그 단계의 20칸을 펼쳐 **세계 난수**로 섞는다.
 *   섞은 뒤 치유사는 무리 가운데(8~12번째), 투명 몹은 무리 뒤쪽(15번째 이후)에 놓는다 (enemies.json spawnOrder).
 * - 2.5초(50틱) 간격으로 한 칸씩 나온다 → 20칸이 50초 동안. 첫 칸은 단계 시작 틱에 바로.
 * - 암흑 고블린 떼처럼 swarm이 있는 몹은 1칸에 그 수만큼 같은 틱에 붙어서 나온다 (몹 수는 마리마다 1).
 * - 보스 단계(10의 배수)에는 일반 몹이 나오지 않고 단계 시작 틱에 보스 1마리가 경로 시작점에 나온다 (GDD 2.2, M4-5).
 *   보스 = HP(s) × 보스 체력 배율 × 테마 배율, 방어·마저는 단계 성장 + 테마 추가, 처치 보상은 모든 조각을 잡았을 때 한 번(Kill).
 *   어느 보스인지는 BossSchedule (무한 = 순환표, 캠페인 = 테마 배치표). 보스 단계 + 제한 시간(60초)에 살아 있으면 패배 (Stage).
 * - 편대 단계(무한 45단계부터 5의 배수, M4-3b)는 구성표 대신 편대 20칸 (Formation).
 * - 몹 스탯 = 기준 체력 HP(s) × 몹 체력 배율 × 테마 배율, 방어·마저는 단계 성장, 보상은 (10 + ⌊s/10⌋) × 배율 (rules.ts).
 * - 정예 몹 (ENEMIES.md 2장, 51단계부터): 대기열에서 나오는 몹마다 세계 난수로 1.5% → 체력 ×5·보상 ×10 (조각·보스 소환 몹은 아님).
 * - 방패병은 최대 체력 30% 보호막을 들고 나온다 (M4-3). 치유사는 나온 뒤 3초부터 치유 (MobTraits).
 * - 투명 몹이 나오는데 판 위에 감지 타워가 없으면 판당 한 번 'invisibleWarn' 사건 (ENEMIES.md 5장 경고 배너).
 */
import type { Rng } from '../Rng';
import type { System, World } from '../World';
import { STREAM_WORLD } from '../World';
import { mulBp } from '../Fixed';
import { MOB_KIND, emptyMobStatus, emptyMobTraits, type Mob } from '../entities/Mob';
import { isTower } from '../entities/Tower';
import { compositionFor, isBossStage, spawnStats, stageArmor, stageHp, type BossStats, type MatchRules } from '../rules';
import type { MatchContext } from '../state';
import { bossForStage } from './BossSchedule';
import { chooseFormation, formationById, formationSlots } from './Formation';
import { bossSpawned } from '../bosses';

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

/** spawnMob 선택 값: 자리·체력·속도·보상·투명·단계를 바꿔서 만든다 (조각·보스 소환·정예). */
export interface SpawnOpts {
  /** 경로 진행도 (기본 0 = 시작점)와 이동 나머지 */
  progress?: number;
  moveRem?: number;
  /** 체력 (최대 체력도 같이, 최소 1) */
  hp?: number;
  /** 이동속도 (단위/초) */
  speed?: number;
  /** 처치 보상 (원) */
  reward?: number;
  /** 투명 (망령 군주가 소환하는 유령) */
  invisible?: boolean;
  /** 이 단계의 스탯으로 (기본 = 지금 단계). 조각은 부모가 나온 단계 */
  stage?: number;
  small?: boolean;
  elite?: boolean;
}

/** 판 위에 감지 타워(감지 오라·감지 자신)가 있는가. */
export function hasDetector(ctx: MatchContext, world: World): boolean {
  for (const e of world.entities.list()) {
    if (!isTower(e)) continue;
    const d = ctx.rules.towers.get(e.tower)?.detect;
    if (d === 'aura' || d === 'self') return true;
  }
  return false;
}

/** 투명 몹이 나올 때: 감지 타워가 없으면 판당 한 번 경고 사건. */
function noteInvisible(ctx: MatchContext, world: World, mob: Mob): void {
  if (!mob.invisible || ctx.state.invisibleWarned) return;
  if (hasDetector(ctx, world)) return;
  ctx.state.invisibleWarned = true;
  world.emit('invisibleWarn', { id: mob.id, mob: mob.mob });
}

/** 몹 한 마리를 만든다 (기본: 지금 단계 스탯으로 경로 시작점에). 떼의 한 마리, 조각, 보스 소환, 테스트용으로도 씀. */
export function spawnMob(ctx: MatchContext, world: World, mobId: string, swarmIndex = 0, opts: SpawnOpts = {}): Mob {
  const stats = ctx.rules.mobs.get(mobId);
  if (!stats) throw new Error(`없는 몹: ${mobId}`);
  const stage = opts.stage ?? ctx.state.stage;
  const s = spawnStats(ctx.rules, stats, stage, ctx.theme);
  let hp = opts.hp ?? s.hp;
  let reward = opts.reward ?? s.reward;
  const elite = opts.elite === true;
  if (elite) {
    hp = mulBp(hp, ctx.rules.eliteHpMulBp);
    reward = mulBp(reward, ctx.rules.eliteRewardMulBp);
  }
  if (hp < 1) hp = 1;
  const shield = stats.shield ? mulBp(hp, stats.shield.pctBp) : 0;
  const mob = world.entities.add({
    kind: MOB_KIND,
    mob: mobId,
    stage,
    hp,
    maxHp: hp,
    armor: s.armor,
    magicRes: s.magicRes,
    speed: opts.speed ?? stats.speed,
    ccResistBp: stats.ccResistBp,
    lifeDamage: stats.lifeDamage,
    reward,
    progress: opts.progress ?? 0,
    moveRem: opts.moveRem ?? 0,
    swarmIndex,
    invisible: opts.invisible ?? stats.invisible,
    legion: stats.legion,
    boss: false,
    vulnBp: 0,
    markBp: 0,
    ...emptyMobStatus(),
    ...emptyMobTraits(),
    elite,
    shield,
    maxShield: shield,
    small: opts.small === true,
    // 치유사: 나온 뒤 주기만큼 지나야 첫 치유
    traitAt: stats.heal ? world.tick + stats.heal.intervalTicks : -1,
  } satisfies Omit<Mob, 'id'>) as Mob;
  ctx.state.spawned += 1;
  noteInvisible(ctx, world, mob);
  return mob;
}

/** 이 몹을 정예로 만들까 (51단계부터 세계 난수 1.5%). 정예 단계 전이거나 확률 0이면 난수를 쓰지 않는다. */
function rollElite(ctx: MatchContext, world: World): boolean {
  const { rules, state } = ctx;
  if (state.stage < rules.eliteFromStage || rules.eliteChanceBp <= 0) return false;
  return world.rng(STREAM_WORLD).chanceBp(rules.eliteChanceBp);
}

/** 칸 하나를 내보낸다: swarm 수만큼 같은 틱에. 대기열 칸이면(queue) 몹마다 정예 판정. */
export function spawnSlot(ctx: MatchContext, world: World, mobId: string, queue = false): Mob[] {
  const stats = ctx.rules.mobs.get(mobId);
  if (!stats) throw new Error(`없는 몹: ${mobId}`);
  const out: Mob[] = [];
  for (let i = 0; i < stats.swarm; i++) out.push(spawnMob(ctx, world, mobId, i, queue && rollElite(ctx, world) ? { elite: true } : {}));
  world.emit('spawn', { mob: mobId, count: stats.swarm, first: (out[0] as Mob).id });
  return out;
}

/** 보스의 실제 스탯 (단계 s, 테마 보정): 체력 = HP(s) × 보스 배율 × 테마 배율, 방어·마저 = 단계 성장 + 테마 추가. */
export function bossSpawnStats(ctx: Pick<MatchContext, 'rules' | 'theme' | 'state'>, boss: BossStats, stage: number): { hp: number; armor: number; magicRes: number } {
  const firstInfiniteBoss = ctx.state.mode === 'infinite' && stage === ctx.rules.bossEvery;
  const hpMulBp = firstInfiniteBoss ? boss.firstInfiniteHpMulBp ?? boss.hpMulBp : boss.hpMulBp;
  const hp = mulBp(mulBp(stageHp(ctx.rules, stage), hpMulBp), ctx.theme.hpMulBp);
  return {
    hp: hp < 1 ? 1 : hp,
    armor: stageArmor(ctx.rules, boss.armor, stage) + ctx.theme.armorOffset,
    magicRes: stageArmor(ctx.rules, boss.magicRes, stage) + ctx.theme.armorOffset,
  };
}

/**
 * 보스 등장 (M4-5): 경로 시작점에 보스 1마리 + 판 상태(보스 id·번호·체력·제한 시각) + 'bossSpawn' 사건.
 * 보스 처치 보상은 몹 보상이 아니라 모든 조각을 잡았을 때(Kill) 한 번 → 몹 reward = 0. 캠페인에서 출구에 닿으면 바로 패배(Movement).
 */
export function spawnBoss(ctx: MatchContext, world: World, boss: BossStats, stage: number): Mob {
  const { state, rules } = ctx;
  const s = bossSpawnStats(ctx, boss, stage);
  const mob = world.entities.add({
    kind: MOB_KIND,
    mob: boss.id,
    stage,
    hp: s.hp,
    maxHp: s.hp,
    armor: s.armor,
    magicRes: s.magicRes,
    speed: boss.speed,
    ccResistBp: boss.ccResistBp,
    lifeDamage: 0,
    reward: 0,
    progress: 0,
    moveRem: 0,
    swarmIndex: 0,
    invisible: boss.invisible,
    legion: boss.legion,
    boss: true,
    vulnBp: 0,
    markBp: 0,
    ...emptyMobStatus(),
    ...emptyMobTraits(),
  } satisfies Omit<Mob, 'id'>) as Mob;
  state.spawned += 1;
  state.bossId = boss.id;
  state.bossNum = Math.floor(stage / rules.bossEvery);
  state.bossMaxHp = s.hp;
  state.bossDeadline = world.tick + rules.bossTimeTicks;
  bossSpawned(ctx, world, mob);
  world.emit('bossSpawn', { id: mob.id, boss: boss.id, stage, hp: s.hp });
  noteInvisible(ctx, world, mob);
  return mob;
}

/** 새 단계의 등장 대기열 만들기. 보스 단계는 빈 대기열 + 보스 등장, 편대 단계는 편대 20칸. */
export function startStageQueue(ctx: MatchContext, world: World): void {
  const { state, rules } = ctx;
  state.spawnStage = state.stage;
  state.spawnNext = 0;
  state.spawnNextTick = world.tick;
  if (isBossStage(rules, state.stage)) {
    state.spawnQueue = [];
    const boss = bossForStage(rules, state.mode, state.theme, state.stage);
    if (boss) spawnBoss(ctx, world, boss, state.stage);
    return;
  }
  const fid = chooseFormation(ctx, world, state.stage);
  const formation = fid ? formationById(rules, fid) : undefined;
  if (formation) world.emit('formationStart', { stage: state.stage, id: formation.id });
  const slots = formation ? formationSlots(formation) : stageSlots(rules, state.stage);
  state.spawnQueue = arrangeSlots(slots, rules, world.rng(STREAM_WORLD));
}

export function createSpawnSystem(ctx: MatchContext): System {
  return (world) => {
    const { state, rules } = ctx;
    if (state.phase !== 'playing') return;
    if (state.stage > 0 && state.spawnStage !== state.stage) startStageQueue(ctx, world);
    while (state.spawnNext < state.spawnQueue.length && world.tick >= state.spawnNextTick) {
      spawnSlot(ctx, world, state.spawnQueue[state.spawnNext] as string, true);
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
