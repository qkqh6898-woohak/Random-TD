/**
 * 피드백 #11 '퀘스트 보상은 한번에 받기 버튼' — 로비 [퀘스트] 창의 [모두 받기]:
 * 일일 4개 + 오늘 보너스 + 끝난 업적을 한 번에 받고, 받은 것을 한 창에 합쳐 보여 준 뒤 버튼이 꺼진다.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

async function openLobby(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('[data-screen="title"][data-lobby="1"]')).toBeVisible();
}

test('피드백 #11: 퀘스트 [모두 받기]로 일일·보너스·업적 보상을 한 번에', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await openLobby(page);
  // 오늘 일일 퀘스트 4개 모두 끝 + 누적 3판(업적 '전투 3판') → 지금 받을 것 5 (보너스는 일일 4개를 받아야 열리지만 [모두 받기]가 함께 받는다)
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('rtd.progress')!);
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    p.daily = { date: today, stats: { matches: 1, summons: 50, merges: 10, bossKills: 0, bestWave: 15 }, claimed: [], bonusClaimed: false };
    p.totals.matches = 3;
    localStorage.setItem('rtd.progress', JSON.stringify(p));
  });
  await openLobby(page);
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('rtd.progress')!) as { gold: number; gems: number });
  await page.locator('[data-action="quests"]').click();
  const all = page.getByTestId('quest-claim-all');
  await expect(all).toHaveText('모두 받기 5');
  await expect(all).toBeEnabled();
  const box = (await all.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(32);
  mkdirSync('docs/screens', { recursive: true });
  await page.screenshot({ path: 'docs/screens/FB11-quests.png', animations: 'disabled' });
  // 좁은 화면(320)에서도 [일일][업적]과 한 줄, 창 밖으로 넘치지 않음
  await page.setViewportSize({ width: 320, height: 640 });
  const dlg = (await page.getByTestId('quest-dialog').boundingBox())!;
  const b2 = (await all.boundingBox())!;
  const seg = (await page.locator('[data-quest-tab="daily"]').boundingBox())!;
  expect(b2.x + b2.width).toBeLessThanOrEqual(dlg.x + dlg.width);
  expect(Math.abs(b2.y + b2.height / 2 - (seg.y + seg.height / 2))).toBeLessThan(4);
  await page.setViewportSize({ width: 412, height: 915 });
  await all.click();
  const grant = page.getByTestId('grant-dialog');
  await expect(grant).toBeVisible();
  // 골드 200 + 300, 보석 10 + 20(보너스) + 20(업적)
  // ART-2: 💰·💎는 V2 재화 아이콘 그림 + 숫자
  await expect(grant.getByTestId('grant-gold')).toHaveText('+500');
  await expect(grant.getByTestId('grant-gold').locator('[data-icon="cur-gold"]')).toBeVisible();
  await expect(grant.getByTestId('grant-gems')).toHaveText('+50');
  await expect(grant.getByTestId('grant-gems').locator('[data-icon="cur-gems"]')).toBeVisible();
  await page.getByTestId('grant-dialog-close').click();
  await expect(all).toBeDisabled();
  await expect(all).toHaveText('모두 받기');
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('rtd.progress')!) as { gold: number; gems: number; daily: { claimed: string[]; bonusClaimed: boolean }; achievements: string[] });
  expect(after.daily.claimed).toEqual(['d-merge', 'd-play', 'd-summon', 'd-wave']);
  expect(after.daily.bonusClaimed).toBe(true);
  expect(after.achievements).toContain('a-play-3');
  expect(after.gold).toBe(before.gold + 500);
  expect(after.gems).toBe(before.gems + 50);
  await expect(page.getByTestId('quest-claim-bonus')).toHaveCount(0);
  await page.locator('[data-quest-tab="achievements"]').click();
  await expect(page.getByTestId('quest-claim-a-play-3')).toHaveCount(0);
  expect(errors).toEqual([]);
});
