/**
 * v0.1.14 피드백 묶음 통합 스크린샷 (휴대폰 412×915, DPR 1). SAVE_SCREENS=1일 때만 돈다 (전체 E2E에서는 건너뜀).
 * docs/screens/V14-battle.png  마당 맵 무더기 1·2·3개(여러 등급) + 위 HUD 자원 줄 + [⏫ 모두 승급] + 아래 묶음
 * docs/screens/V14-panel.png   히어로 정보 패널: 머리 줄 [판매][✕] + 칸 왼쪽 위 [⬆]
 * docs/screens/V14-upgrade.png [⬆ 강화] 능력치 탭: 소환 확률(피드백 #27)·인원 한도(피드백 #28)
 * docs/screens/V14-lobby-heroes.png 로비 [영웅]: 정렬 [레벨업 가능]·[⬆ 모두 레벨업]
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { clickStart } from './title';

test.skip(process.env.SAVE_SCREENS !== '1', 'SAVE_SCREENS=1일 때만');
test.describe.configure({ timeout: 150_000 });

type SceneLike = {
  match: {
    state: { gold: number };
    map: { buildable: [number, number][] };
    towers(): { id: number; tx: number; ty: number; tower: string }[];
    rules: { towerOrder: string[] };
    world: { enqueue(c: unknown): { ok: boolean } };
  };
  mapLayout: { originX: number; originY: number; tile: number };
  debugFastForward(n: number): number;
};

async function inScene<R, A>(page: Page, fn: (s: SceneLike, arg: A) => R, arg: A): Promise<R> {
  return page.evaluate(
    ([src, a]) => {
      const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game');
      return new Function('s', 'a', `return (${src})(s, a);`)(s, a) as R;
    },
    [fn.toString(), arg] as const,
  );
}

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync('docs/screens', { recursive: true });
  await page.screenshot({ path: `docs/screens/${name}.png`, animations: 'disabled' });
}

async function startWithStacks(page: Page): Promise<[number, number][]> {
  // 눌러서 바로 승급을 끈다 → 가득 찬 무더기를 눌러도 패널이 열린다
  await page.addInitScript(() => localStorage.setItem('rtd.settings', JSON.stringify({ v: 1, tapMerge: false })));
  await page.goto('/?dev=1&seed=42');
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
  const pads = await inScene(page, (s) => s.match.map.buildable, null);
  await inScene(
    page,
    (s, p) => {
      const put = (i: number, id: string, n: number): void => {
        for (let k = 0; k < n; k++) s.match.world.enqueue({ type: 'debugTower', x: p[i]![0], y: p[i]![1], t: s.match.rules.towerOrder.indexOf(id) });
      };
      put(0, 'miner', 3); // 노말 3
      put(1, 'archer', 2); // 노말 2
      put(3, 'windarcher', 3); // 레어 3
      put(5, 'icemage', 2); // 유니크 2
      put(6, 'paladin', 1); // 히어로 1
      put(9, 'paladin', 3); // 히어로 3
      put(10, 'archmage', 2); // 레전드 2
      put(12, 'goblin', 1); // 노말 1
      put(14, 'fate', 1); // 신 1
      put(17, 'elemental', 1); // 리미티드 1
      put(19, 'merchant', 3); // 레어 3
      s.match.state.gold = 12_345;
      s.debugFastForward(1);
      return null;
    },
    pads,
  );
  return pads;
}

test('V14 전투 · 패널', async ({ page }) => {
  const pads = await startWithStacks(page);
  await expect(page.getByTestId('hud-merge-all')).toBeVisible();
  await page.waitForTimeout(900);
  await shot(page, 'V14-battle');
  // 히어로 3개 무더기를 눌러 정보 패널
  const [tx, ty] = pads[9]!;
  const p = await page.evaluate(
    ([x, y]) => {
      const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game') as SceneLike;
      const L = s.mapLayout;
      const r = document.getElementById('stage')!.getBoundingClientRect();
      const k = r.width / 1080;
      return { x: r.left + (L.originX + (x + 0.5) * L.tile) * k, y: r.top + (L.originY + (y + 0.5) * L.tile) * k };
    },
    [tx, ty] as const,
  );
  await page.touchscreen.tap(p.x, p.y);
  await expect(page.getByTestId('tp-sell')).toBeVisible();
  await expect(page.getByTestId('tq-merge')).toBeVisible();
  await page.waitForTimeout(700);
  await shot(page, 'V14-panel');
});

test('V14 강화 시트', async ({ page }) => {
  await page.goto('/?dev=1&seed=42');
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
  await inScene(page, (s) => { s.match.state.gold = 5_000; s.debugFastForward(1); return null; }, null);
  await page.getByTestId('menu-upgrade').click();
  await page.getByTestId('sheet-tab-stat').click();
  const unit = page.getByTestId('upgrade-row-unitCap');
  await expect(page.getByTestId('upgrade-row-summonLuck')).toBeVisible();
  await unit.scrollIntoViewIfNeeded();
  await expect(unit).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, 'V14-upgrade');
});

test('V14 로비 영웅', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-screen="title"][data-lobby="1"]')).toBeVisible();
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('rtd.progress')!);
    p.heroes.miner.cards = 5;
    p.heroes.archer.cards = 2;
    p.flame = 100;
    localStorage.setItem('rtd.progress', JSON.stringify(p));
  });
  await page.goto('/');
  await expect(page.locator('[data-screen="title"][data-lobby="1"]')).toBeVisible();
  await page.locator('.lobby-nav [data-tab="heroes"]').click();
  await page.locator('[data-sort="ready"]').click();
  await expect(page.getByTestId('hero-levelup-all')).toBeEnabled();
  await page.waitForTimeout(500);
  await shot(page, 'V14-lobby-heroes');
});
