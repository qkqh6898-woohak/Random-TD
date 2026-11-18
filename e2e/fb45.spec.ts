/**
 * 피드백 #45 '돈 +1890 이러는 거는 누적이 아니라 개별로 표기':
 * 짧은 시간 안에 돈이 여러 번 들어오면 돈 옆 '+n원'을 합치지 않고 하나씩 따로 띄운다 (겹치지 않게 한 줄씩).
 */
import { expect, test } from '@playwright/test';
import { clickStart } from './title';
import { mkdirSync } from 'node:fs';

test('돈 +n원은 들어온 돈마다 따로 (합친 숫자가 아님)', async ({ page }) => {
  await page.goto('/?debug=1');
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
  await page.evaluate(() => {
    const w = window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } };
    const s = w.__rtd.game.scene.getScene('Game') as { hud: { gainGold(n: number): void } };
    for (const n of [30, 30, 1890]) s.hud.gainGold(n);
  });
  // 떠오름은 0.7초라 느린 헤드리스에서도 놓치지 않게 글자·자리를 한 번에 읽는다
  const shown = await page.waitForFunction(() => {
    const els = [...document.querySelectorAll<HTMLElement>('[data-testid="hud-gold-gain"]')];
    if (els.length < 3) return null;
    const gold = document.querySelector('[data-testid="hud-gold"]')!.getBoundingClientRect();
    // 떠오르며 움직이므로 글자 상자 대신 줄 기준 자리(애니메이션 없는 위치)를 본다
    const rest = els.map((e) => {
      const r = e.getBoundingClientRect();
      const shift = new DOMMatrix(getComputedStyle(e).transform).m42;
      return { top: r.top - shift, bottom: r.bottom - shift, left: r.left, right: r.right };
    });
    return {
      texts: els.map((e) => e.textContent),
      slots: els.map((e) => e.dataset.slot),
      tops: rest.map((r) => Math.round(r.top)),
      // 돈 숫자와 겹치는 정도 (px) — 위·아래 줄이거나 옆(FB-D1 위 HUD 자원 줄은 돈 오른쪽)이면 0
      goldOverlap: rest.map((r) =>
        Math.min(r.right, gold.right) - Math.max(r.left, gold.left) <= 0 ? 0 : Math.max(0, Math.min(r.bottom, gold.bottom) - Math.max(r.top, gold.top)),
      ),
      goldHeight: gold.height,
    };
  });
  const { texts, slots, tops, goldOverlap, goldHeight } = (await shown.jsonValue())!;
  for (const o of goldOverlap) expect(o).toBeLessThan(goldHeight / 2);
  expect(texts).toEqual(['+30원', '+30원', '+1,890원']);
  // 한 줄씩 다른 높이 (겹쳐서 하나로 읽히지 않게)
  expect(new Set(slots).size).toBe(3);
  expect(new Set(tops).size).toBe(3);
  if (process.env.SAVE_SCREENS) {
    mkdirSync('docs/screens', { recursive: true });
    await page.waitForTimeout(150);
    await page.screenshot({ path: 'docs/screens/FB45-gold-gain.png' });
  }
  // 떠오름이 끝나면 모두 사라진다
  await expect(page.getByTestId('hud-gold-gain')).toHaveCount(0);
});
