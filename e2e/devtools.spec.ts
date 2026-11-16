/**
 * T-1 E2E: 개발자 모드 (?dev=1 · ?debug=1 · 테스트 빌드) — ⏭ 다음 단계로 즉시 이동(누를 때마다·빠른 연타·길게 누르기·×16·보스 단계),
 * 개발자 배속 ×1 → ×2 → ×4 → ×8 → ×16 → ×1 (T-2, 5초 틱 수 측정), 일반 주소에는 둘 다 없음, 한 파일 빌드(file://, 서버 없음).
 * sim은 window.__rtd로 읽기만 하고 버튼은 화면에서 누른다.
 */
import { expect, test, type Page } from '@playwright/test';
import { clickStart } from './title';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// 5초 측정 여러 번 + 헤드리스 Chromium(초당 몇 프레임)이라 길게
test.describe.configure({ timeout: 150_000 });

type SceneLike = {
  match: {
    tick: number;
    defeated: boolean;
    state: { stage: number; stageStartTick: number; bossStage: boolean; bossId: string; gold: number; debugUsed: boolean };
    towers(): unknown[];
    mobCount(): number;
    world: { executed: { type: string; tick: number }[] };
  };
  mapLayout: { originX: number; originY: number; tile: number };
  simStats: { avgTickMs: number; droppedTicks: number; speed: number };
};

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  return errors;
}

async function sim<T>(page: Page, fn: (s: SceneLike) => T): Promise<T> {
  return page.evaluate(
    (src) => {
      const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game');
      return (0, eval)(src)(s);
    },
    `(${fn.toString()})`,
  ) as Promise<T>;
}

async function startGame(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
}

/** 배속 버튼을 눌러 원하는 배속으로 (지나간 이름표를 돌려준다). */
async function setSpeed(page: Page, label: string): Promise<string[]> {
  const speed = page.getByRole('button', { name: '배속' });
  const seen: string[] = [];
  for (let i = 0; i < 8; i++) {
    const now = (await speed.textContent()) ?? '';
    if (now === label) return seen;
    await speed.click();
    await expect(speed).not.toHaveText(now);
    seen.push((await speed.textContent()) ?? '');
  }
  throw new Error(`배속 ${label}에 닿지 못함 (${seen.join(' → ')})`);
}

/** 실제 시간 ms 동안 돈 틱 수 (게임 틱 = HUD data-tick이 아니라 sim 값). */
async function ticksIn(page: Page, ms: number): Promise<number> {
  const a = await sim(page, (s) => s.match.tick);
  await page.waitForTimeout(ms);
  return (await sim(page, (s) => s.match.tick)) - a;
}

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync('test-results/screens', { recursive: true });
  await page.screenshot({ path: `test-results/screens/${name}.png`, animations: 'disabled' });
}

test('?dev=1: ⏭ 누를 때마다 다음 단계가 바로 시작 — HUD·sim, 빠른 연타 5번 = 5단계, ×16에서도, 보스 단계에서도 패배 없음', async ({ page }) => {
  const errors = collectErrors(page);
  await startGame(page, '/?dev=1&seed=21');
  const skip = page.getByRole('button', { name: '다음 단계로 즉시 이동' });
  const stage = page.getByTestId('hud-stage');
  await expect(skip).toBeVisible();
  await expect(page.getByRole('button', { name: '돈 추가 (디버그)' })).toBeVisible();

  /** 마지막 ⏭ 명령이 들어간 틱(= 누른 뒤 첫 틱)과 지금 단계의 시작 틱 */
  const lastSkip = (): Promise<{ stage: number; started: number; cmdTick: number }> =>
    sim(page, (x) => ({
      stage: x.match.state.stage,
      started: x.match.state.stageStartTick,
      cmdTick: x.match.world.executed.filter((c) => c.type === 'debugSkipStage').slice(-1)[0]?.tick ?? -1,
    }));

  // ×1: 누를 때마다 HUD 단계가 바로 하나 오른다 — 명령은 누른 뒤 첫 틱에 실행되고 그 틱이 새 단계의 시작 틱
  for (let s = 1; s <= 3; s++) {
    await skip.click();
    await expect(stage).toHaveText(`${s}단계`, { timeout: 3000 });
    const v = await lastSkip();
    expect(v.stage).toBe(s);
    expect(v.started).toBe(v.cmdTick);
  }

  // 빠른 연타: 한 프레임 안에 5번 → 5단계 (같은 틱에 명령 여러 개도 하나씩)
  await page.evaluate(() => {
    const b = document.querySelector<HTMLButtonElement>('[data-action="skip-stage"]')!;
    for (let i = 0; i < 5; i++) b.click();
  });
  await expect(stage).toHaveText('8단계', { timeout: 3000 });
  // Playwright 클릭으로 빠르게 2번
  await skip.click();
  await skip.click();
  await expect(stage).toHaveText('👑 10단계', { timeout: 3000 });
  await expect(page.getByTestId('hud-boss')).toBeVisible();
  expect(await sim(page, (x) => x.match.state.bossId)).not.toBe('');

  // 보스 단계에서 ⏭: 보스를 보상 없이 지우고 바로 11단계, 보스 막대 숨김
  const gold = await sim(page, (x) => x.match.state.gold);
  await skip.click();
  await expect(stage).toHaveText('11단계', { timeout: 3000 });
  await expect(page.getByTestId('hud-boss')).toBeHidden();
  expect(await sim(page, (x) => ({ boss: x.match.state.bossId, gold: x.match.state.gold, stageBoss: x.match.state.bossStage }))).toEqual({ boss: '', gold, stageBoss: false });

  // ×16에서도 누를 때마다 하나씩
  const seen = await setSpeed(page, '×16');
  expect(seen).toEqual(['×2', '×4', '×8', '×16']);
  const before = await sim(page, (x) => x.match.state.stage);
  const cmdsBefore = await sim(page, (x) => x.match.world.executed.filter((c) => c.type === 'debugSkipStage').length);
  await skip.click();
  await expect.poll(() => sim(page, (x) => x.match.world.executed.filter((c) => c.type === 'debugSkipStage').length), { timeout: 3000 }).toBe(cmdsBefore + 1);
  const v16 = await lastSkip();
  // ×16에서도 누른 뒤 첫 틱이 새 단계의 시작 틱 (그 사이 원래 60초가 다 차서 넘어가는 일은 없다)
  expect(v16.started).toBe(v16.cmdTick);
  expect(v16.stage).toBeGreaterThanOrEqual(before + 1);
  await expect(stage).toHaveText(`${v16.stage}단계`);
  // 원래 보스 제한 시각이 지나도 (×16 약 4초) 패배하지 않는다
  await page.waitForTimeout(5000);
  expect(await sim(page, (x) => x.match.defeated)).toBe(false);
  await expect(page.locator('[data-screen="gameover"]')).toHaveCount(0);
  await shot(page, 'T1-dev-x16');
  expect(errors).toEqual([]);
});

test('?dev=1: ⏭를 길게 누르면 초당 약 4번 계속 넘어간다', async ({ page }) => {
  const errors = collectErrors(page);
  await startGame(page, '/?dev=1&seed=22');
  const skip = page.locator('[data-action="skip-stage"]');
  await skip.dispatchEvent('pointerdown', { button: 0, pointerType: 'touch', isPrimary: true });
  await page.waitForTimeout(1350); // 0 · 0.38 · 0.63 · 0.88 · 1.13초 = 5번
  await skip.dispatchEvent('pointerup', { button: 0, pointerType: 'touch', isPrimary: true });
  const skips = (): Promise<{ cmds: number; stage: number }> =>
    sim(page, (x) => ({ cmds: x.match.world.executed.filter((c) => c.type === 'debugSkipStage').length, stage: x.match.state.stage }));
  await page.waitForTimeout(600);
  const a = await skips();
  // 명령 하나 = 한 단계, 1.35초 동안 약 5번 (부하가 있으면 타이머가 밀려 조금 적거나 많을 수 있다)
  expect(a.stage).toBe(a.cmds);
  expect(a.cmds).toBeGreaterThanOrEqual(3);
  expect(a.cmds).toBeLessThanOrEqual(8);
  // 손을 떼면 멈춘다
  await page.waitForTimeout(800);
  expect(await skips()).toEqual(a);
  await expect(page.getByTestId('hud-stage')).toHaveText(`${a.stage}단계`);
  expect(errors).toEqual([]);
});

test('?dev=1: 배속 ×1 → ×2 → ×4 → ×8 → ×16 → ×1 (T-2: ×3 없음), 5초 틱 수가 배속만큼 (×16 ≈ 1600), ×16 글자가 412·320px에서 넘치지 않음', async ({ page }, info) => {
  const errors = collectErrors(page);
  await startGame(page, '/?dev=1&seed=23');
  const speed = page.getByRole('button', { name: '배속' });
  await expect.poll(() => sim(page, (s) => s.match.tick)).toBeGreaterThan(0);
  const x1 = await ticksIn(page, 5000);
  expect(await setSpeed(page, '×4')).toEqual(['×2', '×4']);
  const x4 = await ticksIn(page, 5000);
  expect(await setSpeed(page, '×16')).toEqual(['×8', '×16']);
  const x16 = await ticksIn(page, 5000);
  const stats = await sim(page, (s) => s.simStats);
  info.annotations.push({ type: 'ticks-5s', description: `×1 ${x1} · ×4 ${x4} · ×16 ${x16} (버린 틱 ${stats.droppedTicks}, 틱 평균 ${stats.avgTickMs.toFixed(3)}ms)` });
  console.log(`[T-1 측정] 5초 틱 수: ×1 ${x1} · ×4 ${x4} · ×16 ${x16} (기대 100 · 400 · 1600), 버린 틱 ${stats.droppedTicks}`);
  expect(x1).toBeGreaterThan(60);
  expect(x4).toBeGreaterThan(x1 * 2.5);
  expect(x16).toBeGreaterThan(x4 * 2.5);
  expect(x16).toBeGreaterThan(800); // 조용한 헤드리스 약 1350~1600 (프레임이 250ms를 넘으면 그만큼 잘림)
  expect(x16).toBeLessThanOrEqual(1650);
  // ×16 글자가 칩 안에 들어가고 HUD 줄이 넘치지 않는다
  const fits = async (): Promise<{ chip: boolean; rows: boolean }> =>
    page.evaluate(() => {
      const b = document.querySelector<HTMLElement>('[data-action="speed"]')!;
      const rows = [...document.querySelectorAll<HTMLElement>('.hud-row')].every((r) => r.scrollWidth <= r.clientWidth);
      return { chip: b.scrollWidth <= b.clientWidth + 0.5, rows };
    });
  await expect(speed).toHaveText('×16');
  expect(await fits()).toEqual({ chip: true, rows: true });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.waitForTimeout(300);
  expect(await fits()).toEqual({ chip: true, rows: true });
  await page.setViewportSize({ width: 412, height: 915 });
  await speed.click();
  await expect(speed).toHaveText('×1');
  expect(errors).toEqual([]);
});

test('일반 주소: ⏭·💰+ 없음, 배속은 예전대로 ×1 ↔ ×2 (×4 이상 없음)', async ({ page }) => {
  const errors = collectErrors(page);
  await startGame(page, '/?seed=24');
  await expect(page.getByRole('button', { name: '다음 단계로 즉시 이동' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '돈 추가 (디버그)' })).toHaveCount(0);
  const speed = page.getByRole('button', { name: '배속' });
  const seen: string[] = [];
  for (let i = 0; i < 3; i++) {
    await speed.click();
    seen.push((await speed.textContent()) ?? '');
  }
  expect(seen).toEqual(['×2', '×1', '×2']);
  // 일반 판에는 window.__rtd도 없다 (개발 서버라 열려 있으면 debug 판이 아님만 확인)
  const debug = await page.evaluate(() => {
    const r = (window as unknown as { __rtd?: { ctx: { debug: boolean } } }).__rtd;
    return r ? r.ctx.debug : false;
  });
  expect(debug).toBe(false);
  expect(errors).toEqual([]);
});

test.describe('한 파일 빌드 (npm run build:single → release/운빨디펜스-test.html)', () => {
  const file = resolve('release/운빨디펜스-test.html');

  test.beforeAll(() => {
    // 빌드는 1~2초 (vite build + 한 파일로 묶기)
    execFileSync(process.execPath, ['tools/build-single.mjs'], { stdio: 'pipe', timeout: 120_000 });
    expect(existsSync(file)).toBe(true);
  });

  test('file://로 (서버 없이) 타이틀 → 시작 → 소환, 개발자 도구(⏭·×16)가 주소 옵션 없이 보이고 콘솔 오류 없음', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(pathToFileURL(file).href);
    await expect(page).toHaveTitle('운빨 디펜스');
    expect(await page.evaluate(() => typeof (window as unknown as { __RTD_ASSETS__?: unknown }).__RTD_ASSETS__)).toBe('object');
    await clickStart(page);
    await expect(page.locator('[data-screen="game"]')).toBeVisible();
    // 빈 칸 (2, 4)를 눌러 소환 → 돈 1,000 → 900원, 타워 1개 (순환의 정원 v2 고리 안쪽 블록)
    const p = await sim(page, (s) => s.mapLayout);
    const box = await page.locator('#stage').boundingBox();
    const k = box!.width / 1080;
    await page.touchscreen.tap(box!.x + (p.originX + 2.5 * p.tile) * k, box!.y + (p.originY + 4.5 * p.tile) * k);
    await expect.poll(() => sim(page, (s) => s.match.towers().length)).toBe(1);
    await expect(page.getByTestId('hud-gold')).toHaveText('900원');
    // 개발자 도구
    const skip = page.getByRole('button', { name: '다음 단계로 즉시 이동' });
    await expect(skip).toBeVisible();
    await skip.click();
    await expect(page.getByTestId('hud-stage')).toHaveText('1단계', { timeout: 3000 });
    expect(await setSpeed(page, '×16')).toEqual(['×2', '×4', '×8', '×16']);
    await shot(page, 'T1-single-file');
    expect(errors).toEqual([]);
  });
});
