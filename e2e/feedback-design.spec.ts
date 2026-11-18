/** Codex 디자인 피드백: 실제 그림 로딩·실루엣 등급 색·모바일 배치·판매 확인·접은 종족 선택. */
import { test, expect, type Page } from '@playwright/test';
import { clickStart } from './title';
import { mkdirSync } from 'node:fs';

test.describe.configure({ timeout: 180_000 });
const shot = async (page: Page, name: string) => {
  mkdirSync('docs/art/feedback-design', { recursive: true });
  await page.screenshot({ path: `docs/art/feedback-design/${name}.png`, animations: 'disabled' });
};

for (const width of [320, 412]) {
  test(`FB-15/16/18/25: ${width}px 앱 아이콘·상점 그림·상단 자원·전투 아이콘`, async ({ page }) => {
    await page.setViewportSize({ width, height: 915 });
    await page.goto('/?seed=42');
    await page.locator('.lobby-nav [data-tab="shop"]').click();
    const icons = page.locator('.shop-icon.ui-art-icon');
    await expect(icons).toHaveCount(5);
    await expect(page.locator('.shop-icon.is-loaded')).toHaveCount(5);
    await expect(page.locator('.lobby-nav [data-art-icon="shop"]')).toHaveClass(/is-loaded/);
    const favicon = await page.locator('link[rel="icon"]').getAttribute('href');
    expect(favicon).toContain('assets/ui/app-192.png');
    if (width === 412) await shot(page, 'lobby-shop');
    await clickStart(page);
    await expect(page.locator('.hud-menu .ui-art-icon.is-loaded')).toHaveCount(4);
    await expect(page.locator('.hud > .hud-bar .hud-gold')).toHaveCount(1);
    await expect(page.locator('.hud > .hud-bar .hud-towers')).toHaveCount(1);
    await expect(page.locator('.hud-bottom .hud-gold, .hud-bottom .hud-towers')).toHaveCount(0);
    const metrics = await page.evaluate(() => {
      const resources = document.querySelector('.hud-resources')!.getBoundingClientRect();
      const dock = document.querySelector('.hud-dock')!.getBoundingClientRect();
      const worker = document.querySelector<HTMLImageElement>('.hud-hire img')!;
      return { resourceBottom: resources.bottom, dockTop: dock.top, overflow: document.documentElement.scrollWidth > innerWidth, workerLoaded: worker.complete && worker.naturalWidth > 0, buttons: [...document.querySelectorAll<HTMLElement>('.hud-menu > button')].map(b => ({ w: b.getBoundingClientRect().width, h: b.getBoundingClientRect().height, clipped: b.scrollWidth > b.clientWidth + 1 })) };
    });
    expect(metrics.resourceBottom).toBeLessThan(metrics.dockTop);
    expect(metrics.overflow).toBe(false);
    expect(metrics.workerLoaded).toBe(true);
    for (const b of metrics.buttons) { expect(b.w).toBeGreaterThanOrEqual(44); expect(b.h).toBeGreaterThanOrEqual(44); expect(b.clipped).toBe(false); }
    if (width === 412) await shot(page, 'battle-hud');
  });
}

test('FB-20/21/22: 전 등급 크기 순서·실제 실루엣 테두리·확대 별 배지', async ({ page }) => {
  await page.goto('/?dev=1&seed=7');
  await clickStart(page);
  const results = await page.evaluate(async () => {
    const load = (path: string): Promise<Record<string, unknown>> => import(/* @vite-ignore */ path);
    const { allLooks, lookScale } = await load('/src/art/characters/looks.ts') as typeof import('../src/art/characters/looks');
    const { outlinedArt, gradeOutlineColor } = await load('/src/art/characters/gradeOutline.ts') as typeof import('../src/art/characters/gradeOutline');
    const { STAR_BADGE_W_TILES } = await load('/src/view/render/TowerSprite.ts') as typeof import('../src/view/render/TowerSprite');
    const grades = ['normal', 'rare', 'unique', 'hero', 'legend', 'god', 'hidden'] as const;
    const sizes = grades.map(g => allLooks().filter(l => l.kind === 'tower' && 'grade' in l && l.grade === g).flatMap(l => [lookScale(l), lookScale(l, true)]));
    const source = document.createElement('canvas'); source.width = 64; source.height = 64;
    const c = source.getContext('2d')!; c.fillStyle = '#76543a'; c.beginPath(); c.arc(32, 32, 20, 0, Math.PI * 2); c.fill();
    const outlines = grades.map(g => {
      const art = outlinedArt(source, 64, 64, g); const ctx = art.canvas.getContext('2d')!;
      const pixels = ctx.getImageData(0, 0, art.canvas.width, art.canvas.height).data;
      const hex = gradeOutlineColor(g); const target = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); let count = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3]! > 240 && target.every((v, n) => Math.abs(pixels[i + n]! - v) < 5)) count++;
      return { g, count, center: [...ctx.getImageData(art.pad + 32, art.pad + 32, 1, 1).data] };
    });
    return { sizes, outlines, badge: STAR_BADGE_W_TILES };
  });
  for (let i = 1; i < results.sizes.length; i++) expect(Math.min(...results.sizes[i]!)).toBeGreaterThan(Math.max(...results.sizes[i - 1]!));
  for (const o of results.outlines) { expect(o.count, o.g).toBeGreaterThan(30); expect(o.center).toEqual([118, 84, 58, 255]); }
  expect(results.badge).toBeGreaterThan(0.56);
  const ids = ['archer', 'windarcher', 'icemage', 'paladin', 'archmage', 'fate', 'elemental'];
  await page.evaluate((ids) => {
    const s = (window as any).__rtd.game.scene.getScene('Game');
    const pads = [4, 7, 12, 15, 20, 23, 17];
    ids.forEach((id, i) => {
      const cell = s.match.map.buildable[pads[i]!];
      s.match.world.enqueue({ type: 'debugTower', x: cell[0], y: cell[1], t: s.match.rules.towerOrder.indexOf(id) });
    });
    s.debugFastForward(1);
  }, ids);
  await expect.poll(() => page.evaluate(() => (window as any).__rtd.game.scene.getScene('Game').towerLayer.count)).toBe(7);
  const keys = await page.evaluate((ids) => {
    const s = (window as any).__rtd.game.scene.getScene('Game');
    return ids.map(id => {
      const t = s.match.rules.towers.get(id);
      return s.textures.exists(`ext-char-tower-${id}-ol-${t.grade}`);
    });
  }, ids);
  expect(keys).toEqual(ids.map(() => true));
  await shot(page, 'battle-grades');
});

test('FB-29/30: 접은 종족 선택의 7개 선택과 상단 판매·고등급 재확인', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 915 });
  await page.goto('/?dev=1&seed=7');
  await clickStart(page);
  await page.getByTestId('menu-gamble').click();
  await page.getByTestId('sheet-tab-summon').click();
  const secondary = page.getByTestId('gacha-row-faction');
  const normal = page.getByTestId('gacha-row-lucky');
  expect((await secondary.boundingBox())!.width).toBeLessThan((await normal.boundingBox())!.width);
  await expect(page.locator('.sm-faction-picker')).not.toHaveAttribute('open', '');
  await secondary.scrollIntoViewIfNeeded();
  await shot(page, 'summon-secondary-closed-320');
  await page.locator('.sm-faction-summary').click();
  const choices = page.locator('.sm-faction');
  await expect(choices).toHaveCount(7);
  for (const choice of await choices.all()) expect((await choice.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.getByTestId('gacha-faction-kingdom').click();
  await expect(page.getByTestId('gacha-faction-kingdom')).toHaveAttribute('aria-checked', 'true');
  await shot(page, 'summon-secondary-320');
  await page.getByTestId('sheet-close').click();
  const id = await page.evaluate(() => {
    const s = (window as any).__rtd.game.scene.getScene('Game');
    const cell = s.match.map.buildable[12];
    s.match.world.enqueue({ type: 'debugTower', x: cell[0], y: cell[1], t: s.match.rules.towerOrder.indexOf('paladin') });
    s.debugFastForward(1);
    const tower = s.match.towers().find((t: any) => t.tower === 'paladin');
    return tower.id;
  });
  await expect.poll(() => page.evaluate((id) => (window as any).__rtd.game.scene.getScene('Game').towerLayer.footPx(id), id)).not.toBeNull();
  const pos = await page.evaluate((id) => (window as any).__rtd.game.scene.getScene('Game').towerLayer.footPx(id), id);
  const canvas = (await page.locator('#game canvas').boundingBox())!;
  const k = canvas.width / 1080;
  await page.mouse.click(canvas.x + pos.x * k, canvas.y + (pos.y - 25) * k);
  const panel = page.getByTestId('tower-panel');
  await expect(panel).toBeVisible();
  const sell = page.getByTestId('tp-sell');
  await expect(page.locator('.tp-head > [data-testid="tp-sell"]')).toBeVisible();
  const b = (await sell.boundingBox())!; expect(b.height).toBeGreaterThanOrEqual(44); expect(b.x + b.width).toBeLessThanOrEqual(320);
  await shot(page, 'sell-header-320');
  // 기존 t2 판매 검사와 같은 방식: 소프트웨어 렌더러의 도구 왕복이 2초 확인창을 넘기지 않게 두 누름을 한 번에 관측한다.
  const confirmation = await sell.evaluate(async (el) => {
    const button = el as HTMLButtonElement;
    const s = (window as any).__rtd.game.scene.getScene('Game');
    const before = s.match.towers().length;
    button.click();
    const first = { label: button.getAttribute('aria-label'), confirming: button.classList.contains('is-confirm'), count: s.match.towers().length, clipped: button.scrollWidth > button.clientWidth + 1 || button.scrollHeight > button.clientHeight + 1 };
    await new Promise(r => setTimeout(r, 300));
    const stillConfirming = button.classList.contains('is-confirm');
    button.click();
    return { before, first, stillConfirming };
  });
  expect(confirmation.first).toEqual({ label: '한 번 더 누르면 판매', confirming: true, count: confirmation.before, clipped: false });
  expect(confirmation.stillConfirming).toBe(true);
  await expect(panel).toHaveCount(0);
});
