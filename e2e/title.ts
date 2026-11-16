/**
 * 타이틀에서 새 판 시작 (A-1): 앞 판이 자동 저장돼 있으면 타이틀은 [▶ 이어 하기]·[새 게임] → [새 게임] → 확인 창 [새 게임 시작],
 * 저장이 없으면 예전 [▶ 시작]. 한 테스트 안에서 여러 번 판을 시작하는 스펙이 같이 쓴다.
 */
import { expect, type Page } from '@playwright/test';

export async function clickStart(page: Page): Promise<void> {
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
