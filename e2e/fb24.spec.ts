/**
 * 피드백 #24 📘 등급·조합 설명 창 E2E (휴대폰 412×915, 320 배치):
 *  전투 ⏸ 일시정지 → [📘 등급·조합 설명] → 등급 7줄(낮음 → 높음, 별) · 승급 방법 · 리미티드 조합식(발견 전 ???) → 뒤로 가기로 닫힘(메뉴는 남음)
 *  412·320: 창이 화면 안, 가로 넘침 없음, 여는 버튼 44px 이상
 * 스크린샷 (deviceScaleFactor 1): docs/screens/FB24-grade-guide.png
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { clickStart } from './title';

async function startAndPause(page: Page): Promise<void> {
  await page.goto('/?seed=2424');
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
  await page.getByRole('button', { name: '일시정지' }).click();
  await expect(page.locator('[data-screen="pause"]')).toBeVisible();
}

for (const width of [412, 320]) {
  test(`FB-24 일시정지 → 등급·조합 설명 창 (${width}px)`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.setViewportSize({ width, height: 915 });
    await startAndPause(page);
    const open = page.locator('[data-screen="pause"]').getByTestId('grade-guide-open');
    const ob = await open.boundingBox();
    expect(ob!.height).toBeGreaterThanOrEqual(44);
    expect(ob!.y + ob!.height).toBeLessThanOrEqual(915);
    await open.click();
    const dlg = page.getByTestId('grade-guide-dialog');
    await expect(dlg).toBeVisible();
    const grades = dlg.locator('[data-testid="grade-guide-grades"] li');
    await expect(grades).toHaveCount(7);
    expect(await grades.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.grade))).toEqual(['normal', 'rare', 'unique', 'hero', 'legend', 'god', 'hidden']);
    await expect(grades.nth(4)).toContainText('★★★★★');
    await expect(grades.nth(4)).toContainText('레전드');
    await expect(dlg.getByTestId('grade-guide-rules')).toContainText('3개 → 다음 등급');
    await expect(dlg.getByTestId('grade-guide-recipe-summary')).toHaveText(/^발견 \d+\/12$/);
    await expect(dlg.getByTestId('grade-guide-recipe-goldking')).toContainText('???');
    const r = await dlg.evaluate((d) => {
      const b = d.getBoundingClientRect();
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, sw: document.documentElement.scrollWidth, w: window.innerWidth, h: window.innerHeight };
    });
    expect(r.left).toBeGreaterThanOrEqual(0);
    expect(r.right).toBeLessThanOrEqual(r.w);
    expect(r.top).toBeGreaterThanOrEqual(0);
    expect(r.bottom).toBeLessThanOrEqual(r.h);
    expect(r.sw).toBeLessThanOrEqual(r.w);
    if (width === 412 && process.env.SAVE_SCREENS) {
      mkdirSync('docs/screens', { recursive: true });
      await page.screenshot({ path: 'docs/screens/FB24-grade-guide.png' });
    }
    // 뒤로 가기 = 창만 닫힘, 일시정지 메뉴는 남음
    const handled = await page.evaluate(() => !window.dispatchEvent(new Event('randomtd:native-back', { cancelable: true })));
    expect(handled).toBe(true);
    await expect(dlg).toBeHidden();
    await expect(page.locator('[data-screen="pause"]')).toBeVisible();
    // 다시 열고 [닫기]
    await open.click();
    await expect(dlg).toBeVisible();
    await dlg.getByTestId('grade-guide-close').click();
    await expect(dlg).toBeHidden();
    expect(errors).toEqual([]);
  });
}
