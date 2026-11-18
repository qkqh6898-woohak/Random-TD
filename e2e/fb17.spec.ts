/**
 * 피드백 #17 '3개 모였을 때 누르면 바로 승급하지 말고 정보창이 뜨고 그 위에 승급을 눌러야 승급되게'.
 * 설정 '눌러서 바로 승급' 기본 꺼짐: 새 플레이어(설정 없음)와 예전 v1 저장값(켜짐)에서 가득 찬 무더기를 눌러도 승급되지 않고 정보창,
 * 정보창 [⬆ 승급]을 눌러야 승급. v2로 다시 켠 플레이어는 예전처럼 바로 승급.
 */
import { expect, test, type Page } from '@playwright/test';
import { clickStart } from './title';

test.describe.configure({ timeout: 150_000 });

type SceneLike = {
  match: {
    state: { gold: number };
    map: { buildable: [number, number][] };
    towers(): { id: number; tx: number; ty: number; tower: string }[];
    rules: { towerOrder: string[]; towers: Map<string, { grade: string }> };
    world: { enqueue(c: unknown): { ok: boolean } };
  };
  mapLayout: { originX: number; originY: number; tile: number };
  panelOpen: boolean;
  debugFastForward(n: number): number;
};

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  return errors;
}

async function inScene<T, A>(page: Page, fn: (s: SceneLike, arg: A) => T, arg: A): Promise<T> {
  return page.evaluate(
    ([src, a]) => {
      const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game');
      return new Function('s', 'a', `return (${src})(s, a);`)(s, a) as T;
    },
    [fn.toString(), arg] as const,
  );
}

/** 배치 칸 중 화면 가운데쯤 (위아래로 붙지 않는) 칸 하나 */
async function midCell(page: Page): Promise<[number, number]> {
  return inScene(
    page,
    (s) => {
      const b = s.match.map.buildable;
      return b[Math.floor(b.length / 2)]!;
    },
    null,
  );
}

async function tilePoint(page: Page, tx: number, ty: number): Promise<{ x: number; y: number; tile: number }> {
  return page.evaluate(
    ([x, y]) => {
      const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game') as {
        mapLayout: { originX: number; originY: number; tile: number };
      };
      const L = s.mapLayout;
      const r = document.getElementById('stage')!.getBoundingClientRect();
      const k = r.width / 1080;
      return { x: r.left + (L.originX + (x + 0.5) * L.tile) * k, y: r.top + (L.originY + (y + 0.5) * L.tile) * k, tile: L.tile * k };
    },
    [tx, ty] as const,
  );
}


async function startWith(page: Page, settings: string | null): Promise<void> {
  if (settings !== null) await page.addInitScript((v) => localStorage.setItem('rtd.settings', v), settings);
  await page.goto('/?dev=1&seed=42');
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
}

/** 가운데 칸에 같은 노말 타워 3개 (가득 찬 무더기) */
async function fullStack(page: Page): Promise<[number, number]> {
  const [tx, ty] = await midCell(page);
  await inScene(
    page,
    (s, a) => {
      const t = s.match.rules.towerOrder.findIndex((id) => s.match.rules.towers.get(id)?.grade === 'normal');
      for (let k = 0; k < 3; k++) s.match.world.enqueue({ type: 'debugTower', x: a[0], y: a[1], t });
      s.debugFastForward(1);
      return null;
    },
    [tx, ty] as [number, number],
  );
  await expect.poll(() => inScene(page, (s) => s.match.towers().length, null)).toBe(3);
  return [tx, ty];
}

for (const [name, settings] of [
  ['새 플레이어(설정 없음)', null],
  ['예전 v1 저장값(바로 승급 켜짐)', JSON.stringify({ v: 1, tapMerge: true })],
] as const) {
  test(`#17 ${name}: 가득 찬 무더기를 누르면 승급하지 않고 정보창 → [⬆ 승급]으로 승급`, async ({ page }) => {
    const errors = collectErrors(page);
    await startWith(page, settings);
    const [tx, ty] = await fullStack(page);
    const p = await tilePoint(page, tx, ty);
    await page.mouse.click(p.x, p.y + p.tile * 0.2);
    await expect.poll(() => inScene(page, (s) => s.panelOpen, null)).toBe(true);
    await page.waitForTimeout(400);
    expect(await inScene(page, (s) => s.match.towers().length, null)).toBe(3); // 아직 승급 안 함
    await page.locator('[data-action="merge"]').first().click();
    await expect.poll(() => inScene(page, (s) => s.match.towers().length, null)).toBeLessThan(3);
    expect(errors).toEqual([]);
  });
}

test('#17 v2로 다시 켠 플레이어: 누르면 예전처럼 바로 승급', async ({ page }) => {
  const errors = collectErrors(page);
  await startWith(page, JSON.stringify({ v: 2, tapMerge: true }));
  const [tx, ty] = await fullStack(page);
  const p = await tilePoint(page, tx, ty);
  await page.mouse.click(p.x, p.y + p.tile * 0.2);
  await expect.poll(() => inScene(page, (s) => s.match.towers().length, null)).toBeLessThan(3);
  expect(errors).toEqual([]);
});
