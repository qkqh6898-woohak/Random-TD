import { expect, test } from '@playwright/test';
import type { GameScene } from '../src/view/scenes/Game';

interface AudioTestWindow extends Window {
  audioProbe: { notes: number[]; master: GainNode | null };
  __rtd: { game: { scene: { getScene(key: string): GameScene } } };
}

test('소환·승급 효과음과 음소거, 볼륨 저장을 확인한다', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.addInitScript(() => {
    const w = window as unknown as AudioTestWindow;
    w.audioProbe = { notes: [], master: null };
    const oscillator = AudioContext.prototype.createOscillator;
    const gain = AudioContext.prototype.createGain;
    AudioContext.prototype.createOscillator = function () {
      const node = oscillator.call(this);
      const setFrequency = node.frequency.setValueAtTime.bind(node.frequency);
      node.frequency.setValueAtTime = (hz, time) => {
        w.audioProbe.notes.push(hz);
        return setFrequency(hz, time);
      };
      return node;
    };
    AudioContext.prototype.createGain = function () {
      const node = gain.call(this);
      w.audioProbe.master ??= node;
      return node;
    };
  });

  await page.goto('/?seed=42');
  const notes = () => page.evaluate(() => (window as unknown as AudioTestWindow).audioProbe.notes);
  const volume = () => page.evaluate(() => (window as unknown as AudioTestWindow).audioProbe.master?.gain.value);
  expect(await volume()).toBeUndefined();
  await page.getByRole('button', { name: '시작', exact: true }).tap();
  const pause = page.getByRole('button', { name: '일시정지' });
  const slider = page.getByRole('slider', { name: '효과음 크기' });
  const preview = page.getByRole('button', { name: '효과음 미리 듣기' });
  const resume = page.getByRole('button', { name: '계속' });
  const summon = page.getByRole('button', { name: '빠른 소환' });

  await pause.tap();
  await expect(slider).toHaveValue('40');
  await slider.press('ArrowRight');
  await expect(slider).toHaveValue('45');
  expect(await volume()).toBeCloseTo(0.45);
  await preview.tap();
  await expect.poll(notes).toEqual([392, 523.25, 783.99]);

  await slider.press('Home');
  await expect(slider).toHaveAttribute('aria-valuetext', '음소거');
  await expect(preview).toBeDisabled();
  expect(await volume()).toBe(0);
  await resume.tap();
  await summon.tap();
  await expect(page.getByTestId('hud-gold')).toHaveText('900원');
  expect(await notes()).toHaveLength(3);

  await pause.tap();
  await slider.press('End');
  await slider.press('ArrowLeft');
  await page.reload();
  await page.getByRole('button', { name: '이어 하기 준비' }).tap();
  await pause.tap();
  await expect(slider).toHaveValue('95');
  expect(await volume()).toBeCloseTo(0.95);
  await resume.tap();
  await summon.tap();
  await expect(page.getByTestId('hud-gold')).toHaveText('800원');
  await expect.poll(notes).toEqual([300, 523.25]);

  await page.evaluate(() => {
    const w = window as unknown as AudioTestWindow;
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
  const beforeMerge = (await notes()).length;
  await page.locator('[data-action="merge"]').tap();
  await expect.poll(async () => (await notes()).slice(beforeMerge)).toEqual([392, 523.25, 783.99]);
  await expect(page.getByTestId('hud-towers')).toHaveText('3/71');
});
