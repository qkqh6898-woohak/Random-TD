/**
 * 연출 계산 (순수 함수, Phaser 없음 → 단위 테스트). DEV_PLAN M2-9, GDD 5.4 '피해 숫자', ART.md 2.4.
 *  - 피해 숫자 색: 물리 흰색, 마법 하늘색, 고정 노란색 (섞이면 가장 큰 쪽 색).
 *  - 돈: 금색 '+n원'.
 *  - 피해 숫자는 0.65초 동안 떠오르며 마지막 40%에 사라진다. 동전은 처치 자리에서 살짝 튀어 오른 뒤 HUD 돈 쪽으로 곡선을 그리며 날아간다.
 */

export const DAMAGE_COLORS = {
  physical: '#FFFFFF',
  magic: '#8FD8FF',
  true: '#FFD84A',
  gold: '#F5B700',
} as const;

/** 피해 숫자 한 개가 떠 있는 시간 (ms) */
export const DAMAGE_TEXT_MS = 650;
/** 동전이 HUD까지 날아가는 시간 (ms) */
export const COIN_FLY_MS = 620;

/** 피해 종류별 값 → 숫자 색 (가장 큰 쪽, 같으면 물리 → 마법 → 고정 순). */
export function damageColor(p: number, m: number, t: number): string {
  if (t > p && t > m) return DAMAGE_COLORS.true;
  if (m > p) return DAMAGE_COLORS.magic;
  return DAMAGE_COLORS.physical;
}

/** 떠오르는 숫자: 경과 비율 k(0~1) → 위로 이동(칸 배수)·투명도·크기. */
export function floatingTextFrame(k: number): { rise: number; alpha: number; scale: number } {
  const c = k < 0 ? 0 : k > 1 ? 1 : k;
  const rise = 0.7 * (1 - (1 - c) * (1 - c)); // ease-out
  const alpha = c < 0.6 ? 1 : 1 - (c - 0.6) / 0.4;
  const scale = c < 0.15 ? 0.7 + (0.45 * c) / 0.15 : 1.15 - Math.min(0.15, (c - 0.15) * 0.5);
  return { rise, alpha, scale };
}

/** 동전 위치: 처치 자리 a → HUD 돈 b, 경과 비율 k. 처음에 위로 튀었다가 곡선으로 날아간다 (2차 베지어). */
export function coinPath(a: { x: number; y: number }, b: { x: number; y: number }, k: number, hop: number): { x: number; y: number } {
  const c = k < 0 ? 0 : k > 1 ? 1 : k;
  const e = c * c * (3 - 2 * c); // smoothstep
  const cx = a.x + (b.x - a.x) * 0.15;
  const cy = Math.min(a.y, b.y) - hop;
  const u = 1 - e;
  return { x: u * u * a.x + 2 * u * e * cx + e * e * b.x, y: u * u * a.y + 2 * u * e * cy + e * e * b.y };
}
