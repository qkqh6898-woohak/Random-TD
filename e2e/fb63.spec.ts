/**
 * 피드백 #63 '레어 이하 자동 승급, 유니크 이하 자동 승급... 기능 넣기' (휴대폰 412×915):
 * 일시정지 메뉴 '자동 승급' 줄 [노말] [레어 이하] [유니크 이하] (하나만, 다시 누르면 꺼짐; 실제 기본은 유니크 이하(사용자 결정 Q)지만
 * 이 파일은 E2E 기본 시드(e2e/seed.ts)로 꺼진 채 시작 — 켜진 기본값은 e2e/fb-auto-defaults.spec.ts) → 켜면 그 등급 이하의 가득 찬 무더기를
 * 화면이 평소 mergeStack 명령으로 바로 승급 (리플레이에 남는 보통 명령), 그 위 등급은 손으로 ([⏫ 모두 승급 n]은 그 위 등급만 센다).
 * 자동 판매와 겹치는 등급은 팔지 않고 승급한다. 메뉴는 한 화면 안.
 */
import { expect, test, type Page } from '@playwright/test';
import { clickStart } from './title';

test.describe.configure({ timeout: 150_000 });

type SceneLike = {
  match: {
    state: { merges: number; sells?: number };
    map: { buildable: [number, number][] };
    towers(): { id: number; tower: string; tx: number; ty: number }[];
    rules: { towerOrder: string[]; towers: Map<string, { grade: string }> };
    world: { enqueue(c: unknown): { ok: boolean }; executed?: unknown };
    replay?: unknown;
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

/** 가득 찬(3개) 칸의 등급 목록 */
function fullGrades(page: Page): Promise<string[]> {
  return inScene(
    page,
    (s) => {
      const m = new Map<string, { n: number; tower: string }>();
      for (const t of s.match.towers()) {
        const k = `${t.tx},${t.ty}`;
        m.set(k, { n: (m.get(k)?.n ?? 0) + 1, tower: t.tower });
      }
      return [...m.values()].filter((v) => v.n >= 3).map((v) => s.match.rules.towers.get(v.tower)?.grade ?? '?');
    },
    null,
  );
}

async function start(page: Page, errors: string[]): Promise<void> {
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?dev=1&seed=63');
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
}

test('자동 승급: 메뉴 줄(시드 꺼짐·하나만·한 화면 안) → 레어 이하는 바로 승급, 유니크 무더기는 손으로 ([⏫ 모두 승급 1])', async ({ page }) => {
  const errors: string[] = [];
  await start(page, errors);
  const chip = (g: string) => page.getByTestId(`pause-auto-merge-${g}`);

  // 꺼져 있으면 가득 찬 노말 무더기가 그대로
  await put(page, [[0, 'goblin', 3]]);
  await expect(page.getByTestId('hud-merge-all')).toHaveText('모두 승급 1'); // ART-2: ⏫는 아이콘 그림 [data-icon="hud-merge"]
  await page.waitForTimeout(500);
  expect(await inScene(page, (s) => s.match.state.merges, null)).toBe(0);

  await page.locator('[data-action="pause"]').click();
  await expect(page.getByTestId('pause-auto-merge')).toContainText('자동 승급');
  for (const g of ['normal', 'rare', 'unique']) await expect(chip(g)).toHaveAttribute('aria-pressed', 'false');
  await expect(chip('rare')).toHaveText('레어 이하');
  await expect(chip('unique')).toHaveText('유니크 이하');
  // 메뉴 전체가 412×915 한 화면 (자동 승급 줄을 더해도 [로비로]·안내 글까지)
  const panel = (await page.locator('.pause-panel').boundingBox())!;
  expect(panel.y).toBeGreaterThanOrEqual(0);
  expect(panel.y + panel.height).toBeLessThanOrEqual(915);
  // 하나만 켜진다 · 켜진 것을 다시 누르면 꺼짐
  await chip('normal').click();
  await chip('rare').click();
  await expect(chip('rare')).toHaveAttribute('aria-pressed', 'true');
  await expect(chip('normal')).toHaveAttribute('aria-pressed', 'false');
  await chip('rare').click();
  for (const g of ['normal', 'rare', 'unique']) await expect(chip(g)).toHaveAttribute('aria-pressed', 'false');
  await chip('rare').click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rtd.settings') ?? '{}'))).toMatchObject({ v: 2, autoMergeNormal: false, autoMergeRare: true, autoMergeUnique: false });
  // 일시정지 중에는 승급하지 않는다
  await page.waitForTimeout(400);
  expect(await inScene(page, (s) => s.match.state.merges, null)).toBe(0);
  await page.locator('[data-action="resume"]').click();

  // 계속하면 노말 무더기가 바로 승급, 새로 찬 노말·레어 무더기도
  await expect.poll(() => inScene(page, (s) => s.match.state.merges, null)).toBeGreaterThanOrEqual(1);
  await put(page, [
    [3, 'goblin', 3],
    [6, 'merchant', 3],
  ]);
  await expect.poll(async () => (await fullGrades(page)).filter((g) => g === 'normal' || g === 'rare').length).toBe(0);
  await expect.poll(() => inScene(page, (s) => s.match.state.merges, null)).toBeGreaterThanOrEqual(3);
  await expect(page.getByTestId('hud-merge-all')).toBeHidden();
  // 유니크 무더기는 그대로 — [⏫ 모두 승급 1]로 손으로
  const before = await inScene(page, (s) => s.match.state.merges, null);
  await put(page, [[9, 'icemage', 3]]);
  await expect(page.getByTestId('hud-merge-all')).toHaveText('모두 승급 1'); // ART-2: ⏫는 아이콘 그림 [data-icon="hud-merge"]
  await page.waitForTimeout(800);
  expect(await inScene(page, (s) => s.match.state.merges, null)).toBe(before);
  expect(await fullGrades(page)).toContain('unique');
  await page.getByTestId('hud-merge-all').click();
  await expect.poll(async () => (await fullGrades(page)).includes('unique')).toBe(false);
  expect(errors).toEqual([]);
});

test('자동 승급 + 자동 판매가 같은 등급이면 판매보다 승급: 노말 자동 판매 + 노말 자동 승급 → 소환한 노말은 팔지 않고 모아 승급', async ({ page }) => {
  const errors: string[] = [];
  await start(page, errors);
  await inScene(
    page,
    (s) => {
      s.match.world.enqueue({ type: 'debugAddGold', amount: 200_000 });
      s.debugFastForward(1);
      return null;
    },
    null,
  );
  await page.locator('[data-action="pause"]').click();
  await page.getByTestId('pause-auto-sell-normal').click();
  await page.getByTestId('pause-auto-merge-normal').click();
  await expect(page.getByTestId('pause-auto-sell-normal')).toHaveAttribute('aria-checked', 'true');
  await page.locator('[data-action="resume"]').click();
  for (let i = 0; i < 24; i++) {
    await inScene(page, (s) => s.match.world.enqueue({ type: 'summonAuto' }).ok, null);
    await page.waitForTimeout(60);
  }
  await expect.poll(() => inScene(page, (s) => s.match.state.merges, null), { timeout: 20_000 }).toBeGreaterThanOrEqual(1);
  await expect.poll(async () => (await fullGrades(page)).filter((g) => g === 'normal').length).toBe(0);
  expect(await inScene(page, (s) => s.match.state.sells ?? 0, null)).toBe(0);
  // 자동 승급을 끄면 다시 노말 자동 판매
  await page.locator('[data-action="pause"]').click();
  await page.getByTestId('pause-auto-merge-normal').click();
  await page.locator('[data-action="resume"]').click();
  for (let i = 0; i < 12; i++) await inScene(page, (s) => s.match.world.enqueue({ type: 'summonAuto' }).ok, null);
  await expect.poll(() => inScene(page, (s) => s.match.state.sells ?? 0, null)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
