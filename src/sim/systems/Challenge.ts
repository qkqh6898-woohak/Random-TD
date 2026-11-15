/**
 * 도전 (DEV_PLAN M5-2, GDD 6장, ENEMIES.md 7장): 하단 [도전] 탭에서 고르는 세미 보스 10단계.
 *
 * - 명령 `startChallenge {lv}`: 도전 보스가 경로 시작점에 나온다. **제한 시간 30초** (game.json challenge.timeLimitSeconds).
 *   - 처치: 보상(돈, 카드 '황금 손' 보너스 받음) + 처음 처치면 다음 단계 해금 (해금은 판마다 초기화) → 'challengeClear'.
 *   - 실패(시간 초과 / 캠페인 출구 도달): 보스가 사라진다. 패배도 목숨 감소도 없다 → 'challengeFail' { reason: time · escape }.
 *   - 끝나면(처치·실패 모두) 그 단계만 **5분 쿨타임** (단계마다 독립). 쿨타임이 끝나면 'challengeReady' { lv } (화면: '도전 n단계 준비 완료').
 * - 동시에 1개만. 도전 보스는 몹 수 한도(150)에 넣지 않는다 (entities/Mob countMobs). '보스'로 취급 → 보스 피해 배율·보스 우선 대상·
 *   보스 상태 이상 규칙(둔화 절반·행동 불가 30%)이 그대로 적용된다. 판의 보스(제한 시간 패배·보스 처치 보상·카드)와는 따로 센다.
 * - 체력·방어·마저는 단계와 관계없이 데이터 고정값 (체력 2700 × 2.2^(n−1), 표 그대로).
 * - 특수 능력 (enemies.json challenges, 틱마다 MobTraits가 challengeTick을 부른다):
 *   도둑 고블린 속도 1.8(데이터) / 돌거북 물리 저항(방어 80) / 쌍둥이 박쥐 = 2마리가 체력 하나를 같이 씀(한 마리가 맞으면 둘 다 같은 체력,
 *   함께 죽음, 보상 한 번) / 강철 골렘 둔화 면역 / 그림자 늑대 5초마다 2칸 앞으로 순간이동 / 서리 거인 8초마다 반경 2칸 타워 2초 동결
 *   (Tower.stunUntil — 공격·주기 능력 불가) / 화염 정령왕 화상 면역 + 1초마다 체력 1% 회복 / 망령 기사 투명(감지 필요) /
 *   고대 드래곤 체력 50% 이하가 된 다음 틱에 5초 무적(Mob.dmgCutBp 100%) + 이동속도 2배(그 뒤로 계속).
 *   주기 능력(순간이동·동결)은 기절·정지·빙결 중이면 미뤘다가 풀리면 바로, 회복은 행동 불가 동안 쉰다 (GDD 5.5 '정지 = 회복·능력 정지').
 * - 실패 이유: 'challengeStartFail' { player, lv, reason: phase · unknown · locked · cooldown · busy } (상태는 그대로).
 * 사건: challengeStart { player, lv, id, hp, until }, challengeTeleport { id, units }, challengeFreeze { id, towers, until },
 *       challengeGuard { id, until }, heal(회복, 초록 숫자), challengeClear { lv, reward, first, x, y }, challengeFail, challengeReady.
 */
import type { System, World } from '../World';
import { dist2, mulBp } from '../Fixed';
import { IMMUNE_BURN, IMMUNE_SLOW, MOB_KIND, emptyMobStatus, emptyMobTraits, isMob, type Mob } from '../entities/Mob';
import { isTower } from '../entities/Tower';
import { positionAt } from '../map';
import type { ChallengeStats } from '../rules';
import type { MatchContext } from '../state';
import { earnGold } from './Economy';
import { isDisabled } from './Status';

export type ChallengeFail = 'phase' | 'unknown' | 'locked' | 'cooldown' | 'busy';

/** 고대 드래곤 무적을 이미 썼는가 (Mob.phaseFlags 비트) */
export const CHALLENGE_GUARDED = 1;

/** 단계 lv의 도전 보스 데이터 (없으면 undefined). */
export function challengeOf(ctx: Pick<MatchContext, 'rules'>, lv: number): ChallengeStats | undefined {
  return ctx.rules.challenges[lv - 1];
}

/** 단계 lv의 남은 쿨타임 (틱, 0 = 지금 가능). */
export function challengeCooldownLeft(ctx: Pick<MatchContext, 'state'>, lv: number, tick: number): number {
  const ready = ctx.state.challengeReady[lv - 1] ?? 0;
  return ready > tick ? ready - tick : 0;
}

/** 도전을 시작할 수 있는지 (화면 버튼과 명령이 같이 쓴다). 되면 null. */
export function challengeCheck(ctx: Pick<MatchContext, 'rules' | 'state'>, lv: number, tick: number): ChallengeFail | null {
  const { state } = ctx;
  if (state.phase !== 'playing') return 'phase';
  if (!challengeOf(ctx, lv)) return 'unknown';
  if (lv > state.challengeOpen) return 'locked';
  if (state.challengeLevel > 0) return 'busy';
  if (challengeCooldownLeft(ctx, lv, tick) > 0) return 'cooldown';
  return null;
}

/** 지금 시작할 수 있는 도전 단계 수 (하단 메뉴 배지 '1 가능'). 진행 중이면 0. */
export function challengesAvailable(ctx: Pick<MatchContext, 'rules' | 'state'>, tick: number): number {
  let n = 0;
  for (let lv = 1; lv <= ctx.rules.challenges.length; lv++) if (challengeCheck(ctx, lv, tick) === null) n++;
  return n;
}

/** 도전 보스 한 마리를 경로 시작점에 만든다. */
function spawnChallengeMob(ctx: MatchContext, world: World, c: ChallengeStats, index: number, link: number): Mob {
  return world.entities.add({
    kind: MOB_KIND,
    mob: c.id,
    stage: ctx.state.stage,
    hp: c.hp,
    maxHp: c.hp,
    armor: c.armor,
    magicRes: c.magicRes,
    speed: c.speed,
    ccResistBp: 0,
    lifeDamage: 0,
    reward: 0,
    progress: 0,
    moveRem: 0,
    swarmIndex: index,
    invisible: c.invisible,
    legion: c.legion,
    boss: true,
    vulnBp: 0,
    markBp: 0,
    ...emptyMobStatus(),
    ...emptyMobTraits(),
    challenge: c.level,
    link,
    immune: (c.immuneSlow ? IMMUNE_SLOW : 0) | (c.immuneBurn ? IMMUNE_BURN : 0),
    traitAt: c.teleport ? world.tick + c.teleport.everyTicks : -1,
    traitAt2: c.freezeTowers ? world.tick + c.freezeTowers.everyTicks : -1,
  } satisfies Omit<Mob, 'id'>) as Mob;
}

/** startChallenge 명령: 단계 lv 도전 시작. 성공하면 보스(첫 마리), 실패하면 null. */
export function startChallenge(ctx: MatchContext, world: World, player: number, lv: number): Mob | null {
  const fail = challengeCheck(ctx, lv, world.tick);
  if (fail) {
    world.emit('challengeStartFail', { player, lv, reason: fail });
    return null;
  }
  const { state, rules } = ctx;
  const c = challengeOf(ctx, lv) as ChallengeStats;
  const first = spawnChallengeMob(ctx, world, c, 0, 0);
  const ids = [first.id];
  if (c.twin > 1) {
    first.link = first.id;
    for (let i = 1; i < c.twin; i++) ids.push(spawnChallengeMob(ctx, world, c, i, first.id).id);
  }
  state.challengeLevel = lv;
  state.challengePlayer = player;
  state.challengeStart = world.tick;
  state.challengeUntil = world.tick + rules.challengeTimeTicks;
  state.challengeMobs = ids;
  state.challengeMaxHp = c.hp;
  world.emit('challengeStart', { player, lv, id: first.id, hp: c.hp, until: state.challengeUntil });
  if (c.invisible) world.emit('challengeInvisible', { id: first.id, lv });
  return first;
}

/** 도전이 끝났다 (처치·실패): 상태 비우기 + 그 단계 쿨타임. */
function endChallenge(ctx: MatchContext, world: World): number {
  const { state, rules } = ctx;
  const lv = state.challengeLevel;
  state.challengeReady[lv - 1] = world.tick + rules.challengeCooldownTicks;
  state.challengeLevel = 0;
  state.challengeUntil = 0;
  state.challengeMobs = [];
  state.challengeMaxHp = 0;
  return lv;
}

/** 남은 도전 보스(무리)를 모두 지운다 (except = 이미 지운 것). */
function removeChallengeMobs(ctx: MatchContext, world: World, except = 0): void {
  for (const id of ctx.state.challengeMobs) if (id !== except) world.entities.remove(id);
}

/** 쌍둥이: 맞은 한 마리의 체력을 무리 모두에게 (Combat·Status가 피해 직후 부른다). */
export function shareChallengeHp(ctx: MatchContext, world: World, mob: Mob): void {
  if (!mob.link) return;
  for (const id of ctx.state.challengeMobs) {
    if (id === mob.id) continue;
    const e = world.entities.get(id);
    if (e && isMob(e)) e.hp = mob.hp;
  }
}

/** 도전 보스가 죽었다 (Kill.killMob이 부른다, 이미 엔티티는 지워짐): 무리 정리 + 보상 + 해금 + 쿨타임. */
export function challengeDown(ctx: MatchContext, world: World, mob: Mob, x: number, y: number): void {
  const { state, rules } = ctx;
  if (state.challengeLevel !== mob.challenge) return;
  removeChallengeMobs(ctx, world, mob.id);
  const c = challengeOf(ctx, mob.challenge) as ChallengeStats;
  const reward = c.reward > 0 ? earnGold(state, c.reward) : 0;
  const first = state.challengeBest < c.level;
  state.challengeClears += 1;
  if (first) state.challengeBest = c.level;
  if (state.challengeOpen <= c.level && c.level < rules.challenges.length) state.challengeOpen = c.level + 1;
  const lv = endChallenge(ctx, world);
  world.emit('challengeClear', { lv, reward, first, open: state.challengeOpen, x, y });
}

/** 도전 보스가 캠페인 출구에 닿았다 (Movement): 목숨 감소 없이 실패. */
export function challengeEscaped(ctx: MatchContext, world: World, mob: Mob): void {
  world.entities.remove(mob.id);
  if (ctx.state.challengeLevel !== mob.challenge) return;
  removeChallengeMobs(ctx, world, mob.id);
  const lv = endChallenge(ctx, world);
  world.emit('challengeFail', { lv, reason: 'escape' });
}

/** 도전 보스 한 마리의 틱 (MobTraits, 상태 이상 다음·이동 앞): 순간이동·동결·회복·무적. */
export function challengeTick(ctx: MatchContext, world: World, mob: Mob): void {
  const c = challengeOf(ctx, mob.challenge);
  if (!c) return;
  const tick = world.tick;
  // 무적: 체력 문턱을 넘은 다음 틱에 한 번 (행동 불가와 상관없이), 시간이 지나면 풀림
  if (mob.dmgCutBp > 0 && tick >= mob.guardUntil) mob.dmgCutBp = 0;
  const inv = c.invulnerable;
  if (inv && (mob.phaseFlags & CHALLENGE_GUARDED) === 0 && mob.hp > 0 && mob.hp <= mulBp(mob.maxHp, inv.atBp)) {
    mob.phaseFlags |= CHALLENGE_GUARDED;
    mob.dmgCutBp = 10000;
    mob.guardUntil = tick + inv.ticks;
    mob.speedBonusBp = inv.speedBp;
    world.emit('challengeGuard', { id: mob.id, until: mob.guardUntil });
  }
  const disabled = isDisabled(mob, tick);
  // 회복: 시작부터 주기마다 (행동 불가 동안은 쉰다). 쌍둥이는 무리 첫 마리만 (체력을 같이 쓰므로 한 번)
  if (c.regen && !disabled && (mob.link === 0 || mob.link === mob.id)) {
    const since = tick - ctx.state.challengeStart;
    if (since > 0 && since % c.regen.everyTicks === 0 && mob.hp < mob.maxHp) {
      let amount = mulBp(mob.maxHp, c.regen.pctBp);
      if (amount < 1) amount = 1;
      if (mob.hp + amount > mob.maxHp) amount = mob.maxHp - mob.hp;
      mob.hp += amount;
      shareChallengeHp(ctx, world, mob);
      const p = positionAt(ctx.map.path, mob.progress);
      world.emit('heal', { target: mob.id, amount, x: p.x, y: p.y, src: mob.id });
    }
  }
  if (disabled) return;
  // 순간이동: 경로를 앞으로 (스테이지 맵에서 출구를 넘으면 이번 틱 이동에서 출구 도달 → 실패)
  if (c.teleport && mob.traitAt >= 0 && tick >= mob.traitAt) {
    mob.traitAt = tick + c.teleport.everyTicks;
    mob.progress += c.teleport.units;
    world.emit('challengeTeleport', { id: mob.id, units: c.teleport.units });
  }
  // 동결: 반경 안 타워 (ID 순) 공격·주기 능력 불가
  const fz = c.freezeTowers;
  if (fz && mob.traitAt2 >= 0 && tick >= mob.traitAt2) {
    mob.traitAt2 = tick + fz.everyTicks;
    const at = positionAt(ctx.map.path, mob.progress);
    const until = tick + fz.ticks;
    const r2 = fz.radius * fz.radius;
    const hit: number[] = [];
    for (const e of world.entities.list()) {
      if (!isTower(e) || dist2(e.x, e.y, at.x, at.y) > r2) continue;
      if (until > e.stunUntil) e.stunUntil = until;
      hit.push(e.id);
    }
    world.emit('challengeFreeze', { id: mob.id, towers: hit.join(','), until, x: at.x, y: at.y });
  }
}

/** 도전 시스템 (단계 다음·등장 앞): 제한 시간 초과 → 실패, 쿨타임이 끝난 단계 알림. */
export function createChallengeSystem(ctx: MatchContext): System {
  return (world) => {
    const { state } = ctx;
    if (state.phase !== 'playing') return;
    const tick = world.tick;
    if (state.challengeLevel > 0 && tick >= state.challengeUntil) {
      removeChallengeMobs(ctx, world);
      const lv = endChallenge(ctx, world);
      world.emit('challengeFail', { lv, reason: 'time' });
    }
    for (let i = 0; i < state.challengeReady.length; i++) {
      const ready = state.challengeReady[i] as number;
      if (ready > 0 && tick >= ready) {
        state.challengeReady[i] = 0;
        world.emit('challengeReady', { lv: i + 1 });
      }
    }
  };
}
