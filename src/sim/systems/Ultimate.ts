/**
 * 캐릭터 필살기 (G-1, game.json ultimate).
 *
 * - 충전: 등급이 ultimate.grades에 있는 타워(히어로·레전드·신·리미티드)는 공격 1번마다 게이지(Tower.ult, bp)가
 *   ⌊10000 ÷ 공격 수⌋ × (1 + 카드 '투지' 합)만큼 찬다 (Combat). 10000이면 가득. 승급·조합으로 새로 생긴 타워는 0부터.
 * - 명령 `ult {id}`: 내 타워 id의 게이지가 가득이면 필살기 → 게이지 0, 'ult' 사건 {player, id, tower, kind, x, y, r, count}.
 *   못 쓰면 'ultFail' {player, id, reason}. 종류는 타워 데이터로 정한다 (rules.ult.kindOf, game.json ultimate.rules 중 처음 맞는 것):
 *   - nuke 필살 폭격: 타워 둘레 radius칸 안의 드러난 몹 모두에게 그 타워 1회 공격 × atkMul (치명타 없음, 광역 취급).
 *   - stun 전체 기절: 타워 둘레 radius칸 안의 드러난 몹 모두 seconds초 기절 (보스·저항은 평소 기절 규칙대로 줄어듦).
 *   - rally 전군 가속: 그 플레이어의 모든 타워 공속 +apsPct, seconds초 (다시 쓰면 큰 값·늦게 끝나는 쪽).
 * - 자동 발동(설정 '필살기 자동')은 화면이 같은 명령을 보낸다 (리플레이에 남음).
 * - 시스템 (전투 앞): 전군 가속이 끝나는 틱에 지운다.
 */
import type { System, World } from '../World';
import { BP_ONE, dist2, mulBp } from '../Fixed';
import { isMob, type Mob } from '../entities/Mob';
import { isTower, type Tower } from '../entities/Tower';
import type { UltKind } from '../../data/load';
import type { MatchContext } from '../state';
import { NO_MODS, effectiveStats } from '../stats';
import { computeAuras, towerBonus } from './Aura';
import { applyHit } from './Combat';
import { rollHit, scaleHit } from './Damage';
import { applyHardCc } from './Status';
import { targetCandidates } from './Targeting';

/** 필살기 실패 이유: 판이 끝남 / 그런 타워 없음 / 남의 타워 / 필살기 없는 타워 / 게이지가 덜 참 */
export type UltFail = 'phase' | 'noTower' | 'notOwner' | 'none' | 'charge';

/** 타워의 필살기 종류 (없으면 null). */
export function ultKindOf(ctx: Pick<MatchContext, 'rules'>, towerId: string): UltKind | null {
  return ctx.rules.ult.kindOf.get(towerId) ?? null;
}

/** 공격 1번에 찰 게이지 (bp, 필살기 없는 등급은 0). */
export function ultChargePerAttack(ctx: Pick<MatchContext, 'rules' | 'state'>, tower: Pick<Tower, 'tower' | 'owner'>): number {
  const grade = ctx.rules.towers.get(tower.tower)?.grade;
  const base = grade ? (ctx.rules.ult.chargeBp.get(grade) ?? 0) : 0;
  if (base <= 0) return 0;
  const bonus = ctx.state.ultChargeBp[tower.owner] ?? 0;
  return bonus > 0 ? mulBp(base, BP_ONE + bonus) : base;
}

/** 공격 1번 충전 (Combat이 부른다). */
export function chargeUlt(ctx: MatchContext, tower: Tower): void {
  const add = ultChargePerAttack(ctx, tower);
  if (add <= 0) return;
  const v = (tower.ult ?? 0) + add;
  tower.ult = v > BP_ONE ? BP_ONE : v;
}

/** 필살기를 쓸 수 있는가 (화면 버튼과 명령이 같이 쓴다). 되면 null. */
export function ultCheck(ctx: MatchContext, world: World, player: number, id: number): UltFail | null {
  if (ctx.state.phase !== 'playing') return 'phase';
  const e = world.entities.get(id);
  if (!e || !isTower(e)) return 'noTower';
  if (e.owner !== player) return 'notOwner';
  if (!ultKindOf(ctx, e.tower)) return 'none';
  if ((e.ult ?? 0) < BP_ONE) return 'charge';
  return null;
}

/** 필살기를 쓸 수 있는 내 타워 (ID 순) — HUD [필살기] 목록. */
export function readyUlts(ctx: MatchContext, world: World, player: number): Tower[] {
  const out: Tower[] = [];
  for (const e of world.entities.list()) if (isTower(e) && e.owner === player && (e.ult ?? 0) >= BP_ONE && ultKindOf(ctx, e.tower)) out.push(e);
  return out;
}

/** ult 명령 실행. 성공하면 종류, 실패하면 null ('ultFail'). */
export function castUlt(ctx: MatchContext, world: World, player: number, id: number): UltKind | null {
  const fail = ultCheck(ctx, world, player, id);
  if (fail) {
    world.emit('ultFail', { player, id, reason: fail });
    return null;
  }
  const { rules, state } = ctx;
  const tower = world.entities.get(id) as Tower;
  const kind = ultKindOf(ctx, tower.tower) as UltKind;
  tower.ult = 0;
  state.ults += 1;
  let count = 0;
  let r = 0;
  if (kind === 'rally') {
    const active = world.tick < (state.rallyUntil[player] ?? 0) ? (state.rallyBp[player] ?? 0) : 0;
    state.rallyBp[player] = active > rules.ult.rallyApsBp ? active : rules.ult.rallyApsBp;
    const until = world.tick + rules.ult.rallyTicks;
    if (until > (state.rallyUntil[player] ?? 0)) state.rallyUntil[player] = until;
    for (const e of world.entities.list()) if (isTower(e) && e.owner === player) count++;
  } else {
    r = kind === 'nuke' ? rules.ult.nukeRadius : rules.ult.stunRadius;
    const cands = targetCandidates(world, ctx.map.path, false).filter((c) => dist2(c.x, c.y, tower.x, tower.y) <= r * r);
    if (kind === 'nuke') {
      const stats = rules.towers.get(tower.tower);
      if (!stats) throw new Error(`없는 타워: ${tower.tower}`);
      const eff = effectiveStats(rules, stats, state.mods[player] ?? NO_MODS, towerBonus(ctx, tower, computeAuras(ctx, world)));
      const hit = { ...scaleHit(rollHit(stats, eff, false), rules.ult.nukeMulBp), owner: player, area: true };
      for (const c of cands) {
        const mob = world.entities.get(c.id);
        if (!mob || !isMob(mob)) continue;
        count++;
        applyHit(ctx, world, mob, hit, c, tower.id);
      }
    } else {
      for (const c of cands) {
        const mob = world.entities.get(c.id) as Mob | undefined;
        if (!mob || !isMob(mob)) continue;
        if (applyHardCc(rules.status, mob, world.tick, 'stun', rules.ult.stunTicks)) count++;
      }
    }
  }
  world.emit('ult', { player, id, tower: tower.tower, kind, x: tower.x, y: tower.y, r, count });
  return kind;
}

/** 필살기 시스템 (전투 앞): 전군 가속이 끝나면 지운다. */
export function createUltimateSystem(ctx: MatchContext): System {
  return (world) => {
    const { state } = ctx;
    for (let p = 0; p < state.rallyBp.length; p++) {
      if ((state.rallyBp[p] ?? 0) > 0 && world.tick >= (state.rallyUntil[p] ?? 0)) {
        state.rallyBp[p] = 0;
        world.emit('rallyEnd', { player: p });
      }
    }
  };
}
