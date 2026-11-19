import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { clickStart } from './title';

for (const width of [320, 360, 393, 412]) for (const kind of ['startup', 'transition'] as const) {
  test(`PR-C ${kind} ${width}px: local assets, readable text and bounded layout`, async ({ page }) => {
    await page.setViewportSize({ width, height: 915 });
    const errors: string[] = [], remote: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => { const u = new URL(r.url()); if (u.protocol.startsWith('http') && u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') remote.push(u.href); });
    await page.goto(`/?loading-preview=${kind}`);
    const screen = page.getByTestId(`loading-${kind}`);
    await expect(screen).toBeVisible();
    await page.waitForFunction(() => [...document.fonts].some(f => f.family.replaceAll('\"', '') === 'RTD Jua' && f.status === 'loaded'));
    await page.waitForFunction(() => [...document.querySelectorAll('.rtd-loading img')].every(i => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0));
    const metrics = await screen.evaluate(el => {
      const root = el.getBoundingClientRect();
      const bad = [...el.querySelectorAll<HTMLElement>('.rtd-loading-logo,.rtd-loading-hint,.rtd-loading-version,.rtd-loading-mascot,.rtd-loading-small')].filter(e => { const r = e.getBoundingClientRect(); return r.left < -.5 || r.right > innerWidth + .5 || r.top < -.5 || r.bottom > innerHeight + .5; }).map(e => e.className);
      const rgb = (s: string) => { const c = s.match(/[\d.]+/g)!.slice(0, 3).map(n => { const v = Number(n) / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126*c[0]! + .7152*c[1]! + .0722*c[2]!; };
      const contrast = [...el.querySelectorAll<HTMLElement>('.rtd-loading-logo > span,.rtd-loading-hint,.rtd-loading-version')].map(e => { const s=getComputedStyle(e), a=rgb(s.color), b=rgb(e.classList.contains('rtd-loading-version')?s.backgroundColor:s.webkitTextStrokeColor); return (Math.max(a,b)+.05)/(Math.min(a,b)+.05); });
      return { width: root.width, height: root.height, overflow: el.scrollWidth > el.clientWidth+1, bad, contrast, inert: (document.getElementById('app')! as HTMLElement).inert, trackWidth: el.querySelector('.rtd-loading-track')?.getBoundingClientRect().width };
    });
    expect(metrics).toMatchObject({ width, height: 915, overflow: false, bad: [], inert: true });
    for (const ratio of metrics.contrast) expect(ratio).toBeGreaterThanOrEqual(4.5);
    if (kind === 'startup') {
      await expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '62');
      expect(metrics.trackWidth!).toBeCloseTo(width * .7, 0);
      await expect(screen.locator('.rtd-loading-version')).toHaveText(/^v\d+\.\d+\.\d+$/);
    }
    expect(errors).toEqual([]); expect(remote).toEqual([]);
    if (process.env.SAVE_SCREENS === '1') {
      mkdirSync('docs/design/v2/loading/screens', { recursive: true });
      await page.screenshot({ path: `docs/design/v2/loading/screens/${kind}-${width}.png`, animations: 'disabled' });
      writeFileSync(`docs/design/v2/loading/screens/${kind}-${width}.json`, JSON.stringify({ ...metrics, errors, remote }, null, 2)+'\n');
    }
  });
}

async function clockHarness(page: Page, startup = false): Promise<void> {
  await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') });
  await page.goto('/?ui-gallery=1');
  await expect(page.getByTestId('v2-gallery')).toBeVisible();
  await page.clock.pauseAt(new Date('2030-01-01T00:01:00Z'));
  await page.evaluate(async initial => {
    const modulePath='/src/ui/loading/LoadingController.ts';
    const { createLoadingController } = await import(modulePath);
    (window as any).__loadingTest = createLoadingController(document.body, document.getElementById('app')!, 'v0.1.9', initial);
    (window as any).__loadingShown = 0;
    const observer = new MutationObserver(records => { for (const record of records) for (const node of record.addedNodes) if (node instanceof HTMLElement && node.matches('[data-testid="loading-transition"]')) (window as any).__loadingShown++; });
    observer.observe(document.body, { childList: true });
  }, startup);
}

test('PR-C transitions: 299ms hidden, 300ms visible, quick completion never flashes; cleanup restores inert', async ({ page }) => {
  await clockHarness(page);
  await page.evaluate(() => (window as any).__loadingTest.beginTransition());
  await page.clock.fastForward(100);
  await page.evaluate(() => (window as any).__loadingTest.endTransition());
  await page.clock.fastForward(1000);
  expect(await page.evaluate(() => (window as any).__loadingShown)).toBe(0);
  expect(await page.locator('#app').evaluate(e => (e as HTMLElement).inert)).toBe(false);
  await page.evaluate(() => (window as any).__loadingTest.beginTransition());
  await page.clock.fastForward(200);
  await page.evaluate(() => (window as any).__loadingTest.beginTransition()); // Duplicate events preserve the original delay.
  await page.clock.fastForward(99);
  await expect(page.getByTestId('loading-transition')).toHaveCount(0);
  await page.clock.fastForward(1);
  await expect(page.getByTestId('loading-transition')).toBeVisible();
  await page.evaluate(() => (window as any).__loadingTest.endTransition());
  await expect(page.getByTestId('loading-transition')).toHaveCount(0);
  await page.evaluate(() => { (window as any).__loadingTest.beginTransition(); (window as any).__loadingTest.destroy(); (window as any).__loadingTest.destroy(); });
  await page.clock.fastForward(1000);
  await expect(page.locator('.rtd-loading')).toHaveCount(0);
  expect(await page.locator('#app').evaluate(e => (e as HTMLElement).inert)).toBe(false);
});

test('PR-C startup: monotonic progress, hint changes at 2 seconds, no minimum wait; reduced motion and safe area', async ({ page }) => {
  await clockHarness(page, true);
  const startup=page.getByTestId('loading-startup');
  await page.evaluate(() => { (window as any).__loadingTest.setProgress(.7); (window as any).__loadingTest.setProgress(.4); });
  await expect(startup.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '70');
  await expect(startup.locator('.rtd-loading-hint')).toHaveText('광부가 주사위를 닦는 중…');
  await page.clock.fastForward(1999);
  await expect(startup.locator('.rtd-loading-hint')).toHaveText('광부가 주사위를 닦는 중…');
  await page.clock.fastForward(1);
  await expect(startup.locator('.rtd-loading-hint')).toHaveText('타워들이 자리를 잡고 있어요');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await startup.locator('.rtd-loading-mascot').evaluate(e => getComputedStyle(e).animationName)).toBe('none');
  await startup.evaluate(el => { el.style.setProperty('--rtd-safe-top','30px'); el.style.setProperty('--rtd-safe-bottom','24px'); });
  expect(await startup.evaluate(el => [getComputedStyle(el).paddingTop,getComputedStyle(el).paddingBottom])).toEqual(['30px','24px']);
  await page.evaluate(() => (window as any).__loadingTest.completeStartup());
  await expect(startup).toHaveCount(0);
  expect(await page.locator('#app').evaluate(e => (e as HTMLElement).inert)).toBe(false);
});

test('PR-C critical HTML shell is visible while the main module is still downloading', async ({ page }) => {
  let release!: () => void; const gate=new Promise<void>(r => { release=r; });
  await page.route('**/src/main.ts', async route => { await gate; await route.continue(); });
  try {
    await page.goto('/', { waitUntil: 'commit' });
    await expect(page.locator('#rtd-boot-placeholder')).toBeVisible();
    await expect(page.locator('#rtd-boot-placeholder')).toContainText('모험을 준비하고 있어요');
  } finally { release(); }
  await expect(page.locator('[data-screen="title"]')).toBeVisible();
  await expect(page.locator('#rtd-boot-placeholder')).toHaveCount(0);
});

test('PR-C real loader progress and slow return to lobby; no stuck overlay after new game or resume', async ({ page }) => {
  let release!: () => void; let gate=new Promise<void>(r => { release=r; }); let hold=true;
  await page.route('**/assets/characters/manifest.json', async route => { if (hold) await gate; await route.continue(); });
  const errors:string[]=[];page.on('pageerror',e => errors.push(e.message));
  try {
    await page.goto('/?debug=1&seed=42', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('loading-startup')).toBeVisible();
    const before=await page.getByTestId('loading-startup').getByRole('progressbar').getAttribute('aria-valuenow');
    expect(Number(before)).toBeLessThan(100);
    release();hold=false;
    await expect(page.locator('[data-screen="title"]')).toBeVisible();
    await expect(page.locator('.rtd-loading')).toHaveCount(0);
    await clickStart(page);
    await expect(page.locator('[data-screen="game"]')).toBeVisible();
    await expect(page.locator('.rtd-loading')).toHaveCount(0);
    // Evict only the view asset cache so a real Boot.preload takes longer than 300ms.
    await page.evaluate(() => (window as any).__rtd.game.cache.json.remove('ext-char-manifest'));
    gate=new Promise<void>(r => { release=r; });hold=true;
    await page.getByRole('button', { name: '일시정지', exact: true }).click();
    await page.getByRole('button', { name: '로비로', exact: true }).click();
    await expect(page.getByTestId('loading-transition')).toBeVisible();
    expect(await page.locator('#app').evaluate(e => (e as HTMLElement).inert)).toBe(true);
    release();hold=false;
    await expect(page.locator('[data-screen="title"]')).toBeVisible();
    await expect(page.locator('.rtd-loading')).toHaveCount(0);
    await page.locator('[data-action="resume-match"]').click();
    await expect(page.locator('[data-screen="game"]')).toBeVisible();
    expect(await page.locator('#app').evaluate(e => (e as HTMLElement).inert)).toBe(false);
    expect(errors).toEqual([]);
  } finally { release(); }
});

test('PR-C missing mascot uses a local icon instead of an empty loading screen', async ({ page }) => {
  await page.route('**/assets/characters/miner.webp', route => route.abort());
  await page.goto('/?loading-preview=startup');
  await expect(page.locator('.rtd-loading-mascot')).toHaveAttribute('src', /assets\/ui\/v2\/heroes\.svg$/);
  await expect.poll(() => page.locator('.rtd-loading-mascot').evaluate(e => (e as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
});
