/**
 * 피드백 #29 '종족 소환은 일단 작게' — [🎰 도박] 시트 '✨ 소환 도박' 탭에서 종족 소환 줄만 다른 소환 도박 줄보다 작게(덜 눈에 띄게).
 * 비용·확률·천장 글자는 그대로, 버튼·종족 칩은 그대로 눌린다. 412·320 너비에서 넘침 없음. SAVE_SCREENS=1이면 docs/screens/FB29-summon.png.
 * v0.1.14 통합: 모양은 디자인 PR #54(FB-D1 #29)의 `sm-row-secondary` + 접힌 종족 선택(details)을 쓴다 — 피드백 PR #35의 `is-compact` CSS는 겹쳐서 뺐다.
 * 그래서 칩 '한 줄 옆으로 밀기' 검사 대신 '접힌 선택을 펼치면 끝 칩까지 눌림'을 본다.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { clickStart } from './title';

async function openSummonGamble(page: Page): Promise<void> {
  await page.goto('/?dev=1&seed=29');
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
  await page.getByTestId('menu-gamble').click();
  await expect(page.getByTestId('sheet-gamble')).toBeVisible();
  await page.getByTestId('sheet-tab-summon').click();
  await expect(page.getByTestId('gacha-row-faction')).toBeVisible();
}

type Box = { h: number; w: number; icon: number; name: number; btnH: number; right: number };

async function measure(page: Page, id: string): Promise<Box> {
  return page.getByTestId(`gacha-row-${id}`).evaluate((row) => {
    const icon = row.querySelector('.up-icon')!.getBoundingClientRect();
    const name = parseFloat(getComputedStyle(row.querySelector('.up-name')!).fontSize);
    const btn = row.querySelector('.up-buy')!.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    // FB-D1: 종족 줄 아래의 접힌 '종족 고르기'(44px 누르는 줄)는 빼고 본 줄 높이만 비교한다
    const picker = row.querySelector('.sm-faction-picker');
    const ph = picker ? picker.getBoundingClientRect().height : 0;
    return { h: r.height - ph, w: r.width, icon: icon.width, name, btnH: btn.height, right: Math.max(r.right, btn.right) };
  });
}

for (const width of [412, 320]) {
  test(`피드백 #29: 종족 소환 줄이 다른 소환 도박 줄보다 작다 (${width})`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.setViewportSize({ width, height: 915 });
    await openSummonGamble(page);
    const faction = page.getByTestId('gacha-row-faction');
    await expect(faction).toHaveClass(/sm-row-secondary/);
    for (const id of ['lucky', 'challenge', 'myth']) await expect(page.getByTestId(`gacha-row-${id}`)).not.toHaveClass(/sm-row-secondary/);

    const f = await measure(page, 'faction');
    for (const id of ['lucky', 'challenge', 'myth']) {
      const o = await measure(page, id);
      expect(f.h).toBeLessThan(o.h);
      expect(f.w).toBeLessThan(o.w); // FB-D1: 폭 94% 보조 줄
      expect(f.icon).toBeLessThan(o.icon);
      expect(f.name).toBeLessThan(o.name);
      expect(f.btnH).toBeLessThanOrEqual(o.btnH);
    }
    // 버튼은 누르기 쉬운 크기 유지, 화면 밖으로 안 넘침
    expect(f.btnH).toBeGreaterThanOrEqual(40);
    expect(f.right).toBeLessThanOrEqual(width + 0.5);

    // 규칙·비용·확률 글자 그대로
    await expect(page.getByTestId('gacha-buy-faction')).toHaveText('200원');
    await expect(page.getByTestId('gacha-odds-faction')).toHaveText(/노말\s70% · 레어\s30%/);
    await expect(page.getByTestId('gacha-pity-faction')).toHaveText('천장까지 10회 (레어)');

    // 종족 칩은 접힌 선택(FB-D1) 안 — 펼치면 끝 칩까지 눌리고 화면 밖으로 안 넘친다
    await page.locator('.sm-faction-summary').click();
    const rights = await page.locator('[data-testid^="gacha-faction-"]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right));
    for (const r of rights) expect(r).toBeLessThanOrEqual(width + 0.5);
    const chips = page.locator('[data-testid^="gacha-faction-"]');
    for (const i of [6, 0]) {
      await chips.nth(i).click();
      await expect(chips.nth(i)).toHaveClass(/is-on/);
    }
    await page.getByTestId('gacha-faction-kingdom').click();
    await expect(page.getByTestId('gacha-faction-kingdom')).toHaveClass(/is-on/);

    if (process.env.SAVE_SCREENS === '1' && width === 412) {
      mkdirSync('docs/screens', { recursive: true });
      await page.screenshot({ path: 'docs/screens/FB29-summon.png' });
    }
    expect(errors).toEqual([]);
  });
}
