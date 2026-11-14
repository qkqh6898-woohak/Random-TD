/**
 * 경제 (DEV_PLAN M2-2, GDD 3장).
 *
 * - 시작 자금 1000원 (game.json match.startGold, createMatch가 넣는다).
 * - 소환 비용 100원 (game.json summon.cost). 돈이 모자라면 아무것도 바뀌지 않는다.
 * - 일반 몹 처치 보상 = (10 + ⌊s/10⌋) × 몹 보상 배율, 내림 (rules.killReward). s = 몹이 나온 단계 → 10단계 슬라임 = 11원.
 *   보상은 몹이 나올 때 계산해 Mob.reward에 들어 있다 (Spawn). 처치하면 그대로 받는다.
 * - 보유금 상한 없음. 일꾼 수입(M4)·카드 '황금 손'(M4)·종족 시너지 돈 보너스(M3)는 earnGold에 배율로 붙인다.
 * 돈은 판 상태(state.gold)라 해시에 들어간다. 지금은 한 판에 지갑 하나 (2인 지갑 분리는 M13).
 */
import type { MatchState } from '../state';

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

/** 돈 받기 (처치 보상 등). 번 돈 합계(goldEarned)에도 더한다. */
export function earnGold(state: Pick<MatchState, 'gold' | 'goldEarned'>, amount: number): void {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error(`받는 돈은 0 이상 정수 (받은 값: ${amount})`);
  state.gold += amount;
  state.goldEarned += amount;
}
