/**
 * V3 P3 탐험·패스·꾸러미 (docs/v3/ui-contract.md P3).
 *  a. 320/360/412 · 글자 130% 흉내: 탭 3개·도장 7×4·버튼 44px·넘침 없음·'오늘'/연속 출석/자정 문구 없음·정령/P4 버튼 없음.
 *  b. 패배 정산(완료 29) → 보급 상자 2 → [모두 열기] → 열쇠 2 · 도장 1칸 받기 · 성장 선택이 3번째 판에 생김 → 영웅 꾸러미.
 *  c. 패스 49 → 50칸: 받기 → 황금 트랙 사기(소급) → 다음 시즌 (미수령 먼저).
 *  d. 꾸러미(기존 Lv25 계정 = I·II 열림, 1회) · 첫 영웅 선택권 · 비밀 코드(1회).
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { clickStart } from './title';

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.SAVE_SCREENS === '1' ? 'docs/screens' : 'test-results/screens';
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${name}.png`, animations: 'disabled' });
}

async function openWith(page: Page, patch: Record<string, unknown> = {}, v3: Record<string, unknown> = {}): Promise<void> {
  await page.goto('/');
  await expect(page.locator('.lobby-v2')).toBeVisible();
  await page.evaluate(
    ({ patch, v3 }) => {
      const p = JSON.parse(localStorage.getItem('rtd.progress') as string);
      Object.assign(p, patch);
      p.v3 = { ...p.v3, ...v3 };
      localStorage.setItem('rtd.progress', JSON.stringify(p));
    },
    { patch, v3 },
  );
  await page.reload();
  await expect(page.locator('.lobby-v2')).toBeVisible();
  await expect(page.getByTestId('loading-startup')).toHaveCount(0);
}

const progress = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('rtd.progress') as string));

async function fits(page: Page) {
  return page.getByTestId('explore-dialog').evaluate((dlg) => {
    const d = dlg.getBoundingClientRect();
    const body = dlg.querySelector('.lobby-dialog-body') as HTMLElement;
    const bad = [...dlg.querySelectorAll<HTMLElement>('button')]
      .filter((b) => b.getClientRects().length)
      .filter((b) => {
        const q = b.getBoundingClientRect();
        return q.width < 44 || q.height < 44 || q.left < d.left - 1 || q.right > d.right + 1;
      })
      .map((b) => b.dataset.testid || b.textContent);
    return { bad, overflowX: body.scrollWidth > body.clientWidth + 1, inside: d.left >= 0 && d.right <= window.innerWidth };
  });
}

for (const width of [320, 360, 412]) {
  test(`V3 P3 a. ${width}px: 탐험·패스·꾸러미 탭 · 도장 7×4 · 글자 130%`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: width === 320 ? 640 : 915 });
    await openWith(page, {}, { stamp: { filled: 9, claimed: 2 }, boxes: 3, pass: { season: 1, waves: 260, freeClaimed: 4, golden: false, goldenClaimed: 0, history: [] } });
    const pill = page.locator('[data-action="explore"]');
    await expect(pill).toBeVisible();
    await expect(pill).toHaveAttribute('aria-label', /받을 수 있는 보상 \d+개/);
    // 머리줄 버튼이 화면 안·44px
    const box = (await pill.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    await pill.click();
    const dlg = page.getByTestId('explore-dialog');
    await expect(dlg).toBeVisible();
    await expect(page.getByTestId('explore-stamp-progress')).toContainText('9/28 (1회차)');
    await expect(dlg.locator('.stamp-cell')).toHaveCount(28);
    const rows = await dlg.locator('.stamp-cell').evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))).size);
    expect(rows).toBe(4);
    await expect(dlg.locator('.stamp-cell.is-big')).toHaveCount(4);
    await expect(dlg.locator('.stamp-cell.is-claimed')).toHaveCount(2);
    await expect(dlg.locator('.stamp-cell.is-ready')).toHaveCount(7);
    const text = (await dlg.textContent()) ?? '';
    expect(text).not.toMatch(/오늘|연속 출석|자정|정령|알|간식|초월/);
    expect(await fits(page)).toMatchObject({ bad: [], overflowX: false, inside: true });
    await shot(page, `V3-P3-explore-${width}`);
    await page.getByTestId('explore-tab-pass').click();
    await expect(page.getByTestId('pass-summary')).toContainText('13/50칸');
    await expect(dlg.locator('.pass-row[data-cell]')).toHaveCount(50);
    await page.getByTestId('pass-jump').click();
    expect(await fits(page)).toMatchObject({ bad: [], overflowX: false, inside: true });
    await shot(page, `V3-P3-pass-${width}`);
    await page.getByTestId('explore-tab-shop').click();
    expect(await fits(page)).toMatchObject({ bad: [], overflowX: false, inside: true });
    await page.getByTestId('explore-tab-explore').click();
    await page.addStyleTag({ content: '.explore-dialog .lobby-dialog-body *{font-size:130% !important}' });
    expect(await fits(page)).toMatchObject({ bad: [], overflowX: false, inside: true });
    await shot(page, `V3-P3-explore-${width}-text130`);
    expect(errors).toEqual([]);
  });
}

test('V3 P3 b. 정산 → 보급 상자 → 열기 · 도장 받기 · 성장 선택 → 영웅 꾸러미', async ({ page }) => {
  test.slow();
  await openWith(page, {}, { granted: ['first-relic', 'first-hero'], target: 'relic-whetstone', relics: { 'relic-whetstone': { level: 1, fragments: 0 } }, explore: { battles: 2, waves: 20, supplyRest: 0, supplyTotal: 2, choiceRest: 2, choicesReady: 0, choicesTaken: 0 } });
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
  await page.evaluate(() => {
    const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): any } } } }).__rtd.game.scene.getScene('Game');
    const m = s.match;
    m.state.stage = 29;
    m.state.nextStageTick = m.tick;
    s.debugFastForward(1 + m.rules.bossTimeTicks);
  });
  await expect(page.locator('[data-screen="gameover"]')).toBeVisible();
  const ex = page.getByTestId('go-explore');
  await expect(ex).toContainText('완료 29웨이브 → 보급 상자 +2');
  await expect(ex).toContainText('도장 +1');
  await expect(ex).toContainText('패스 +29웨이브');
  await expect(ex).toContainText('성장 선택 +1');
  await shot(page, 'V3-P3-gameover');
  await page.locator('[data-screen="gameover"]').getByRole('button', { name: '로비로' }).click();
  await page.locator('[data-action="explore"]').click();
  await page.getByTestId('explore-open-boxes').click();
  await expect(page.getByTestId('explore-open-boxes')).toBeDisabled();
  let p = await progress(page);
  expect([p.v3.boxes, p.v3.keys, p.v3.relics['relic-whetstone'].fragments]).toEqual([0, 2, 2]);
  await page.getByTestId('explore-stamp-claim').click();
  await expect(page.getByTestId('explore-stamp-claim')).toBeDisabled();
  // 성장 선택: 광부 꾸러미 = 다음 레벨 비용 → 바로 레벨업 가능
  await expect(page.getByTestId('explore-choice')).toContainText('성장 선택 1회');
  await page.getByTestId('explore-choice-miner').scrollIntoViewIfNeeded();
  await page.getByTestId('explore-choice-miner').click();
  p = await progress(page);
  expect(p.v3.explore.choicesReady).toBe(0);
  expect(p.heroes.miner.cards).toBeGreaterThanOrEqual(2);
});

test('V3 P3 c. 패스 49 → 50칸 · 황금 트랙(소급) · 다음 시즌은 미수령을 먼저 받는다', async ({ page }) => {
  await openWith(page, { gems: 500 }, { pass: { season: 1, waves: 49 * 20, freeClaimed: 0, golden: false, goldenClaimed: 0, history: [] } });
  await page.locator('[data-action="explore"]').click();
  await page.getByTestId('explore-tab-pass').click();
  await expect(page.getByTestId('pass-summary')).toContainText('49/50칸 · 다음 칸까지 20웨이브');
  await expect(page.getByTestId('pass-next-season')).toHaveCount(0);
  await page.getByTestId('pass-buy-golden').click();
  await expect(page.getByTestId('pass-golden')).toContainText('황금 트랙 열림');
  await expect(page.getByTestId('pass-claim')).toContainText('받기 (98)');
  expect((await progress(page)).gems).toBe(200);
  // 50칸째 (한 판 더 = 웨이브 20) — 저장을 고쳐 다시 연다
  await page.getByTestId('explore-dialog-close').click();
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('rtd.progress') as string);
    p.v3.pass.waves = 50 * 20 + 5;
    localStorage.setItem('rtd.progress', JSON.stringify(p));
  });
  await page.reload();
  await page.locator('[data-action="explore"]').click();
  await page.getByTestId('explore-tab-pass').click();
  await expect(page.getByTestId('pass-summary')).toContainText('50/50칸 · 시즌 완료!');
  await shot(page, 'V3-P3-pass-complete');
  await page.getByTestId('pass-next-season').click();
  const p = await progress(page);
  expect(p.v3.pass).toMatchObject({ season: 2, waves: 5, freeClaimed: 0, golden: false, history: [1] });
  expect(p.v3.granted).toContain('pass:1:golden');
  await expect(page.getByTestId('pass-summary')).toContainText('시즌 2');
});

test('V3 P3 d. 꾸러미(기존 Lv25 계정) · 첫 영웅 선택권 · 비밀 코드', async ({ page }) => {
  await openWith(page, { level: 25, gold: 20000 });
  await page.locator('[data-action="explore"]').click();
  // 첫 영웅 선택권
  const first = page.getByTestId('explore-first-hero');
  await expect(first.locator('.explore-hero-pick')).toHaveCount(10);
  await first.locator('.explore-hero-pick').first().click();
  await page.getByTestId('explore-first-hero-confirm').click();
  await expect(page.getByTestId('explore-first-hero')).toHaveCount(0);
  // 꾸러미
  await page.getByTestId('explore-tab-shop').click();
  await expect(page.getByTestId('explore-buy-pkg-lv30')).toContainText('Lv 30 필요');
  await expect(page.getByTestId('explore-buy-pkg-lv30')).toBeDisabled();
  await page.getByTestId('explore-buy-pkg-lv10').click();
  await expect(page.locator('.explore-pkg[data-pkg="pkg-lv10"]')).toContainText('구매함');
  expect((await progress(page)).gold).toBe(17000);
  // 비밀 코드
  await page.getByTestId('explore-code-input').fill('v3 start');
  await page.getByTestId('explore-code-go').click();
  await expect(page.getByTestId('explore-code-msg')).toContainText('받았어요');
  await page.getByTestId('explore-code-input').fill('V3START');
  await page.getByTestId('explore-code-go').click();
  await expect(page.getByTestId('explore-code-msg')).toHaveText('이미 받은 코드예요');
  const p = await progress(page);
  expect(p.v3.granted).toEqual(expect.arrayContaining(['code:code-v3-start', 'first-hero', 'pkg:pkg-lv10']));
  await shot(page, 'V3-P3-shop');
});
