/**
 * V3 P1 영웅 마일스톤 화면 (docs/v3/ui-contract.md P1): 320/360/412px · 글자 130% 흉내에서
 * 5칸 한 줄 유지 · 칸마다 44px 이상 · 가로 넘침 없음 · 잠김(🔒)/달성(✓) · 고른 칸 아래 자세한 효과 · 이미 Lv12인 영웅은 구매 없이 적용됨.
 * 스크린샷: SAVE_SCREENS=1이면 docs/screens/V3-P1-milestones-<폭>.png (deviceScaleFactor 1), 아니면 test-results/screens/.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.SAVE_SCREENS === '1' ? 'docs/screens' : 'test-results/screens';
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${name}.png`, animations: 'disabled' });
}

async function openWithHeroes(page: Page, heroes: Record<string, { level: number; cards: number }>, flame = 0): Promise<void> {
  await page.goto('/');
  await expect(page.locator('.lobby-v2')).toBeVisible();
  await page.evaluate(
    ({ heroes, flame }) => {
      const p = JSON.parse(localStorage.getItem('rtd.progress') as string);
      Object.assign(p.heroes, heroes);
      if (flame) p.flame = flame;
      localStorage.setItem('rtd.progress', JSON.stringify(p));
    },
    { heroes, flame },
  );
  await page.reload();
  await expect(page.locator('.lobby-v2')).toBeVisible();
  await expect(page.getByTestId('loading-startup')).toHaveCount(0);
}

async function bandMetrics(page: Page) {
  return page.getByTestId('hero-milestones').evaluate((band) => {
    const dlg = band.closest('dialog') as HTMLElement;
    const d = dlg.getBoundingClientRect();
    const cells = [...band.querySelectorAll<HTMLElement>('.hero-ms-cell')].map((c) => c.getBoundingClientRect());
    const body = dlg.querySelector<HTMLElement>('.lobby-dialog-body') as HTMLElement;
    return {
      n: cells.length,
      tops: [...new Set(cells.map((r) => Math.round(r.top)))],
      small: cells.filter((r) => r.width < 44 || r.height < 44).length,
      outside: cells.filter((r) => r.left < d.left - 1 || r.right > d.right + 1).length,
      overflowX: body.scrollWidth > body.clientWidth + 1,
    };
  });
}

for (const width of [320, 360, 412]) {
  test(`V3 P1 ${width}px: 마일스톤 띠 5칸 · 이미 Lv12 = 적용됨 · 글자 130%`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: width === 320 ? 640 : 915 });
    await openWithHeroes(page, { archer: { level: 12, cards: 0 } });
    await page.locator('.lobby-nav [data-tab="heroes"]').click();
    await page.locator('.hero-card[data-hero="archer"]').click();
    await expect(page.getByTestId('hero-detail-level')).toHaveText('Lv 12');
    const band = page.getByTestId('hero-milestones');
    await band.scrollIntoViewIfNeeded();
    // 기존 계정 소급: Lv3/6/9/12 ✓, Lv15 🔒 — 구매·수령 버튼 없음
    for (const lv of [3, 6, 9, 12]) await expect(band.locator(`.hero-ms-cell[data-level="${lv}"]`)).toHaveClass(/is-reached/);
    await expect(band.locator('.hero-ms-cell[data-level="15"]')).toHaveClass(/is-locked/);
    await expect(band.locator('.hero-ms-cell[data-level="15"] .hero-ms-mark')).toHaveText('🔒');
    await expect(band.locator('button', { hasText: /받기|구매/ })).toHaveCount(0);
    // 기본 선택 = 다음 목표 Lv15
    await expect(page.getByTestId('hero-ms-detail')).toContainText('Lv15 🔒 잠김');
    await band.locator('.hero-ms-cell[data-level="12"]').click();
    await expect(page.getByTestId('hero-ms-detail')).toContainText('Lv12 ✓ 적용됨');
    await expect(page.getByTestId('hero-ms-detail')).toContainText('치명타 확률 +8%p');
    await expect(page.getByTestId('hero-detail-bonus')).toHaveText('전투 공격력 +49% → +53%');
    let m = await bandMetrics(page);
    expect(m).toEqual({ n: 5, tops: [m.tops[0]], small: 0, outside: 0, overflowX: false });
    await shot(page, `V3-P1-milestones-${width}`);
    // 글자 130% 흉내: 띠·설명 글자를 1.3배로 → 여전히 한 줄 5칸, 넘침 없음
    await page.addStyleTag({ content: '.hero-ms-cell strong{font-size:18.2px!important}.hero-ms-cell small{font-size:15.6px!important}.hero-ms-detail,.hero-ms-new{font-size:18.2px!important}' });
    m = await bandMetrics(page);
    expect(m.n).toBe(5);
    expect(m.tops).toHaveLength(1);
    expect(m.small).toBe(0);
    expect(m.outside).toBe(0);
    expect(m.overflowX).toBe(false);
    await shot(page, `V3-P1-milestones-${width}-text130`);
    expect(errors).toEqual([]);
  });
}

test('V3 P1 레벨업 5 → 6: 바뀐 전투 공격력 + 새로 달성한 마일스톤을 함께 보여 준다', async ({ page }) => {
  await openWithHeroes(page, { archer: { level: 5, cards: 50 } }, 5000);
  await page.locator('.lobby-nav [data-tab="heroes"]').click();
  await page.locator('.hero-card[data-hero="archer"]').click();
  await expect(page.getByTestId('hero-detail-bonus')).toHaveText('전투 공격력 +21% → +25%');
  await expect(page.locator('.hero-ms-cell[data-level="6"]')).toHaveClass(/is-locked/);
  await page.getByTestId('hero-levelup').click();
  await expect(page.getByTestId('hero-detail-level')).toHaveText('Lv 6');
  await expect(page.getByTestId('hero-ms-new')).toContainText('Lv6 달성');
  await expect(page.getByTestId('hero-ms-new')).toContainText('치명타 확률 +4%p');
  await expect(page.locator('.hero-ms-cell[data-level="6"]')).toHaveClass(/is-reached/);
  await expect(page.getByTestId('hero-detail-bonus')).toHaveText('전투 공격력 +25% → +29%');
  // 다음 판 입력에 레벨 6 → sim이 마일스톤을 계산 (판 입력은 레벨뿐)
  const lv = await page.evaluate(() => JSON.parse(localStorage.getItem('rtd.progress') as string).heroes.archer.level);
  expect(lv).toBe(6);
});
