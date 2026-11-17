/**
 * G-2 전후 스크린샷 (412×915, deviceScaleFactor 1): G2_SHOT=before|after 일 때만 돈다 (평소 전체 E2E에서는 건너뜀).
 * docs/screens/G2-<태그>-{title,battle,summon,merge,sheet}.png — 타이틀 · 등급 섞인 타워 12개 · 소환 연출 · 승급 연출 · 강화 시트(금테 판).
 *   E2E_PORT=5194 G2_SHOT=after npx playwright test e2e/g2-shots.spec.ts --trace off
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { clickStart } from './title';

const TAG = process.env.G2_SHOT ?? 'after';
const DIR = 'docs/screens';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type S = any;
async function sim<T, A = null>(page: Page, fn: (s: S, a: A) => T, arg: A = null as A): Promise<T> {
  return page.evaluate(([src, a]) => {
    const s = (window as any).__rtd.game.scene.getScene('Game');
    return (0, eval)(src)(s, a);
  }, [`(${fn.toString()})`, arg] as const) as Promise<T>;
}
async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.screenshot({ path: `${DIR}/G2-${TAG}-${name}.png` });
}
async function start(page: Page) {
  await page.addInitScript(() => localStorage.setItem('rtd.settings', JSON.stringify({ v: 1, tapMerge: false })));
  await page.goto('/?debug=1&seed=42');
  await page.waitForTimeout(1500);
  await shot(page, 'title');
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
  await expect.poll(() => sim(page, (s) => s.mapLayout.tile)).toBeGreaterThan(0);
  await sim(page, (s) => s.match.world.enqueue({ type: 'debugAddGold', amount: 1_000_000 }));
  await page.waitForTimeout(300);
}
test('G-2 스크린샷', async ({ page }) => {
  test.skip(!process.env.G2_SHOT, 'G2_SHOT=before|after 일 때만');
  test.setTimeout(240_000);
  await start(page);
  const ids = ['miner', 'archer', 'merchant', 'bard', 'icemage', 'gambler', 'summoner', 'paladin', 'dragoncaller', 'archmage', 'fate', 'elemental'];
  await sim(page, (s, list) => {
    const b = s.match.map.buildable as [number, number][];
    // 띄엄띄엄 (붙지 않게 일부, 일부 붙게)
    const picks = [0, 2, 4, 9, 11, 13, 18, 20, 22, 27, 29, 31].map((i) => b[i % b.length]);
    list.forEach((id: string, i: number) => {
      const [x, y] = picks[i]!;
      s.match.world.enqueue({ type: 'debugTower', x, y, t: s.match.rules.towerOrder.indexOf(id) });
    });
    s.debugFastForward(1);
    return null;
  }, ids);
  await page.waitForTimeout(1200);
  await sim(page, (s) => s.debugFastForward(200));
  await page.waitForTimeout(800);
  await shot(page, 'battle');
  // 소환 연출
  await sim(page, (s) => { s.tweens.timeScale = 0.1; return null; });
  const free = await sim(page, (s) => {
    const used = new Set(s.match.towers().map((t: any) => `${t.tx},${t.ty}`));
    return (s.match.map.buildable as [number, number][]).filter(([a, b]) => !used.has(`${a},${b}`)).slice(0, 4);
  });
  await sim(page, (s, c) => { s.match.world.enqueue({ type: 'summon', x: c[0], y: c[1] }); return null; }, free[0]!);
  await page.waitForTimeout(3600);
  await sim(page, (s) => { s.tweens.pauseAll(); return null; });
  await shot(page, 'summon');
  await sim(page, (s) => { s.tweens.resumeAll(); return null; });
  await page.waitForTimeout(3500);
  // 승급 연출
  const tri = free.slice(1, 4);
  await sim(page, (s, l) => {
    for (const [x, y] of l) s.match.world.enqueue({ type: 'debugTower', x, y, t: s.match.rules.towerOrder.indexOf('goblin') });
    s.debugFastForward(1);
    return null;
  }, tri);
  await page.waitForTimeout(800);
  await sim(page, (s, c) => { s.match.world.enqueue({ type: 'merge', x: c[0], y: c[1] }); return null; }, tri[0]!);
  await page.waitForTimeout(7600);
  await sim(page, (s) => { s.tweens.pauseAll(); return null; });
  await shot(page, 'merge');
  await sim(page, (s) => { s.tweens.resumeAll(); s.tweens.timeScale = 1; return null; });
  await page.waitForTimeout(800);
  const close = page.locator('[data-action="panel-close"]');
  if (await close.count()) await close.first().click();
  await page.getByTestId('menu-upgrade').click();
  await page.waitForTimeout(900);
  await shot(page, 'sheet');
});
