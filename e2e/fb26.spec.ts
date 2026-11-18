/**
 * 피드백 #26 E2E (휴대폰 412×915 · 좁은 320): 맵 오른쪽 위 [⏫ 모두 승급 n] — 승급할 무더기가 있을 때만 보이고,
 * 누르면 가득 찬 무더기가 남김없이 승급된다 (연쇄 승급 규칙 그대로). 위 띠 높이·맵 위치는 그대로, 화면 밖으로 안 넘친다.
 * 스크린샷: test-results/screens/FB26-merge-all.png (SAVE_SCREENS=1이면 docs/screens/FB26-merge-all.png).
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { clickStart } from './title';

const SAVE_DOCS = process.env.SAVE_SCREENS === '1';

type SceneLike = {
  match: {
    map: { buildable: [number, number][] };
    towers(): { tx: number; ty: number; tower: string }[];
    rules: { towerOrder: string[] };
    world: { enqueue(c: unknown): { ok: boolean } };
  };
  debugFastForward(n: number): number;
};

async function inScene<R, A>(page: Page, fn: (s: SceneLike, arg: A) => R, arg: A): Promise<R> {
  return page.evaluate(
    ([src, a]) => {
      const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game');
      return new Function('s', 'a', `return (${src})(s, a);`)(s, a) as R;
    },
    [fn.toString(), arg] as const,
  );
}

/** 무더기별 타워 수 (칸 → 수) 중 3 이상(가득 참)인 칸 수 */
async function fullCount(page: Page): Promise<number> {
  return inScene(
    page,
    (s) => {
      const m = new Map<string, number>();
      for (const t of s.match.towers()) m.set(`${t.tx},${t.ty}`, (m.get(`${t.tx},${t.ty}`) ?? 0) + 1);
      return [...m.values()].filter((n) => n >= 3).length;
    },
    null,
  );
}

async function setup(page: Page): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?dev=1&seed=26');
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
  const btn = page.getByTestId('hud-merge-all');
  await expect(btn).toBeHidden();
  const bandBefore = await page.locator('.hud').evaluate((el) => el.getBoundingClientRect().height);
  const pads = await inScene(page, (s) => s.match.map.buildable, null);
  await inScene(
    page,
    (s, p) => {
      const put = (i: number, id: string, n: number): void => {
        for (let k = 0; k < n; k++) s.match.world.enqueue({ type: 'debugTower', x: p[i]![0], y: p[i]![1], t: s.match.rules.towerOrder.indexOf(id) });
      };
      put(0, 'goblin', 3);
      put(3, 'goblin', 3);
      put(6, 'archer', 3);
      put(9, 'miner', 2);
      s.debugFastForward(1);
      return null;
    },
    pads,
  );
  await expect(btn).toBeVisible();
  await expect(btn).toHaveText('⏫ 모두 승급 3');
  // 위 띠 높이 그대로 (버튼은 띠 아래에 떠 있다) · 화면 안 · 오른쪽 위 · 누를 만한 크기
  expect(await page.locator('.hud').evaluate((el) => el.getBoundingClientRect().height)).toBe(bandBefore);
  const vp = page.viewportSize()!;
  const box = (await btn.boundingBox())!;
  const band = (await page.locator('.hud').boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
  expect(box.x + box.width / 2).toBeGreaterThan(vp.width / 2);
  expect(box.y).toBeGreaterThanOrEqual(band.y + band.height - 1);
  expect(box.y).toBeLessThan(vp.height / 3);
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(errors).toEqual([]);
}

test('[⏫ 모두 승급 n]: 오른쪽 위에 보이고, 누르면 가득 찬 무더기가 모두 승급', async ({ page }) => {
  await setup(page);
  expect(await fullCount(page)).toBe(3);
  mkdirSync('test-results/screens', { recursive: true });
  await page.screenshot({ path: 'test-results/screens/FB26-merge-all.png', animations: 'disabled' });
  if (SAVE_DOCS) await page.screenshot({ path: 'docs/screens/FB26-merge-all.png', animations: 'disabled' });
  // v0.1.14 통합: 일시정지 메뉴가 열리면 숨는다 (z-index로 메뉴 위에 떠서 스위치를 가로채던 것) — 닫으면 다시 보인다
  await page.getByRole('button', { name: '일시정지' }).click();
  await expect(page.locator('[data-screen="pause"]')).toBeVisible();
  await expect(page.getByTestId('hud-merge-all')).toBeHidden();
  await page.getByTestId('pause-tap-merge').click();
  await page.getByTestId('pause-tap-merge').click();
  await page.getByRole('button', { name: '계속' }).click();
  await expect(page.getByTestId('hud-merge-all')).toBeVisible();
  await page.getByTestId('hud-merge-all').click();
  await expect.poll(() => fullCount(page)).toBe(0);
  await expect(page.getByTestId('hud-merge-all')).toBeHidden();
  // 덜 찬 무더기(광부 2)는 그대로
  expect(await inScene(page, (s) => s.match.towers().filter((t) => t.tower === 'miner').length, null)).toBe(2);
});

test.describe('좁은 화면 320', () => {
  test.use({ viewport: { width: 320, height: 700 } });
  test('버튼이 화면 안에 한 줄로', async ({ page }) => {
    await setup(page);
    const h = await page.getByTestId('hud-merge-all').evaluate((el) => el.getBoundingClientRect().height);
    expect(h).toBeLessThan(60);
  });
});
