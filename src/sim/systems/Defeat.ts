/**
 * 패배 판정 (DEV_PLAN M1-6, GDD 2.1).
 *
 * - 무한 모드: 맵 위 살아 있는 몹이 한도(순환의 정원 150)를 **넘으면** 패배 → 150마리 = 생존, 151마리 = 패배.
 *   (계정 상점으로 한도 최대 180은 M8에서 mobLimit에 더한다)
 * - 캠페인: 목숨(사거리 미로 20)이 0이 되면 패배. 목숨은 몹이 출구에 닿을 때 lifeDamage만큼 준다 (Movement).
 * - 보스 제한시간 60초 초과·보스 출구 도달 즉시 패배는 M4.
 * - 패배하면 phase = 'defeat', 'defeat' 사건 { reason, stage }. 그 뒤 다른 시스템은 멈춘다.
 */
import type { System, World } from '../World';
import { countMobs } from '../entities/Mob';
import type { DefeatReason, MatchContext } from '../state';

/** 지금 상태로 패배인가? 이유를 돌려준다 (아니면 ''). */
export function defeatReason(ctx: MatchContext, mobCount: number): DefeatReason {
  const { state } = ctx;
  if (state.mode === 'infinite') return mobCount > state.mobLimit ? 'mobLimit' : '';
  return state.lives <= 0 ? 'lives' : '';
}

export function declareDefeat(ctx: MatchContext, world: World, reason: Exclude<DefeatReason, ''>): void {
  const { state } = ctx;
  if (state.phase !== 'playing') return;
  state.phase = 'defeat';
  state.defeatReason = reason;
  state.defeatTick = world.tick;
  world.emit('defeat', { reason, stage: state.stage });
}

export function createDefeatSystem(ctx: MatchContext): System {
  return (world) => {
    if (ctx.state.phase !== 'playing') return;
    const reason = defeatReason(ctx, countMobs(world));
    if (reason) declareDefeat(ctx, world, reason);
  };
}
