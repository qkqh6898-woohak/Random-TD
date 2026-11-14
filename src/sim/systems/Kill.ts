/**
 * 몹 처치 (M2-6 → M3b에서 Combat 밖으로): 몹 제거 + 처치 보상 + 'kill' 사건 + '처치될 때' 특색 (상인: 사거리 안 처치 +원).
 * 타워 공격·지속 피해·운석·소환 병사·즉사 모두 여기로 처치한다 → 처치 보상과 상인 돈이 어느 길이든 같다.
 */
import type { World } from '../World';
import type { Mob } from '../entities/Mob';
import type { MatchContext } from '../state';
import { abilityParams, envOf, towersWithAbility } from '../abilities';
import { earnGold } from './Economy';

/** 몹 처치: 제거 + 보상 + 사건 + 처치 특색 (타워 ID 순). */
export function killMob(ctx: MatchContext, world: World, mob: Mob, x: number, y: number): void {
  world.entities.remove(mob.id);
  earnGold(ctx.state, mob.reward);
  ctx.state.kills += 1;
  world.emit('kill', { id: mob.id, mob: mob.mob, reward: mob.reward, x, y });
  const at = { x, y };
  let env: ReturnType<typeof envOf> | null = null;
  for (const { tower, def } of towersWithAbility(world)) {
    if (!def.onAnyKill) continue;
    env ??= envOf(ctx, world);
    def.onAnyKill(env, tower, abilityParams(ctx, tower.owner, def), mob, at);
  }
}
