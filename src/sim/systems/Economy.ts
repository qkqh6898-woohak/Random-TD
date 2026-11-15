/**
 * 경제 (DEV_PLAN M2-2, GDD 3장).
 *
 * - 시작 자금 1000원 (game.json match.startGold, createMatch가 넣는다).
 * - 소환 비용 100원 (game.json summon.cost). 돈이 모자라면 아무것도 바뀌지 않는다.
 * - 일반 몹 처치 보상 = (10 + ⌊s/10⌋) × 몹 보상 배율, 내림 (rules.killReward). s = 몹이 나온 단계 → 10단계 슬라임 = 11원.
 *   보상은 몹이 나올 때 계산해 Mob.reward에 들어 있다 (Spawn). 처치하면 그대로 받는다.
 * - 보유금 상한 없음. 카드 '황금 손'(M4-7, +25%씩)은 earnGold가 모든 돈 획득에 곱한다 (내림). 종족 시너지 돈 보너스(M7)도 여기에.
 * - 일꾼 (M4-1, GDD 3장): `hireWorker` 명령 = 300원에 1명 (최대 10명, 카드 '무료 일꾼'은 최대를 넘길 수 있음).
 *   수입: 판 시작부터 5초(100틱)마다 한 번에 일꾼 수 × 5원 × 일꾼 수입 배율(카드 '일꾼 열정' ×2 → ×3 → ×4) → 'workerIncome' 사건.
 *   실패하면 상태를 바꾸지 않고 'hireFail' { reason: phase · max · gold }. 일꾼 수입은 일시정지 중 멈춘다(틱이 멈춤). 일꾼은 판이 끝나면 사라진다.
 * 돈은 판 상태(state.gold)라 해시에 들어간다. 지금은 한 판에 지갑 하나 (2인 지갑 분리는 M13).
 */
import type { System, World } from '../World';
import { BP_ONE, mulBp } from '../Fixed';
import type { MatchContext, MatchState } from '../state';

/** 그 돈을 낼 수 있는가. */
export function canAfford(state: Pick<MatchState, 'gold'>, cost: number): boolean {
  return state.gold >= cost;
}

/** 돈 내기. 모자라면 false (아무것도 안 바뀜). */
export function spendGold(state: Pick<MatchState, 'gold'>, cost: number): boolean {
  if (!Number.isSafeInteger(cost) || cost < 0) throw new Error(`비용은 0 이상 정수 (받은 값: ${cost})`);
  if (state.gold < cost) return false;
  state.gold -= cost;
  return true;
}

/**
 * 돈 받기 (처치 보상 등). 카드 '황금 손' 보너스(goldPctBp)를 곱하고(내림) 번 돈 합계(goldEarned)에도 더한다.
 * 실제로 받은 돈을 돌려준다.
 */
export function earnGold(state: Pick<MatchState, 'gold' | 'goldEarned'> & Partial<Pick<MatchState, 'goldPctBp'>>, amount: number): number {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error(`받는 돈은 0 이상 정수 (받은 값: ${amount})`);
  const bonus = state.goldPctBp ?? 0;
  const got = bonus > 0 ? mulBp(amount, BP_ONE + bonus) : amount;
  state.gold += got;
  state.goldEarned += got;
  return got;
}

/** 일꾼 고용 실패 이유: 판이 끝남 / 최대 / 돈 부족 */
export type HireFail = 'phase' | 'max' | 'gold';

/** 일꾼을 고용할 수 있는지 (화면 버튼과 명령이 같이 쓴다). 되면 null. */
export function hireCheck(ctx: MatchContext): HireFail | null {
  const { state, rules } = ctx;
  if (state.phase !== 'playing') return 'phase';
  if (state.workers >= rules.workerMax) return 'max';
  if (!canAfford(state, rules.workerCost)) return 'gold';
  return null;
}

/** hireWorker 명령: 300원에 일꾼 1명. 성공하면 true ('hire' 사건), 실패하면 false ('hireFail' 사건). */
export function hireWorker(ctx: MatchContext, world: World, player: number): boolean {
  const fail = hireCheck(ctx);
  if (fail) {
    world.emit('hireFail', { player, reason: fail });
    return false;
  }
  spendGold(ctx.state, ctx.rules.workerCost);
  ctx.state.workers += 1;
  world.emit('hire', { player, workers: ctx.state.workers });
  return true;
}

/** 일꾼 한 번 수입 (원): 일꾼 수 × 1명당 수입 × 배율. */
export function workerIncome(ctx: MatchContext): number {
  return ctx.state.workers * ctx.rules.workerIncome * ctx.state.workerMul;
}

/** 경제 시스템 (틱마다, 전투 다음·패배 판정 앞): 수입 간격(100틱)마다 일꾼 수입. */
export function createEconomySystem(ctx: MatchContext): System {
  return (world) => {
    const { state, rules } = ctx;
    if (state.phase !== 'playing' || state.workers <= 0) return;
    if (world.tick <= 0 || world.tick % rules.workerIntervalTicks !== 0) return;
    const amount = workerIncome(ctx);
    if (amount <= 0) return;
    const got = earnGold(state, amount);
    world.emit('workerIncome', { amount: got, workers: state.workers });
  };
}
