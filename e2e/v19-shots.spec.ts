/**
 * v0.1.19 피드백 #63·#65·#66 스크린샷 (휴대폰 412×915, DPR 1). SAVE_SCREENS=1일 때만 돈다 (전체 E2E에서는 건너뜀).
 * docs/screens/V19-battle.png   아래 띠에 승급 화살표 없음 ([👷 일꾼 n/10] · [👷 300원]) + 맵 오른쪽 위 [⏫ 모두 승급 n] 하나
 * docs/screens/V19-settings.png 일시정지 메뉴 '자동 승급' [노말] [레어 이하] [유니크 이하] (레어 이하 켬)
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { clickStart } from './title';

test.skip(process.env.SAVE_SCREENS !== '1', 'SAVE_SCREENS=1일 때만');
test.describe.configure({ timeout: 150_000 });

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync('docs/screens', { recursive: true });
  await page.screenshot({ path: `docs/screens/${name}.png`, animations: 'disabled' });
}

test('V19-battle · V19-settings', async ({ page }) => {
  await page.goto('/?dev=1&seed=42');
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
  await page.evaluate(() => {
    const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game') as {
      match: { map: { buildable: [number, number][] }; rules: { towerOrder: string[] }; world: { enqueue(c: unknown): unknown } };
      debugFastForward(n: number): number;
    };
    const p = s.match.map.buildable;
    const put = (i: number, id: string, n: number): void => {
      for (let k = 0; k < n; k++) s.match.world.enqueue({ type: 'debugTower', x: p[i]![0], y: p[i]![1], t: s.match.rules.towerOrder.indexOf(id) });
    };
    put(0, 'miner', 3);
    put(1, 'archer', 2);
    put(3, 'windarcher', 3);
    put(5, 'icemage', 2);
    put(9, 'paladin', 3);
    put(12, 'goblin', 1);
    s.match.world.enqueue({ type: 'debugAddGold', amount: 3000 });
    s.debugFastForward(1);
  });
  await page.getByTestId('hud-hire').click();
  await page.getByTestId('hud-hire').click();
  await expect(page.getByTestId('hud-merge-all')).toHaveText('모두 승급 3'); // ART-2: ⏫는 아이콘 그림
  await expect(page.getByTestId('hud-workers')).toHaveText('2/10');
  await page.waitForTimeout(600);
  await shot(page, 'V19-battle');
  await page.locator('[data-action="pause"]').click();
  await page.getByTestId('pause-auto-merge-rare').click();
  await expect(page.getByTestId('pause-auto-merge-rare')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(300);
  await shot(page, 'V19-settings');
});
