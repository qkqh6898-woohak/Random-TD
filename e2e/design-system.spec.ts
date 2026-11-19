import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

for (const width of [320, 360, 393, 412]) {
  test(`PR-B gallery ${width}px: local art, no clipping, 44px targets, AA text`, async ({ page }) => {
    await page.setViewportSize({ width, height: 915 });
    const errors: string[] = [], remote: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { const url = new URL(request.url()); if (url.protocol.startsWith('http') && url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') remote.push(url.href); });
    await page.goto('/?ui-gallery=1');
    await expect(page.getByTestId('v2-gallery')).toHaveAttribute('data-font-state', 'loaded');
    await expect(page.locator('#game canvas')).toHaveCount(0);
    await page.waitForFunction(() => [...document.querySelectorAll('.rtd-gallery img')].every(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0));
    const metrics = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('.rtd-gallery')!;
      const bad: string[] = [];
      for (const el of root.querySelectorAll<HTMLElement>('button')) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        if (r.width < 43.9 || r.height < 43.9) bad.push(`${el.getAttribute('aria-label')}: ${r.width}x${r.height}`);
        if (r.left < -0.5 || r.right > innerWidth + .5) bad.push(`outside: ${el.getAttribute('aria-label')}`);
        // Notification dots intentionally overlap the outside edge. Measure text separately.
        for (const text of el.querySelectorAll<HTMLElement>('.rtd-button-label,.rtd-button-cost,.rtd-button-timer,.rtd-card-name,.rtd-card-level,.rtd-card-grade')) {
          if (el.classList.contains('rtd-button--close')) continue; // Screen-reader-only label.
          const t = text.getBoundingClientRect();
          if (t.left < r.left - .5 || t.right > r.right + .5 || t.top < r.top - .5 || t.bottom > r.bottom + .5 || text.scrollWidth > text.clientWidth + 1 || text.scrollHeight > text.clientHeight + 1) bad.push(`clipped: ${text.textContent}`);
        }
      }
      const small = [...root.querySelectorAll<HTMLElement>('span,p,h1,h2,h3,button')].filter(el => el.textContent?.trim() && !el.querySelector('*') && parseFloat(getComputedStyle(el).fontSize) < 12).map(el => el.textContent);
      return { overflow: root.scrollWidth > root.clientWidth + 1, bad, small, font: document.fonts.check('16px "RTD Jua"'), height: root.scrollHeight };
    });
    expect(metrics).toMatchObject({ overflow: false, bad: [], small: [], font: true });
    const contrasts = await page.evaluate(() => {
      const lum = (s: string) => { const c = s.match(/[\d.]+/g)!.slice(0, 3).map(n => { const v = Number(n) / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * c[0]! + .7152 * c[1]! + .0722 * c[2]!; };
      const pairs = [
        ['body', '.rtd-gallery-description', '.rtd-gallery-section'], ['primary', '.rtd-button--primary .rtd-button-label', '.rtd-button--primary'], ['secondary', '.rtd-button--secondary', '.rtd-button--secondary'], ['pill', '.rtd-button--pill', '.rtd-button--pill'], ['cost', '.rtd-button-cost', '.rtd-button-cost'], ['disabled-cost', '.rtd-button:disabled .rtd-button-cost', '.rtd-button:disabled .rtd-button-cost'], ['disabled-label', '.rtd-button:disabled', '.rtd-button:disabled'], ['event-label', '.rtd-button--icon .rtd-button-label', '.rtd-button--icon .rtd-button-label'], ['event-timer', '.rtd-button-timer', '.rtd-button-timer'], ['emphasis-number', '.rtd-gallery-numbers', '.rtd-gallery-type'], ['popup-title', '.rtd-popup-head h2', '.rtd-popup'], ['popup-body', '.rtd-popup-paper p', '.rtd-popup-paper'], ['badge', '.rtd-number-badge', '.rtd-number-badge'], ['currency', '.rtd-currency-value', '.rtd-currency'], ['card-level', '.rtd-card-level', '.rtd-card-level'], ['card-name', '.rtd-card-name', '.rtd-gallery-section'], ['note', '.rtd-gallery-note', '.rtd-gallery-section'], ['status', '.rtd-gallery-status', '.rtd-gallery-status'], ['footer', '.rtd-gallery-footer', '.rtd-gallery'], ['outlined-text', '.rtd-outlined', '.rtd-outlined'],
      ];
      return pairs.map(([name, fg, bg]) => {
        const front = getComputedStyle(document.querySelector(fg!)!), back = getComputedStyle(document.querySelector(bg!)!);
        const color = front.color, background = name === 'outlined-text' ? front.webkitTextStrokeColor : back.backgroundColor;
        const a = lum(color), b = lum(background);
        return { name, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), color, background };
      });
    });
    for (const c of contrasts) expect(c.ratio, `${c.name}: ${c.color} / ${c.background}`).toBeGreaterThanOrEqual(4.5);
    await expect(page.locator('.rtd-card')).toHaveCount(8);
    await expect(page.locator('.rtd-card').first()).toHaveAccessibleName(/노말.*새 알림/);
    await expect(page.locator('.rtd-button--icon').first()).toHaveAccessibleName(/새 알림/);
    await page.locator('.rtd-card').first().click();
    await expect(page.getByRole('dialog', { name: '캐릭터 카드' })).toBeVisible();
    await expect(page.locator('.rtd-detail-grade')).toHaveText('등급 · 노말');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: '캐릭터 카드' })).not.toBeVisible();
    expect(errors).toEqual([]); expect(remote).toEqual([]);
    if (process.env.SAVE_SCREENS === '1') {
      mkdirSync('docs/design/v2/screens', { recursive: true });
      await page.locator('.rtd-gallery').evaluate(el => { el.scrollTop = 0; });
      await page.screenshot({ path: `docs/design/v2/screens/gallery-${width}-top.png` });
      await page.setViewportSize({ width, height: metrics.height });
      await page.screenshot({ path: `docs/design/v2/screens/gallery-${width}.png`, animations: 'disabled' });
      writeFileSync(`docs/design/v2/screens/audit-${width}.json`, JSON.stringify({ width, ...metrics, contrasts, errors, remote }, null, 2) + '\n');
    }
  });
}

test('PR-B button states, props-only dots, modal focus and reduced motion', async ({ page }) => {
  await page.goto('/?ui-gallery=1');
  const primary = page.getByTestId('v2-primary');
  await expect(primary).toBeVisible();
  const old = await primary.evaluate(el => el.getBoundingClientRect().width);
  await primary.hover(); await page.mouse.down(); await page.waitForTimeout(130);
  const pressed = await primary.evaluate(el => ({ width: el.getBoundingClientRect().width, brightness: getComputedStyle(el).filter }));
  expect(pressed.width / old).toBeCloseTo(.95, 2); expect(pressed.brightness).toBe('brightness(0.96)');
  if (process.env.SAVE_SCREENS === '1') await page.screenshot({ path: 'docs/design/v2/screens/button-pressed.png' });
  await page.mouse.up();
  await expect(page.getByRole('status')).toContainText('빠른 시작 버튼');
  await expect(page.getByTestId('v2-disabled')).toBeDisabled();
  for (const variant of ['primary', 'secondary', 'pill', 'icon', 'mode', 'close']) {
    await expect(page.locator(`.rtd-button--${variant}:disabled`)).toHaveCount(1);
  }
  const before = await page.getByRole('status').textContent();
  await page.getByTestId('v2-disabled').evaluate(el => (el as HTMLButtonElement).click());
  expect(await page.getByRole('status').textContent()).toBe(before);
  const dot = page.locator('.rtd-gallery-dot-host .rtd-notification'); await expect(dot).toBeVisible();
  await page.getByRole('button', { name: '알림 표시 전환', exact: true }).click(); await expect(dot).toBeHidden();
  await page.getByRole('button', { name: '알림 표시 전환', exact: true }).click(); await expect(dot).toBeVisible();
  const open = page.getByRole('button', { name: '핀 고정 열기', exact: true });
  await open.click();
  const dialog = page.getByRole('dialog', { name: '미션', exact: true });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
  if (process.env.SAVE_SCREENS === '1') await page.screenshot({ path: 'docs/design/v2/screens/popup-pinned.png', animations: 'disabled' });
  await dialog.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(open).toBeFocused();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.locator('.rtd-upgrade-arrow').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  await page.getByRole('button', { name: '찢긴 종이 열기', exact: true }).click();
  expect(await page.getByRole('dialog', { name: '보상 확인' }).evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  await page.keyboard.press('Escape');
  // Simulated Android notch/inset via the same custom properties backed by env(safe-area-inset-*).
  await page.locator('.rtd-gallery').evaluate(el => { (el as HTMLElement).style.setProperty('--rtd-safe-top', '30px'); (el as HTMLElement).style.setProperty('--rtd-safe-bottom', '24px'); });
  const safe = await page.locator('.rtd-gallery').evaluate(el => { const s = getComputedStyle(el); return [s.paddingTop, s.paddingBottom]; });
  expect(safe).toEqual(['30px', '24px']);
});

for (const scale of [2, 3]) test(`PR-B vector icons at DPR ${scale}`, async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: scale });
  const page = await context.newPage(); await page.goto(`${baseURL}/?ui-gallery=1`);
  await expect(page.locator('.rtd-gallery-icon-cell')).toHaveCount(29);
  await page.waitForFunction(() => [...document.querySelectorAll('.rtd-gallery-icon-cell img')].every(i => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0));
  expect(await page.evaluate(() => devicePixelRatio)).toBe(scale);
  if (process.env.SAVE_SCREENS === '1') await page.locator('.rtd-gallery-grid--icons').screenshot({ path: `docs/design/v2/screens/icons-${scale}x.png` });
  await context.close();
});
