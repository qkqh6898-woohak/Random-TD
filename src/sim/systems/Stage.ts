/**
 * 단계 타이머 (DEV_PLAN M1-5, GDD 2.2).
 *
 * - 0단계 = 준비 60초 (몹 없음). 그 뒤 60초마다 다음 단계 → n단계 시작 틱 = 1200 + (n−1)·1200.
 * - 단계는 몹이 남아 있어도 예정대로 넘어간다 (몹이 쌓이는 압박). 보스가 살아 있어도 흐른다.
 * - 단계가 바뀌면 'stageStart' 사건 { stage, boss }. 보스 단계(10의 배수)에는 Spawn이 보스를 내보낸다 (M4-5).
 * - 보스 제한 시간 (M4-6, GDD 2.2): 보스 단계 시작 + 60초(= 다음 단계 시작 틱)에 보스(조각)가 하나라도 살아 있으면 패배 'bossTime'.
 *   다음 단계로 넘어가기 전에 본다 → 패배 단계 = 그 보스 단계. 보스를 일찍 잡으면 남은 시간은 휴식 (다음 단계는 원래 시각).
 * - 편대 예고 (M4-3b): 다음 단계 시작 10초 전, 다음 단계가 편대 단계면 편대를 정하고 'formationPreview' { stage, id }.
 * - 캠페인은 마지막 단계(50) 다음으로 넘어가지 않는다 (테마 클리어 판정은 M6).
 */
import type { System, World } from '../World';
import { isMob } from '../entities/Mob';
import { isBossStage } from '../rules';
import type { MatchContext } from '../state';
import { declareDefeat } from './Defeat';
import { chooseFormation } from './Formation';
import { bossAlive } from './Kill';

/** 다음 단계까지 남은 틱 (0 이상). */
export function ticksToNextStage(ctx: MatchContext, tick: number): number {
  const left = ctx.state.nextStageTick - tick;
  return left > 0 ? left : 0;
}

/** 준비 완료는 타워를 한 번 이상 소환한 무한 모드의 준비 단계에서만 가능하다. */
export function canFinishPrep(state: Pick<MatchContext['state'], 'mode' | 'phase' | 'stage' | 'summons'>): boolean {
  return state.mode === 'infinite' && state.phase === 'playing' && state.stage === 0 && state.summons > 0;
}

/** n단계가 시작되는 틱 (n ≥ 1). */
export function stageStartTick(prepTicks: number, stageTicks: number, stage: number): number {
  return prepTicks + (stage - 1) * stageTicks;
}

/**
 * 개발용 '단계 건너뛰기' (debugSkipStage 명령): 이번 틱에 바로 다음 단계가 시작되게 한다.
 * 명령은 시스템보다 먼저 실행되므로 같은 틱의 단계 시스템이 단계를 올린다. debug 판이 아니면 무시.
 * 남은 등장 대기열은 새 단계 대기열로 바뀐다 (건너뛴 단계의 남은 몹은 나오지 않음).
 */
export function skipStage(ctx: MatchContext, world?: World): void {
  const { state } = ctx;
  if (!state.debug || state.phase !== 'playing') return;
  if (state.lastStage > 0 && state.stage >= state.lastStage) return;
  state.debugUsed = true;
  // 보스 단계를 건너뛰면 보스(조각)를 보상 없이 지운다 → 제한 시간 패배가 나지 않는다
  if (world && state.bossId !== '') {
    for (const e of [...world.entities.list()]) if (isMob(e) && e.boss && !e.challenge) world.entities.remove(e.id);
    world.emit('bossSkip', { boss: state.bossId });
    state.bossId = '';
    state.bossDeadline = 0;
  }
  // 지금 틱 이하로 당기면 같은 틱 단계 시스템이 바로 다음 단계를 시작하고, 다음 단계 시각을 지금 + 60초로 다시 잡는다
  state.nextStageTick = 0;
}

export function createStageSystem(ctx: MatchContext): System {
  return (world) => {
    const { state, rules } = ctx;
    if (state.phase !== 'playing') return;
    if (state.bossDeadline > 0 && world.tick >= state.bossDeadline) {
      if (bossAlive(world)) {
        declareDefeat(ctx, world, 'bossTime');
        return;
      }
      state.bossDeadline = 0;
    }
    if (state.lastStage > 0 && state.stage >= state.lastStage) return;
    if (world.tick < state.nextStageTick) {
      // 편대 예고: 다음 단계 시작 10초 전 (한 번만 — 정해 두면 formationStage가 다음 단계)
      const upcoming = state.stage + 1;
      if (state.formationStage !== upcoming && world.tick >= state.nextStageTick - rules.formationPreviewTicks) {
        const id = chooseFormation(ctx, world, upcoming);
        if (id) world.emit('formationPreview', { stage: upcoming, id });
      }
      return;
    }
    state.stage += 1;
    state.stageStartTick = world.tick;
    state.nextStageTick = world.tick + rules.stageTicks;
    state.bossStage = isBossStage(rules, state.stage);
    world.emit('stageStart', { stage: state.stage, boss: state.bossStage });
  };
}
