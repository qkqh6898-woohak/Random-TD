/**
 * 사용자 결정 FB-AD · Q · R (휴대폰 412×915):
 * - '자동 승급과 필살기 자동 사용은 디폴트 값으로' + '자동 승급 기본 유니크 이하': 설정이 없는 새 판의 일시정지 메뉴는
 *   자동 승급 [유니크 이하] 눌림 · 필살기 자동 켜짐 · 자동 판매 꺼짐(설명 '자동 승급 중이라 … 팔지 않아요'), 노말 3개는 바로 승급된다.
 * - '새판마다 디폴트 하고 싶은건 체크 박스로': 로비 ⚙ 설정 '새 판을 시작하면 기본값으로' 체크 박스 셋(기본 모두 체크).
 *   자동 승급 체크를 끄면 판에서 끈 자동 승급이 새 판에도 꺼진 채 남고, 체크가 켜진 필살기 자동은 새 판에 다시 켜진다.
 * 이 파일은 E2E 기본 시드(e2e/seed.ts: 자동 승급·필살기 자동 끔)를 지우고 진짜 기본값으로 시작한다.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { clickStart } from './title';
import { useDefaultSettings } from './seed';

test.describe.configure({ timeout: 150_000 });

const SHOTS = process.env.FB_SHOTS_DIR ?? '';

type SceneLike = {
  match: {
    state: { merges: number };
    map: { buildable: [number, number][] };
    towers(): { tower: string; tx: number; ty: number }[];
    rules: { towerOrder: string[] };
    world: { enqueue(c: unknown): { ok: boolean } };
  };
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

const chip = (page: Page, g: string) => page.getByTestId(`pause-auto-merge-${g}`);

async function expectMerge(page: Page, grade: string | null): Promise<void> {
  for (const g of ['normal', 'rare', 'unique']) {
    await expect(chip(page, g)).toHaveAttribute('aria-pressed', String(g === grade));
    if (g === grade) await expect(chip(page, g)).toHaveClass(/is-on/);
    else await expect(chip(page, g)).not.toHaveClass(/is-on/);
  }
}

function settings(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('rtd.settings') ?? '{}') as Record<string, unknown>);
}

test('결정 FB-AD·Q: 새 판은 자동 승급 [유니크 이하]·필살기 자동 켜짐 → 노말 3개가 바로 승급', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?dev=1&seed=88');
  await useDefaultSettings(page);
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();

  await page.locator('[data-action="pause"]').click();
  await expectMerge(page, 'unique');
  await expect(page.getByTestId('pause-ult-auto')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('pause-ult-auto')).toHaveText('켜짐');
  // 자동 판매는 꺼짐, 설명이 '자동 승급이 맡는 등급은 팔지 않음'을 알린다 (자동 승급을 끄면 원래 설명)
  for (const id of ['pause-auto-sell-normal', 'pause-auto-sell-rare']) await expect(page.getByTestId(id)).toHaveAttribute('aria-checked', 'false');
  const sellDesc = (id: string) => page.locator('.pause-setting', { has: page.getByTestId(id) }).locator('.pause-setting-desc');
  await expect(sellDesc('pause-auto-sell-normal')).toHaveText('자동 승급 중이라 노말은 팔지 않아요');
  await expect(sellDesc('pause-auto-sell-rare')).toHaveText('자동 승급 중이라 팔지 않아요');
  // 메뉴 전체가 한 화면 (설명 글이 바뀌어도 [로비로]·안내 글까지)
  const panel = (await page.locator('.pause-panel').boundingBox())!;
  expect(panel.y).toBeGreaterThanOrEqual(0);
  expect(panel.y + panel.height).toBeLessThanOrEqual(915);
  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: `${SHOTS}/auto-defaults-pause-412.png`, animations: 'disabled' });
  }
  await chip(page, 'unique').click();
  await expect(sellDesc('pause-auto-sell-normal')).toHaveText('소환된 노말을 바로 팔아요');
  await chip(page, 'normal').click();
  await expect(sellDesc('pause-auto-sell-rare')).toHaveText('소환된 레어만 팔아요 · 노말은 자동 승급');
  await chip(page, 'unique').click();
  await expectMerge(page, 'unique');
  expect(await settings(page)).toMatchObject({ ultAuto: true, autoMergeNormal: false, autoMergeRare: false, autoMergeUnique: true });
  await page.locator('[data-action="resume"]').click();

  // 노말 3개 무더기 → 손대지 않아도 승급 (평소 mergeStack 명령)
  await inScene(
    page,
    (s) => {
      const [x, y] = s.match.map.buildable[0]!;
      const t = s.match.rules.towerOrder.indexOf('goblin');
      for (let k = 0; k < 3; k++) s.match.world.enqueue({ type: 'debugTower', x, y, t });
      return null;
    },
    null,
  );
  await expect.poll(() => inScene(page, (s) => s.match.state.merges, null)).toBeGreaterThanOrEqual(1);
  expect(await inScene(page, (s) => s.match.towers().filter((t) => t.tower === 'goblin').length, null)).toBe(0);
  await expect(page.getByTestId('hud-merge-all')).toBeHidden();
  expect(errors).toEqual([]);
});

test('결정 R: 로비 설정 체크 박스 — 자동 승급 체크를 끄면 판에서 끈 자동 승급이 새 판에도 남고, 필살기 자동은 새 판에 다시 켜짐', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?seed=89');
  await useDefaultSettings(page);
  await expect(page.locator('[data-screen="title"][data-lobby="1"]')).toBeVisible();
  await page.locator('[data-action="settings"]').click();
  const box = page.getByTestId('lobby-match-reset');
  await expect(box).toBeVisible();
  await expect(box).toContainText('새 판을 시작하면 기본값으로');
  const ult = page.getByTestId('lobby-reset-ult');
  const sell = page.getByTestId('lobby-reset-autosell');
  const merge = page.getByTestId('lobby-reset-automerge');
  for (const c of [ult, sell, merge]) await expect(c).toBeChecked();
  await expect(page.locator('.lobby-reset-row', { has: ult })).toHaveText('필살기 자동 (기본 켜짐)');
  await expect(page.locator('.lobby-reset-row', { has: sell })).toHaveText('자동 판매 (기본 꺼짐)');
  await expect(page.locator('.lobby-reset-row', { has: merge })).toHaveText('자동 승급 (기본 유니크 이하)');
  // 줄 전체가 눌리는 곳 44px 이상, 글자가 줄 안에서 잘리지 않음
  for (const c of [ult, sell, merge]) {
    const row = page.locator('.lobby-reset-row', { has: c });
    expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await row.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
    await box.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/auto-defaults-lobby-412.png`, animations: 'disabled' });
  }
  // 320×640: 창이 스크롤될 수 있지만 체크 박스 줄은 잘리지 않고 닿는다
  await page.setViewportSize({ width: 320, height: 640 });
  await merge.scrollIntoViewIfNeeded();
  for (const c of [ult, sell, merge]) {
    const row = page.locator('.lobby-reset-row', { has: c });
    const b = (await row.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(320);
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(await row.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
  const mb = (await page.locator('.lobby-reset-row', { has: merge }).boundingBox())!;
  expect(mb.y).toBeGreaterThanOrEqual(0);
  expect(mb.y + mb.height).toBeLessThanOrEqual(640);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/auto-defaults-lobby-320.png`, animations: 'disabled' });
  await page.setViewportSize({ width: 412, height: 915 });

  // 자동 승급 체크 끄기 (줄 글자를 눌러도 된다) → 저장
  await page.locator('.lobby-reset-row', { has: merge }).click();
  await expect(merge).not.toBeChecked();
  expect(await settings(page)).toMatchObject({ resetAutoMerge: false, resetUltAuto: true, resetAutoSell: true });
  await page.getByTestId('settings-dialog-close').click();

  // 판에서 자동 승급·필살기 자동을 끈다
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
  await page.locator('[data-action="pause"]').click();
  await expectMerge(page, 'unique');
  await chip(page, 'unique').click();
  await page.getByTestId('pause-ult-auto').click();
  await expectMerge(page, null);
  await expect(page.getByTestId('pause-ult-auto')).toHaveAttribute('aria-checked', 'false');

  // 새 판: 자동 승급은 끈 그대로 (체크 꺼짐), 필살기 자동은 기본값 켜짐 (체크 켜짐)
  await page.locator('[data-action="exit"]').click();
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
  await page.locator('[data-action="pause"]').click();
  await expectMerge(page, null);
  await expect(page.getByTestId('pause-ult-auto')).toHaveAttribute('aria-checked', 'true');
  expect(await settings(page)).toMatchObject({ ultAuto: true, autoMergeNormal: false, autoMergeRare: false, autoMergeUnique: false, resetAutoMerge: false });

  // 다시 열어도 체크 상태가 남는다
  await page.goto('/?seed=89');
  await page.locator('[data-action="settings"]').click();
  await expect(page.getByTestId('lobby-reset-automerge')).not.toBeChecked();
  await expect(page.getByTestId('lobby-reset-ult')).toBeChecked();
  expect(errors).toEqual([]);
});
