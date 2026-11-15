/**
 * 개발자 모드 판단 (T-1). 한 곳에서만 정한다 — 화면의 개발용 기능(⏭ 즉시 다음 단계·💰+·×16 배속·잠긴 도박 테이블·
 * 타이틀 [캠페인 1]·`window.__rtd`)과 sim의 debug 판 입력이 모두 이 값을 따른다.
 *
 * 켜지는 경우 (하나라도):
 *  - URL `?debug=1` (예전부터 있던 개발용 치트 주소, CLAUDE.md 4장)
 *  - URL `?dev=1`
 *  - 테스트 빌드: `VITE_TEST_BUILD=1`로 만든 번들 (`npm run build:single` → release/운빨디펜스-test.html 은 개발자 빌드)
 *
 * 플래그가 없는 일반 빌드·주소는 예전과 똑같이 보이고 동작한다.
 * 순수 함수 (window·import.meta를 직접 읽지 않음) → 단위 테스트. 환경 값은 부르는 쪽(main.ts)이 넘긴다.
 */

/** URL 쿼리(`location.search`)와 빌드 플래그(`import.meta.env.VITE_TEST_BUILD`)로 개발자 모드인지. */
export function isDevMode(search: string, testBuildFlag?: string | boolean | null): boolean {
  if (testBuildFlag === '1' || testBuildFlag === true) return true;
  const p = new URLSearchParams(search);
  return p.get('debug') === '1' || p.get('dev') === '1';
}
