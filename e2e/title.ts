/**
 * 로비에서 새 판 시작 (G-3: 부팅 뒤 첫 화면은 로비 — 예전 타이틀 자리, 선택자 `data-screen="title"` 그대로).
 * 로비 [전투] 탭의 큰 버튼: 앞 판이 자동 저장돼 있으면 [▶ 이어 하기]·[새 게임] → [새 게임] → 확인 창 [새 게임 시작],
 * 저장이 없으면 [▶ 빠른 시작](`data-action="start"`, 무한 모드). 다른 탭이 열려 있으면 먼저 [전투] 탭으로.
 * 한 테스트 안에서 여러 번 판을 시작하는 스펙이 같이 쓴다 — 시작 흐름이 바뀌면 여기만 고친다.
 */
import { expect, type Page } from '@playwright/test';

export async function clickStart(page: Page): Promise<void> {
  const lobby = page.locator('[data-screen="title"]');
  await expect(lobby).toBeVisible();
  const battleTab = page.locator('.lobby-nav [data-tab="battle"]');
  if ((await battleTab.count()) > 0 && (await lobby.getAttribute('data-tab')) !== 'battle') await battleTab.click();
  const resume = page.locator('[data-action="resume-match"]');
  const start = page.locator('[data-action="start"]');
  await expect(resume.or(start)).toBeVisible();
  if (await resume.isVisible()) {
    await page.locator('[data-action="new-game"]').click();
    await page.getByTestId('new-game-ok').click();
  } else {
    await start.click();
  }
}

/** PR-D: records/settings retain their selectors, now reached through the lobby menu. */
export async function openLobbyMenu(page: Page): Promise<void> {
  await page.locator('[data-action="lobby-menu"]').click();
  await expect(page.getByTestId('lobby-menu')).toBeVisible();
}
