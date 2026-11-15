/**
 * M1 검토 반영 E2E: HUD와 맵 배치·터치, debug HUD 넘침, 타이틀 debug 버튼, 경고 연출, 투명 몹 👁.
 *
 * - 보스 단계에 HUD(2줄 + 보스 막대)가 맵 0줄을 덮고 터치를 막던 문제: 여러 화면 크기에서
 *   HUD 아래 끝 ≤ 맵 위 끝, 0줄 칸 위쪽을 탭하면 캔버스(Phaser pointerdown)에 들어가는지 확인한다.
 * - 화면 크기가 바뀌면(세로 → 가로) 맵을 다시 배치한다.
 * sim 상태는 개발 서버의 window.__rtd 로 읽는다 (화면은 읽기만, 단계 건너뛰기는 debug 명령).
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  return errors;
}

async function startInfinite(page: Page, query: string): Promise<void> {
  await page.goto(`/${query}`);
  await page.getByRole('button', { name: '시작' }).click();
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
}

/** debug 단계 건너뛰기 명령을 n번 (한 틱에 한 번씩) 보낸다. */
async function skipStages(page: Page, n: number, thenTicks = 0): Promise<number> {
  return page.evaluate(
    ([count, extra]) => {
      const w = window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } };
      const s = w.__rtd.game.scene.getScene('Game') as {
        match: { world: { enqueue(c: { type: string }): unknown }; state: { stage: number } };
        debugFastForward(n: number): number;
      };
      for (let i = 0; i < count; i++) {
        s.match.world.enqueue({ type: 'debugSkipStage' });
        s.debugFastForward(1);
      }
      if (extra > 0) s.debugFastForward(extra);
      return s.match.state.stage;
    },
    [n, thenTicks] as const,
  );
}

interface Geometry {
  hudBottom: number;
  stageLeft: number;
  stageTop: number;
  stageWidth: number;
  /** 기준 px → CSS px */
  k: number;
  originX: number;
  originY: number;
  tile: number;
  minRow: number;
  /** 맵(화면 밖 줄 포함) 위 끝 CSS px */
  mapTop: number;
  /** 0줄 위 끝 CSS px */
  row0Top: number;
}

async function geometry(page: Page): Promise<Geometry> {
  return page.evaluate(() => {
    const w = window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } };
    const scene = w.__rtd.game.scene.getScene('Game') as {
      mapLayout: { originX: number; originY: number; tile: number; minRow: number };
    };
    const L = scene.mapLayout;
    const stage = document.getElementById('stage')!.getBoundingClientRect();
    const hud = document.querySelector('.hud')!.getBoundingClientRect();
    const k = stage.width / 1080;
    return {
      hudBottom: hud.bottom,
      stageLeft: stage.left,
      stageTop: stage.top,
      stageWidth: stage.width,
      k,
      originX: L.originX,
      originY: L.originY,
      tile: L.tile,
      minRow: L.minRow,
      mapTop: stage.top + (L.originY + L.minRow * L.tile) * k,
      row0Top: stage.top + L.originY * k,
    };
  });
}

const VIEWPORTS: { name: string; width: number; height: number }[] = [
  { name: '412x915', width: 412, height: 915 },
  { name: '360x640', width: 360, height: 640 },
  { name: '320x568', width: 320, height: 568 },
  { name: '915x412 가로', width: 915, height: 412 },
];

for (const vp of VIEWPORTS) {
  test(`보스 단계 HUD가 맵 0줄을 덮지 않고, 0줄 칸 위쪽 탭이 캔버스에 들어간다 (${vp.name})`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await startInfinite(page, '?debug=1&seed=9');
    // 보스 단계 전에도 HUD 아래에 맵 (보스 막대 자리는 늘 비워 둔다 → 보스가 와도 맵이 그대로)
    const before = await geometry(page);
    expect(before.hudBottom).toBeLessThanOrEqual(before.mapTop + 0.5);
    expect(await skipStages(page, 10)).toBe(10);
    await expect(page.getByTestId('hud-boss')).toBeVisible();
    const g = await geometry(page);
    expect(g.originY).toBe(before.originY); // 보스 막대가 보여도 맵이 밀리지 않음
    expect(g.hudBottom).toBeLessThanOrEqual(g.mapTop + 0.5);
    // M2 검토 반영: 단계 시작 알림은 HUD 띠와 맵 사이 비워 둔 자리에 뜬다 → 맵 0줄(타워·피해 숫자)을 가리지 않는다
    const toast = page.locator('.toast').first();
    await expect(toast).toBeVisible();
    const tb = (await toast.boundingBox())!;
    expect(tb.y).toBeGreaterThanOrEqual(g.hudBottom - 0.5);
    expect(tb.y + tb.height).toBeLessThanOrEqual(g.mapTop + 0.5);

    // 0줄 (4, 0) 칸의 위쪽 10% 지점
    const x = g.stageLeft + (g.originX + 4.5 * g.tile) * g.k;
    const y = g.row0Top + g.tile * 0.1 * g.k;
    const hit = await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.tagName ?? '', [x, y] as const);
    expect(hit).toBe('CANVAS');
    // 보스 배너 한가운데도 터치를 통과시킨다 (HUD 띠는 버튼만 터치를 받는다)
    const banner = (await page.getByTestId('hud-boss').boundingBox())!;
    const bannerHit = await page.evaluate(
      ([px, py]) => document.elementFromPoint(px, py)?.tagName ?? '',
      [banner.x + banner.width / 2, banner.y + banner.height / 2] as const,
    );
    expect(bannerHit).toBe('CANVAS');

    // 실제 탭 → Phaser pointerdown이 0줄 칸으로 들어오는지
    await page.evaluate(() => {
      const w = window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } }; __taps: number[][] };
      w.__taps = [];
      const scene = w.__rtd.game.scene.getScene('Game') as {
        input: { on(ev: string, fn: (p: { worldX: number; worldY: number }) => void): void };
      };
      scene.input.on('pointerdown', (p) => w.__taps.push([p.worldX, p.worldY]));
    });
    await page.touchscreen.tap(x, y);
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __taps: number[][] }).__taps.length), { timeout: 3000 })
      .toBeGreaterThan(0);
    const tap = await page.evaluate(() => (window as unknown as { __taps: number[][] }).__taps[0]!);
    const tile = { tx: Math.floor((tap[0]! - g.originX) / g.tile), ty: Math.floor((tap[1]! - g.originY) / g.tile) };
    expect(tile).toEqual({ tx: 4, ty: 0 });
    // M2: 그 탭으로 (4, 0) 배치 칸에 소환된다 (보스 배너 아래 칸도 터치가 통과)
    await expect
      .poll(() =>
        page.evaluate(() => {
          const w = window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } };
          const s = w.__rtd.game.scene.getScene('Game') as { match: { towers(): { tx: number; ty: number }[] } };
          return s.match.towers().map((t) => `${t.tx},${t.ty}`);
        }),
      )
      .toEqual(['4,0']);
    mkdirSync('test-results/screens', { recursive: true });
    await page.screenshot({ path: `test-results/screens/M1r-boss-${vp.width}x${vp.height}.png`, animations: 'disabled' });
    expect(errors).toEqual([]);
  });
}

test('화면 크기가 바뀌면(세로 → 가로 → 세로) 맵을 HUD 아래로 다시 배치한다', async ({ page }) => {
  const errors = collectErrors(page);
  await startInfinite(page, '?debug=1&seed=5');
  await skipStages(page, 3, 400); // 몹이 있는 상태에서 다시 배치
  const tall = await geometry(page);
  expect(tall.hudBottom).toBeLessThanOrEqual(tall.mapTop + 0.5);
  await page.setViewportSize({ width: 915, height: 412 });
  await expect.poll(async () => {
    const g = await geometry(page);
    return g.hudBottom <= g.mapTop + 0.5;
  }).toBe(true);
  const wide = await geometry(page);
  expect(wide.tile).toBeLessThan(tall.tile); // 가로 화면은 HUD가 기준 px로 커져 맵이 작아진다
  // 몹 그림도 새 배치로 다시 생겨 sim 몹 수와 같다
  const counts = await page.evaluate(() => {
    const w = window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } };
    const s = w.__rtd.game.scene.getScene('Game') as { renderedMobCount: number; match: { mobCount(): number } };
    return [s.renderedMobCount, s.match.mobCount()];
  });
  expect(counts[0]).toBe(counts[1]);
  expect(counts[1]).toBeGreaterThan(0);
  await page.setViewportSize({ width: 412, height: 915 });
  await expect.poll(async () => (await geometry(page)).tile).toBe(tall.tile);
  expect(errors).toEqual([]);
});

for (const vp of [
  { width: 360, height: 640 },
  { width: 320, height: 568 },
  { width: 915, height: 412 },
]) {
  test(`debug HUD: 👑 100단계 + 세 자리 몹 수에서도 줄이 넘치지 않고 ⏸가 보이며, 눌러도 무대가 밀리지 않는다 (${vp.width}x${vp.height})`, async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.setViewportSize(vp);
    await startInfinite(page, '?debug=1&seed=9');
    expect(await skipStages(page, 100, 400)).toBe(100);
    await expect(page.getByTestId('hud-stage')).toHaveText('👑 100단계');
    await expect(page.getByTestId('hud-count')).toHaveText(/^\d{3}\/150$/);
    const m = await page.evaluate(() => {
      const stage = document.getElementById('stage')!.getBoundingClientRect();
      const rows = [...document.querySelectorAll('.hud-row')].map((r) => r.scrollWidth - r.clientWidth);
      const btns = [...document.querySelectorAll('.hud .btn')].map((b) => {
        const r = b.getBoundingClientRect();
        return r.left >= stage.left - 0.5 && r.right <= stage.right + 0.5;
      });
      return { rows, btns };
    });
    expect(m.rows.every((d) => d <= 0)).toBe(true);
    expect(m.btns.every(Boolean)).toBe(true);
    // ⏭는 2줄(배속 옆)
    await expect(page.locator('.hud-row').nth(1).getByRole('button', { name: '다음 단계로 즉시 이동' })).toHaveCount(1);
    await page.getByRole('button', { name: '일시정지' }).click();
    await page.getByRole('button', { name: '계속' }).click();
    const shift = await page.evaluate(() => {
      const stage = document.getElementById('stage')!;
      const canvas = document.querySelector('#game canvas')!.getBoundingClientRect();
      return { scrollLeft: stage.scrollLeft, scrollTop: stage.scrollTop, dx: canvas.left - stage.getBoundingClientRect().left };
    });
    expect(shift).toEqual({ scrollLeft: 0, scrollTop: 0, dx: 0 });
    expect(errors).toEqual([]);
  });
}

for (const vp of [
  { width: 412, height: 915 },
  { width: 320, height: 568 },
  { width: 915, height: 412 },
]) {
  test(`타이틀: debug 버튼이 있어도 [시작] 자리가 같고, [캠페인 1]은 [시작]과 겹치지 않으며 무대 안 (${vp.width}x${vp.height})`, async ({
    page,
  }) => {
    await page.setViewportSize(vp);
    await page.goto('/?seed=1');
    const plain = (await page.getByRole('button', { name: '시작' }).boundingBox())!;
    await page.goto('/?debug=1&seed=1');
    const start = (await page.getByRole('button', { name: '시작' }).boundingBox())!;
    const camp = (await page.getByRole('button', { name: '캠페인 1 (디버그)' }).boundingBox())!;
    expect(start).toEqual(plain);
    expect(camp.y).toBeGreaterThanOrEqual(start.y + start.height);
    const stage = (await page.locator('#stage').boundingBox())!;
    expect(camp.y + camp.height).toBeLessThanOrEqual(stage.y + stage.height + 0.5);
    expect(camp.height).toBeGreaterThanOrEqual(44);
  });
}

test('경고: 무한 모드 몹 120 이상이면 화면 가장자리 붉은 테두리 + 숫자 깜빡 (UI.md 4.2)', async ({ page }) => {
  const errors = collectErrors(page);
  await startInfinite(page, '?debug=1&seed=42');
  await expect(page.getByTestId('hud-edge')).not.toHaveClass(/is-on/);
  // 6단계 끝까지 ≈ 120마리 넘김 (8단계 11번째 칸에 151)
  await page.evaluate(() => {
    const w = window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } };
    const s = w.__rtd.game.scene.getScene('Game') as { match: { mobCount(): number }; debugFastForward(n: number): number };
    while (s.match.mobCount() < 125) s.debugFastForward(20);
  });
  await expect(page.getByTestId('hud-edge')).toHaveClass(/is-on/);
  await expect(page.locator('.hud-count')).toHaveClass(/is-danger/);
  await expect(page.locator('.hud-count')).toHaveClass(/is-blink/);
  // 테두리 층은 터치를 막지 않는다
  expect(await page.getByTestId('hud-edge').evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
  expect(errors).toEqual([]);
});

test('경고: 캠페인 목숨이 줄면 하트가 깨지는 연출, 목숨 5 이하는 빨간색만 (깜빡이지 않음)', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?debug=1&seed=3');
  await page.getByRole('button', { name: '캠페인 1 (디버그)' }).click();
  await expect(page.getByTestId('hud-count')).toHaveText('20');
  const icon = page.getByTestId('hud-count-icon');
  await expect(icon).toHaveText('❤');
  await expect(page.getByTestId('hud-edge')).not.toHaveClass(/is-on/);
  // 첫 슬라임이 출구에 닿는 틱(1200 + 1039) 직후까지
  await page.evaluate(() => {
    const w = window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } };
    const s = w.__rtd.game.scene.getScene('Game') as { match: { tick: number; state: { lives: number } }; debugFastForward(n: number): number };
    while (s.match.state.lives === 20) s.debugFastForward(1);
  });
  await expect(icon).toHaveClass(/is-break/);
  await expect(icon).toHaveText('💔');
  await expect(icon).not.toHaveClass(/is-break/, { timeout: 3000 });
  await expect(icon).toHaveText('❤');
  // 목숨 5 이하: 빨간색, 깜빡임·가장자리 테두리 없음
  await page.evaluate(() => {
    const w = window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } };
    const s = w.__rtd.game.scene.getScene('Game') as { match: { state: { lives: number } }; debugFastForward(n: number): number };
    while (s.match.state.lives > 4) s.debugFastForward(1);
  });
  await expect(page.locator('.hud-count')).toHaveClass(/is-danger/);
  await expect(page.locator('.hud-count')).not.toHaveClass(/is-blink/);
  await expect(page.getByTestId('hud-edge')).not.toHaveClass(/is-on/);
  expect(errors).toEqual([]);
});

test('투명 몹: 35단계 투명 도둑 머리 위에 👁 아이콘 (ENEMIES.md 5장)', async ({ page }) => {
  const errors = collectErrors(page);
  await startInfinite(page, '?debug=1&seed=9');
  // 35단계 투명 도둑 2마리는 15~20번째 칸 → 1100틱이면 모두 나온다
  expect(await skipStages(page, 35, 1100)).toBe(35);
  await page.waitForTimeout(200);
  const r = await page.evaluate(() => {
    const w = window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } };
    const s = w.__rtd.game.scene.getScene('Game') as {
      renderedEyeIconCount: number;
      match: { mobs(): { invisible: boolean }[] };
    };
    return { eyes: s.renderedEyeIconCount, invisible: s.match.mobs().filter((m) => m.invisible).length };
  });
  expect(r.invisible).toBeGreaterThan(0);
  expect(r.eyes).toBe(r.invisible);
  expect(errors).toEqual([]);
});
