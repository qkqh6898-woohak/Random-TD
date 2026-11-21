import {test,expect,type Page} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {clickStart} from './title';
async function scene<T>(page:Page,fn:(s:any)=>T):Promise<T>{return page.evaluate(src=>new Function('s',`return (${src})(s)`)((window as any).__rtd.game.scene.getScene('Game')),fn.toString());}
async function start(page:Page,debug=true){await page.goto(debug?'/?dev=1&seed=42':'/?seed=42');await clickStart(page);await expect(page.locator('.battle-v2 [data-screen="game"]')).toBeVisible();await page.evaluate(()=>document.fonts.ready);}
async function shot(page:Page,name:string){if(process.env.SAVE_SCREENS==='1'){mkdirSync('docs/design/v2/battle/screens',{recursive:true});await page.screenshot({path:`docs/design/v2/battle/screens/${name}.png`,animations:'disabled'});}}
async function readable(page:Page,selector:string){
 const bad=await page.locator(selector).evaluate(root=>{
  const rgb=(s:string)=>(s.match(/[\d.]+/g)??[]).slice(0,3).map(Number);
  const lum=(s:string)=>rgb(s).map(n=>{const v=n/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i]!,0);
  return [...root.querySelectorAll<HTMLElement>('*')].filter(e=>e.getClientRects().length&&!e.children.length&&e.textContent?.trim()&&!e.closest('button:disabled')).flatMap(e=>{
   const s=getComputedStyle(e);if(s.visibility==='hidden')return[];
   let bg:HTMLElement|null=e;while(bg&&getComputedStyle(bg).backgroundColor==='rgba(0, 0, 0, 0)')bg=bg.parentElement;
   if(!bg)return[];const a=lum(s.color),b=lum(parseFloat(s.getPropertyValue('-webkit-text-stroke-width'))>=1.5?s.getPropertyValue('-webkit-text-stroke-color'):getComputedStyle(bg).backgroundColor),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
   return parseFloat(s.fontSize)<12||ratio<4.5?[{text:e.textContent,cls:e.className,font:s.fontSize,ratio}]:[];
  });
 });expect(bad).toEqual([]);
}
for(const width of [320,360,393,412])test(`PR-G ${width}px: forest field, controls, menu/stats, mission and upgrade`,async({page})=>{
 await page.setViewportSize({width,height:915});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await start(page,false);
 for(let i=1;i<=3;i++){await page.getByTestId('hud-summon').click();await expect.poll(()=>scene(page,s=>s.match.towers().length)).toBe(i);}
 await expect.poll(()=>scene(page,s=>s.match.towers().length)).toBe(3);await page.waitForTimeout(1400);await expect.poll(()=>scene(page,s=>s.diceStats.active)).toBe(0);
 const m=await page.locator('.hud-root').evaluate(root=>{const r=root.getBoundingClientRect();return{bad:[...root.querySelectorAll<HTMLElement>('.hud button,.hud-dock button')].filter(b=>b.getClientRects().length&&getComputedStyle(b).visibility!=='hidden').filter(b=>{const q=b.getBoundingClientRect(),a=getComputedStyle(b,'::after'),ext=a.content!=='none'&&a.position==='absolute'?Math.max(0,-parseFloat(a.top)||0)+Math.max(0,-parseFloat(a.bottom)||0):0;/* V2-R21: 터치 영역 = 상자 + 위아래로 넓힌 ::after ([준비 완료] 36px + 12px×2) */return q.width<44||q.height+ext<44||q.left<r.left-1||q.right>r.right+1;}).map(b=>({name:b.dataset.testid||b.textContent,w:b.offsetWidth,h:b.offsetHeight})),overflow:document.documentElement.scrollWidth>innerWidth};});
 expect(m.bad).toEqual([]);expect(m.overflow).toBe(false);expect(await scene(page,s=>s.buildHint)).toBe(0);await shot(page,`battle-${width}`);
 await page.getByTestId('battle-menu-toggle').click();await expect(page.getByTestId('battle-menu-toggle')).toHaveAttribute('aria-expanded','true');
 await page.evaluate(()=>window.dispatchEvent(new Event('randomtd:native-back',{cancelable:true})));await expect(page.getByTestId('battle-menu-toggle')).toHaveAttribute('aria-expanded','false');expect(await scene(page,s=>s.paused)).toBe(false);await page.getByTestId('battle-menu-toggle').click();await shot(page,`menu-${width}`);
 await page.getByTestId('battle-menu-stats').click();await expect(page.getByTestId('battle-stats')).toContainText(await page.getByTestId('hud-gold').textContent()??'');await shot(page,`stats-${width}`);await page.keyboard.press('Escape');await expect(page.getByTestId('battle-menu-toggle')).toBeFocused();
 await page.getByTestId('battle-menu-toggle').click();await page.getByTestId('battle-menu-mission').click();await expect(page.getByTestId('sheet-mission')).toBeVisible();await readable(page,'[data-testid="sheet-mission"]');await shot(page,`mission-${width}`);await page.getByTestId('sheet-close').click();
 await page.getByTestId('menu-upgrade').click();await expect(page.getByTestId('sheet-upgrade')).toBeVisible();await readable(page,'[data-testid="sheet-upgrade"]');await shot(page,`upgrade-${width}`);await page.keyboard.press('Escape');expect(errors).toEqual([]);
 if(process.env.SAVE_SCREENS==='1')writeFileSync(`docs/design/v2/battle/screens/layout-${width}.json`,JSON.stringify(m,null,2)+'\n');
});
test('PR-G actual stage ribbon, choice wave timer and hold-to-see without picking',async({page})=>{
 await start(page);await page.getByTestId('hud-summon').click();await page.getByTestId('hud-ready').click();await expect(page.getByTestId('wave-ribbon')).toHaveText('WAVE 1');await shot(page,'wave-ribbon');await expect(page.getByTestId('wave-ribbon')).toHaveCount(0,{timeout:3000});
 await scene(page,s=>{for(let i=0;i<4;i++)s.match.world.enqueue({type:'debugSkipStage',tick:s.match.tick+i});s.debugFastForward(8);});
 await expect(page.getByTestId('choice-card')).toBeVisible();await expect(page.getByTestId('choice-battle-time')).toContainText('웨이브 남은 시간');await readable(page,'[data-testid="choice-card"]');await shot(page,'choice');
 const before=await scene(page,s=>s.match.state.cardsPicked.length),peek=page.getByTestId('choice-peek'),b=(await peek.boundingBox())!;
 await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await expect(page.getByTestId('choice-card')).toHaveClass(/is-peeking/);await shot(page,'choice-peek');expect(await scene(page,s=>s.match.state.cardsPicked.length)).toBe(before);
 await page.mouse.up();await expect(page.getByTestId('choice-card')).not.toHaveClass(/is-peeking/);await page.getByTestId('choice-0').click();await expect.poll(()=>scene(page,s=>s.match.state.cardsPicked.length)).toBe(before+1);
});

test('PR-G short safe-area, reduced motion, unaffordable summon and real currency input',async({page})=>{
 await page.setViewportSize({width:320,height:568});await page.emulateMedia({reducedMotion:'reduce'});await start(page);
 await page.addStyleTag({content:'.battle-v2{--battle-safe-top:24px;--battle-safe-bottom:20px;}'});
 await expect.poll(async()=>{const g=await scene(page,s=>{const r=document.getElementById('stage')!.getBoundingClientRect();return{map:r.top+s.mapArea.y*r.width/1080,need:document.querySelector('.hud')!.getBoundingClientRect().bottom+document.querySelector<HTMLElement>('.toast-probe')!.offsetHeight};});return g.map>=g.need;}).toBe(true);
 const geo=await scene(page,s=>{const r=document.getElementById('stage')!.getBoundingClientRect(),hud=document.querySelector('.hud')!.getBoundingClientRect();return{mapTop:r.top+s.mapArea.y*r.width/1080,hudBottom:hud.bottom,probe:document.querySelector<HTMLElement>('.toast-probe')!.offsetHeight};});
 expect(geo.mapTop).toBeGreaterThanOrEqual(geo.hudBottom+geo.probe);
 for(let i=0;i<3;i++){const previous=await page.getByTestId('hud-workers').textContent();await page.getByTestId('hud-hire').click();await expect(page.getByTestId('hud-workers')).not.toHaveText(previous!);}
 const summon=page.getByTestId('hud-summon');for(let i=0;i<10&&!((await summon.getAttribute('class'))??'').includes('is-off');i++){const gold=await page.getByTestId('hud-gold').textContent();await summon.click();await expect(page.getByTestId('hud-gold')).not.toHaveText(gold!);}
 /* V2-R21: 클래스와 색을 한 번에 읽는다 (사이에 돈이 들어와 다시 켜지는 경쟁 — 검토 #81) */await expect.poll(()=>summon.evaluate(e=>({off:e.classList.contains('is-off'),bg:getComputedStyle(e).backgroundColor}))).toEqual({off:true,bg:'rgb(210, 204, 194)'});await shot(page,'disabled-safe-short');
 await page.getByTestId('hud-ready').click();await expect(page.getByTestId('wave-ribbon')).toHaveCSS('animation-name','none');
 await page.getByTestId('battle-menu-toggle').click();await page.getByTestId('battle-menu-stats').click();const box=(await page.getByTestId('battle-stats').boundingBox())!;expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(568);await shot(page,'stats-safe-short');await page.evaluate(()=>window.dispatchEvent(new Event('randomtd:native-back',{cancelable:true})));await expect(page.getByTestId('battle-stats')).toBeHidden();
});
test('V2-R21 effects off (#75 ✨ 화려한 효과 꺼짐): no WAVE ribbon, no crit numbers/impact; the switch stays in the battle settings',async({page})=>{
 await page.addInitScript(()=>{const s=JSON.parse(localStorage.getItem('rtd.settings')??'{"v":2}');localStorage.setItem('rtd.settings',JSON.stringify({...s,effectsOff:true}));});
 await start(page);await expect(page.locator('.battle-v2')).toHaveClass(/fx-off/);
 await page.getByTestId('hud-summon').click();await expect.poll(()=>scene(page,s=>s.match.towers().length)).toBe(1);
 await page.getByTestId('hud-ready').click();await expect.poll(()=>scene(page,s=>s.match.state.stage)).toBeGreaterThanOrEqual(1);
 await page.waitForTimeout(400);await expect(page.getByTestId('wave-ribbon')).toHaveCount(0);
 // 치명타 숫자(하늘색 '!')·타격 별도 띄우지 않는다 (DamageText.spawn·criticalImpact가 effectsOff를 본다)
 expect(await scene(page,s=>s.floatingText.spawn(100,100,'99!','#4FD8F0',s.time.now,true,true))).toBe(false);
 await page.getByTestId('battle-menu-toggle').click();await page.getByTestId('battle-menu-settings').click();
 await expect(page.getByTestId('pause-effects-off')).toBeVisible();await expect(page.getByTestId('pause-effects-off')).toHaveAttribute('aria-checked','false');
});
test('V2-R21 game over on cream paper: reward box, chips and hero cards are readable (≥4.5:1, ≥12px)',async({page})=>{
 await start(page,false);
 await scene(page,s=>{const m=s.match;m.state.stage=19;m.state.bossesKilled=1;m.state.summons=60;m.state.merges=12;m.state.nextStageTick=m.tick;s.debugFastForward(1+m.rules.bossTimeTicks);});
 await expect(page.locator('[data-screen="gameover"]')).toBeVisible();await expect(page.getByTestId('gameover-rewards')).toBeVisible();
 await expect(page.getByTestId('go-cards')).toBeVisible();
 await readable(page,'[data-testid="gameover-rewards"]');await shot(page,'gameover');
});
