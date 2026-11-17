/**
 * M5 E2E: 하단 메뉴·바텀 시트(55% / 끌어서 85%, 게임 계속 진행, 맵 터치로 닫기), 도전(시작·진행 막대·실패 쿨타임·처치 해금),
 * 강화(눌러서·길게 눌러 연속·공속 배율·초월), 도박(테이블 잠금·debug·계정 Lv7·슬롯 1초·잭팟 게이지), 미션(달성 배너·배지·받기·
 * 모두 받기·히든 ???·영구 기록), 승급 가능 강조, 바텀 시트 하나만, M5 스크린샷.
 * 단계·타워·돈은 개발용 명령(?debug=1)으로. sim은 window.__rtd로 읽기만 하고 버튼은 화면에서 누른다.
 */
import { expect, test, type Page } from '@playwright/test';
import { clickStart } from './title';
import { mkdirSync } from 'node:fs';

// T-2: 이 파일은 정보 패널 [⬆ 승급] 흐름을 본다 → '눌러서 바로 승급'(기본 켜짐)을 끄고 시작 (켜진 동작은 e2e/t2.spec.ts)
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('rtd.settings')) localStorage.setItem('rtd.settings', JSON.stringify({ v: 1, tapMerge: false }));
  });
});


const SAVE_DOCS = process.env.SAVE_SCREENS === '1';

interface MobLite {
  id: number;
  mob: string;
  hp: number;
  maxHp: number;
  boss: boolean;
  challenge: number;
}

type SceneLike = {
  match: {
    tick: number;
    state: {
      stage: number;
      gold: number;
      phase: string;
      upgrades: number[][];
      upgradesBought: number;
      gambles: number;
      gamble: { gauge: number; recent: number[] }[];
      challengeLevel: number;
      challengeOpen: number;
      challengeReady: number[];
      challengeBest: number;
      missionStatus: number[];
      summons: number;
      mods: { apsPctBp: number }[];
    };
    mobs(): MobLite[];
    towers(): { id: number; tx: number; ty: number; tower: string }[];
    rules: { towerOrder: string[]; missions: { id: string }[] };
    world: { enqueue(c: unknown): { ok: boolean }; entities: { remove(id: number): void } };
  };
  renderedMobCount: number;
  sheetOpen: string | null;
  sheetSize: string | null;
  panelOpen: boolean;
  choiceKind: string | null;
  choiceCollapsed: boolean | null;
  selectedTowerId: number | null;
  mergeHighlightCount: number;
  layout: { tile: number; originX: number; originY: number };
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

async function start(page: Page, query = '?debug=1&seed=42'): Promise<void> {
  await page.goto(`/${query}`);
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
}

async function inScene<T, A>(page: Page, fn: (s: SceneLike, arg: A) => T, arg: A): Promise<T> {
  return page.evaluate(
    ([src, a]) => {
      const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game');
      return new Function('s', 'a', `return (${src})(s, a);`)(s, a) as T;
    },
    [fn.toString(), arg] as const,
  );
}

async function ff(page: Page, ticks: number): Promise<void> {
  await inScene(page, (s, n) => s.debugFastForward(n), ticks);
}

async function addGold(page: Page, amount: number): Promise<void> {
  await inScene(
    page,
    (s, a) => {
      s.match.world.enqueue({ type: 'debugAddGold', amount: a });
      s.debugFastForward(1);
    },
    amount,
  );
}

/** 개발용 명령으로 타워 놓기 [x, y, 타워 id]. */
async function place(page: Page, list: [number, number, string][]): Promise<void> {
  const before = await inScene(page, (s) => s.match.towers().length, null);
  const ok = await inScene(
    page,
    (s, l) => l.every(([x, y, id]) => s.match.world.enqueue({ type: 'debugTower', x, y, t: s.match.rules.towerOrder.indexOf(id) }).ok),
    list,
  );
  expect(ok).toBe(true);
  await ff(page, 1);
  await expect.poll(() => inScene(page, (s) => s.match.towers().length, null)).toBeGreaterThanOrEqual(before + list.length);
}

async function skipTo(page: Page, stage: number): Promise<number> {
  return inScene(
    page,
    (s, target) => {
      while (s.match.state.stage < target) {
        s.match.world.enqueue({ type: 'debugSkipStage' });
        s.debugFastForward(1);
      }
      return s.match.state.stage;
    },
    stage,
  );
}

async function tileCenter(page: Page, tx: number, ty: number): Promise<{ x: number; y: number }> {
  const L = await inScene(page, (s) => s.layout, null);
  const box = (await page.locator('canvas').boundingBox())!;
  const k = box.width / 1080;
  return { x: box.x + (L.originX + (tx + 0.5) * L.tile) * k, y: box.y + (L.originY + (ty + 0.5) * L.tile) * k };
}

async function tapTile(page: Page, tx: number, ty: number): Promise<void> {
  const p = await tileCenter(page, tx, ty);
  await page.touchscreen.tap(p.x, p.y);
}

async function shot(page: Page, name: string, docsName?: string): Promise<void> {
  mkdirSync('test-results/screens', { recursive: true });
  await page.screenshot({ path: `test-results/screens/${name}.png`, animations: 'disabled' });
  if (SAVE_DOCS && docsName) {
    mkdirSync('docs/screens', { recursive: true });
    await page.screenshot({ path: `docs/screens/${docsName}.png`, animations: 'disabled' });
  }
}

/** 무대 높이·위쪽 끝 (CSS px). */
async function stageBox(page: Page): Promise<{ top: number; height: number }> {
  const b = (await page.locator('#stage').boundingBox())!;
  return { top: b.y, height: b.height };
}

test('바텀 시트: 하단 메뉴 → 55%, 손잡이를 끌어 85%, 게임은 계속 진행, 같은 메뉴·✕·맵 터치로 닫힘, 다른 메뉴로 바뀜', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  await expect(page.getByTestId('menu-challenge')).toBeVisible();
  await expect(page.getByTestId('menu-badge-challenge')).toHaveText('1 가능');
  await expect(page.getByTestId('menu-badge-upgrade')).toHaveText('Lv 0');
  await page.getByTestId('menu-challenge').click();
  const sheet = page.getByTestId('sheet-challenge');
  await expect(sheet).toBeVisible();
  await expect(page.getByTestId('menu-challenge')).toHaveClass(/is-on/);
  const st = await stageBox(page);
  await page.waitForTimeout(300);
  let box = (await sheet.boundingBox())!;
  expect(Math.abs(box.y - (st.top + st.height * 0.45))).toBeLessThan(3); // 화면 높이 55%까지
  // 시트 아래 끝 = 하단 메뉴 위 (메뉴는 보인다)
  const menu = (await page.locator('.hud-menu').boundingBox())!;
  expect(Math.abs(box.y + box.height - menu.y)).toBeLessThan(2);
  // 게임은 계속 진행 (틱이 흐름)
  const t0 = await inScene(page, (s) => s.match.tick, null);
  await expect.poll(() => inScene(page, (s) => s.match.tick, null)).toBeGreaterThan(t0 + 5);
  // 손잡이를 위로 끌면 85%
  const grip = (await page.getByTestId('sheet-grip').boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, grip.y - st.height * 0.2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => inScene(page, (s) => s.sheetSize, null)).toBe('full');
  await page.waitForTimeout(300);
  box = (await sheet.boundingBox())!;
  expect(Math.abs(box.y - (st.top + st.height * 0.15))).toBeLessThan(3);
  // 85%로 펼친 동안 알림은 시트 아래쪽 (머리줄·탭·✕를 덮지 않게 — M5 검토 반영)
  await inScene(page, (s) => (s as unknown as { ctx: { ui: { toast(t: string): void } } }).ctx.ui.toast('알림 자리 확인'), null);
  const fullToast = (await page.locator('.toast', { hasText: '알림 자리 확인' }).boundingBox())!;
  const head = (await sheet.locator('.bs-head').boundingBox())!;
  expect(fullToast.y).toBeGreaterThan(head.y + head.height + 20);
  expect(fullToast.y + fullToast.height).toBeLessThanOrEqual(menu.y + 1);
  // 아래로 끌면 85% → 55% → 닫기
  const grip2 = (await page.getByTestId('sheet-grip').boundingBox())!;
  await page.mouse.move(grip2.x + grip2.width / 2, grip2.y + grip2.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip2.x + grip2.width / 2, grip2.y + st.height * 0.2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => inScene(page, (s) => s.sheetSize, null)).toBe('half');
  // 다른 메뉴 → 그 시트로 바뀜, 같은 메뉴 → 닫힘
  await page.getByTestId('menu-upgrade').click();
  await expect(page.getByTestId('sheet-upgrade')).toBeVisible();
  await expect(page.getByTestId('sheet-challenge')).toHaveCount(0);
  await page.getByTestId('menu-upgrade').click();
  await expect(page.getByTestId('sheet-upgrade')).toHaveCount(0);
  expect(await inScene(page, (s) => s.sheetOpen, null)).toBeNull();
  // ✕로 닫기
  await page.getByTestId('menu-mission').click();
  await page.getByTestId('sheet-close').click();
  await expect(page.getByTestId('sheet-mission')).toHaveCount(0);
  // Escape(뒤로 가기 자리)로도 닫힌다 (M5 검토 반영)
  await page.getByTestId('menu-mission').click();
  await expect(page.getByTestId('sheet-mission')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('sheet-mission')).toHaveCount(0);
  expect(await inScene(page, (s) => s.sheetOpen, null)).toBeNull();
  // 55%로 다시 열면 알림은 다시 HUD 아래
  await page.getByTestId('menu-mission').click();
  await inScene(page, (s) => (s as unknown as { ctx: { ui: { toast(t: string): void } } }).ctx.ui.toast('반쪽 알림'), null);
  const halfToast = (await page.locator('.toast', { hasText: '반쪽 알림' }).boundingBox())!;
  const halfSheet = (await page.getByTestId('sheet-mission').boundingBox())!;
  expect(halfToast.y + halfToast.height).toBeLessThan(halfSheet.y);
  await page.getByTestId('sheet-close').click();
  // 맵 터치로 닫기: 시트 위쪽 맵 칸을 눌러도 소환되지 않고 시트만 닫힌다
  await page.getByTestId('menu-challenge').click();
  await expect(sheet).toBeVisible();
  await tapTile(page, 3, 1);
  await expect(sheet).toHaveCount(0);
  expect(await inScene(page, (s) => s.match.towers().length, null)).toBe(0);
  await expect(page.getByTestId('menu-challenge')).not.toHaveClass(/is-on/);
  expect(errors).toEqual([]);
});

test('도전: 1단계 [시작] → 시트는 열린 채 (피드백 #10) 도전 보스 막대·진행 중 배지, 30초가 지나면 실패(패배 없음) + 5분 쿨타임', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  await page.getByTestId('menu-challenge').click();
  await expect(page.getByTestId('challenge-start-1')).toHaveText('시작');
  await expect(page.getByTestId('challenge-start-2')).toHaveText('🔒');
  await expect(page.getByTestId('challenge-start-2')).toBeDisabled();
  await page.getByTestId('challenge-start-1').click();
  // 피드백 #10: 시작해도 도전 시트는 닫히지 않고, 그 줄이 '진행 중'으로 바뀐다
  await expect(page.getByTestId('sheet-challenge')).toBeVisible();
  await expect(page.getByTestId('challenge-start-1')).toHaveText('진행 중');
  await expect.poll(() => inScene(page, (s) => s.match.state.challengeLevel, null)).toBe(1);
  // 배너는 실제 시간 3.2초 — 느린 헤드리스 화면(T-3: 캔버스가 화면 높이만큼 커짐)에서도 놓치지 않게 시작하자마자 본다
  await expect(page.locator('[data-testid="banner-challenge"]', { hasText: '도전 1단계' })).toBeVisible();
  await expect(page.getByTestId('hud-challenge')).toBeVisible();
  await expect(page.getByTestId('hud-challenge-name')).toHaveText('⚔ 도전 1단계 「황금 슬라임」');
  // 30초부터 줄어든다 (느린 헤드리스 화면에서는 여기까지 몇 초 걸릴 수 있다 — 20초대까지 허용)
  await expect(page.getByTestId('hud-challenge-time')).toHaveText(/^(30|2\d)초$/);
  await expect(page.getByTestId('menu-badge-challenge')).toHaveText('진행 중');
  // 도전 보스 그림 (몹 수 한도에 넣지 않음 — HUD 👾는 0)
  await expect.poll(() => inScene(page, (s) => s.renderedMobCount, null)).toBe(1);
  await expect(page.getByTestId('hud-count')).toHaveText('0/150');
  // 시트 맨 위 '진행 중' 줄 (시트는 시작한 뒤로 계속 열려 있다)
  await expect(page.getByTestId('challenge-active')).toHaveText(/진행 중 · 1단계 황금 슬라임 · \d+초/);
  await expect(page.getByTestId('challenge-start-1')).toHaveText('진행 중');
  await page.getByTestId('sheet-close').click();
  // 30초 → 실패: 패배 아님, 보스 사라짐, 그 단계 쿨타임 (마지막 몇 틱은 화면 프레임 안에서 돌게 — 빨리 감기로 지나간 사건은 알리지 않는다)
  await inScene(page, (s) => s.debugFastForward((s.match.state as unknown as { challengeUntil: number }).challengeUntil - s.match.tick - 6), null);
  await expect.poll(() => inScene(page, (s) => s.match.state.challengeLevel, null)).toBe(0);
  expect(await inScene(page, (s) => s.match.state.phase, null)).toBe('playing');
  await expect(page.getByTestId('hud-challenge')).toBeHidden();
  await expect(page.locator('[data-testid="banner-challenge"]', { hasText: '실패' })).toBeVisible();
  await page.getByTestId('menu-challenge').click();
  await expect(page.getByTestId('challenge-start-1')).toHaveText(/^⏳[45]:\d\d$/);
  await expect(page.getByTestId('menu-badge-challenge')).toHaveText('');
  // 5분 뒤 다시 → '도전 1단계 준비 완료'
  await page.getByTestId('sheet-close').click();
  await inScene(page, (s) => s.debugFastForward(s.match.state.challengeReady[0]! - s.match.tick - 6), null);
  await expect(page.locator('.toast', { hasText: '도전 1단계 준비 완료' })).toBeVisible();
  await expect(page.getByTestId('menu-badge-challenge')).toHaveText('1 가능');
  expect(errors).toEqual([]);
});

test('도전 처치: 보상 +20원·2단계 열림·✅, 10단계 보스와 겹치면 체력바 2줄 (막대 자리 높이는 그대로)', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  const slotH = (await page.getByTestId('hud-banner-slot').boundingBox())!.height;
  await page.getByTestId('menu-challenge').click();
  await page.getByTestId('challenge-start-1').click();
  await expect.poll(() => inScene(page, (s) => s.match.state.challengeLevel, null)).toBe(1);
  await expect(page.getByTestId('sheet-challenge')).toBeVisible(); // 피드백 #10: 시트는 열린 채
  // 경로 시작점 옆에 궁수 여럿 + 보스 체력을 조금만 남긴다
  await place(page, [
    [1, 1, 'archer'],
    [2, 1, 'archer'],
    [3, 1, 'archer'],
  ]);
  await inScene(
    page,
    (s) => {
      for (const m of s.match.mobs()) if (m.challenge === 1) m.hp = 5;
      return null;
    },
    null,
  );
  const gold0 = await inScene(page, (s) => s.match.state.gold, null);
  await expect.poll(() => inScene(page, (s) => s.match.state.challengeBest, null), { timeout: 15000 }).toBe(1);
  expect(await inScene(page, (s) => s.match.state.gold, null)).toBeGreaterThanOrEqual(gold0 + 20);
  await expect(page.locator('[data-testid="banner-gold"]', { hasText: '도전 1단계 클리어! +20원 · 2단계 열림' })).toBeVisible();
  await expect(page.getByTestId('challenge-start-2')).toHaveText('시작');
  await expect(page.getByTestId('challenge-row-1').locator('.ch-done')).toBeVisible();
  // 10단계 보스 + 도전 2단계 → 막대 두 줄 (같은 자리, 높이 그대로)
  await page.getByTestId('challenge-start-2').click();
  await skipTo(page, 10);
  await expect(page.getByTestId('hud-boss')).toBeVisible();
  await expect(page.getByTestId('hud-challenge')).toBeVisible();
  await expect(page.getByTestId('hud-banner-slot')).toHaveClass(/is-split/);
  expect((await page.getByTestId('hud-banner-slot').boundingBox())!.height).toBeCloseTo(slotH, 0);
  const boss = (await page.getByTestId('hud-boss').boundingBox())!;
  const chal = (await page.getByTestId('hud-challenge').boundingBox())!;
  expect(chal.y).toBeGreaterThanOrEqual(boss.y + boss.height - 0.5);
  // 판 보스 막대에는 판 보스 체력만 (도전 보스 체력이 섞이면 거의 꽉 찬 채로 줄지 않았다 — M5 검토 반영)
  await inScene(
    page,
    (s) => {
      for (const m of s.match.mobs()) if (m.boss && !m.challenge) m.hp = Math.floor(m.maxHp / 4);
      return null;
    },
    null,
  );
  await expect
    .poll(async () => {
      const fill = (await page.getByTestId('hud-boss-hp').boundingBox())!;
      return Math.round((fill.width / boss.width) * 100);
    })
    .toBeLessThanOrEqual(27);
  expect(errors).toEqual([]);
});

test('강화: [비용]을 누르면 Lv·효과·공속 배율 ⚡ 갱신, 길게 누르면 돈이 허락하는 만큼 연속, 모자라면 알림 / 초월은 등급 강화 모두 50 이후', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  await addGold(page, 9000); // 1,000 + 9,000 = 10,000원
  await page.getByTestId('menu-upgrade').click();
  await expect(page.getByTestId('upgrade-aps')).toHaveText('⚡×1');
  await page.getByTestId('sheet-tab-stat').click();
  const apsRow = page.getByTestId('upgrade-row-aps');
  await expect(apsRow.locator('.up-effect')).toHaveText('+0% → +4%');
  const gold0 = await inScene(page, (s) => s.match.state.gold, null);
  await page.getByTestId('upgrade-buy-aps').click();
  await expect(apsRow.locator('.up-lv')).toHaveText('Lv 1/50');
  await expect(apsRow.locator('.up-effect')).toHaveText('+4% → +8%');
  await expect(page.getByTestId('upgrade-aps')).toHaveText('⚡×1.04');
  await expect(page.getByTestId('upgrade-buy-aps')).toHaveText('160원');
  expect(await inScene(page, (s) => s.match.state.gold, null)).toBe(gold0 - 100);
  // 길게 누르기: 일반 강화를 돈이 허락하는 만큼 (돈을 50 + 100 + 150 + 200 = 500원으로 맞춤 → 4레벨)
  await page.getByTestId('sheet-tab-grade').click();
  await inScene(
    page,
    (s) => {
      s.match.state.gold = 500;
      return null;
    },
    null,
  );
  const btn = page.getByTestId('upgrade-buy-normal');
  const b = (await btn.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await expect.poll(() => inScene(page, (s) => s.match.state.upgrades[0]![0], null), { timeout: 6000 }).toBe(4);
  // 돈이 떨어지면 연속이 멈추고 모자란 만큼 알림 (누르고 있어도 더 올라가지 않는다)
  await expect(page.locator('.toast', { hasText: '250원이 더 필요해요' })).toBeVisible();
  await page.waitForTimeout(400);
  await page.mouse.up();
  expect(await inScene(page, (s) => s.match.state.upgrades[0]![0], null)).toBe(4);
  expect(await inScene(page, (s) => s.match.state.gold, null)).toBe(0);
  await expect(page.getByTestId('upgrade-row-normal').locator('.up-effect')).toHaveText('+40% → +50%');
  await expect(page.getByTestId('menu-badge-upgrade')).toHaveText('Lv 5');
  // 초월: 등급 강화 3종 모두 50 → 능력치 탭 맨 아래에 나타남
  await page.getByTestId('sheet-tab-stat').click();
  await expect(page.getByTestId('upgrade-row-transcend')).toHaveCount(0);
  await inScene(
    page,
    (s) => {
      const u = s.match.state.upgrades[0]!;
      u[0] = 50;
      u[1] = 50;
      u[2] = 50;
      return null;
    },
    null,
  );
  await expect(page.getByTestId('upgrade-row-transcend')).toBeVisible();
  await expect(page.getByTestId('upgrade-buy-transcend')).toHaveText('5만원');
  expect(errors).toEqual([]);
});

test('도박: debug 판은 잠긴 테이블도 "디버그", 10원 도박 → 슬롯 1초 → 결과·최근 결과, 잭팟 게이지 10칸이면 "다음 ×3 이상!"', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  // G-1: 돈 도박은 하단 메뉴 [🎰 도박] 시트로 옮겼다 (예전: 강화 시트의 도박 탭)
  await page.getByTestId('menu-gamble').click();
  await expect(page.getByTestId('gamble-table-1000')).toContainText('디버그');
  // 기대값은 잭팟 게이지까지 넣은 실제 값 (M5 검토 반영), '기대값 91%'는 한 줄로 붙어 있다
  await expect(page.getByTestId('gamble-odds')).toHaveText('×0 40% · ×0.5 20% · ×1 21% · ×2 11% · ×3 6% · ×5 2% — 기대값 91% (잭팟 포함)');
  expect(await page.getByTestId('gamble-ev').evaluate((el) => el.getClientRects().length)).toBe(1);
  await page.getByTestId('gamble-table-10').click();
  await expect(page.getByTestId('gamble-reel-10')).toHaveClass(/is-spin/);
  await expect.poll(() => inScene(page, (s) => s.match.state.gambles, null)).toBe(1);
  await expect(page.getByTestId('gamble-reel-10')).not.toHaveClass(/is-spin/, { timeout: 4000 });
  const mul = await inScene(page, (s) => s.match.state.gamble[0]!.recent[0]!, null);
  const mulText = mul === 0 ? '×0' : mul === 5000 ? '×0.5' : `×${mul / 10000}`;
  await expect(page.getByTestId('gamble-reel-10')).toHaveText(mulText);
  await expect(page.getByTestId('gamble-result-10')).toContainText(mulText);
  await expect(page.getByTestId('gamble-recent')).toHaveText(`최근: ${mulText}`);
  // 잭팟 게이지
  await inScene(
    page,
    (s) => {
      s.match.state.gamble[0]!.gauge = 10;
      return null;
    },
    null,
  );
  await expect(page.getByTestId('gamble-gauge')).toHaveText('다음 ×3 이상!');
  await expect(page.getByTestId('gamble-odds')).toHaveText('×3 75% · ×5 25% — 이번 기대값 350%');
  expect(errors).toEqual([]);
});

test('도박 해금: 계정 Lv1이면 1000원·10000원 🔒 + 누르면 "계정 Lv7에 열려요", 저장된 계정 Lv7이면 1000원 열림', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, '?seed=42');
  // G-1: 돈 도박은 하단 메뉴 [🎰 도박] 시트로 옮겼다 (예전: 강화 시트의 도박 탭)
  await page.getByTestId('menu-gamble').click();
  await expect(page.getByTestId('gamble-table-1000')).toContainText('🔒 계정 Lv7');
  await expect(page.getByTestId('gamble-table-10000')).toContainText('🔒 계정 Lv20');
  await page.getByTestId('gamble-table-1000').click();
  await expect(page.locator('.toast', { hasText: '계정 Lv7에 열려요' })).toBeVisible();
  expect(await inScene(page, (s) => s.match.state.gambles, null)).toBe(0);
  // 계정 레벨 7 (메타 저장소) → 다음 판부터 1000원 열림
  // G-3: 계정 레벨은 판 밖 성장 저장(rtd.progress)이 정답 — rtd.account 레벨은 처음 한 번만 옮겨 온다
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('rtd.progress')!) as { level: number };
    p.level = 7;
    localStorage.setItem('rtd.progress', JSON.stringify(p));
  });
  await start(page, '?seed=42');
  // G-1: 돈 도박은 하단 메뉴 [🎰 도박] 시트로 옮겼다 (예전: 강화 시트의 도박 탭)
  await page.getByTestId('menu-gamble').click();
  await expect(page.getByTestId('gamble-table-1000')).not.toContainText('🔒');
  await expect(page.getByTestId('gamble-table-10000')).toContainText('🔒 계정 Lv20');
  await page.getByTestId('gamble-table-1000').click();
  await expect.poll(() => inScene(page, (s) => s.match.state.gambles, null)).toBe(1);
  await page.evaluate(() => localStorage.removeItem('rtd.progress'));
  expect(errors).toEqual([]);
});

test('미션: 달성하면 한 줄 배너·배지 "n 받기" → [받기]로 보상(받은 줄은 아래로) / [모두 받기] / 히든은 ??? → 달성하면 공개·영구 기록', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?debug=1&seed=42');
  await page.evaluate(() => localStorage.removeItem('rtd.account'));
  await start(page);
  // 보유금 3,000원·10,000원 달성 (명령만 넣고 화면 프레임 안에서 실행되게 — 빨리 감기로 지나간 달성은 알리지 않는다)
  await inScene(page, (s) => s.match.world.enqueue({ type: 'debugAddGold', amount: 9000 }).ok, null);
  await expect(page.locator('[data-testid="banner-mission"]', { hasText: '📋 미션 2개 달성!' })).toBeVisible();
  await expect(page.getByTestId('menu-badge-mission')).toHaveText('2 받기');
  await page.getByTestId('menu-mission').click();
  const rows = page.locator('[data-pane="normal"] .ms-row');
  await expect(rows.nth(0)).toHaveAttribute('data-id', 'n22');
  await expect(rows.nth(1)).toHaveAttribute('data-id', 'n23');
  await expect(page.getByTestId('mission-claim-all')).toHaveText('모두 받기 2 · +1,300원');
  const g0 = await inScene(page, (s) => s.match.state.gold, null);
  await page.getByTestId('mission-claim-n22').click();
  await expect.poll(() => inScene(page, (s) => s.match.state.gold, null)).toBe(g0 + 300);
  await expect(page.getByTestId('mission-claim-n22')).toHaveText('✅ 받음');
  await expect(rows.last()).toHaveAttribute('data-id', 'n22'); // 받은 미션은 아래로
  await expect(page.getByTestId('menu-badge-mission')).toHaveText('1 받기');
  await page.getByTestId('mission-claim-all').click();
  await expect.poll(() => inScene(page, (s) => s.match.state.gold, null)).toBe(g0 + 1300);
  await expect(page.getByTestId('mission-claim-all')).toBeDisabled();
  await expect(page.getByTestId('menu-badge-mission')).toHaveText('');
  await expect(page.getByTestId('mission-summary')).toHaveText('달성 2/30');
  // 히든 탭: 발견 전 ???
  await page.getByTestId('sheet-tab-hidden').click();
  await expect(page.getByTestId('mission-row-h08').locator('.ms-name-text')).toHaveText('???');
  await expect(page.getByTestId('mission-summary')).toHaveText('발견 0/11');
  // 소환 0회로 5단계 → 히든 '소환 거부' 달성 (금색 배너) → 공개. debug 판이라 영구 기록은 하지 않는다 (M5 검토 반영)
  await page.getByTestId('sheet-close').click();
  await skipTo(page, 4);
  // 마지막 건너뛰기는 화면 프레임 안에서 (빨리 감기로 지나간 달성은 알리지 않는다)
  await inScene(page, (s) => s.match.world.enqueue({ type: 'debugSkipStage' }).ok, null);
  await expect.poll(() => inScene(page, (s) => s.match.state.stage, null)).toBe(5);
  await expect(page.locator('[data-testid="banner-gold"]', { hasText: '히든 미션 발견! 「소환 거부」 +2,000원' })).toBeVisible();
  const debugSaved = await page.evaluate(() => JSON.parse(localStorage.getItem('rtd.account') ?? '{}') as { hidden?: string[] });
  expect(debugSaved.hidden ?? []).not.toContain('h08');
  // G-1 3택 1: 5단계 강화 선택 창이 먼저 뜬다 → [나중에]로 접기
  await page.getByTestId('choice-later').click();
  await page.getByTestId('menu-mission').click();
  await page.getByTestId('sheet-tab-hidden').click();
  await expect(page.getByTestId('mission-row-h08').locator('.ms-name-text')).toHaveText('소환 거부');
  // 발견한 히든은 조건 설명도 보인다
  await expect(page.getByTestId('mission-row-h08').locator('.ms-desc')).toHaveText('5단계까지 소환 0회');
  // debug가 아닌 판: 5단계 직전까지 빨리 감고 마지막 몇 틱은 화면 프레임 안에서 → 달성 + 영구 기록
  await start(page, '?seed=42');
  await inScene(
    page,
    (s) => {
      const st = s.match.state as unknown as { stage: number; nextStageTick: number };
      while (st.stage < 4 || st.nextStageTick - s.match.tick > 10) {
        if (s.debugFastForward(1) === 0) break; // 패배하면 멈춤
      }
      return st.stage;
    },
    null,
  );
  await expect.poll(() => inScene(page, (s) => s.match.state.stage, null)).toBe(5);
  await expect(page.locator('[data-testid="banner-gold"]', { hasText: '히든 미션 발견! 「소환 거부」' })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('rtd.account') ?? '{}') as { hidden?: string[] });
  expect(saved.hidden).toContain('h08');
  // 다음 판: 아직 달성 전이어도 영구 기록된 히든은 이름이 보인다
  await start(page);
  await page.getByTestId('menu-mission').click();
  await page.getByTestId('sheet-tab-hidden').click();
  await expect(page.getByTestId('mission-row-h08').locator('.ms-name-text')).toHaveText('소환 거부');
  await expect(page.getByTestId('mission-row-h08')).toHaveAttribute('data-status', 'open');
  await expect(page.getByTestId('mission-row-h02').locator('.ms-name-text')).toHaveText('???');
  await page.evaluate(() => localStorage.removeItem('rtd.account'));
  expect(errors).toEqual([]);
});

test('[⬆ 승급 가능 n]: 누를 때마다 다음 묶음의 패널을 열고 그 타워들에 금색 고리 강조', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  // G-1 칸 무더기: 같은 캐릭터 3개가 한 칸에 (궁수 (2,3), 광부 (1,5))
  await place(page, [
    [2, 3, 'archer'],
    [2, 3, 'archer'],
    [2, 3, 'archer'],
    [1, 5, 'miner'],
    [1, 5, 'miner'],
    [1, 5, 'miner'],
  ]);
  const btn = page.getByTestId('hud-merge-ready');
  await expect(btn).toHaveText('⬆ 승급 가능 2');
  // 강조는 1.5초 — 느린 헤드리스 화면(T-3: 캔버스가 화면 높이만큼 커짐)에서도 놓치지 않게 누르자마자 잰다
  await btn.click();
  expect(await inScene(page, (s) => s.mergeHighlightCount, null)).toBe(3);
  await expect(page.getByTestId('tower-panel')).toBeVisible();
  await expect(page.getByTestId('tp-name')).toHaveText('궁수 ×3');
  // 아래에 붙은 패널이 [⬆ 승급 가능 n]을 덮어도 패널 안 [다음 묶음 ▶]으로 이어서 넘긴다 (M5 검토 반영)
  const next = page.locator('[data-action="merge-next"]');
  await expect(next).toHaveText('다음 묶음 ▶ 1/2');
  await next.click();
  expect(await inScene(page, (s) => s.mergeHighlightCount, null)).toBe(3);
  await expect(page.getByTestId('tp-name')).toHaveText('광부 ×3');
  await expect(next).toHaveText('다음 묶음 ▶ 2/2');
  await next.click();
  await expect(page.getByTestId('tp-name')).toHaveText('궁수 ×3');
  // 패널을 닫고 버튼을 눌러도 다음 묶음
  await page.locator('[data-action="panel-close"]').click();
  await btn.click();
  expect(await inScene(page, (s) => s.mergeHighlightCount, null)).toBe(3);
  await expect(page.getByTestId('tp-name')).toHaveText('광부 ×3');
  // 타워를 직접 눌러 연 패널에는 [다음 묶음 ▶]이 없다
  await page.locator('[data-action="panel-close"]').click();
  await tapTile(page, 2, 3);
  await expect(page.getByTestId('tp-name')).toHaveText('궁수 ×3');
  await expect(next).toBeHidden();
  // 1.5초 뒤 강조 끝
  await expect.poll(() => inScene(page, (s) => s.mergeHighlightCount, null), { timeout: 4000 }).toBe(0);
  expect(errors).toEqual([]);
});

test('바텀 시트는 하나만: 시트를 열면 정보 패널이 닫히고, 시트가 열린 동안 타워를 누르면 시트만 닫힘, 카드 창은 알약으로 접혀 뜬다', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  // 아래쪽 줄 타워 → 정보 패널은 위에 붙어 하단 메뉴가 보인다
  await place(page, [[2, 6, 'archer']]);
  await tapTile(page, 2, 6);
  await expect(page.getByTestId('tower-panel')).toHaveClass(/is-top/);
  await page.getByTestId('menu-upgrade').click();
  await expect(page.getByTestId('sheet-upgrade')).toBeVisible();
  await expect(page.getByTestId('tower-panel')).toHaveCount(0);
  // 시트가 열린 동안 (시트 위쪽) 타워를 누르면 시트만 닫힌다 (패널 안 열림)
  await place(page, [[2, 1, 'archer']]);
  await tapTile(page, 2, 1);
  await expect(page.getByTestId('sheet-upgrade')).toHaveCount(0);
  expect(await inScene(page, (s) => s.panelOpen, null)).toBe(false);
  // 시트를 쓰는 중 보스 카드가 생기면 창은 알약으로 접혀 뜬다
  await page.getByTestId('menu-upgrade').click();
  await inScene(
    page,
    (s) => {
      (s.match.state as unknown as { cardOffers: { player: number; boss: number; cards: string[] }[] }).cardOffers.push({
        player: 0,
        boss: 1,
        cards: ['fund', 'summonDiscount', 'goldHand'],
      });
      return null;
    },
    null,
  );
  await expect.poll(() => inScene(page, (s) => s.choiceKind, null)).toBe('card');
  expect(await inScene(page, (s) => s.choiceCollapsed, null)).toBe(true);
  await expect(page.getByTestId('sheet-upgrade')).toBeVisible();
  // 시트를 닫으면 아래 띠의 알약 → 펼치면 창
  await page.getByTestId('sheet-close').click();
  await page.getByTestId('choice-reopen').click();
  expect(await inScene(page, (s) => s.choiceCollapsed, null)).toBe(false);
  expect(errors).toEqual([]);
});

test('M5 스크린샷: 10단계 보스 + 도전 3단계 (체력바 2줄) · 강화 시트 능력치 탭 (⚡ 공속 배율) · 메뉴 배지', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  await place(page, [
    [1, 3, 'archer'],
    [2, 3, 'archer'],
    [3, 3, 'warrior'],
    [4, 3, 'miner'],
    [1, 1, 'apprentice'],
    [1, 4, 'spearman'],
    [4, 4, 'goblin'],
    [2, 4, 'drummer'],
    [3, 4, 'archer'],
  ]);
  await addGold(page, 30000);
  // 강화부터 (버튼을 화면에서 누른다)
  await page.getByTestId('menu-upgrade').click();
  for (let i = 0; i < 6; i++) await page.getByTestId('upgrade-buy-normal').click();
  await page.getByTestId('sheet-tab-stat').click();
  for (const id of ['aps', 'aps', 'aps', 'aps', 'aps', 'crit', 'crit', 'range']) await page.getByTestId(`upgrade-buy-${id}`).click();
  await expect(page.getByTestId('upgrade-aps')).toHaveText('⚡×1.2');
  // 그다음 도전 3단계(30초 제한)와 10단계 보스 — 시트는 열어 둔 채 명령으로 (느린 기기에서도 촬영 전에 도전이 끝나지 않게)
  await inScene(
    page,
    (s) => {
      s.match.state.challengeOpen = 3;
      s.match.world.enqueue({ type: 'startChallenge', lv: 3 });
      s.debugFastForward(1);
      return null;
    },
    null,
  );
  await skipTo(page, 10);
  await ff(page, 40);
  await expect(page.getByTestId('hud-banner-slot')).toHaveClass(/is-split/);
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 5000 });
  await expect(page.getByTestId('hud-banner-slot')).toHaveClass(/is-split/);
  await page.evaluate(() => {
    const body = document.querySelector('.bs-body');
    if (body) body.scrollTop = 0; // 버튼을 누르며 내려간 목록을 맨 위로 (⚡ 공속 줄부터)
  });
  await shot(page, 'M5-upgrade', 'M5');
  expect(errors).toEqual([]);
});
