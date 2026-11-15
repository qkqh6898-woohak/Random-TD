/**
 * 전투 (DEV_PLAN M2-4~M2-6, M3-4·M3-5): 공격 타이머 → 대상 선택 → 공격 형태대로 즉시 피해 또는 투사체 → 피해·처치·보상.
 *
 * 틱마다 이 순서 (이동 다음, 패배 판정 앞):
 *  1. 몹 위치 계산 (대상 후보, ID 순).
 *  2. 타워 (ID 순): 지금 공속(한도 적용, stats.ts)으로 공격 타이머를 채우고 찰 때마다 1회 공격.
 *     공격할 때마다 우선순위(Targeting.pickTarget)로 대상을 다시 고른다 (앞 공격에 죽었으면 다음 몹).
 *     끄는 중(Tower.held)과 이동·교환 직후(Tower.pauseUntil 전)에는 공격하지 않는다 (M3-10).
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
 *  - M4: 드러나지 않은 투명 몹은 감지(자신) 타워만 대상·형태 후보로 쓴다 (Targeting.candidatesFor). 날아오른 박쥐 여왕은
 *    사거리 2칸 이하 타워가 못 친다 (날아가던 투사체도 헛발). 유령은 단일 공격(단일·근접·관통의 첫 대상·다중)을 30% 회피
 *    ('evade' 사건, 전투 난수 — 회피가 있는 몹에게만 굴린다). 방패병 보호막이 피해를 먼저 받고, 광역(광역·근접 광역·연쇄·전체)은 ×2.
 *  - M3b: 맞고 살아남은 몹에게 공격한 타워 종류의 지속 피해(towers.json dot: 화상·독·출혈)와 특색 onHit(둔화·빙결·표식·약화·즉사)를
 *    건다 (Status, abilities). 공격 1회마다 특색 onAttack(광부 돈·도박꾼 주사위·광전사 스택). 타워의 지금 능력치에는 오라·레벨·
 *    자기 특색 보정(Aura.towerBonus)이 들어간다 — 오라는 틱마다 한 번 계산해 모든 타워가 같이 쓴다.
 * 처치: 체력 0 이하 → Kill.killMob (몹 제거, 돈 += 몹 보상, 'kill' 사건, 상인 같은 처치 특색).
 * 사건: attack {tower, target, x, y, instant, shape}, hit {target, source, damage, p, m, t, crit, x, y, kill},
 *       blast {x, y, r, tower} (광역 폭발), chain {x1, y1, x2, y2, tower} (연쇄 한 구간), kill, miss.
 * 피해 계산 자체(rollHit·damageAgainst …)는 Damage.ts (여기서 다시 내보낸다).
 */
import type { Shape } from '../../data/load';
import type { System, World } from '../World';
import { STREAM_COMBAT } from '../World';
import { BP_ONE, dist2, isqrt } from '../Fixed';
import type { Mob } from '../entities/Mob';
import { PROJECTILE_KIND, isProjectile, stepToward, type Projectile } from '../entities/Projectile';
import { isTower, type Tower } from '../entities/Tower';
import { chargeAttacks } from '../entities/Tower';
import type { TowerStats } from '../rules';
import type { MatchContext } from '../state';
import { NO_MODS, effectiveStats, type EffectiveStats } from '../stats';
import { abilityOf, abilityParams, envOf } from '../abilities';
import { auraSources, computeAuras, towerBonus } from './Aura';
import { absorbShield, chainFalloffBp, damageAgainst, damageCaps, rollChanceBp, rollCrit, rollHit, scaleHit, splitAtk, type RawHit } from './Damage';
import { isPaused } from './Move';
import { aoeTargets, chainTargets, globalTargets, meleeAoeTargets, pierceTargets } from './Shapes';
import { applyDot } from './Status';
import { killMob } from './Kill';
import { shareChallengeHp } from './Challenge';
import { candidatesFor, leaderRuleFor, pickTarget, targetCandidates, type LeaderRule, type TargetCandidate } from './Targeting';

export {
  NO_CAPS,
  absorbShield,
  chainFalloffBp,
  damageAgainst,
  damageCaps,
  reduceDamage,
  rollChanceBp,
  rollCrit,
  rollHit,
  scaleHit,
  scaleHitFrac,
  splitAtk,
  type DamageCaps,
  type DamageTarget,
  type RawHit,
  type ScaledDamage,
} from './Damage';
export { killMob } from './Kill';

/**
 * 피해 주기. 죽으면 처치까지 하고 true.
 * 1회 피해(× ATK_SCALE) 합에 쏜 타워의 나머지를 더해 정수 피해로 자르고, 새 나머지를 타워에 넣는다.
 * @param at 맞은 위치 (단위, 피해 숫자·동전을 띄울 곳)
 * @param source 공격한 타워 엔티티 id
 */
export function applyHit(ctx: MatchContext, world: World, mob: Mob, hit: RawHit, at: { x: number; y: number }, source: number): boolean {
  // 같은 틱 후보 목록에 남아 있지만 이미 지워진 몹 — 쌍둥이 박쥐가 함께 죽은 경우 (M5 검토 반영): 피해·사건 없이 '없음'(true)
  if (!world.entities.has(mob.id)) return true;
  const d = damageAgainst(hit, mob, damageCaps(ctx.rules));
  const src = world.entities.get(source);
  const tower = src && isTower(src) ? src : null;
  const { dmg, rem } = splitAtk(d.total, tower ? tower.remDmg : 0);
  if (tower) tower.remDmg = rem;
  // 보호막(방패병)이 먼저 받는다 — 광역이면 보호막에 ×2
  const absorbed = mob.shield > 0 ? absorbShield(mob, dmg, hit.area === true ? shieldAreaMul(ctx, mob) : undefined) : 0;
  mob.hp -= dmg - absorbed;
  // 쌍둥이 박쥐 (도전 4단계, M5-2): 무리 모두 같은 체력
  if (mob.link) shareChallengeHp(ctx, world, mob);
  const kill = mob.hp <= 0;
  // p·m·t = 종류별 피해 (× ATK_SCALE, 화면이 숫자 색을 고를 때 쓴다), damage = 실제 정수 피해, crit = 치명타 (숫자 크게),
  // fx = 화면 연출 표시 (운석 등, 있을 때만), shield = 보호막이 막은 양 (있을 때만)
  world.emit('hit', {
    target: mob.id,
    source,
    damage: dmg,
    p: d.p,
    m: d.m,
    t: d.t,
    crit: hit.crit === true,
    x: at.x,
    y: at.y,
    kill,
    ...(hit.fx ? { fx: hit.fx } : {}),
    ...(absorbed > 0 ? { shield: absorbed } : {}),
  });
  if (kill) {
    killMob(ctx, world, mob, at.x, at.y);
    return true;
  }
  applyOnHit(ctx, world, mob, hit, at);
  return !world.entities.has(mob.id);
}

/**
 * 맞고 살아남은 몹에게 공격한 타워 종류의 효과를 건다 (M3-6·M3-9):
 * ① 지속 피해 (towers.json dot: 화상·독·출혈 — 초당 피해는 쏠 때 실어 온 hit.dotDps) ② 특색 onHit (둔화·빙결·표식·약화·즉사).
 * 출처(hit.src)가 없는 피해(소환 병사·운석·지속 피해)는 아무것도 걸지 않는다.
 */
export function applyOnHit(ctx: MatchContext, world: World, mob: Mob, hit: RawHit, at: { x: number; y: number }): void {
  if (!hit.src) return;
  const stats = ctx.rules.towers.get(hit.src);
  if (stats?.dot && (hit.dotDps ?? 0) > 0) {
    applyDot(mob, world.tick, hit.src, stats.dot.kind, hit.dotDps as number, stats.dot.durTicks, stats.dot.stacks);
  }
  const def = abilityOf(hit.src);
  if (def?.onHit) def.onHit(envOf(ctx, world), mob, abilityParams(ctx, hit.owner ?? 0, def), hit, at);
}

/** 방패병 보호막의 광역 피해 배율 (bp, 데이터). */
function shieldAreaMul(ctx: MatchContext, mob: Mob): number | undefined {
  return ctx.rules.mobs.get(mob.mob)?.shield?.areaMulBp;
}

/**
 * 후보 하나에 피해 (후보의 체력·생존을 같이 고친다).
 * @param evadable 단일 공격(단일·근접·관통의 첫 대상·다중)이면 true → 회피가 있는 몹(유령 30%)은 전투 난수로 피할 수 있다
 */
function hitCandidate(ctx: MatchContext, world: World, cand: TargetCandidate, hit: RawHit, source: number, evadable = false): void {
  if (!cand.alive) return;
  const mob = world.entities.get(cand.id) as Mob | undefined;
  if (!mob) {
    cand.alive = false;
    return;
  }
  if (evadable) {
    const evadeBp = ctx.rules.mobs.get(mob.mob)?.evadeBp ?? 0;
    if (evadeBp > 0 && rollChanceBp(world.rng(STREAM_COMBAT), evadeBp)) {
      world.emit('evade', { target: mob.id, source, x: cand.x, y: cand.y });
      return;
    }
  }
  if (applyHit(ctx, world, mob, hit, cand, source)) cand.alive = false;
  else {
    cand.hp = mob.hp;
    // 이 공격이 표식을 걸었으면 같은 틱의 다음 타워(무표식 우선)도 알게
    cand.marked = mob.markBp > 0;
  }
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
    owner: hit.owner ?? tower.owner,
    dotDps: hit.dotDps ?? 0,
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
    src: p.tower,
    owner: p.owner,
    dotDps: p.dotDps,
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
  // 사거리는 강화 '사거리%'가 반영된 값 (M5-3)
  const range = eff.range;
  const primary = shape === 'global' ? (globalTargets(cands)[0] ?? null) : pickTarget(cands, tower.x, tower.y, range, stats.target, leaderRule);
  if (!primary) return false;
  const crit = rollCrit(world.rng(STREAM_COMBAT), eff.critBp);
  let hit = rollHit(stats, eff, crit);
  hit.owner = tower.owner;
  tower.attacks += 1;
  // 특색 onAttack (광부 돈·도박꾼 주사위·광전사 연속 공격) — 바꾼 1회 공격으로 계속한다
  const def = abilityOf(tower.tower);
  if (def?.onAttack) hit = def.onAttack(envOf(ctx, world), tower, abilityParams(ctx, tower.owner, def), hit, primary);
  world.emit('attack', { tower: tower.id, target: primary.id, x: primary.x, y: primary.y, instant: stats.instant, shape });
  switch (shape) {
    case 'melee':
      hitCandidate(ctx, world, primary, hit, tower.id, true);
      break;
    case 'melee_aoe': {
      const area = { ...hit, area: true };
      for (const c of meleeAoeTargets(cands, tower.x, tower.y, stats.radius, primary)) hitCandidate(ctx, world, c, area, tower.id);
      world.emit('blast', { x: tower.x, y: tower.y, r: stats.radius, tower: tower.id });
      break;
    }
    case 'global': {
      const area = { ...hit, area: true };
      for (const c of globalTargets(cands)) hitCandidate(ctx, world, c, area, tower.id);
      break;
    }
    case 'multi': {
      // 서로 다른 대상 n마리: 우선순위대로 하나씩 고른다
      const chosen = new Set<number>([primary.id]);
      const shot = { shape: stats.shape, radius: stats.radius, count: stats.count, range };
      fireProjectile(ctx, world, tower, primary, hit, shot);
      while (chosen.size < stats.count) {
        const next = pickTarget(cands, tower.x, tower.y, range, stats.target, leaderRule, chosen);
        if (!next) break;
        chosen.add(next.id);
        fireProjectile(ctx, world, tower, next, hit, shot);
      }
      break;
    }
    default:
      // 단일·광역·관통·연쇄: 대상에게 투사체 하나, 도착할 때 형태대로
      fireProjectile(ctx, world, tower, primary, hit, { shape: stats.shape, radius: stats.radius, count: stats.count, range });
  }
  return true;
}

/** 투사체 도착: 형태대로 맞는 몹을 골라 피해. */
function landProjectile(ctx: MatchContext, world: World, p: Projectile, target: TargetCandidate, cands: readonly TargetCandidate[]): void {
  const hit = projectileHit(p);
  switch (p.shape) {
    case 'aoe': {
      world.emit('blast', { x: target.x, y: target.y, r: p.radius, tower: p.source });
      const area = { ...hit, area: true };
      for (const c of aoeTargets(cands, target.x, target.y, p.radius)) hitCandidate(ctx, world, c, area, p.source);
      break;
    }
    case 'pierce': {
      const reach = isqrt(dist2(p.ox, p.oy, target.x, target.y));
      const length = reach > p.range ? reach : p.range;
      const line = pierceTargets(cands, p.ox, p.oy, target.x, target.y, length, ctx.rules.pierceHalfWidth, p.count);
      // 관통의 첫 대상만 회피할 수 있다 (ENEMIES.md 6장)
      line.forEach((c, k) => hitCandidate(ctx, world, c, hit, p.source, k === 0));
      break;
    }
    case 'chain': {
      const hops = chainTargets(cands, target, p.count, ctx.rules.chainRange);
      const area = { ...hit, area: true };
      hops.forEach((c, k) => {
        if (k > 0) {
          const prev = hops[k - 1] as TargetCandidate;
          world.emit('chain', { x1: prev.x, y1: prev.y, x2: c.x, y2: c.y, tower: p.source });
        }
        hitCandidate(ctx, world, c, k === 0 ? area : scaleHit(area, chainFalloffBp(ctx.rules.chainKeepBp, k)), p.source);
      });
      break;
    }
    default:
      // 단일·다중: 단일 공격 → 회피 가능
      hitCandidate(ctx, world, target, hit, p.source, true);
  }
}

/** 이 투사체(쏜 타워 종류·사거리)가 후보 c를 아직 칠 수 있는가: 드러나지 않았으면 감지(자신)만, 날아올랐으면 사거리가 막는 값보다 클 때만. */
function projectileCanHit(ctx: MatchContext, p: Projectile, c: TargetCandidate): boolean {
  if (c.hidden && ctx.rules.towers.get(p.tower)?.detect !== 'self') return false;
  if (c.fly !== undefined && c.fly > 0 && p.range <= c.fly) return false;
  return true;
}

export function createCombatSystem(ctx: MatchContext): System {
  return (world) => {
    if (ctx.state.phase !== 'playing') return;
    // 모든 몹 (드러나지 않은 투명 몹 포함) → 드러난 몹 목록. 거를 것이 없으면 같은 배열
    const all = targetCandidates(world, ctx.map.path, true);
    let anyHidden = false;
    let anyFly = false;
    for (const c of all) {
      if (c.hidden) anyHidden = true;
      if (c.fly) anyFly = true;
    }
    const visible = anyHidden ? all.filter((c) => !c.hidden) : all;
    const leaderRule = leaderRuleFor(ctx.state.mode);
    const byId = new Map<number, TargetCandidate>();
    for (const c of all) byId.set(c.id, c);

    // 오라는 틱마다 한 번 (위치로 계산 → 이동·교환이 바로 반영)
    const sources = auraSources(ctx, world);
    const auras = computeAuras(ctx, world, sources);

    // 타워 공격 (ID 순). 엔티티 목록은 이 틱 시작 때의 것 (새 투사체는 아래에서 따로 돈다)
    for (const e of world.entities.list()) {
      if (!isTower(e)) continue;
      const stats = ctx.rules.towers.get(e.tower);
      if (!stats) throw new Error(`없는 타워: ${e.tower}`);
      const tower = e;
      const eff = effectiveStats(ctx.rules, stats, ctx.state.mods[tower.owner] ?? NO_MODS, towerBonus(ctx, tower, auras));
      const paused = isPaused(tower, world.tick);
      const cands = candidatesFor(all, visible, stats.detect === 'self', eff.range, anyFly);
      const { acc } = chargeAttacks(tower.atkAcc, eff.apsMilli, () =>
        paused ? false : attackOnce(ctx, world, tower, stats, eff, cands, leaderRule),
      );
      tower.atkAcc = acc;
    }

    // 투사체 (ID 순): 이동 → 도착하면 형태대로 피해, 대상이 없으면 헛발
    for (const e of world.entities.list()) {
      if (!isProjectile(e)) continue;
      const target = byId.get(e.target);
      if (!target || !target.alive || !projectileCanHit(ctx, e, target)) {
        world.entities.remove(e.id);
        world.emit('miss', { id: e.id, x: e.x, y: e.y });
        continue;
      }
      const next = stepToward(e.x, e.y, target.x, target.y, e.speed);
      e.x = next.x;
      e.y = next.y;
      if (!next.arrived) continue;
      world.entities.remove(e.id);
      const selfDetect = ctx.rules.towers.get(e.tower)?.detect === 'self';
      landProjectile(ctx, world, e, target, candidatesFor(all, visible, selfDetect, e.range, anyFly));
    }
  };
}
