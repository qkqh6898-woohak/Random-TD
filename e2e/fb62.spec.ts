/**
 * 피드백 #62 '새 게임을 시작했을 때 이전 게임 설정을 초기화하기(노말 자동판매, 레어 판매 등)':
 * 판에서 [노말 자동 판매]·[레어 이하 자동 판매]를 켜고 [필살기 자동]을 끄고 로비로 → [이어 하기]는 바꾼 그대로,
 * [새 게임]으로 시작하면 기본값(자동 판매 꺼짐 · 필살기 자동 켜짐 — 사용자 결정 FB-AD)으로 돌아간다. [눌러서 바로 승급](조작 취향)은 새 판에도 그대로.
 * 피드백 #63: [자동 승급]도 같은 규칙 — 레어 이하로 바꿔도 이어 하기는 그대로, 새 게임은 기본값(유니크 이하 — 사용자 결정 Q).
 * 이 파일은 E2E 기본 시드(자동 승급·필살기 자동 끔, e2e/seed.ts)를 지우고 진짜 기본값(결정 R 체크 모두 켜짐 = #62 동작)으로 본다.
 */
import { expect, test, type Page } from '@playwright/test';
import { clickStart } from './title';
import { useDefaultSettings } from './seed';

test.describe.configure({ timeout: 150_000 });

const SELL = ['pause-auto-sell-normal', 'pause-auto-sell-rare'] as const;

function saved(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): { saveState: { saved: boolean } } } } } }).__rtd.game.scene.getScene('Game');
    return s.saveState.saved;
  });
}

/** changed = 판 안에서 바꾼 상태(자동 판매 켬 · 필살기 자동 끔 · 자동 승급 레어 이하), 아니면 기본값(자동 판매 꺼짐 · 필살기 자동 켜짐 · 유니크 이하) */
async function expectSwitches(page: Page, changed: boolean): Promise<void> {
  for (const id of SELL) await expect(page.getByTestId(id)).toHaveAttribute('aria-checked', String(changed));
  await expect(page.getByTestId('pause-ult-auto')).toHaveAttribute('aria-checked', String(!changed));
  const merge = changed ? 'rare' : 'unique';
  for (const g of ['normal', 'rare', 'unique']) await expect(page.getByTestId(`pause-auto-merge-${g}`)).toHaveAttribute('aria-pressed', String(g === merge));
}

test('피드백 #62: 새 게임을 시작하면 자동 판매·필살기 자동·자동 승급이 기본값으로, 이어 하기는 그대로', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?seed=62');
  await useDefaultSettings(page);
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
  await expect.poll(() => saved(page)).toBe(true);

  // 판 안에서 세 스위치를 기본값과 반대로 바꾸고 자동 승급은 레어 이하로, 눌러서 바로 승급은 기본값(v0.1.16부터 꺼짐)과 반대로 켠다 —
  // 조작 취향은 새 판에도 남아야 한다 (PR #67은 바로 승급 기본 켜짐이던 main에서 만들어져 '끈다'를 기대했다 → v0.1.16 기본값에 맞춤)
  await page.locator('[data-action="pause"]').click();
  await expectSwitches(page, false);
  for (const id of [...SELL, 'pause-ult-auto']) await page.getByTestId(id).click();
  await page.getByTestId('pause-auto-merge-rare').click();
  await page.getByTestId('pause-tap-merge').click();
  await expectSwitches(page, true);
  await expect(page.getByTestId('pause-tap-merge')).toHaveAttribute('aria-checked', 'true');

  // 로비로 → [이어 하기]: 같은 판이라 바꾼 그대로
  await page.locator('[data-action="exit"]').click();
  await expect(page.locator('[data-action="resume-match"]')).toBeVisible();
  await page.locator('[data-action="resume-match"]').click();
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
  await page.locator('[data-action="pause"]').click();
  await expectSwitches(page, true);

  // 로비로 → [새 게임]: 판 안 스위치는 기본값, 눌러서 바로 승급은 켠 그대로
  await page.locator('[data-action="exit"]').click();
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
  await page.locator('[data-action="pause"]').click();
  await expectSwitches(page, false);
  await expect(page.getByTestId('pause-tap-merge')).toHaveAttribute('aria-checked', 'true');
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('rtd.settings') ?? '{}'));
  expect(st).toMatchObject({ autoSellNormal: false, autoSellRare: false, ultAuto: true, tapMerge: true, autoMergeNormal: false, autoMergeRare: false, autoMergeUnique: true });
  expect(errors).toEqual([]);
});
