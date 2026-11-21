/** User-requested transparent terrain. Read actual baked alpha and exercise existing input/actions. */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { clickStart } from './title';
async function scene<T>(page: Page, fn: (s: any) => T): Promise<T> {
  return page.evaluate(src => new Function('s', `return (${src})(s)`)((window as any).__rtd.game.scene.getScene('Game')), fn.toString());
}
async function point(page: Page, cell: readonly number[]) {
  return page.evaluate(([x,y]) => { const L=(window as any).__rtd.game.scene.getScene('Game').mapLayout, r=document.getElementById('stage')!.getBoundingClientRect(), k=r.width/1080;return{x:r.left+(L.originX+(x!+.5)*L.tile)*k,y:r.top+(L.originY+(y!+.5)*L.tile)*k}; },cell);
}
async function shot(page: Page, name: string) {
  if(process.env.SAVE_SCREENS!=='1')return;
  mkdirSync('docs/design/field-context/screens',{recursive:true});
  await page.screenshot({path:`docs/design/field-context/screens/${name}.png`,animations:'disabled'});
}
async function start(page: Page, campaign=false) {
  await page.goto('/?dev=1&seed=42');
  if(campaign)await page.getByRole('button',{name:'캠페인 1 (디버그)'}).click();else await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
}
async function hint(page:Page, n:number) { await expect.poll(()=>scene(page,s=>s.buildHint)).toBe(n); }
async function transparent(page: Page) {
  const values=await scene(page,s=>{
    const L=s.mapLayout, renderer=s.mapRenderer, image=s.textures.get(renderer.textureKey).getSourceImage();
    const ctx=image.getContext('2d'), sprite=s.children.list.find((o:any)=>o.texture?.key===renderer.textureKey);
    return s.match.map.buildable.map(([x,y]:number[])=>ctx.getImageData(Math.round(L.originX+(x!+.5)*L.tile-sprite.x),Math.round(L.originY+(y!+.5)*L.tile-sprite.y),1,1).data[3]);
  });
  expect(values.length).toBeGreaterThan(0);expect(values.every((a:number)=>a===0)).toBe(true);
}
for(const width of [320,360,393,412])test(`transparent field ${width}px: idle → sale/merge selection → move/cancel → upgrade/close`,async({page})=>{
  await page.setViewportSize({width,height:915});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await start(page);await hint(page,0);await transparent(page);
  await expect.poll(()=>scene(page,s=>s.backgroundKey)).not.toBeNull();
  await expect.poll(()=>scene(page,s=>s.background.covered)).toBe(true);
  await scene(page,s=>{for(const [i,t] of [[0,0],[1,0],[4,1]]){const [x,y]=s.match.map.buildable[i!];s.match.world.enqueue({type:'debugTower',x,y,t});}s.debugFastForward(1);});
  await expect.poll(()=>scene(page,s=>s.match.towers().length)).toBe(3);
  await shot(page,`idle-${width}`);
  const cells=await scene(page,s=>s.match.map.buildable as number[][]), p=await point(page,cells[0]!);
  await page.touchscreen.tap(p.x,p.y);await hint(page,1);
  expect(await scene(page,s=>s.fieldHighlights)).toEqual([cells[0],cells[1]]);
  await expect(page.locator('[data-action="sell"]')).toBeVisible();
  await shot(page,`selected-${width}`);
  await page.locator('[data-action="move"]').click();await hint(page,1);
  expect(await scene(page,s=>s.fieldHighlights.length)).toBe(cells.length);
  await shot(page,`move-${width}`);await page.keyboard.press('Escape');await hint(page,0);
  await page.getByTestId('menu-upgrade').click();await hint(page,1);
  expect(await scene(page,s=>s.fieldHighlights)).toEqual([cells[0],cells[1],cells[4]]);
  await shot(page,`upgrade-${width}`);await page.keyboard.press('Escape');await hint(page,0);
  await page.getByRole('button',{name:'일시정지',exact:true}).click();await hint(page,0);
  await page.getByRole('button',{name:'계속',exact:true}).click();await hint(page,0);
  await page.touchscreen.tap(p.x,p.y);await page.locator('[data-action="sell"]').click();
  await expect.poll(()=>scene(page,s=>s.match.towers().length)).toBe(2);await hint(page,0);
  await transparent(page);expect(errors).toEqual([]);
});
test('campaign fallback terrain remains transparent; real drag shows cells then hides them on drop',async({page})=>{
  await page.route('**/assets/backgrounds/**',r=>r.abort());await start(page,true);await hint(page,0);await transparent(page);
  await scene(page,s=>{const [x,y]=s.match.map.buildable[0];s.match.world.enqueue({type:'debugTower',x,y,t:0});s.debugFastForward(1);});
  await expect.poll(()=>scene(page,s=>s.match.towers().length)).toBe(1);
  const cells=await scene(page,s=>s.match.map.buildable as number[][]), from=await point(page,cells[0]!),to=await point(page,cells[1]!);
  await shot(page,'fallback-idle');await page.mouse.move(from.x,from.y);await page.mouse.down();await page.waitForTimeout(450);await page.mouse.move(to.x,to.y,{steps:6});
  await hint(page,1);await expect.poll(()=>scene(page,s=>s.dragState?.drop?.preview)).toBe('move');
  await shot(page,'fallback-drag');await page.mouse.up();
  await expect.poll(()=>scene(page,s=>s.match.towers().map((t:any)=>[t.tx,t.ty]))).toEqual([cells[1]]);await hint(page,0);
  await transparent(page);await shot(page,'fallback-drop');
});
// #79 검토: 칸이 숨겨진 뒤에는 B와 X(막힌 칸)·길이 똑같이 보인다 → 놓을 수 없는 곳을 짧게 누르면 BUILD_HINT_MS(1.2초) 동안 배치 칸 전체를 보여 준다.
const misTapCases: [string, boolean, number[][]][] = [
  ['campaign crossroads: X cells + road', true, [[3, 7], [6, 1], [3, 3]]],
  ['circle: road', false, [[0, 3]]],
];
for (const [label, campaign, misses] of misTapCases) test(`mis-tap hint ${label}: shows buildable cells ~1.2s, then hides; buildable tap still summons`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await start(page, campaign); await hint(page, 0);
  await scene(page, s => { const [x, y] = s.match.map.buildable[0]; s.match.world.enqueue({ type: 'debugTower', x, y, t: 0 }); s.debugFastForward(1); });
  await expect.poll(() => scene(page, s => s.match.towers().length)).toBe(1); await hint(page, 0);
  const total = await scene(page, s => s.match.map.buildable.length as number);
  for (const cell of misses) {
    expect(await page.evaluate(([x, y]) => (window as any).__rtd.game.scene.getScene('Game').match.map.buildable.some((c: number[]) => c[0] === x && c[1] === y), cell)).toBe(false);
    const p = await point(page, cell);
    await page.touchscreen.tap(p.x, p.y);
    await expect.poll(() => scene(page, s => s.buildHint)).toBeGreaterThan(0);
    expect(await scene(page, s => s.fieldHighlights.length)).toBe(total);
    expect(await scene(page, s => s.match.towers().length)).toBe(1);
    await expect.poll(() => scene(page, s => s.fieldHighlights.length), { timeout: 5000 }).toBe(0);
    expect(await scene(page, s => s.buildHint)).toBe(0);
  }
  // 일시정지는 안내를 지운다 (계속해도 다시 나타나지 않음)
  const road = await point(page, misses[misses.length - 1]!);
  await page.touchscreen.tap(road.x, road.y);
  await expect.poll(() => scene(page, s => s.buildHint)).toBeGreaterThan(0);
  await page.getByRole('button', { name: '일시정지', exact: true }).click(); await hint(page, 0);
  await page.getByRole('button', { name: '계속', exact: true }).click();
  expect(await scene(page, s => s.buildHint)).toBe(0);
  // 배치 칸을 누르면 예전처럼 소환되고 안내는 뜨지 않는다
  const cells = await scene(page, s => s.match.map.buildable as number[][]), free = await point(page, cells[1]!);
  await page.touchscreen.tap(free.x, free.y);
  await expect.poll(() => scene(page, s => s.match.towers().length)).toBe(2);
  expect(await scene(page, s => s.buildHint)).toBe(0);
  expect(errors).toEqual([]);
});
