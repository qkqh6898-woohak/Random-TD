/**
 * FB-1 게임 안 피드백 → GitHub 이슈 E2E (휴대폰 412×915, 360·320 배치):
 *  a. 로비 ⚙ 설정 → [💬 피드백 보내기] → 글이 없으면 [보내기]가 막힘 → 분류·글 → 가짜 자바 다리 openFeedback(url)로 주소를 잡아 확인 (기록 없음)
 *  b. 전투 ⏸ 일시정지 → [💬 피드백 보내기] → 판 기록 첨부 기본 켜짐 → 주소에 replay(지금 틱까지 · 7500자 이하) + [기록 복사] → 글 끝 안내
 *  c. 다리가 없으면(브라우저) window.open(url, '_blank', 'noopener')
 *  d. 뒤로 가기(nativeBack)는 피드백 창부터 닫는다 (설정 창은 남음)
 *  e. 412·360·320: 창이 화면 안, 가로 넘침 없음, 버튼 44px 이상
 * 스크린샷 (deviceScaleFactor 1): docs/screens/FB-dialog.png (전투 일시정지에서 연 창)
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { clickStart } from './title';

const PREFIX = 'https://github.com/qkqh6898-woohak/Random-TD/issues/new?';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

/** 가짜 자바 다리: openFeedback(url)만 (업데이트 메서드가 없어 UpdateService는 만들어지지 않음) */
async function fakeBridge(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __fbUrls: string[]; RandomTDNative: unknown };
    w.__fbUrls = [];
    w.RandomTDNative = { openFeedback: (url: string) => w.__fbUrls.push(url) };
  });
}

async function fakeWindowOpen(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __fbOpen: unknown[][] };
    w.__fbOpen = [];
    window.open = ((...args: unknown[]) => {
      w.__fbOpen.push(args);
      return null;
    }) as typeof window.open;
  });
}

const urls = (page: Page): Promise<string[]> => page.evaluate(() => (window as unknown as { __fbUrls: string[] }).__fbUrls);

async function openLobbyFeedback(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('[data-screen="title"][data-lobby="1"]')).toBeVisible();
  await page.locator('[data-action="settings"]').click();
  await expect(page.getByTestId('settings-dialog')).toBeVisible();
  await page.getByTestId('settings-dialog').getByTestId('feedback-open').click();
  await expect(page.getByTestId('feedback-dialog')).toBeVisible();
}

async function startAndPause(page: Page, summons = 3): Promise<void> {
  await page.goto('/?seed=4242');
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
  const summon = page.getByTestId('hud-summon');
  for (let i = 0; i < summons; i++) {
    await summon.click();
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: '일시정지' }).click();
  await expect(page.locator('[data-screen="pause"]')).toBeVisible();
}

async function back(page: Page): Promise<boolean> {
  return page.evaluate(() => !window.dispatchEvent(new Event('randomtd:native-back', { cancelable: true })));
}

async function noOverflow(page: Page): Promise<void> {
  const r = await page.evaluate(() => {
    const d = document.querySelector<HTMLElement>('[data-testid="feedback-dialog"]')!;
    const b = d.getBoundingClientRect();
    const buttons = [...d.querySelectorAll<HTMLElement>('button, .feedback-check')].filter((x) => x.offsetParent !== null).map((x) => x.getBoundingClientRect().height);
    const inner = [...d.querySelectorAll<HTMLElement>('*')].filter((x) => x.offsetParent !== null).map((x) => x.getBoundingClientRect());
    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      left: b.left,
      right: b.right,
      top: b.top,
      bottom: b.bottom,
      docW: document.documentElement.scrollWidth,
      dialogScrollW: d.scrollWidth,
      dialogClientW: d.clientWidth,
      minButton: Math.min(...buttons),
      maxRight: Math.max(...inner.map((x) => x.right)),
    };
  });
  expect(r.left).toBeGreaterThanOrEqual(0);
  expect(r.right).toBeLessThanOrEqual(r.vw);
  expect(r.top).toBeGreaterThanOrEqual(0);
  expect(r.bottom).toBeLessThanOrEqual(r.vh);
  expect(r.docW).toBeLessThanOrEqual(r.vw);
  expect(r.dialogScrollW).toBeLessThanOrEqual(r.dialogClientW);
  expect(r.maxRight).toBeLessThanOrEqual(r.right + 0.5);
  expect(r.minButton).toBeGreaterThanOrEqual(44);
}

test('FB-1 a. 로비 설정 → 피드백: 글 필수 · 분류 · 자바 다리로 GitHub 이슈 폼 주소 (기록 없음)', async ({ page }) => {
  const errors = collectErrors(page);
  await fakeBridge(page);
  await openLobbyFeedback(page);
  const dlg = page.getByTestId('feedback-dialog');
  // 로비에는 판이 없다 → 첨부 꺼짐·막힘, [기록 복사] 없음
  await expect(dlg.getByTestId('feedback-attach')).not.toBeChecked();
  await expect(dlg.getByTestId('feedback-attach')).toBeDisabled();
  await expect(dlg.getByTestId('feedback-copy')).toBeHidden();
  await expect(dlg.locator('[data-category="버그"]')).toHaveAttribute('aria-checked', 'true');
  // 글 없이 [보내기] → 막힘
  await dlg.getByTestId('feedback-send').click();
  await expect(dlg.getByTestId('feedback-error')).toHaveText('내용을 적어 주세요.');
  await expect(dlg).toBeVisible();
  expect(await urls(page)).toEqual([]);
  await dlg.getByTestId('feedback-text').fill('   ');
  await dlg.getByTestId('feedback-send').click();
  await expect(dlg.getByTestId('feedback-error')).toHaveText('내용을 적어 주세요.');
  // 분류·글
  await dlg.locator('[data-category="제안"]').click();
  await expect(dlg.locator('[data-category="제안"]')).toHaveAttribute('aria-checked', 'true');
  await expect(dlg.locator('[data-category="버그"]')).toHaveAttribute('aria-checked', 'false');
  await dlg.getByTestId('feedback-text').fill('영웅 상세에서 비교 기능이 있으면 좋겠어요 & 정렬도');
  await expect(dlg.getByTestId('feedback-error')).toHaveText('');
  await expect(dlg.getByTestId('feedback-count')).toHaveText('29/1000');
  await dlg.getByTestId('feedback-send').click();
  await expect(dlg).toBeHidden();
  await expect(page.locator('.toast').filter({ hasText: 'GitHub에서 [Submit new issue]를 눌러 주세요' })).toBeVisible();
  const [url] = await urls(page);
  expect(url!.startsWith(`${PREFIX}template=feedback.yml&`)).toBe(true);
  expect(url!.length).toBeLessThanOrEqual(7500);
  const p = new URL(url!).searchParams;
  expect(p.get('template')).toBe('feedback.yml');
  expect(p.get('title')).toBe('[피드백] 제안: 영웅 상세에서 비교 기능이 있으면 좋겠어요 & 정렬도');
  expect(p.get('category')).toBe('제안');
  expect(p.get('body_text')).toBe('영웅 상세에서 비교 기능이 있으면 좋겠어요 & 정렬도');
  const info = p.get('game_info')!;
  expect(info).toContain('platform: android-app');
  expect(info).toContain('where: 로비');
  expect(info).toMatch(/^app: \d+\.\d+\.\d+/);
  expect(info).toContain('screen: 412x915');
  expect(info).toMatch(/time: \d{4}-\d\d-\d\dT/);
  expect(info).toMatch(/data: [0-9a-f]{8}/);
  expect(p.has('replay')).toBe(false);
  // 설정 창은 그대로 (그 위에 열었던 창만 닫힘)
  await expect(page.getByTestId('settings-dialog')).toBeVisible();
  expect(errors).toEqual([]);
});

test('FB-1 b. 전투 일시정지 → 피드백: 판 기록 첨부(기본 켜짐) · replay 칸 · [기록 복사] 안내', async ({ page, context }) => {
  const errors = collectErrors(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await fakeBridge(page);
  await startAndPause(page, 3);
  const tick = await page.evaluate(() => (window as unknown as { __rtd: { game: { scene: { getScene(k: string): { match: { tick: number; world: { executed: unknown[] } } } } } } }).__rtd.game.scene.getScene('Game').match.tick);
  const executed = await page.evaluate(() => (window as unknown as { __rtd: { game: { scene: { getScene(k: string): { match: { world: { executed: unknown[] } } } } } } }).__rtd.game.scene.getScene('Game').match.world.executed.length);
  expect(executed).toBeGreaterThan(0);
  const open = page.locator('[data-screen="pause"]').getByTestId('feedback-open');
  const ob = await open.boundingBox();
  expect(ob!.height).toBeGreaterThanOrEqual(44);
  await open.click();
  const dlg = page.getByTestId('feedback-dialog');
  await expect(dlg).toBeVisible();
  await expect(dlg.getByTestId('feedback-attach')).toBeChecked();
  await expect(dlg.getByTestId('feedback-copy')).toBeVisible();
  await expect(dlg.getByTestId('feedback-attach-hint')).toContainText(`명령 ${executed}개`);
  await dlg.locator('[data-category="밸런스"]').click();
  await dlg.getByTestId('feedback-text').fill('3단계 몹이 너무 빨라요\n두 줄째');
  await page.waitForTimeout(100);
  await page.screenshot({ path: 'docs/screens/FB-dialog.png', animations: 'disabled' });
  // [기록 복사] → 클립보드 = 전체 기록 JSON (자르지 않은 리플레이 파일)
  await dlg.getByTestId('feedback-copy').click();
  await expect(dlg.getByTestId('feedback-copy')).toHaveText('✓ 복사했어요');
  const clip = JSON.parse(await page.evaluate(() => navigator.clipboard.readText())) as { seed: number; endTick: number; commands: unknown[]; version: number };
  expect(clip.seed).toBe(4242);
  expect(clip.endTick).toBe(tick);
  expect(clip.commands).toHaveLength(executed);
  await dlg.getByTestId('feedback-send').click();
  await expect(dlg).toBeHidden();
  const [url] = await urls(page);
  expect(url!.startsWith(PREFIX)).toBe(true);
  expect(url!.length).toBeLessThanOrEqual(7500);
  const p = new URL(url!).searchParams;
  expect([...p.keys()]).toEqual(['template', 'title', 'category', 'body_text', 'game_info', 'replay']);
  expect(p.get('template')).toBe('feedback.yml');
  expect(p.get('category')).toBe('밸런스');
  expect(p.get('title')).toBe('[피드백] 밸런스: 3단계 몹이 너무 빨라요 두 줄째');
  expect(p.get('body_text')).toContain('3단계 몹이 너무 빨라요\n두 줄째');
  expect(p.get('body_text')).toContain('전체 기록은 클립보드에 복사됨');
  const info = p.get('game_info')!;
  for (const re of [/where: 전투/, /mode: infinite/, /map: \w+/, /seed: 4242/, new RegExp(`tick: ${tick}\\b`), /speed: x1/, /gold: \d+/, /mobs: \d+/, /towers: \d+/, /dev: no/, /resumed: no/]) expect(info).toMatch(re);
  const replay = JSON.parse(p.get('replay')!) as { seed: number; endTick: number; commands: { tick: number }[]; decks: unknown[]; truncated?: boolean };
  expect(replay.seed).toBe(4242);
  expect(replay.endTick).toBe(tick);
  expect(replay.decks).toHaveLength(1);
  expect(replay.truncated).toBeUndefined();
  expect(replay.commands).toHaveLength(executed);
  // 일시정지 메뉴는 그대로
  await expect(page.locator('[data-screen="pause"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('FB-1 c. 다리가 없으면(브라우저) window.open(url, _blank, noopener) · 첨부를 끄면 replay 없음', async ({ page }) => {
  const errors = collectErrors(page);
  await fakeWindowOpen(page);
  await startAndPause(page, 1);
  await page.locator('[data-screen="pause"]').getByTestId('feedback-open').click();
  const dlg = page.getByTestId('feedback-dialog');
  await dlg.getByTestId('feedback-attach').uncheck();
  await dlg.getByTestId('feedback-text').fill('브라우저에서 보내요');
  await dlg.getByTestId('feedback-send').click();
  await expect(dlg).toBeHidden();
  const calls = await page.evaluate(() => (window as unknown as { __fbOpen: unknown[][] }).__fbOpen);
  expect(calls).toHaveLength(1);
  const [url, target, features] = calls[0] as [string, string, string];
  expect(url.startsWith(`${PREFIX}template=feedback.yml&`)).toBe(true);
  expect(target).toBe('_blank');
  expect(features).toBe('noopener');
  const p = new URL(url).searchParams;
  expect(p.get('game_info')).toContain('platform: browser');
  expect(p.has('replay')).toBe(false);
  expect(errors).toEqual([]);
});

test('FB-1 d. 뒤로 가기: 피드백 창 → 설정 창 → (로비 전투 탭이면 처리 안 함) · 전투에서는 피드백 창만 닫고 일시정지 유지', async ({ page }) => {
  await fakeBridge(page);
  await openLobbyFeedback(page);
  expect(await back(page)).toBe(true);
  await expect(page.getByTestId('feedback-dialog')).toBeHidden();
  await expect(page.getByTestId('settings-dialog')).toBeVisible();
  expect(await back(page)).toBe(true);
  await expect(page.getByTestId('settings-dialog')).toBeHidden();
  // Esc도 닫는다
  await page.locator('[data-action="settings"]').click();
  await page.getByTestId('settings-dialog').getByTestId('feedback-open').click();
  await expect(page.getByTestId('feedback-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('feedback-dialog')).toBeHidden();

  await startAndPause(page, 0);
  await page.locator('[data-screen="pause"]').getByTestId('feedback-open').click();
  await expect(page.getByTestId('feedback-dialog')).toBeVisible();
  expect(await back(page)).toBe(true);
  await expect(page.getByTestId('feedback-dialog')).toBeHidden();
  await expect(page.locator('[data-screen="pause"]')).toBeVisible();
});

for (const [w, h] of [
  [412, 915],
  [360, 780],
  [320, 640],
] as const) {
  test(`FB-1 e. ${w}×${h}: 피드백 창이 화면 안 · 가로 넘침 없음 · 버튼 44px 이상 (로비·일시정지)`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await fakeBridge(page);
    await openLobbyFeedback(page);
    await noOverflow(page);
    await startAndPause(page, 1);
    // 일시정지 메뉴 자체도 버튼이 화면 안
    const fb = await page.locator('[data-screen="pause"]').getByTestId('feedback-open').boundingBox();
    expect(fb!.y + fb!.height).toBeLessThanOrEqual(h);
    expect(fb!.x + fb!.width).toBeLessThanOrEqual(w);
    await page.locator('[data-screen="pause"]').getByTestId('feedback-open').click();
    await expect(page.getByTestId('feedback-dialog')).toBeVisible();
    await noOverflow(page);
  });
}

test.beforeAll(() => {
  mkdirSync('docs/screens', { recursive: true });
});
