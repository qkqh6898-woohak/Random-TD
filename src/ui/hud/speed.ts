/**
 * 배속 버튼 규칙 (UI.md 4.2: ×1 / ×2 / ×4 / ×8 / ×16 (모두 Lv1), 누를 때마다 순환).
 * 개발자 모드(src/devMode.ts)는 game.json devSpeeds 순환 (T-1, T-2부터 ×1 → ×2 → ×4 → ×8 → ×16 — 사용자 요청 "배속은 2 4 8 16만").
 * 배속은 sim 상태가 아니라 화면 쪽 TickClock 설정이다 (멀티에서는 ×1 고정 예정).
 */
import type { SpeedOption } from '../../data/load';

/**
 * 쓸 수 있는 배속 목록. 일반: 계정 레벨로 해금된 것만. 개발자 모드: devSpeeds가 있으면 그것, 없으면 일반 배속 전부. 기본 데이터는 두 모드 모두 Lv1부터 다섯 가지.
 */
export function availableSpeeds(options: readonly SpeedOption[], accountLevel: number, dev = false, devSpeeds?: readonly number[]): number[] {
  if (dev) return devSpeeds && devSpeeds.length > 0 ? [...devSpeeds] : options.map((o) => o.mul);
  return options.filter((o) => o.unlockLevel <= accountLevel).map((o) => o.mul);
}

/** 다음 배속 (끝이면 처음으로). 지금 배속이 목록에 없으면 첫 값. */
export function nextSpeed(current: number, available: readonly number[]): number {
  if (available.length === 0) return 1;
  const i = available.indexOf(current);
  return available[(i + 1) % available.length] as number;
}
