/**
 * G-2 화면·캐릭터 디자인 E2E (휴대폰 412×915 · 360×800 · 320×640, 넓은 화면 1280×800):
 *  a. 테두리 테마 「금테 성채」가 붙는다 (data-theme · 코드로 그린 SVG 장식 변수 · 띠·메뉴·시트 장식), 주사위 이모지 없음(타이틀 문장·소환문 아이콘),
 *     테마를 떼어도 HUD·아래 묶음·맵 배치 크기가 같다(크기는 그대로), 412/360/320 가로 넘침 없음.
 *  b. 소환 연출 = 소환문 + 실루엣 + 그 캐릭터 초상 카드 (카운터 증가), 승급 = 카드 + 등급 별, 주사위 텍스처를 쓰지 않는다.
 *  c. 연출 끄기 · 동작 줄이기면 카드·소환문·실루엣·별 없음.
 *  d. 캐릭터 겉모습: 등급 7종 받침대·별 배지·종족 문장이 등급·종족마다 다른 텍스처로 그려진다.
 *  e. 넓은 화면 양옆: 격자 무늬 + 무대 금테.
 * 스크린샷 (SAVE_SCREENS=1): docs/screens/G2-after-*.png 는 별도(_g2shots) — 여기서는 test-results/screens 만.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { clickStart } from './title';

type Stats = { active: number; shown: number; peak: number; portals: number; silhouettes: number; stars: number };
type Pres = { pedestal: string; stars: string; emblem: string; shadow: string; pedestalScale: number };
type SceneLike = {
  match: {
    state: { gold: number };
    map: { buildable: [number, number][] };
    rules: { towerOrder: string[] };
    towers(): { id: number; tx: number; ty: number; tower: string }[];
    world: { enqueue(c: Record<string, unknown>): { ok: boolean } };
  };
  mapLayout: { originX: number; originY: number; tile: number };
  summonFxStats: Stats;
  towerLayer: { presentationOf(id: number): Pres | null; textureKey(towerId: string): string };
  textures: { exists(k: string): boolean; get(k: string): { getSourceImage(): { width: number; height: number } } };
  children: { list: { name: string; list?: { texture?: { key: string } }[]; texture?: { key: string } }[] };
  events: { on(e: string, f: () => void): void };
  tweens: { timeScale: number };
  debugFastForward(n: number): number;
};

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  return errors;
}

async function sim<T, A = null>(page: Page, fn: (s: SceneLike, a: A) => T, arg: A = null as A): Promise<T> {
  return page.evaluate(
    ([src, a]) => {
      const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game');
      return (0, eval)(src)(s, a);
    },
    [`(${fn.toString()})`, arg] as const,
  ) as Promise<T>;
}

async function start(page: Page, query = '?debug=1&seed=42', settings: Record<string, unknown> = {}): Promise<void> {
  await page.addInitScript((s) => localStorage.setItem('rtd.settings', JSON.stringify({ v: 1, tapMerge: false, ...s })), settings);
  await page.goto(`/${query}`);
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
  await expect.poll(() => sim(page, (s) => s.mapLayout.tile)).toBeGreaterThan(0);
  await sim(page, (s) => s.match.world.enqueue({ type: 'debugAddGold', amount: 1_000_000 }));
  await page.waitForTimeout(300);
}

/** 소환·승급 연출 이름과 주사위 텍스처 사용을 모은다 */
async function watchFx(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { g2: { names: string[]; dieTex: number; cardTex: string[] }; __rtd: { game: { scene: { getScene(k: string): unknown } } } };
    const s = w.__rtd.game.scene.getScene('Game') as SceneLike;
    w.g2 = { names: [], dieTex: 0, cardTex: [] };
    s.events.on('postupdate', () => {
      for (const c of s.children.list) {
        if (/^(summon|merge)-/.test(c.name) && !w.g2.names.includes(c.name)) w.g2.names.push(c.name);
        if (c.texture?.key.startsWith('fx-dice-')) w.g2.dieTex++;
        if (c.name.endsWith('-card') && c.list) for (const k of c.list) if (k.texture && !w.g2.cardTex.includes(k.texture.key)) w.g2.cardTex.push(k.texture.key);
      }
    });
  });
}
const fxSeen = (page: Page) => page.evaluate(() => (window as unknown as { g2: { names: string[]; dieTex: number; cardTex: string[] } }).g2);

test.describe('G-2 a. 테두리 테마', () => {
  for (const vp of [
    { width: 412, height: 915 },
    { width: 360, height: 800 },
    { width: 320, height: 640 },
  ]) {
    test(`${vp.width}×${vp.height}: 테마·장식이 붙고, 크기는 그대로, 가로 넘침 없음`, async ({ page }) => {
      const errors = collectErrors(page);
      await page.setViewportSize(vp);
      await page.goto('/?debug=1&seed=42');
      await expect(page.locator('[data-screen="title"]')).toBeVisible();
      // 타이틀: 주사위 이모지 대신 캐릭터 문장 둘 (SVG 배경)
      expect(await page.locator('html').getAttribute('data-theme')).toBe('gilded');
      const crests = page.locator('.title-crest');
      await expect(crests).toHaveCount(2);
      expect(await crests.first().evaluate((el) => getComputedStyle(el).backgroundImage)).toContain('data:image/svg+xml');
      await expect(page.locator('.title-logo')).not.toContainText('🎲');
      await clickStart(page);
      await expect(page.locator('[data-screen="game"]')).toBeVisible();
      await expect.poll(() => sim(page, (s) => s.mapLayout.tile)).toBeGreaterThan(0);
      await expect.poll(() => page.locator('[data-testid="hud-summon"] [data-icon="hud-summon"]').evaluate((e) => (e as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

      const look = await page.evaluate(() => {
        const cs = (sel: string, pseudo?: string) => getComputedStyle(document.querySelector(sel)!, pseudo);
        return {
          corner: getComputedStyle(document.documentElement).getPropertyValue('--orn-corner-tl'),
          barLine: cs('.hud-bar').borderBottomColor,
          barOrn: cs('.hud-bar', '::before').backgroundImage,
          barGem: cs('.hud-bar', '::after').backgroundImage,
          bottomOrn: cs('.hud-bottom', '::before').backgroundImage,
          bottomBg: cs('.hud-bottom').backgroundImage,
          menuBg: cs('.hud-menu').backgroundImage,
          mapFrame: cs('#game', '::after').boxShadow,
          summonIcon: document.querySelector<HTMLImageElement>('[data-testid="hud-summon"] [data-icon="hud-summon"]')!.getAttribute('src'),
          summonText: (document.querySelector('[data-testid="hud-summon"]')! as HTMLElement).innerText,
          pointer: [cs('.hud-bar', '::before').pointerEvents, cs('.hud-bottom', '::before').pointerEvents, cs('#game', '::after').pointerEvents],
        };
      });
      expect(look.corner).toMatch(/^url\("data:image\/svg\+xml/);
      expect(look.barLine).toBe('rgba(232, 182, 74, 0.85)'); // 금테
      for (const v of [look.barOrn, look.barGem, look.bottomOrn]) expect(v).toContain('data:image/svg+xml');
      expect(look.summonIcon).toContain('assets/ui/icons/hud-summon.webp'); // ART-2: 힉스필드 V2 아이콘 그림
      expect(look.bottomBg).toContain('gradient');
      expect(look.menuBg).toContain('data:image/svg+xml'); // 금줄
      expect(look.mapFrame).toContain('rgba(232, 182, 74');
      expect(look.summonText).not.toContain('🎲');
      expect(look.summonText).toContain('원');
      expect(look.pointer).toEqual(['none', 'none', 'none']);
      await expect(page.getByTestId('hud-summon')).toHaveAttribute('aria-label', '소환 (꾹 누르면 연속)');
      // 아이콘을 눌러도 [소환] 버튼 (아이콘에 따로 testid·누르기 대상 없음 — f10 '가운데를 누르면 hud-summon' 그대로)
      const sb = (await page.getByTestId('hud-summon').boundingBox())!;
      for (const fx of [0.2, 0.5]) {
        expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-testid]')?.getAttribute('data-testid'), [sb.x + sb.width * fx, sb.y + sb.height / 2] as const)).toBe('hud-summon');
      }

      // 크기는 그대로: 테마를 떼고 다시 재도 HUD·아래 묶음·맵 배치가 같다
      const measure = () =>
        page.evaluate(() => {
          const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
          return { hud: r('.hud').height, bottom: r('.hud-bottom').height, dock: r('.hud-dock').height, menu: r('.hud-menu').height, summon: r('[data-testid="hud-summon"]').width };
        });
      const themed = await measure();
      await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
      const plain = await measure();
      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'gilded'));
      for (const k of ['hud', 'bottom', 'dock', 'menu'] as const) expect(Math.abs(themed[k] - plain[k]), k).toBeLessThan(0.6);

      // 가로 넘침 없음 (아래 띠 한 줄 + 문서 전체)
      const over = await page.evaluate(() => {
        const band = document.querySelector('.hud-bottom') as HTMLElement;
        const br = band.getBoundingClientRect();
        const kids = [...band.querySelectorAll<HTMLElement>(':scope > *, .hud-choice-slot > *')].filter((e) => e.offsetParent !== null);
        // 줄 수 = 세로로 겹치지 않는 묶음 수 (G 통합: G-1 아래 띠는 [👷 300원]이 46px로 다른 칩보다 커서, 위 끝 6px 반올림으로는
        // 한 줄인데도 3칸으로 세어졌다 — 가운데 정렬된 한 줄은 모두 세로로 겹친다)
        const boxes = kids.map((e) => e.getBoundingClientRect()).sort((a, b) => a.top - b.top);
        const tops = new Set<number>();
        let rowBottom = Number.NEGATIVE_INFINITY;
        for (const b of boxes) {
          if (b.top >= rowBottom - 0.5) {
            tops.add(tops.size);
            rowBottom = b.bottom;
          } else rowBottom = Math.min(rowBottom, b.bottom);
        }
        return {
          doc: document.documentElement.scrollWidth - window.innerWidth,
          band: band.scrollWidth - band.clientWidth,
          right: Math.max(...kids.map((e) => e.getBoundingClientRect().right)) - br.right,
          rows: tops.size,
        };
      });
      expect(over.doc).toBeLessThanOrEqual(0);
      expect(over.band).toBeLessThanOrEqual(0);
      expect(over.right).toBeLessThanOrEqual(0.5);
      expect(over.rows).toBe(1); // 한 줄
      // 맵 영역 재기: 맵 0줄 위 끝이 HUD 아래 끝보다 아래 (게임 px → 화면 px)
      const mapTop = await page.evaluate(() => {
        const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): { mapLayout: { originY: number } } } } } }).__rtd.game.scene.getScene('Game');
        const st = document.getElementById('stage')!.getBoundingClientRect();
        return { top: st.top + s.mapLayout.originY * (st.width / 1080), hud: document.querySelector('.hud')!.getBoundingClientRect().bottom };
      });
      expect(mapTop.top).toBeGreaterThanOrEqual(mapTop.hud - 1);
      mkdirSync('test-results/screens', { recursive: true });
      await page.screenshot({ path: `test-results/screens/G2-frame-${vp.width}.png` });
      expect(errors).toEqual([]);
    });
  }

  test('시트·패널도 금테 판 (모서리 장식)', async ({ page }) => {
    await start(page);
    await page.getByTestId('menu-upgrade').click();
    const sheet = page.locator('.bsheet');
    await expect(sheet).toBeVisible();
    const bg = await sheet.evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(bg).toContain('data:image/svg+xml');
    expect(bg).toContain('gradient');
    expect(await sheet.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe('rgb(232, 182, 74)');
  });

  test('넓은 화면: 양옆 띠는 격자 무늬, 무대는 금테 액자', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?debug=1&seed=42');
    await expect(page.locator('[data-screen="title"]')).toBeVisible();
    await expect(page.locator('#stage')).toHaveAttribute('data-full', '0');
    const v = await page.evaluate(() => ({ app: getComputedStyle(document.getElementById('app')!).backgroundImage, stage: getComputedStyle(document.getElementById('stage')!).boxShadow }));
    expect(v.app).toContain('data:image/svg+xml');
    expect(v.stage).toContain('rgb(232, 182, 74)');
  });
});

test('G-2 b. 소환 = 소환문 + 실루엣 + 그 캐릭터 초상 카드, 승급 = 카드 + 등급 별, 주사위 텍스처 없음', async ({ page }) => {
  test.slow();
  const errors = collectErrors(page);
  await start(page);
  await watchFx(page);
  const before = await sim(page, (s) => s.summonFxStats);
  expect(before.shown).toBe(0);
  await page.getByTestId('hud-summon').click();
  await expect.poll(() => sim(page, (s) => s.summonFxStats.shown)).toBe(1);
  const st = await sim(page, (s) => s.summonFxStats);
  expect(st.portals).toBe(1);
  expect(st.silhouettes).toBe(1);
  await expect.poll(async () => (await fxSeen(page)).names).toEqual(expect.arrayContaining(['summon-portal', 'summon-burst', 'summon-silhouette', 'summon-card']));
  // 카드 앞면 초상 = 소환된 타워의 캐릭터 그림 (정보 패널 초상과 같은 텍스처)
  const portrait = await sim(page, (s) => s.towerLayer.textureKey(s.match.towers()[0]!.tower));
  await expect.poll(async () => (await fxSeen(page)).cardTex).toContain(portrait);
  // 승급
  const tri = await sim(page, (s) => {
    const used = new Set(s.match.towers().map((t) => `${t.tx},${t.ty}`));
    const free = s.match.map.buildable.filter(([a, b]) => !used.has(`${a},${b}`)).slice(0, 3);
    for (const [x, y] of free) s.match.world.enqueue({ type: 'debugTower', x, y, t: s.match.rules.towerOrder.indexOf('archer') });
    s.debugFastForward(1);
    return free;
  });
  await page.waitForTimeout(300);
  // 디버그 배치의 소환 카드도 셀 수 있다. 준비용 카드와 분리해 실제 승급이 정확히 카드 1장을 더 만드는지 본다.
  const shownBeforeMerge = await sim(page, (s) => s.summonFxStats.shown);
  await sim(page, (s, c) => s.match.world.enqueue({ type: 'merge', x: c[0], y: c[1] }), tri[0]!);
  await expect.poll(() => sim(page, (s) => s.summonFxStats.stars)).toBeGreaterThanOrEqual(2); // 레어 = 별 2개
  await expect.poll(async () => (await fxSeen(page)).names).toEqual(expect.arrayContaining(['merge-material-orb', 'merge-portal', 'merge-card', 'merge-star']));
  const after = await sim(page, (s) => s.summonFxStats);
  expect(after.shown).toBe(shownBeforeMerge + 1);
  expect(after.peak).toBeGreaterThanOrEqual(1);
  expect((await fxSeen(page)).dieTex).toBe(0);
  expect(errors).toEqual([]);
});

for (const mode of ['effectsOff', 'reducedMotion'] as const) {
  test(`G-2 c. ${mode === 'effectsOff' ? '연출 끄기' : '동작 줄이기'}: 카드·소환문·실루엣·별 없음`, async ({ page }) => {
    const errors = collectErrors(page);
    if (mode === 'reducedMotion') await page.emulateMedia({ reducedMotion: 'reduce' });
    await start(page, mode === 'effectsOff' ? '?dev=1&seed=42' : '?debug=1&seed=42', mode === 'effectsOff' ? { effectsOff: true } : {});
    await watchFx(page);
    await page.getByTestId('hud-summon').click();
    await expect(page.getByTestId('hud-towers')).toHaveText(/^1\//);
    const tri = await sim(page, (s) => {
      const used = new Set(s.match.towers().map((t) => `${t.tx},${t.ty}`));
      const free = s.match.map.buildable.filter(([a, b]) => !used.has(`${a},${b}`)).slice(0, 3);
      for (const [x, y] of free) s.match.world.enqueue({ type: 'debugTower', x, y, t: s.match.rules.towerOrder.indexOf('archer') });
      s.debugFastForward(1);
      return free;
    });
    await page.waitForTimeout(300);
    await sim(page, (s, c) => s.match.world.enqueue({ type: 'merge', x: c[0], y: c[1] }), tri[0]!);
    await expect(page.getByTestId('hud-towers')).toHaveText(/^2\//);
    await page.waitForTimeout(700);
    const st = await sim(page, (s) => s.summonFxStats);
    expect(st).toEqual({ active: 0, shown: 0, peak: 0, portals: 0, silhouettes: 0, stars: 0 });
    // 동작 줄이기는 예전처럼 빛 구슬(merge-material-orb)·빛 기둥만, 연출 끄기는 아무것도
    const names = (await fxSeen(page)).names;
    if (mode === 'effectsOff') expect(names).toEqual([]);
    else expect(names.filter((n) => n !== 'merge-material-orb')).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('G-2 d. 캐릭터 겉모습: 등급 7종 받침대·별 배지·종족 문장 (등급·종족마다 다른 텍스처)', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  const ids = ['miner', 'merchant', 'icemage', 'summoner', 'dragoncaller', 'fate', 'elemental'];
  const list = await sim(
    page,
    (s, l) => {
      const b = s.match.map.buildable;
      const picks = [0, 3, 6, 9, 12, 15, 18].map((i) => b[i % b.length]!);
      l.forEach((id, i) => s.match.world.enqueue({ type: 'debugTower', x: picks[i]![0], y: picks[i]![1], t: s.match.rules.towerOrder.indexOf(id) }));
      s.debugFastForward(1);
      return l.length;
    },
    ids,
  );
  expect(list).toBe(7);
  await page.waitForTimeout(500);
  const pres = await sim(page, (s) =>
    s.match.towers().map((t) => {
      const p = s.towerLayer.presentationOf(t.id)!;
      const ok = [p.pedestal, p.stars, p.emblem, p.shadow].every((k) => s.textures.exists(k) && s.textures.get(k).getSourceImage().width > 4);
      return { tower: t.tower, ...p, ok };
    }),
  );
  expect(pres).toHaveLength(7);
  for (const p of pres) expect(p.ok, p.tower).toBe(true);
  expect(new Set(pres.map((p) => p.pedestal)).size).toBe(7);
  expect(new Set(pres.map((p) => p.stars)).size).toBe(7);
  expect(pres.map((p) => p.stars)).toEqual(expect.arrayContaining(['badge-stars-normal', 'badge-stars-god', 'badge-stars-hidden']));
  expect(new Set(pres.map((p) => p.emblem)).size).toBeGreaterThanOrEqual(5);
  // 혼자 선 2배 캐릭터는 받침대도 커진다 (발밑에 가려 등급이 안 보이던 것)
  expect(Math.max(...pres.map((p) => p.pedestalScale))).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});
