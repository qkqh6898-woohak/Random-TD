/**
 * 한 프레임에 돌릴 틱 수 상한 (T-1, 화면 쪽). sim 결과에는 영향이 없다 — 덜 돌린 틱은 버려져 게임 시간이 조금 느려질 뿐이다.
 *
 * 배경: TickClock은 한 프레임의 실제 시간을 maxFrameMs(250ms)로 자른 뒤 배속을 곱한다 → ×16이면 한 프레임에 최대 80틱.
 * 느린 기기에서 틱이 비싸면(후반 타워 30개 + 몹 100마리) 80틱이 수백 ms가 되어 프레임이 몇 장으로 떨어진다.
 * 그래서 틱 하나의 평균 비용(최근 프레임들로 잰 값)으로 이번 프레임에 쓸 수 있는 시간만큼만 돌린다.
 *  - 쓸 시간 = 실제 프레임 시간의 절반, SIM_BUDGET_MIN_MS ~ SIM_BUDGET_MAX_MS (예산이 프레임 시간을 따라 끝없이 커지지 않게 위를 막는다).
 *  - ×1 몫(요청 틱 ÷ 배속, 올림)은 절대 줄이지 않는다 → ×1 게임 속도는 예전과 같다. 배속으로 더 돌리는 몫만 줄어든다.
 * 순수 함수 + 작은 측정기 → 단위 테스트. 시간 재기(performance.now)는 Game 장면이 한다.
 */

/** 한 프레임에 sim에 쓸 최소·최대 시간 (ms) */
export const SIM_BUDGET_MIN_MS = 12;
export const SIM_BUDGET_MAX_MS = 50;

/** 이번 프레임의 sim 예산 (ms): 실제 프레임 시간의 절반을 [최소, 최대]로 자른 값. */
export function simBudgetMs(frameDeltaMs: number): number {
  const half = Number.isFinite(frameDeltaMs) && frameDeltaMs > 0 ? frameDeltaMs / 2 : 0;
  return half < SIM_BUDGET_MIN_MS ? SIM_BUDGET_MIN_MS : half > SIM_BUDGET_MAX_MS ? SIM_BUDGET_MAX_MS : half;
}

/**
 * 이번 프레임에 실제로 돌릴 틱 수.
 * @param requested TickClock이 돌려준 틱 수
 * @param speed 지금 배속 (1 이상이면 ×1 몫 = ⌈requested ÷ speed⌉은 그대로 둔다)
 * @param avgTickMs 틱 하나의 평균 비용 (ms, 아직 모르면 0 → 줄이지 않음)
 * @param budgetMs 이번 프레임 예산 (simBudgetMs)
 */
export function capTicks(requested: number, speed: number, avgTickMs: number, budgetMs: number): number {
  if (requested <= 1 || !(avgTickMs > 0)) return requested;
  const base = Math.ceil(requested / (speed > 1 ? speed : 1));
  const byBudget = Math.max(1, Math.floor(budgetMs / avgTickMs));
  const capped = byBudget < requested ? byBudget : requested;
  return capped > base ? capped : base;
}

/** 틱 하나의 평균 비용 (지수 이동 평균, 화면 전용). */
export class TickCostMeter {
  private avg = 0;
  /** 지금까지 버린(덜 돌린) 틱 수 — E2E·측정용 */
  dropped = 0;

  get avgMs(): number {
    return this.avg;
  }

  /** ticks개를 ms 동안 돌렸다. */
  record(ticks: number, ms: number): void {
    if (!(ticks > 0) || !(ms >= 0)) return;
    const per = ms / ticks;
    this.avg = this.avg === 0 ? per : this.avg * 0.8 + per * 0.2;
  }

  reset(): void {
    this.avg = 0;
    this.dropped = 0;
  }
}
