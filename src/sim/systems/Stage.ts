/**
 * 단계 타이머 (DEV_PLAN M1-5, GDD 2.2).
 *
 * - 0단계 = 준비 60초 (몹 없음). 그 뒤 일반 단계 60초, 보스 단계 max(stageTicks, bossTimeTicks).
 * - 단계는 몹이 남아 있어도 예정대로 넘어간다 (몹이 쌓이는 압박). 보스가 살아 있어도 흐른다.
 * - 단계가 바뀌면 'stageStart' 사건 { stage, boss }. 보스 단계(10의 배수)에는 Spawn이 보스를 내보낸다 (M4-5).
 * - 보스 제한 시간 (M4-6, GDD 2.2): 보스 단계 시작 + bossTimeTicks(기본 90초)에 보스(조각)가 하나라도 살아 있으면 패배 'bossTime'.
 *   다음 단계로 넘어가기 전에 본다 → 패배 단계 = 그 보스 단계. 보스를 일찍 잡으면 남은 시간은 휴식 (다음 단계는 원래 시각).
 * - 편대 예고 (M4-3b): 다음 단계 시작 10초 전, 다음 단계가 편대 단계면 편대를 정하고 'formationPreview' { stage, id }.
 * - 캠페인은 마지막 단계(50) 다음으로 넘어가지 않는다. 마지막 단계가 끝나는 시각(보스 단계 길이)까지 버티면 — 보스 제한 시간 검사를
 *   먼저 통과해야 한다 — **캠페인 클리어**: phase = 'victory', 'victory' 사건 { stage, theme } (V2 L5. 그 뒤 다른 시스템은 멈춘다.
 *   클리어 보상·화면은 M6 캠페인 — 예전엔 50단계에서 단계 타이머가 0인 채 끝없이 돌았다).
 * - 단계 이자 (피드백 #10): 한 단계를 마치고 다음 단계로 넘어갈 때 가진 돈 100원마다 10원, 한 번에 최대 100원 (game.json interest, 내림) → 'stageInterest' { stage, amount }.
 *   준비 단계(0단계) → 1단계는 이자 없음. 카드 '황금 손' 보너스는 붙이지 않는다 (도박 당첨금과 같은 규칙).
 * - 준비 완료 (F10, readyNow 명령): 준비 단계에서 누르면 1단계를 바로 시작 (`readyNow`). 60초를 기다리는 길도 그대로.
 */
import { relicInterestRate, relicSum } from '../relics';
import type { System, World } from '../World';
import { isMob } from '../entities/Mob';
import { isBossStage } from '../rules';
import type { MatchContext } from '../state';
import { declareDefeat } from './Defeat';
import { chooseFormation } from './Formation';
import { bossAlive } from './Kill';
import { offerPickCards } from './Cards';

/** 다음 단계까지 남은 틱 (0 이상). */
export function ticksToNextStage(ctx: MatchContext, tick: number): number {
  const left = ctx.state.nextStageTick - tick;
  return left > 0 ? left : 0;
}

/** n단계가 시작되는 틱 (n ≥ 1). */
export function stageStartTick(prepTicks: number, stageTicks: number, stage: number, bossEvery = 10, bossTicks = stageTicks): number {
  const bossesBefore = Math.floor((stage - 1) / bossEvery);
  return prepTicks + (stage - 1) * stageTicks + bossesBefore * Math.max(0, bossTicks - stageTicks);
}

/** 가진 돈 gold에 붙는 단계 이자 (원): min(⌊gold ÷ per⌋ × amount, max). */
export function stageInterest(ctx: Pick<MatchContext, 'rules'> & Partial<Pick<MatchContext, 'relics' | 'cache'>>, gold: number): number {
  const { interestPer, interestAmount, interestMax } = ctx.rules;
  // V3 P2 도토리 저금통 (플레이어 0 — 판 돈은 하나): 1회 상한 +값, 100원당 +rateBonus원. 유물이 없으면 기존 그대로
  const r = ctx.relics && ctx.cache ? { rules: ctx.rules, relics: ctx.relics, cache: ctx.cache } : null;
  const max = interestMax + (r ? relicSum(r, 0, 'interestCap') : 0);
  const amount = interestAmount + (r ? relicInterestRate(r, 0) : 0);
  return Math.min(Math.floor(gold / interestPer) * amount, max);
}

/** 다음 단계 시작: (1단계 이상을 마쳤으면 단계 이자) 단계 +1, 시작 틱 = 지금, 다음 단계 = 지금 + 단계 길이 (보스 단계는 max(단계 길이, 보스 시간)), 'stageStart' 사건. (단계 시스템·단계 건너뛰기 공용) */
function beginNextStage(ctx: MatchContext, world: World): void {
  const { state, rules } = ctx;
  if (state.stage >= 1) {
    const amount = stageInterest(ctx, state.gold);
    if (amount > 0) {
      state.gold += amount;
      state.goldEarned += amount;
      world.emit('stageInterest', { stage: state.stage, amount });
    }
  }
  state.stage += 1;
  state.stageStartTick = world.tick;
  state.bossStage = isBossStage(rules, state.stage);
  // 보스 제한 시간 전체를 같은 단계에서 보장한다. 일반 단계는 기존 길이 유지.
  state.nextStageTick = world.tick + (state.bossStage ? Math.max(rules.stageTicks, rules.bossTimeTicks) : rules.stageTicks);
  world.emit('stageStart', { stage: state.stage, boss: state.bossStage });
  // 3택 1 강화 선택 (G-1): 5·15·25 … 단계 (보스 단계 제외)
  offerPickCards(ctx, world, state.stage);
}

/**
 * 개발용 '다음 단계로 즉시 이동' (debugSkipStage 명령, HUD ⏭): 명령이 실행되는 틱에 바로 다음 단계가 시작된다. debug 판이 아니면 무시.
 * - 명령은 시스템보다 먼저 실행된다 → 다음 단계 시각을 0으로 당겨 두면 같은 틱의 단계 시스템이 단계를 올리고 타이머를 지금 + 단계 길이로 다시 잡는다.
 * - 누를 때마다 한 단계 (T-1): 같은 틱에 이미 넘어갈 단계가 있으면(앞선 건너뛰기 또는 원래 바뀌는 틱) 그 단계를 지금 시작하고 하나를 더 걸어 둔다
 *   → 빠르게 연타해 한 틱에 명령이 여러 개 들어와도 n번 = n단계. 사이 단계의 등장 대기열은 만들지 않는다 (마지막 단계 것만, Spawn).
 * - 남은 등장 대기열은 새 단계 대기열로 바뀐다 (건너뛴 단계의 남은 몹은 나오지 않음). 맵 위 몹은 그대로 남는다.
 * - 보스 단계에서 누르면 보스(조각)를 보상·카드 없이 지우고 제한 시간을 끈다 → 제한 시간 패배가 나지 않는다 ('bossSkip' 사건).
 *   도전 보스는 자기 30초 타이머대로 남는다.
 * - 캠페인은 마지막 단계(50)에서 멈춘다. 마지막 단계에서 (그 단계가 시작된 틱이 아니면) 누르면 그 단계를 끝낸다 → 같은 틱에 캠페인 클리어 (V2 L5).
 */
export function skipStage(ctx: MatchContext, world?: World): void {
  const { state } = ctx;
  if (!state.debug || state.phase !== 'playing') return;
  // 마지막 단계가 바로 이 틱에 시작됐으면 더 누른 것은 무시 (연타가 50단계를 지나 클리어까지 가지 않게 — 한 번 더 누르면 클리어)
  if (world && atLastStage(ctx) && state.stageStartTick === world.tick) return;
  state.debugUsed = true;
  // 보스 단계를 건너뛰면 보스(조각)를 보상 없이 지운다 → 제한 시간 패배가 나지 않는다
  if (world && state.bossId !== '') {
    for (const e of [...world.entities.list()]) if (isMob(e) && e.boss && !e.challenge) world.entities.remove(e.id);
    world.emit('bossSkip', { boss: state.bossId });
    state.bossId = '';
    state.bossDeadline = 0;
  }
  if (world && state.nextStageTick <= world.tick && !atLastStage(ctx)) {
    // 이 틱에 넘어갈 단계가 이미 걸려 있다 → 그 단계를 지금 시작 (단계 시스템이 하나를 더 올린다)
    beginNextStage(ctx, world);
    if (state.lastStage > 0 && state.stage >= state.lastStage) return;
  }
  // 지금 틱 이하로 당기면 같은 틱 단계 시스템이 바로 다음 단계를 시작하고, 다음 단계 시각을 지금 + 단계 길이로 다시 잡는다
  state.nextStageTick = 0;
}

/**
 * 준비 완료 (readyNow 명령, F10): 준비 단계(0단계, 판 진행 중)에서만 1단계를 이 틱에 바로 시작한다.
 * - 명령은 시스템보다 먼저 실행된다 → 다음 단계 시각을 지금 틱으로 당기면 같은 틱의 단계 시스템이 1단계를 시작하고
 *   다음 단계를 지금 + 단계 길이로 잡는다 (단계 길이를 다 기다린 판과 같은 길, 시작 틱만 이르다).
 * - 준비 단계가 아니면 아무 일도 하지 않는다 → 연타해도 1단계는 한 번 (같은 틱 두 번째 명령도 같은 시각을 다시 적을 뿐).
 * - 성공하면 'readyNow' 사건 { player, left } (left = 건너뛴 준비 틱).
 */
export function readyNow(ctx: MatchContext, world: World, player: number): boolean {
  const { state } = ctx;
  if (state.phase !== 'playing' || state.stage !== 0) return false;
  if (state.nextStageTick <= world.tick) return false;
  const left = state.nextStageTick - world.tick;
  state.nextStageTick = world.tick;
  world.emit('readyNow', { player, left });
  return true;
}

/** 캠페인 마지막 단계인가 (무한 모드는 늘 false). */
function atLastStage(ctx: MatchContext): boolean {
  return ctx.state.lastStage > 0 && ctx.state.stage >= ctx.state.lastStage;
}

/** 캠페인 클리어 (V2 L5): phase = 'victory', 'victory' 사건. 이미 끝난 판이면 아무 일 없음. */
export function declareVictory(ctx: MatchContext, world: World): void {
  const { state } = ctx;
  if (state.phase !== 'playing') return;
  state.phase = 'victory';
  world.emit('victory', { stage: state.stage, theme: state.theme });
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
    if (atLastStage(ctx)) {
      // 마지막 단계를 끝까지 버팀 (보스 제한 시간 검사는 위에서 먼저) → 캠페인 클리어
      if (world.tick >= state.nextStageTick) declareVictory(ctx, world);
      return;
    }
    if (world.tick < state.nextStageTick) {
      // 편대 예고: 다음 단계 시작 10초 전 (한 번만 — 정해 두면 formationStage가 다음 단계)
      const upcoming = state.stage + 1;
      if (state.formationStage !== upcoming && world.tick >= state.nextStageTick - rules.formationPreviewTicks) {
        const id = chooseFormation(ctx, world, upcoming);
        if (id) world.emit('formationPreview', { stage: upcoming, id });
      }
      return;
    }
    beginNextStage(ctx, world);
  };
}
