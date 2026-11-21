/**
 * E2E 기본 저장소 시드 (playwright.config.ts storageState와 rtd.settings를 통째로 덮어쓰는 스펙이 같이 쓴다).
 *
 * 사용자 결정 FB-AD·Q: 새 판은 자동 승급(유니크 이하)·필살기 자동이 켜진 채 시작한다. 기존 스펙은 소환·손 승급·필살기 버튼을
 * '둘 다 꺼진 판'으로 확인해 왔다 → 기본 시드는 그 둘을 끄고(값) 결정 R '새 판을 시작하면 기본값으로' 체크도 그 두 묶음만 꺼서
 * 새 판에도 꺼진 채 남게 한다 (첫 승급 안내를 이미 본 계정으로 시작하는 F10 시드와 같은 이유). 자동 판매는 기본값(꺼짐·체크 켜짐) 그대로.
 * 실제 기본값(켜짐)은 e2e/fb-auto-defaults.spec.ts가 이 시드 없이(빈 설정) 확인한다.
 */
export const E2E_MATCH_SWITCHES_OFF = {
  ultAuto: false,
  autoMergeNormal: false,
  autoMergeRare: false,
  autoMergeUnique: false,
  resetUltAuto: false,
  resetAutoMerge: false,
} as const;

/** 기본 시드 rtd.settings 값 (형식 v2) */
export const E2E_SETTINGS_SEED = JSON.stringify({ v: 2, ...E2E_MATCH_SWITCHES_OFF });

/** 첫 승급 안내를 이미 본 계정 (F10) */
export const E2E_ACCOUNT_SEED = JSON.stringify({ v: 1, level: 1, hidden: [], guides: ['firstMerge'] });

/**
 * 이 페이지의 저장된 설정을 지우고 다시 연다 → 진짜 기본값(사용자 결정 FB-AD·Q·R)으로 시작.
 * addInitScript로 지우면 다시 열 때마다 지워져 저장이 남지 않으므로 한 번만 지운다. 먼저 page.goto로 같은 주소를 연 뒤 부른다.
 */
export async function useDefaultSettings(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => localStorage.removeItem('rtd.settings'));
  await page.reload();
}
