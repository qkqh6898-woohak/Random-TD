/**
 * 피드백 #66 '일꾼 소환 버튼 꾹 누르면 계속 소환되게 하기. 유닛 크기 주변 유닛 유무에 따라 변하는거 없애기.'
 * - [👷 고용]: 짧게 누르면 한 명, 꾹 누르면 손을 뗄 때까지(또는 돈·최대까지) 계속 고용.
 * - 유닛 그림 크기: 옆 칸에 타워를 놓아도 크기가 그대로 (예전: 혼자 2배 → 붙으면 1.4배). 크기 고침은 v0.1.17
 *   (towerGeom.figureArtScale)에 이미 들어가 있어 여기서는 그 동작을 지키는 검사만 남긴다 (PR #72의 크기 변경은 쓰지 않음).
 */
import { expect, test, type Page } from '@playwright/test';
import { clickStart } from './title';

type SceneLike = {
  match: {
    state: { gold: number; workers: number };
    towers(): { id: number; tx: number; ty: number; tower: string }[];
    map: { buildable: [number, number][] };
    rules: { towerOrder: string[]; workerCost: number; workerMax: number };
    world: { enqueue(c: unknown): { ok: boolean } };
  };
  towerLayer: { artScaleOf(id: number): number | null };
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

async function start(page: Page): Promise<void> {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto('/?debug=1&seed=66');
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
}

async function workers(page: Page): Promise<number> {
  return inScene(page, (s) => s.match.state.workers, null);
}

test('피드백 #66: [👷 고용] 짧게 누르면 한 명, 꾹 누르면 계속 고용 — 손을 떼면 멈춤, 돈이 모자라면 멈춤', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  const hire = page.getByTestId('hud-hire');
  await expect(hire).toBeVisible();
  // 돈을 넉넉히 (최대 인원까지 살 수 있게)
  await inScene(page, (s) => {
    s.match.world.enqueue({ type: 'debugAddGold', amount: s.match.rules.workerCost * s.match.rules.workerMax * 2 });
    s.debugFastForward(1);
    return null;
  }, null);
  // 짧게 누르기 = 한 명
  await hire.click();
  await expect.poll(() => workers(page)).toBe(1);
  await page.waitForTimeout(600);
  expect(await workers(page)).toBe(1);

  // 꾹 누르기 = 계속 (첫 기다림 0.38초 뒤 0.25초마다)
  const box = (await hire.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(() => workers(page), { timeout: 5000 }).toBeGreaterThanOrEqual(4);
  await page.mouse.up();
  await page.waitForTimeout(300);
  const held = await workers(page);
  await page.waitForTimeout(800);
  expect(await workers(page), '손을 떼면 더 고용하지 않는다').toBe(held);

  // 끝까지 꾹 누르면 최대 인원에서 멈춘다 (넘치지 않음)
  await page.mouse.down();
  const max = await inScene(page, (s) => s.match.rules.workerMax, null);
  await expect.poll(() => workers(page), { timeout: 8000 }).toBe(max);
  await page.waitForTimeout(500);
  await page.mouse.up();
  expect(await workers(page)).toBe(max);
  await expect(page.getByTestId('hud-workers')).toHaveText(`${max}/${max}`);
  expect(errors).toEqual([]);
});

test('피드백 #66: [👷 고용] 꾹 누르기는 돈이 모자라면 멈춘다', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  // 시작 돈으로 살 수 있는 만큼만 (일꾼 수입·처치 보상이 끼어도 한 명 이상 차이 나지 않게 금방 확인)
  const { gold, cost } = await inScene(page, (s) => ({ gold: s.match.state.gold, cost: s.match.rules.workerCost }), null);
  const affordable = Math.floor(gold / cost);
  expect(affordable).toBeGreaterThanOrEqual(2);
  const box = (await page.getByTestId('hud-hire').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(() => workers(page), { timeout: 5000 }).toBe(affordable);
  await page.waitForTimeout(800);
  await page.mouse.up();
  expect(await workers(page)).toBe(affordable);
  expect(await inScene(page, (s) => s.match.state.gold, null)).toBeGreaterThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('피드백 #66: 옆 칸에 타워를 놓거나 치워도 유닛 그림 크기가 그대로', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  // 오른쪽·아래 이웃이 있는 배치 칸 하나 (맨 위 줄은 빼서 HUD 높이 제한이 크기를 정하지 않게)
  const pair = await inScene(page, (s) => {
    const set = new Set(s.match.map.buildable.map(([x, y]) => `${x},${y}`));
    const top = Math.min(...s.match.map.buildable.map(([, y]) => y));
    for (const [x, y] of s.match.map.buildable) if (y > top + 1 && set.has(`${x + 1},${y}`) && set.has(`${x},${y + 1}`)) return { x, y };
    return null;
  }, null);
  expect(pair).not.toBeNull();
  const { x, y } = pair!;
  const order = await inScene(page, (s) => s.match.rules.towerOrder, null);
  const put = async (tx: number, ty: number, id: string) => {
    const ok = await inScene(page, (s, a) => s.match.world.enqueue({ type: 'debugTower', x: a.tx, y: a.ty, t: s.match.rules.towerOrder.indexOf(a.id) }).ok, { tx, ty, id });
    expect(ok).toBe(true);
    await inScene(page, (s) => s.debugFastForward(1), null);
  };
  await put(x, y, 'stonegolem');
  const golem = (await inScene(page, (s) => s.match.towers(), null)).find((t) => t.tx === x && t.ty === y)!;
  await expect.poll(() => inScene(page, (s, id) => s.towerLayer.artScaleOf(id), golem.id)).not.toBeNull();
  await page.waitForTimeout(200);
  const alone = (await inScene(page, (s, id) => s.towerLayer.artScaleOf(id), golem.id))!;
  // 이웃 둘 (오른쪽·아래, 다른 캐릭터라 무더기로 합쳐지지 않음)
  const other = order.find((id) => id !== 'stonegolem')!;
  await put(x + 1, y, other);
  await put(x, y + 1, other);
  await expect.poll(() => inScene(page, (s) => s.match.towers().length, null)).toBe(3);
  await page.waitForTimeout(300);
  const crowded = (await inScene(page, (s, id) => s.towerLayer.artScaleOf(id), golem.id))!;
  expect(crowded, '이웃이 붙어도 같은 크기').toBeCloseTo(alone, 6);
  // 이웃을 치워도 그대로
  await inScene(page, (s, a) => {
    for (const t of s.match.towers()) if (t.id !== a) s.match.world.enqueue({ type: 'sellTower', x: t.tx, y: t.ty });
    s.debugFastForward(1);
    return null;
  }, golem.id);
  await expect.poll(() => inScene(page, (s) => s.match.towers().length, null)).toBe(1);
  await page.waitForTimeout(200);
  expect((await inScene(page, (s, id) => s.towerLayer.artScaleOf(id), golem.id))!).toBeCloseTo(alone, 6);
  expect(errors).toEqual([]);
});
