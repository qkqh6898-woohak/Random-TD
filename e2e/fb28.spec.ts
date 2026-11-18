/**
 * 피드백 #28 '인구수(인원 한도)를 돈으로 사기' — [⬆ 강화] [능력치 강화] 탭의 '🗼 인원 한도' 줄:
 * 누르면 돈을 내고 인원 한도 +1 (HUD '🗼 0/21'), 다음 비용이 오르고, 최대면 '최대'로 꺼진다.
 * 수치는 game.json upgrade.unitCap에서 읽는다 (여기 숫자는 지금 데이터 기준 기대값).
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { clickStart } from './title';

const game = JSON.parse(readFileSync('src/data/game.json', 'utf8')) as {
  board: { unitCap: number };
  upgrade: { unitCap: { perLevel: number; max: number; cost: [number, number] } };
};
const cfg = game.upgrade.unitCap;
const base = game.board.unitCap;

type SceneLike = {
  match: {
    state: { gold: number; upgrades: number[][] };
    world: { enqueue(c: unknown): { ok: boolean } };
  };
  debugFastForward(n: number): number;
};

async function inScene<T, A>(page: Page, fn: (s: SceneLike, arg: A) => T, arg: A): Promise<T> {
  return page.evaluate(
    ([src, a]) => {
      const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game');
      return new Function('s', 'a', `return (${src})(s, a);`)(s, a) as T;
    },
    [fn.toString(), arg] as const,
  );
}

test('피드백 #28: [⬆ 강화] 능력치 탭에서 인원 한도 +1을 돈으로 산다 (비싸지고 최대치)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?debug=1&seed=28');
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
  await expect(page.getByTestId('hud-towers')).toHaveText(`0/${base}`);
  await page.getByTestId('menu-upgrade').click();
  await page.getByTestId('sheet-tab-stat').click();
  const row = page.getByTestId('upgrade-row-unitCap');
  await expect(row).toBeVisible();
  await expect(row.locator('.up-lv')).toHaveText(`Lv 0/${cfg.max}`);
  await expect(row.locator('.up-effect')).toHaveText(`${base}명 → ${base + cfg.perLevel}명`);
  const gold0 = await inScene(page, (s) => s.match.state.gold, null);
  expect(gold0).toBeGreaterThanOrEqual(cfg.cost[0]);
  await page.getByTestId('upgrade-buy-unitCap').click();
  await expect(row.locator('.up-lv')).toHaveText(`Lv 1/${cfg.max}`);
  await expect(page.getByTestId('hud-towers')).toHaveText(`0/${base + cfg.perLevel}`);
  expect(await inScene(page, (s) => s.match.state.gold, null)).toBe(gold0 - cfg.cost[0]);
  await expect(page.getByTestId('upgrade-buy-unitCap')).toHaveText(`${cfg.cost[0] + cfg.cost[1]}원`);
  // 줄이 시트 안에 한 덩어리로 (좁은 휴대폰에서 버튼이 밖으로 나가지 않게)
  const sheet = (await page.getByTestId('sheet-upgrade').boundingBox())!;
  const btn = (await page.getByTestId('upgrade-buy-unitCap').boundingBox())!;
  expect(btn.x + btn.width).toBeLessThanOrEqual(sheet.x + sheet.width + 1);
  await row.scrollIntoViewIfNeeded();
  mkdirSync('docs/screens', { recursive: true });
  await page.screenshot({ path: 'docs/screens/FB28-unitcap.png', animations: 'disabled' });
  // 최대치: 레벨을 최대로 → '최대', 버튼 꺼짐
  await inScene(
    page,
    (s, max) => {
      s.match.state.upgrades[0]![s.match.state.upgrades[0]!.length - 1] = max;
      s.debugFastForward(1);
      return null;
    },
    cfg.max,
  );
  await expect(page.getByTestId('upgrade-buy-unitCap')).toHaveText('최대');
  await expect(page.getByTestId('upgrade-buy-unitCap')).toBeDisabled();
  await expect(row.locator('.up-effect')).toHaveText(`${base + cfg.max * cfg.perLevel}명 (최대)`);
  await expect(page.getByTestId('hud-towers')).toHaveText(`0/${base + cfg.max * cfg.perLevel}`);
  expect(errors).toEqual([]);
});
