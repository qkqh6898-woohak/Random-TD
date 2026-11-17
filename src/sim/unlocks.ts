/**
 * 판 밖 해금이 판 안 규칙에 주는 입력 (G-3 히든 영웅 해방) — G-1 갈래의 자리 표시.
 *
 * - G-3 갈래(feat/g3-lobby)가 MatchOptions.lockedHidden → MatchContext.lockedHidden(플레이어별 Set, 해시 밖)과 이 파일의 진짜 구현을 더한다.
 *   합칠 때는 G-3 쪽 파일로 바꾸면 된다 (이름·인자 같음).
 * - 이 갈래에는 그 필드가 없어 늘 '열림' (예전 판·리플레이와 같다). 신화 조합(Craft.craftPlan)과 도감(g1Models.codexSheetModel)이 부른다.
 */
import type { MatchContext } from './state';

/** 이 플레이어에게 그 히든(신화) 타워가 잠겨 있는가 (잠김 = 판에서 조합할 수 없음). */
export function isHiddenLocked(ctx: MatchContext | { readonly lockedHidden: readonly ReadonlySet<string>[] }, player: number, towerId: string): boolean {
  const locked = (ctx as { readonly lockedHidden?: readonly ReadonlySet<string>[] }).lockedHidden;
  return locked?.[player]?.has(towerId) ?? false;
}
