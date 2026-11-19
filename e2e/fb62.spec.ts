/**
 * 피드백 #62 '새 게임을 시작했을 때 이전 게임 설정을 초기화하기(노말 자동판매, 레어 판매 등)':
 * 판에서 [노말 자동 판매]·[레어 이하 자동 판매]·[필살기 자동]을 켜고 로비로 → [이어 하기]는 켜진 그대로,
 * [새 게임]으로 시작하면 세 스위치가 모두 꺼져 있다. [눌러서 바로 승급](조작 취향)은 새 판에도 그대로.
 */
import { expect, test, type Page } from '@playwright/test';
import { clickStart } from './title';

test.describe.configure({ timeout: 150_000 });

const SWITCHES = ['pause-auto-sell-normal', 'pause-auto-sell-rare', 'pause-ult-auto'] as const;

function saved(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): { saveState: { saved: boolean } } } } } }).__rtd.game.scene.getScene('Game');
    return s.saveState.saved;
  });
}

async function expectSwitches(page: Page, on: boolean): Promise<void> {
  for (const id of SWITCHES) await expect(page.getByTestId(id)).toHaveAttribute('aria-checked', String(on));
}

test('피드백 #62: 새 게임을 시작하면 자동 판매·필살기 자동이 꺼지고, 이어 하기는 그대로', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?seed=62');
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
  await expect.poll(() => saved(page)).toBe(true);

  // 판 안에서 세 스위치를 켜고, 눌러서 바로 승급은 끈다
  await page.locator('[data-action="pause"]').click();
  await expectSwitches(page, false);
  for (const id of SWITCHES) await page.getByTestId(id).click();
  await page.getByTestId('pause-tap-merge').click();
  await expectSwitches(page, true);
  await expect(page.getByTestId('pause-tap-merge')).toHaveAttribute('aria-checked', 'false');

  // 로비로 → [이어 하기]: 같은 판이라 켜진 그대로
  await page.locator('[data-action="exit"]').click();
  await expect(page.locator('[data-action="resume-match"]')).toBeVisible();
  await page.locator('[data-action="resume-match"]').click();
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
  await page.locator('[data-action="pause"]').click();
  await expectSwitches(page, true);

  // 로비로 → [새 게임]: 세 스위치는 꺼짐, 눌러서 바로 승급은 끈 그대로
  await page.locator('[data-action="exit"]').click();
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
  await page.locator('[data-action="pause"]').click();
  await expectSwitches(page, false);
  await expect(page.getByTestId('pause-tap-merge')).toHaveAttribute('aria-checked', 'false');
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('rtd.settings') ?? '{}'));
  expect(st).toMatchObject({ autoSellNormal: false, autoSellRare: false, ultAuto: false, tapMerge: false });
  expect(errors).toEqual([]);
});
