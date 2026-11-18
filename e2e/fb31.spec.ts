/**
 * 피드백 #31 '영웅 레벨업도 한번에 할수있고 정렬 기능도 넣어줘' — 로비 [영웅] 탭:
 * [⬆ 모두 레벨업 N]으로 카드·골드가 되는 영웅을 한 번에 올리고, 정렬에 [레벨업 가능](카드가 모인 영웅 먼저)을 더했다.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

async function openLobby(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('[data-screen="title"][data-lobby="1"]')).toBeVisible();
}

test('피드백 #31: [⬆ 모두 레벨업] · 정렬 [레벨업 가능]', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await openLobby(page);
  // 광부: 카드 5장(Lv1→2: 2장·100, Lv2→3: 3장·150), 궁수: 카드 2장(Lv1→2), 골드 1,000
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('rtd.progress')!);
    p.heroes.miner.cards = 5;
    p.heroes.archer.cards = 2;
    p.gold = 1000;
    localStorage.setItem('rtd.progress', JSON.stringify(p));
  });
  await openLobby(page);
  await page.locator('.lobby-nav [data-tab="heroes"]').click();
  const owned = page.getByTestId('hero-grid-owned').locator('.hero-card');
  // 정렬 [레벨업 가능]: 카드가 모인 광부·궁수가 맨 앞
  await page.locator('[data-sort="ready"]').click();
  await expect(page.locator('[data-sort="ready"]')).toHaveAttribute('aria-pressed', 'true');
  const firstTwo = [await owned.nth(0).getAttribute('data-hero'), await owned.nth(1).getAttribute('data-hero')].sort();
  expect(firstTwo).toEqual(['archer', 'miner']);
  const all = page.getByTestId('hero-levelup-all');
  await expect(all).toHaveText('⬆ 모두 레벨업 2');
  await expect(all).toBeEnabled();
  // 정렬 3칸과 모두 레벨업이 패널 밖으로 넘치지 않음 (320 너비 포함)
  for (const w of [412, 320]) {
    await page.setViewportSize({ width: w, height: w === 412 ? 915 : 640 });
    const panel = (await page.locator('.lobby-sortbar').first().boundingBox())!;
    for (const sel of ['[data-sort="grade"]', '[data-sort="level"]', '[data-sort="ready"]', '[data-testid="hero-levelup-all"]']) {
      const b = (await page.locator(sel).boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(panel.x - 1);
      expect(b.x + b.width).toBeLessThanOrEqual(panel.x + panel.width + 1);
      expect(b.height).toBeLessThan(60);
    }
  }
  await page.setViewportSize({ width: 412, height: 915 });
  mkdirSync('docs/screens', { recursive: true });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/screens/FB31-heroes.png', animations: 'disabled' });
  await all.click();
  // 광부 Lv3 (100 + 150), 궁수 Lv2 (100) → 골드 650
  await expect(page.locator('.hero-card[data-hero="miner"]')).toHaveAttribute('data-level', '3');
  await expect(page.locator('.hero-card[data-hero="archer"]')).toHaveAttribute('data-level', '2');
  await expect(all).toBeDisabled();
  await expect(all).toHaveText('⬆ 모두 레벨업');
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('rtd.progress')!) as { gold: number; heroes: Record<string, { level: number; cards: number }> });
  expect(after.gold).toBe(650);
  expect(after.heroes.miner).toEqual({ level: 3, cards: 0 });
  expect(after.heroes.archer).toEqual({ level: 2, cards: 0 });
  expect(errors).toEqual([]);
});
