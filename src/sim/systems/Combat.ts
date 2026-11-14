/**
 * 전투 (DEV_PLAN M2-4~M2-6, M3-4·M3-5): 공격 타이머 → 대상 선택 → 공격 형태대로 즉시 피해 또는 투사체 → 피해·처치·보상.
 *
 * 틱마다 이 순서 (이동 다음, 패배 판정 앞):
 *  1. 몹 위치 계산 (대상 후보, ID 순).
 *  2. 타워 (ID 순): 지금 공속(한도 적용, stats.ts)으로 공격 타이머를 채우고 찰 때마다 1회 공격.
 *     공격할 때마다 우선순위(Targeting.pickTarget)로 대상을 다시 고른다 (앞 공격에 죽었으면 다음 몹).
 *     이동·교환 직후(Tower.pauseUntil 전)에는 공격하지 않는다 (M3-10).
 *     - 근접(melee·melee_aoe)·전체(global): 그 자리에서 피해.
 *     - 나머지(단일·광역·관통·연쇄·다중): 투사체를 만든다 (이번 틱부터 날아감). 다중은 서로 다른 대상 n마리에게 하나씩.
 *  3. 투사체 (ID 순): 대상 쪽으로 600단위(초속 12칸) 이동, 도착하면 공격 형태대로 맞는 몹을 골라(Shapes) 피해.
 *     대상이 이미 죽었으면 헛발 (사라짐, 광역도 터지지 않는다).
 *  패배 판정은 이 뒤라서, 같은 틱에 151번째 몹이 나와도 그 틱에 처치가 있으면 처치를 먼저 센다 (UI.md 9장).
 *
 * 피해 공식 (GDD 5.4). 모든 계산은 공격력 × ATK_SCALE(100) 정수 단위에서 하고, 정수 피해로는 맨 끝에 한 번만 자른다:
 *  1. 쏠 때 (rollHit): 1회 공격력 × (1 + 공격력% 합) × 치명타 배율(치명타일 때). 치명타는 전투 난수 흐름으로 공격마다 한 번 굴린다
 *     (광역·연쇄처럼 여러 마리를 맞혀도 한 공격 = 한 판정). 관통 합·보스 배율도 이때 타워 값을 실어 보낸다 (투사체가 싣고 감).
 *  2. 맞을 때 (damageAgainst): × (1 + 받는 피해 증가% 합, 최대 +100%) × 보스 피해 배율(대상이 보스일 때).
 *     물리는 방어력, 마법은 마법 저항으로 깎는다: 감소율 A ÷ (A + 100),
 *     A = max(0, 방어력 × (1 − 관통 합) − 고정 관통), 관통 합 = 타워 + 강화 + 몹의 표식, 최대 90%.
 *     정수로 계산: x × 100 × 10000 ÷ (방어력 × (10000 − 관통bp) − 고정 관통 × 10000 + 100 × 10000) 내림 → A가 소수여도 정확하다.
 *     고정 피해는 깎이지 않는다. 1회 피해 = 세 값의 합 (종류마다 따로 자르지 않는다).
 *     연쇄는 k번째 튕김마다 × 0.8 (곱연산, game.json combat.chainFalloff).
 *  3. 합 + 쏜 타워의 피해 나머지(Tower.remDmg, 0~99)를 100으로 나눈 몫이 실제 피해, 나머지는 타워에 다시 넣는다
 *     → 소수 공격력(6.5 → 6, 7, 6, 7 …)도, 방어로 깎인 소수 피해(4 vs 방어 1 → 평균 3.96)도 평균이 정확하다.
 *     쏜 타워가 이미 없으면(승급으로 사라짐) 나머지 없이 자른다.
 *  - 지속 피해(독·화상·출혈, 고정·치명타 없음)·상태 이상은 M3-6, 오라·특색은 M3-7~M3-9.
 * 처치: 체력 0 이하 → 몹 제거, 돈 += 몹 보상, 'kill' 사건 (화면: 동전·+n원).
 * 사건: attack {tower, target, x, y, instant, shape}, hit {target, source, damage, p, m, t, crit, x, y, kill},
 *       blast {x, y, r, tower} (광역 폭발), chain {x1, y1, x2, y2, tower} (연쇄 한 구간), kill, miss.
 */
import type { Shape } from '../../data/load';
import type { Rng } from '../Rng';
import type { System, World } from '../World';
import { STREAM_COMBAT } from '../World';
import { BP_ONE, dist2, isqrt, mulBp, mulDiv } from '../Fixed';
import type { Mob } from '../entities/Mob';
import { PROJECTILE_KIND, isProjectile, stepToward, type Projectile } from '../entities/Projectile';
import { isTower, type Tower } from '../entities/Tower';
import { chargeAttacks } from '../entities/Tower';
import { ATK_SCALE, type MatchRules, type TowerStats } from '../rules';
import type { MatchContext } from '../state';
import { NO_MODS, capPen, effectiveStats, type EffectiveStats } from '../stats';
import { earnGold } from './Economy';
import { isPaused } from './Move';
import { aoeTargets, chainTargets, globalTargets, meleeAoeTargets, pierceTargets } from './Shapes';
import { leaderRuleFor, pickTarget, targetCandidates, type LeaderRule, type TargetCandidate } from './Targeting';

/**
 * 1회 공격 (× ATK_SCALE 정수): 공격력%·치명타를 곱한 물리·마법·고정 + 쏜 타워의 관통·보스 배율.
 * 관통·보스 배율·치명타를 생략하면 0·×1·아님 (M2 기본 피해와 같다).
 */
export interface RawHit {
  p: number;
  m: number;
  t: number;
  crit?: boolean;
  /** 방어·마법 관통 합 (bp, 한도 적용 전 — 맞을 때 몹의 표식을 더하고 90%로 자른다) */
  armorPenBp?: number;
  magicPenBp?: number;
  /** 고정 방어·마법 관통 (방어력 수치) */
  flatArmorPen?: number;
  flatMagicPen?: number;
  /** 보스 피해 배율 (bp, ×1 = 10000). 대상이 보스일 때만 곱한다 */
  bossMulBp?: number;
}

/** 몹에게 들어가는 피해 (× ATK_SCALE 정수): 종류별 + 합. */
export interface ScaledDamage {
  p: number;
  m: number;
  t: number;
  total: number;
}

/** 피해 계산 한도 (game.json combat → MatchRules). */
export interface DamageCaps {
  /** 방어·마법 관통 최대 (bp) */
  penMaxBp: number;
  /** 받는 피해 증가 합 최대 (bp) */
  vulnMaxBp: number;
}

/** 한도 없음 (단위 테스트용 기본값). 판에서는 rules의 한도를 넘긴다. */
export const NO_CAPS: DamageCaps = Object.freeze({ penMaxBp: BP_ONE, vulnMaxBp: Number.MAX_SAFE_INTEGER });

/** 피해 공식이 읽는 몹 값. 보스·약화·표식은 생략하면 아님·0. */
export type DamageTarget = Pick<Mob, 'armor' | 'magicRes'> & Partial<Pick<Mob, 'boss' | 'vulnBp' | 'markBp'>>;

/** 방어 감소율 계산에 쓰는 '100' (A ÷ (A + 100))을 bp 단위로 */
const RESIST_BASE_BP = 100 * BP_ONE;

/**
 * 방어(또는 마법 저항) resist로 깎은 값: x × 100 ÷ (A + 100) 내림, A = max(0, resist × (1 − 관통) − 고정 관통).
 * A를 bp 단위 정수(resist × (10000 − 관통bp) − 고정 × 10000)로 들고 계산해 A가 소수여도 한 번만 내린다.
 * 예: 100 vs 방어 100 → 50, 관통 50% → A = 50 → 66, 100 vs 마저 60·관통 20% → A = 48 → 67, 방어 300 → 25.
 * @param penBp 관통 (bp, 한도는 부르는 쪽이 적용)
 */
export function reduceDamage(x: number, resist: number, penBp = 0, flatPen = 0): number {
  if (x <= 0) return 0;
  const aBp = resist * (BP_ONE - penBp) - flatPen * BP_ONE;
  if (aBp <= 0) return x;
  return mulDiv(x, RESIST_BASE_BP, aBp + RESIST_BASE_BP);
}

/** × ATK_SCALE 피해 합과 나머지(0 ~ ATK_SCALE − 1) → 이번 정수 피해와 새 나머지. */
export function splitAtk(totalC: number, rem: number): { dmg: number; rem: number } {
  const total = totalC + rem;
  const dmg = Math.floor(total / ATK_SCALE);
  return { dmg, rem: total - dmg * ATK_SCALE };
}

/** 치명타 판정: 확률 0이면 난수를 쓰지 않고 아님, 100% 이상이면 난수 없이 치명타. */
export function rollCrit(rng: Rng, critBp: number): boolean {
  if (critBp <= 0) return false;
  if (critBp >= BP_ONE) return true;
  return rng.chanceBp(critBp);
}

/**
 * 타워의 1회 공격 (× ATK_SCALE): 기본 공격력 × 공격력 배율 × 치명타 배율(crit일 때). 관통·보스 배율을 같이 싣는다.
 * eff를 생략하면 데이터 기본값 (공격력% 0, 타워 관통만).
 */
export function rollHit(stats: TowerStats, eff?: EffectiveStats, crit = false): RawHit {
  const atkMul = eff?.atkMulBp ?? BP_ONE;
  const critMul = crit ? (eff?.critMulBp ?? stats.critMulBp) : BP_ONE;
  const f = (x: number): number => (x > 0 ? mulBp(mulBp(x, atkMul), critMul) : 0);
  return {
    p: f(stats.atkC),
    m: f(stats.matkC),
    t: f(stats.tatkC),
    crit,
    armorPenBp: eff?.armorPenBp ?? stats.armorPenBp,
    magicPenBp: eff?.magicPenBp ?? stats.magicPenBp,
    flatArmorPen: eff?.flatArmorPen ?? 0,
    flatMagicPen: eff?.flatMagicPen ?? 0,
    bossMulBp: eff?.bossMulBp ?? BP_ONE,
  };
}

/** 피해에 배율(bp)을 곱한 새 공격 (연쇄 감소 등). 관통·보스 배율·치명타는 그대로. */
export function scaleHit(hit: RawHit, mulBpValue: number): RawHit {
  return { ...hit, p: mulBp(hit.p, mulBpValue), m: mulBp(hit.m, mulBpValue), t: mulBp(hit.t, mulBpValue) };
}

/** 연쇄 k번째 튕김의 피해 배율 (bp): keep^k (k = 0이면 ×1). */
export function chainFalloffBp(keepBp: number, k: number): number {
  let v = BP_ONE;
  for (let i = 0; i < k; i++) v = mulBp(v, keepBp);
  return v;
}

/**
 * 몹에게 실제로 들어가는 피해 (× ATK_SCALE, 종류별 + 합계).
 * × (1 + 약화, 한도) × 보스 배율(보스일 때) → 물리는 방어력, 마법은 마법 저항으로 감소(관통 + 표식, 한도) → 고정은 그대로.
 */
export function damageAgainst(hit: RawHit, mob: DamageTarget, caps: DamageCaps = NO_CAPS): ScaledDamage {
  const vulnRaw = mob.vulnBp ?? 0;
  const vuln = vulnRaw < 0 ? 0 : vulnRaw > caps.vulnMaxBp ? caps.vulnMaxBp : vulnRaw;
  const boss = mob.boss === true ? (hit.bossMulBp ?? BP_ONE) : BP_ONE;
  const amp = (x: number): number => {
    if (x <= 0) return 0;
    let v = vuln > 0 ? mulBp(x, BP_ONE + vuln) : x;
    if (boss !== BP_ONE) v = mulBp(v, boss);
    return v;
  };
  const mark = mob.markBp ?? 0;
  const p = reduceDamage(amp(hit.p), mob.armor, capPen((hit.armorPenBp ?? 0) + mark, caps.penMaxBp), hit.flatArmorPen ?? 0);
  const m = reduceDamage(amp(hit.m), mob.magicRes, capPen((hit.magicPenBp ?? 0) + mark, caps.penMaxBp), hit.flatMagicPen ?? 0);
  const t = amp(hit.t);
  return { p, m, t, total: p + m + t };
}

/** 판 규칙의 피해 한도. */
export function damageCaps(rules: Pick<MatchRules, 'penMaxBp' | 'vulnMaxBp'>): DamageCaps {
  return { penMaxBp: rules.penMaxBp, vulnMaxBp: rules.vulnMaxBp };
}

/** 몹 처치: 제거 + 보상 + 사건. */
export function killMob(ctx: MatchContext, world: World, mob: Mob, x: number, y: number): void {
  world.entities.remove(mob.id);
  earnGold(ctx.state, mob.reward);
  ctx.state.kills += 1;
  world.emit('kill', { id: mob.id, mob: mob.mob, reward: mob.reward, x, y });
}

/**
 * 피해 주기. 죽으면 처치까지 하고 true.
 * 1회 피해(× ATK_SCALE) 합에 쏜 타워의 나머지를 더해 정수 피해로 자르고, 새 나머지를 타워에 넣는다.
 * @param at 맞은 위치 (단위, 피해 숫자·동전을 띄울 곳)
 * @param source 공격한 타워 엔티티 id
 */
export function applyHit(ctx: MatchContext, world: World, mob: Mob, hit: RawHit, at: { x: number; y: number }, source: number): boolean {
  const d = damageAgainst(hit, mob, damageCaps(ctx.rules));
  const src = world.entities.get(source);
  const tower = src && isTower(src) ? src : null;
  const { dmg, rem } = splitAtk(d.total, tower ? tower.remDmg : 0);
  if (tower) tower.remDmg = rem;
  mob.hp -= dmg;
  const kill = mob.hp <= 0;
  // p·m·t = 종류별 피해 (× ATK_SCALE, 화면이 숫자 색을 고를 때 쓴다), damage = 실제 정수 피해, crit = 치명타 (숫자 크게)
  world.emit('hit', { target: mob.id, source, damage: dmg, p: d.p, m: d.m, t: d.t, crit: hit.crit === true, x: at.x, y: at.y, kill });
  if (kill) killMob(ctx, world, mob, at.x, at.y);
  return kill;
}

/** 후보 하나에 피해 (후보의 체력·생존을 같이 고친다). */
function hitCandidate(ctx: MatchContext, world: World, cand: TargetCandidate, hit: RawHit, source: number): void {
  if (!cand.alive) return;
  const mob = world.entities.get(cand.id) as Mob | undefined;
  if (!mob) {
    cand.alive = false;
    return;
  }
  if (applyHit(ctx, world, mob, hit, cand, source)) cand.alive = false;
  else cand.hp = mob.hp;
}

/** 투사체 쏘기 (타워 칸 중심에서 출발). 공격 형태(광역 반경·관통·연쇄 수)와 1회 공격을 싣고 간다. */
export function fireProjectile(
  ctx: MatchContext,
  world: World,
  tower: Tower,
  target: TargetCandidate,
  hit: RawHit,
  stats?: Pick<TowerStats, 'shape' | 'radius' | 'count' | 'range'>,
): Projectile {
  return world.entities.add({
    kind: PROJECTILE_KIND,
    source: tower.id,
    tower: tower.tower,
    target: target.id,
    x: tower.x,
    y: tower.y,
    ox: tower.x,
    oy: tower.y,
    dmgP: hit.p,
    dmgM: hit.m,
    dmgT: hit.t,
    crit: hit.crit === true,
    armorPenBp: hit.armorPenBp ?? 0,
    magicPenBp: hit.magicPenBp ?? 0,
    flatArmorPen: hit.flatArmorPen ?? 0,
    flatMagicPen: hit.flatMagicPen ?? 0,
    bossMulBp: hit.bossMulBp ?? BP_ONE,
    shape: stats?.shape ?? 'single',
    radius: stats?.radius ?? 0,
    count: stats?.count ?? 1,
    range: stats?.range ?? 0,
    speed: ctx.rules.projectileSpeed,
  } satisfies Omit<Projectile, 'id'>) as Projectile;
}

/** 투사체에 실린 1회 공격. */
export function projectileHit(p: Projectile): RawHit {
  return {
    p: p.dmgP,
    m: p.dmgM,
    t: p.dmgT,
    crit: p.crit,
    armorPenBp: p.armorPenBp,
    magicPenBp: p.magicPenBp,
    flatArmorPen: p.flatArmorPen,
    flatMagicPen: p.flatMagicPen,
    bossMulBp: p.bossMulBp,
  };
}

/** 공격 한 번 (대상이 없으면 false). */
function attackOnce(
  ctx: MatchContext,
  world: World,
  tower: Tower,
  stats: TowerStats,
  eff: EffectiveStats,
  cands: readonly TargetCandidate[],
  leaderRule: LeaderRule,
): boolean {
  const shape: Shape = stats.shape;
  const primary =
    shape === 'global' ? (globalTargets(cands)[0] ?? null) : pickTarget(cands, tower.x, tower.y, stats.range, stats.target, leaderRule);
  if (!primary) return false;
  const crit = rollCrit(world.rng(STREAM_COMBAT), eff.critBp);
  const hit = rollHit(stats, eff, crit);
  tower.attacks += 1;
  world.emit('attack', { tower: tower.id, target: primary.id, x: primary.x, y: primary.y, instant: stats.instant, shape });
  switch (shape) {
    case 'melee':
      hitCandidate(ctx, world, primary, hit, tower.id);
      break;
    case 'melee_aoe':
      for (const c of meleeAoeTargets(cands, tower.x, tower.y, stats.radius, primary)) hitCandidate(ctx, world, c, hit, tower.id);
      world.emit('blast', { x: tower.x, y: tower.y, r: stats.radius, tower: tower.id });
      break;
    case 'global':
      for (const c of globalTargets(cands)) hitCandidate(ctx, world, c, hit, tower.id);
      break;
    case 'multi': {
      // 서로 다른 대상 n마리: 우선순위대로 하나씩 고른다
      const chosen = new Set<number>([primary.id]);
      fireProjectile(ctx, world, tower, primary, hit, stats);
      while (chosen.size < stats.count) {
        const next = pickTarget(cands, tower.x, tower.y, stats.range, stats.target, leaderRule, chosen);
        if (!next) break;
        chosen.add(next.id);
        fireProjectile(ctx, world, tower, next, hit, stats);
      }
      break;
    }
    default:
      // 단일·광역·관통·연쇄: 대상에게 투사체 하나, 도착할 때 형태대로
      fireProjectile(ctx, world, tower, primary, hit, stats);
  }
  return true;
}

/** 투사체 도착: 형태대로 맞는 몹을 골라 피해. */
function landProjectile(ctx: MatchContext, world: World, p: Projectile, target: TargetCandidate, cands: readonly TargetCandidate[]): void {
  const hit = projectileHit(p);
  switch (p.shape) {
    case 'aoe':
      world.emit('blast', { x: target.x, y: target.y, r: p.radius, tower: p.source });
      for (const c of aoeTargets(cands, target.x, target.y, p.radius)) hitCandidate(ctx, world, c, hit, p.source);
      break;
    case 'pierce': {
      const reach = isqrt(dist2(p.ox, p.oy, target.x, target.y));
      const length = reach > p.range ? reach : p.range;
      const line = pierceTargets(cands, p.ox, p.oy, target.x, target.y, length, ctx.rules.pierceHalfWidth, p.count);
      for (const c of line) hitCandidate(ctx, world, c, hit, p.source);
      break;
    }
    case 'chain': {
      const hops = chainTargets(cands, target, p.count, ctx.rules.chainRange);
      hops.forEach((c, k) => {
        if (k > 0) {
          const prev = hops[k - 1] as TargetCandidate;
          world.emit('chain', { x1: prev.x, y1: prev.y, x2: c.x, y2: c.y, tower: p.source });
        }
        hitCandidate(ctx, world, c, k === 0 ? hit : scaleHit(hit, chainFalloffBp(ctx.rules.chainKeepBp, k)), p.source);
      });
      break;
    }
    default:
      hitCandidate(ctx, world, target, hit, p.source);
  }
}

export function createCombatSystem(ctx: MatchContext): System {
  return (world) => {
    if (ctx.state.phase !== 'playing') return;
    const cands = targetCandidates(world, ctx.map.path);
    const leaderRule = leaderRuleFor(ctx.state.mode);
    const byId = new Map<number, TargetCandidate>();
    for (const c of cands) byId.set(c.id, c);

    // 타워 공격 (ID 순). 엔티티 목록은 이 틱 시작 때의 것 (새 투사체는 아래에서 따로 돈다)
    for (const e of world.entities.list()) {
      if (!isTower(e)) continue;
      const stats = ctx.rules.towers.get(e.tower);
      if (!stats) throw new Error(`없는 타워: ${e.tower}`);
      const tower = e;
      const eff = effectiveStats(ctx.rules, stats, ctx.state.mods[tower.owner] ?? NO_MODS);
      const paused = isPaused(tower, world.tick);
      const { acc } = chargeAttacks(tower.atkAcc, eff.apsMilli, () =>
        paused ? false : attackOnce(ctx, world, tower, stats, eff, cands, leaderRule),
      );
      tower.atkAcc = acc;
    }

    // 투사체 (ID 순): 이동 → 도착하면 형태대로 피해, 대상이 없으면 헛발
    for (const e of world.entities.list()) {
      if (!isProjectile(e)) continue;
      const target = byId.get(e.target);
      if (!target || !target.alive) {
        world.entities.remove(e.id);
        world.emit('miss', { id: e.id, x: e.x, y: e.y });
        continue;
      }
      const next = stepToward(e.x, e.y, target.x, target.y, e.speed);
      e.x = next.x;
      e.y = next.y;
      if (!next.arrived) continue;
      world.entities.remove(e.id);
      landProjectile(ctx, world, e, target, cands);
    }
  };
}
