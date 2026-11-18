/**
 * 피드백 #61: 신화 해방을 누르면 목록이 맨 위로 굴러가는 버그.
 * 해방하면 진행이 바뀌어 로비가 패널을 다시 그리는데(replaceChildren), 새 스크롤 상자는 scrollTop 0에서 시작했다.
 * → 같은 탭 안에서 다시 그릴 때는 스크롤 위치를 그대로 둔다 (탭을 바꾸면 예전처럼 맨 위).
 *  a. 도감 탭: 아래로 굴린 뒤 맨 아래 신화 [해방] → 스크롤 위치 그대로
 *  b. 영웅 탭 [신화]: 아래로 굴린 뒤 잠긴 신화 상세 창 [해방] → 닫아도 스크롤 위치 그대로
 */
import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 412, height: 915 } });

async function openLobby(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('[data-screen="title"][data-lobby="1"]')).toBeVisible();
}

async function patchProgress(page: Page, patch: string): Promise<void> {
  await page.evaluate((src) => {
    const p = JSON.parse(localStorage.getItem('rtd.progress')!) as Record<string, unknown>;
    new Function('p', src)(p);
    localStorage.setItem('rtd.progress', JSON.stringify(p));
  }, patch);
  await openLobby(page);
}

const scrollTop = (page: Page, sel: string): Promise<number> => page.locator(sel).evaluate((el) => el.scrollTop);

test('FB61 a. 도감 [해방]을 눌러도 목록이 맨 위로 굴러가지 않는다', async ({ page }) => {
  await openLobby(page);
  await page.locator('.lobby-nav [data-tab="codex"]').click();
  const rows = page.locator('.codex-row');
  await expect(rows).toHaveCount(12);
  const id = (await rows.last().getAttribute('data-hero'))!;
  await patchProgress(page, `p.heroes[${JSON.stringify(id)}].cards = 5;`);
  await page.locator('.lobby-nav [data-tab="codex"]').click();
  const list = '[data-panel="codex"] .lobby-scroll';
  await page.locator(list).evaluate((el) => (el.scrollTop = el.scrollHeight));
  const before = await scrollTop(page, list);
  expect(before).toBeGreaterThan(50);
  await page.getByTestId(`codex-unlock-${id}`).click();
  await expect(page.locator(`.codex-row[data-hero="${id}"]`)).toHaveClass(/is-unlocked/);
  expect(Math.abs((await scrollTop(page, list)) - before)).toBeLessThanOrEqual(2);
  // 탭을 바꿨다 돌아오면 예전처럼 맨 위부터
  await page.locator('.lobby-nav [data-tab="heroes"]').click();
  await page.locator('.lobby-nav [data-tab="codex"]').click();
  expect(await scrollTop(page, list)).toBe(0);
});

test('FB61 b. 영웅 탭 [신화] 상세 창 [해방] 뒤에도 목록 스크롤 그대로', async ({ page }) => {
  await openLobby(page);
  await page.locator('.lobby-nav [data-tab="heroes"]').click();
  await page.locator('[data-hero-tab="mythic"]').click();
  const cards = page.getByTestId('hero-grid-unowned').locator('.hero-card.is-locked');
  await expect(cards).toHaveCount(12);
  const id = (await cards.last().getAttribute('data-hero'))!;
  await patchProgress(page, `p.heroes[${JSON.stringify(id)}].cards = 5;`);
  await page.locator('.lobby-nav [data-tab="heroes"]').click();
  await page.locator('[data-hero-tab="mythic"]').click();
  const list = '[data-panel="heroes"] .lobby-scroll';
  await page.locator(list).evaluate((el) => (el.scrollTop = el.scrollHeight));
  const before = await scrollTop(page, list);
  expect(before).toBeGreaterThan(50);
  await page.locator(`.hero-card[data-hero="${id}"]`).click();
  await page.getByTestId('hero-unlock').click();
  await expect(page.getByTestId('hero-grid-owned').locator(`.hero-card[data-hero="${id}"]`)).toHaveCount(1);
  expect(Math.abs((await scrollTop(page, list)) - before)).toBeLessThanOrEqual(2);
});
