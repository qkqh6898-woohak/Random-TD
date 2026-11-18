/**
 * 피드백 #25 '돈이랑 인구수는 상단에 배치하기': 💰 돈과 🗼 인원 n/한도를 아래 자원 줄에서 위 HUD 둘째 줄(몹 수 막대 양옆)로.
 * 위 HUD 높이(= 맵 자리)는 그대로, 가장 긴 글자(9.9억원·96/96·150/150)를 넣어도 320px까지 한 줄 안에 들어간다.
 */
import { expect, test, type Page } from '@playwright/test';
import { clickStart } from './title';

async function start(page: Page, query = '?seed=42'): Promise<void> {
  await page.goto(`/${query}`);
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
}

test('돈·인원은 위 HUD 몹 막대 줄 양옆 (아래 자원 줄에는 없음), 긴 글자도 412·360·320px에서 넘치지 않음', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const w of [412, 360, 320]) {
    await page.setViewportSize({ width: w, height: 915 });
    await start(page);
    await expect(page.getByTestId('hud-gold')).toHaveText('1,000원');
    await expect(page.getByTestId('hud-towers')).toHaveText('0/20');
    const r = await page.evaluate(() => {
      const q = (s: string) => document.querySelector(s) as HTMLElement;
      const gold = q('[data-testid=hud-gold]');
      const towers = q('[data-testid=hud-towers]');
      const row = q('.hud-count-row');
      const hudH = q('.hud').getBoundingClientRect().height;
      const inTop = !!gold.closest('.hud') && !!towers.closest('.hud');
      const inBottom = !!gold.closest('.hud-bottom') || !!towers.closest('.hud-bottom');
      const before = (a: HTMLElement, b: HTMLElement) => a.getBoundingClientRect().right <= b.getBoundingClientRect().left + 0.5;
      const bar = q('.hud-count-bar');
      const order = before(gold, bar) && before(bar, towers);
      // 가장 긴 글자
      gold.textContent = '9.9억원';
      towers.textContent = '96/96';
      q('[data-testid=hud-count]').textContent = '150/150';
      const rr = row.getBoundingClientRect();
      const stage = document.getElementById('stage')!.getBoundingClientRect();
      const over = [...row.querySelectorAll<HTMLElement>('*')]
        .filter((e) => e.offsetParent !== null)
        .filter((e) => e.getBoundingClientRect().right > Math.min(rr.right, stage.right) + 0.5 || e.getBoundingClientRect().left < rr.left - 0.5)
        .map((e) => e.className || e.dataset.testid || e.tagName);
      const tops = [gold, towers, q('[data-testid=hud-count]')].map((e) => Math.round(e.getBoundingClientRect().top));
      return {
        inTop,
        inBottom,
        order,
        over,
        rowOverflow: row.scrollWidth - row.clientWidth,
        oneLine: Math.max(...tops) - Math.min(...tops) <= 4,
        hudSame: Math.abs(q('.hud').getBoundingClientRect().height - hudH) < 0.5,
        barW: bar.getBoundingClientRect().width,
      };
    });
    expect(r.inTop, `${w}px`).toBe(true);
    expect(r.inBottom, `${w}px`).toBe(false);
    expect(r.order, `${w}px`).toBe(true);
    expect(r.over, `${w}px`).toEqual([]);
    expect(r.rowOverflow, `${w}px`).toBeLessThanOrEqual(0);
    expect(r.oneLine, `${w}px`).toBe(true);
    expect(r.hudSame, `${w}px`).toBe(true);
    expect(r.barW, `${w}px 몹 막대가 보일 만큼`).toBeGreaterThan(w * 0.15);
  }
  // 동전이 날아가는 곳 = 위 HUD 돈 글자
  const anchorInTop = await page.evaluate(() => {
    const gold = document.querySelector('[data-testid=hud-gold]')!.getBoundingClientRect();
    return gold.bottom <= document.querySelector('.hud')!.getBoundingClientRect().bottom;
  });
  expect(anchorInTop).toBe(true);
  expect(errors).toEqual([]);
});
