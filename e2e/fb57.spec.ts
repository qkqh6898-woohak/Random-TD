/** PR-D moves the formerly adjacent record/settings buttons into a menu.
 * Keep their selectors, equal widths/alignment, hit targets and small-screen containment checks. */
import { expect, test } from '@playwright/test';
import { openLobbyMenu } from './title';

for (const vp of [{ width: 412, height: 915 }, { width: 320, height: 640 }]) {
  test(`피드백 #57 / PR-D: 메뉴 [기록]·[설정] 정렬·44px·화면 안 (${vp.width}px)`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto('/');
    await expect(page.locator('[data-screen="title"][data-lobby="1"]')).toBeVisible();
    await expect(page.locator('[data-action="settings"]')).toBeHidden();
    await openLobbyMenu(page);
    const records = (await page.locator('[data-action="records"]').boundingBox())!;
    const settings = (await page.locator('[data-action="settings"]').boundingBox())!;
    const menu = (await page.getByTestId('lobby-menu').boundingBox())!;
    expect(Math.abs(records.x - settings.x)).toBeLessThan(1);
    expect(Math.abs(records.width - settings.width)).toBeLessThan(1);
    expect(settings.y).toBeGreaterThanOrEqual(records.y + records.height + 8);
    for (const button of [records, settings]) {
      expect(button.width).toBeGreaterThanOrEqual(44);
      expect(button.height).toBeGreaterThanOrEqual(44);
      expect(button.x).toBeGreaterThanOrEqual(menu.x);
      expect(button.x + button.width).toBeLessThanOrEqual(menu.x + menu.width);
      expect(button.y + button.height).toBeLessThanOrEqual(menu.y + menu.height);
    }
    expect(menu.x).toBeGreaterThanOrEqual(0);
    expect(menu.x + menu.width).toBeLessThanOrEqual(vp.width);
    expect(menu.y + menu.height).toBeLessThanOrEqual(vp.height);
    await page.locator('[data-action="settings"]').click();
    await expect(page.getByTestId('lobby-menu')).toBeHidden();
    await expect(page.getByTestId('settings-dialog')).toBeVisible();
  });
}
