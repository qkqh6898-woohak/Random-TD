/**
 * 덱 규칙 (GDD.md 4.2): 등급별 5종, 총 25종. 신·히든은 덱과 무관.
 * 데이터 교차 검사(load.ts)와 판 만들기(sim/rules.ts)가 같이 쓴다. JSON을 import하지 않는 작은 모듈이라 sim에서 써도 가볍다.
 */
import type { Issue } from './schema';

/** 덱에 넣는 등급 */
export const DECK_GRADES = ['normal', 'rare', 'unique', 'hero', 'legend'] as const;
export type DeckGrade = (typeof DECK_GRADES)[number];
/** 덱: 등급별 타워 id 목록 */
export type DeckData = Record<DeckGrade, string[]>;

/**
 * 덱 하나 검사: 등급마다 perGrade종, 그 등급의 서로 다른 타워. 문제 목록을 돌려준다 (경로는 path 아래).
 * @param towers 타워 id·등급 목록 (towers.json)
 */
export function deckIssues(
  deck: Readonly<Record<DeckGrade, readonly string[]>>,
  towers: readonly { id: string; grade: string }[],
  perGrade: number,
  path: string,
): Issue[] {
  const issues: Issue[] = [];
  const byId = new Map(towers.map((t) => [t.id, t]));
  for (const g of DECK_GRADES) {
    const ids = deck[g] ?? [];
    if (ids.length !== perGrade) issues.push({ path: `${path}.${g}`, message: `${g} 등급이 ${ids.length}종 (${perGrade}종이어야 한다)` });
    const seen = new Set<string>();
    ids.forEach((id, i) => {
      const t = byId.get(id);
      if (!t) issues.push({ path: `${path}.${g}[${i}]`, message: `없는 타워: ${id}` });
      else if (t.grade !== g) issues.push({ path: `${path}.${g}[${i}]`, message: `${id}는 ${t.grade} 등급이다 (${g} 자리)` });
      if (seen.has(id)) issues.push({ path: `${path}.${g}[${i}]`, message: `같은 타워가 두 번: ${id}` });
      seen.add(id);
    });
  }
  return issues;
}
