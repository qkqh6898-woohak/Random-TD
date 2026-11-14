/**
 * 특색 능력 시스템 (DEV_PLAN M3-8·M3-9): 틱마다 (이동 다음, 소환 병사·전투 앞)
 *  1. 타워 (ID 순): 능력 모듈의 tick 훅 — 주기 능력 (진흙 웅덩이·시간 정지·연금 돈·운석·병사 소환).
 *  2. 진흙 웅덩이 (ID 순): 시간이 다 되면 지우고, 아니면 안에 있는(드러난) 몹에게 둔화를 1틱씩 다시 건다
 *     → 웅덩이 안에 있는 동안만 둔화, 나오면 다음 틱에 풀린다. 같은 틱에 새로 생긴 웅덩이도 바로 적용.
 * 공격 때(onAttack)·맞을 때(onHit)·처치될 때(onAnyKill) 훅은 Combat·Kill이 부른다.
 */
import type { System } from '../World';
import { dist2 } from '../Fixed';
import { isMob } from '../entities/Mob';
import { isPuddle } from '../entities/Puddle';
import { positionAt } from '../map';
import type { MatchContext } from '../state';
import { abilityParams, envOf, towersWithAbility } from '../abilities';
import { PUDDLE_SRC } from '../abilities/mudshaman';
import { applySlow } from './Status';
import { isRevealed } from './Targeting';

export function createAbilitySystem(ctx: MatchContext): System {
  return (world) => {
    if (ctx.state.phase !== 'playing') return;
    const env = envOf(ctx, world);
    for (const { tower, def } of towersWithAbility(world)) {
      if (!def.tick || !world.entities.has(tower.id)) continue;
      def.tick(env, tower, abilityParams(ctx, tower.owner, def));
    }
    const tick = world.tick;
    let mobs: { id: number; x: number; y: number }[] | null = null;
    for (const e of world.entities.list()) {
      if (!isPuddle(e)) continue;
      if (tick >= e.until) {
        world.entities.remove(e.id);
        continue;
      }
      if (mobs === null) {
        mobs = [];
        for (const m of world.entities.list()) {
          if (!isMob(m) || !isRevealed(m)) continue;
          const p = positionAt(ctx.map.path, m.progress);
          mobs.push({ id: m.id, x: p.x, y: p.y });
        }
      }
      const r2 = e.r * e.r;
      for (const m of mobs) {
        if (dist2(e.x, e.y, m.x, m.y) > r2) continue;
        const mob = world.entities.get(m.id);
        if (mob && isMob(mob)) applySlow(ctx.rules.status, mob, tick, PUDDLE_SRC, e.slowBp, 1);
      }
    }
  };
}
