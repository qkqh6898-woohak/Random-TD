import { expect, test, type Page } from '@playwright/test';
import type { GameScene } from '../src/view/scenes/Game';
import type { GameContext } from '../src/view/context';
import { mkdirSync } from 'node:fs';
import { clickStart } from './title';

async function scene<T>(page: Page, fn: (s: GameScene, ctx: GameContext) => T): Promise<T> {
  return page.evaluate((src) => {
    const w = window as unknown as { __rtd: { game: { scene: { getScene(id: string): unknown } }; ctx: unknown } };
    return (0, eval)(src)(w.__rtd.game.scene.getScene('Game'), w.__rtd.ctx);
  }, `(${fn.toString()})`) as Promise<T>;
}

async function start(page: Page): Promise<void> {
  await page.goto('/?seed=7001');
  await clickStart(page);
  await expect(page.getByTestId('hud-stage')).toHaveText('준비');
}

test('일반 Lv1: 모든 배속 선택·×16 소환/고용 입력·실시간 효과음·자동 저장 제한·복원', async ({ page }) => {
  test.slow();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const w = window as unknown as { saveWrites: { at: number; tick: number; stage: number }[] };
    w.saveWrites = [];
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'rtd.match') {
        const p = JSON.parse(String(value).split('\n').slice(1).join('\n')) as { world: { tick: number; state: { stage: number } } };
        w.saveWrites.push({ at: performance.now(), tick: p.world.tick, stage: p.world.state.stage });
      }
      return original.call(this, key, value);
    };
  });
  await start(page);
  const speed = page.getByRole('button', { name: '배속', exact: true });
  await expect(speed).toHaveText('×1');
  for (const n of [2, 4, 8, 16, 1, 2, 4, 8, 16]) {
    await speed.click();
    await expect(speed).toHaveText(`×${n}`);
  }
  expect(await scene(page, (s) => s.match.state.debug)).toBe(false);
  await expect(page.getByRole('button', { name: '다음 단계로 즉시 이동' })).toHaveCount(0);
  const played = await scene(page, (_s, ctx) => ctx.audio.played);
  await page.getByTestId('hud-summon').click();
  await expect(page.getByTestId('hud-towers')).toHaveText(/^1\//);
  await page.getByTestId('hud-hire').click();
  await expect(page.getByTestId('hud-workers')).toHaveText(/^1\//);
  await expect.poll(() => scene(page, (_s, ctx) => ctx.audio.played)).toBeGreaterThan(played);
  // 배속 변경의 즉시 저장을 제외하고 주기 저장 간격을 잰다 (단계 변경은 즉시 저장 예외).
  await page.evaluate(() => { (window as unknown as { saveWrites: unknown[] }).saveWrites = []; });
  const tick = await scene(page, (s) => s.match.tick);
  await page.waitForTimeout(6500);
  expect(await scene(page, (s) => s.match.tick)).toBeGreaterThan(tick + 400);
  const writes = await page.evaluate(() => (window as unknown as { saveWrites: { at: number; stage: number }[] }).saveWrites);
  expect(writes.length).toBeGreaterThan(0);
  for (let i = 1; i < writes.length; i++) {
    if (writes[i]!.stage === writes[i - 1]!.stage) expect(writes[i]!.at - writes[i - 1]!.at).toBeGreaterThanOrEqual(2490);
  }
  await page.getByRole('button', { name: '일시정지', exact: true }).click();
  const saved = await scene(page, (s) => ({ hash: s.match.hash(), towers: s.match.towers().length, workers: s.match.state.workers }));
  await page.reload();
  await page.locator('[data-action="resume-match"]').click();
  // 복원 직후 정지시켜 시간 경과에 무관한 상태·배속을 확인한다.
  await page.getByRole('button', { name: '일시정지', exact: true }).click();
  expect(await scene(page, (s) => ({ towers: s.match.towers().length, workers: s.match.state.workers, resumed: s.saveState.resumed }))).toEqual({ towers: saved.towers, workers: saved.workers, resumed: true });
  await page.getByRole('button', { name: '계속', exact: true }).click();
  await expect(speed).toHaveText('×16');
  expect(errors).toEqual([]);
});

test('×16 프레임 초반 치명타도 큰 주황 숫자와 짧은 타격 효과, 일반 피해보다 우선', async ({ page }) => {
  await start(page);
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: '배속', exact: true }).click();
  const labels = await scene(page, (s) => {
    const t = s.match.tick;
    // 실제 다중 틱 프레임처럼 초반 사건을 넣고 다음 렌더가 소비하게 한다.
    for (let i = 0; i < 8; i++) s.match.world.emit('hit', { target: 999, source: 1, damage: 9000, p: 900000, m: 0, t: 0, crit: false, x: 3500, y: 3500 });
    s.match.world.emit('hit', { target: 999, source: 1, damage: 123, p: 12300, m: 0, t: 0, crit: true, x: 3500, y: 3500 });
    s.match.world.stepN(10);
    // GameScene의 프레임 범위처럼 지난 10틱을 지정 (연출 소비만 검증).
    const internals = s as unknown as { frameStartTick: number; handleEvents(time: number): void };
    internals.frameStartTick = t;
    internals.handleEvents(s.time.now);
    return { bounds: s.floatingTextBounds(), critical: s.abilityFxCount('critical') };
  });
  const critical = labels.bounds.find((b) => b.label === '123!');
  expect(critical?.big).toBe(true);
  expect(critical!.h).toBeGreaterThan(50);
  expect(labels.critical).toBe(1);
  mkdirSync('docs/screens', { recursive: true });
  await page.screenshot({ path: 'docs/screens/battle-update-critical.png' });
});

test('SD 일꾼과 보스 그림: 휴대폰 캡처, 보스는 기존 외부 그림 대신 SD 텍스처', async ({ page }) => {
  await start(page);
  await expect(page.locator('.hud-hire .hud-worker-art')).toBeVisible();
  const src = await page.locator('.hud-hire .hud-worker-art').getAttribute('src');
  expect(src).toContain('data:image/svg+xml');
  await page.getByTestId('hud-hire').click();
  await page.screenshot({ path: 'docs/screens/battle-update-workers.png' });
  const keys = await page.evaluate(async () => {
    const artPath = '/src/art/characters/phaserArt.ts';
    const { enemyCharacterTexture } = await import(artPath) as typeof import('../src/art/characters/phaserArt');
    const looksPath = '/src/art/characters/looks.ts';
    const { allLooks, isEnemyLook } = await import(looksPath) as typeof import('../src/art/characters/looks');
    const w = window as unknown as { __rtd: { game: { scene: { getScene(id: string): GameScene } } } };
    const s = w.__rtd.game.scene.getScene('Game');
    return allLooks().filter(isEnemyLook).filter((x) => x.rank !== 'minion').map((x) => enemyCharacterTexture(s, x.id, 0xb36bff)!.key);
  });
  expect(keys).toHaveLength(19);
  expect(keys.every((k) => k.startsWith('char-enemy-'))).toBe(true);
  await page.goto('/?gallery=1&tab=enemies&play=0');
  await expect(page.locator('canvas').first()).toBeVisible();
  await page.evaluate(async () => {
    const looksPath = '/src/art/characters/looks.ts';
    const drawPath = '/src/art/characters/enemies.ts';
    const { allLooks, isEnemyLook } = await import(looksPath) as typeof import('../src/art/characters/looks');
    const { drawEnemy } = await import(drawPath) as typeof import('../src/art/characters/enemies');
    const sheet = document.createElement('div');
    sheet.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#edf4db;color:#34283d;display:grid;grid-template-columns:repeat(4,1fr);align-content:start;padding:12px 4px;font:11px sans-serif;gap:8px 0';
    for (const look of allLooks().filter(isEnemyLook).filter((x) => x.rank !== 'minion')) {
      const card = document.createElement('div');
      card.style.cssText = 'text-align:center';
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 256;
      canvas.style.cssText = 'width:94px;height:94px;display:block;margin:auto';
      const c = canvas.getContext('2d')!;
      c.scale(2, 2); drawEnemy(c, look, '#B36BFF');
      card.append(canvas, document.createTextNode(look.name)); sheet.append(card);
    }
    document.body.append(sheet);
  });
  await page.screenshot({ path: 'docs/screens/battle-update-bosses.png' });
});
