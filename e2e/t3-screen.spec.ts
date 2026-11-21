/**
 * T-3 E2E: 화면 꽉 차게(빈 띠 없음·HUD/아래 띠 다 보임·넓은 화면 양옆은 흐린 배경) · 2×2 블록 맵에서 소환 ·
 * 조작 중 칸 표시 + 스크린샷 docs/screens/T2-full-*·T2-map-* (SAVE_SCREENS=1).
 * 평소 바닥은 투명. 이동·타워 선택(판매/승급)·강화 중에만 관련 칸을 표시하고, 놓을 수 없는 곳(길)을 짧게 누르면 잠깐 배치 칸을 보여준다 (#79 검토).
 * sim은 window.__rtd로 읽기만 한다 (타워 놓기는 개발자 명령).
 */
import { expect, test, type Page } from '@playwright/test';
import { clickStart } from './title';
import { mkdirSync } from 'node:fs';

const SAVE_DOCS = process.env.SAVE_SCREENS === '1';

type SceneLike = {
  match: {
    tick: number;
    map: { id: string; buildable: [number, number][]; width: number; height: number };
    towers(): { id: number; tx: number; ty: number; tower: string }[];
    world: { enqueue(c: Record<string, unknown>): { ok: boolean } };
    rules: { towerOrder: string[] };
    state: { gold: number };
  };
  mapLayout: { originX: number; originY: number; tile: number; minRow: number; rows: number; cols: number; minCol: number };
  scale: { width: number; height: number };
  buildHint: number;
  backgroundKey: string | null;
  dragState: { id: number; drop: { tx: number; ty: number; preview: string } | null } | null;
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

async function sim<T, A = null>(page: Page, fn: (s: SceneLike, a: A) => T, arg: A = null as A): Promise<T> {
  return page.evaluate(
    ([src, a]) => {
      const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game');
      return (0, eval)(src)(s, a);
    },
    [`(${fn.toString()})`, arg] as const,
  ) as Promise<T>;
}

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync('test-results/screens', { recursive: true });
  await page.screenshot({ path: `test-results/screens/${name}.png`, animations: 'disabled' });
  if (SAVE_DOCS) {
    mkdirSync('docs/screens', { recursive: true });
    await page.screenshot({ path: `docs/screens/${name}.png`, animations: 'disabled' });
  }
}

async function startGame(page: Page, url = '/?dev=1&seed=42', mode: 'infinite' | 'campaign' = 'infinite'): Promise<void> {
  await page.goto(url);
  // A-1: 저장된 판이 있으면 [시작] 대신 [새 게임]→확인 (clickStart). [캠페인 1]은 저장과 상관없이 있다
  if (mode === 'campaign') await page.getByRole('button', { name: '캠페인 1 (디버그)' }).click();
  else await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
  await expect.poll(() => sim(page, (s) => s.match.map.id)).toBe(mode === 'campaign' ? 'crossroads' : 'circle');
}

/** 칸 가운데의 페이지 좌표 */
async function tilePoint(page: Page, tx: number, ty: number): Promise<{ x: number; y: number }> {
  return sim(
    page,
    (s, xy) => {
      const L = s.mapLayout;
      const r = document.getElementById('stage')!.getBoundingClientRect();
      const k = r.width / 1080;
      return { x: r.left + (L.originX + (xy[0] + 0.5) * L.tile) * k, y: r.top + (L.originY + (xy[1] + 0.5) * L.tile) * k };
    },
    [tx, ty] as const,
  );
}

/** 무대·캔버스·HUD·아래 띠 상자 (CSS px) */
async function frame(page: Page) {
  return page.evaluate(() => {
    const box = (el: Element | null) => {
      const r = el ? el.getBoundingClientRect() : { x: 0, y: 0, width: 0, height: 0, bottom: 0, right: 0 };
      return { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom, right: r.right };
    };
    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      stage: box(document.getElementById('stage')),
      canvas: box(document.querySelector('#game canvas')),
      hud: box(document.querySelector('.hud')),
      dock: box(document.querySelector('.hud-dock')),
      menu: box(document.querySelector('.hud-menu')),
      scrollW: document.documentElement.scrollWidth,
      sideBg: getComputedStyle(document.getElementById('app')!).getPropertyValue('--side-bg'),
    };
  });
}

const PHONES = [
  { width: 412, height: 915, gameH: 2399 },
  { width: 360, height: 800, gameH: 2400 },
  { width: 390, height: 844, gameH: 2337 },
  { width: 412, height: 732, gameH: 1920 },
];

for (const vp of PHONES) {
  test(`화면 꽉 차게 ${vp.width}×${vp.height}: 캔버스·무대 = 화면 (빈 띠 없음), HUD는 맨 위·하단 메뉴는 맨 아래, 맵은 그 사이`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await startGame(page);
    expect(await sim(page, (s) => ({ w: s.scale.width, h: s.scale.height }))).toEqual({ w: 1080, h: vp.gameH });
    const f = await frame(page);
    expect(f.stage).toMatchObject({ x: 0, y: 0, w: vp.width, h: vp.height });
    // 캔버스가 무대를 덮는다 (비율 반올림 몫 1px 미만)
    expect(Math.abs(f.canvas.y)).toBeLessThan(1);
    expect(Math.abs(f.canvas.h - vp.height)).toBeLessThan(1);
    expect(Math.abs(f.canvas.w - vp.width)).toBeLessThan(1);
    expect(f.hud.y).toBe(0);
    expect(Math.abs(f.menu.bottom - vp.height)).toBeLessThan(0.5);
    expect(f.scrollW).toBeLessThanOrEqual(vp.width);
    // 맵(화면 밖 줄 포함)은 HUD 아래·아래 띠 위
    const g = await sim(page, (s) => ({ ...s.mapLayout }));
    const k = vp.width / 1080;
    expect(g.originY * k + g.minRow * g.tile * k).toBeGreaterThanOrEqual(f.hud.bottom - 0.5);
    expect((g.originY + (g.minRow + g.rows) * g.tile) * k).toBeLessThanOrEqual(f.dock.y + 0.5);
    // 전투 배경이 지금(더 길어진) 캔버스를 다 덮는다
    await expect.poll(() => sim(page, (s) => s.backgroundKey), { timeout: 20_000 }).toBe('bg-t01-b1');
    await expect.poll(() => sim(page, (s) => s.buildHint), { timeout: 5000 }).toBe(0);
    await shot(page, `T2-full-${vp.width}x${vp.height}`);
    expect(errors).toEqual([]);
  });
}

test('넓은 화면 768×1024: 1080×1920 무대를 가운데에, 양옆 띠는 흐린 배경 그림 (검은 띠 아님)', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 768, height: 1024 });
  await startGame(page);
  expect(await sim(page, (s) => s.scale.height)).toBe(1920);
  const f = await frame(page);
  expect(f.stage.h).toBe(1024);
  expect(f.stage.w).toBeCloseTo(576, 0);
  expect(f.stage.x).toBeCloseTo(96, 0);
  expect(f.hud.y).toBe(0);
  expect(Math.abs(f.menu.bottom - 1024)).toBeLessThan(0.5);
  await expect.poll(() => sim(page, (s) => s.backgroundKey), { timeout: 20_000 }).toBe('bg-t01-b1');
  await expect.poll(async () => (await frame(page)).sideBg).toContain('bg_t01_b1');
  await expect.poll(() => sim(page, (s) => s.buildHint), { timeout: 5000 }).toBe(0);
  await shot(page, 'T2-full-768x1024');
  expect(errors).toEqual([]);
});

test('화면 크기가 바뀌면 논리 높이·맵을 다시 맞춘다 (412×915 → 360×800 → 412×732), 타이틀 그림도 꽉 참', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto('/?seed=3');
  await expect(page.getByRole('button', { name: '시작' })).toBeVisible();
  // 타이틀: 캔버스가 화면 전체 (키 아트가 덮음)
  let f = await frame(page);
  expect(Math.abs(f.canvas.h - 915)).toBeLessThan(1);
  await page.setViewportSize({ width: 412, height: 732 });
  await expect.poll(async () => Math.round((await frame(page)).canvas.h)).toBe(732);
  await page.setViewportSize({ width: 412, height: 915 });
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
  const tall = await sim(page, (s) => ({ h: s.scale.height, tile: s.mapLayout.tile }));
  expect(tall.h).toBe(2399);
  await page.setViewportSize({ width: 360, height: 800 });
  await expect.poll(() => sim(page, (s) => s.scale.height)).toBe(2400);
  await page.setViewportSize({ width: 412, height: 732 });
  await expect.poll(() => sim(page, (s) => s.scale.height)).toBe(1920);
  await expect.poll(() => sim(page, (s) => s.mapLayout.tile)).toBeLessThan(tall.tile);
  f = await frame(page);
  expect(f.stage).toMatchObject({ x: 0, y: 0, w: 412, h: 732 });
  expect(Math.abs(f.menu.bottom - 732)).toBeLessThan(0.5);
  expect(errors).toEqual([]);
});

test('2×2 블록 맵에서 소환: 순환의 정원 32칸 · 시작에는 칸 숨김, 길을 짧게 누르면 소환 대신 배치 칸이 잠깐 보인다', async ({ page }) => {
  const errors = collectErrors(page);
  await startGame(page, '/?seed=42');
  await expect(page.getByTestId('hud-towers')).toHaveText('0/30');
  // 판 시작부터 조작 전에는 칸 표시가 없다
  await expect.poll(() => sim(page, (s) => s.buildHint), { timeout: 5000 }).toBe(0);
  await expect.poll(() => sim(page, (s) => s.backgroundKey), { timeout: 20_000 }).toBe('bg-t01-b1');
  await shot(page, 'T2-map-infinite-empty');
  // 길 (0, 3) (G-1 마당 맵에는 빈 땅이 없다) → 소환 없음, 배치 칸이 잠깐 보인다 (#79 잘못 누르기 안내)
  let p = await tilePoint(page, 0, 3);
  await page.touchscreen.tap(p.x, p.y);
  await expect.poll(() => sim(page, (s) => s.buildHint)).toBeGreaterThan(0);
  expect(await sim(page, (s) => s.match.towers().length)).toBe(0);
  await page.waitForTimeout(150);
  // 배치 칸 (2, 4) → 소환
  p = await tilePoint(page, 2, 4);
  await page.touchscreen.tap(p.x, p.y);
  await expect(page.getByTestId('hud-towers')).toHaveText('1/30');
  expect(await sim(page, (s) => s.match.towers().map((t) => [t.tx, t.ty]))).toEqual([[2, 4]]);
  await expect.poll(() => sim(page, (s) => s.buildHint), { timeout: 5000 }).toBe(0);
  expect(errors).toEqual([]);
});

test('캠페인 1 사거리 미로(7×10·24칸, G-1)에서 소환되고, 개발자 타워 20개 판 · 끄는 동안 배치 칸 강조 스크린샷', async ({ page }) => {
  test.slow();
  const errors = collectErrors(page);
  await startGame(page, '/?dev=1&seed=11', 'campaign');
  await expect(page.getByTestId('hud-towers')).toHaveText('0/30');
  await expect.poll(() => sim(page, (s) => s.buildHint), { timeout: 5000 }).toBe(0);
  const p = await tilePoint(page, 4, 4);
  await page.touchscreen.tap(p.x, p.y);
  await expect(page.getByTestId('hud-towers')).toHaveText('1/30');
  await sim(page, (s) => s.debugFastForward(200));
  await expect.poll(() => sim(page, (s) => s.backgroundKey), { timeout: 20_000 }).toBe('bg-t01-b1');
  await shot(page, 'T2-map-campaign1');

  // 무한 판: 타워 16개 (개발자 명령, G-1 큰 칸 20칸 중 — 끌어 놓을 빈 칸을 남김) → 몹이 도는 판
  await startGame(page, '/?dev=1&seed=5');
  const placed = await sim(page, (s) => {
    const cells = s.match.map.buildable;
    const order = s.match.rules.towerOrder;
    let n = 0;
    for (let i = 0; i < 16; i++) {
      const c = cells[(i * 7) % cells.length]!;
      if (s.match.world.enqueue({ type: 'debugTower', x: c[0], y: c[1], t: (i * 3) % Math.min(40, order.length) }).ok) n++;
    }
    s.debugFastForward(1);
    return n;
  });
  expect(placed).toBe(16);
  await expect.poll(() => sim(page, (s) => s.match.towers().length)).toBe(16);
  await sim(page, (s) => s.debugFastForward(1200 + 600));
  await expect.poll(() => sim(page, (s) => s.backgroundKey), { timeout: 20_000 }).toBe('bg-t01-b1');
  await page.waitForTimeout(300);
  await shot(page, 'T2-map-infinite-20');

  // 끌기: 타워 하나를 들어 빈 칸 위로 → 배치 칸이 옅게 보인다
  const list = await sim(page, (s) => s.match.towers().map((t) => ({ id: t.id, tx: t.tx, ty: t.ty })));
  const empty = await sim(page, (s) => s.match.map.buildable.filter(([x, y]) => !s.match.towers().some((t) => t.tx === x && t.ty === y)));
  const a = list[0]!;
  const to = empty[0]!;
  const from = await tilePoint(page, a.tx, a.ty);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.waitForTimeout(450);
  const dest = await tilePoint(page, to[0], to[1]);
  await page.mouse.move(dest.x, dest.y, { steps: 6 });
  await expect.poll(() => sim(page, (s) => s.dragState?.drop?.preview ?? null)).toBe('move');
  expect(await sim(page, (s) => s.buildHint)).toBe(1);
  await page.waitForTimeout(200);
  await shot(page, 'T2-map-drag');
  await page.mouse.up();
  await expect.poll(() => sim(page, (s, id) => s.match.towers().find((t) => t.id === id)!.tx, a.id)).toBe(to[0]);
  expect(await sim(page, (s) => s.buildHint)).toBe(0);
  expect(errors).toEqual([]);
});

test('병합 확인 (HF-4): 길을 꾹 눌러 연속 소환하면 뗀 뒤에도 칸 숨김 · [↔ 이동] 동안 배치 칸이 계속 보인다', async ({ page }) => {
  const errors = collectErrors(page);
  await startGame(page, '/?debug=1&seed=42');
  await expect.poll(() => sim(page, (s) => s.buildHint), { timeout: 5000 }).toBe(0);
  await sim(page, (s) => s.match.world.enqueue({ type: 'debugAddGold', amount: 100_000 }));
  // 길 (0, 3)을 꾹 → 자동 칸에 연속 소환, 뗀 뒤에도 배치 칸 잠깐 보이기는 없음
  const p = await tilePoint(page, 0, 3);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await expect.poll(() => sim(page, (s) => s.match.towers().length), { timeout: 8000 }).toBeGreaterThanOrEqual(3);
  await page.mouse.up();
  expect(await sim(page, (s) => s.match.towers().every((t) => s.match.map.buildable.some(([x, y]) => x === t.tx && y === t.ty)))).toBe(true);
  await page.waitForTimeout(200);
  expect(await sim(page, (s) => s.buildHint)).toBe(0);
  // [↔ 이동] 모드: 배치 칸이 계속 보이고, 취소하면 사라진다
  const t = await sim(page, (s) => { const x = s.match.towers()[0]!; return [x.tx, x.ty] as [number, number]; });
  await page.waitForTimeout(400);
  const q = await tilePoint(page, t[0], t[1]);
  await page.touchscreen.tap(q.x, q.y);
  await page.locator('[data-action="move"]').click();
  await page.waitForTimeout(1800);
  expect(await sim(page, (s) => s.buildHint)).toBe(1);
  await page.keyboard.press('Escape');
  await expect.poll(() => sim(page, (s) => s.buildHint)).toBe(0);
  expect(errors).toEqual([]);
});

test('V2 L5: 캠페인 1을 50단계까지 버티면(개발자 ⏭) 같은 결과 화면에 제목 "테마 1 클리어!" · 정산 · 판이 멈춤', async ({ page }) => {
  const errors = collectErrors(page);
  await startGame(page, '/?dev=1&seed=11', 'campaign');
  // 49단계까지 바로 넘기고(다음 틱에 50단계 시작), 그다음 틱에 ⏭ — 50단계에서 누르면 클리어 (sim L5)
  await sim(page, (s) => {
    const m = s.match as unknown as { state: { stage: number; nextStageTick: number }; tick: number };
    m.state.stage = 49;
    m.state.nextStageTick = m.tick;
    s.debugFastForward(1);
  });
  expect(await sim(page, (s) => (s.match as unknown as { state: { stage: number } }).state.stage)).toBe(50);
  await sim(page, (s) => {
    s.match.world.enqueue({ type: 'debugSkipStage' });
    s.debugFastForward(2);
  });
  await expect(page.locator('[data-screen="gameover"]')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('gameover-title')).toHaveText('테마 1 클리어!');
  await expect(page.locator('.gameover-reason')).toContainText('50단계');
  await expect(page.getByTestId('gameover-rewards')).toBeVisible();
  const tick = await sim(page, (s) => s.match.tick);
  expect(await sim(page, (s) => s.debugFastForward(20))).toBe(0); // 끝난 판은 더 돌지 않는다
  expect(await sim(page, (s) => s.match.tick)).toBe(tick);
  expect(errors).toEqual([]);
});
