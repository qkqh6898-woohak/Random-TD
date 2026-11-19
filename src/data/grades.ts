/**
 * 등급 하나의 정답 (V2.0 PR-A '등급 이름·순서 통일'). 순서·한국어 이름은 여기 한 곳에서만 정한다.
 *
 * - 순서 (낮음 → 높음): 노말 < 레어 < 유니크 < 히어로 < 레전드 < 신 < **리미티드**.
 *   내부 id는 그대로다 (저장·리플레이·towers.json이 id로 묶여 있다): 리미티드 = `hidden` (예전 화면 이름 '신화').
 * - 등급 번호(rank) = 순서 자리 + 1 (노말 1 … 신 6 · 리미티드 7). sim 천장·자동 판매·자동 승급 비교(rules.gradeRank),
 *   로비 정렬, 등급 설명 창이 모두 이 번호를 쓴다.
 * - 힘(towers.json baseDps)·전투 그림 크기(characterLooks scale)도 이 순서를 따른다 — tests/unit/grades.test.ts가 지킨다.
 *
 * sim에서도 import한다 → Phaser·DOM·window 없음, 계산 없음 (상수만).
 */

/** 등급 id, 낮은 등급부터 (= 등급 순서). */
export const GRADES = ['normal', 'rare', 'unique', 'hero', 'legend', 'god', 'hidden'] as const;
export type Grade = (typeof GRADES)[number];

/** 등급 번호: 노말 1 · 레어 2 · 유니크 3 · 히어로 4 · 레전드 5 · 신 6 · 리미티드 7. */
export const GRADE_RANK: Readonly<Record<Grade, number>> = Object.freeze(
  Object.fromEntries(GRADES.map((g, i) => [g, i + 1])) as Record<Grade, number>,
);

/** 화면 이름 (피드백 #23 통일 + V2.0 '신화' → '리미티드'). */
export const GRADE_NAMES: Readonly<Record<Grade, string>> = Object.freeze({
  normal: '노말',
  rare: '레어',
  unique: '유니크',
  hero: '히어로',
  legend: '레전드',
  god: '신',
  hidden: '리미티드',
});

/** 리미티드(내부 id `hidden`)의 화면 이름 — 메뉴·도감·알림 글자에 쓴다. */
export const LIMITED_NAME = GRADE_NAMES.hidden;

/** 등급 이름 (모르는 값은 빈 글자). */
export function gradeName(grade: string): string {
  return (GRADE_NAMES as Record<string, string>)[grade] ?? '';
}

/** 등급 비교: a가 낮으면 음수 (정렬용, 낮은 등급 먼저). */
export function compareGrades(a: Grade, b: Grade): number {
  return GRADE_RANK[a] - GRADE_RANK[b];
}
