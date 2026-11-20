/** PR-D: real lobby, real store and start/resume callbacks; no mocked gameplay. */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { clickStart, openLobbyMenu } from './title';

async function open(page: Page): Promise<void> {
  await page.goto('/?seed=123');
  await expect(page.locator('.lobby-v2')).toBeVisible();
  await expect(page.getByTestId('loading-startup')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
}
async function snapshot(page: Page, name: string): Promise<void> {
  if (process.env.SAVE_SCREENS !== '1') return;
  mkdirSync('docs/design/v2/lobby/screens', { recursive: true });
  await page.screenshot({ path: `docs/design/v2/lobby/screens/${name}.png`, animations: 'disabled' });
}
for (const width of [320, 360, 393, 412]) {
  test(`PR-D ${width}px: chrome, hit targets, full text, selected tab, local art and contrast`, async ({ page }) => {
    await page.setViewportSize({ width, height: 915 });
    const errors: string[] = [], remote: string[] = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:') && /^https?:/.test(request.url())) remote.push(request.url()); });
    await open(page);
    await page.evaluate(() => {
      const p = JSON.parse(localStorage.getItem('rtd.progress')!);
      Object.assign(p, { bestWave: 40, gold: 999900, gems: 1200000, recruit: 17 });
      p.heroes.miner.cards = 5;
      localStorage.setItem('rtd.progress', JSON.stringify(p));
    });
    await open(page);
    await expect(page.getByTestId('lobby-gold')).toContainText('999.9K');
    await expect(page.getByTestId('lobby-gems')).toContainText('1.2M');
    await expect(page.getByRole('group', { name: '골드 999,900', exact: true })).toBeVisible();
    await expect(page.getByRole('group', { name: '보석 1,200,000', exact: true })).toBeVisible();
    await expect(page.getByTestId('lobby-flame')).toBeVisible();
    await expect(page.getByTestId('wave-best')).toContainText('40');
    await expect(page.getByTestId('recruit-gauge')).toHaveText('17/30');
    const metrics = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('.lobby-v2')!, bounds = root.getBoundingClientRect();
      const elements = [...root.querySelectorAll<HTMLElement>('.lobby-top,.lobby-toolbar,.lobby-battle,.lobby-nav')];
      const buttons = [...root.querySelectorAll<HTMLElement>('.lobby-toolbar button,.lobby-side button,.lobby-aux button,.lobby-start,[data-action="lobby-speed"],.lobby-nav button')];
      const rgb = (s: string) => (s.match(/[\d.]+/g) ?? []).slice(0,3).map(Number);
      const lum = (c: number[]) => c.map(n => { const v = n/255; return v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4; }).reduce((a,v,i) => a+v*[.2126,.7152,.0722][i]!,0);
      const contrast = [...root.querySelectorAll<HTMLElement>('.lobby-location,.lobby-start,.lobby-next,.wave-best-label,.wave-here,.lobby-rail-detail,.lobby-profile-name')].map(e => { const s=getComputedStyle(e); let bg: HTMLElement|null=e; while(bg && getComputedStyle(bg).backgroundColor==='rgba(0, 0, 0, 0)') bg=bg.parentElement; const a=lum(rgb(s.color)), b=lum(rgb(getComputedStyle(bg!).backgroundColor)); return { name:e.className, ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05) }; });
      return {
        overflow: elements.filter(e => e.scrollWidth>e.clientWidth+1).map(e=>e.className),
        badButtons: buttons.filter(e => {const r=e.getBoundingClientRect();return r.width<44||r.height<44||r.left<bounds.left-1||r.right>bounds.right+1||r.bottom>bounds.bottom+1;}).map(e=>e.className),
        clipped: [...root.querySelectorAll<HTMLElement>('.lobby-profile-name,.lobby-rail-detail,.rtd-currency-value,.lobby-flame-value,.lobby-start,.lobby-next')].filter(e=>e.scrollWidth>e.clientWidth+1||e.scrollHeight>e.clientHeight+1).map(e=>e.className),
        missingArt: [...root.querySelectorAll<HTMLImageElement>('.lobby-top img,.lobby-battle img,.lobby-nav img')].filter(e=>!e.complete||!e.naturalWidth).map(e=>e.src),
        selected: [...root.querySelectorAll('.lobby-nav-btn[aria-current="page"]')].map(e=>(e as HTMLElement).dataset.tab),
        inactiveLabelOpacity: [...root.querySelectorAll('.lobby-nav-btn:not(.is-on) .lobby-nav-label')].map(e=>getComputedStyle(e).opacity),
        startRatio: root.querySelector('.lobby-start')!.getBoundingClientRect().width/bounds.width,
        contrast,
      };
    });
    await snapshot(page, `lobby-${width}`);
    expect(metrics).toMatchObject({ overflow: [], badButtons: [], clipped: [], missingArt: [], selected: ['battle'], inactiveLabelOpacity: ['0','0','0','0'] });
    expect(metrics.startRatio).toBeCloseTo(.55, 2);
    for (const c of metrics.contrast) expect(c.ratio, c.name).toBeGreaterThanOrEqual(4.5);
    if (process.env.SAVE_SCREENS === '1') writeFileSync(`docs/design/v2/lobby/screens/lobby-${width}.json`, JSON.stringify(metrics,null,2)+'\n');
    await page.getByTestId('wave-road').evaluate(e => e.scrollTop = 0);
    await page.getByRole('button', { name: '웨이브 보상', exact: true }).click();
    await expect(page.getByTestId('wave-road')).toBeFocused();
    expect(await page.getByTestId('wave-road').evaluate(e => e.scrollTop)).toBeGreaterThan(0);
    await page.locator('[data-action="open-codex"]').click();
    await expect(page.locator('.lobby-v2')).toHaveAttribute('data-tab', 'codex');
    await expect(page.locator('.lobby-nav [data-tab="codex"]')).toHaveAttribute('aria-current', 'page');
    await openLobbyMenu(page);
    await snapshot(page, `menu-${width}`);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('lobby-menu')).toBeHidden();
    await expect(page.locator('[data-action="lobby-menu"]')).toBeFocused();
    expect(errors).toEqual([]); expect(remote).toEqual([]);
  });
}

test('PR-D speed: ×1 default, five choices cycle, chosen speed starts a real game and saved speed wins on resume', async ({ page }) => {
  test.slow();
  await open(page);
  const speed = page.locator('[data-action="lobby-speed"]');
  const sequence = [1,2,4,8,16,1,2,4,8];
  for (let i=0; i<sequence.length; i++) {
    await expect(speed).toHaveAccessibleName(`새 게임 배속 ×${sequence[i]}`);
    if(i<sequence.length-1) await speed.click();
  }
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__rtd.game.scene.getScene('Game').simStats.speed)).toBe(8);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await open(page);
  await expect(speed).toHaveAccessibleName('새 게임 배속 ×1');
  await speed.click(); // ×2 is for a new game, never overrides the saved ×8.
  await page.setViewportSize({width:320,height:568});
  await snapshot(page, 'resume-320');
  const overlap = await page.evaluate(() => { const rail=document.querySelector('.lobby-side-left')!.getBoundingClientRect(); const actions=document.querySelector('.lobby-actions')!.getBoundingClientRect(); return rail.bottom-actions.top; });
  expect(overlap).toBeLessThanOrEqual(0);
  await page.locator('[data-action="resume-match"]').click();
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__rtd.game.scene.getScene('Game').simStats.speed)).toBe(8);
});

test('PR-D 320×568: short viewport, simulated Android safe-area, reduced motion and pressed/disabled primary', async ({ page }) => {
  await page.setViewportSize({width:320,height:568});
  await page.emulateMedia({reducedMotion:'reduce'});
  await open(page);
  await page.addStyleTag({content:'.lobby-v2 { --lobby-safe-top:24px; --lobby-safe-bottom:20px; --lobby-safe-left:8px; --lobby-safe-right:8px; }'});
  const root=page.locator('.lobby-v2'), start=page.locator('[data-action="start"]');
  const m=await root.evaluate(el=>{
    const nav=el.querySelector('.lobby-nav')!.getBoundingClientRect(), root=el.getBoundingClientRect(), primary=el.querySelector('.lobby-start')!.getBoundingClientRect();
    return {bottom:nav.bottom,rootBottom:root.bottom,primaryBottom:primary.bottom,navTop:nav.top,scroll:el.scrollHeight-el.clientHeight,transition:getComputedStyle(el.querySelector('.lobby-start')!).transitionDuration};
  });
  expect(m.bottom).toBeLessThanOrEqual(m.rootBottom+.5); expect(m.primaryBottom).toBeLessThan(m.navTop); expect(m.scroll).toBeLessThanOrEqual(1); expect(m.transition).toBe('0s');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await start.evaluate(e=>e.addEventListener('click',ev=>{ev.preventDefault();ev.stopImmediatePropagation();},{capture:true,once:true}));
  const box=(await start.boundingBox())!;
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.down();
  await page.waitForTimeout(150);
  await expect.poll(() => start.evaluate(e => new DOMMatrixReadOnly(getComputedStyle(e).transform).a)).toBeCloseTo(.95, 3);
  await snapshot(page,'pressed-320');
  await page.mouse.up();
  await start.evaluate(e=>(e as HTMLButtonElement).disabled=true);
  await expect(start).toBeDisabled();
  await snapshot(page,'short-disabled-320');
});
