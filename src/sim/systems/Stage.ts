/**
 * 단계 타이머 (DEV_PLAN M1-5, GDD 2.2).
 *
 * - 0단계 = 준비 60초 (몹 없음). 그 뒤 60초마다 다음 단계 → n단계 시작 틱 = 1200 + (n−1)·1200.
 * - 단계는 몹이 남아 있어도 예정대로 넘어간다 (몹이 쌓이는 압박). 보스가 살아 있어도 흐른다.
 * - 단계가 바뀌면 'stageStart' 사건 { stage, boss }. 보스 단계(10의 배수)는 표시만 (보스 등장·60초 제한 패배는 M4).
 * - 캠페인은 마지막 단계(50) 다음으로 넘어가지 않는다 (테마 클리어 판정은 M4·M6).
 */
import type { System } from '../World';
import { isBossStage } from '../rules';
import type { MatchContext } from '../state';

/** 다음 단계까지 남은 틱 (0 이상). */
export function ticksToNextStage(ctx: MatchContext, tick: number): number {
  const left = ctx.state.nextStageTick - tick;
  return left > 0 ? left : 0;
}

/** n단계가 시작되는 틱 (n ≥ 1). */
export function stageStartTick(prepTicks: number, stageTicks: number, stage: number): number {
  return prepTicks + (stage - 1) * stageTicks;
}

export function createStageSystem(ctx: MatchContext): System {
  return (world) => {
    const { state, rules } = ctx;
    if (state.phase !== 'playing') return;
    if (state.lastStage > 0 && state.stage >= state.lastStage) return;
    if (world.tick < state.nextStageTick) return;
    state.stage += 1;
    state.stageStartTick = world.tick;
    state.nextStageTick = world.tick + rules.stageTicks;
    state.bossStage = isBossStage(rules, state.stage);
    world.emit('stageStart', { stage: state.stage, boss: state.bossStage });
  };
}
