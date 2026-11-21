/**
 * 피드백 #47 '영웅 누르면 작은 아이콘이 좌상단 승급 버튼, 우상단 x버튼은 팔기 버튼으로 뜨게하기'.
 * 영웅(타워)을 누르면 그 칸 왼쪽 위에 [⬆](승급) 작은 버튼이 패널과 함께 뜬다.
 * v0.1.14 통합: '우상단 판매'는 정보 패널 머리 줄 오른쪽 위 [판매](디자인 PR #54, FB-D1 #30)가 맡는다 — 판매 버튼은 화면에 하나뿐.
 *   패널 닫기는 [✕]·뒤로 가기·맵 빈 곳 누르기 그대로.
 * sim은 window.__rtd로 읽기만, 버튼·맵은 화면에서 누른다. 칸은 sim의 배치 칸 목록에서 고른다.
 */
import { expect, test, type Page } from '@playwright/test';
import { clickStart } from './title';
import { mkdirSync } from 'node:fs';
import { E2E_MATCH_SWITCHES_OFF } from './seed';

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

async function start(page: Page): Promise<void> {
  // 눌러서 바로 승급을 끈다 → 가득 찬 무더기를 눌러도 패널(과 작은 버튼)이 열린다
  await page.addInitScript((off) => localStorage.setItem('rtd.settings', JSON.stringify({ v: 1, tapMerge: false, ...off })), E2E_MATCH_SWITCHES_OFF);
  await page.goto('/?dev=1&seed=42');
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
}

test('영웅을 누르면 칸 왼쪽 위 [⬆] 승급 · 판매는 패널 머리 줄 하나뿐 — 누르면 승급·판매, 패널을 닫으면 사라진다', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  const [cx, cy] = await midCell(page);
  const normal = await inScene(page, (s) => s.match.rules.towerOrder.find((id) => s.match.rules.towers.get(id)?.grade === 'normal')!, null);
  // 노말 하나 → 승급 꺼짐, 판매 켜짐
  await inScene(
    page,
    (s, a) => {
      s.match.world.enqueue({ type: 'debugTower', x: a.x, y: a.y, t: s.match.rules.towerOrder.indexOf(a.id) });
      s.debugFastForward(1);
      return null;
    },
    { x: cx, y: cy, id: normal },
  );
  await expect(page.getByTestId('tower-quick')).toHaveCount(0);
  const p = await tilePoint(page, cx, cy);
  await page.touchscreen.tap(p.x, p.y);
  await expect.poll(() => inScene(page, (s) => s.panelOpen, null)).toBe(true);
  const merge = page.getByTestId('tq-merge');
  const sell = page.getByTestId('tp-sell');
  await expect(merge).toBeVisible();
  await expect(sell).toBeVisible();
  await expect(merge).toBeDisabled();
  // 판매 버튼은 하나뿐: 칸 위 [✕ 판매] 없음, 패널 머리 줄 오른쪽 위 [판매] — [✕ 닫기] 바로 왼쪽
  await expect(page.getByTestId('tq-sell')).toHaveCount(0);
  await expect(page.locator('[data-action="sell"]:visible')).toHaveCount(1);
  await expect(page.locator('.tp-head [data-testid="tp-sell"]')).toBeVisible();
  const sb = (await sell.boundingBox())!;
  const cb = (await page.locator('[data-action="panel-close"]').boundingBox())!;
  expect(sb.x + sb.width).toBeLessThanOrEqual(cb.x + 0.5);
  expect(Math.abs(sb.y + sb.height / 2 - (cb.y + cb.height / 2))).toBeLessThanOrEqual(cb.height);
  // 자리: 승급 = 칸 왼쪽 위 모서리
  const mb = (await merge.boundingBox())!;
  const tol = 3;
  expect(Math.abs(mb.x + mb.width / 2 - (p.x - p.tile / 2))).toBeLessThanOrEqual(tol);
  expect(Math.abs(mb.y + mb.height / 2 - (p.y - p.tile / 2))).toBeLessThanOrEqual(tol);
  expect(mb.width).toBeGreaterThanOrEqual(28);
  // 같은 노말 2개 더 → 무더기 가득 → [⬆] 켜짐 → 누르면 승급 (3개 → 1개)
  await inScene(
    page,
    (s, a) => {
      for (let i = 0; i < 2; i++) s.match.world.enqueue({ type: 'debugTower', x: a.x, y: a.y, t: s.match.rules.towerOrder.indexOf(a.id) });
      s.debugFastForward(1);
      return null;
    },
    { x: cx, y: cy, id: normal },
  );
  await expect(merge).toBeEnabled();
  if (process.env.SAVE_SCREENS === '1') {
    mkdirSync('docs/screens', { recursive: true });
    await page.screenshot({ path: 'docs/screens/FB47-quick.png' });
  }
  await merge.click();
  await expect.poll(() => inScene(page, (s) => s.match.towers().length, null)).toBe(1);
  const up = await inScene(page, (s) => { const t = s.match.towers()[0]!; return { grade: s.match.rules.towers.get(t.tower)?.grade, tx: t.tx, ty: t.ty }; }, null);
  expect(up.grade).not.toBe('normal');
  // 결과 칸을 눌러 패널 [판매] (레어 이하는 한 번에, 히어로 이상은 두 번)
  if (!(await page.getByTestId('tp-sell').isVisible())) {
    const q = await tilePoint(page, up.tx, up.ty);
    await page.touchscreen.tap(q.x, q.y);
  }
  await expect(sell).toBeVisible();
  const gold = await inScene(page, (s) => s.match.state.gold, null);
  await sell.click();
  if (up.grade !== 'rare') {
    await expect(sell).toHaveClass(/is-confirm/);
    await sell.click();
  }
  await expect.poll(() => inScene(page, (s) => s.match.towers().length, null)).toBe(0);
  expect(await inScene(page, (s) => s.match.state.gold, null)).toBeGreaterThan(gold);
  // 팔면 패널과 작은 버튼이 함께 사라진다
  await expect.poll(() => inScene(page, (s) => s.panelOpen, null)).toBe(false);
  await expect(page.getByTestId('tower-quick')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('판매(패널 머리 줄)는 히어로 이상이면 한 번 더 눌러야 팔린다 · 패널 ✕로 닫으면 작은 버튼도 닫힌다', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  const [cx, cy] = await midCell(page);
  const hero = await inScene(page, (s) => s.match.rules.towerOrder.find((id) => s.match.rules.towers.get(id)?.grade === 'hero')!, null);
  await inScene(
    page,
    (s, a) => {
      s.match.world.enqueue({ type: 'debugTower', x: a.x, y: a.y, t: s.match.rules.towerOrder.indexOf(a.id) });
      s.debugFastForward(1);
      return null;
    },
    { x: cx, y: cy, id: hero },
  );
  const p = await tilePoint(page, cx, cy);
  await page.touchscreen.tap(p.x, p.y);
  const sell = page.getByTestId('tp-sell');
  await expect(sell).toBeVisible();
  await expect(page.getByTestId('tq-merge')).toBeVisible();
  // 두 번 누르기를 한 evaluate 안에서 (헤드리스가 느려도 2초 확인 창 안에)
  const r = await sell.evaluate(async (el) => {
    const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): { match: { towers(): unknown[] } } } } } }).__rtd.game.scene.getScene('Game');
    (el as HTMLButtonElement).click();
    await new Promise((res) => setTimeout(res, 200));
    const confirm = el.classList.contains('is-confirm');
    const label = el.getAttribute('aria-label');
    const count = s.match.towers().length;
    (el as HTMLButtonElement).click();
    return { confirm, label, count };
  });
  expect(r).toEqual({ confirm: true, label: '한 번 더 누르면 판매', count: 1 });
  await expect.poll(() => inScene(page, (s) => s.match.towers().length, null)).toBe(0);
  // 다시 놓고 열었다가 패널 ✕로 닫기
  await inScene(
    page,
    (s, a) => {
      s.match.world.enqueue({ type: 'debugTower', x: a.x, y: a.y, t: s.match.rules.towerOrder.indexOf(a.id) });
      s.debugFastForward(1);
      return null;
    },
    { x: cx, y: cy, id: hero },
  );
  await page.touchscreen.tap(p.x, p.y);
  await expect(sell).toBeVisible();
  await page.locator('[data-action="panel-close"]').click();
  await expect(page.getByTestId('tower-quick')).toHaveCount(0);
  expect(await inScene(page, (s) => s.match.towers().length, null)).toBe(1);
  expect(errors).toEqual([]);
});
