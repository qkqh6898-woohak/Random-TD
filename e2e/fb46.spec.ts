/**
 * 피드백 #46 '노말 이하 자동 판매, 희귀 이하 자동 판매 체크' — 일시정지 메뉴 스위치 두 개:
 * 켜면 방금 소환된 그 등급 이하 타워를 바로 판다 (평소 sellTower 명령), 설정은 rtd.settings에 남고, 메뉴는 화면 안에 들어간다.
 */
import { expect, test, type Page } from '@playwright/test';
import { clickStart } from './title';

test.describe.configure({ timeout: 150_000 });

type SceneLike = {
  match: {
    state: { gold: number; sells?: number };
    towers(): { id: number; tower: string; tx: number; ty: number }[];
    map: { buildable: [number, number][] };
    rules: { towers: Map<string, { grade: string }>; towerOrder: string[] };
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

/** 내 판 위 타워 등급 목록 */
function grades(page: Page): Promise<string[]> {
  return inScene(page, (s) => s.match.towers().map((t) => s.match.rules.towers.get(t.tower)?.grade ?? '?'), null);
}

test('피드백 #46: [노말 자동 판매]·[레어 이하 자동 판매] 스위치 → 소환된 그 등급 이하를 바로 판다', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?dev=1&seed=42');
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();

  // 기본 꺼짐: 소환한 노말이 남는다
  await inScene(page, (s) => {
    s.match.world.enqueue({ type: 'debugAddGold', amount: 100000 });
    s.debugFastForward(1);
    return null;
  }, null);
  await page.locator('[data-action="pause"]').click();
  const normal = page.getByTestId('pause-auto-sell-normal');
  const rare = page.getByTestId('pause-auto-sell-rare');
  await expect(normal).toHaveAttribute('aria-checked', 'false');
  await expect(rare).toHaveAttribute('aria-checked', 'false');
  // 메뉴 전체가 화면 안 (스위치 두 줄을 더해도 [로비로]가 보인다)
  const exitBox = (await page.locator('[data-action="exit"]').boundingBox())!;
  expect(exitBox.y + exitBox.height).toBeLessThanOrEqual(915);
  await normal.click();
  await expect(normal).toHaveAttribute('aria-checked', 'true');
  await page.locator('[data-action="resume"]').click();

  // 노말 자동 판매: 소환 10번 → 노말은 남지 않고 판매 수가 는다
  for (let i = 0; i < 10; i++) await inScene(page, (s) => s.match.world.enqueue({ type: 'summonAuto' }).ok, null);
  await expect.poll(() => inScene(page, (s) => s.match.state.sells ?? 0, null)).toBeGreaterThan(0);
  await expect.poll(async () => (await grades(page)).filter((g) => g === 'normal').length).toBe(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rtd.settings') ?? '{}').autoSellNormal)).toBe(true);

  // 개발자가 놓은 노말(debugTower)은 팔지 않는다
  const placed = await inScene(page, (s) => {
    const used = new Set(s.match.towers().map((t) => `${t.tx},${t.ty}`));
    const [x, y] = s.match.map.buildable.find(([bx, by]) => !used.has(`${bx},${by}`))!;
    const t = [...s.match.rules.towers.entries()].find(([, v]) => v.grade === 'normal')![0];
    s.match.world.enqueue({ type: 'debugTower', x, y, t: s.match.rules.towerOrder.indexOf(t) });
    s.debugFastForward(1);
    return s.match.towers().find((e) => e.tx === x && e.ty === y)?.id ?? -1;
  }, null);
  expect(placed).toBeGreaterThan(0);

  // 레어 이하: 소환해서 나온 노말·레어는 판다
  await page.locator('[data-action="pause"]').click();
  await rare.click();
  await expect(rare).toHaveAttribute('aria-checked', 'true');
  await page.locator('[data-action="resume"]').click();
  for (let i = 0; i < 10; i++) await inScene(page, (s) => s.match.world.enqueue({ type: 'summonAuto' }).ok, null);
  await expect.poll(async () => (await grades(page)).filter((g) => g === 'normal' || g === 'rare').length).toBe(1);
  expect(await inScene(page, (s, id) => s.match.towers().some((t) => t.id === id), placed)).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rtd.settings') ?? '{}').autoSellRare)).toBe(true);
  expect(errors).toEqual([]);
});
