/**
 * A-1 추가 요청 '원형 맵은 A로: 위아래 여백도 없애줘' — computeMapLayout 세로 반 칸 여백 제거 (tile = floor(min(w/cols, h/rows)), 화면만).
 * 412×915 · 360×800 · 390×844에서 순환의 정원·사거리 미로:
 * - 맵 맨 위 줄이 HUD 띠(준비 완료 막대·보스 막대 포함)와 알림 줄 아래, 맨 아래 줄이 아래 띠 위.
 * - 0번 줄의 큰 캐릭터(돌 골렘 ×1.25·용 소환사) 머리가 맵 위로 나와도 HUD 버튼(일시정지·배속) 누르기는 그대로 (DOM이 위)
 * 칸 크기는 콘솔에 'map-fill' 줄로 남긴다 (PROGRESS 기록용).
 */
import { expect, test, type Page } from '@playwright/test';
import { clickStart } from './title';

interface Probe {
  tile: number;
  mapTop: number;
  mapBottom: number;
  bandBottom: number;
  toastBottom: number;
  dockTop: number;
  css: number;
}

async function probe(page: Page): Promise<Probe> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __rtd: { game: { scene: { getScene(k: string): { mapLayout: { tile: number; originY: number; minRow: number; rows: number } } } }; ctx: { ui: { measureToastHeight(): number } } };
    };
    const s = w.__rtd.game.scene.getScene('Game');
    const L = s.mapLayout;
    const stage = document.querySelector('#stage')!.getBoundingClientRect();
    const k = stage.width / 1080;
    const bandBottom = document.querySelector('.hud-root > .hud')!.getBoundingClientRect().bottom;
    const gap = stage.width * 0.02; // Game.ts TOAST_GAP_OF_WIDTH
    const toastBottom = bandBottom + gap + w.__rtd.ctx.ui.measureToastHeight();
    const dockTop = document.querySelector('.hud-bottom')!.getBoundingClientRect().top;
    const top = stage.y + (L.originY + L.minRow * L.tile) * k;
    return { tile: L.tile, mapTop: top, mapBottom: top + L.rows * L.tile * k, bandBottom, toastBottom, dockTop, css: L.tile * k };
  });
}

function check(p: Probe, label: string): void {
  expect(p.mapTop, `${label}: 맵 위 ≥ HUD 띠 아래`).toBeGreaterThanOrEqual(p.bandBottom);
  expect(p.mapTop, `${label}: 맵 위 ≥ 알림 줄 아래`).toBeGreaterThanOrEqual(p.toastBottom - 0.5);
  expect(p.mapBottom, `${label}: 맵 아래 ≤ 아래 띠 위`).toBeLessThanOrEqual(p.dockTop);
}

for (const [w, h] of [
  [412, 915],
  [360, 800],
  [390, 844],
] as const) {
  test(`맵 위아래 여백 없음 ${w}×${h}: 순환의 정원·사거리 미로가 HUD·알림·준비 완료·보스 막대와 아래 띠 사이, 0줄 큰 캐릭터도 HUD 누르기를 막지 않음`, async ({ page }) => {
    test.slow();
    await page.setViewportSize({ width: w, height: h });
    // 순환의 정원 (준비 단계: [▶ 준비 완료] 막대가 보임)
    await page.goto('/?dev=1&seed=1');
    await clickStart(page);
    // [▶ 준비 완료]는 첫 타워가 생기면 보인다
    await page.getByTestId('hud-summon').click();
    await expect(page.getByTestId('hud-ready')).toBeVisible();
    await page.waitForTimeout(400);
    await expect.poll(async () => (await probe(page)).tile).toBeGreaterThan(0);
    const circle = await probe(page);
    check(circle, `${w}×${h} 순환의 정원 준비`);
    // 0번 줄에 큰 캐릭터 → HUD 버튼 가운데를 누르면 그 버튼
    await page.evaluate(() => {
      const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): { match: { rules: { towerOrder: string[] }; map: { buildable: [number, number][] }; world: { enqueue(c: unknown): unknown } } } } } } }).__rtd.game.scene.getScene('Game');
      const top = Math.min(...s.match.map.buildable.map(([, y]) => y));
      const row = s.match.map.buildable.filter(([, y]) => y === top);
      row.forEach(([x, y], i) => s.match.world.enqueue({ type: 'debugTower', x, y, t: s.match.rules.towerOrder.indexOf(i % 2 === 0 ? 'stonegolem' : 'dragoncaller') }));
    });
    await page.waitForTimeout(400);
    for (const action of ['pause', 'speed']) {
      const hit = await page.evaluate((a) => {
        const b = document.querySelector(`[data-action="${a}"]`)!.getBoundingClientRect();
        return document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)?.closest(`[data-action="${a}"]`) !== null;
      }, action);
      expect(hit, `${action} 버튼 누르기`).toBe(true);
    }
    if (process.env.SAVE_SCREENS === '1' && w === 412) await page.screenshot({ path: 'docs/screens/A1-map.png', animations: 'disabled' });
    // 보스 막대: 10단계까지 ⏭
    for (let i = 0; i < 10; i++) await page.locator('[data-action="skip-stage"]').click();
    await expect(page.getByTestId('hud-stage')).toHaveText(/WAVE 10/);
    await expect(page.getByTestId('hud-boss-name')).toBeVisible();
    await page.waitForTimeout(500);
    const boss = await probe(page);
    check(boss, `${w}×${h} 순환의 정원 보스`);

    // 사거리 미로 (캠페인 1)
    await page.goto('/?dev=1&seed=1');
    await expect(page.locator('[data-screen="title"]')).toBeVisible();
    if (await page.locator('[data-action="resume-match"]').isVisible()) {
      await page.locator('[data-action="campaign"]').click();
    } else await page.getByRole('button', { name: '캠페인 1 (디버그)' }).click();
    await expect(page.getByTestId('hud-stage')).toHaveText('1-준비');
    await expect.poll(async () => (await probe(page)).tile).toBeGreaterThan(0);
    const cross = await probe(page);
    check(cross, `${w}×${h} 사거리 미로`);
    console.log(`map-fill ${w}x${h} circle ${circle.tile} (${circle.css.toFixed(1)} CSS) crossroads ${cross.tile} (${cross.css.toFixed(1)} CSS)`);
  });
}
