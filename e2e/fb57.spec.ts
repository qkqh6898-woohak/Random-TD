/**
 * 피드백 #57 '설정 위치가 살짝 왼쪽으로 옮겨져있음' — 로비 오른쪽 줄 [기록]·[설정]:
 * [기록]이 타이틀 화면용 위치(left·top 3cqw)를 물려받아 오른쪽·아래로 밀려 있어 [설정]이 왼쪽으로 어긋나 보였다.
 * 오른쪽 줄 버튼은 같은 x·너비, 왼쪽 줄([퀘스트]·[영웅 모집])과 좌우 대칭, 화면 밖으로 나가지 않는다.
 */
import { expect, test, type Page } from '@playwright/test';

async function openLobby(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('[data-screen="title"][data-lobby="1"]')).toBeVisible();
}

for (const vp of [
  { width: 412, height: 915 },
  { width: 320, height: 640 },
]) {
  test(`피드백 #57: 로비 [기록]·[설정] 같은 줄 정렬, 왼쪽 줄과 대칭 (${vp.width}px)`, async ({ page }) => {
    await page.setViewportSize(vp);
    await openLobby(page);
    const box = async (sel: string) => (await page.locator(sel).boundingBox())!;
    const records = await box('[data-action="records"]');
    const settings = await box('[data-action="settings"]');
    const quests = await box('[data-action="quests"]');
    const recruit = await box('[data-action="recruit"]');
    const stage = await box('.lobby-battle');
    expect(Math.abs(records.x - settings.x)).toBeLessThan(1);
    expect(Math.abs(records.width - settings.width)).toBeLessThan(1);
    // 세로 간격도 왼쪽 줄과 같다 (첫 버튼 위 끝 · 두 버튼 사이)
    expect(Math.abs(records.y - quests.y)).toBeLessThan(1);
    expect(Math.abs(settings.y - records.y - (recruit.y - quests.y))).toBeLessThan(1);
    // 좌우 대칭: 왼쪽 여백 = 오른쪽 여백
    const leftGap = quests.x - stage.x;
    const rightGap = stage.x + stage.width - (settings.x + settings.width);
    expect(Math.abs(leftGap - rightGap)).toBeLessThan(1);
    expect(records.x + records.width).toBeLessThanOrEqual(stage.x + stage.width);
  });
}
