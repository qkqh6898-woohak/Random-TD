/**
 * M3a E2E: 타워 탭 → 정보 패널(스탯·보유 n/3·승급 버튼) → 승급(3개 → 1개, 결과 = 터치한 칸, 다음 등급) / 모두 승급 /
 * '⬆ 승급 가능 n' 버튼 / 길게 눌러 끌기 → 이동·교환 / 패널 닫기 / M3a 스크린샷.
 * sim 상태는 개발 서버의 window.__rtd 로 읽는다 (화면은 읽기만). 판 준비(소환)는 명령으로 보낸다.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

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
    towers(): TowerLite[];
    rules: { towers: Map<string, { grade: string }> };
    map: { buildable: [number, number][] };
    world: { enqueue(c: unknown): { ok: boolean } };
  };
  mapLayout: { originX: number; originY: number; tile: number };
  mergeEffects: number;
  selectedTowerId: number | null;
  dragState: { id: number; drop: { tx: number; ty: number; preview: string } | null } | null;
  renderedTowerCount: number;
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
  await page.getByRole('button', { name: '시작' }).click();
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

/** 종류별로 묶어 가장 많은 종류. */
function biggestGroup(list: TowerLite[]): TowerLite[] {
  const by = new Map<string, TowerLite[]>();
  for (const t of list) by.set(t.tower, [...(by.get(t.tower) ?? []), t]);
  return [...by.values()].sort((a, b) => b.length - a.length || a[0]!.id - b[0]!.id)[0] ?? [];
}

/** 순환의 정원 배치 칸 중 앞에서 n개 (y, x 순) */
async function cells(page: Page, n: number): Promise<[number, number][]> {
  return inScene(page, (s, k) => s.match.map.buildable.slice(0, k), n);
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
  await tapTile(page, 4, 4);
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
  await expect(page.getByTestId('tp-note')).toContainText('3개가 모이면');
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
  await tapTile(page, 2, 2);
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

test('승급: 같은 종류 3개 이상 → 패널 [⬆ 승급] → 터치한 칸에 레어, 같은 종류 2개가 사라짐 (가장 나중 2개), 패널이 결과를 따라감', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  await summonMany(page, await cells(page, 14));
  const before = await towers(page);
  const group = biggestGroup(before);
  expect(group.length).toBeGreaterThanOrEqual(3); // 14개 / 5종 → 비둘기집
  const anchor = group[0]!; // 가장 먼저 소환된 것을 터치
  await tapTile(page, anchor.tx, anchor.ty);
  await expect(page.getByTestId('tp-owned')).toHaveText(`${group.length}/3`);
  await expect(page.locator('[data-action="merge"]')).toBeEnabled();
  await expect(page.locator('[data-testid="hud-merge-ready"]')).toBeVisible();
  await page.locator('[data-action="merge"]').click();
  await expect.poll(async () => inScene(page, (s) => s.match.state.merges, null)).toBe(1);
  const after = await towers(page);
  expect(after.length).toBe(before.length - 2);
  const result = after.find((t) => t.tx === anchor.tx && t.ty === anchor.ty)!;
  expect(result.id).not.toBe(anchor.id);
  expect(await inScene(page, (s, id) => s.match.rules.towers.get(s.match.towers().find((t) => t.id === id)!.tower)!.grade, result.id)).toBe('rare');
  // 사라진 2개 = 같은 종류 중 가장 나중에 소환된 2개
  const gone = before.filter((t) => !after.some((a) => a.id === t.id) && t.id !== anchor.id).map((t) => t.id);
  expect(gone.sort((a, b) => a - b)).toEqual(group.slice(-2).map((t) => t.id));
  await expect.poll(async () => inScene(page, (s) => s.mergeEffects, null)).toBe(1);
  // 패널은 결과 타워를 보여준다 (★★)
  await expect(page.getByTestId('tp-stars')).toHaveText('★★');
  expect(await inScene(page, (s) => s.selectedTowerId, null)).toBe(result.id);
  await expect.poll(async () => inScene(page, (s) => s.renderedTowerCount, null)).toBe(after.length);
  expect(errors).toEqual([]);
});

test('모두 승급: 같은 종류 n개 → ⌊n/3⌋번 승급, 아래 띠 [⬆ 승급 가능 n] 버튼이 승급할 타워를 고른다', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  await summonMany(page, await cells(page, 40));
  const before = await towers(page);
  const group = biggestGroup(before);
  expect(group.length).toBeGreaterThanOrEqual(6);
  const readyBtn = page.getByTestId('hud-merge-ready');
  await expect(readyBtn).toBeVisible();
  await expect(readyBtn).toHaveText(/⬆ 승급 가능 \d/);
  await readyBtn.click();
  await expect(page.getByTestId('tower-panel')).toBeVisible();
  const selected = await inScene(page, (s) => s.selectedTowerId, null);
  expect(before.some((t) => t.id === selected)).toBe(true);
  // 가장 많은 종류의 타워를 직접 골라 모두 승급
  await tapTile(page, group[0]!.tx, group[0]!.ty);
  await page.waitForTimeout(100);
  if ((await inScene(page, (s) => s.selectedTowerId, null)) !== group[0]!.id) await tapTile(page, group[0]!.tx, group[0]!.ty);
  await expect(page.getByTestId('tp-owned')).toHaveText(`${group.length}/3`);
  const times = Math.floor(group.length / 3);
  await page.locator('[data-action="merge-all"]').click();
  await expect.poll(async () => inScene(page, (s) => s.match.state.merges, null)).toBe(times);
  const after = await towers(page);
  expect(after.filter((t) => t.tower === group[0]!.tower).length).toBe(group.length % 3);
  expect(after.length).toBe(before.length - 2 * times);
  expect(errors).toEqual([]);
});

test('길게 눌러 끌기: 빈 칸으로 이동(초록 미리 보기), 다른 타워 위에 놓으면 교환(파랑), 짧게 누르면 패널만', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  await summonMany(page, [
    [2, 2],
    [6, 2],
  ]);
  const [a, b] = await towers(page);
  // 끌 때 타워는 손가락보다 0.45칸 위에 그려지고 그 칸을 노린다 → 손가락은 목표 칸 중심보다 0.45칸 아래
  const from = await tilePoint(page, a!.tx, a!.ty);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.waitForTimeout(450); // 0.3초 넘게 누르기
  const to = await tilePoint(page, 3, 2, 0.45);
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await expect.poll(async () => inScene(page, (s) => s.dragState?.drop?.preview ?? null, null)).toBe('move');
  expect(await inScene(page, (s) => s.dragState?.drop, null)).toMatchObject({ tx: 3, ty: 2 });
  await shot(page, 'M3a-drag');
  await page.mouse.up();
  await expect.poll(async () => inScene(page, (s) => s.match.state.moves, null)).toBe(1);
  let list = await towers(page);
  expect(list.find((t) => t.id === a!.id)).toMatchObject({ tx: 3, ty: 2 });
  await expect(page.getByTestId('tower-panel')).toHaveCount(0);

  // 교환: a(3,2)를 b(6,2) 위로
  const from2 = await tilePoint(page, 3, 2);
  await page.mouse.move(from2.x, from2.y);
  await page.mouse.down();
  await page.waitForTimeout(450);
  const to2 = await tilePoint(page, b!.tx, b!.ty, 0.45);
  await page.mouse.move(to2.x, to2.y, { steps: 6 });
  await expect.poll(async () => inScene(page, (s) => s.dragState?.drop?.preview ?? null, null)).toBe('swap');
  await page.mouse.up();
  await expect.poll(async () => inScene(page, (s) => s.match.state.moves, null)).toBe(2);
  list = await towers(page);
  expect(list.find((t) => t.id === a!.id)).toMatchObject({ tx: b!.tx, ty: b!.ty });
  expect(list.find((t) => t.id === b!.id)).toMatchObject({ tx: 3, ty: 2 });

  // 경로 칸 위에 놓으면 빨강 미리 보기 → 그대로
  const from3 = await tilePoint(page, 3, 2);
  await page.mouse.move(from3.x, from3.y);
  await page.mouse.down();
  await page.waitForTimeout(450);
  const to3 = await tilePoint(page, 1, 1, 0.45);
  await page.mouse.move(to3.x, to3.y, { steps: 6 });
  await expect.poll(async () => inScene(page, (s) => s.dragState?.drop?.preview ?? null, null)).toBe('invalid');
  await page.mouse.up();
  await page.waitForTimeout(150);
  expect(await inScene(page, (s) => s.match.state.moves, null)).toBe(2);

  // 짧게 누르면(0.3초 전) 끌기 없이 패널
  await tapTile(page, 3, 2);
  await expect(page.getByTestId('tower-panel')).toBeVisible();
  expect(await inScene(page, (s) => s.dragState, null)).toBeNull();
  expect(errors).toEqual([]);
});

test('M3a 스크린샷: 정보 패널(스탯·보유 n/3·승급 버튼) + 사거리 원 + 같은 종류 강조, 8단계 전투 중', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  // 고리 안팎에 고르게 12개 (순환의 정원)
  const ring: [number, number][] = [
    [2, 2], [6, 2], [2, 8], [6, 8], [4, 0], [0, 5], [8, 5], [4, 10], [3, 2], [5, 8], [2, 5], [6, 5],
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
