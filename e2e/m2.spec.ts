/**
 * M2 E2E: 빈 칸 탭 → 소환(돈 −100), 돈 부족·칸 없음 알림(UI.md 8장), 타워 그림 = sim, 대기 동작, 자동 공격 → 피해 숫자·동전·돈 증가.
 * sim 상태는 개발 서버의 window.__rtd 로 읽는다 (화면은 읽기만). 스크린샷: test-results/screens/, docs/screens/M2.png (SAVE_SCREENS=1).
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

interface View {
  tick: number;
  stage: number;
  gold: number;
  goldEarned: number;
  towers: number;
  renderedTowers: number;
  mobs: number;
  kills: number;
  summons: number;
}

type SceneLike = {
  match: {
    tick: number;
    state: { stage: number; gold: number; goldEarned: number; kills: number; summons: number };
    towers(): { id: number; tx: number; ty: number; tower: string }[];
    mobCount(): number;
    map: { buildable: [number, number][] };
    rules: { towerOrder: string[] };
    world: { enqueue(c: unknown): { ok: boolean } };
  };
  renderedTowerCount: number;
  renderedProjectileCount: number;
  floatingLabels: string[];
  flyingCoins: number;
  mapLayout: { originX: number; originY: number; tile: number };
  summonEffects: number;
  time: { now: number };
  update(time: number, deltaMs: number): void;
  floatingTextBounds(): { label: string; big: boolean; x: number; y: number; w: number; h: number }[];
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
      goldEarned: m.state.goldEarned,
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
  await clickStart(page);
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

/** 순환의 정원 v4(G-1 마당 맵) 배치 칸 — 마당 가장자리(길에 닿은 칸)부터 */
const RING: [number, number][] = [
  [1, 1], [2, 1], [3, 1], [4, 1], [1, 2], [4, 2], [1, 3], [4, 3], [1, 4], [4, 4], [1, 5], [4, 5], [1, 6], [2, 6],
];
/** 배치 칸 수 (순환의 정원 v4) */
const CELLS = 24;
/** 인원 한도 (G-1 game.json board.unitCap, 피드백 #59로 20 → 30) — 🗼 n/한도 */
const CAP = 30;

test('빈 배치 칸 탭 → 소환: 타워가 보이고 돈 1,000 → 900원, 🗼 1/32 / 경로·타워 칸 탭은 아무 일 없음', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  await expect(page.getByTestId('hud-towers')).toHaveText(`0/${CAP}`);
  // T-2: 비용은 [🎲 소환 100원] 버튼이 보여 준다 (안내 글자는 칸이 가득 찼을 때만)
  await expect(page.getByTestId('hud-summon')).toContainText('100원');
  await expect(page.getByTestId('hud-hint')).toHaveText('');
  await tapTile(page, 1, 2);
  await expect(page.getByTestId('hud-gold')).toHaveText('900원');
  await expect(page.getByTestId('hud-towers')).toHaveText(`1/${CAP}`);
  let v = await view(page);
  expect(v.towers).toBe(1);
  expect(v.gold).toBe(900);
  await expect.poll(async () => (await view(page)).renderedTowers).toBe(1);
  const t = await page.evaluate(() => {
    const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game') as SceneLike;
    return s.match.towers()[0]!;
  });
  expect([t.tx, t.ty]).toEqual([1, 2]);
  expect(['miner', 'goblin', 'archer', 'apprentice', 'warrior']).toContain(t.tower);

  // 경로 칸 (0, 2)과 이미 타워가 있는 칸 → 아무 일 없음
  await tapTile(page, 0, 2);
  await tapTile(page, 1, 2);
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
  // G-1: 🗼 = 내 타워 인원 / 인원 한도
  await expect(page.getByTestId('hud-towers')).toHaveText(`10/${CAP}`);
  expect((await view(page)).towers).toBe(10);
  await expect(page.getByTestId('hud-hint')).toHaveClass(/is-short/);
  await expect(page.getByTestId('hud-summon')).toHaveClass(/is-off/);
  await tapTile(page, 4, 4);
  await expect(page.locator('.toast', { hasText: '100원이 필요해요' })).toBeVisible();
  const v = await view(page);
  expect(v.towers).toBe(10);
  expect(v.summons).toBe(10);
  await expect.poll(async () => (await view(page)).renderedTowers).toBe(10);
  // 연타해도 같은 알림이 쌓이지 않는다
  await tapTile(page, 4, 4);
  await tapTile(page, 2, 6);
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
    // G-1 칸 무더기: 모든 칸에 같은 캐릭터 3개씩 (두 종류 번갈아) → 빈 칸도 들어갈 무더기도 없음
    s.match.map.buildable.forEach(([x, y], i) => {
      for (let k = 0; k < 3; k++) s.match.world.enqueue({ type: 'debugTower', x, y, t: s.match.rules.towerOrder.indexOf(i % 2 ? 'goblin' : 'archer') });
    });
  });
  await expect(page.getByTestId('hud-towers')).toHaveText(`${CELLS * 3}/${CAP}`); // 개발자 놓기는 인원 한도를 보지 않는다
  // 승급 버튼이 보이면 안내는 비고(잘리지 않게, M4 검토 반영), 없으면 '빈 칸이 없어요' — 어느 쪽이든 글자가 잘리지 않는다
  await expect(page.getByTestId('hud-merge-ready')).toBeVisible();
  await expect(page.getByTestId('hud-hint')).toHaveText('');
  await expect.poll(async () => (await view(page)).renderedTowers).toBe(CELLS * 3);
  await tapTile(page, 2, 4);
  await expect(page.locator('.toast', { hasText: '빈 칸이 없어요 — 승급으로 칸을 비워 보세요' })).toBeVisible();
  expect((await view(page)).towers).toBe(CELLS * 3);
  await shot(page, 'M2-full');
  expect(errors).toEqual([]);
});

test('타워는 공격하지 않아도 대기 동작으로 계속 움직인다 (숨쉬기 + 흔들림)', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  await tapTile(page, 4, 4);
  await tapTile(page, 4, 3);
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
  // 멈추고 비교: 돈 = 번 돈 = 처치 × 10원 (1단계 슬라임) + 광부 특색 돈(+5원씩, M3b), HUD 돈 = sim 돈
  await page.getByRole('button', { name: '일시정지' }).click();
  const v = await view(page);
  expect(v.gold).toBe(v.goldEarned);
  const extra = v.goldEarned - v.kills * 10;
  expect(extra).toBeGreaterThanOrEqual(0);
  expect(extra % 5).toBe(0);
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

/** 페이지 안에서 Game 장면을 꺼내는 코드 (page.evaluate 안에서만 쓴다). */
type W = { __rtd: { game: { scene: { getScene(k: string): unknown } } } };

test('검토 반영: 타워 머리(위 칸으로 삐져나온 헬멧·별)를 탭해도 위 칸에 소환되지 않는다', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, '?seed=7');
  await tapTile(page, 1, 4);
  await expect(page.getByTestId('hud-towers')).toHaveText(`1/${CAP}`);
  await expect.poll(async () => (await view(page)).renderedTowers).toBe(1);
  // (1, 4) 칸 위쪽 경계에서 0.12칸·0.25칸 위 = 캐릭터 헬멧·별이 그려진 자리 (리뷰 재현: 여기를 누르면 위 칸 (1, 3)에 소환됐다)
  for (const up of [0.12, 0.25]) {
    const p = await page.evaluate(
      ([dy]) => {
        const s = (window as unknown as W).__rtd.game.scene.getScene('Game') as SceneLike;
        const L = s.mapLayout;
        const r = document.getElementById('stage')!.getBoundingClientRect();
        const k = r.width / 1080;
        return { x: r.left + (L.originX + 1.5 * L.tile) * k, y: r.top + (L.originY + (4 - dy!) * L.tile) * k };
      },
      [up] as const,
    );
    await page.touchscreen.tap(p.x, p.y);
    await page.waitForTimeout(150);
  }
  let v = await view(page);
  expect(v.towers).toBe(1);
  expect(v.gold).toBe(900);
  // 위 칸 가운데는 그대로 소환된다
  await tapTile(page, 1, 3);
  await expect(page.getByTestId('hud-towers')).toHaveText(`2/${CAP}`);
  v = await view(page);
  expect(v.gold).toBe(800);
  expect(errors).toEqual([]);
});

test('검토 반영: 느린 프레임(한 번에 5틱)에도 소환 연출과 "100원이 필요해요" 알림이 빠지지 않는다', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, '?seed=42');
  // 소환 명령을 넣고 같은 동기 구간에서 300ms짜리 프레임 하나를 돌린다 (maxFrameMs 250 → 5틱).
  // 예전에는 '최근 3틱' 사건만 연출해서, 첫 틱에 실행된 소환의 빛 기둥·등장 동작이 사라졌다.
  const r = await page.evaluate(() => {
    const s = (window as unknown as W).__rtd.game.scene.getScene('Game') as SceneLike;
    const before = { fx: s.summonEffects, tick: s.match.tick };
    s.match.world.enqueue({ type: 'summon', x: 1, y: 2 });
    s.update(s.time.now, 300);
    return { fx: s.summonEffects - before.fx, ticks: s.match.tick - before.tick, towers: s.match.towers().length };
  });
  expect(r.ticks).toBeGreaterThanOrEqual(4);
  expect(r.towers).toBe(1);
  expect(r.fx).toBe(1);
  // 돈을 다 쓴 뒤, 화면 검사 없이 들어간 소환(sim이 거절) → 느린 프레임에도 알림
  await page.evaluate(() => {
    const s = (window as unknown as W).__rtd.game.scene.getScene('Game') as SceneLike;
    const cells: [number, number][] = [[1, 1], [2, 1], [3, 1], [4, 1], [4, 2], [1, 3], [4, 3], [1, 4], [4, 4]];
    for (const [x, y] of cells) s.match.world.enqueue({ type: 'summon', x, y });
    s.debugFastForward(1);
  });
  await expect(page.getByTestId('hud-gold')).toHaveText('0원');
  await expect(page.locator('.toast')).toHaveCount(0);
  await page.evaluate(() => {
    const s = (window as unknown as W).__rtd.game.scene.getScene('Game') as SceneLike;
    s.match.world.enqueue({ type: 'summon', x: 4, y: 6 });
    s.update(s.time.now, 300);
  });
  await expect(page.locator('.toast', { hasText: '100원이 필요해요' })).toBeVisible();
  expect((await view(page)).towers).toBe(10);
  expect(errors).toEqual([]);
});

test('검토 반영: ?debug=1 HUD [💰+] 버튼으로 돈 추가 (일반 판에는 없음)', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, '?seed=42');
  await expect(page.getByRole('button', { name: '돈 추가 (디버그)' })).toHaveCount(0);
  await start(page, '?debug=1&seed=42');
  const add = page.getByRole('button', { name: '돈 추가 (디버그)' });
  await expect(add).toBeVisible();
  await expect(page.locator('.hud-side-l').getByRole('button', { name: '돈 추가 (디버그)' })).toHaveCount(1);
  await expect(page.getByTestId('hud-gold')).toHaveText('1,000원');
  await add.click();
  await expect(page.getByTestId('hud-gold')).toHaveText('2,000원');
  await add.click();
  await expect(page.getByTestId('hud-gold')).toHaveText('3,000원');
  expect((await view(page)).gold).toBe(3000);
  expect(errors).toEqual([]);
});

test('검토 반영: 한꺼번에 뜬 피해 숫자가 겹치지 않는다 (타워 20개가 한 몹을 동시에 때림)', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, '?debug=1&seed=7');
  await page.evaluate(() => {
    const s = (window as unknown as W).__rtd.game.scene.getScene('Game') as SceneLike;
    s.match.world.enqueue({ type: 'debugAddGold', amount: 1000 });
    // 경로 바로 안쪽·바깥쪽 칸 20개 (몹이 지나갈 때 여러 타워가 같이 때린다)
    const near = s.match.map.buildable.slice(0, 20); // G-1 마당 맵: 24칸 중 20칸
    for (const [x, y] of near) s.match.world.enqueue({ type: 'summon', x, y });
    s.debugFastForward(1);
  });
  expect((await view(page)).towers).toBe(20);
  const v0 = await view(page);
  await fastForward(page, 1200 + 200 - v0.tick); // 1단계 시작 직후
  type B = { label: string; big: boolean; x: number; y: number; w: number; h: number };
  let checked = 0;
  let worst = 0;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(120);
    const boxes = (await page.evaluate(() => {
      const s = (window as unknown as W).__rtd.game.scene.getScene('Game') as SceneLike;
      return s.floatingTextBounds();
    })) as B[];
    const nums = boxes.filter((b) => !b.big && /^\d+$/.test(b.label));
    for (let a = 0; a < nums.length; a++) {
      for (let b = a + 1; b < nums.length; b++) {
        const A = nums[a]!;
        const Bx = nums[b]!;
        const ox = Math.min(A.x + A.w, Bx.x + Bx.w) - Math.max(A.x, Bx.x);
        const oy = Math.min(A.y + A.h, Bx.y + Bx.h) - Math.max(A.y, Bx.y);
        if (ox <= 0.25 * Math.min(A.w, Bx.w)) continue; // 가로로 거의 안 겹침
        checked++;
        worst = Math.max(worst, oy / Math.min(A.h, Bx.h));
      }
    }
  }
  // 글자 상자(테두리·여백 포함)가 위아래로 살짝 닿는 것은 괜찮지만, 같은 줄에 겹쳐 다른 숫자처럼 읽히면 안 된다
  expect(checked).toBeGreaterThan(0); // 숫자가 실제로 몰리는 상황을 확인했다 (예전: 214쌍 중 완전히 겹친 쌍이 있었음)
  expect(worst).toBeLessThan(0.4);
  test.info().annotations.push({ type: 'overlap', description: `pairs=${checked} worst=${worst.toFixed(2)}` });
  expect(errors).toEqual([]);
});
