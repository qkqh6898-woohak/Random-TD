/**
 * M3a E2E: 타워 탭 → 정보 패널(스탯·보유 n/3·승급 버튼) → 승급(3개 → 1개, 결과 = 터치한 칸, 다음 등급) / 모두 승급 /
 * '⬆ 승급 가능 n' 버튼 / 길게 눌러 끌기 → 이동·교환 / 패널 닫기 / M3a 스크린샷.
 * sim 상태는 개발 서버의 window.__rtd 로 읽는다 (화면은 읽기만). 판 준비(소환)는 명령으로 보낸다.
 */
import { expect, test, type Page } from '@playwright/test';
import { clickStart } from './title';
import { mkdirSync } from 'node:fs';

// T-2: 이 파일은 정보 패널 [⬆ 승급] 흐름을 본다 → '눌러서 바로 승급'(기본 켜짐)을 끄고 시작 (켜진 동작은 e2e/t2.spec.ts)
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('rtd.settings')) localStorage.setItem('rtd.settings', JSON.stringify({ v: 1, tapMerge: false }));
  });
});


const SAVE_DOCS = process.env.SAVE_SCREENS === '1';

interface TowerLite {
  id: number;
  tx: number;
  ty: number;
  tower: string;
}

type SceneLike = {
  match: {
    tick: number;
    state: { stage: number; gold: number; merges: number; moves: number };
    towers(): (TowerLite & { held: boolean; attacks: number })[];
    rules: { towers: Map<string, { grade: string }> };
    map: { buildable: [number, number][]; height: number };
    world: { enqueue(c: unknown): { ok: boolean } };
  };
  mapLayout: { originX: number; originY: number; tile: number };
  mergeEffects: number;
  selectedTowerId: number | null;
  dragState: { id: number; drop: { tx: number; ty: number; preview: string } | null } | null;
  /** 배치 칸 강조 진하기 (끄는 중 1; B-1부터 소환 바닥 자체는 늘 보임) */
  buildHint: number;
  renderedTowerCount: number;
  draggingTowerCount: number;
  towerFootPx(id: number): { x: number; y: number } | null;
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

async function start(page: Page, query = '?debug=1&seed=42'): Promise<void> {
  await page.goto(`/${query}`);
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
}

/** Game 장면에서 함수 실행. */
async function inScene<T, A>(page: Page, fn: (s: SceneLike, arg: A) => T, arg: A): Promise<T> {
  return page.evaluate(
    ([src, a]) => {
      const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game');
      return new Function('s', 'a', `return (${src})(s, a);`)(s, a) as T;
    },
    [fn.toString(), arg] as const,
  );
}

async function towers(page: Page): Promise<TowerLite[]> {
  return inScene(page, (s) => s.match.towers().map((t) => ({ id: t.id, tx: t.tx, ty: t.ty, tower: t.tower })), null);
}

/** 칸 (tx, ty) 가운데의 페이지 좌표 (dy = 칸 단위로 위아래 이동). */
async function tilePoint(page: Page, tx: number, ty: number, dy = 0): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([x, y, d]) => {
      const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game') as {
        mapLayout: { originX: number; originY: number; tile: number };
      };
      const L = s.mapLayout;
      const r = document.getElementById('stage')!.getBoundingClientRect();
      const k = r.width / 1080;
      return { x: r.left + (L.originX + (x + 0.5) * L.tile) * k, y: r.top + (L.originY + (y + 0.5 + d) * L.tile) * k };
    },
    [tx, ty, dy] as const,
  );
}

async function tapTile(page: Page, tx: number, ty: number): Promise<void> {
  const p = await tilePoint(page, tx, ty);
  await page.touchscreen.tap(p.x, p.y);
  await page.waitForTimeout(150);
}

/** 개발용 돈 + 칸 목록에 소환 명령 (한 틱에 모두 실행). */
async function summonMany(page: Page, cells: readonly (readonly [number, number])[]): Promise<void> {
  await inScene(
    page,
    (s, list) => {
      s.match.world.enqueue({ type: 'debugAddGold', amount: 100_000 });
      for (const [x, y] of list) s.match.world.enqueue({ type: 'summon', x, y });
      s.debugFastForward(1);
      return null;
    },
    cells,
  );
  await expect.poll(async () => (await towers(page)).length).toBe(cells.length);
}

/** G-1: [🎲 소환]과 같은 무더기 소환 명령 n번 (한 틱에 하나씩). */
async function autoSummonMany(page: Page, n: number): Promise<void> {
  await inScene(
    page,
    (s, k) => {
      s.match.world.enqueue({ type: 'debugAddGold', amount: 100_000 });
      // 인원 한도(20)를 넘겨 소환해 볼 수 있게 (카드 '부대 확장'과 같은 자리)
      (s.match.state as unknown as { unitCapBonus: number[] }).unitCapBonus[0] = 20;
      s.debugFastForward(1);
      for (let i = 0; i < k; i++) {
        s.match.world.enqueue({ type: 'summonAuto' });
        s.debugFastForward(1);
      }
      return null;
    },
    n,
  );
  await expect.poll(async () => (await towers(page)).length).toBe(n);
}

/** 칸마다 묶은 무더기 중 3개 찬 것 (바닥 ID 순). */
function fullStacks(list: TowerLite[]): TowerLite[][] {
  const by = new Map<string, TowerLite[]>();
  for (const t of list) by.set(`${t.tx},${t.ty}`, [...(by.get(`${t.tx},${t.ty}`) ?? []), t]);
  return [...by.values()].filter((l) => l.length >= 3).sort((a, b) => a[0]!.id - b[0]!.id);
}
function fullStack(list: TowerLite[]): TowerLite[] {
  return fullStacks(list)[0] ?? [];
}

/** 종류별로 묶어 가장 많은 종류. */
function biggestGroup(list: TowerLite[]): TowerLite[] {
  const by = new Map<string, TowerLite[]>();
  for (const t of list) by.set(t.tower, [...(by.get(t.tower) ?? []), t]);
  return [...by.values()].sort((a, b) => b.length - a.length || a[0]!.id - b[0]!.id)[0] ?? [];
}


async function shot(page: Page, name: string, docsName?: string): Promise<void> {
  mkdirSync('test-results/screens', { recursive: true });
  await page.screenshot({ path: `test-results/screens/${name}.png`, animations: 'disabled' });
  if (SAVE_DOCS && docsName) {
    mkdirSync('docs/screens', { recursive: true });
    await page.screenshot({ path: `docs/screens/${docsName}.png`, animations: 'disabled' });
  }
}

test('타워 탭 → 정보 패널: 이름·스탯·감지·보유 1/3, 승급 버튼 꺼짐 / ✕·빈 곳 탭으로 닫힘 (소환되지 않음)', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, '?seed=42');
  await tapTile(page, 2, 4); // G-1 순환의 정원 v4 배치 칸
  const [t] = await towers(page);
  expect(t).toBeDefined();
  await tapTile(page, t!.tx, t!.ty);
  const panel = page.getByTestId('tower-panel');
  await expect(panel).toBeVisible();
  const names: Record<string, string> = { miner: '광부', goblin: '고블린', archer: '궁수', apprentice: '견습 마법사', warrior: '전사' };
  await expect(page.getByTestId('tp-name')).toHaveText(names[t!.tower]!);
  await expect(page.getByTestId('tp-stars')).toHaveText('★');
  await expect(page.getByTestId('tp-sub')).toContainText('노말');
  await expect(page.getByTestId('tp-stats')).toContainText('공속');
  await expect(page.getByTestId('tp-stats')).toContainText('사거리');
  await expect(page.getByTestId('tp-detect')).toContainText('없음');
  await expect(page.getByTestId('tp-owned')).toHaveText('1/3');
  await expect(page.locator('[data-action="merge"]')).toBeDisabled();
  await expect(page.locator('[data-action="merge-all"]')).toBeDisabled();
  await expect(page.getByTestId('tp-note')).toContainText('3개가 한 칸에 모이면');
  await expect(page.getByTestId('tp-outcomes')).toContainText('상인');
  expect(await inScene(page, (s) => s.selectedTowerId, null)).toBe(t!.id);
  // 버튼 터치 영역 44px 이상
  const box = await page.locator('[data-action="merge"]').boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  // ✕로 닫기
  await page.locator('[data-action="panel-close"]').click();
  await expect(panel).toHaveCount(0);
  // 다시 열고 빈 배치 칸 탭 → 패널만 닫히고 소환되지 않는다
  await tapTile(page, t!.tx, t!.ty);
  await expect(panel).toBeVisible();
  const gold = await inScene(page, (s) => s.match.state.gold, null);
  await tapTile(page, 1, 2);
  await expect(panel).toHaveCount(0);
  expect((await towers(page)).length).toBe(1);
  expect(await inScene(page, (s) => s.match.state.gold, null)).toBe(gold);
  // 같은 타워를 두 번 누르면 열었다 닫힌다
  await tapTile(page, t!.tx, t!.ty);
  await expect(panel).toBeVisible();
  await tapTile(page, t!.tx, t!.ty);
  await expect(panel).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('승급 (G-1 칸 무더기): 같은 타워 3개가 쌓인 칸 → 패널 [⬆ 승급] → 레어 (그 칸 또는 같은 레어 무더기), 그 칸 3개가 사라짐, 패널이 결과를 따라감', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  // G-1 사용자 결정: 소환은 같은 캐릭터의 덜 찬 칸에 쌓이고, 3개가 쌓인 칸이 승급한다 (예전: 아무 칸의 같은 종류 3개)
  await autoSummonMany(page, 14);
  const before = await towers(page);
  const stack = fullStack(before);
  expect(stack.length).toBe(3); // 14개 / 5종 → 비둘기집
  const anchor = stack[0]!;
  await tapTile(page, anchor.tx, anchor.ty);
  await expect(page.getByTestId('tp-owned')).toHaveText('3/3');
  await expect(page.getByTestId('tp-name')).toContainText('×3');
  await expect(page.locator('[data-action="merge"]')).toBeEnabled();
  await expect(page.getByTestId('hud-merge-all')).toBeVisible();
  await page.locator('[data-action="merge"]').click();
  await expect.poll(async () => inScene(page, (s) => s.match.state.merges, null)).toBeGreaterThanOrEqual(1);
  const after = await towers(page);
  // 그 칸 3개는 모두 사라짐
  for (const t of stack) expect(after.some((a) => a.id === t.id)).toBe(false);
  const fresh = after.filter((t) => !before.some((b) => b.id === t.id));
  expect(fresh.length).toBeGreaterThanOrEqual(1);
  const result = fresh[0]!;
  expect(await inScene(page, (s, id) => s.match.rules.towers.get(s.match.towers().find((t) => t.id === id)!.tower)!.grade, result.id)).toBe('rare');
  await expect.poll(async () => inScene(page, (s) => s.mergeEffects, null)).toBeGreaterThanOrEqual(1);
  // 패널은 결과 타워를 보여준다 (★★)
  await expect(page.getByTestId('tp-stars')).toHaveText('★★');
  await expect.poll(async () => inScene(page, (s) => s.renderedTowerCount, null)).toBe(after.length);
  expect(errors).toEqual([]);
});

test('모두 승급 (G-1 연쇄): 가득 찬 칸이 여럿이면 한 번에 이어서 승급, 승급 버튼은 맵 오른쪽 위 [⏫ 모두 승급 n] 하나 (피드백 #65)', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  const layout0 = await inScene(page, (s) => ({ ...s.mapLayout }), null);
  await expect(page.getByTestId('hud-merge-all')).toBeHidden();
  await autoSummonMany(page, 30);
  const before = await towers(page);
  const fulls = fullStacks(before);
  expect(fulls.length).toBeGreaterThanOrEqual(2);
  const readyBtn = page.getByTestId('hud-merge-all');
  await expect(readyBtn).toBeVisible();
  await expect(page.locator('.hud-bottom button', { hasText: '승급' })).toHaveCount(0);
  await expect(page.locator('.toast', { hasText: '승급 가능' })).toHaveCount(1);
  await expect(page.getByTestId('hud-hint')).toHaveText('');
  const stageBox = (await page.locator('#stage').boundingBox())!;
  for (const id of ['hud-hire', 'hud-merge-all']) {
    const b = (await page.getByTestId(id).boundingBox())!;
    expect(b.x + b.width).toBeLessThanOrEqual(stageBox.x + stageBox.width + 0.5);
  }
  await page.waitForTimeout(200);
  expect(await inScene(page, (s) => ({ ...s.mapLayout }), null)).toEqual(layout0);
  await expect(readyBtn).toHaveText(`⏫ 모두 승급 ${fulls.length}`);
  // 한 번 누르면 패널 없이 가득 찬 무더기가 모두 승급
  await readyBtn.click();
  await expect.poll(async () => inScene(page, (s) => s.match.state.merges, null)).toBeGreaterThanOrEqual(fulls.length);
  await expect.poll(async () => fullStacks(await towers(page)).length).toBe(0);
  await expect(readyBtn).toBeHidden();
  const after = await towers(page);
  expect(after.length).toBe(before.length - 2 * (await inScene(page, (s) => s.match.state.merges, null)));
  expect(errors).toEqual([]);
});

test('길게 눌러 끌기: 빈 칸으로 이동(초록 미리 보기), 다른 타워 위에 놓으면 교환(파랑), 짧게 누르면 패널만 + 끄는 동안 배치 칸 보임 (T-3)', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  // 순환의 정원 v4 (G-1 마당 맵): 마당 윗줄 (1,2)·(4,2), 옮길 빈 칸 (2,2), 경로 칸 (0,2)
  await summonMany(page, [
    [1, 2],
    [4, 2],
  ]);
  const [a, b] = await towers(page);
  // 판 시작 때 잠깐 보인 배치 칸이 사라진 뒤 (평소에는 칸을 그리지 않는다)
  await expect.poll(async () => inScene(page, (s) => s.buildHint, null), { timeout: 5000 }).toBe(0);
  // 놓을 칸은 손가락이 움직인 만큼만 바뀐다 (그림만 0.45칸 들려 그려짐) → 칸 중심에서 목표 칸 중심으로 끌면 된다
  const from = await tilePoint(page, a!.tx, a!.ty);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.waitForTimeout(450); // 0.3초 넘게 누르기
  // 끄는 동안 그 타워는 공격하지 않는다 (hold 명령, GDD 4.5)
  await expect.poll(async () => inScene(page, (s, id) => s.match.towers().find((t) => t.id === id)!.held, a!.id)).toBe(true);
  const to = await tilePoint(page, 2, 2);
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await expect.poll(async () => inScene(page, (s) => s.dragState?.drop?.preview ?? null, null)).toBe('move');
  expect(await inScene(page, (s) => s.dragState?.drop, null)).toMatchObject({ tx: 2, ty: 2 });
  // 끄는 동안 배치 칸이 옅게 보인다 (T-3 타일 숨김)
  expect(await inScene(page, (s) => s.buildHint, null)).toBe(1);
  await shot(page, 'M3a-drag');
  await page.mouse.up();
  await expect.poll(async () => inScene(page, (s) => s.match.state.moves, null)).toBe(1);
  expect(await inScene(page, (s) => s.buildHint, null)).toBe(0);
  let list = await towers(page);
  expect(list.find((t) => t.id === a!.id)).toMatchObject({ tx: 2, ty: 2 });
  expect(await inScene(page, (s, id) => s.match.towers().find((t) => t.id === id)!.held, a!.id)).toBe(false);
  await expect(page.getByTestId('tower-panel')).toHaveCount(0);

  // 교환: a(2,2)를 b(4,2) 위로
  const from2 = await tilePoint(page, 2, 2);
  await page.mouse.move(from2.x, from2.y);
  await page.mouse.down();
  await page.waitForTimeout(450);
  const to2 = await tilePoint(page, b!.tx, b!.ty);
  await page.mouse.move(to2.x, to2.y, { steps: 6 });
  await expect.poll(async () => inScene(page, (s) => s.dragState?.drop?.preview ?? null, null)).toBe('swap');
  await page.mouse.up();
  await expect.poll(async () => inScene(page, (s) => s.match.state.moves, null)).toBe(2);
  list = await towers(page);
  expect(list.find((t) => t.id === a!.id)).toMatchObject({ tx: b!.tx, ty: b!.ty });
  expect(list.find((t) => t.id === b!.id)).toMatchObject({ tx: 2, ty: 2 });

  // 경로 칸 위에 놓으면 빨강 미리 보기 → 그대로
  const from3 = await tilePoint(page, 2, 2);
  await page.mouse.move(from3.x, from3.y);
  await page.mouse.down();
  await page.waitForTimeout(450);
  const to3 = await tilePoint(page, 0, 2);
  await page.mouse.move(to3.x, to3.y, { steps: 6 });
  await expect.poll(async () => inScene(page, (s) => s.dragState?.drop?.preview ?? null, null)).toBe('invalid');
  await page.mouse.up();
  await page.waitForTimeout(150);
  expect(await inScene(page, (s) => s.match.state.moves, null)).toBe(2);

  // HUD 버튼(DOM) 위에서 손을 떼도 끌기가 끝난다 (Phaser 'pointerupoutside'), 이동하지 않고 배속도 그대로
  const from4 = await tilePoint(page, 2, 2);
  await page.mouse.move(from4.x, from4.y);
  await page.mouse.down();
  await page.waitForTimeout(450);
  await expect.poll(async () => inScene(page, (s) => s.dragState !== null, null)).toBe(true);
  const speed = await page.locator('[data-action="speed"]').boundingBox();
  await page.mouse.move(speed!.x + speed!.width / 2, speed!.y + speed!.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => inScene(page, (s) => s.dragState, null)).toBeNull();
  expect(await inScene(page, (s) => s.match.state.moves, null)).toBe(2);
  await expect(page.locator('[data-action="speed"]')).toHaveText('×1');

  // 짧게 누르면(0.3초 전) 끌기 없이 패널
  await tapTile(page, 2, 2);
  await expect(page.getByTestId('tower-panel')).toBeVisible();
  expect(await inScene(page, (s) => s.dragState, null)).toBeNull();
  expect(await inScene(page, (s) => s.draggingTowerCount, null)).toBe(0);
  expect(errors).toEqual([]);
});

test('느린 탭: 캐릭터 얼굴·머리를 0.4초 누르고 움직이지 않고 떼면 제자리 (옮겨지거나 위 타워와 바뀌지 않음) + 정보 패널 (검토 반영)', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  await summonMany(page, [
    [2, 4],
    [2, 3],
  ]);
  const before = await towers(page);
  const lower = before.find((t) => t.ty === 4)!;
  // 칸 중심보다 0.25칸 위(얼굴), 0.6칸 위(머리 — 위 칸에 삐져나온 부분)
  for (const dy of [-0.25, -0.6]) {
    const p = await tilePoint(page, lower.tx, lower.ty, dy);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.waitForTimeout(420);
    await expect.poll(async () => inScene(page, (s) => s.dragState?.id ?? null, null)).toBe(lower.id);
    expect(await inScene(page, (s) => s.dragState?.drop?.preview ?? null, null)).toBe('none');
    await page.mouse.up();
    await page.waitForTimeout(200);
    expect(await inScene(page, (s) => s.match.state.moves, null)).toBe(0);
    expect(await towers(page)).toEqual(before);
    // 느린 탭 = 정보 패널
    await expect(page.getByTestId('tower-panel')).toBeVisible();
    expect(await inScene(page, (s) => s.selectedTowerId, null)).toBe(lower.id);
    await page.locator('[data-action="panel-close"]').click();
    await expect(page.getByTestId('tower-panel')).toHaveCount(0);
  }
  expect(await inScene(page, (s, id) => s.match.towers().find((t) => t.id === id)!.held, lower.id)).toBe(false);
  expect(errors).toEqual([]);
});

test('두 손가락: 끄는 중에 다른 손가락이 다른 타워를 눌러도 처음 끌기가 그대로 이어지고, 다 떼면 그림이 실제 칸에 있다 (검토 반영)', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  await summonMany(page, [
    [1, 2],
    [4, 2],
  ]);
  const [a, b] = await towers(page);
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number; id: number }[]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  const pa = await tilePoint(page, a!.tx, a!.ty);
  await touch('touchStart', [{ ...pa, id: 1 }]);
  await page.waitForTimeout(450);
  const to = await tilePoint(page, 3, 1);
  for (let i = 1; i <= 6; i++) {
    await touch('touchMove', [{ x: pa.x + ((to.x - pa.x) * i) / 6, y: pa.y + ((to.y - pa.y) * i) / 6, id: 1 }]);
    await page.waitForTimeout(30);
  }
  await expect.poll(async () => inScene(page, (s) => s.dragState?.drop ?? null, null)).toMatchObject({ tx: 3, ty: 1, preview: 'move' });
  // 둘째 손가락이 타워 b를 눌렀다 뗀다 → 무시 (끌기는 a 그대로)
  const pb = await tilePoint(page, b!.tx, b!.ty);
  await touch('touchStart', [
    { ...to, id: 1 },
    { ...pb, id: 2 },
  ]);
  await page.waitForTimeout(100);
  expect(await inScene(page, (s) => s.dragState?.id ?? null, null)).toBe(a!.id);
  await touch('touchEnd', [{ ...pb, id: 2 }]);
  await page.waitForTimeout(50);
  await touch('touchEnd', []);
  await expect.poll(async () => inScene(page, (s) => s.match.state.moves, null)).toBe(1);
  await page.waitForTimeout(600);
  const list = await towers(page);
  const ma = list.find((t) => t.id === a!.id)!;
  expect(ma).toMatchObject({ tx: 3, ty: 1 });
  // 그림 발밑 = 실제 칸 (칸 중심 + 0.3칸) — 끌던 자리에 유령 그림이 남지 않는다
  const foot = await inScene(page, (s, id) => s.towerFootPx(id), a!.id);
  const want = await inScene(page, (s, xy) => ({ x: s.mapLayout.originX + (xy[0] + 0.5) * s.mapLayout.tile, y: s.mapLayout.originY + (xy[1] + 0.8) * s.mapLayout.tile }), [ma.tx, ma.ty] as const);
  expect(Math.abs(foot!.x - want.x)).toBeLessThan(1);
  expect(Math.abs(foot!.y - want.y)).toBeLessThan(1);
  expect(await inScene(page, (s) => s.draggingTowerCount, null)).toBe(0);
  expect(await inScene(page, (s) => s.dragState, null)).toBeNull();
  expect(list.find((t) => t.id === b!.id)).toMatchObject({ tx: b!.tx, ty: b!.ty });
  expect(errors).toEqual([]);
});

/** 고른 타워 그림(머리·별 ~ 받침대, 페이지 CSS px)과 패널 상자. 등장 애니메이션이 끝난 뒤 잰다. */
async function panelVsTower(page: Page, tx: number, ty: number) {
  return page.evaluate(
    ([x, y]) => {
      const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game') as {
        mapLayout: { originY: number; tile: number };
        match: { towers(): { id: number; tx: number; ty: number }[] };
        towerLayer: { artScaleOf(id: number): number | null };
      };
      const L = s.mapLayout;
      const st = document.getElementById('stage')!.getBoundingClientRect();
      const k = st.width / 1080;
      const cy = L.originY + (y + 0.5) * L.tile;
      // B-1 (사용자 결정: 전투 캐릭터 기본 2배·붙으면 1.4배): 그림 위 끝 = 발밑(+0.3칸) − 1.136칸 × 지금 크기 배수 (예전 고정 0.836칸 = 크기 1)
      const t = s.match.towers().find((q) => q.tx === x && q.ty === y);
      const scale = (t && s.towerLayer.artScaleOf(t.id)) || 1;
      const fig = { top: st.top + (cy + (0.3 - 1.136 * scale) * L.tile) * k, bottom: st.top + (cy + 0.475 * L.tile) * k };
      const el = document.querySelector('[data-testid="tower-panel"]') as HTMLElement;
      const r = el.getBoundingClientRect();
      const toasts = [...document.querySelectorAll('.toast')]
        .filter((t) => getComputedStyle(t).display !== 'none')
        .map((t) => t.getBoundingClientRect())
        .map((b) => ({ top: b.top, bottom: b.bottom }));
      return {
        side: el.classList.contains('is-top') ? 'top' : 'bottom',
        density: el.dataset.density,
        panel: { top: r.top, bottom: r.bottom },
        fig,
        overlap: Math.max(0, Math.min(r.bottom, fig.bottom) - Math.max(r.top, fig.top)),
        toasts,
        x,
      };
    },
    [tx, ty] as const,
  );
}

test('정보 패널은 어느 줄의 타워를 골라도 그 타워 그림을 가리지 않는다 (맵 가운데 줄은 접어서, 검토 반영)', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  const rows = await inScene(page, (s) => {
    const out: [number, number][] = [];
    for (let y = 0; y < s.match.map.height; y++) {
      const c = s.match.map.buildable.find(([x, yy]) => yy === y && x >= 3) ?? s.match.map.buildable.find(([, yy]) => yy === y);
      if (c) out.push([c[0], c[1]]);
    }
    return out;
  }, null);
  expect(rows.length).toBe(6); // 순환의 정원 v4 (G-1 마당 맵): 배치 칸이 있는 줄 1~6
  const seen = new Set<string>();
  for (const [x, y] of rows) {
    await summonMany(page, [[x, y]]);
    await tapTile(page, x, y);
    await expect(page.getByTestId('tower-panel')).toBeVisible();
    await page.waitForTimeout(250); // 등장 애니메이션(0.16초) 끝
    const m = await panelVsTower(page, x, y);
    expect(m.overlap, `${y}줄: ${JSON.stringify(m)}`).toBe(0);
    seen.add(`${m.side}${m.density}`);
    await page.locator('[data-action="panel-close"]').click();
    await expect(page.getByTestId('tower-panel')).toHaveCount(0);
    await inScene(page, (s) => {
      for (const t of s.match.towers()) (s.match.world as unknown as { entities: { remove(id: number): void } }).entities.remove(t.id);
      return null;
    }, null);
  }
  // 위·아래 모두 쓰이고, 가운데 줄에서는 접힌다
  expect([...seen].some((k) => k.startsWith('top'))).toBe(true);
  expect([...seen].some((k) => k.startsWith('bottom'))).toBe(true);
  expect([...seen].some((k) => !k.endsWith('0'))).toBe(true);
  expect(errors).toEqual([]);
});

test('위쪽 패널 + 알림: 칸이 가득 찬 판에서 아래쪽 타워를 누르면 알림이 패널 머리줄(이름·✕)을 덮지 않는다 (검토 반영)', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  const all = await inScene(page, (s) => s.match.map.buildable.map(([x, y]) => [x, y] as [number, number]), null);
  await summonMany(page, all);
  // 피드백 #59로 기본 인원 한도가 30(> 24칸)이 되어 알림이 뜨지 않았다 → 이 판만 인원 한도를 칸 수(놓은 타워 수)에 맞춘다
  await inScene(
    page,
    (s, n) => {
      const m = s.match as unknown as { rules: { unitCap: number }; state: { unitCapBonus: number[] } };
      m.state.unitCapBonus[0] = n - m.rules.unitCap;
      return null;
    },
    all.length,
  );
  const lowest = [...all].sort((p, q) => q[1] - p[1] || p[0] - q[0])[0]!;
  await page.waitForTimeout(100);
  await tapTile(page, lowest[0], lowest[1]);
  await expect(page.getByTestId('tower-panel')).toHaveClass(/is-top/);
  await page.waitForTimeout(250);
  // G-1: 인원 한도(20) < 칸 24 — 칸을 모두 채운 판(예전 summon 명령)이면 '인원이 가득 찼어요'가 먼저
  await expect(page.locator('.toast', { hasText: /빈 칸이 없어요|인원이 가득 찼어요/ })).toBeVisible();
  // 알림 자리를 잰 높이(늘 붙어 있는 보이지 않는 알림) = 실제 알림 한 줄 높이 (T-3 병합: 예전엔 21px로 재어 11px 겹침)
  const heights = await page.evaluate(() => ({
    probe: (document.querySelector('.toast-probe') as HTMLElement).offsetHeight,
    real: (document.querySelector('.layer-toast .toast:last-child') as HTMLElement).offsetHeight,
  }));
  expect(Math.abs(heights.probe - heights.real), JSON.stringify(heights)).toBeLessThanOrEqual(1);
  const m = await panelVsTower(page, lowest[0], lowest[1]);
  expect(m.overlap).toBe(0);
  expect(m.toasts.length).toBeGreaterThanOrEqual(1);
  for (const t of m.toasts) expect(t.bottom, JSON.stringify(m)).toBeLessThanOrEqual(m.panel.top + 0.5);
  // ✕ 버튼이 알림에 덮이지 않고 보인다
  const close = await page.locator('[data-action="panel-close"]').boundingBox();
  for (const t of m.toasts) expect(close!.y).toBeGreaterThanOrEqual(t.bottom);
  await shot(page, 'M3a-top-panel-toast');
  // 열린 패널의 글자가 바뀌어 자리를 다시 재도(쪽 클래스를 잠깐 바꿈) 등장 애니메이션이 다시 시작되지 않는다
  await inScene(page, (s) => {
    const t = s.match.towers().find((x) => x.id === s.selectedTowerId) as unknown as { pauseUntil: number };
    t.pauseUntil = s.match.tick + 200; // '이동 중' 표시 → 패널 글자가 바뀜
    return null;
  }, null);
  await expect(page.locator('.tp-paused')).toBeVisible();
  expect(await page.getByTestId('tower-panel').evaluate((el) => el.getAnimations().length)).toBe(0);
  await expect(page.getByTestId('tower-panel')).toHaveClass(/is-top/);
  expect(errors).toEqual([]);
});

test('M3a 스크린샷: 정보 패널(스탯·보유 n/3·승급 버튼) + 사거리 원 + 같은 종류 강조, 8단계 전투 중', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  // 마당 가장자리에 고르게 12개 (순환의 정원 v4 — 길에 닿은 칸)
  const ring: [number, number][] = [
    [1, 1], [2, 1], [3, 1], [4, 1], [1, 3], [4, 3], [1, 4], [4, 4], [1, 6], [2, 6], [3, 6], [4, 6],
  ];
  await summonMany(page, ring);
  // 가장 많은 종류가 3개 이상이면 한 번 승급해 레어를 만든다
  const group = biggestGroup(await towers(page));
  if (group.length >= 3) {
    await inScene(
      page,
      (s, xy) => {
        s.match.world.enqueue({ type: 'merge', x: xy[0], y: xy[1] });
        return s.debugFastForward(1);
      },
      [group[0]!.tx, group[0]!.ty] as const,
    );
  }
  // 8단계 40초째까지 빨리 감기 (몹이 고리를 돈다)
  const ran = await inScene(page, (s) => s.debugFastForward(1200 + 7 * 1200 + 800), null);
  expect(ran).toBe(1200 + 7 * 1200 + 800);
  // 맵 위쪽 절반의 타워 중 같은 종류가 가장 많은 것을 골라 패널 (패널이 아래에 뜨고 같은 종류 강조가 보이게)
  const list = await towers(page);
  const upper = list.filter((t) => t.ty <= 5);
  const count = (id: string) => list.filter((t) => t.tower === id).length;
  const pick = [...upper].sort((a, b) => count(b.tower) - count(a.tower) || a.id - b.id)[0]!;
  await tapTile(page, pick.tx, pick.ty);
  await expect(page.getByTestId('tower-panel')).toBeVisible();
  await expect(page.getByTestId('tower-panel')).toHaveClass(/is-bottom/);
  await page.waitForTimeout(500);
  expect(await inScene(page, (s) => s.match.state.stage, null)).toBe(8);
  await shot(page, 'M3a', 'M3a');
  expect(errors).toEqual([]);
});
