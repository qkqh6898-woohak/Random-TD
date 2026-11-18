/**
 * 피드백 #27 '소환 확률을 높이는 강화를 돈으로 사기' — [⬆ 강화] 능력치 탭 맨 아래 🍀 소환 확률 줄:
 * [비용]을 누르면 돈을 내고 Lv·효과(레어 확률 %p)·다음 비용이 오르고, 412 화면에서 줄이 시트 안에 보인다.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { clickStart } from './title';

type SceneLike = {
  match: {
    state: { gold: number; upgrades: number[][] };
    rules: { upgrades: { id: string; k: number }[] };
    world: { enqueue(c: unknown): { ok: boolean } };
  };
  debugFastForward(n: number): number;
};

async function inScene<T, A>(page: Page, fn: (s: SceneLike, arg: A) => T, arg: A): Promise<T> {
  return page.evaluate(
    ([src, a]) => {
      const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game');
      return new Function('s', 'a', `return (${src})(s, a);`)(s, a) as T;
    },
    [fn.toString(), arg] as const,
  );
}

test('피드백 #27: [⬆ 강화] 능력치 탭의 🍀 소환 확률을 돈으로 올린다', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?debug=1&seed=42');
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
  await page.getByTestId('menu-upgrade').click();
  await page.getByTestId('sheet-tab-stat').click();
  const row = page.getByTestId('upgrade-row-summonLuck');
  await expect(row).toBeVisible();
  await expect(row.locator('.up-lv')).toHaveText('Lv 0/20');
  await expect(row.locator('.up-effect')).toHaveText('+0%p → +0.5%p');
  await expect(row.locator('.up-target')).toHaveText('소환 · 레어 확률');
  await expect(page.getByTestId('upgrade-buy-summonLuck')).toHaveText('100원');
  const k = await inScene(page, (s) => s.match.rules.upgrades.find((u) => u.id === 'summonLuck')!.k, null);
  const gold0 = await inScene(page, (s) => s.match.state.gold, null);
  await page.getByTestId('upgrade-buy-summonLuck').click();
  await expect(row.locator('.up-lv')).toHaveText('Lv 1/20');
  await expect(row.locator('.up-effect')).toHaveText('+0.5%p → +1%p');
  await expect(page.getByTestId('upgrade-buy-summonLuck')).toHaveText('150원');
  expect(await inScene(page, (s, kk) => s.match.state.upgrades[0]![kk], k)).toBe(1);
  expect(await inScene(page, (s) => s.match.state.gold, null)).toBe(gold0 - 100);
  // 줄이 화면 안 (가로로 넘치지 않음)
  const box = (await row.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(412);
  mkdirSync('docs/screens', { recursive: true });
  await row.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'docs/screens/FB27-summon-upgrade.png', animations: 'disabled' });
  expect(errors).toEqual([]);
});
