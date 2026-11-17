/**
 * 칸 무더기 그리기 배치 (G-1 사용자 결정 '한 칸에 같은 캐릭터 최대 3개'): 한 칸에 놓인 타워 n개(1~3)의 그림 자리와 크기.
 * 순수 함수 (단위 테스트). 값은 칸 배수 — 1개면 예전과 같다 (가운데·크기 1).
 * - 2개: 왼쪽·오른쪽으로 나란히, 조금 작게.
 * - 3개: 뒤 가운데 하나 + 앞 왼쪽·오른쪽 둘 (작은 삼각형), 더 작게 — 앞줄이 아래(발밑이 앞)라 겹쳐도 얼굴이 가리지 않는다.
 * B-1 그림 크기(기본 2배·붙으면 1.4배·HUD 아래까지)에 이 배수를 한 번 더 곱한다.
 */

export interface StackSlot {
  /** 칸 중심 기준 가로 (칸 배수) */
  dx: number;
  /** 발밑 기준 세로 (칸 배수, 음수 = 뒤/위) */
  dy: number;
  /** 그림 크기 배수 */
  scale: number;
}

const ONE: readonly StackSlot[] = [{ dx: 0, dy: 0, scale: 1 }];
const TWO: readonly StackSlot[] = [
  { dx: -0.2, dy: 0, scale: 0.78 },
  { dx: 0.2, dy: 0, scale: 0.78 },
];
const THREE: readonly StackSlot[] = [
  { dx: 0, dy: -0.17, scale: 0.68 },
  { dx: -0.24, dy: 0.05, scale: 0.68 },
  { dx: 0.24, dy: 0.05, scale: 0.68 },
];

/** 무더기 n개 중 index번째(ID 순, 0부터)의 자리. n이 1 이하이거나 범위 밖이면 가운데. 4개 이상이면 3개 배치를 되풀이한다. */
export function stackSlot(index: number, count: number): StackSlot {
  const table = count >= 3 ? THREE : count === 2 ? TWO : ONE;
  return table[index % table.length] ?? (ONE[0] as StackSlot);
}
