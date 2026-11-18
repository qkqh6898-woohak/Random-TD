/**
 * 피드백 #64 '일꾼 수 안보이는 버그': 아래 자원 줄의 👷 일꾼 수(n/10)가 [⬆ 승급 가능]이나 접은 카드 알약이 뜨면
 * CSS로 숨겨졌다 (G-1 자리 아끼기 규칙). 승급할 무더기가 거의 늘 있어 판 내내 일꾼 수가 안 보였다.
 * → 일꾼 수는 늘 보인다 (승급 가능·카드 알약과 함께여도, 412·360·320px에서 넘치지 않게).
 */
import { expect, test, type Page } from '@playwright/test';
import { clickStart } from './title';

type SceneLike = {
  match: {
    map: { buildable: [number, number][] };
    rules: { towerOrder: string[]; towers: Map<string, { grade: string }> };
    world: { enqueue(c: unknown): { ok: boolean } };
  };
  debugFastForward(n: number): number;
};

async function start(page: Page): Promise<void> {
  await page.goto('/?dev=1&seed=42');
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
}

test('승급 가능 버튼이 떠도 👷 일꾼 수가 보인다 (실제 판)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page);
  await page.getByTestId('hud-hire').click();
  await expect(page.getByTestId('hud-workers')).toHaveText('1/10');
  // 같은 노말 3개를 한 칸에 → 승급 가능
  await page.evaluate(() => {
    const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game') as SceneLike;
    const [x, y] = s.match.map.buildable[0]!;
    const t = s.match.rules.towerOrder.findIndex((id) => s.match.rules.towers.get(id)?.grade === 'normal');
    for (let i = 0; i < 3; i++) s.match.world.enqueue({ type: 'debugTower', x, y, t });
    s.debugFastForward(1);
  });
  await expect(page.getByTestId('hud-merge-ready')).toBeVisible();
  await expect(page.getByTestId('hud-workers')).toBeVisible();
  await expect(page.getByTestId('hud-workers')).toHaveText('1/10');
  expect(errors).toEqual([]);
});

test('승급 가능·카드 알약이 함께 떠도 일꾼 수가 보이고 아래 줄이 412·360·320px에서 넘치지 않는다', async ({ page }) => {
  for (const w of [412, 360, 320]) {
    await page.setViewportSize({ width: w, height: 915 });
    await start(page);
    const r = await page.evaluate(() => {
      const band = document.querySelector('.hud-bottom') as HTMLElement;
      const workers = document.querySelector('[data-testid=hud-workers]') as HTMLElement;
      workers.textContent = '10/10';
      const mr = document.querySelector('.hud-merge-ready') as HTMLButtonElement;
      mr.replaceChildren('⬆', Object.assign(document.createElement('span'), { className: 'hud-mr-word', textContent: ' 승급 가능' }), ' 12');
      mr.hidden = false;
      const slot = document.querySelector('.hud-choice-slot') as HTMLElement;
      slot.innerHTML = '<button class="btn btn-chip cp-pill is-card"><span class="cp-pill-icon">🃏</span><span class="cp-pill-text">카드 고르기</span></button>';
      const br = band.getBoundingClientRect();
      const wr = workers.getBoundingClientRect();
      const over = ([...band.querySelectorAll('.hud-bottom > *, .hud-choice-slot > *')] as HTMLElement[])
        .filter((e) => e.offsetParent !== null && getComputedStyle(e).display !== 'contents')
        .filter((e) => e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().right > br.right + 0.5)
        .map((e) => e.className);
      return {
        visible: workers.offsetParent !== null && wr.width > 0 && wr.left >= br.left - 0.5 && wr.right <= br.right + 0.5,
        over,
        bandOver: band.scrollWidth - band.clientWidth,
      };
    });
    expect(r.visible, `${w}px`).toBe(true);
    expect(r.over, `${w}px`).toEqual([]);
    expect(r.bandOver, `${w}px`).toBeLessThanOrEqual(0);
  }
});
