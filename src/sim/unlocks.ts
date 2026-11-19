/**
 * 판 밖 해금이 판 안 규칙에 주는 입력 (G-3 히든 영웅 해방).
 *
 * - 히든(리미티드) 타워는 계정에서 조각을 모아 해방해야 판에서 조합할 수 있다 (docs/PROGRESSION.md 13장).
 *   잠긴 목록은 판 시작 때 MatchOptions.lockedHidden으로 들어와 MatchContext.lockedHidden에 얼려 둔다 (해시 밖, 리플레이에 기록).
 * - 조합(리미티드 도감·히든 조합) 규칙은 결과 타워를 만들기 전에 `isHiddenLocked(ctx, player, id)`를 확인한다.
 *   목록이 비어 있으면(기본) 모두 열림 → 예전 판·리플레이와 같다.
 */
import type { MatchContext } from './state';

/** 이 플레이어에게 그 히든 타워가 잠겨 있는가 (잠김 = 판에서 조합할 수 없음). */
export function isHiddenLocked(ctx: Pick<MatchContext, 'lockedHidden'>, player: number, towerId: string): boolean {
  return ctx.lockedHidden[player]?.has(towerId) ?? false;
}
