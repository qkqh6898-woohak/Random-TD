/**
 * 피드백 #65 E2E (휴대폰 412×915): 일꾼 옆 [⬆ 승급 가능 n]을 없애고 승급 버튼은 맵 오른쪽 위 [⏫ 모두 승급 n] 하나.
 * 한 번 누르면 패널 없이 가득 찬 무더기가 모두 승급, 꾹 누르고 있으면 그동안 새로 가득 찬 무더기도 계속 승급하고 손을 떼면 숨는다.
 */
import { expect, test, type Page } from '@playwright/test';
import { clickStart } from './title';

type SceneLike = {
  match: {
    map: { buildable: [number, number][] };
    towers(): { tx: number; ty: number; tower: string }[];
    rules: { towerOrder: string[] };
    world: { enqueue(c: unknown): { ok: boolean } };
    state: { merges: number };
  };
  panelOpen: boolean;
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

/** 배치 칸 i번에 id 타워 n개 (개발자 놓기) */
async function put(page: Page, list: [number, string, number][]): Promise<void> {
  await inScene(
    page,
    (s, l) => {
      const pads = s.match.map.buildable;
      for (const [i, id, n] of l)
        for (let k = 0; k < n; k++) s.match.world.enqueue({ type: 'debugTower', x: pads[i]![0], y: pads[i]![1], t: s.match.rules.towerOrder.indexOf(id) });
      return null;
    },
    list,
  );
}

async function start(page: Page, errors: string[]): Promise<void> {
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?dev=1&seed=65');
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
}

test('아래 띠(일꾼 옆)에 승급 버튼이 없고, 오른쪽 위 [⏫ 모두 승급] 한 번에 전체 승급', async ({ page }) => {
  const errors: string[] = [];
  await start(page, errors);
  const btn = page.getByTestId('hud-merge-all');
  await expect(btn).toBeHidden();
  await put(page, [
    [0, 'goblin', 3],
    [3, 'goblin', 3],
    [6, 'archer', 3],
    [9, 'miner', 2],
  ]);
  await expect(btn).toBeVisible();
  await expect(btn).toHaveText('⏫ 모두 승급 3');
  // 일꾼 옆(아래 띠)에는 승급 버튼이 없다 — 화면 전체에서 승급 HUD 버튼은 이것 하나
  await expect(page.getByTestId('hud-merge-ready')).toHaveCount(0);
  await expect(page.locator('.hud-bottom button', { hasText: /승급|⬆/ })).toHaveCount(0);
  await expect(page.locator('.hud button, .hud-bottom button', { hasText: '승급' })).toHaveCount(1);
  // 오른쪽 위
  const vp = page.viewportSize()!;
  const box = (await btn.boundingBox())!;
  expect(box.x + box.width / 2).toBeGreaterThan(vp.width / 2);
  expect(box.y).toBeLessThan(vp.height / 3);
  // 한 번 누르면: 패널 없이 가득 찬 무더기 모두 승급
  await btn.click();
  await expect.poll(() => fullCount(page)).toBe(0);
  await expect(btn).toBeHidden();
  expect(await inScene(page, (s) => s.panelOpen, null)).toBe(false);
  expect(await inScene(page, (s) => s.match.towers().filter((t) => t.tower === 'miner').length, null)).toBe(2);
  expect(errors).toEqual([]);
});

test('꾹 누르기: 누르는 동안 새로 가득 찬 무더기도 계속 승급, 손을 떼면 버튼이 숨는다', async ({ page }) => {
  const errors: string[] = [];
  await start(page, errors);
  const btn = page.getByTestId('hud-merge-all');
  await put(page, [[0, 'goblin', 3]]);
  await expect(btn).toBeVisible();
  const box = (await btn.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(() => fullCount(page)).toBe(0);
  const m1 = await inScene(page, (s) => s.match.state.merges, null);
  expect(m1).toBeGreaterThanOrEqual(1);
  // 누르고 있는 동안은 승급할 게 없어도 버튼이 남는다 (손가락 아래에서 사라지지 않게)
  await page.waitForTimeout(700);
  await expect(btn).toBeVisible();
  await expect(btn).toHaveText('⏫ 모두 승급');
  // 누르고 있는 동안 새 무더기가 차면 또 승급
  await put(page, [
    [4, 'archer', 3],
    [8, 'miner', 3],
  ]);
  await expect.poll(() => inScene(page, (s) => s.match.state.merges, null)).toBeGreaterThanOrEqual(m1 + 2);
  await expect.poll(() => fullCount(page)).toBe(0);
  await page.mouse.up();
  await expect(btn).toBeHidden();
  // 손을 뗀 뒤에는 새 무더기가 차도 저절로 승급하지 않는다
  const m2 = await inScene(page, (s) => s.match.state.merges, null);
  await put(page, [[12, 'goblin', 3]]);
  await expect(btn).toHaveText('⏫ 모두 승급 1');
  await page.waitForTimeout(800);
  expect(await inScene(page, (s) => s.match.state.merges, null)).toBe(m2);
  expect(errors).toEqual([]);
});
