/**
 * 전투 (DEV_PLAN M2-4~M2-6): 공격 타이머 → 대상 선택 → 즉시 피해 또는 투사체 → 피해·처치·보상.
 *
 * 틱마다 이 순서 (이동 다음, 패배 판정 앞):
 *  1. 몹 위치 계산 (대상 후보, ID 순).
 *  2. 타워 (ID 순): 공격 타이머를 채우고 찰 때마다 1회 공격. 공격할 때마다 선두를 다시 고른다 (앞 공격에 죽었으면 다음 몹).
 *     선두 = 캠페인은 진행도 최대, 무한 모드는 가장 오래 살아 있는 몹 (GDD 5.3, Targeting).
 *     - 근접(melee·melee_aoe)·전체(global): 그 자리에서 피해.
 *     - 나머지: 투사체를 만든다 (이번 틱부터 날아감).
 *  3. 투사체 (ID 순): 대상 쪽으로 600단위(초속 12칸) 이동, 도착하면 피해. 대상이 이미 죽었으면 헛발 (사라짐).
 *  패배 판정은 이 뒤라서, 같은 틱에 151번째 몹이 나와도 그 틱에 처치가 있으면 처치를 먼저 센다 (UI.md 9장).
 *
 * 피해 (M2 기본, GDD 5.4의 일부). 모든 계산은 공격력 × ATK_SCALE(100) 정수 단위에서 하고, 정수 피해로는 맨 끝에 한 번만 자른다:
 *  1. 쏠 때: 1회 공격력 (× 100) = 물리·마법·고정 (M3에서 공격력%·치명타 배율을 여기서 곱한다). 투사체는 이 값을 싣고 간다.
 *  2. 맞을 때: 물리는 방어력, 마법은 마법 저항으로 깎는다 — x × 100 ÷ (A + 100) 내림 (감소율 A ÷ (A + 100), × 100 단위라 손실 < 0.01).
 *     고정 피해는 깎이지 않는다. 1회 피해 = 세 값의 합 (GDD 5.4: 종류마다 따로 자르지 않는다).
 *  3. 합 + 쏜 타워의 피해 나머지(Tower.remDmg, 0~99)를 100으로 나눈 몫이 실제 피해, 나머지는 타워에 다시 넣는다
 *     → 소수 공격력(6.5 → 6, 7, 6, 7 …)도, 방어로 깎인 소수 피해(4 vs 방어 1 → 평균 3.96)도 평균이 정확하다.
 *     쏜 타워가 이미 없으면(M3 승급·판매) 나머지 없이 자른다.
 *  - 관통·치명타·공격력% 배율·약화·보스 배율·공격 형태(광역·관통·연쇄·다중)·상태 이상은 M3 (지금은 모두 단일 대상).
 * 처치: 체력 0 이하 → 몹 제거, 돈 += 몹 보상, 'kill' 사건 (화면: 동전·+n원).
 */
import type { System, World } from '../World';
import { mulDiv } from '../Fixed';
import type { Mob } from '../entities/Mob';
import { PROJECTILE_KIND, isProjectile, stepToward, type Projectile } from '../entities/Projectile';
import { isTower, type Tower } from '../entities/Tower';
import { chargeAttacks } from '../entities/Tower';
import { ATK_SCALE, type TowerStats } from '../rules';
import type { MatchContext } from '../state';
import { earnGold } from './Economy';
import { leaderRuleFor, pickLeader, targetCandidates, type TargetCandidate } from './Targeting';

/** 방어 적용 전 1회 공격력 (공격력 × ATK_SCALE 정수): 물리·마법·고정. */
export interface RawHit {
  p: number;
  m: number;
  t: number;
}

/** 몹에게 들어가는 피해 (× ATK_SCALE 정수): 종류별 + 합. */
export interface ScaledDamage extends RawHit {
  total: number;
}

/** 방어(또는 마법 저항) A로 깎은 값: x × 100 ÷ (A + 100) 내림. A ≤ 0이면 그대로. × ATK_SCALE 단위 값에 쓴다. */
export function reduceDamage(x: number, resist: number): number {
  if (x <= 0) return 0;
  if (resist <= 0) return x;
  return mulDiv(x, 100, resist + 100);
}

/** × ATK_SCALE 피해 합과 나머지(0 ~ ATK_SCALE − 1) → 이번 정수 피해와 새 나머지. */
export function splitAtk(totalC: number, rem: number): { dmg: number; rem: number } {
  const total = totalC + rem;
  const dmg = Math.floor(total / ATK_SCALE);
  return { dmg, rem: total - dmg * ATK_SCALE };
}

/** 타워의 1회 공격력 (방어 적용 전, × ATK_SCALE). M3의 공격력%·치명타 배율은 여기서 곱한다. */
export function rollHit(stats: TowerStats): RawHit {
  return { p: stats.atkC, m: stats.matkC, t: stats.tatkC };
}

/** 몹에게 실제로 들어가는 피해 (× ATK_SCALE, 종류별 + 합계). 물리는 방어력, 마법은 마법 저항, 고정은 그대로. */
export function damageAgainst(hit: RawHit, mob: Pick<Mob, 'armor' | 'magicRes'>): ScaledDamage {
  const p = reduceDamage(hit.p, mob.armor);
  const m = reduceDamage(hit.m, mob.magicRes);
  const t = hit.t > 0 ? hit.t : 0;
  return { p, m, t, total: p + m + t };
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
  const d = damageAgainst(hit, mob);
  const src = world.entities.get(source);
  const tower = src && isTower(src) ? src : null;
  const { dmg, rem } = splitAtk(d.total, tower ? tower.remDmg : 0);
  if (tower) tower.remDmg = rem;
  mob.hp -= dmg;
  const kill = mob.hp <= 0;
  // p·m·t = 종류별 피해 (× ATK_SCALE, 화면이 숫자 색을 고를 때 쓴다), damage = 실제 정수 피해
  world.emit('hit', { target: mob.id, source, damage: dmg, p: d.p, m: d.m, t: d.t, x: at.x, y: at.y, kill });
  if (kill) killMob(ctx, world, mob, at.x, at.y);
  return kill;
}

/** 투사체 쏘기 (타워 칸 중심에서 출발). */
export function fireProjectile(ctx: MatchContext, world: World, tower: Tower, target: TargetCandidate, hit: RawHit): Projectile {
  return world.entities.add({
    kind: PROJECTILE_KIND,
    source: tower.id,
    tower: tower.tower,
    target: target.id,
    x: tower.x,
    y: tower.y,
    dmgP: hit.p,
    dmgM: hit.m,
    dmgT: hit.t,
    speed: ctx.rules.projectileSpeed,
  } satisfies Omit<Projectile, 'id'>) as Projectile;
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
      const { acc } = chargeAttacks(tower.atkAcc, stats.apsMilli, () => {
        const target = pickLeader(cands, tower.x, tower.y, stats.range, leaderRule);
        if (!target) return false;
        const hit = rollHit(stats);
        tower.attacks += 1;
        world.emit('attack', { tower: tower.id, target: target.id, x: target.x, y: target.y, instant: stats.instant });
        if (stats.instant) {
          const mob = world.entities.get(target.id) as Mob;
          if (applyHit(ctx, world, mob, hit, target, tower.id)) target.alive = false;
        } else {
          fireProjectile(ctx, world, tower, target, hit);
        }
        return true;
      });
      tower.atkAcc = acc;
    }

    // 투사체 (ID 순): 이동 → 도착하면 피해, 대상이 없으면 헛발
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
      const mob = world.entities.get(target.id) as Mob;
      if (applyHit(ctx, world, mob, { p: e.dmgP, m: e.dmgM, t: e.dmgT }, target, e.source)) target.alive = false;
    }
  };
}
