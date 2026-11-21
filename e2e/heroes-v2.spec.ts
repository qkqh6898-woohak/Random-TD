/** PR-E real collection, unchanged progression commands/selectors. */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const towers = (JSON.parse(readFileSync('src/data/towers.json','utf8')) as { towers: {id:string;name:string;grade:string}[] }).towers;
const grades = ['normal','rare','unique','hero','legend','god','hidden'];
const exampleIds = Object.fromEntries(grades.map(g => [g,towers.find(t=>t.grade===g)!.id]));
const lockedId = towers.filter(t=>t.grade==='hidden')[1]!.id;
async function open(page:Page):Promise<void> {
  await page.goto('/?seed=81'); await expect(page.locator('.lobby-v2')).toBeVisible();
  await expect(page.getByTestId('loading-startup')).toHaveCount(0);
  await page.locator('.lobby-nav [data-tab="heroes"]').click();
  await page.evaluate(()=>document.fonts.ready);
}
async function seed(page:Page):Promise<number> {
  const sum=await page.evaluate(({ids,locked})=>{
    const p=JSON.parse(localStorage.getItem('rtd.progress')!); p.flame=10000;
    for(const [grade,id] of Object.entries(ids))p.heroes[id]={level:grade==='unique'?15:grade==='hero'?3:1,cards:grade==='normal'?999900:grade==='hero'?25:0};
    p.heroes[locked]={level:0,cards:5};
    localStorage.setItem('rtd.progress',JSON.stringify(p));
    return Object.values(p.heroes).reduce((a:number,e:any)=>a+e.level,0) as number;
  },{ids:exampleIds,locked:lockedId});
  await open(page); return sum;
}
async function shot(page:Page,name:string):Promise<void> {
  if(process.env.SAVE_SCREENS!=='1')return;
  mkdirSync('docs/design/v2/heroes/screens',{recursive:true});
  await page.screenshot({path:`docs/design/v2/heroes/screens/${name}.png`,animations:'disabled'});
}
for(const width of [320,360,393,412])test(`PR-E ${width}px: four columns, seven grades, full labels, silhouette, ratio and touch`,async({page})=>{
  await page.setViewportSize({width,height:915});
  const errors:string[]=[],remote:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith('http://127.0.0.1:'))remote.push(r.url());});
  await open(page); const sum=await seed(page);
  await expect(page.getByTestId('hero-level-sum')).toHaveText(String(sum));
  await expect(page.getByTestId('hero-bonus-range')).toHaveText('+0~56%');
  await expect(page.locator(`.hero-card[data-hero="${exampleIds.normal}"] .hero-card-num`)).toHaveText('999.9K/2');
  await expect(page.locator(`.hero-card[data-hero="${exampleIds.unique}"] .hero-card-num`)).toHaveText('MAX');
  const captured:any[]=[];
  for(const tab of ['heroes','mythic']){
    await page.locator(`[data-hero-tab="${tab}"]`).click();
    await page.waitForFunction(()=>[...document.querySelectorAll<HTMLImageElement>('.heroes-v2 img.hero-portrait')].every(i=>i.complete&&i.naturalWidth>0));
    const m=await page.locator('.heroes-v2').evaluate(root=>{
      const list=root.querySelector<HTMLElement>('.lobby-scroll')!, grids=[...root.querySelectorAll<HTMLElement>('.hero-grid')];
      const cards=[...root.querySelectorAll<HTMLElement>('.hero-card')];const bad:string[]=[];
      for(const card of cards){
        const box=card.getBoundingClientRect(),face=card.querySelector<HTMLElement>('.rtd-card-face')!,r=face.getBoundingClientRect();
        const image=card.querySelector<HTMLElement>('.hero-portrait')!,i=image.getBoundingClientRect(),level=card.querySelector<HTMLElement>('.hero-card-lv')!.getBoundingClientRect(),bar=card.querySelector<HTMLElement>('.rtd-progress')!.getBoundingClientRect();
        if(box.width<44||box.height<44||Math.abs(r.height/r.width-1.15)>.02||i.left<r.left||i.right>r.right||i.top<r.top||i.bottom>level.top+1||level.bottom>bar.top+1)bad.push(`geometry:${card.dataset.hero}`);
        for(const t of card.querySelectorAll<HTMLElement>('.hero-card-name,.hero-card-lv,.hero-card-num'))if(t.scrollWidth>t.clientWidth+1||t.scrollHeight>t.clientHeight+1||parseFloat(getComputedStyle(t).fontSize)<12)bad.push(`text:${card.dataset.hero}:${t.className}:${t.scrollWidth}/${t.clientWidth}:${t.scrollHeight}/${t.clientHeight}:${getComputedStyle(t).fontFamily}`);
        if(card.classList.contains('is-unowned')&&!getComputedStyle(image).filter.includes('brightness(0)'))bad.push(`silhouette:${card.dataset.hero}`);
      }
      const first=[...grids[0]!.children].slice(0,4).map(e=>e.getBoundingClientRect());
      const gap=first.length>=2?(first[1]!.left-first[0]!.right)/first[0]!.width:0;
      return{bad,columns:getComputedStyle(grids[0]!).gridTemplateColumns.split(' ').length,gap,overflow:root.scrollWidth>root.clientWidth+1,scrollHeight:list.scrollHeight,clientHeight:list.clientHeight,
        colors:[...new Set(cards.filter(c=>!c.classList.contains('is-unowned')).map(c=>`${c.dataset.grade}:${getComputedStyle(c.querySelector('.rtd-card-face')!).backgroundColor}`))],
        tokens:cards.filter(c=>!c.classList.contains('is-unowned')).map(c=>({grade:c.dataset.grade,bg:getComputedStyle(c).getPropertyValue('--rtd-grade-bg').trim(),border:getComputedStyle(c).getPropertyValue('--rtd-grade-border').trim()})),
        hiddenRibbon:!!root.querySelector('[data-grade="hidden"] .rtd-card-ribbon')};
    });
    await shot(page,`${tab}-${width}`);
    expect(m.bad).toEqual([]);expect(m.columns).toBe(4);expect(m.overflow).toBe(false);expect(m.gap).toBeCloseTo(.08,2);
    const palette:Record<string,[string,string]>={normal:['#B7AC8E','#F3EBD3'],rare:['#3E4F8C','#5B8BE0'],unique:['#6A3A9C','#9B6AD8'],hero:['#E3A92B','#FFE07A'],legend:['#E2772A','#FF9A3C'],god:['#B8323A','#FF6B6B'],hidden:['#2B2A5E','#FFD54A']};
    for(const t of m.tokens)expect([t.bg,t.border]).toEqual(palette[t.grade!]);
    if(tab==='mythic')expect(m.hiddenRibbon).toBe(true);
    captured.push({tab,...m});
  }
  await page.locator(`.hero-card[data-hero="${lockedId}"]`).click();
  await expect(page.getByTestId('hero-detail').locator('.hero-detail-grade')).toHaveText('리미티드');
  await page.getByTestId('hero-detail-close').click();
  await page.getByTestId('hero-growth-open').click();
  await expect(page.getByTestId('hero-growth-info')).toContainText('영웅마다 따로 적용');
  await page.keyboard.press('Escape');await expect(page.getByTestId('hero-growth-open')).toBeFocused();
  expect(errors).toEqual([]);expect(remote).toEqual([]);
  if(process.env.SAVE_SCREENS==='1')writeFileSync(`docs/design/v2/heroes/screens/layout-${width}.json`,JSON.stringify({captured,errors,remote},null,2)+'\n');
});

test('PR-E real level-up updates summary and badges without changing the existing costs',async({page})=>{
  await open(page);
  await page.evaluate(()=>{const p=JSON.parse(localStorage.getItem('rtd.progress')!);p.heroes.miner.cards=5;p.flame=100;localStorage.setItem('rtd.progress',JSON.stringify(p));});
  await open(page);await expect(page.getByTestId('hero-level-sum')).toHaveText('25');
  await page.locator('.hero-card[data-hero="miner"]').click();
  await page.getByTestId('hero-levelup').click();
  await expect(page.getByTestId('hero-detail-level')).toHaveText('Lv 2');
  await expect(page.getByTestId('hero-level-sum')).toHaveText('26');
  await expect(page.getByTestId('hero-bonus-range')).toHaveText('+0~4%');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('rtd.progress')!).flame)).toBe(90);
});

test('PR-E 320×568: safe areas, reduced motion, info dialog/back and no blocked actions',async({page})=>{
  await page.setViewportSize({width:320,height:568});await page.emulateMedia({reducedMotion:'reduce'});
  await open(page);await seed(page);
  await page.addStyleTag({content:'.lobby-v2 {--lobby-safe-top:24px;--lobby-safe-bottom:20px;--lobby-safe-left:8px;--lobby-safe-right:8px;}'});
  const m=await page.locator('.heroes-v2').evaluate(root=>{
    const bounds=root.getBoundingClientRect();const buttons=[...root.querySelectorAll<HTMLElement>(':scope > div button,:scope > section button')].filter(e=>!e.closest('.lobby-scroll'));
    return{scroll:root.querySelector('.lobby-scroll')!.getBoundingClientRect().height,overflow:root.scrollWidth>root.clientWidth+1,bad:buttons.filter(b=>{const r=b.getBoundingClientRect();return r.width<44||r.height<44||r.left<bounds.left||r.right>bounds.right;}).map(b=>b.textContent),animation:getComputedStyle(root.querySelector('.hero-up')!).animationName};
  });
  expect(m.overflow).toBe(false);expect(m.bad).toEqual([]);expect(m.scroll).toBeGreaterThan(60);expect(m.animation).toBe('none');
  await page.getByTestId('hero-growth-open').click();
  const dialog=(await page.getByTestId('hero-growth-info').boundingBox())!; expect(dialog.y).toBeGreaterThanOrEqual(0);expect(dialog.y+dialog.height).toBeLessThanOrEqual(568);
  for(const b of await page.getByTestId('hero-growth-info').locator('button').all()){const box=(await b.boundingBox())!;expect(box.height).toBeGreaterThanOrEqual(44);expect(box.y+box.height).toBeLessThanOrEqual(568);}
  await shot(page,'info-short-320');
  await page.evaluate(()=>window.dispatchEvent(new Event('randomtd:native-back',{cancelable:true})));
  await expect(page.getByTestId('hero-growth-info')).toBeHidden();
});

test('PR-E rendered text contrast, disabled bulk action and pressed card',async({page})=>{
  await open(page);await expect(page.getByTestId('hero-levelup-all')).toBeDisabled();
  await seed(page);await expect(page.getByTestId('hero-levelup-all')).toBeEnabled();
  const contrast=await page.locator('.heroes-v2').evaluate(root=>{
    const rgb=(s:string)=>(s.match(/[\d.]+/g)??[]).slice(0,3).map(Number);
    const lum=(s:string)=>rgb(s).map(n=>{const v=n/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i]!,0);
    const ratio=(a:string,b:string)=>{const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
    return [...root.querySelectorAll<HTMLElement>('.hero-summary p,.hero-summary strong,.hero-card-name,.hero-card-lv,.hero-card-num,.lobby-seg,.lobby-count,.hero-levelup-all')].map(el=>{
      const s=getComputedStyle(el);let bg:HTMLElement|null=el;while(bg&&getComputedStyle(bg).backgroundColor==='rgba(0, 0, 0, 0)')bg=bg.parentElement;
      const surface=getComputedStyle(bg!).backgroundColor,stroke=s.getPropertyValue('-webkit-text-stroke-color');
      return{name:el.className,ratio:parseFloat(s.getPropertyValue('-webkit-text-stroke-width'))>=1.5?ratio(s.color,stroke):ratio(s.color,surface)};
    });
  });
  for(const c of contrast)expect(c.ratio,c.name).toBeGreaterThanOrEqual(4.5);
  const card=page.locator('.hero-card').first();await card.evaluate(e=>e.addEventListener('click',ev=>{ev.preventDefault();ev.stopImmediatePropagation();},{capture:true,once:true}));
  const box=(await card.boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  await expect.poll(()=>card.evaluate(e=>new DOMMatrixReadOnly(getComputedStyle(e).transform).a)).toBeCloseTo(.95,3);
  await shot(page,'pressed');await page.mouse.up();
  if(process.env.SAVE_SCREENS==='1')writeFileSync('docs/design/v2/heroes/screens/contrast.json',JSON.stringify(contrast,null,2)+'\n');
});
