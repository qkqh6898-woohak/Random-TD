/**
 * 배치 칸 보이기 (T-3 '타일 숨김', 순수 계산): 평소에는 칸을 그리지 않고, 쓸모 있을 때만 옅게 보여준다.
 * - 타워를 끄는 동안 · 패널 [↔ 이동] 모드: 계속 (alpha 1).
 * - 배치할 수 없는 곳(길·빈 땅)을 짧게 눌렀을 때 · 판 시작: BUILD_HINT_MS 동안 보였다가 끝 BUILD_HINT_FADE_MS 동안 사라진다.
 *   연출 끄기(noFade)면 서서히 사라지지 않고 BUILD_HINT_MS - BUILD_HINT_FADE_MS 뒤에 바로 꺼진다.
 */
export const BUILD_HINT_MS = 1600;
export const BUILD_HINT_FADE_MS = 500;

/** 지금 배치 칸 진하기 (0~1). hintAtMs = 마지막으로 잠깐 보이기를 시작한 때 (없으면 null). noFade = 연출 끄기. */
export function buildHintAlpha(dragging: boolean, nowMs: number, hintAtMs: number | null, noFade = false): number {
  if (dragging) return 1;
  if (hintAtMs === null) return 0;
  const age = nowMs - hintAtMs;
  if (age < 0 || age >= BUILD_HINT_MS) return 0;
  const fadeFrom = BUILD_HINT_MS - BUILD_HINT_FADE_MS;
  if (age <= fadeFrom) return 1;
  return noFade ? 0 : (BUILD_HINT_MS - age) / BUILD_HINT_FADE_MS;
}
