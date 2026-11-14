/**
 * M0 스모크 테스트 (휴대폰 뷰포트 412×915).
 * 타이틀 → [시작] → 게임(고정 틱이 돈다, 배속 순환) → ⏸ 일시정지 메뉴(시간 멈춤) → [계속] / [타이틀로] → 타이틀.
 * 스크린샷: test-results/screens/ (항상), docs/screens/M0.png (SAVE_SCREENS=1 일 때, `npm run screens`).
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SAVE_DOCS = process.env.SAVE_SCREENS === '1';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  return errors;
}

async function tickValue(page: Page): Promise<number> {
  return Number(await page.getByTestId('hud-tick').textContent());
}

async function shot(page: Page, name: string, docsName?: string): Promise<void> {
  mkdirSync('test-results/screens', { recursive: true });
  await page.screenshot({ path: `test-results/screens/${name}.png`, animations: 'disabled' });
  if (SAVE_DOCS && docsName) {
    mkdirSync('docs/screens', { recursive: true });
    await page.screenshot({ path: `docs/screens/${docsName}.png`, animations: 'disabled' });
  }
}

test('타이틀 화면: 운빨 디펜스 글자와 [시작] 버튼이 Phaser 캔버스 위에 보인다', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');

  const title = page.locator('[data-screen="title"]');
  await expect(title).toBeVisible();
  await expect(page.getByRole('heading', { name: '운빨 디펜스' })).toBeVisible();
  const start = page.getByRole('button', { name: '시작' });
  await expect(start).toBeVisible();

  // Phaser 캔버스: 9:16 상자를 가로로 꽉 채움 (412 × 732)
  const canvas = page.locator('#game canvas');
  await expect(canvas).toHaveCount(1);
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  expect(Math.round(box!.width)).toBe(412);
  expect(Math.abs(box!.height - (412 * 16) / 9)).toBeLessThan(2);
  // 가운데 정렬 (위아래 여백이 같음)
  expect(Math.abs(box!.y - (915 - box!.height) / 2)).toBeLessThan(2);

  // DOM 오버레이가 캔버스와 같은 영역
  const overlay = await page.locator('#ui-root').boundingBox();
  expect(overlay).not.toBeNull();
  for (const k of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(overlay![k] - box![k])).toBeLessThan(1);

  // [시작] 버튼은 손가락으로 누를 만한 크기
  const startBox = await start.boundingBox();
  expect(startBox!.height).toBeGreaterThanOrEqual(44);

  await page.waitForTimeout(700); // 페이드 인이 끝난 뒤 촬영
  await shot(page, 'M0-title', 'M0');
  expect(errors).toEqual([]);
});

test('[시작] → 게임 장면: 고정 틱이 돌고 배속 버튼이 ×1 → ×2 → ×1로 순환, ⏸ 메뉴를 거쳐 타이틀 복귀', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=42');
  await page.getByRole('button', { name: '시작' }).click();

  await expect(page.locator('[data-screen="title"]')).toHaveCount(0);
  const hud = page.locator('[data-screen="game"]');
  await expect(hud).toBeVisible();

  // 틱이 늘어난다 (20틱/초)
  await expect.poll(() => tickValue(page), { timeout: 5000 }).toBeGreaterThan(10);
  const t1 = await tickValue(page);
  await page.waitForTimeout(500);
  const t2 = await tickValue(page);
  expect(t2).toBeGreaterThan(t1);
  await expect(page.getByTestId('hud-time')).not.toHaveText('0:00.0');

  // 배속: 계정 Lv1이라 ×3은 잠김 → ×1, ×2만 순환
  const speed = page.getByRole('button', { name: '배속' });
  await expect(speed).toHaveText('×1');
  await speed.click();
  await expect(speed).toHaveText('×2');
  await shot(page, 'M0-game');
  await speed.click();
  await expect(speed).toHaveText('×1');

  // HUD 칩은 손가락으로 누를 만한 크기 (44px 이상)
  for (const name of ['배속', '일시정지']) {
    const b = await page.getByRole('button', { name }).boundingBox();
    expect(b!.height).toBeGreaterThanOrEqual(44);
    expect(b!.width).toBeGreaterThanOrEqual(44);
  }

  // ⏸ → 일시정지 메뉴: 바로 나가지 않고, 메뉴가 열린 동안 틱이 멈춘다
  await page.getByRole('button', { name: '일시정지' }).click();
  const pause = page.locator('[data-screen="pause"]');
  await expect(pause).toBeVisible();
  await expect(hud).toBeVisible();
  const p1 = await tickValue(page);
  await page.waitForTimeout(600);
  expect(await tickValue(page)).toBe(p1);
  await shot(page, 'M0-pause');

  // [계속] → 다시 흐른다 (배속은 그대로 ×1)
  await page.getByRole('button', { name: '계속' }).click();
  await expect(pause).toHaveCount(0);
  await expect.poll(() => tickValue(page), { timeout: 5000 }).toBeGreaterThan(p1);
  await expect(speed).toHaveText('×1');

  // ⏸ → [타이틀로] → 타이틀
  await page.getByRole('button', { name: '일시정지' }).click();
  await page.getByRole('button', { name: '타이틀로' }).click();
  await expect(page.locator('[data-screen="title"]')).toBeVisible();
  await expect(hud).toHaveCount(0);
  await expect(pause).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('화면 읽기: 초당 20번 바뀌는 틱·시간은 aria-live 영역 밖, 알림은 toast 층에서만', async ({ page }) => {
  await page.goto('/?seed=3');
  await page.getByRole('button', { name: '시작' }).click();
  await expect.poll(() => tickValue(page), { timeout: 5000 }).toBeGreaterThan(0);
  expect(await page.locator('#ui-root').getAttribute('aria-live')).toBeNull();
  const liveAncestor = await page.getByTestId('hud-tick').evaluate((el) => {
    const live = el.parentElement?.closest('[aria-live]:not([aria-live="off"]), [role="status"], [role="log"], [role="alert"]');
    return live ? live.outerHTML.slice(0, 80) : null;
  });
  expect(liveAncestor).toBeNull();
  await expect(page.getByTestId('hud-time')).toHaveAttribute('role', 'timer');
  await expect(page.locator('.layer-toast')).toHaveAttribute('aria-live', 'polite');
});

test('게임 루프 안에서 예외가 나면 콘솔에만 남기지 않고 오류 화면을 띄운다', async ({ page }) => {
  await page.goto('/?seed=5');
  await page.getByRole('button', { name: '시작' }).click();
  await expect.poll(() => tickValue(page), { timeout: 5000 }).toBeGreaterThan(0);
  // 장면 update 안에서 예외가 난 것처럼: Phaser 다음 프레임 콜백에서 던진다
  await page.evaluate(() => {
    const w = window as unknown as { __rtd: { game: { events: { once(e: string, fn: () => void): void } } } };
    w.__rtd.game.events.once('step', () => {
      throw new Error('테스트용 장면 오류');
    });
  });
  const err = page.locator('[data-screen="error"]');
  await expect(err).toBeVisible();
  await expect(err).toContainText('게임 중 문제가 생겼어요');
  await expect(err).toContainText('테스트용 장면 오류');
  await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible();
});

test('?debug=1 이면 ×3 배속까지 순환하고, ×2에서 틱이 ×1보다 빨리 돈다', async ({ page }) => {
  await page.goto('/?debug=1&seed=7');
  await page.getByRole('button', { name: '시작' }).click();
  const speed = page.getByRole('button', { name: '배속' });
  await expect.poll(() => tickValue(page)).toBeGreaterThan(0);

  const rate = async (): Promise<number> => {
    const a = await tickValue(page);
    await page.waitForTimeout(1000);
    return (await tickValue(page)) - a;
  };
  const r1 = await rate();
  await speed.click();
  await expect(speed).toHaveText('×2');
  const r2 = await rate();
  expect(r1).toBeGreaterThan(12); // 약 20
  expect(r2).toBeGreaterThan(r1 * 1.5); // 약 40
  await speed.click();
  await expect(speed).toHaveText('×3');
  await speed.click();
  await expect(speed).toHaveText('×1');
});
