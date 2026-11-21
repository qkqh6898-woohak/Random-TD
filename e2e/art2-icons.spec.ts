/**
 * ART-2 V2 아이콘 (힉스필드 39장, src/ui/uiIcons.ts): 로비·상점·전투 HUD의 핵심 아이콘이 실제로 읽히고(naturalWidth > 0)
 * 대체 글리프로 떨어지지 않으며, 그림 때문에 바깥 주소로 나가는 요청이 없다 — 412×915 · 320×568.
 */
import { test, expect, type Page } from '@playwright/test';
import { clickStart } from './title';

test.describe.configure({ timeout: 180_000 });

/** 보이는 아이콘 중 주어진 id들이 모두 읽혔는지 (읽힘 = complete · naturalWidth > 0 · 대체 그림 아님) */
async function iconState(page: Page, ids: readonly string[]): Promise<Record<string, string>> {
  return page.evaluate((ids) => {
    const out: Record<string, string> = {};
    for (const id of ids) {
      const img = [...document.querySelectorAll<HTMLImageElement>(`img.ui-icon[data-icon="${id}"]`)].find((e) => e.getBoundingClientRect().width > 0);
      out[id] = !img ? 'missing' : img.dataset.iconState === 'fallback' ? 'fallback' : img.complete && img.naturalWidth > 0 ? 'ok' : 'loading';
    }
    return out;
  }, ids);
}

async function expectIcons(page: Page, ids: readonly string[]): Promise<void> {
  const ok = Object.fromEntries(ids.map((id) => [id, 'ok']));
  await expect.poll(() => iconState(page, ids)).toEqual(ok);
}

for (const vp of [
  { width: 412, height: 915 },
  { width: 320, height: 568 },
]) {
  test(`ART-2 ${vp.width}×${vp.height}: 로비·상점·전투 HUD 아이콘이 읽히고 바깥 요청이 없다`, async ({ page, baseURL }) => {
    const remote: string[] = [];
    page.on('request', (r) => {
      const u = r.url();
      if (!u.startsWith(baseURL!) && !u.startsWith('data:') && !u.startsWith('blob:')) remote.push(u);
    });
    await page.setViewportSize(vp);
    await page.goto('/?seed=42');
    await expect(page.locator('[data-screen="title"]')).toBeVisible();
    // 로비: 재화 · 옆 버튼 · 아래 메뉴
    await expectIcons(page, ['cur-gold', 'cur-gems', 'cur-flame', 'side-quests', 'side-recruit', 'nav-shop', 'nav-heroes', 'nav-battle', 'nav-codex', 'nav-campaign']);
    // 아이콘은 꾸밈 — 이름은 글자 라벨·aria-label이 그대로 맡는다
    await expect(page.locator('.lobby-nav [data-tab="shop"]')).toHaveAttribute('aria-label', '상점');
    await expect(page.locator('.lobby-nav img.ui-icon').first()).toHaveAttribute('alt', '');
    await expect(page.locator('.lobby-nav img.ui-icon').first()).toHaveAttribute('aria-hidden', 'true');
    // 상점: 상품 5종 그림 + 가격 재화
    await page.locator('.lobby-nav [data-tab="shop"]').click();
    await expectIcons(page, ['shop-pack-basic', 'shop-pack-fine', 'shop-chest-legend', 'shop-fragments', 'shop-gold-bag']);
    await expect(page.getByTestId('shop-buy-pack-basic').locator('[data-icon="cur-gold"]')).toBeVisible();
    await expect(page.getByTestId('shop-buy-pack-fine').locator('[data-icon="cur-gems"]')).toBeVisible();
    // 전투 HUD: 하단 메뉴 · 소환 · 일꾼 · 도전/미션 · 배속 · ⏸ · 돈
    await page.locator('.lobby-nav [data-tab="battle"]').click();
    await clickStart(page);
    await expect(page.locator('[data-screen="game"]')).toBeVisible();
    await expectIcons(page, ['hud-limited', 'hud-summon', 'hud-gamble', 'hud-upgrade', 'hud-challenge', 'hud-mission', 'hud-worker', 'ui-speed', 'ui-pause', 'cur-gold']);
    await expect(page.locator('[data-testid="menu-gamble"] [data-icon="hud-gamble"]')).toBeVisible();
    await expect(page.locator('.hud-hire [data-icon="hud-worker"]')).toBeVisible();
    // 터치 영역은 그대로 44px 이상, 가로 넘침 없음
    const boxes = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      buttons: [...document.querySelectorAll<HTMLElement>('.hud-top-row button:not([hidden]), .hud-hire, .hud-menu > button, .hud-side-btns > button')]
        .filter((b) => b.getBoundingClientRect().width > 0)
        .map((b) => ({ w: b.getBoundingClientRect().width, h: b.getBoundingClientRect().height })),
    }));
    expect(boxes.overflow).toBe(false);
    for (const b of boxes.buttons) {
      expect(b.w).toBeGreaterThanOrEqual(44);
      expect(b.h).toBeGreaterThanOrEqual(44);
    }
    // 시트 ✕ 닫기도 그림
    await page.getByTestId('menu-gamble').click();
    await expectIcons(page, ['ui-close']);
    await page.getByTestId('sheet-close').click();
    await expect(page.getByTestId('sheet-gamble')).toBeHidden();
    expect(remote).toEqual([]);
  });
}
