/**
 * 토스트·알림 문구 (UI.md 8장). 화면 글자는 여기 한 곳에 모은다.
 */

/** 돈 부족 (소환): "100원이 필요해요" — 비용은 데이터(game.json summon.cost)에서 */
export function needGoldForSummon(cost: number): string {
  return `${cost}원이 필요해요`;
}

/** 돈 부족 (기타): "{n}원이 더 필요해요" */
export function needMoreGold(n: number): string {
  return `${n}원이 더 필요해요`;
}

/** 배치 칸이 가득 참 */
export const BOARD_FULL = '빈 칸이 없어요 — 승급으로 칸을 비워 보세요';

/** 신 타워 강림 (전체 화면 연출 자리, 지금은 토스트) */
export function godDescends(name: string): string {
  return `👑 ${name} 강림!`;
}

/**
 * 승급 가능 (UI.md 8장, 판당 처음 3번만). 한꺼번에 여러 종류면 한 알림으로: 2종 = '고블린·전사 승급 가능!',
 * 3종 이상 = '고블린 외 2종 승급 가능!' (412px 화면에서 한 줄에 들어가게).
 */
export function mergeReadyToast(names: string | readonly string[]): string {
  const list = typeof names === 'string' ? [names] : names;
  if (list.length <= 2) return `${list.join('·')} 승급 가능!`;
  return `${list[0]} 외 ${list.length - 1}종 승급 가능!`;
}

/** 승급 실패 (sim이 거절한 merge·mergeAll) → 글자. 보여줄 것이 없으면 null. */
export function mergeFailText(reason: string, count: number): string | null {
  if (reason === 'count') return `같은 타워가 ${count}개 있어야 승급할 수 있어요`;
  if (reason === 'maxGrade') return '레전드는 승급할 수 없어요 (히든 재료)';
  return null;
}

/** 승급 결과 알림 */
export function mergedToast(name: string, gradeName: string): string {
  return `⬆ ${gradeName} ${name}!`;
}
