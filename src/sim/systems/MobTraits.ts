/**
 * 몹 특성·보스 패턴 (DEV_PLAN M4-3·M4-5, ENEMIES.md 4·6장): 틱마다 (상태 이상 다음, 이동 앞), 몹 ID 순으로
 *  1. 그림자 늑대 가속: 체력이 최대의 50% 이하이면 이동속도 +30% (Mob.speedBonusBp, 체력이 회복되면 다시 0).
 *  2. 치유사: 3초마다 반경 2칸 안 다른 몹 체력 5% 회복 (최소 1, 최대 체력까지). 기절·정지·빙결 중이면 풀릴 때까지 기다렸다가 바로.
 *  3. 보스: 패턴 모듈의 tick (분열·소환·날기·분노·회복·타워 기절·피해 감소 — src/sim/bosses).
 *  4. 도전 보스 (M5-2): Challenge.challengeTick (순간이동·타워 동결·회복·무적).
 * 그 밖의 특성은 다른 곳에서: 유령 회피·방패병 보호막 = Combat/Damage, 분열 슬라임·보석 골렘 깨짐 = Kill, 암흑 고블린 떼 = Spawn(swarm).
 * 이 틱에 새로 생긴 몹(분열 조각·소환 몹)은 다음 틱부터 특성이 돈다 (반복 목록은 틱 시작 때의 것).
 */
import type { System } from '../World';
import { BP_ONE, mulBp } from '../Fixed';
import { isMob } from '../entities/Mob';
import type { MatchContext } from '../state';
import { bossTick } from '../bosses';
import { healAround } from '../bosses/common';
import { isDisabled } from './Status';
import { challengeTick } from './Challenge';

export function createMobTraitSystem(ctx: MatchContext): System {
  const { rules } = ctx;
  return (world) => {
    if (ctx.state.phase !== 'playing') return;
    const tick = world.tick;
    for (const e of world.entities.list()) {
      if (!isMob(e) || !world.entities.has(e.id)) continue;
      if (e.challenge) {
        challengeTick(ctx, world, e);
        continue;
      }
      if (e.boss) {
        bossTick(ctx, world, e);
        continue;
      }
      const stats = rules.mobs.get(e.mob);
      if (!stats) continue;
      if (stats.haste) {
        const want = e.hp > 0 && e.hp <= mulBp(e.maxHp, stats.haste.belowBp) ? stats.haste.speedBp : 0;
        if (e.speedBonusBp !== want) e.speedBonusBp = want;
      }
      if (stats.heal && e.traitAt >= 0 && tick >= e.traitAt && !isDisabled(e, tick)) {
        e.traitAt = tick + stats.heal.intervalTicks;
        healAround(ctx, world, e, stats.heal.radius, stats.heal.pctBp);
      }
    }
  };
}

/** 이번 틱 이동속도 배율에 들어가는 몹 쪽 보정 (bp, ×1 = 10000): 1 + 가속. 표시·테스트용. */
export function speedMulBp(mob: { speedBonusBp: number }): number {
  return BP_ONE + mob.speedBonusBp;
}
