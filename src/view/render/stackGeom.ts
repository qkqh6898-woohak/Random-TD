/**
 * 칸 무더기 그리기 배치 (G-1 사용자 결정 '한 칸에 같은 캐릭터 최대 3개'): 한 칸에 놓인 타워 n개(1~3)의 그림 자리와 크기.
 * 순수 함수 (단위 테스트). 값은 칸 배수 — 1개면 예전과 같다 (가운데·크기 1).
 * - 2개: 왼쪽·오른쪽으로 나란히 (V2.0 PR-A: 혼자와 같은 크기, 상한 안).
 * - 3개: 뒤 가운데 하나 + 앞 왼쪽·오른쪽 둘 (작은 삼각형), 조금 작게 — 앞줄이 아래(발밑이 앞)라 겹쳐도 얼굴이 가리지 않는다.
 * B-1 그림 크기(기본 2배·붙으면 1.4배·HUD 아래까지)에 이 배수를 한 번 더 곱한다.
 * - 칸 너비 상한 (사용자 요청 '3개 무더기 겹침'): 통통한 캐주얼 WebP 그림은 너비 ≈ 높이라 2배 그림에 배수만 곱하면 3개 무더기가
 *   칸 너비의 약 1.8배로 퍼져 이웃 칸을 덮었다 → 2·3개일 때는 그림 크기 자체를 maxArt로 묶어 무더기 전체가 칸(+양옆 0.06칸) 안에 들게 한다.
 */

/** 그림 크기 1배일 때 그림 반폭 (칸 배수): 높이 230/274 × 1.1칸 ≈ 0.92칸, 그림 너비 ≈ 높이(159장 중간값 0.97) → 반폭 0.46칸 */
export const STACK_HALF_W_PER_ART = 0.46;
/** 무더기 바깥 끝이 칸 경계를 넘어도 되는 폭 (칸 배수, 외곽선·무기 끝 정도) */
export const STACK_OVERHANG_TILES = 0.06;
/** 가운데에서 dx만큼 떨어진 그림이 칸(+여유) 안에 드는 최대 그림 크기 */
export function stackMaxArt(dx: number): number {
  return (0.5 + STACK_OVERHANG_TILES - Math.abs(dx)) / STACK_HALF_W_PER_ART;
}

export interface StackSlot {
  /** 칸 중심 기준 가로 (칸 배수) */
  dx: number;
  /** 발밑 기준 세로 (칸 배수, 음수 = 뒤/위) */
  dy: number;
  /** 그림 크기 배수 */
  scale: number;
  /** 그림 크기 상한 (무더기 2·3개, 칸 너비에 맞춤 — 1개는 없음) */
  maxArt?: number;
}

const ONE: readonly StackSlot[] = [{ dx: 0, dy: 0, scale: 1 }];
// 상한은 무더기 안에서 가장 바깥 자리 기준 (같은 무더기는 같은 크기)
const TWO_DX = 0.16;
const THREE_DX = 0.17;
// V2.0 PR-A: 혼자 크기가 예전 2~3개 무더기 크기(칸의 60~80%)로 줄었다 → 무더기 배수는 2개 1.0 · 3개 0.92 (예전 0.78 · 0.68 그대로 곱하면
// 3개 노말이 칸의 41%로 너무 작아진다). 무더기 하나하나는 예전 무더기 크기(노말 2개 0.70칸 → 0.60 · 3개 0.61 → 0.55, 높은 등급은 상한 그대로)와 비슷.
const TWO_SCALE = 1;
const THREE_SCALE = 0.92;
const TWO: readonly StackSlot[] = [
  { dx: -TWO_DX, dy: 0, scale: TWO_SCALE, maxArt: stackMaxArt(TWO_DX) },
  { dx: TWO_DX, dy: 0, scale: TWO_SCALE, maxArt: stackMaxArt(TWO_DX) },
];
const THREE: readonly StackSlot[] = [
  { dx: 0, dy: -0.2, scale: THREE_SCALE, maxArt: stackMaxArt(THREE_DX) },
  { dx: -THREE_DX, dy: 0.05, scale: THREE_SCALE, maxArt: stackMaxArt(THREE_DX) },
  { dx: THREE_DX, dy: 0.05, scale: THREE_SCALE, maxArt: stackMaxArt(THREE_DX) },
];

/** 무더기 n개 중 index번째(ID 순, 0부터)의 자리. n이 1 이하이거나 범위 밖이면 가운데. 4개 이상이면 3개 배치를 되풀이한다. */
export function stackSlot(index: number, count: number): StackSlot {
  const table = count >= 3 ? THREE : count === 2 ? TWO : ONE;
  return table[index % table.length] ?? (ONE[0] as StackSlot);
}

/** 무더기 자리의 실제 그림 크기: 혼자일 때 크기 × 자리 배수, 상한이 있으면 그 아래로 */
export function stackArtScale(soloScale: number, slot: StackSlot): number {
  const want = soloScale * slot.scale;
  return slot.maxArt === undefined ? want : Math.min(want, slot.maxArt);
}
