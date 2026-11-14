/**
 * 배속 버튼 규칙 (UI.md 4.2: ×1 / ×2 / ×3(Lv12), 누를 때마다 순환).
 * 배속은 sim 상태가 아니라 화면 쪽 TickClock 설정이다 (멀티에서는 ×1 고정 예정).
 */
import type { SpeedOption } from '../../data/load';

/** 계정 레벨로 쓸 수 있는 배속 목록. debug면 전부. */
export function availableSpeeds(options: readonly SpeedOption[], accountLevel: number, debug = false): number[] {
  return options.filter((o) => debug || o.unlockLevel <= accountLevel).map((o) => o.mul);
}

/** 다음 배속 (끝이면 처음으로). 지금 배속이 목록에 없으면 첫 값. */
export function nextSpeed(current: number, available: readonly number[]): number {
  if (available.length === 0) return 1;
  const i = available.indexOf(current);
  return available[(i + 1) % available.length] as number;
}
