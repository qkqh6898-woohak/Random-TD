/**
 * 경로 이동 (DEV_PLAN M1-3).
 *
 * - 몹 위치 = 진행도(정수 단위) 하나. 틱마다 속도(단위/초) ÷ 20 만큼 늘어난다.
 *   속도가 20으로 나누어떨어지지 않아도(예: 1.25칸/초 = 62.5단위/틱) 나머지(moveRem)를 이어 가서 1초에 정확히 속도만큼 걷는다.
 * - loop 맵(순환의 정원)은 진행도가 계속 늘고, 위치는 길이로 나눈 나머지 지점 → 1.5칸/초 몹이 28칸 한 바퀴 = 374틱(18.7초).
 * - 스테이지 맵은 진행도가 경로 길이에 닿으면 출구 도달: 몹이 사라지고 목숨이 몹의 lifeDamage만큼 준다 (CAMPAIGN 목숨 20).
 * - 이동 속도 변화(둔화·기절, M3)는 effectiveSpeed에서 붙인다.
 */
import type { System, World } from '../World';
import { TICK_HZ } from '../World';
import { isMob, type Mob } from '../entities/Mob';
import type { MatchContext } from '../state';

/** 이번 틱 실제 속도 (단위/초). M3에서 둔화·기절을 반영한다. */
export function effectiveSpeed(mob: Mob): number {
  return mob.speed;
}

/** 몹 하나를 1틱 움직인다 (진행도·나머지만 바꿈). */
export function advanceMob(mob: Mob): void {
  const total = effectiveSpeed(mob) + mob.moveRem;
  const step = Math.floor(total / TICK_HZ);
  mob.moveRem = total - step * TICK_HZ;
  mob.progress += step;
}

/** 출구 도달 처리: 몹 제거 + 목숨 감소 + 사건. */
export function leakMob(ctx: MatchContext, world: World, mob: Mob): void {
  const { state } = ctx;
  world.entities.remove(mob.id);
  state.leaked += 1;
  state.lives = state.lives > mob.lifeDamage ? state.lives - mob.lifeDamage : 0;
  world.emit('leak', { id: mob.id, mob: mob.mob, lifeDamage: mob.lifeDamage, lives: state.lives });
}

export function createMovementSystem(ctx: MatchContext): System {
  const { path } = ctx.map;
  return (world) => {
    if (ctx.state.phase !== 'playing') return;
    const reached: Mob[] = [];
    for (const e of world.entities.list()) {
      if (!isMob(e)) continue;
      advanceMob(e);
      if (!path.loop && e.progress >= path.length) reached.push(e);
    }
    for (const mob of reached) leakMob(ctx, world, mob);
  };
}
