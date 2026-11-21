/**
 * B-1 전투 화면 소환 연출 (Codex 패치 확인) E2E — 휴대폰 412×915 · 360×800.
 * 사용자 결정: 캐릭터는 기본 2배(상하좌우에 타워가 붙으면 1.4배, HUD 아래까지로 줄임), 맵 위아래 여백 없음. (소환 바닥은 #79부터 정적 텍스처에 없고 조작 중·잘못 누른 뒤 잠깐만 칸을 표시한다.)
 * 이 결정 때문에 큰 머리가 위·옆 칸을 덮는다 → 터치 판정이 맞는지 여기서 본다:
 *  a. 빈 소환 칸(큰 타워 바로 위·옆, 0번 줄 포함)을 누르면 그 칸에 소환 — 큰 이웃의 머리가 탭을 가져가지 않는다.
 *  b. 타워 몸·커진 머리를 누르면 그 타워를 고르고 정보 패널, 패널은 고른 그림(실제 크기)을 가리지 않는다.
 *  c. 길게 눌러 끌기 이동·교환이 맞는 칸에 놓인다 (머리를 잡고 끌어도).
 *  d. (G-2: 주사위 → 캐릭터 초상 카드) 소환·승급 카드는 뒷면 → 앞면으로 뒤집히며 커진 머리 끝 위에 멈추고, 발밑 소환문·승급 등급 별,
 *     연출 끄기·동작 줄이기면 카드·소환문·별 없음.
 *  e. 0번 줄 큰 머리는 HUD 아래까지만 (일시정지·배속 누르기 그대로).
 *  f. 꽉 찬 판: 모든 칸에 타워 → 스크린샷 + 칸마다 탭이 그 타워.
 * 스크린샷 (SAVE_SCREENS=1): docs/screens/B1-crowded-412.png · B1-empty-pad-tap.png · B1-info-panel-big.png · B1-summon-fx.png · B1-360.png.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { clickStart } from './title';

const SAVE_DOCS = process.env.SAVE_SCREENS === '1';
/** towerGeom: 발밑 ~ 머리 끝(대기 동작 여유 포함) = 1.136칸 × 크기 배수, 발밑 = 칸 중심 + 0.3칸, 받침대 아래 = +0.475칸 */
const HEAD_ABOVE_FOOT = 0.3 + 0.776 + 0.06;

type Tw = { id: number; tx: number; ty: number; tower: string };
type SceneLike = {
  match: {
    tick: number;
    state: { gold: number; stage: number };
    map: { buildable: [number, number][]; width: number; height: number };
    rules: { towerOrder: string[] };
    towers(): Tw[];
    world: { enqueue(c: Record<string, unknown>): { ok: boolean } };
  };
  mapLayout: { originX: number; originY: number; tile: number };
  towerLayer: { artScaleOf(id: number): number | null };
  selectedTowerId: number | null;
  panelOpen: boolean;
  dragState: { id: number } | null;
  summonFxStats: { active: number; shown: number; peak: number; portals: number; silhouettes: number; stars: number };
  tweens: { timeScale: number };
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
  await page.screenshot({ path: `test-results/screens/${name}.png` });
  if (SAVE_DOCS) {
    mkdirSync('docs/screens', { recursive: true });
    await page.screenshot({ path: `docs/screens/${name}.png` });
  }
}

/** 이 파일은 정보 패널을 본다 → '눌러서 바로 승급'을 끄고 시작 (같은 타워 셋을 눌러도 승급되지 않게). */
async function start(page: Page, query = '?debug=1&seed=42', settings: Record<string, unknown> = {}): Promise<void> {
  await page.addInitScript((s) => localStorage.setItem('rtd.settings', JSON.stringify({ v: 1, tapMerge: false, ...s })), settings);
  await page.goto(`/${query}`);
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
  await expect.poll(() => sim(page, (s) => s.mapLayout.tile)).toBeGreaterThan(0);
  await sim(page, (s) => s.match.world.enqueue({ type: 'debugAddGold', amount: 1_000_000 }));
  await page.waitForTimeout(300);
}

/** 칸 (tx, ty) 가운데에서 (dx, dy)칸 옮긴 자리의 페이지 좌표. */
async function tilePoint(page: Page, tx: number, ty: number, dx = 0, dy = 0): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([x, y, ddx, ddy]) => {
      const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game') as SceneLike;
      const L = s.mapLayout;
      const r = document.getElementById('stage')!.getBoundingClientRect();
      const k = r.width / 1080;
      return { x: r.left + (L.originX + (x + 0.5 + ddx) * L.tile) * k, y: r.top + (L.originY + (y + 0.5 + ddy) * L.tile) * k };
    },
    [tx, ty, dx, dy] as const,
  );
}

async function tap(page: Page, tx: number, ty: number, dx = 0, dy = 0): Promise<void> {
  const p = await tilePoint(page, tx, ty, dx, dy);
  await page.touchscreen.tap(p.x, p.y);
  await page.waitForTimeout(140);
}

async function towers(page: Page): Promise<Tw[]> {
  return sim(page, (s) => s.match.towers().map((t) => ({ id: t.id, tx: t.tx, ty: t.ty, tower: t.tower })));
}

/** 개발자 명령으로 [x, y, 타워 id] 놓기 (한 틱). */
async function place(page: Page, list: [number, number, string][]): Promise<void> {
  const n0 = (await towers(page)).length;
  const ok = await sim(
    page,
    (s, l) => {
      let n = 0;
      for (const [x, y, id] of l) if (s.match.world.enqueue({ type: 'debugTower', x, y, t: s.match.rules.towerOrder.indexOf(id) }).ok) n++;
      s.debugFastForward(1);
      return n;
    },
    list,
  );
  expect(ok).toBe(list.length);
  await expect.poll(async () => (await towers(page)).length).toBe(n0 + list.length);
  await page.waitForTimeout(350); // 등장 동작·크기 맞춤
}

const BIG = ['stonegolem', 'dragoncaller'];

for (const [w, h] of [
  [412, 915],
  [360, 800],
] as const) {
  test.describe(`B-1 ${w}×${h}`, () => {
    test.use({ viewport: { width: w, height: h } });

    test('a. 빈 소환 칸(큰 타워 바로 위·옆·0번 줄)을 누르면 그 칸에 소환 — 큰 머리가 탭을 가져가지 않는다', async ({ page }) => {
      test.slow();
      const errors = collectErrors(page);
      await start(page);
      // 바둑판: (x + y) 짝수 칸에 큰 캐릭터 → 서로 붙지 않아 모두 기본 2배(돌 골렘 2.5배), 빈 칸은 위·아래·옆이 큰 타워
      const cells = await sim(page, (s) => s.match.map.buildable.map(([x, y]) => [x, y] as [number, number]));
      const filled = cells.filter(([x, y]) => (x + y) % 2 === 0);
      await place(page, filled.map(([x, y], i) => [x, y, BIG[i % 2]!] as [number, number, string]));
      // G-1 인원 한도(20)를 넘겨 빈 칸을 모두 눌러 볼 수 있게 (카드 '부대 확장'과 같은 값 자리)
      await sim(page, (s) => {
        (s.match.state as unknown as { unitCapBonus: number[] }).unitCapBonus[0] = 20;
        return null;
      });
      const scales = await sim(page, (s) => s.match.towers().map((t) => s.towerLayer.artScaleOf(t.id) ?? 0));
      // V2.0 PR-A: 크기는 이웃과 무관하게 등급 배율로만 — 혼자 칸 너비 60~80% (돌 골렘·용 소환사 ≈0.71~0.78배). 머리 끝은 위 칸 경계 언저리
      expect(Math.max(...scales), '큰 캐릭터도 칸 안 크기 (0.7~0.9배)').toBeGreaterThanOrEqual(0.7);
      expect(Math.max(...scales)).toBeLessThan(0.9);
      const empty = cells.filter(([x, y]) => (x + y) % 2 !== 0);
      // 바로 아래에 큰 타워가 있는 빈 칸·0번 줄 빈 칸이 있어야 의미가 있다
      const has = (x: number, y: number) => filled.some(([fx, fy]) => fx === x && fy === y);
      expect(empty.some(([x, y]) => has(x, y + 1))).toBe(true);
      expect(empty.some(([, y]) => y === Math.min(...cells.map((c) => c[1])))).toBe(true);
      if (w === 412) await shot(page, 'B1-empty-pad-tap-before');
      // 칸 안 여러 자리: 가운데 · 위쪽 · 아래쪽 좌우(아래 타워 머리 옆) · 아래쪽 가운데 바로 위(크기 1 머리 영역 위)
      const offsets: [number, number][] = [
        [0, 0],
        [0, -0.38],
        [-0.4, 0.3],
        [0.4, 0.3],
        [0, 0.12],
      ];
      // G-1 칸 무더기: 누른 빈 칸에 소환하되, 같은 캐릭터가 덜 쌓인 칸이 이미 있으면 그 칸에 쌓인다 (사용자 결정) —
      // 그래서 '누른 칸이 찼다' 또는 '같은 캐릭터 무더기에 하나 더'를 확인한다. 큰 타워 칸에는 절대 들어가지 않는다
      let taps = 0;
      for (let i = 0; i < empty.length; i++) {
        const [x, y] = empty[i]!;
        if ((await towers(page)).some((t) => t.tx === x && t.ty === y)) continue;
        const before = await towers(page);
        const [dx, dy] = offsets[i % offsets.length]!;
        await tap(page, x, y, dx, dy);
        taps++;
        await expect.poll(async () => (await towers(page)).length, { message: `(${x},${y}) +(${dx},${dy}) 탭 → 소환` }).toBe(before.length + 1);
        const added = (await towers(page)).find((t) => !before.some((b) => b.id === t.id))!;
        const joined = before.some((b) => b.tx === added.tx && b.ty === added.ty && b.tower === added.tower);
        expect(added.tx === x && added.ty === y ? true : joined, `(${x},${y}) 탭 → 그 칸 또는 같은 캐릭터 무더기`).toBe(true);
        expect(filled.some(([fx, fy]) => fx === added.tx && fy === added.ty)).toBe(false);
        expect(await sim(page, (s) => s.selectedTowerId)).toBeNull();
      }
      expect(taps).toBeGreaterThan(3);
      if (w === 412) await shot(page, 'B1-empty-pad-tap');
      expect(errors).toEqual([]);
    });

    test('b. 타워 몸·커진 머리를 누르면 고르고 정보 패널, 패널이 고른 그림(실제 크기)을 가리지 않는다', async ({ page }) => {
      test.slow();
      const errors = collectErrors(page);
      await start(page);
      // 줄마다 큰 타워 하나 (혼자 → 2배). 위 칸이 길·장식이면 위 칸까지 올라온 머리를 눌러도 고른다
      const picks = await sim(page, (s) => {
        const set = new Set(s.match.map.buildable.map(([x, y]) => `${x},${y}`));
        const rows = new Map<number, [number, number]>();
        for (const [x, y] of s.match.map.buildable) {
          const prev = rows.get(y);
          // 위 칸이 소환 칸이 아닌 칸을 먼저 (머리 탭 확인용)
          if (!prev || (set.has(`${prev[0]},${y - 1}`) && !set.has(`${x},${y - 1}`))) rows.set(y, [x, y]);
        }
        return [...rows.values()].map(([x, y]) => ({ x, y, openAbove: !set.has(`${x},${y - 1}`) && y > 0 }));
      });
      expect(picks.length).toBeGreaterThanOrEqual(6); // G-1 큰 칸 맵: 배치 칸 줄 6개 (예전 8)
      let headTaps = 0;
      for (const [i, c] of picks.entries()) {
        await place(page, [[c.x, c.y, BIG[i % 2]!]]);
        const t = (await towers(page)).find((k) => k.tx === c.x && k.ty === c.y)!;
        const scale = (await sim(page, (s, id) => s.towerLayer.artScaleOf(id), t.id))!;
        // 몸 (칸 가운데 조금 아래)
        await tap(page, c.x, c.y, 0, 0.1);
        await expect.poll(() => sim(page, (s) => s.selectedTowerId), { message: `${c.y}줄 몸` }).toBe(t.id);
        await expect(page.getByTestId('tower-panel')).toBeVisible();
        await page.waitForTimeout(300);
        // 패널 vs 그림 (실제 크기 배수로)
        const m = await page.evaluate(
          ([x, y, k, head]) => {
            const s = (window as unknown as { __rtd: { game: { scene: { getScene(n: string): unknown } } } }).__rtd.game.scene.getScene('Game') as SceneLike;
            const L = s.mapLayout;
            const st = document.getElementById('stage')!.getBoundingClientRect();
            const kk = st.width / 1080;
            const cy = L.originY + (y + 0.5) * L.tile;
            const fig = { top: st.top + (cy + (0.3 - head * k) * L.tile) * kk, bottom: st.top + (cy + 0.475 * L.tile) * kk };
            const r = document.querySelector('[data-testid="tower-panel"]')!.getBoundingClientRect();
            return { x, fig, panel: { top: r.top, bottom: r.bottom }, overlap: Math.max(0, Math.min(r.bottom, fig.bottom) - Math.max(r.top, fig.top)) };
          },
          [c.x, c.y, scale, HEAD_ABOVE_FOOT] as const,
        );
        expect(m.overlap, `${c.y}줄 (×${scale.toFixed(2)}) 패널이 그림을 가림: ${JSON.stringify(m)}`).toBeLessThanOrEqual(0.5);
        if (w === 412 && i === Math.floor(picks.length / 2)) await shot(page, 'B1-info-panel-big');
        await page.locator('[data-action="panel-close"]').click();
        await expect(page.getByTestId('tower-panel')).toHaveCount(0);
        // 머리 끝 바로 아래 (V2.0 PR-A: 그림이 칸의 60~80%라 머리 끝은 칸 위 경계 언저리 — 실제 크기 배수로 계산해 누른다)
        const headDy = 0.3 - HEAD_ABOVE_FOOT * scale + 0.06;
        if (c.openAbove) headTaps++;
        await tap(page, c.x, c.y, 0.15, headDy);
        await expect.poll(() => sim(page, (s) => s.selectedTowerId), { message: `${c.y}줄 머리 (${headDy})` }).toBe(t.id);
        expect((await towers(page)).length).toBe(i + 1);
        await page.locator('[data-action="panel-close"]').click();
        await expect(page.getByTestId('tower-panel')).toHaveCount(0);
      }
      expect(headTaps, '위 칸이 길인 줄에서 큰 머리 탭을 한 번 이상 확인').toBeGreaterThan(0);
      expect(errors).toEqual([]);
    });

    test('c+e. 큰 타워를 길게 눌러(머리를 잡아도) 끌면 맞는 칸으로 이동·교환, 0번 줄 머리는 HUD 아래까지', async ({ page }) => {
      test.slow();
      const errors = collectErrors(page);
      await start(page);
      const cells = await sim(page, (s) => s.match.map.buildable.map(([x, y]) => [x, y] as [number, number]));
      const top = Math.min(...cells.map((c) => c[1]));
      const row0 = cells.filter(([, y]) => y === top);
      // 0번 줄을 큰 캐릭터로 채운다 (붙어 있으면 1.4배)
      await place(page, row0.map(([x, y], i) => [x, y, BIG[i % 2]!] as [number, number, string]));
      // e: 머리 끝(실제 크기)이 HUD 띠 아래 · 일시정지·배속 버튼 가운데·양끝을 누르면 그 버튼
      const heads = await page.evaluate((head) => {
        const s = (window as unknown as { __rtd: { game: { scene: { getScene(n: string): unknown } } } }).__rtd.game.scene.getScene('Game') as SceneLike;
        const L = s.mapLayout;
        const st = document.getElementById('stage')!.getBoundingClientRect();
        const k = st.width / 1080;
        const band = document.querySelector('.hud-root > .hud')!.getBoundingClientRect().bottom;
        return s.match.towers().map((t) => {
          const foot = L.originY + (t.ty + 0.8) * L.tile;
          const sc = s.towerLayer.artScaleOf(t.id) ?? 1;
          return { head: st.top + (foot - head * sc * L.tile) * k, band, sc };
        });
      }, HEAD_ABOVE_FOOT);
      for (const hd of heads) expect(hd.head, JSON.stringify(hd)).toBeGreaterThanOrEqual(hd.band - 1);
      for (const action of ['pause', 'speed']) {
        const hit = await page.evaluate((a) => {
          const b = document.querySelector(`[data-action="${a}"]`)!.getBoundingClientRect();
          return [0.15, 0.5, 0.85].every((f) => document.elementFromPoint(b.x + b.width * f, b.y + b.height * 0.8)?.closest(`[data-action="${a}"]`) != null);
        }, action);
        expect(hit, `${action} 버튼 누르기`).toBe(true);
      }
      const speed0 = await page.locator('[data-action="speed"]').textContent();
      await page.locator('[data-action="speed"]').tap();
      await expect(page.locator('[data-action="speed"]')).not.toHaveText(speed0 ?? '');

      // c: 1번 줄 이하에서 위 칸이 비어 있지 않은(머리를 잡을 수 있는) 큰 타워를 하나 놓고 빈 칸으로 끌기
      const free = cells.filter(([x, y]) => y > top + 1 && !row0.some(([a, b]) => a === x && b === y));
      const [ax, ay] = free[0]!;
      const dest = free.find(([x, y]) => Math.abs(x - ax) + Math.abs(y - ay) >= 3)!;
      // G-1: 같은 캐릭터끼리는 끌어 놓으면 합쳐지므로(무더기) 교환을 보려면 0번 줄 첫 타워와 다른 캐릭터
      await place(page, [[ax, ay, BIG[1]!]]);
      const a = (await towers(page)).find((t) => t.tx === ax && t.ty === ay)!;
      // 머리(0.55칸 위) 를 잡고 0.5초 → 끌기
      const from = await tilePoint(page, ax, ay, 0, -0.55);
      const to = await tilePoint(page, dest[0], dest[1], 0, -0.55);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await expect.poll(() => sim(page, (s) => s.dragState?.id ?? null), { timeout: 5000 }).toBe(a.id);
      await page.mouse.move(to.x, to.y, { steps: 8 });
      await page.waitForTimeout(200);
      await page.mouse.up();
      await expect.poll(async () => (await towers(page)).find((t) => t.id === a.id)).toMatchObject({ tx: dest[0], ty: dest[1] });
      // 교환: 0번 줄 첫 타워를 끌어 a 위에 놓으면 서로 바뀐다
      const b = (await towers(page)).find((t) => t.tx === row0[0]![0] && t.ty === row0[0]![1])!;
      await page.waitForTimeout(400);
      const bp = await tilePoint(page, b.tx, b.ty, 0, 0.1);
      const ap = await tilePoint(page, dest[0], dest[1], 0, 0.1);
      await page.mouse.move(bp.x, bp.y);
      await page.mouse.down();
      await expect.poll(() => sim(page, (s) => s.dragState?.id ?? null), { timeout: 5000 }).toBe(b.id);
      await page.mouse.move(ap.x, ap.y, { steps: 8 });
      await page.waitForTimeout(200);
      await page.mouse.up();
      await expect.poll(async () => (await towers(page)).find((t) => t.id === b.id)).toMatchObject({ tx: dest[0], ty: dest[1] });
      expect((await towers(page)).find((t) => t.id === a.id)).toMatchObject({ tx: b.tx, ty: b.ty });
      if (w === 360) await shot(page, 'B1-360');
      expect(errors).toEqual([]);
    });

    test('f. 꽉 찬 판: 모든 칸에 타워(1.4배) → 칸마다 몸·위쪽을 누르면 그 타워', async ({ page }) => {
      test.slow();
      const errors = collectErrors(page);
      await start(page, '?debug=1&seed=5');
      const cells = await sim(page, (s) => s.match.map.buildable.map(([x, y]) => [x, y] as [number, number]));
      const order = await sim(page, (s) => s.match.rules.towerOrder.slice(0, 40));
      await place(page, cells.map(([x, y], i) => [x, y, order[(i * 7) % order.length]!] as [number, number, string]));
      await sim(page, (s) => s.debugFastForward(600));
      await page.waitForTimeout(400);
      await shot(page, w === 412 ? 'B1-crowded-412' : 'B1-crowded-360');
      // 칸 절반(맨 위·맨 아래 줄은 모두)을 몸(+0.1칸)·위쪽(−0.3칸, 위 타워 발밑·아래 타워 머리가 겹치는 자리)으로 번갈아 누른다
      const all = await towers(page);
      const rows = all.map((t) => t.ty);
      const list = all.filter((t, i) => i % 2 === 0 || t.ty === Math.min(...rows) || t.ty === Math.max(...rows));
      for (const [i, t] of list.entries()) {
        const dy = i % 2 === 0 ? 0.1 : -0.3;
        await tap(page, t.tx, t.ty, 0, dy);
        await expect.poll(() => sim(page, (s) => s.selectedTowerId), { message: `(${t.tx},${t.ty}) +${dy}` }).toBe(t.id);
        // 열린 패널(DOM)이 다음 칸을 덮을 수 있으니 닫고 다음 칸 (패널 위 탭은 캔버스로 가지 않는다)
        await page.locator('[data-action="panel-close"]').click();
        await expect(page.getByTestId('tower-panel')).toHaveCount(0);
      }
      expect((await towers(page)).length).toBe(cells.length);
      expect(errors).toEqual([]);
    });
  });
}

test('d. 소환·승급 초상 카드는 뒷면 → 앞면으로 뒤집히며 얼굴을 가리지 않는 자리(머리 위, 윗줄은 머리 옆)에 멈추고 발밑 소환문 · 승급은 등급 별 (주사위 없음)', async ({ page }) => {
  test.slow();
  const errors = collectErrors(page);
  await start(page);
  // 트윈을 10배 느리게 → 0.34초 뒤집기를 헤드리스(초당 몇 프레임)에서도 여러 프레임 본다
  await page.evaluate(() => {
    type Obj = { name: string; x: number; y: number; visible: boolean; list?: Obj[]; texture?: { key: string } };
    const w = window as unknown as { fx: { faces: Record<string, string[]>; minY: Record<string, number>; lastX: Record<string, number>; names: string[]; dieTex: number }; __rtd: { game: { scene: { getScene(k: string): unknown } } } };
    const s = w.__rtd.game.scene.getScene('Game') as { tweens: { timeScale: number }; events: { on(e: string, f: () => void): void }; children: { list: Obj[] } };
    s.tweens.timeScale = 0.1;
    w.fx = { faces: {}, minY: {}, lastX: {}, names: [], dieTex: 0 };
    s.events.on('postupdate', () => {
      for (const c of s.children.list) {
        if (/^(summon|merge)-/.test(c.name) && !w.fx.names.includes(c.name)) w.fx.names.push(c.name);
        if (c.texture?.key.startsWith('fx-dice-')) w.fx.dieTex++;
        if (c.name.endsWith('-card') && c.list) {
          // 카드 컨테이너 [뒷면, 앞면 바탕, (초상), 테]: 지금 보이는 면
          const face = c.list[0]?.visible ? 'back' : 'front';
          const f = (w.fx.faces[c.name] ??= []);
          if (f[f.length - 1] !== face) f.push(face);
          w.fx.minY[c.name] = Math.min(w.fx.minY[c.name] ?? Infinity, c.y);
          w.fx.lastX[c.name] = c.x;
        }
      }
    });
  });
  const fx = () => page.evaluate(() => (window as unknown as { fx: { faces: Record<string, string[]>; minY: Record<string, number>; names: string[]; dieTex: number } }).fx);
  const [x, y] = (await sim(page, (s) => s.match.map.buildable[5]!)) as [number, number];
  await tap(page, x, y);
  await expect.poll(async () => (await fx()).faces['summon-card']?.join(',') ?? '', { message: '소환 카드가 뒷면 → 앞면' }).toBe('back,front');
  expect((await fx()).names).toEqual(expect.arrayContaining(['summon-portal', 'summon-burst', 'summon-silhouette']));
  // 카드는 커진 캐릭터의 얼굴을 가리지 않는다 (예전 −0.94칸이면 2배 그림의 얼굴을 가림): 머리 끝 위에서 멈추거나,
  // HUD 아래 끝에 막히면(윗줄) 머리 옆(화면 가운데 쪽)으로 비켜 선다
  await page.waitForTimeout(3500); // 떠오름·뒤집기 끝 (0.34초 × 10)
  const apex = await sim(
    page,
    (s, [tx, ty, head]) => {
      const t = s.match.towers().find((k) => k.tx === tx && k.ty === ty)!;
      const L = s.mapLayout;
      const sc = s.towerLayer.artScaleOf(t.id) ?? 1;
      const headTop = L.originY + (ty + 0.8) * L.tile - head * sc * L.tile;
      const fxw = (window as unknown as { fx: { minY: Record<string, number>; lastX: Record<string, number> } }).fx;
      return { sc, headTop, card: fxw.minY['summon-card']!, dx: Math.abs(fxw.lastX['summon-card']! - (L.originX + (tx + 0.5) * L.tile)) / L.tile };
    },
    [x, y, HEAD_ABOVE_FOOT] as [number, number, number],
  );
  expect(apex.sc).toBeGreaterThan(0.6); // V2.0 PR-A: 노말 칸의 59~65% = 배율 ≈0.64~0.71 (이웃과 무관)
  expect(apex.sc).toBeLessThan(0.75);
  // 위로: 카드 가운데가 머리 끝 위 / 옆으로: 카드 가운데가 머리 반폭(0.34칸 × 크기) + 카드 반폭(0.39칸)만큼 비킴
  if (apex.card >= apex.headTop) expect(apex.dx, JSON.stringify(apex)).toBeGreaterThan(0.34 * apex.sc + 0.3);
  else expect(apex.card, JSON.stringify(apex)).toBeLessThan(apex.headTop);
  await sim(page, (s) => {
    s.tweens.timeScale = 0.1;
    return null;
  });
  // 카드가 떠 있는 순간 스크린샷 (트윈 멈춤)
  const [x2, y2] = (await sim(page, (s) => s.match.map.buildable[14]!)) as [number, number];
  await tap(page, x2, y2);
  await expect.poll(() => sim(page, (s) => s.summonFxStats.active)).toBeGreaterThan(0);
  await page.waitForTimeout(3000); // 카드가 앞면으로 뒤집힌 뒤 (트윈 0.1배속)
  await sim(page, (s) => {
    (s.tweens as unknown as { pauseAll(): void }).pauseAll();
    return null;
  });
  await shot(page, 'B1-summon-fx');
  await sim(page, (s) => {
    (s.tweens as unknown as { resumeAll(): void }).resumeAll();
    return null;
  });
  // 승급: 같은 타워 셋 → 결과 칸 큰 카드도 뒤집히고 등급 별이 튀어 오른다
  const tri = await sim(page, (s) => {
    const used = new Set(s.match.towers().map((t) => `${t.tx},${t.ty}`));
    return s.match.map.buildable.filter(([a, b]) => !used.has(`${a},${b}`)).slice(0, 3);
  });
  await place(page, tri.map(([a, b]) => [a, b, 'goblin'] as [number, number, string]));
  await sim(page, (s, c) => s.match.world.enqueue({ type: 'merge', x: c[0], y: c[1] }), tri[0]!);
  await expect.poll(async () => (await fx()).faces['merge-card']?.join(',') ?? '', { message: '승급 카드가 뒷면 → 앞면' }).toBe('back,front');
  await expect.poll(() => sim(page, (s) => s.summonFxStats.stars), { message: '승급 등급 별' }).toBeGreaterThan(0);
  expect((await fx()).names).toEqual(expect.arrayContaining(['merge-material-orb', 'merge-portal', 'merge-star']));
  expect((await fx()).dieTex).toBe(0);
  expect(errors).toEqual([]);
});

for (const mode of ['effectsOff', 'reducedMotion'] as const) {
  test(`d. ${mode === 'effectsOff' ? '연출 끄기' : '동작 줄이기'}: 소환·승급에 초상 카드·소환문·별 없음`, async ({ page }) => {
    const errors = collectErrors(page);
    if (mode === 'reducedMotion') await page.emulateMedia({ reducedMotion: 'reduce' });
    await start(page, mode === 'effectsOff' ? '?dev=1&seed=42' : '?debug=1&seed=42', mode === 'effectsOff' ? { effectsOff: true } : {});
    await page.evaluate(() => {
      const w = window as unknown as { named: number; __rtd: { game: { scene: { getScene(k: string): unknown } } } };
      const s = w.__rtd.game.scene.getScene('Game') as { events: { on(e: string, f: () => void): void }; children: { list: { name: string }[] } };
      w.named = 0;
      s.events.on('postupdate', () => {
        for (const c of s.children.list) if (/^(summon|merge)-(card|portal|burst|silhouette|star)/.test(c.name)) w.named++;
      });
    });
    const [x, y] = (await sim(page, (s) => s.match.map.buildable[5]!)) as [number, number];
    await tap(page, x, y);
    await expect.poll(async () => (await towers(page)).length).toBe(1);
    const tri = await sim(page, (s) => s.match.map.buildable.slice(10, 13));
    await place(page, tri.map(([a, b]) => [a, b, 'goblin'] as [number, number, string]));
    await sim(page, (s, c) => s.match.world.enqueue({ type: 'merge', x: c[0], y: c[1] }), tri[0]!);
    await expect.poll(async () => (await towers(page)).length).toBe(2);
    await page.waitForTimeout(600);
    const st = await sim(page, (s) => s.summonFxStats);
    expect(st.shown).toBe(0);
    expect(st.portals + st.silhouettes + st.stars).toBe(0);
    expect(await page.evaluate(() => (window as unknown as { named: number }).named)).toBe(0);
    expect(errors).toEqual([]);
  });
}
