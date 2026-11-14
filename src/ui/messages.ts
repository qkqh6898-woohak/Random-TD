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
