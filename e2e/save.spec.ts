import { expect, test } from '@playwright/test';
import type { GameScene } from '../src/view/scenes/Game';

test('앱 백그라운드 → 화면 재실행 → 같은 판과 강화 복구', async ({ page }) => {
  await page.goto('/?seed=61');
  await page.getByRole('button', { name: '시작', exact: true }).tap();
  const hud = page.locator('[data-screen="game"]');
  await expect(hud).toBeVisible();
  const cell = await page.evaluate(() => {
    const { __rtd } = window as unknown as { __rtd: { game: { scene: { getScene(key: string): GameScene } } } };
    const { tile, originX, originY } = __rtd.game.scene.getScene('Game').mapLayout;
    const box = document.querySelector('canvas')!.getBoundingClientRect();
    return { x: box.x + (originX + 2.5 * tile) * box.width / 1080, y: box.y + (originY + 2.5 * tile) * box.width / 1080 };
  });
  await page.touchscreen.tap(cell.x, cell.y);
  await expect(page.getByTestId('hud-towers')).toHaveText('1/71');
  await page.getByTestId('hud-upgrade').tap();
  await page.getByTestId('upgrade-normal').tap();
  await expect(page.getByTestId('hud-gold')).toHaveText('850원');
  await page.getByRole('button', { name: '배속' }).tap();
  await page.getByTestId('hud-finish-prep').tap();
  await expect(page.getByTestId('hud-stage')).toHaveText('1단계');

  await page.evaluate(() => window.dispatchEvent(new Event('randomtd:native-pause')));
  await expect(page.getByText('자동 저장했어요. 타이틀에서 이어 할 수 있어요.')).toBeVisible();
  const pausedAt = Number(await hud.getAttribute('data-tick'));
  await page.reload();
  const resume = page.getByRole('button', { name: '이어 하기 1단계' });
  await expect(resume).toBeVisible();
  await page.getByRole('button', { name: '새 게임', exact: true }).tap();
  await page.getByRole('button', { name: '취소', exact: true }).tap();
  await resume.tap();
  await expect(page.getByTestId('hud-gold')).toHaveText('850원');
  await expect(page.getByTestId('hud-towers')).toHaveText('1/71');
  await expect(page.getByTestId('hud-stage')).toHaveText('1단계');
  await expect(page.getByRole('button', { name: '배속' })).toHaveText('×2');
  expect(Number(await hud.getAttribute('data-tick'))).toBeGreaterThanOrEqual(pausedAt);
  await page.getByTestId('hud-upgrade').tap();
  await expect(page.getByTestId('upgrade-normal')).toHaveText('100원');

  await page.getByRole('button', { name: '일시정지' }).tap();
  await page.getByRole('button', { name: '타이틀로' }).tap();
  await expect(resume).toBeVisible();
  await page.getByRole('button', { name: '새 게임', exact: true }).tap();
  await page.getByRole('button', { name: '새 게임 시작', exact: true }).tap();
  await expect(page.getByTestId('hud-stage')).toHaveText('준비');
  await expect(page.getByTestId('hud-gold')).toHaveText('1,000원');
  await expect(page.getByTestId('hud-towers')).toHaveText('0/71');
});

test('패배 뒤 최근 판이 최신순으로 남고 판마다 플레이 시간과 처치한 보스를 볼 수 있다', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/?seed=61');
  const records = page.getByRole('button', { name: '기록', exact: true });
  const dialog = page.getByRole('dialog', { name: '전투 기록' });
  const history = dialog.getByRole('region', { name: '최근 5판' });
  await records.tap();
  await expect(dialog.getByText('기록 없음', { exact: true })).toBeVisible();
  await expect(dialog.getByText('아직 처치한 보스가 없어요.')).toBeVisible();
  await expect(history.getByText('무한 모드에서 판이 끝나면 여기에 표시돼요.')).toBeVisible();
  await dialog.getByRole('button', { name: '닫기' }).tap();
  await page.getByRole('button', { name: '시작', exact: true }).tap();
  await expect(page.getByTestId('hud-stage')).toHaveText('준비');

  const duration = await page.evaluate(async () => {
    const killModule = '/src/sim/systems/Kill.ts';
    const challengeModule = '/src/sim/systems/Challenge.ts';
    const { killMob } = await import(killModule) as typeof import('../src/sim/systems/Kill');
    const { startChallenge } = await import(challengeModule) as typeof import('../src/sim/systems/Challenge');
    const { __rtd } = window as unknown as { __rtd: { game: { scene: { getScene(key: string): GameScene } } } };
    const scene = __rtd.game.scene.getScene('Game');
    const match = scene.match;
    match.state.stage = 9;
    match.state.nextStageTick = match.tick;
    scene.debugFastForward(1);
    killMob(match.ctx, match.world, match.mobs().find((mob) => mob.boss)!, 0, 0);
    killMob(match.ctx, match.world, startChallenge(match.ctx, match.world, 0, 1)!, 0, 0);
    match.state.stage = 19;
    match.state.nextStageTick = match.tick;
    scene.debugFastForward(1 + match.rules.bossTimeTicks);
    return Math.floor((match.state.defeatTick + 1) / 20);
  });
  const over = page.locator('[data-screen="gameover"]');
  await expect(over.getByText('새 최고 기록', { exact: false })).toBeVisible();
  await over.getByRole('button', { name: '타이틀로' }).tap();
  await page.getByRole('button', { name: '시작', exact: true }).tap();
  await expect(page.getByTestId('hud-stage')).toHaveText('준비');
  await page.evaluate(() => {
    const { __rtd } = window as unknown as { __rtd: { game: { scene: { getScene(key: string): GameScene } } } };
    __rtd.game.scene.getScene('Game').debugFastForward(20000);
  });
  await over.getByRole('button', { name: '타이틀로' }).tap();
  await expect(page.getByRole('button', { name: '시작', exact: true })).toBeVisible();
  await page.reload();
  await records.tap();
  await expect(dialog.locator('.title-records-best strong')).toHaveText('20단계');
  await expect(dialog.getByRole('listitem').filter({ hasText: '박쥐 여왕' })).toHaveText('박쥐 여왕10단계');
  await expect(dialog.getByText('킹 슬라임', { exact: true })).toHaveCount(0);
  const runs = history.locator('details');
  await expect(runs).toHaveCount(2);
  await expect(runs.nth(0).locator('summary strong')).toHaveText('8단계');
  await expect(runs.nth(0).getByText('처치한 보스 없음')).toBeVisible();
  const earlier = runs.nth(1);
  await expect(earlier.locator('summary strong')).toHaveText('20단계');
  await expect(earlier.locator('time')).toHaveAttribute('datetime', `PT${duration}S`);
  await expect(earlier.getByText('단계 보스 · 박쥐 여왕')).toBeHidden();
  await earlier.locator('summary').tap();
  await expect(earlier.getByText('단계 보스 · 박쥐 여왕')).toBeVisible();
  await expect(earlier.getByText('도전 보스 · 황금 슬라임')).toBeVisible();
  if (process.env.SAVE_SCREENS === '1') {
    await page.screenshot({ path: 'docs/screens/M6-recent.png', animations: 'disabled' });
  }
});
