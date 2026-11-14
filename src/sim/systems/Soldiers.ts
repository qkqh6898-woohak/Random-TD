/**
 * 소환 병사 (GDD 5.2 '소환', 소환사 특색 M3-9): 틱마다 (특색 능력 다음, 전투 앞), 병사 ID 순으로
 *  1. 수명이 다했으면 사라진다.
 *  2. 경로를 거슬러 걷는다: 진행도 −= 속도 ÷ 20 (나머지 누적, 몹 이동과 같은 방식). 스테이지 맵에서 출발점 뒤로 넘어가면 사라진다.
 *  3. 닿은(거리 ≤ reach, 경계 포함) 드러난 몹을 ID 순으로, 아직 안 친 몹만 한 번씩 공격 — 공격 수를 다 쓰면 사라진다.
 * 피해는 소환할 때 실어 둔 1회 공격(× ATK_SCALE)을 Combat.applyHit로 (방어·마법 저항·약화·표식 적용, 치명타·특색 없음).
 * 사건: soldierHit {id, target, x, y}, soldierEnd {id, reason: 'life' | 'hits' | 'exit'}.
 */
import type { System, World } from '../World';
import { TICK_HZ } from '../World';
import { dist2 } from '../Fixed';
import type { Mob } from '../entities/Mob';
import { isSoldier, type Soldier } from '../entities/Soldier';
import { positionAt } from '../map';
import type { MatchContext } from '../state';
import { applyHit } from './Combat';
import type { RawHit } from './Damage';
import { targetCandidates } from './Targeting';

/** 병사 한 명을 1틱 거꾸로 걷게 한다 (진행도가 줄어든다). */
export function stepSoldierBack(s: Pick<Soldier, 'progress' | 'moveRem' | 'speed'>): void {
  const total = s.speed + s.moveRem;
  const step = Math.floor(total / TICK_HZ);
  s.moveRem = total - step * TICK_HZ;
  s.progress -= step;
}

function soldierHit(s: Soldier): RawHit {
  return { p: s.dmgP, m: s.dmgM, t: s.dmgT, armorPenBp: s.armorPenBp, magicPenBp: s.magicPenBp };
}

function endSoldier(world: World, s: Soldier, reason: string): void {
  world.entities.remove(s.id);
  world.emit('soldierEnd', { id: s.id, reason });
}

export function createSoldierSystem(ctx: MatchContext): System {
  const { path } = ctx.map;
  return (world) => {
    if (ctx.state.phase !== 'playing') return;
    let cands: ReturnType<typeof targetCandidates> | null = null;
    for (const e of world.entities.list()) {
      if (!isSoldier(e)) continue;
      if (world.tick >= e.until) {
        endSoldier(world, e, 'life');
        continue;
      }
      stepSoldierBack(e);
      if (!path.loop && e.progress < 0) {
        endSoldier(world, e, 'exit');
        continue;
      }
      const at = positionAt(path, e.progress);
      const r2 = e.reach * e.reach;
      cands ??= targetCandidates(world, path);
      for (const c of cands) {
        if (e.hitsLeft <= 0) break;
        if (!c.alive || e.hitIds.includes(c.id) || dist2(at.x, at.y, c.x, c.y) > r2) continue;
        const mob = world.entities.get(c.id) as Mob | undefined;
        if (!mob) {
          c.alive = false;
          continue;
        }
        e.hitIds.push(c.id);
        e.hitsLeft -= 1;
        world.emit('soldierHit', { id: e.id, target: c.id, x: c.x, y: c.y });
        if (applyHit(ctx, world, mob, soldierHit(e), c, e.source)) c.alive = false;
        else c.hp = mob.hp;
      }
      if (e.hitsLeft <= 0) endSoldier(world, e, 'hits');
    }
  };
}
