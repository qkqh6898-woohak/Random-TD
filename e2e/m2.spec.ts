/**
 * M2 E2E: 빈 칸 탭 → 소환(돈 −100), 돈 부족·칸 없음 알림(UI.md 8장), 타워 그림 = sim, 대기 동작, 자동 공격 → 피해 숫자·동전·돈 증가.
 * sim 상태는 개발 서버의 window.__rtd 로 읽는다 (화면은 읽기만). 스크린샷: test-results/screens/, docs/screens/M2.png (SAVE_SCREENS=1).
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SAVE_DOCS = process.env.SAVE_SCREENS === '1';

interface View {
  tick: number;
  stage: number;
  gold: number;
  towers: number;
  renderedTowers: number;
  mobs: number;
  kills: number;
  summons: number;
}

type SceneLike = {
  match: {
    tick: number;
    state: { stage: number; gold: number; kills: number; summons: number };
    towers(): { id: number; tx: number; ty: number; tower: string }[];
    mobCount(): number;
    map: { buildable: [number, number][] };
    world: { enqueue(c: unknown): { ok: boolean } };
  };
  renderedTowerCount: number;
  renderedProjectileCount: number;
  floatingLabels: string[];
  flyingCoins: number;
  mapLayout: { originX: number; originY: number; tile: number };
  debugFastForward(n: number): number;
  towerFigureTransform(id: number): { y: number; scaleY: number; angle: number } | null;
};

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  return errors;
}

async function view(page: Page): Promise<View> {
  return page.evaluate(() => {
    const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game') as SceneLike;
    const m = s.match;
    return {
      tick: m.tick,
      stage: m.state.stage,
      gold: m.state.gold,
      towers: m.towers().length,
      renderedTowers: s.renderedTowerCount,
      mobs: m.mobCount(),
      kills: m.state.kills,
      summons: m.state.summons,
    };
  });
}

async function start(page: Page, query = '?seed=42'): Promise<void> {
  await page.goto(`/${query}`);
  await page.getByRole('button', { name: '시작' }).click();
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
}

/** 칸 (tx, ty) 가운데의 페이지 좌표. */
async function tilePoint(page: Page, tx: number, ty: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([x, y]) => {
      const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game') as SceneLike;
      const L = s.mapLayout;
      const r = document.getElementById('stage')!.getBoundingClientRect();
      const k = r.width / 1080;
      return { x: r.left + (L.originX + (x + 0.5) * L.tile) * k, y: r.top + (L.originY + (y + 0.5) * L.tile) * k };
    },
    [tx, ty] as const,
  );
}

/** 칸을 탭한다 (소환 연타 0.1초 간격을 지키게 조금 쉰다). */
async function tapTile(page: Page, tx: number, ty: number): Promise<void> {
  const p = await tilePoint(page, tx, ty);
  await page.touchscreen.tap(p.x, p.y);
  await page.waitForTimeout(130);
}

async function fastForward(page: Page, ticks: number): Promise<number> {
  return page.evaluate((n) => {
    const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game') as SceneLike;
    return s.debugFastForward(n);
  }, ticks);
}

async function shot(page: Page, name: string, docsName?: string): Promise<void> {
  mkdirSync('test-results/screens', { recursive: true });
  await page.screenshot({ path: `test-results/screens/${name}.png`, animations: 'disabled' });
  if (SAVE_DOCS && docsName) {
    mkdirSync('docs/screens', { recursive: true });
    await page.screenshot({ path: `docs/screens/${docsName}.png`, animations: 'disabled' });
  }
}

/** 순환의 정원 안쪽 고리 칸 (경로 바로 안쪽·바깥쪽) */
const RING: [number, number][] = [
  [2, 2], [6, 2], [2, 8], [6, 8], [4, 0], [0, 5], [8, 5], [4, 10], [3, 2], [5, 8], [2, 5], [6, 5], [4, 2], [4, 8],
];

test('빈 배치 칸 탭 → 소환: 타워가 보이고 돈 1,000 → 900원, 🗼 1/71 / 경로·타워 칸 탭은 아무 일 없음', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  await expect(page.getByTestId('hud-towers')).toHaveText('0/71');
  await expect(page.getByTestId('hud-hint')).toHaveText('빈 칸을 눌러 소환 · 100원');
  await tapTile(page, 2, 2);
  await expect(page.getByTestId('hud-gold')).toHaveText('900원');
  await expect(page.getByTestId('hud-towers')).toHaveText('1/71');
  let v = await view(page);
  expect(v.towers).toBe(1);
  expect(v.gold).toBe(900);
  await expect.poll(async () => (await view(page)).renderedTowers).toBe(1);
  const t = await page.evaluate(() => {
    const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game') as SceneLike;
    return s.match.towers()[0]!;
  });
  expect([t.tx, t.ty]).toEqual([2, 2]);
  expect(['miner', 'goblin', 'archer', 'apprentice', 'warrior']).toContain(t.tower);

  // 경로 칸 (1, 1)과 이미 타워가 있는 칸 → 아무 일 없음
  await tapTile(page, 1, 1);
  await tapTile(page, 2, 2);
  await page.waitForTimeout(200);
  v = await view(page);
  expect(v.towers).toBe(1);
  expect(v.gold).toBe(900);
  await expect(page.locator('.toast')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('돈 부족: 10번 소환해 0원 → 11번째 탭은 "100원이 필요해요" 알림, 안내가 빨갛게', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  for (const [x, y] of RING.slice(0, 10)) await tapTile(page, x, y);
  await expect(page.getByTestId('hud-gold')).toHaveText('0원');
  await expect(page.getByTestId('hud-towers')).toHaveText('10/71');
  await expect(page.getByTestId('hud-hint')).toHaveClass(/is-short/);
  await tapTile(page, 4, 4);
  await expect(page.locator('.toast', { hasText: '100원이 필요해요' })).toBeVisible();
  const v = await view(page);
  expect(v.towers).toBe(10);
  expect(v.summons).toBe(10);
  await expect.poll(async () => (await view(page)).renderedTowers).toBe(10);
  // 연타해도 같은 알림이 쌓이지 않는다
  await tapTile(page, 4, 4);
  await tapTile(page, 4, 5);
  await expect(page.locator('.toast', { hasText: '100원이 필요해요' })).toHaveCount(1);
  await shot(page, 'M2-no-gold');
  expect(errors).toEqual([]);
});

test('배치 칸이 가득 차면 타워 칸 탭 → "빈 칸이 없어요 — 승급으로 칸을 비워 보세요"', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, '?debug=1&seed=7');
  // 개발용 돈 추가 + 모든 칸 소환 (명령으로)
  await page.evaluate(() => {
    const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game') as SceneLike;
    s.match.world.enqueue({ type: 'debugAddGold', amount: 10_000 });
    for (const [x, y] of s.match.map.buildable) s.match.world.enqueue({ type: 'summon', x, y });
  });
  await expect(page.getByTestId('hud-towers')).toHaveText('71/71');
  await expect(page.getByTestId('hud-hint')).toHaveText('빈 칸이 없어요');
  await expect.poll(async () => (await view(page)).renderedTowers).toBe(71);
  await tapTile(page, 4, 4);
  await expect(page.locator('.toast', { hasText: '빈 칸이 없어요 — 승급으로 칸을 비워 보세요' })).toBeVisible();
  expect((await view(page)).towers).toBe(71);
  await shot(page, 'M2-full');
  expect(errors).toEqual([]);
});

test('타워는 공격하지 않아도 대기 동작으로 계속 움직인다 (숨쉬기 + 흔들림)', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  await tapTile(page, 4, 4);
  await tapTile(page, 3, 4);
  const ids = await page.evaluate(() => {
    const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game') as SceneLike;
    return s.match.towers().map((t) => t.id);
  });
  expect(ids).toHaveLength(2);
  // 준비 단계라 몹이 없다 → 공격 없음. 0.15초 간격으로 여러 번 재면 자세가 바뀐다
  const samples: { y: number; scaleY: number }[][] = [];
  for (let i = 0; i < 6; i++) {
    samples.push(
      await page.evaluate((list) => {
        const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game') as SceneLike;
        return list.map((id) => s.towerFigureTransform(id)!);
      }, ids),
    );
    await page.waitForTimeout(150);
  }
  for (let k = 0; k < 2; k++) {
    const ys = new Set(samples.map((s) => s[k]!.y.toFixed(2)));
    const sy = new Set(samples.map((s) => Math.abs(s[k]!.scaleY).toFixed(4)));
    expect(ys.size).toBeGreaterThan(2);
    expect(sy.size).toBeGreaterThan(2);
  }
  // 두 타워가 똑같이 움직이지 않는다 (시작 위상 무작위)
  const same = samples.every((s) => s[0]!.y.toFixed(2) === s[1]!.y.toFixed(2));
  expect(same).toBe(false);
  expect((await view(page)).mobs).toBe(0);
  expect(errors).toEqual([]);
});

/** 돈 표시 (HUD 형식, 1만 미만): 1,240원 */
const won = (n: number): string => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}원`;

async function labels(page: Page): Promise<{ labels: string[]; coins: number }> {
  return page.evaluate(() => {
    const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game') as SceneLike;
    return { labels: s.floatingLabels, coins: s.flyingCoins };
  });
}

test('자동 공격: 몹을 잡으면 피해 숫자·+10원·동전이 뜨고 돈이 늘어 더 소환한다 (M2 스크린샷)', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await start(page, '?seed=42');
  for (const [x, y] of RING.slice(0, 10)) await tapTile(page, x, y);
  await expect(page.getByTestId('hud-gold')).toHaveText('0원');
  // 1단계 시작 직후로 빨리 감고, 그다음은 실제 시간으로 (최근 사건만 연출이 생긴다)
  const v0 = await view(page);
  await fastForward(page, 1200 + 340 - v0.tick);
  await page.getByRole('button', { name: '배속' }).click(); // ×2
  await expect.poll(async () => (await labels(page)).labels.filter((l) => /^\d+$/.test(l)).length, { timeout: 8000 }).toBeGreaterThan(0);
  await expect.poll(async () => (await view(page)).kills, { timeout: 15000 }).toBeGreaterThan(2);
  // 처치하면 '+10원'이 떠오르거나 동전이 날아간다
  await expect.poll(async () => {
    const l = await labels(page);
    return l.labels.includes('+10원') || l.coins > 0;
  }, { timeout: 15000 }).toBe(true);
  // 멈추고 비교: 돈 = 처치 × 10원 (1단계 슬라임), HUD 돈 = sim 돈
  await page.getByRole('button', { name: '일시정지' }).click();
  const v = await view(page);
  expect(v.gold).toBe(v.kills * 10);
  await expect(page.getByTestId('hud-gold')).toHaveText(won(v.gold));
  await page.getByRole('button', { name: '계속' }).click();

  // 4단계까지: 번 돈으로 4번 더 소환 (탭)
  await fastForward(page, 4800 - (await view(page)).tick);
  expect((await view(page)).gold).toBeGreaterThanOrEqual(400);
  for (const [x, y] of RING.slice(10, 14)) await tapTile(page, x, y);
  await expect.poll(async () => (await view(page)).towers).toBe(14);
  await expect.poll(async () => (await view(page)).renderedTowers).toBe(14);

  // 6단계 중간 (박쥐가 섞임) → 스크린샷: 단계 알림이 사라지고 숫자가 떠 있는 순간
  await fastForward(page, 7950 - (await view(page)).tick);
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 4000 });
  await expect.poll(async () => (await labels(page)).labels.length, { timeout: 8000 }).toBeGreaterThan(1);
  const end = await view(page);
  expect(end.stage).toBe(6);
  expect(end.mobs).toBeLessThan(40); // 타워 14개가 몹을 잡고 있다 (타워 없으면 100마리 넘게 쌓임)
  await shot(page, 'M2-combat', 'M2');
  expect(errors).toEqual([]);
});
