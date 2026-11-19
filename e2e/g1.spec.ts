/**
 * G-1 게임 시스템 E2E (휴대폰 412×915): 마당 맵(소환 칸 마당 둘레를 적이 돈다) · 위 HUD 'WAVE n'·몹 막대 · 아래 조작 묶음
 * [신화] [소환] [도박] / [강화] + 자원 줄(돈·인원 n/한도) + 맵 오른쪽 도전·미션 · 칸 무더기(한 칸 같은 캐릭터 3개)·연쇄 승급 ·
 * [도박] 시트 두 탭(돈 도박 · 소환 도박 4종·천장) · 3택 1 강화 선택 · 필살기 [⚡] · [신화] 도감·제작 · 412/360/320 넘침 없음.
 * sim은 window.__rtd로 읽고(개발자 명령으로 판을 차리기만), 버튼·맵은 화면에서 누른다. SAVE_SCREENS=1이면 docs/screens/G1-*.png.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { clickStart } from './title';

const SAVE_DOCS = process.env.SAVE_SCREENS === '1';
test.describe.configure({ timeout: 150_000 });

type T = { id: number; tx: number; ty: number; tower: string; ult?: number };
type SceneLike = {
  match: {
    tick: number;
    state: {
      gold: number;
      stage: number;
      merges: number;
      gachas: number;
      crafts: number;
      ults: number;
      pity: number[][];
      cardOffers: { stage?: number; cards: string[] }[];
      cardsPicked: string[];
      rallyBp: number[];
    };
    map: { buildable: [number, number][]; width: number; height: number };
    towers(): T[];
    rules: { towerOrder: string[]; towers: Map<string, { grade: string }>; recipes: { id: string; materials: string[] }[] };
    world: { enqueue(c: unknown): { ok: boolean }; entities: { get(id: number): T | undefined } };
  };
  mapLayout: { originX: number; originY: number; tile: number; cols: number; rows: number };
  sheetOpen: string | null;
  choiceKind: string | null;
  panelOpen: boolean;
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

async function start(page: Page, query = '?dev=1&seed=42'): Promise<void> {
  await page.goto(`/${query}`);
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
}

async function inScene<R, A>(page: Page, fn: (s: SceneLike, arg: A) => R, arg: A): Promise<R> {
  return page.evaluate(
    ([src, a]) => {
      const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game');
      return new Function('s', 'a', `return (${src})(s, a);`)(s, a) as R;
    },
    [fn.toString(), arg] as const,
  );
}

/** 개발용 명령으로 타워 놓기 [x, y, 타워 id] (같은 칸에 같은 타워면 쌓인다). */
async function place(page: Page, list: [number, number, string][]): Promise<void> {
  await inScene(
    page,
    (s, l) => {
      for (const [x, y, id] of l) s.match.world.enqueue({ type: 'debugTower', x, y, t: s.match.rules.towerOrder.indexOf(id) });
      s.debugFastForward(1);
      return null;
    },
    list,
  );
}

async function addGold(page: Page, amount: number): Promise<void> {
  await inScene(
    page,
    (s, a) => {
      s.match.world.enqueue({ type: 'debugAddGold', amount: a });
      s.debugFastForward(1);
      return null;
    },
    amount,
  );
}

async function tilePoint(page: Page, tx: number, ty: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([x, y]) => {
      const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game') as {
        mapLayout: { originX: number; originY: number; tile: number };
      };
      const L = s.mapLayout;
      const r = document.getElementById('stage')!.getBoundingClientRect();
      const k = r.width / 1080;
      return { x: r.left + (L.originX + (x + 0.5) * L.tile) * k, y: r.top + (L.originY + (y + 0.5) * L.tile) * k };
    },
    [tx, ty] as const,
  );
}

async function tapTile(page: Page, tx: number, ty: number): Promise<void> {
  const p = await tilePoint(page, tx, ty);
  await page.touchscreen.tap(p.x, p.y);
  await page.waitForTimeout(250);
}

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync('test-results/screens', { recursive: true });
  await page.screenshot({ path: `test-results/screens/${name}.png`, animations: 'disabled' });
  if (SAVE_DOCS) await page.screenshot({ path: `docs/screens/${name}.png`, animations: 'disabled' });
}

/** 하단 메뉴·아래 띠 버튼이 화면 안에 다 들어가고 겹치지 않는다. */
async function expectDockFits(page: Page): Promise<void> {
  const r = await page.evaluate(() => {
    const stage = document.getElementById('stage')!.getBoundingClientRect();
    const btns = [...document.querySelectorAll<HTMLElement>('.hud-menu > .btn, .hud-side-btns .hud-menu-btn, .hud-bottom > .btn:not([hidden]), .hud-bottom > .hud-item')];
    const rects = btns.filter((b) => b.offsetParent !== null).map((b) => ({ id: b.dataset.testid ?? b.className, r: b.getBoundingClientRect(), sw: b.scrollWidth, cw: b.clientWidth }));
    const out = rects.filter((x) => x.r.left < stage.left - 0.5 || x.r.right > stage.right + 0.5).map((x) => x.id);
    const clipped = rects.filter((x) => x.sw > x.cw + 1 && /menu/.test(x.id)).map((x) => x.id);
    return { out, clipped, docW: document.documentElement.scrollWidth, winW: window.innerWidth, menus: rects.filter((x) => /menu-/.test(x.id)).length };
  });
  expect(r.out).toEqual([]);
  expect(r.clipped).toEqual([]);
  expect(r.docW).toBeLessThanOrEqual(r.winW);
  expect(r.menus).toBeGreaterThanOrEqual(5);
}

test('마당 맵: 6×8 가운데 4×6 마당 24칸 + 둘레 고리, 칸이 예전(135)보다 1.3배 이상 · 위 HUD WAVE·몹 막대 · 아래 [신화][소환][도박]/[강화] · 오른쪽 도전·미션', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, '?seed=42');
  const L = await inScene(page, (s) => ({ ...s.mapLayout, pads: s.match.map.buildable.length, w: s.match.map.width, h: s.match.map.height }), null);
  expect([L.w, L.h, L.pads]).toEqual([6, 8, 24]);
  await expect(page.getByTestId('hud-stage')).toHaveText('준비');
  expect(L.tile).toBeGreaterThanOrEqual(Math.round(135 * 1.3));
  for (const id of ['menu-mythic', 'hud-summon', 'menu-gamble', 'menu-upgrade', 'menu-challenge', 'menu-mission']) await expect(page.getByTestId(id)).toBeVisible();
  await expect(page.getByTestId('menu-mythic')).toContainText('신화');
  await expect(page.getByTestId('hud-summon')).toContainText('100원');
  await expect(page.getByTestId('hud-summon-pity')).toHaveText('천장 30');
  await expect(page.getByTestId('hud-towers')).toHaveText('0/30'); // 인원 n / 한도 (game.json board.unitCap — 피드백 #59로 20 → 30)
  // 소환 버튼이 가운데, 신화 왼쪽·도박 오른쪽, 강화는 소환 바로 아래
  const box = async (id: string) => (await page.getByTestId(id).boundingBox())!;
  const [my, su, ga, up] = [await box('menu-mythic'), await box('hud-summon'), await box('menu-gamble'), await box('menu-upgrade')];
  expect(my.x + my.width).toBeLessThanOrEqual(su.x + 1);
  expect(su.x + su.width).toBeLessThanOrEqual(ga.x + 1);
  expect(up.y).toBeGreaterThanOrEqual(su.y + su.height - 1);
  expect(Math.abs(up.x + up.width / 2 - (su.x + su.width / 2))).toBeLessThan(3);
  // 도전·미션은 맵 오른쪽 둥근 버튼 (아래 묶음 위)
  const ch = await box('menu-challenge');
  const band = (await page.locator('.hud-bottom').boundingBox())!;
  expect(ch.y + ch.height).toBeLessThanOrEqual(band.y);
  expect(ch.x).toBeGreaterThan(412 * 0.7);
  // 위 HUD: WAVE n · 몹 막대 (준비 '준비'는 판 시작 때 확인)
  await inScene(page, (s) => s.debugFastForward(Math.max(0, 1300 - s.match.tick)), null);
  await expect(page.getByTestId('hud-stage')).toHaveText(/^WAVE \d+$/);
  await expect(page.getByTestId('hud-count')).toHaveText(/^\d+\/150$/);
  await expect.poll(() => page.getByTestId('hud-count-fill').evaluate((el) => parseFloat((el as HTMLElement).style.width))).toBeGreaterThan(0);
  await expectDockFits(page);
  // 맵 위·아래 끝이 HUD·아래 띠와 겹치지 않는다
  const edges = await page.evaluate(() => {
    const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game') as { mapLayout: { originY: number; tile: number; rows: number; minRow: number } };
    const r = document.getElementById('stage')!.getBoundingClientRect();
    const k = r.width / 1080;
    const L = s.mapLayout;
    return {
      top: r.top + (L.originY + L.minRow * L.tile) * k,
      bottom: r.top + (L.originY + (L.minRow + L.rows) * L.tile) * k,
      hud: document.querySelector('.hud')!.getBoundingClientRect().bottom,
      dock: document.querySelector('.hud-bottom')!.getBoundingClientRect().top,
    };
  });
  expect(edges.top).toBeGreaterThanOrEqual(edges.hud - 1);
  expect(edges.bottom).toBeLessThanOrEqual(edges.dock + 1);
  // 소환으로 칸 채우기 → 같은 캐릭터는 같은 칸에 쌓인다
  await addGold(page, 3000);
  const btn = page.getByTestId('hud-summon');
  for (let i = 0; i < 14; i++) {
    await btn.click();
    await page.waitForTimeout(120);
  }
  await expect.poll(() => inScene(page, (s) => s.match.towers().length, null)).toBeGreaterThanOrEqual(10);
  const stacks = await inScene(page, (s) => {
    const by = new Map<string, string[]>();
    for (const t of s.match.towers()) by.set(`${t.tx},${t.ty}`, [...(by.get(`${t.tx},${t.ty}`) ?? []), t.tower]);
    return [...by.values()];
  }, null);
  expect(stacks.every((l) => l.length <= 3 && new Set(l).size === 1)).toBe(true);
  expect(stacks.length).toBeLessThan(14);
  await page.waitForTimeout(400);
  await shot(page, 'G1-map');
  expect(errors).toEqual([]);
});

test('칸 무더기: 가득 찬 칸을 누르면 연쇄 승급 (알림 ×n) · 패널 이름 ×n · 끌어서 무더기 통째 이동', async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('rtd.settings', JSON.stringify({ v: 2, tapMerge: true }))); // 피드백 #17: 바로 승급은 이제 기본 꺼짐 — 이 테스트는 켠 플레이어
  await start(page);
  const pads = await inScene(page, (s) => s.match.map.buildable, null);
  const [a, b, c] = [pads[10]!, pads[11]!, pads[16]!];
  // 고블린 3개를 두 칸에 (두 칸 다 가득) → 첫 칸을 누르면 둘 다 승급 (연쇄 ×2 이상)
  await place(page, [
    [a[0], a[1], 'goblin'],
    [a[0], a[1], 'goblin'],
    [a[0], a[1], 'goblin'],
    [b[0], b[1], 'goblin'],
    [b[0], b[1], 'goblin'],
    [b[0], b[1], 'goblin'],
    [c[0], c[1], 'archer'],
    [c[0], c[1], 'archer'],
  ]);
  await expect(page.getByTestId('hud-merge-all')).toBeVisible();
  await shot(page, 'G1-stacks');
  // 덜 찬 칸(궁수 2) → 패널 '궁수 ×2'
  await tapTile(page, c[0], c[1]);
  await expect.poll(() => inScene(page, (s) => s.panelOpen, null)).toBe(true);
  await expect(page.getByTestId('tp-name')).toContainText('×2');
  await page.keyboard.press('Escape');
  await expect.poll(() => inScene(page, (s) => s.panelOpen, null)).toBe(false);
  const m0 = await inScene(page, (s) => s.match.state.merges, null);
  await tapTile(page, a[0], a[1]);
  await expect.poll(() => inScene(page, (s) => s.match.state.merges, null)).toBeGreaterThanOrEqual(m0 + 2);
  await expect(page.locator('.toast').filter({ hasText: '연쇄 승급' }).first()).toBeAttached();
  const goblins = await inScene(page, (s) => s.match.towers().filter((t) => t.tower === 'goblin').length, null);
  expect(goblins).toBe(0);
  // 무더기 통째 이동 (길게 눌러 끌기): 궁수 2개가 같이 간다
  const free = await inScene(
    page,
    (s, used) => s.match.map.buildable.find(([x, y]) => !s.match.towers().some((t) => t.tx === x && t.ty === y) && !used.some((u) => u[0] === x && u[1] === y)) ?? null,
    [a, b],
  );
  expect(free).not.toBeNull();
  const from = await tilePoint(page, c[0], c[1]);
  const to = await tilePoint(page, free![0], free![1]);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.waitForTimeout(450);
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8);
    await page.waitForTimeout(40);
  }
  await page.mouse.up();
  await expect
    .poll(() => inScene(page, (s, f) => s.match.towers().filter((t) => t.tower === 'archer' && t.tx === f[0] && t.ty === f[1]).length, free!))
    .toBe(2);
  expect(errors).toEqual([]);
});

test('[소환] 시트: 일반 소환 + 소환 도박 4종 확률·천장 · 종족 고르기 · 천장이면 확정 표시', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  await addGold(page, 20_000);
  // G-1: 소환 도박은 [🎰 도박] 시트의 '✨ 소환 도박' 탭
  await page.getByTestId('menu-gamble').click();
  await expect(page.getByTestId('sheet-gamble')).toBeVisible();
  await page.getByTestId('sheet-tab-summon').click();
  await expect(page.getByTestId('summon-pity-normal')).toHaveText('천장까지 30회 (레어)');
  await expect(page.getByTestId('gacha-odds-lucky')).toHaveText('노말 55% · 레어 35% · 유니크 10%');
  await expect(page.getByTestId('gacha-odds-challenge')).toContainText('꽝');
  await expect(page.getByTestId('gacha-odds-myth')).toContainText('레전드 8%');
  const gold0 = await inScene(page, (s) => s.match.state.gold, null);
  await page.getByTestId('gacha-buy-lucky').click();
  await expect.poll(() => inScene(page, (s) => s.match.state.gachas, null)).toBe(1);
  expect(await inScene(page, (s) => s.match.state.gold, null)).toBe(gold0 - 300);
  await expect(page.getByTestId('gacha-result')).toContainText('행운 소환');
  // 종족 소환: 왕국을 골라 두 번
  await page.locator('.sm-faction-summary').click(); // FB-29: 보조 소환 행의 종족 선택 펼치기
  await page.getByTestId('gacha-faction-kingdom').click();
  await expect(page.getByTestId('gacha-faction-kingdom')).toHaveClass(/is-on/);
  await page.getByTestId('gacha-buy-faction').click();
  await page.waitForTimeout(150);
  await page.getByTestId('gacha-buy-faction').click();
  await expect.poll(() => inScene(page, (s) => s.match.state.gachas, null)).toBe(3);
  const kingdom = await inScene(page, (s) => s.match.state.pity[0]![2]!, null);
  expect(kingdom).toBeGreaterThanOrEqual(0);
  await page.getByTestId('summon-buy-normal').click();
  await expect.poll(() => inScene(page, (s) => s.match.state.pity[0]![0]!, null)).toBeGreaterThanOrEqual(0);
  await page.waitForTimeout(300);
  await shot(page, 'G1-summon-gamble');
  // 천장: 신화 도박 카운터를 천장 직전으로 → '다음 1회 레전드 확정!', 한 번 돌리면 레전드 이상
  await inScene(page, (s) => {
    s.match.state.pity[0]![4] = 25;
    return null;
  }, null);
  await expect(page.getByTestId('gacha-pity-myth')).toHaveText('다음 1회 레전드 확정!');
  await expect(page.getByTestId('gacha-odds-myth')).not.toContainText('노말');
  await shot(page, 'G1-pity');
  await page.getByTestId('gacha-buy-myth').click();
  await expect.poll(() => inScene(page, (s) => s.match.state.pity[0]![4]!, null)).toBe(0);
  const best = await inScene(page, (s) => s.match.towers().map((t) => s.match.rules.towers.get(t.tower)?.grade ?? ''), null);
  expect(best.some((g) => g === 'legend' || g === 'god')).toBe(true);
  await expect(page.getByTestId('gacha-pity-myth')).toHaveText('천장까지 25회 (레전드)');
  expect(errors).toEqual([]);
});

test('[도박] 시트: 💰 돈 도박(테이블·잭팟 그대로) · ✨ 소환 도박 두 탭 · [강화] 시트에는 등급·능력치 탭만', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  await page.getByTestId('menu-gamble').click();
  await expect(page.getByTestId('sheet-gamble')).toBeVisible();
  await expect(page.getByTestId('sheet-tab-money')).toHaveClass(/is-on/);
  await expect(page.getByTestId('sheet-tab-summon')).toBeVisible();
  await expect(page.getByTestId('gamble-odds')).toContainText('기대값');
  await page.getByTestId('gamble-table-10').click();
  await expect.poll(() => inScene(page, (s) => (s.match.state as unknown as { gambles: number }).gambles, null)).toBe(1);
  await page.getByTestId('menu-upgrade').click();
  await expect(page.getByTestId('sheet-upgrade')).toBeVisible();
  await expect(page.getByTestId('sheet-tab-grade')).toBeVisible();
  await expect(page.getByTestId('sheet-tab-gamble')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('3택 1 강화 선택: 5단계 시작에 강화 카드 3장 → 고르면 효과', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  await inScene(page, (s) => {
    for (let i = 0; i < 5; i++) s.match.world.enqueue({ type: 'debugSkipStage', tick: s.match.tick + i });
    s.debugFastForward(8);
    return null;
  }, null);
  await expect.poll(() => inScene(page, (s) => s.match.state.stage, null)).toBe(5);
  await expect.poll(() => inScene(page, (s) => s.choiceKind, null)).toBe('card');
  await expect(page.getByTestId('choice-card').locator('.cp-title')).toContainText('강화 카드');
  await page.waitForTimeout(400);
  await shot(page, 'G1-pick');
  const offer = await inScene(page, (s) => s.match.state.cardOffers[0]!, null);
  expect(offer.stage).toBe(5);
  await page.getByTestId('choice-0').click();
  await expect.poll(() => inScene(page, (s) => s.match.state.cardsPicked.length, null)).toBe(1);
  expect(offer.cards).toContain(await inScene(page, (s) => s.match.state.cardsPicked[0]!, null));
  expect(errors).toEqual([]);
});

test('필살기: 찬 캐릭터가 있으면 HUD [⚡ n] → 목록에서 발동 · 설정 [필살기 자동]', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  const pads = await inScene(page, (s) => s.match.map.buildable, null);
  await place(page, [
    [pads[8]![0], pads[8]![1], 'swordsaint'],
    [pads[9]![0], pads[9]![1], 'scholar'],
  ]);
  await expect(page.getByTestId('hud-ult')).toBeHidden();
  await inScene(page, (s) => {
    for (const t of s.match.towers()) {
      const e = s.match.world.entities.get(t.id)!;
      e.ult = 10000;
    }
    return null;
  }, null);
  await expect(page.getByTestId('hud-ult')).toBeVisible();
  await expect(page.getByTestId('hud-ult')).toHaveText('⚡ 2');
  await page.getByTestId('hud-ult').click();
  await expect(page.getByTestId('hud-ult-list')).toBeVisible();
  await page.waitForTimeout(250);
  await shot(page, 'G1-ult');
  const first = await inScene(page, (s) => s.match.towers()[0]!.id, null);
  await page.getByTestId(`hud-ult-${first}`).click();
  await expect.poll(() => inScene(page, (s) => s.match.state.ults, null)).toBe(1);
  await expect(page.getByTestId('hud-ult')).toHaveText('⚡ 1');
  await page.getByTestId('hud-ult-all').click();
  await expect.poll(() => inScene(page, (s) => s.match.state.ults, null)).toBe(2);
  await expect(page.getByTestId('hud-ult')).toBeHidden();
  // 설정: 필살기 자동 → 차면 바로
  await page.locator('[data-action="pause"]').click();
  await page.getByTestId('pause-ult-auto').click();
  await page.locator('[data-action="resume"]').click();
  await inScene(page, (s) => {
    s.match.world.entities.get(s.match.towers()[0]!.id)!.ult = 10000;
    return null;
  }, null);
  await expect.poll(() => inScene(page, (s) => s.match.state.ults, null)).toBe(3);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rtd.settings') ?? '{}').ultAuto)).toBe(true);
  expect(errors).toEqual([]);
});

test('[신화] 도감: 발견 전 실루엣·??? + 힌트 하나 · 발견한 조합은 재료가 모이면 [제작] · 기록은 계정에 남는다', async ({ page, baseURL }) => {
  const errors = collectErrors(page);
  // 예전 계정 저장(도감 없음)에 황금 왕 발견 기록을 더한 상태로 시작
  await page.addInitScript(() => {
    if (sessionStorage.getItem('g1-seeded')) return;
    sessionStorage.setItem('g1-seeded', '1');
    localStorage.setItem('rtd.account', JSON.stringify({ v: 1, level: 1, hidden: [], guides: ['firstMerge'], codex: { goldking: { found: true } } }));
  });
  void baseURL;
  await start(page);
  await page.getByTestId('menu-mythic').click();
  await expect(page.getByTestId('sheet-mythic')).toBeVisible();
  await expect(page.getByTestId('mythic-summary')).toHaveText('발견 1/12');
  await expect(page.getByTestId('mythic-row-festival')).toContainText('???');
  await expect(page.getByTestId('mythic-row-festival').locator('.my-pic')).toHaveClass(/is-silhouette/);
  await expect(page.getByTestId('mythic-row-goldking')).toContainText('황금 왕');
  await expect(page.getByTestId('mythic-craft-goldking')).toBeDisabled();
  await page.getByTestId('sheet-close').click();
  const pads = await inScene(page, (s) => s.match.map.buildable, null);
  await place(page, [
    [pads[4]![0], pads[4]![1], 'miner'],
    [pads[5]![0], pads[5]![1], 'merchant'],
    [pads[6]![0], pads[6]![1], 'alchemist'],
  ]);
  await expect(page.getByTestId('menu-badge-mythic')).toHaveText('1 제작');
  await page.getByTestId('menu-mythic').click();
  await expect(page.getByTestId('mythic-craft-goldking')).toBeEnabled();
  await page.waitForTimeout(300);
  await shot(page, 'G1-codex');
  await page.getByTestId('mythic-craft-goldking').click();
  await expect.poll(() => inScene(page, (s) => s.match.towers().map((t) => t.tower), null)).toEqual(['goldking']);
  expect(await inScene(page, (s) => s.match.state.crafts, null)).toBe(1);
  // 계정 기록은 그대로 (예전 필드도 그대로)
  const acc = await page.evaluate(() => JSON.parse(localStorage.getItem('rtd.account') ?? '{}'));
  expect(acc).toMatchObject({ guides: ['firstMerge'], codex: { goldking: { found: true } } });
  expect(errors).toEqual([]);
});

for (const [w, h] of [
  [360, 800],
  [320, 640],
] as const) {
  test(`좁은 화면 ${w}×${h}: 하단 메뉴 7칸(개발자)·아래 띠가 넘치지 않고 맵이 HUD와 아래 띠 사이`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: w, height: h });
    await start(page);
    await addGold(page, 1000);
    await page.getByTestId('hud-summon').click();
    await expectDockFits(page);
    if (w === 360) await shot(page, 'G1-360');
    expect(errors).toEqual([]);
  });
}
