/**
 * T-2 E2E (play 갈래): 눌러서 바로 승급(설정 끄기 포함) · 빈 땅/[🎲 소환] 꾹 눌러 연속 소환 · 도박 두 테이블 동시·꾹 눌러 연속 ·
 * 판매(히어로 이상 두 번 누르기) · [↔ 이동] 이동·교환 · 개발자 [🛠 변환] · 🛠 개발자 도구(연출 끄기 → 피해 숫자 없음, 확률 ±·초기화,
 * 히든 조합 12종, 히든 미션 조건 보기) · 일반 주소에는 개발자 UI 없음. sim은 window.__rtd로 읽기만, 버튼·맵은 화면에서 누른다.
 * 맵 좌표에 기대지 않는다 (다른 갈래가 맵을 바꾸는 중): 칸은 sim의 배치 칸 목록에서 고른다.
 */
import { expect, test, type Page } from '@playwright/test';
import { clickStart } from './title';
import { mkdirSync } from 'node:fs';

const SAVE_DOCS = process.env.SAVE_SCREENS === '1';
test.describe.configure({ timeout: 150_000 });

type SceneLike = {
  match: {
    tick: number;
    state: { gold: number; gambles: number; chanceOv?: Record<string, number>; debugUsed: boolean; stage: number; kills: number; missionStatus: number[] };
    map: { buildable: [number, number][]; width: number; height: number; kinds: string[] };
    towers(): { id: number; tx: number; ty: number; tower: string }[];
    rules: { towerOrder: string[]; towers: Map<string, { grade: string }> };
    world: { enqueue(c: unknown): { ok: boolean } };
  };
  mapLayout: { originX: number; originY: number; tile: number };
  panelOpen: boolean;
  sheetOpen: string | null;
  moveModeOn: boolean;
  groundAutoSummon: boolean;
  convertPickerOpen: boolean;
  floatingLabels: string[];
  selectedTowerId: number | null;
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

async function start(page: Page, query = '?dev=1&seed=42'): Promise<void> {
  await page.goto(`/${query}`);
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
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

const towerCount = (page: Page): Promise<number> => inScene(page, (s) => s.match.towers().length, null);

/**
 * 서로 탭이 헷갈리지 않는 배치 칸 n개 (위아래로 붙지 않게 — 아래 타워 머리가 위 칸을 덮는다). 맵 좌표에 기대지 않는다.
 */
async function freeCells(page: Page, n: number): Promise<[number, number][]> {
  return inScene(
    page,
    (s, count) => {
      const taken = new Set(s.match.towers().map((t) => `${t.tx},${t.ty}`));
      const out: [number, number][] = [];
      for (const [x, y] of s.match.map.buildable) {
        if (out.length >= count) break;
        if (taken.has(`${x},${y}`) || taken.has(`${x},${y + 1}`) || taken.has(`${x},${y - 1}`)) continue;
        if (out.some(([ox, oy]) => Math.abs(ox - x) <= 1 && Math.abs(oy - y) <= 1)) continue;
        out.push([x, y]);
      }
      return out;
    },
    n,
  );
}

/** 개발용 명령으로 타워 놓기 [x, y, 타워 id] (돈 없이). */
async function place(page: Page, list: [number, number, string][]): Promise<void> {
  await inScene(
    page,
    (s, l) => {
      for (const [x, y, id] of l) s.match.world.enqueue({ type: 'debugTower', x, y, t: s.match.rules.towerOrder.indexOf(id) });
      s.debugFastForward(1);
      return null;
    },
    list,
  );
}

async function idsOfGrade(page: Page, grade: string): Promise<string[]> {
  return inScene(page, (s, g) => s.match.rules.towerOrder.filter((id) => s.match.rules.towers.get(id)?.grade === g), grade);
}

/** 칸 가운데 (화면 px). */
async function tilePoint(page: Page, tx: number, ty: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([x, y]) => {
      const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game') as {
        mapLayout: { originX: number; originY: number; tile: number };
      };
      const L = s.mapLayout;
      const r = document.getElementById('stage')!.getBoundingClientRect();
      const k = r.width / 1080;
      return { x: r.left + (L.originX + (x + 0.5) * L.tile) * k, y: r.top + (L.originY + (y + 0.5) * L.tile) * k };
    },
    [tx, ty] as const,
  );
}

async function tapTile(page: Page, tx: number, ty: number): Promise<void> {
  const p = await tilePoint(page, tx, ty);
  await page.touchscreen.tap(p.x, p.y);
  await page.waitForTimeout(200);
}

async function addGold(page: Page, amount: number): Promise<void> {
  await inScene(
    page,
    (s, a) => {
      s.match.world.enqueue({ type: 'debugAddGold', amount: a });
      s.debugFastForward(1);
      return null;
    },
    amount,
  );
}

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync('test-results/screens', { recursive: true });
  await page.screenshot({ path: `test-results/screens/${name}.png`, animations: 'disabled' });
  if (SAVE_DOCS) await page.screenshot({ path: `docs/screens/${name}.png`, animations: 'disabled' });
}

test('눌러서 바로 승급: 승급 가능한 타워를 누르면 패널 없이 그 칸에서 승급, 못 하면 패널, 설정을 끄면 패널', async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('rtd.settings', JSON.stringify({ v: 2, tapMerge: true }))); // 피드백 #17: 바로 승급은 이제 기본 꺼짐 — 이 테스트는 켠 플레이어
  await start(page);
  const normals = await idsOfGrade(page, 'normal');
  const cells = await freeCells(page, 4);
  const [a, b, c, d] = cells as [[number, number], [number, number], [number, number], [number, number]];
  // G-1 칸 무더기: 같은 타워 3개가 한 칸(b)에 쌓여야 승급한다 (사용자 결정 — 예전엔 아무 칸이나 3개)
  void a;
  void c;
  await place(page, [
    [b[0], b[1], normals[0]!],
    [b[0], b[1], normals[0]!],
    [b[0], b[1], normals[0]!],
    [d[0], d[1], normals[1]!],
  ]);
  // 승급할 수 없는 타워(같은 종류 1개) → 패널
  await tapTile(page, d[0], d[1]);
  await expect.poll(() => inScene(page, (s) => s.panelOpen, null)).toBe(true);
  await page.locator('[data-action="panel-close"]').click();
  // 승급 가능한 칸(3개) → 패널 없이 승급, 결과는 누른 칸 (레어)
  await tapTile(page, b[0], b[1]);
  await expect.poll(() => towerCount(page)).toBe(2);
  const atB = await inScene(page, (s, p) => s.match.towers().find((t) => t.tx === p[0] && t.ty === p[1])?.tower ?? null, b);
  expect(atB).not.toBeNull();
  expect(await inScene(page, (s, id) => s.match.rules.towers.get(id)?.grade, atB!)).not.toBe('normal');
  expect(await inScene(page, (s) => s.panelOpen, null)).toBe(false);
  // 설정 끄기 (일시정지 메뉴) → 승급 가능한 타워를 누르면 패널
  await place(page, [
    [a[0], a[1], normals[2]!],
    [a[0], a[1], normals[2]!],
    [a[0], a[1], normals[2]!],
  ]);
  await page.getByRole('button', { name: '일시정지' }).click();
  const sw = page.getByTestId('pause-tap-merge');
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('button', { name: '계속' }).click();
  const before = await towerCount(page);
  await tapTile(page, a[0], a[1]);
  await expect.poll(() => inScene(page, (s) => s.panelOpen, null)).toBe(true);
  expect(await towerCount(page)).toBe(before);
  await expect(page.locator('[data-action="merge"]')).toBeEnabled();
  // 저장됨: 새로 고쳐도 꺼져 있다
  expect(await page.evaluate(() => localStorage.getItem('rtd.settings'))).toContain('"tapMerge":false');
  expect(errors).toEqual([]);
});

test('꾹 눌러 연속 소환: 빈 땅을 누르고 있으면 타워가 계속 늘고 떼면 멈춘다, [🎲 소환]은 짧게 = 1개 · 꾹 = 계속', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  await addGold(page, 100_000);
  const [cell] = await freeCells(page, 1);
  const p = await tilePoint(page, cell![0], cell![1]);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await expect.poll(() => inScene(page, (s) => s.groundAutoSummon, null), { timeout: 5000 }).toBe(true);
  await expect.poll(() => towerCount(page), { timeout: 8000 }).toBeGreaterThanOrEqual(4);
  await page.mouse.up();
  await page.waitForTimeout(300);
  const after = await towerCount(page);
  await page.waitForTimeout(1200);
  expect(await towerCount(page)).toBe(after);
  // 누른 칸에는 처음 한 개가 들어갔다
  expect(await inScene(page, (s, c) => s.match.towers().some((t) => t.tx === c[0] && t.ty === c[1]), cell!)).toBe(true);
  // [🎲 소환] 짧게 → 정확히 1개
  const btn = page.getByTestId('hud-summon');
  await expect(btn).toContainText('원'); // V2.0 PR-A: 비용은 소환 횟수에 따라 오른다
  const n0 = await towerCount(page);
  await btn.click();
  await expect.poll(() => towerCount(page)).toBe(n0 + 1);
  await page.waitForTimeout(700);
  expect(await towerCount(page)).toBe(n0 + 1);
  // 꾹 → 계속, 떼면 멈춤
  const bb = (await btn.boundingBox())!;
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.mouse.down();
  await expect.poll(() => towerCount(page), { timeout: 8000 }).toBeGreaterThanOrEqual(n0 + 4);
  await page.mouse.up();
  await page.waitForTimeout(300);
  const n1 = await towerCount(page);
  await page.waitForTimeout(1000);
  expect(await towerCount(page)).toBe(n1);
  expect(errors).toEqual([]);
});

test('도박: 10원·100원 두 테이블이 동시에 돈다, 꾹 누르면 계속(자동 표시)·떼면 멈춤', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  await addGold(page, 100_000);
  // G-1: 돈 도박은 [🎰 도박] 시트의 '💰 돈 도박' 탭 (예전 강화 시트의 도박 탭에서 떼어 냄)
  await page.getByTestId('menu-gamble').click();
  await page.getByTestId('sheet-tab-money').click();
  // 두 버튼을 거의 동시에 누른다 (헤드리스는 프레임이 느려 click 두 번 사이에 릴 1초가 지나기도 한다)
  await page.evaluate(() => {
    for (const cost of [10, 100]) {
      const b = document.querySelector<HTMLElement>(`[data-testid="gamble-table-${cost}"]`)!;
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'touch' }));
      b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerType: 'touch' }));
    }
  });
  // 두 릴이 함께 돈다 (전역 잠금 없음)
  await expect(page.getByTestId('gamble-reel-10')).toHaveClass(/is-spin/);
  await expect(page.getByTestId('gamble-reel-100')).toHaveClass(/is-spin/);
  await expect.poll(() => inScene(page, (s) => s.match.state.gambles, null)).toBe(2);
  // 두 번째 테이블은 첫 테이블 릴이 도는 중에 시작했다
  const starts = await page.evaluate(() => {
    const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): { slots: Map<number, { startMs: number }> } } } } }).__rtd.game.scene.getScene('Game');
    return [s.slots.get(0)!.startMs, s.slots.get(1)!.startMs];
  });
  expect(Math.abs(starts[1]! - starts[0]!)).toBeLessThan(1000);
  await expect(page.getByTestId('gamble-reel-10')).not.toHaveClass(/is-spin/, { timeout: 5000 });
  await expect(page.getByTestId('gamble-reel-100')).not.toHaveClass(/is-spin/, { timeout: 5000 });
  // 결과 글자 '×2 → +20원 (+10)' · '×0 … 꽝! (−10원)' — 두 테이블 모두 결과가 따로 남는다
  await expect(page.getByTestId('gamble-result-10')).toContainText('원');
  await expect(page.getByTestId('gamble-result-100')).toContainText('원');
  // 꾹 누르기: 릴이 멈출 때마다 다음 판 → 횟수가 오른다, 자동 표시
  const g0 = await inScene(page, (s) => s.match.state.gambles, null);
  const b = (await page.getByTestId('gamble-table-10').boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await expect(page.getByTestId('gamble-auto-10')).toBeVisible({ timeout: 3000 });
  await expect.poll(() => inScene(page, (s) => s.match.state.gambles, null), { timeout: 10_000 }).toBeGreaterThanOrEqual(g0 + 3);
  await page.mouse.up();
  await expect(page.getByTestId('gamble-auto-10')).toBeHidden();
  await page.waitForTimeout(400);
  const g1 = await inScene(page, (s) => s.match.state.gambles, null);
  await page.waitForTimeout(1600);
  expect(await inScene(page, (s) => s.match.state.gambles, null)).toBe(g1);
  // 스크린샷: 두 테이블을 함께 꾹 누른 채 (둘 다 자동 · 릴이 도는 중)
  const press = (type: 'pointerdown' | 'pointerup'): Promise<void> =>
    page.evaluate((t) => {
      for (const cost of [10, 100]) {
        document.querySelector<HTMLElement>(`[data-testid="gamble-table-${cost}"]`)!.dispatchEvent(new PointerEvent(t, { bubbles: true, button: 0, pointerType: 'touch' }));
      }
    }, type);
  await press('pointerdown');
  await expect(page.getByTestId('gamble-auto-10')).toBeVisible({ timeout: 3000 });
  await expect(page.getByTestId('gamble-auto-100')).toBeVisible({ timeout: 3000 });
  await expect(page.getByTestId('gamble-reel-10')).toHaveClass(/is-spin/);
  await expect(page.getByTestId('gamble-reel-100')).toHaveClass(/is-spin/);
  await shot(page, 'T2-play-gamble');
  await press('pointerup');
  await expect(page.getByTestId('gamble-auto-100')).toBeHidden();
  expect(errors).toEqual([]);
});

test('판매: 노말은 한 번에 +15원, 히어로는 한 번 더 눌러야 +405원 (V2.0 PR-A 판매가) · 알림 · 칸이 빈다', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  const [n, h] = await freeCells(page, 2);
  const normal = (await idsOfGrade(page, 'normal'))[0]!;
  const hero = (await idsOfGrade(page, 'hero'))[0]!;
  await place(page, [
    [n![0], n![1], normal],
    [h![0], h![1], hero],
  ]);
  await tapTile(page, n![0], n![1]);
  await expect.poll(() => inScene(page, (s) => s.panelOpen, null)).toBe(true);
  const sell = page.getByTestId('tp-sell');
  await expect(sell).toHaveText('💰 판매 +15원');
  const gold = await inScene(page, (s) => s.match.state.gold, null);
  await sell.click();
  await expect.poll(() => inScene(page, (s) => s.match.towers().length, null)).toBe(1);
  expect(await inScene(page, (s) => s.match.state.gold, null)).toBe(gold + 15);
  await expect(page.locator('.toast', { hasText: '판매 +15원' })).toBeVisible();
  // 히어로: 첫 누름은 확인
  await tapTile(page, h![0], h![1]);
  await expect.poll(() => inScene(page, (s) => s.panelOpen, null)).toBe(true);
  await expect(sell).toHaveText('💰 판매 +405원');
  // 첫 누름 → '한 번 더 누르면 판매' · 아직 팔리지 않음 → 0.3초 뒤 한 번 더 (사람의 두 번 누르기처럼 한 번의 evaluate 안에서:
  // 헤드리스는 소프트웨어 WebGL이라 다른 작업이 함께 돌면 Playwright 왕복마다 1초 넘게 걸려 2초 창을 넘기곤 했다)
  const first = await sell.evaluate(async (el) => {
    const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): { match: { towers(): unknown[] } } } } } }).__rtd.game.scene.getScene('Game');
    (el as HTMLButtonElement).click();
    const label = el.textContent;
    const count = s.match.towers().length;
    await new Promise((r) => setTimeout(r, 300));
    const labelLater = el.textContent;
    (el as HTMLButtonElement).click();
    return { label, count, labelLater };
  });
  expect(first).toEqual({ label: '한 번 더 누르면 판매', count: 1, labelLater: '한 번 더 누르면 판매' });
  await expect.poll(() => towerCount(page)).toBe(0);
  expect(await inScene(page, (s) => s.match.state.gold, null)).toBe(gold + 15 + 405);
  expect(errors).toEqual([]);
});

test('[↔ 이동]: 빈 칸을 누르면 이동, 내 다른 타워를 누르면 교환, 같은 타워를 누르면 취소', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  const [a, b, empty] = await freeCells(page, 3);
  const [n0, n1] = await idsOfGrade(page, 'normal');
  await place(page, [
    [a![0], a![1], n0!],
    [b![0], b![1], n1!],
  ]);
  const idA = await inScene(page, (s, p) => s.match.towers().find((t) => t.tx === p[0] && t.ty === p[1])!.id, a!);
  // 이동
  await tapTile(page, a![0], a![1]);
  await expect.poll(() => inScene(page, (s) => s.panelOpen, null)).toBe(true);
  await page.locator('[data-action="move"]').click();
  await expect.poll(() => inScene(page, (s) => s.moveModeOn, null)).toBe(true);
  await expect(page.locator('.toast', { hasText: '옮길 칸을 누르세요' })).toBeVisible();
  // 피드백 #7: 안내가 꾹 눌러 끌기도 알려 주고, HUD 아래 알림 한 줄 자리를 넘지 않는다
  const hint = await page.evaluate(() => {
    const el = [...document.querySelectorAll<HTMLElement>('.toast')].find((t) => t.textContent?.includes('꾹 눌러 끌어도'));
    const probe = document.querySelector<HTMLElement>('.toast-probe');
    return el && probe ? { h: el.offsetHeight, oneLine: probe.offsetHeight } : null;
  });
  expect(hint).not.toBeNull();
  expect(hint!.h).toBeLessThanOrEqual(hint!.oneLine + 1);
  await tapTile(page, empty![0], empty![1]);
  await expect.poll(() => inScene(page, (s, id) => { const t = s.match.towers().find((x) => x.id === id)!; return [t.tx, t.ty]; }, idA)).toEqual(empty);
  // 교환
  await page.waitForTimeout(400);
  await tapTile(page, empty![0], empty![1]);
  await expect.poll(() => inScene(page, (s) => s.panelOpen, null)).toBe(true);
  await page.locator('[data-action="move"]').click();
  await tapTile(page, b![0], b![1]);
  await expect.poll(() => inScene(page, (s, id) => { const t = s.match.towers().find((x) => x.id === id)!; return [t.tx, t.ty]; }, idA)).toEqual(b);
  const atEmpty = await inScene(page, (s, p) => s.match.towers().find((t) => t.tx === p[0] && t.ty === p[1])?.tower ?? null, empty!);
  expect(atEmpty).toBe(n1);
  // 같은 타워 → 취소 (그대로)
  await page.waitForTimeout(400);
  await tapTile(page, b![0], b![1]);
  await page.locator('[data-action="move"]').click();
  await tapTile(page, b![0], b![1]);
  await expect(page.locator('.toast', { hasText: '이동을 취소했어요' })).toBeVisible();
  expect(await inScene(page, (s) => s.moveModeOn, null)).toBe(false);
  expect(errors).toEqual([]);
});

test('개발자 [🛠 변환]: 같은 등급 다른 타워 고르기 창(초상화·이름) → 그 자리에서 바뀜', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  const [c] = await freeCells(page, 1);
  const legends = await idsOfGrade(page, 'legend');
  await place(page, [[c![0], c![1], legends[0]!]]);
  await tapTile(page, c![0], c![1]);
  await expect.poll(() => inScene(page, (s) => s.panelOpen, null)).toBe(true);
  await shot(page, 'T2-play-panel-dev');
  await page.locator('[data-action="convert"]').click();
  const picker = page.getByTestId('convert-picker');
  await expect(picker).toBeVisible();
  await expect(picker.locator('.cv-item')).toHaveCount(legends.length - 1);
  await expect(picker.locator('img.cv-pic').first()).toBeVisible();
  await shot(page, 'T2-play-convert');
  await page.getByTestId(`convert-item-${legends[1]}`).click();
  await expect(picker).toHaveCount(0);
  await expect.poll(() => inScene(page, (s, p) => s.match.towers().find((t) => t.tx === p[0] && t.ty === p[1])?.tower, c!)).toBe(legends[1]);
  expect(await inScene(page, (s) => s.match.state.debugUsed, null)).toBe(true);
  expect(errors).toEqual([]);
});

test('🛠 개발자 도구: 연출 끄기(피해 숫자 없음·저장), 확률 ±0.1%p·초기화, 히든 조합 12종, 히든 미션 조건 보기', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  // 확률 조정
  await page.getByTestId('menu-dev').click();
  await expect.poll(() => inScene(page, (s) => s.sheetOpen, null)).toBe('dev');
  await page.getByTestId('sheet-tab-chance').click();
  const godValue = page.getByTestId('dev-chance-value-god');
  await expect(godValue).toHaveText('0.01%');
  await page.getByTestId('dev-chance-up-god').click();
  await expect(godValue).toHaveText('0.1%');
  await page.getByTestId('dev-chance-up-god').click();
  await expect(godValue).toHaveText('0.2%');
  await page.getByTestId('dev-chance-down-god').click();
  await expect(godValue).toHaveText('0.1%');
  expect(await inScene(page, (s) => s.match.state.chanceOv?.god, null)).toBe(10);
  const line = page.getByTestId('dev-gamble-line');
  const line0 = await line.textContent();
  await page.getByTestId('dev-chance-up-gamble:5').click();
  await expect(page.getByTestId('dev-chance-value-gamble:5')).toHaveText('8.1%'); // 피드백 #59: ×5 기본 8% (+0.1%p)
  await expect(line).not.toHaveText(line0 ?? '');
  await expect(line).toContainText('×0 34.9%'); // 피드백 #59: ×0 기본 35%
  await shot(page, 'T2-play-devtools-chance');
  await page.getByTestId('dev-chance-reset').click();
  await expect(godValue).toHaveText('0.01%');
  await expect.poll(() => inScene(page, (s) => s.match.state.chanceOv === undefined, null)).toBe(true);
  // 히든 조합 12종
  await page.getByTestId('sheet-tab-recipes').click();
  await expect(page.locator('[data-testid^="dev-recipe-"]:not([data-testid^="dev-recipe-mat-"])')).toHaveCount(12);
  await shot(page, 'T2-play-devtools-recipes');
  // 히든 미션 조건 보기
  await page.getByTestId('sheet-tab-fx').click();
  await page.getByTestId('dev-reveal-hidden').click();
  await expect(page.getByTestId('dev-reveal-hidden')).toHaveAttribute('aria-checked', 'true');
  // G-1: [📋]는 맵 오른쪽 둥근 버튼이라 열린 시트가 덮는다 → 개발자 시트를 닫고 연다
  await page.getByTestId('sheet-close').click();
  await page.getByTestId('menu-mission').click();
  await page.getByTestId('sheet-tab-hidden').click();
  await expect(page.locator('[data-pane="hidden"]')).not.toContainText('???');
  // 연출 끄기: 타워를 놓고 몹을 불러 피해 숫자가 뜨는 것을 본 뒤 끈다
  await page.getByTestId('sheet-close').click();
  const cells = await freeCells(page, 6);
  const legends = await idsOfGrade(page, 'legend');
  await place(page, cells.map(([x, y], i) => [x, y, legends[i % legends.length]!] as [number, number, string]));
  await inScene(
    page,
    (s) => {
      s.match.world.enqueue({ type: 'debugSkipStage' });
      s.debugFastForward(1);
      return null;
    },
    null,
  );
  await expect.poll(() => inScene(page, (s) => s.floatingLabels.length, null), { timeout: 30_000 }).toBeGreaterThan(0);
  await page.getByTestId('menu-dev').click();
  await page.getByTestId('sheet-tab-fx').click();
  await page.getByTestId('dev-effects-off').click();
  await expect(page.getByTestId('dev-effects-off')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#ui-root')).toHaveClass(/fx-off/);
  await shot(page, 'T2-play-devtools');
  await page.getByTestId('sheet-close').click();
  await page.waitForTimeout(1500);
  const kills0 = await inScene(page, (s) => s.match.state.kills, null);
  for (let i = 0; i < 6; i++) {
    expect(await inScene(page, (s) => s.floatingLabels.length, null)).toBe(0);
    await page.waitForTimeout(400);
  }
  await expect.poll(() => inScene(page, (s) => s.match.state.kills, null), { timeout: 20_000 }).toBeGreaterThan(kills0);
  expect(await inScene(page, (s) => s.floatingLabels.length, null)).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem('rtd.settings'))).toContain('"effectsOff":true');
  // 다시 켜면 숫자가 돌아온다
  await page.getByTestId('menu-dev').click();
  await page.getByTestId('dev-effects-off').click();
  await page.getByTestId('sheet-close').click();
  await expect(page.locator('#ui-root')).not.toHaveClass(/fx-off/);
  await expect.poll(() => inScene(page, (s) => s.floatingLabels.length, null), { timeout: 30_000 }).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('일반 주소: 개발자 UI 없음 ([🛠 개발]·[🛠 변환]·⏭), 판매·이동·[🎲 소환]은 있음, 저장된 연출 끄기도 쓰지 않음', async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('rtd.settings', JSON.stringify({ v: 2, tapMerge: true, effectsOff: true, revealHidden: true })));
  await start(page, '?seed=42');
  await expect(page.getByTestId('menu-dev')).toHaveCount(0);
  await expect(page.locator('[data-action="skip-stage"]')).toHaveCount(0);
  await expect(page.locator('#ui-root')).not.toHaveClass(/fx-off/);
  await expect(page.getByTestId('hud-summon')).toBeVisible();
  // 타워 하나 소환 → 패널: 이동·판매는 있고 변환은 없다
  await page.getByTestId('hud-summon').click();
  await expect.poll(() => towerCount(page)).toBe(1);
  const t = await inScene(page, (s) => { const x = s.match.towers()[0]!; return [x.tx, x.ty] as [number, number]; }, null);
  await tapTile(page, t[0], t[1]);
  await expect.poll(() => inScene(page, (s) => s.panelOpen, null)).toBe(true);
  await expect(page.locator('[data-action="move"]')).toBeVisible();
  await expect(page.getByTestId('tp-sell')).toHaveText('💰 판매 +50원');
  await expect(page.locator('[data-action="convert"]')).toHaveCount(0);
  await shot(page, 'T2-play-panel');
  // 패널 버튼(승급·이동·판매)이 412px 안에 들어간다 — 접기 2단계부터는 두 줄이 한 줄로 합쳐져 줄 상자(.tp-actions-2)가 없다(display: contents)
  //   (HF-3: 캐릭터 설명 두 줄이 생겨 패널이 길어졌으므로 맵 가운데 칸 타워는 합친 한 줄일 수 있다 → 버튼마다 잰다)
  for (const sel of ['[data-action="merge"]', '[data-action="merge-all"]', '[data-action="move"]', '[data-testid="tp-sell"]']) {
    const r = await page.locator(sel).boundingBox();
    expect(r, sel).not.toBeNull();
    expect(r!.x + r!.width, sel).toBeLessThanOrEqual(412);
    expect(r!.height, sel).toBeGreaterThanOrEqual(44);
  }
  // 피드백 #30: 판매는 머리 줄(초상·이름 줄) 안 작은 칩 — 승급·이동 버튼보다 위, [↔ 이동]보다 좁고, 승급 버튼 줄에는 없다
  await expect(page.locator('.tp-head [data-testid="tp-sell"]')).toBeVisible();
  await expect(page.locator('.tp-act-wrap [data-testid="tp-sell"]')).toHaveCount(0);
  // v0.1.14 통합: 화면 전체에 판매 버튼은 이 하나뿐 (FB-D1 #30 머리 줄 — PR #51 칸 위 [✕ 판매]는 뺐다)
  await expect(page.locator('[data-action="sell"]:visible, [data-testid="tq-sell"]')).toHaveCount(1);
  const sellBox = (await page.getByTestId('tp-sell').boundingBox())!;
  const mergeBox = (await page.locator('[data-action="merge"]').boundingBox())!;
  const closeBox = (await page.locator('[data-action="panel-close"]').boundingBox())!;
  expect(sellBox.y + sellBox.height).toBeLessThanOrEqual(mergeBox.y);
  expect(sellBox.width).toBeLessThan(mergeBox.width);
  expect(sellBox.x + sellBox.width).toBeLessThanOrEqual(closeBox.x);
  expect(await page.getByTestId('tp-sell').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  // 히든 미션은 ??? 그대로 (저장값이 있어도 개발자 모드가 아니면 쓰지 않음)
  await page.locator('[data-action="panel-close"]').click();
  await page.getByTestId('menu-mission').click();
  await page.getByTestId('sheet-tab-hidden').click();
  await expect(page.locator('[data-pane="hidden"]')).toContainText('???');
  expect(errors).toEqual([]);
});

test('아래 자원 줄 (G-1): [👷]·[⬆ 승급 가능]·[👷 고용]·접은 카드 알약이 함께 보여도 412·360·320px에서 한 줄 안에 (넘침 없음 · 💰 돈·🗼 인원은 피드백 #25로 위 HUD — e2e/fb25)', async ({ page }) => {
  for (const w of [412, 360, 320]) {
    await page.setViewportSize({ width: w, height: 915 });
    await start(page, '?seed=42');
    // 가장 긴 글자를 넣어 본다 (배치 칸 96칸 맵의 '96/96', 승급 묶음 두 자리)
    const bad = await page.evaluate(() => {
      const band = document.querySelector('.hud-bottom') as HTMLElement;
      const check = (label: string): string[] => {
        const br = band.getBoundingClientRect();
        const els = [...band.querySelectorAll('.hud-bottom > *, .hud-choice-slot > *')] as HTMLElement[];
        return els
          .filter((e) => e.offsetParent !== null && getComputedStyle(e).display !== 'contents')
          .filter((e) => e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().right > br.right + 0.5)
          .map((e) => `${label}: ${e.className}`)
          .concat(band.scrollWidth > band.clientWidth ? [`${label}: band`] : []);
      };
      (document.querySelector('[data-testid=hud-towers]') as HTMLElement).textContent = '96/96';
      (document.querySelector('[data-testid=hud-gold]') as HTMLElement).textContent = '9.9억원';
      const out = check('base');
      // 피드백 #65: 아래 띠에 [⬆ 승급 가능 n]이 없다 (승급은 맵 오른쪽 위 [⏫ 모두 승급])
      if (band.querySelector('.hud-merge-ready')) out.push('merge-ready still in band');
      const slot = document.querySelector('.hud-choice-slot') as HTMLElement;
      slot.innerHTML = '<button class="btn btn-chip cp-pill is-card"><span class="cp-pill-icon">🃏</span><span class="cp-pill-text">카드 고르기</span></button>';
      out.push(...check('pill'));
      return out;
    });
    expect(bad, `${w}px`).toEqual([]);
  }
});
