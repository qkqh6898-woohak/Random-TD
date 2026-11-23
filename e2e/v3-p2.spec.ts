/**
 * V3 P2 유물 진열장·정산 탐험 보상 (docs/v3/ui-contract.md P2).
 *  a. 320/360/412 · 글자 130% 흉내: 머리줄(제목·열쇠·닫기) 고정, 첫 유물 선택권 12종 비교 → 고르기, 12종 2열 카드만(미공개·정령 없음),
 *     버튼 44px 이상·가로 넘침 없음, 시범 그림 3종은 WebP(contain), 나머지 9종은 코드 도형 임시 아이콘.
 *  b. 열쇠 0 = 부족 안내·발견 버튼 막힘 / 열쇠 10 = 10개로 발견 → 10번째 보장 표시 · 천장 카운터 다시 10.
 *  c. 강화(조각·골드 부족 이유 → 성공 → 골드 차감) · 만렙 = 강화 버튼 없음 + 만렙 표시 · 목표 지정.
 *  d. 5:1 교환: 고른 조각만, 5개가 되면 [교환] → 목표 조각 +1.
 *  e. 패배 정산: 기존 보상 아래 '🧭 탐험' 완료 29 → 보급 2 · 잔여 9 · 열쇠 +2 (27·13 경계는 단위 테스트), 다음 판 입력에 유물.
 * 스크린샷: SAVE_SCREENS=1이면 docs/screens/V3-P2-*.png, 아니면 test-results/screens/ (헤드리스 확인 — 실기기 아님).
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { clickStart } from './title';

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.SAVE_SCREENS === '1' ? 'docs/screens' : 'test-results/screens';
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${name}.png`, animations: 'disabled' });
}

type V3Patch = { keys?: number; target?: string; relics?: Record<string, { level: number; fragments: number }>; granted?: string[]; pulls?: number };

async function openWith(page: Page, patch: { gold?: number; v3?: V3Patch } = {}): Promise<void> {
  await page.goto('/');
  await expect(page.locator('.lobby-v2')).toBeVisible();
  await page.evaluate((patch) => {
    const p = JSON.parse(localStorage.getItem('rtd.progress') as string);
    if (patch.gold !== undefined) p.gold = patch.gold;
    if (patch.v3) {
      p.v3 = { ...p.v3, ...patch.v3, relics: { ...p.v3.relics, ...(patch.v3.relics ?? {}) } };
    }
    localStorage.setItem('rtd.progress', JSON.stringify(p));
  }, patch);
  await page.reload();
  await expect(page.locator('.lobby-v2')).toBeVisible();
  await expect(page.getByTestId('loading-startup')).toHaveCount(0);
}

async function progress(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('rtd.progress') as string));
}

async function fits(page: Page) {
  return page.getByTestId('relic-dialog').evaluate((dlg) => {
    const d = dlg.getBoundingClientRect();
    const body = dlg.querySelector('.lobby-dialog-body') as HTMLElement;
    const bad = [...dlg.querySelectorAll<HTMLElement>('button, summary')]
      .filter((b) => b.getClientRects().length && !b.closest('details:not([open]) > :not(summary)'))
      .filter((b) => {
        const q = b.getBoundingClientRect();
        return q.width < 44 || q.height < 44 || q.left < d.left - 1 || q.right > d.right + 1;
      })
      .map((b) => b.dataset.testid || b.dataset.relic || b.textContent);
    const head = dlg.querySelector('.lobby-dialog-head')!.getBoundingClientRect();
    return { bad, overflowX: body.scrollWidth > body.clientWidth + 1, headTop: Math.round(head.top), inside: d.left >= 0 && d.right <= window.innerWidth };
  });
}

for (const width of [320, 360, 412]) {
  test(`V3 P2 a. ${width}px: 진열장 · 첫 유물 선택 · 12종 2열 · 글자 130%`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: width === 320 ? 640 : 915 });
    await openWith(page);
    const rail = page.locator('[data-action="relics"]');
    await expect(rail).toBeVisible();
    await expect(page.getByTestId('relic-rail-keys')).toHaveText('0');
    await expect(rail).toHaveAttribute('aria-label', /유물 진열장 · 탐험 열쇠 0개 · 할 수 있는 것 1개/);
    await rail.click();
    const dlg = page.getByTestId('relic-dialog');
    await expect(dlg).toBeVisible();
    await expect(page.getByTestId('relic-keys')).toHaveAttribute('aria-label', '탐험 열쇠 0개');
    // 첫 유물 선택권: 12종 모두 이름·역할 비교, 고르기 전엔 확인 버튼 막힘
    const first = page.getByTestId('relic-first-pick');
    await expect(first.locator('.relic-pick')).toHaveCount(12);
    await expect(page.getByTestId('relic-first-confirm')).toBeDisabled();
    expect(await fits(page)).toMatchObject({ bad: [], overflowX: false, inside: true });
    await shot(page, `V3-P2-first-pick-${width}`);
    await first.locator('.relic-pick[data-relic="relic-frost-crystal"]').click();
    await page.getByTestId('relic-first-confirm').click();
    await expect(first).toHaveCount(0);
    await expect(page.getByTestId('relic-summary')).toContainText('🎯 목표 서리 결정 · Lv 1/10');
    // 12종만 (미공개 12종·정령 없음), 시범 그림 3종 + 코드 도형 9종
    const grid = page.getByTestId('relic-grid');
    await expect(grid.locator('.relic-card')).toHaveCount(12);
    await expect(grid.locator('img.relic-art')).toHaveCount(3);
    await expect(grid.locator('.relic-shape[data-placeholder="1"]')).toHaveCount(9);
    expect(await grid.locator('img.relic-art').first().evaluate((e) => getComputedStyle(e).objectFit)).toBe('contain');
    expect(await dlg.textContent()).not.toMatch(/여우|수달|정령|spirit/);
    const cols = await grid.locator('.relic-card').evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().left))).size);
    expect(cols).toBe(2);
    // 머리줄은 본문을 스크롤해도 그대로
    const before = (await fits(page)).headTop;
    await dlg.locator('.lobby-dialog-body').evaluate((b) => (b.scrollTop = 400));
    expect((await fits(page)).headTop).toBe(before);
    await dlg.locator('.lobby-dialog-body').evaluate((b) => (b.scrollTop = 0));
    expect(await fits(page)).toMatchObject({ bad: [], overflowX: false, inside: true });
    await shot(page, `V3-P2-showcase-${width}`);
    await page.addStyleTag({ content: '.relic-dialog .lobby-dialog-body *{font-size:130% !important}' });
    expect(await fits(page)).toMatchObject({ bad: [], overflowX: false, inside: true });
    await shot(page, `V3-P2-showcase-${width}-text130`);
    expect(errors).toEqual([]);
  });
}

test('V3 P2 b. 열쇠 0 = 부족 안내 · 열쇠 10 = 10개로 발견 → 10번째 보장, 천장 카운터 다시 10', async ({ page }) => {
  await openWith(page, { v3: { granted: ['first-relic'], target: 'relic-whetstone', relics: { 'relic-whetstone': { level: 1, fragments: 0 } } } });
  await page.locator('[data-action="relics"]').click();
  await expect(page.getByTestId('relic-discover')).toBeDisabled();
  await expect(page.getByTestId('relic-keys-need')).toBeVisible();
  await page.getByTestId('relic-dialog-close').click();
  await openWith(page, { v3: { keys: 10 } });
  await page.locator('[data-action="relics"]').click();
  await expect(page.getByTestId('relic-pity')).toHaveText('미보유 보장까지 10번 (10번째마다)');
  await expect(page.getByTestId('relic-odds')).toContainText('8.3%');
  await page.getByTestId('relic-discover-10').click();
  await expect(page.getByTestId('relic-found')).toContainText('(보장)');
  await expect(page.getByTestId('relic-keys')).toHaveAttribute('aria-label', '탐험 열쇠 0개');
  await expect(page.getByTestId('relic-pity')).toHaveText('미보유 보장까지 10번 (10번째마다)');
  const p = await progress(page);
  expect(p.v3.pulls).toBe(10);
  expect(p.v3.keys).toBe(0);
});

test('V3 P2 c. 강화(부족 이유 → 성공 · 골드 차감) · 만렙 표시 · 목표 지정', async ({ page }) => {
  await openWith(page, {
    gold: 150,
    v3: { granted: ['first-relic'], target: 'relic-whetstone', relics: { 'relic-whetstone': { level: 1, fragments: 1 }, 'relic-work-gloves': { level: 5, fragments: 2 } } },
  });
  await page.locator('[data-action="relics"]').click();
  const detail = page.getByTestId('relic-detail');
  await expect(detail).toHaveAttribute('data-relic', 'relic-whetstone');
  await expect(page.getByTestId('relic-upgrade')).toBeDisabled();
  await expect(page.getByTestId('relic-upgrade')).toHaveText('골드가 모자라요');
  await expect(page.getByTestId('relic-cost').locator('.is-short')).toContainText('골드 200');
  await page.getByTestId('relic-dialog-close').click();
  await openWith(page, { gold: 1000 });
  await page.locator('[data-action="relics"]').click();
  await expect(page.getByTestId('relic-effect')).toContainText('모든 영웅 공격력 +5%');
  await page.getByTestId('relic-upgrade').click();
  await expect(page.getByTestId('relic-detail')).toContainText('Lv 2/10');
  await expect(page.getByTestId('relic-effect')).toContainText('+5.5%');
  expect((await progress(page)).gold).toBe(800);
  // 만렙(성실 장갑 Lv5): 효과 + 만렙 표시, 강화 버튼 없음
  await page.locator('.relic-card[data-relic="relic-work-gloves"]').click();
  await expect(page.getByTestId('relic-max')).toBeVisible();
  await expect(page.getByTestId('relic-upgrade')).toHaveCount(0);
  await expect(page.getByTestId('relic-effect')).toContainText('일꾼 1명당 수입 +5원');
  await page.getByTestId('relic-set-target').click();
  await expect(page.getByTestId('relic-summary')).toContainText('🎯 목표 성실 장갑 · 만렙');
  await shot(page, 'V3-P2-detail-max');
});

test('V3 P2 d. 5:1 교환: 고른 조각만 내고 목표 조각 +1', async ({ page }) => {
  await openWith(page, {
    v3: { granted: ['first-relic'], target: 'relic-whetstone', relics: { 'relic-whetstone': { level: 1, fragments: 0 }, 'relic-pinwheel': { level: 1, fragments: 3 }, 'relic-acorn-bank': { level: 1, fragments: 4 } } },
  });
  await page.locator('[data-action="relics"]').click();
  const ex = page.getByTestId('relic-exchange');
  await ex.locator('summary').click();
  await expect(page.getByTestId('relic-exchange-go')).toBeDisabled();
  for (let i = 0; i < 3; i++) await ex.locator('.relic-ex-row[data-relic="relic-pinwheel"] .relic-ex-plus').click();
  await ex.locator('.relic-ex-row[data-relic="relic-acorn-bank"] .relic-ex-plus').click();
  await expect(page.getByTestId('relic-ex-sum')).toContainText('5의 배수가 아니에요');
  await ex.locator('.relic-ex-row[data-relic="relic-acorn-bank"] .relic-ex-plus').click();
  await expect(page.getByTestId('relic-ex-sum')).toContainText('낼 조각 5개 → 대장장이 숫돌 조각 1개');
  await shot(page, 'V3-P2-exchange');
  await page.getByTestId('relic-exchange-go').click();
  const p = await progress(page);
  expect(p.v3.relics['relic-whetstone'].fragments).toBe(1);
  expect(p.v3.relics['relic-pinwheel'].fragments).toBe(0);
  expect(p.v3.relics['relic-acorn-bank'].fragments).toBe(2);
});

test('V3 P2 e. 패배 정산: 기존 보상 아래 탐험 — 완료 29 → 보급 2 · 잔여 9 · 열쇠 +2, 다음 판 입력에 유물', async ({ page }) => {
  test.slow();
  await openWith(page, { v3: { granted: ['first-relic'], target: 'relic-whetstone', relics: { 'relic-whetstone': { level: 2, fragments: 0 } } } });
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
  const relics = await page.evaluate(() => (window as unknown as { __rtd: { game: { scene: { getScene(k: string): { match: { ctx: { relics: unknown } } } } } } }).__rtd.game.scene.getScene('Game').match.ctx.relics);
  expect(relics).toEqual([{ 'relic-whetstone': 2 }]);
  await page.evaluate(() => {
    const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): any } } } }).__rtd.game.scene.getScene('Game');
    const m = s.match;
    // 29 → 30웨이브(보스) 제한 시간 패배 = 도달 30 · 완료 29
    m.state.stage = 29;
    m.state.nextStageTick = m.tick;
    s.debugFastForward(1 + m.rules.bossTimeTicks);
  });
  await expect(page.locator('[data-screen="gameover"]')).toBeVisible();
  const ex = page.getByTestId('go-explore');
  await expect(ex).toContainText('완료 29웨이브 → 보급 2');
  await expect(ex).toContainText('잔여 9');
  await expect(ex).toContainText('🗝️ 열쇠 +2');
  await expect(ex).toContainText('대장장이 숫돌 조각 +2');
  await expect(page.getByTestId('go-gold')).toBeVisible();
  await shot(page, 'V3-P2-gameover');
  const p = await progress(page);
  expect(p.v3.keys).toBe(2);
  expect(p.v3.explore).toMatchObject({ battles: 1, waves: 29, supplyRest: 9, supplyTotal: 2 });
});
