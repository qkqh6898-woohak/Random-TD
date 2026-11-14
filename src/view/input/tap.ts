/**
 * 맵 탭 → 할 일 (DEV_PLAN M2-7, UI.md 4.3·8·9장). 순수 함수 (Phaser 없음 → 단위 테스트).
 *
 * - 빈 배치 칸: 소환 명령 (즉시 소환). 명령은 sim이 실행 틱에 다시 검사한다.
 * - 돈 부족: "100원이 필요해요" 토스트 + 칸 흔들림 (명령 보내지 않음).
 * - 배치 칸이 가득 참 (타워 칸을 눌렀을 때): "빈 칸이 없어요 — 승급으로 칸을 비워 보세요".
 * - 타워가 있는 칸 (빈 칸이 남아 있음): 아무 일 없음 (타워 정보 패널은 M3).
 * - 경로·장식·맵 밖: 아무 일 없음.
 * - 소환 연타는 0.1초 간격까지 받는다 (UI.md 9장).
 */
import type { SummonFail } from '../../sim/systems/Summon';
import { BOARD_FULL, needGoldForSummon } from '../../ui/messages';

/** 소환 탭 최소 간격 (ms) — UI.md 9장 '소환 연타 0.1초 간격까지 허용' */
export const TAP_MIN_INTERVAL_MS = 100;

export type TapAction =
  | { kind: 'summon'; x: number; y: number }
  | { kind: 'toast'; text: string; shake: boolean; x: number; y: number }
  | { kind: 'none' };

/** 소환 검사 결과(summonCheck) → 할 일. */
export function decideTap(fail: SummonFail | null, x: number, y: number, cost: number): TapAction {
  switch (fail) {
    case null:
      return { kind: 'summon', x, y };
    case 'gold':
      return { kind: 'toast', text: needGoldForSummon(cost), shake: true, x, y };
    case 'full':
      return { kind: 'toast', text: BOARD_FULL, shake: false, x, y };
    case 'occupied':
    case 'notBuildable':
    case 'phase':
      return { kind: 'none' };
  }
}

/** sim이 실행 틱에 거절한 소환(summonFail 사건) → 보여줄 글자 (없으면 null). 화면이 미리 검사한 뒤에도 같은 틱 연타 등으로 생길 수 있다. */
export function summonFailText(reason: string, cost: number): string | null {
  if (reason === 'gold') return needGoldForSummon(cost);
  if (reason === 'full') return BOARD_FULL;
  return null;
}

/** 연타 거르기: 마지막으로 받은 탭에서 0.1초가 지났는가. */
export function tapAllowed(lastAcceptedMs: number | null, nowMs: number): boolean {
  return lastAcceptedMs === null || nowMs - lastAcceptedMs >= TAP_MIN_INTERVAL_MS;
}
