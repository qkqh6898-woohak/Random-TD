/**
 * M1 E2E: 순환의 정원 맵·몹·단계·HUD(값이 sim과 일치)·패배·캠페인 1(debug) (휴대폰 뷰포트 412×915).
 * sim 상태는 개발 서버에서 열리는 window.__rtd 로 읽는다 (화면은 읽기만, 빨리 감기는 장면의 debugFastForward).
 * 스크린샷: test-results/screens/ (항상), docs/screens/M1.png (SAVE_SCREENS=1, `npm run screens`).
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SAVE_DOCS = process.env.SAVE_SCREENS === '1';

interface SimView {
  tick: number;
  stage: number;
  mobs: number;
  rendered: number;
  ticksLeft: number;
  lives: number;
  gold: number;
  phase: string;
  mapId: string;
  boss: boolean;
}

/** 장면에서 sim 값을 읽는다. */
async function simView(page: Page): Promise<SimView> {
  return page.evaluate(() => {
    const w = window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } };
    const scene = w.__rtd.game.scene.getScene('Game') as {
      match: {
        tick: number;
        state: { stage: number; lives: number; gold: number; phase: string; mapId: string; bossStage: boolean };
        mobCount(): number;
        ticksToNextStage(): number;
      };
      renderedMobCount: number;
    };
    const m = scene.match;
    return {
      tick: m.tick,
      stage: m.state.stage,
      mobs: m.mobCount(),
      rendered: scene.renderedMobCount,
      ticksLeft: m.ticksToNextStage(),
      lives: m.state.lives,
      gold: m.state.gold,
      phase: m.state.phase,
      mapId: m.state.mapId,
      boss: m.state.bossStage,
    };
  });
}

/** 틱 n번을 화면 없이 빨리 돌린다 (배속을 크게 올린 것과 같음). */
async function fastForward(page: Page, ticks: number): Promise<number> {
  return page.evaluate((n) => {
    const w = window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } };
    return (w.__rtd.game.scene.getScene('Game') as { debugFastForward(n: number): number }).debugFastForward(n);
  }, ticks);
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  return errors;
}

async function shot(page: Page, name: string, docsName?: string): Promise<void> {
  mkdirSync('test-results/screens', { recursive: true });
  await page.screenshot({ path: `test-results/screens/${name}.png`, animations: 'disabled' });
  if (SAVE_DOCS && docsName) {
    mkdirSync('docs/screens', { recursive: true });
    await page.screenshot({ path: `docs/screens/${docsName}.png`, animations: 'disabled' });
  }
}

const timerText = (ticksLeft: number): string => {
  const sec = Math.ceil(Math.max(0, ticksLeft) / 20);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

async function startInfinite(page: Page, query = '?seed=42'): Promise<void> {
  await page.goto(`/${query}`);
  await page.getByRole('button', { name: '시작' }).click();
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
}

test('[시작] → 무한 모드 순환의 정원: 0단계 준비, 몹 0/150, 시작 자금 1,000원', async ({ page }) => {
  const errors = collectErrors(page);
  await startInfinite(page);
  await expect(page.getByTestId('hud-stage')).toHaveText('준비');
  await expect(page.getByTestId('hud-count')).toHaveText('0/150');
  await expect(page.getByTestId('hud-gold')).toHaveText('1,000원');
  const v = await simView(page);
  expect(v.mapId).toBe('circle');
  expect(v.gold).toBe(1000);
  // 보스 배너는 보스 단계에만
  await expect(page.getByTestId('hud-boss')).toBeHidden();
  // debug가 아니면 단계 건너뛰기 버튼 없음
  await expect(page.getByRole('button', { name: '다음 단계로 즉시 이동' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('HUD 값이 sim과 일치: 단계·타이머·몹 수, 화면 몹 수 = sim 몹 수', async ({ page }) => {
  const errors = collectErrors(page);
  await startInfinite(page);
  // ⏸로 시간을 멈춘 뒤 비교 (그 사이 틱이 흐르지 않게)
  await page.getByRole('button', { name: '일시정지' }).click();
  const before = await simView(page);
  await fastForward(page, 2300 - before.tick); // 1단계 시작(1200) + 1100틱 → 슬라임 20마리
  await page.waitForTimeout(150);
  const v = await simView(page);
  expect(v.stage).toBe(1);
  expect(v.mobs).toBe(20);
  await expect(page.getByTestId('hud-stage')).toHaveText('1단계');
  await expect(page.getByTestId('hud-count')).toHaveText(`${v.mobs}/150`);
  await expect(page.getByTestId('hud-timer')).toHaveText(timerText(v.ticksLeft));
  expect(v.rendered).toBe(v.mobs);

  await fastForward(page, 1300); // 2단계 중간
  await page.waitForTimeout(150);
  const v2 = await simView(page);
  expect(v2.stage).toBe(2);
  await expect(page.getByTestId('hud-stage')).toHaveText('2단계');
  await expect(page.getByTestId('hud-count')).toHaveText(`${v2.mobs}/150`);
  await expect(page.getByTestId('hud-timer')).toHaveText(timerText(v2.ticksLeft));
  expect(v2.rendered).toBe(v2.mobs);

  // [계속] → 몹이 고리를 따라 계속 돈다 (틱이 흐름)
  await page.getByRole('button', { name: '계속' }).click();
  await expect.poll(async () => (await simView(page)).tick, { timeout: 5000 }).toBeGreaterThan(v2.tick + 10);
  expect(errors).toEqual([]);
});

test('순환의 정원 화면 (M1 스크린샷): 3단계, 슬라임 무리가 고리를 돈다', async ({ page }) => {
  const errors = collectErrors(page);
  await startInfinite(page, '?seed=42');
  const v0 = await simView(page);
  await fastForward(page, 3600 + 520 - v0.tick); // 3단계 시작 + 26초 → 약 50마리
  // 빨리 감기로 단계가 여러 번 바뀌어도 알림은 마지막 단계 하나
  await expect(page.locator('.toast')).toHaveCount(1);
  await expect(page.locator('.toast')).toHaveText('3단계 시작!');
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 4000 }); // 알림이 사라진 뒤 촬영
  const v = await simView(page);
  expect(v.stage).toBe(3);
  expect(v.rendered).toBe(v.mobs);
  expect(v.mobs).toBeGreaterThan(45);
  await shot(page, 'M1-infinite', 'M1');
  expect(errors).toEqual([]);
});

test('패배: 151마리째에 패배 화면 → [다시 하기]로 새 판 → ⏸ [타이틀로]', async ({ page }) => {
  const errors = collectErrors(page);
  await startInfinite(page, '?seed=42');
  await fastForward(page, 20000);
  const v = await simView(page);
  expect(v.phase).toBe('defeat');
  expect(v.stage).toBe(8);
  expect(v.mobs).toBe(151);
  const over = page.locator('[data-screen="gameover"]');
  await expect(over).toBeVisible();
  await expect(over).toContainText('8단계에서 몹이 150마리를 넘었어요');
  await expect(page.getByTestId('hud-count')).toHaveText('151/150');
  await expect(page.locator('.hud-count')).toHaveClass(/is-danger/);
  // 패배 뒤에는 시간이 멈춘다
  const t = (await simView(page)).tick;
  await page.waitForTimeout(400);
  expect((await simView(page)).tick).toBe(t);
  await shot(page, 'M1-defeat');

  await page.getByRole('button', { name: '다시 하기' }).click();
  await expect(over).toHaveCount(0);
  await expect(page.getByTestId('hud-stage')).toHaveText('준비');
  await expect(page.getByTestId('hud-count')).toHaveText('0/150');
  await expect.poll(async () => (await simView(page)).tick, { timeout: 5000 }).toBeGreaterThan(5);

  await page.getByRole('button', { name: '일시정지' }).click();
  await page.getByRole('button', { name: '타이틀로' }).click();
  await expect(page.locator('[data-screen="title"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('?debug=1: [캠페인 1] → 사거리 미로, 목숨 20 → 몹이 출구에 닿으면 줄어든다', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?debug=1&seed=3');
  await page.getByRole('button', { name: '캠페인 1 (디버그)' }).click();
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
  await expect(page.getByTestId('hud-stage')).toHaveText('1-준비');
  await expect(page.getByTestId('hud-count')).toHaveText('20');
  await expect(page.getByTestId('hud-count')).toHaveAttribute('aria-label', '목숨');
  const v0 = await simView(page);
  expect(v0.mapId).toBe('crossroads');
  // 1단계 첫 슬라임(1200)이 59칸(T-3 2×2 블록 맵)을 39.4초(787틱)에 지나 출구(틱 1986) → 목숨 19, 둘째 → 18 …
  // 2단계 시작(2400)까지 100틱(5초) 여유를 둔다 (헤드리스 화면이 느려도 1-1에서 확인하게)
  await fastForward(page, 2300 - v0.tick);
  await page.waitForTimeout(150);
  const v = await simView(page);
  expect(v.lives).toBeLessThan(20);
  await expect(page.getByTestId('hud-count')).toHaveText(String(v.lives));
  await expect(page.getByTestId('hud-stage')).toHaveText('1-1');
  await shot(page, 'M1-campaign');
  // 끝까지: 목숨 0 → 패배
  await fastForward(page, 5000);
  await expect(page.locator('[data-screen="gameover"]')).toContainText('1-2에서 목숨을 모두 잃었어요');
  await expect(page.getByTestId('hud-count')).toHaveText('0');
  expect(errors).toEqual([]);
});

test('?debug=1: ⏭ 단계 건너뛰기로 10단계 → 보스 단계 표시(👑 + 배너), 일반 몹 없음', async ({ page }) => {
  const errors = collectErrors(page);
  await startInfinite(page, '?debug=1&seed=9');
  const skip = page.getByRole('button', { name: '다음 단계로 즉시 이동' });
  for (let s = 1; s <= 10; s++) {
    await skip.click();
    await expect(page.getByTestId('hud-stage')).toContainText(`${s}단계`);
  }
  await expect(page.getByTestId('hud-stage')).toHaveText('👑 10단계');
  await expect(page.locator('.hud-stage')).toHaveClass(/is-boss/);
  await expect(page.getByTestId('hud-boss')).toBeVisible();
  // M4: 보스 막대 = 군단·계급 이름표 「박쥐 여왕」 (무한 순환 첫 대장)
  await expect(page.getByTestId('hud-boss')).toContainText('박쥐 여왕');
  const v = await simView(page);
  expect(v.boss).toBe(true);
  // 10단계에는 일반 몹이 새로 나오지 않는다 (앞 단계 첫 칸 몹 + 보스 1 + 박쥐 여왕이 10초마다 부르는 박쥐 5마리뿐)
  const mobs = v.mobs;
  await fastForward(page, 600);
  const after = (await simView(page)).mobs;
  expect(after - mobs).toBeGreaterThanOrEqual(0);
  expect((after - mobs) % 5).toBe(0);
  await shot(page, 'M1-boss-stage');
  expect(errors).toEqual([]);
});
