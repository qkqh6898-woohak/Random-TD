/**
 * 피드백 #43 '스킬창 너무 커서 화면 안보임. 작게' — HUD [⚡ n] 필살기 목록이 맵을 가리지 않게 작게.
 * 찬 캐릭터가 많아도(12명) 목록은 무대 높이 30%·너비 48% 안, [모두 발동]은 스크롤 없이 늘 보이고, 나머지는 목록 안에서 스크롤.
 * SAVE_SCREENS=1이면 docs/screens/FB43-ult.png.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { clickStart } from './title';

const SAVE_DOCS = process.env.SAVE_SCREENS === '1';

async function readyMany(page: Page, n: number): Promise<number[]> {
  return page.evaluate((count) => {
    type S = {
      match: {
        map: { buildable: [number, number][] };
        rules: { towerOrder: string[] };
        towers(): { id: number }[];
        world: { enqueue(c: unknown): unknown; entities: { get(id: number): { ult: number } } };
      };
      debugFastForward(k: number): number;
    };
    const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game') as S;
    const pads = s.match.map.buildable;
    const order = s.match.rules.towerOrder;
    for (let i = 0; i < count; i++) s.match.world.enqueue({ type: 'debugTower', x: pads[i]![0], y: pads[i]![1], t: (i * 5) % order.length });
    s.debugFastForward(1);
    const ids = s.match.towers().map((t) => t.id);
    for (const id of ids) s.match.world.entities.get(id).ult = 10000;
    return ids;
  }, n);
}

for (const vp of [
  { width: 412, height: 915 },
  { width: 360, height: 800 },
]) {
  test(`필살기 목록이 작다 (${vp.width}×${vp.height}): 많이 준비돼도 맵을 덜 가리고 [모두 발동]은 늘 보인다`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize(vp);
    await page.goto('/?dev=1&seed=42');
    await clickStart(page);
    await expect(page.locator('[data-screen="game"]')).toBeVisible();
    await readyMany(page, 12);
    await expect(page.getByTestId('hud-ult')).toBeVisible();
    await page.getByTestId('hud-ult').click();
    const list = page.getByTestId('hud-ult-list');
    await expect(list).toBeVisible();
    await page.waitForTimeout(250);

    const r = await page.evaluate(() => {
      const stage = document.getElementById('stage')!.getBoundingClientRect();
      const l = document.querySelector<HTMLElement>('[data-testid="hud-ult-list"]')!;
      const lr = l.getBoundingClientRect();
      const all = document.querySelector<HTMLElement>('[data-testid="hud-ult-all"]')!.getBoundingClientRect();
      const items = [...l.querySelectorAll<HTMLElement>('.hud-ult-item')];
      const scroller = items[0]!.parentElement!;
      return {
        stageW: stage.width,
        stageH: stage.height,
        stageR: stage.right,
        list: { w: lr.width, h: lr.height, top: lr.top, bottom: lr.bottom, left: lr.left, right: lr.right },
        all: { top: all.top, bottom: all.bottom, h: all.height },
        items: items.length,
        itemH: items[0]!.getBoundingClientRect().height,
        scrolls: scroller.scrollHeight > scroller.clientHeight + 1,
        nameClipped: items.some((it) => {
          const n = it.querySelector<HTMLElement>('.hud-ult-name')!;
          return n.getBoundingClientRect().right > it.getBoundingClientRect().right + 0.5;
        }),
      };
    });
    mkdirSync('test-results/screens', { recursive: true });
    await page.screenshot({ path: `test-results/screens/FB43-ult-${vp.width}.png`, animations: 'disabled' });
    if (SAVE_DOCS && vp.width === 412) await page.screenshot({ path: 'docs/screens/FB43-ult.png', animations: 'disabled' });

    // 필살기가 있는 캐릭터만 목록에 (12명 중 6명 이상)
    expect(r.items).toBeGreaterThanOrEqual(6);
    await expect(page.getByTestId('hud-ult')).toHaveText(`⚡ ${r.items}`);
    // 작게: 무대 높이 30%·너비 48% 안 (고치기 전 412에서 약 330px·210px = 36%·51%, 12명이면 더 길어짐)
    expect(r.list.h).toBeLessThanOrEqual(r.stageH * 0.3);
    expect(r.list.w).toBeLessThanOrEqual(r.stageW * 0.48);
    expect(r.list.right).toBeLessThanOrEqual(r.stageR + 0.5);
    // 누르기 쉬운 크기는 지킨다
    expect(r.itemH).toBeGreaterThanOrEqual(30);
    expect(r.all.h).toBeGreaterThanOrEqual(30);
    // [모두 발동]은 스크롤 없이 목록 안에 보인다, 나머지는 목록 안에서 스크롤
    expect(r.all.top).toBeGreaterThanOrEqual(r.list.top - 0.5);
    expect(r.all.bottom).toBeLessThanOrEqual(r.list.bottom + 0.5);
    expect(r.scrolls).toBe(true);
    expect(r.nameClipped).toBe(false);

    // 동작은 그대로: 하나 발동 → 수가 줄고, [모두 발동] → 칩이 사라진다
    const first = page.locator('.hud-ult-item').first();
    await first.click();
    await expect(page.getByTestId('hud-ult')).toHaveText(`⚡ ${r.items - 1}`);
    await page.getByTestId('hud-ult-all').click();
    await expect(page.getByTestId('hud-ult')).toBeHidden();
    expect(errors).toEqual([]);
  });
}
