/** Loading UI only; no clocks, saves, resources or game rules are changed. */
export const TRANSITION_DELAY_MS = 300;
export const LOADING_HINT_MS = 2000;
export const LOADING_HINTS = ['광부가 주사위를 닦는 중…', '타워들이 자리를 잡고 있어요', '행운을 한 칸씩 채우는 중…', '모험 지도를 펼치는 중…'] as const;

/** A later loader callback must never move the displayed progress backwards. */
export function loadingProgress(previous: number, incoming: number): number {
  const safe = (n: number) => Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
  return Math.max(safe(previous), safe(incoming));
}
