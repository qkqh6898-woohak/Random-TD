import { expect, test, type Page } from '@playwright/test';
import type { GameScene } from '../src/view/scenes/Game';

interface TestWindow extends Window {
  __rtd: { game: { scene: { getScene(key: string): GameScene } } };
  diceSeen: Set<string>;
  shakeStarts: number;
}

async function inspectEffects(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as TestWindow;
    const scene = w.__rtd.game.scene.getScene('Game');
    w.diceSeen = new Set<string>();
    w.shakeStarts = 0;
    scene.events.on('postupdate', () => {
      for (const child of scene.children.list) {
        if (child.name.endsWith('-die')) w.diceSeen.add(child.name);
      }
    });
    scene.cameras.main.on('camerashakestart', () => { w.shakeStarts++; });
  });
}

test('소환과 승급에 주사위가 보이고 화면 흔들림은 기기에 저장된다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?seed=42');
  await page.getByRole('button', { name: '시작', exact: true }).tap();
  const pause = page.getByRole('button', { name: '일시정지' });
  const setting = page.getByRole('switch', { name: '화면 흔들림' });
  const resume = page.getByRole('button', { name: '계속' });
  await pause.tap();
  await expect(setting).toHaveAttribute('aria-checked', 'false');
  await setting.tap();
  await expect(setting).toHaveAttribute('aria-checked', 'true');
  await resume.tap();
  await inspectEffects(page);

  const quake = () => page.evaluate(() => {
    const w = window as unknown as TestWindow;
    w.__rtd.game.scene.getScene('Game').match.world.emit('quake');
  });
  const reads = () => page.evaluate(() => (window as unknown as TestWindow).shakeStarts);
  await quake();
  await expect.poll(reads).toBe(1);

  await pause.tap();
  await setting.tap();
  await expect(setting).toHaveAttribute('aria-checked', 'false');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.reload();
  await page.getByRole('button', { name: '이어 하기 준비' }).tap();
  await pause.tap();
  await expect(setting).toHaveAttribute('aria-checked', 'false');
  await resume.tap();
  await inspectEffects(page);

  const hud = page.locator('[data-screen="game"]');
  const tick = Number(await hud.getAttribute('data-tick'));
  await quake();
  await expect.poll(async () => Number(await hud.getAttribute('data-tick'))).toBeGreaterThan(tick + 2);
  expect(await reads()).toBe(0);

  await page.getByRole('button', { name: '빠른 소환' }).tap();
  await expect(page.getByTestId('hud-gold')).toHaveText('900원');
  const dice = () => page.evaluate(() => [...(window as unknown as TestWindow).diceSeen]);
  await expect.poll(dice).toContain('summon-die');

  await page.evaluate(() => {
    const w = window as unknown as TestWindow;
    const scene = w.__rtd.game.scene.getScene('Game');
    const { match } = scene;
    match.state.debug = true;
    for (const x of [2, 3, 4]) {
      match.world.enqueue({ type: 'debugTower', x, y: 5, t: match.rules.towerOrder.indexOf('miner') });
    }
    scene.debugFastForward(1);
    match.state.debug = false;
  });
  await page.getByRole('button', { name: '승급 가능', exact: false }).tap();
  await page.locator('[data-action="merge"]').tap();
  await expect.poll(dice).toEqual(expect.arrayContaining(['merge-material-die', 'merge-die']));
  await expect(page.getByTestId('hud-towers')).toHaveText('2/71');
});
