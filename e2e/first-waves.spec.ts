import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import type { GameScene } from '../src/view/scenes/Game';

async function start(page: Page): Promise<void> {
  await page.goto('/?seed=42');
  await expect.poll(() => page.locator('.title-art').evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('button', { name: '시작' }).tap();
  await expect(page.getByTestId('hud-stage')).toHaveText('준비');
}

async function cellCenter(page: Page, tx: number, ty: number) {
  return page.evaluate(([x, y]) => {
    const w = window as unknown as { __rtd: { game: { scene: { getScene(key: string): {
      mapLayout: { tile: number; originX: number; originY: number };
    } } } } };
    const { tile, originX, originY } = w.__rtd.game.scene.getScene('Game').mapLayout;
    const box = document.querySelector('canvas')!.getBoundingClientRect();
    const scale = box.width / 1080;
    return { x: box.x + (originX + (x + 0.5) * tile) * scale, y: box.y + (originY + (y + 0.5) * tile) * scale };
  }, [tx, ty] as const);
}

test('빠른 소환은 빈 추천 칸을 사용하고 뒤로 가기는 열린 메뉴부터 닫는다', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await start(page);
  const summon = page.getByRole('button', { name: '빠른 소환' });
  await summon.tap();
  await expect(page.getByTestId('hud-towers')).toHaveText('1/71');
  const view = await page.evaluate(() => {
    const { __rtd } = window as unknown as { __rtd: { game: { scene: { getScene(key: string): GameScene } } } };
    const scene = __rtd.game.scene.getScene('Game');
    const [tower] = scene.match.towers();
    const animated = scene.textures.get(`tower-${tower!.tower}`).getSourceImage();
    return { nearEntry: tower!.ty <= 4, sprite: [animated.width, animated.height] };
  });
  expect(view).toEqual({ nearEntry: true, sprite: [220, 274] });
  await summon.tap();
  await expect(page.getByTestId('hud-towers')).toHaveText('2/71');
  await expect(page.getByTestId('hud-gold')).toHaveText('800원');
  await expect(page.getByTestId('hud-finish-prep')).toBeVisible();
  const back = () => page.evaluate(() => window.dispatchEvent(new Event('randomtd:native-back', { cancelable: true })));

  await page.getByTestId('hud-upgrade').tap();
  await expect(page.getByTestId('battle-upgrade')).toBeVisible();
  expect(await back()).toBe(false);
  await expect(page.getByTestId('battle-upgrade')).toHaveCount(0);
  await expect(page.getByTestId('hud-upgrade')).toBeFocused();
  await back();
  await expect(page.getByRole('dialog', { name: '일시정지' })).toBeVisible();
  await back();
  await expect(page.getByRole('dialog', { name: '일시정지' })).toHaveCount(0);
});

for (const viewport of [{ width: 360, height: 640 }, { width: 412, height: 915 }]) {
  test(`일반 시작 → 강화·미션 → 맵 → 준비 완료 (${viewport.width}px)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await start(page);
    const prep = page.getByTestId('hud-finish-prep');
    await expect(prep).toBeHidden();
    await page.getByTestId('hud-upgrade').tap();
    const sheet = page.getByTestId('battle-upgrade');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('노말·레어 공격력 +0% → +10%');
    const hud = page.locator('[data-screen="game"]');
    const tick = Number(await hud.getAttribute('data-tick'));
    await expect.poll(async () => Number(await hud.getAttribute('data-tick'))).toBeGreaterThan(tick);
    await page.getByTestId('upgrade-normal').tap();
    await expect(page.getByTestId('hud-gold')).toHaveText('950원');
    await expect(sheet).toContainText('노말·레어 공격력 +10% → +20%');
    await expect(page.getByTestId('upgrade-normal')).toHaveText('100원');

    await page.getByTestId('hud-missions').tap();
    await expect(page.getByRole('dialog', { name: '미션', exact: true })).toBeVisible();
    await expect(sheet).toHaveCount(0);
    await page.getByRole('button', { name: '미션 닫기' }).tap();
    await expect(page.getByTestId('battle-missions')).toHaveCount(0);
    for (const id of ['hud-upgrade', 'hud-missions']) {
      const box = (await page.getByTestId(id).boundingBox())!;
      const stage = (await page.locator('#stage').boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(stage.x);
      expect(box.x + box.width).toBeLessThanOrEqual(stage.x + stage.width + 0.5);
    }

    const lowerCell = await cellCenter(page, 4, 10);
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, lowerCell)).toBe('CANVAS');
    const cell = await cellCenter(page, 2, 2);
    await page.touchscreen.tap(cell.x, cell.y);
    await expect(page.getByTestId('hud-towers')).toHaveText('1/71');
    await expect(prep).toBeVisible();
    await prep.tap();
    await expect(page.getByTestId('hud-stage')).toHaveText('1단계');
    await expect(prep).toBeHidden();
  });
}

test('미션 배지, 진행도, 개별·일괄 수령과 연타 방지', async ({ page }) => {
  await start(page);
  await page.getByTestId('hud-upgrade').tap();
  const buy = page.getByTestId('upgrade-normal');
  for (const cost of [50, 100, 150, 200, 250]) {
    await expect(buy).toHaveText(`${cost}원`);
    await buy.tap();
  }
  await expect(page.getByTestId('hud-gold')).toHaveText('250원');
  await expect(buy).toBeDisabled();
  await expect(page.getByTestId('hud-mission-badge')).toHaveText('1');
  await page.getByTestId('hud-missions').tap();
  await expect(page.getByTestId('mission-list').locator('[data-mission]').first()).toHaveAttribute('data-mission', 'n15');
  const claim = page.getByTestId('claim-mission-n15');
  await expect(claim).toHaveText('받기');
  await claim.evaluate((btn: HTMLButtonElement) => { btn.click(); btn.click(); });
  await expect(claim).toHaveText('수령 완료');
  await expect(page.getByTestId('hud-gold')).toHaveText('450원');
  await expect(page.getByTestId('hud-mission-badge')).toBeHidden();

  await page.evaluate(() => {
    const w = window as unknown as { __rtd: { game: { scene: { getScene(key: string): { debugFastForward(ticks: number): void } } } } };
    w.__rtd.game.scene.getScene('Game').debugFastForward(1201);
  });
  const all = page.getByTestId('claim-all-missions');
  await expect(page.getByTestId('hud-mission-badge')).toHaveText('1');
  if (process.env.SAVE_SCREENS === '1') {
    mkdirSync('docs/screens', { recursive: true });
    await page.screenshot({ path: 'docs/screens/M5.png', animations: 'disabled' });
  }
  await all.tap();
  await expect(all).toBeDisabled();
  await expect(page.getByTestId('hud-gold')).toHaveText('750원');
});
