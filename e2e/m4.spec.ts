/**
 * M4 E2E: 일꾼 고용(아래 띠 버튼·👷 수·수입), 보스 막대(이름표·체력·남은 초)와 보스 처치 → 카드 3장 고르기 창, 보스 제한 시간 패배 화면,
 * 투명 몹 경고 배너 + 정찰병이 드러낸 보라 외곽선, 편대 예고 배너, 승급의 축복 고르기 창, 혼돈의 용 타워 기절 표시, M4 스크린샷.
 * 단계 이동·타워·카드는 개발용 명령(?debug=1: debugSkipStage·debugTower·debugCard·debugAddGold)으로. sim은 window.__rtd로 읽기만 한다.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SAVE_DOCS = process.env.SAVE_SCREENS === '1';

interface MobLite {
  id: number;
  mob: string;
  boss: boolean;
  part: boolean;
  hp: number;
  maxHp: number;
  invisible: boolean;
  revealedUntil: number;
}

type SceneLike = {
  match: {
    tick: number;
    state: {
      stage: number;
      gold: number;
      goldEarned: number;
      workers: number;
      phase: string;
      defeatReason: string;
      bossId: string;
      cardsPicked: string[];
      cardOffers: { cards: string[] }[];
      mergePicks: { id: number; alt: string }[];
      nextStageTick: number;
    };
    mobs(): MobLite[];
    towers(): { id: number; tx: number; ty: number; tower: string; stunUntil: number }[];
    rules: { towerOrder: string[]; cards: { id: string }[] };
    world: { enqueue(c: unknown): { ok: boolean } };
    ticksToNextStage(): number;
  };
  renderedMobCount: number;
  revealedOutlineCount: number;
  stunnedTowerCount: number;
  choiceKind: string | null;
  choiceCollapsed: boolean | null;
  panelOpen: boolean;
  layout: { tile: number; originX: number; originY: number };
  drawnTowerType(id: number): string | null;
  drawnMobScale(id: number): number | null;
  debugFastForward(n: number): number;
  scene: { pause(): void; resume(): void };
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
  await page.getByRole('button', { name: '시작' }).click();
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

/** 개발용 명령으로 타워 놓기 [x, y, 타워 id]. */
async function place(page: Page, list: [number, number, string][]): Promise<void> {
  const before = await inScene(page, (s) => s.match.towers().length, null);
  const ok = await inScene(
    page,
    (s, l) => l.every(([x, y, id]) => s.match.world.enqueue({ type: 'debugTower', x, y, t: s.match.rules.towerOrder.indexOf(id) }).ok),
    list,
  );
  expect(ok).toBe(true);
  await inScene(page, (s) => s.debugFastForward(1), null);
  await expect.poll(() => inScene(page, (s) => s.match.towers().length, null)).toBeGreaterThanOrEqual(before + list.length);
}

/** debug 단계 건너뛰기를 n번 (한 틱에 하나씩) → 지금 단계. */
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

/** 칸 (tx, ty) 가운데의 화면 좌표 (게임 1080 기준 → 무대 CSS px + 캔버스 위치). */
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

async function ff(page: Page, ticks: number): Promise<void> {
  await inScene(page, (s, n) => s.debugFastForward(n), ticks);
}

/** 순환의 정원 안쪽 블록 가장자리 칸들 (경로와 맞닿음) */
/** 순환의 정원 v2(T-3 2×2 블록) 고리 안쪽 블록 4개 = 16칸 (모두 경로와 맞닿음) */
const INNER: [number, number][] = [3, 4, 6, 7].flatMap((y) => [1, 2, 4, 5].map((x) => [x, y] as [number, number]));

function innerRing(kinds: string[], skip: [number, number][] = []): [number, number, string][] {
  const out: [number, number, string][] = [];
  let k = 0;
  for (const [x, y] of INNER) {
    if (skip.some(([a, b]) => a === x && b === y)) continue;
    out.push([x, y, kinds[k++ % kinds.length]!]);
  }
  return out;
}

async function shot(page: Page, name: string, docsName?: string): Promise<void> {
  mkdirSync('test-results/screens', { recursive: true });
  await page.screenshot({ path: `test-results/screens/${name}.png`, animations: 'disabled' });
  if (SAVE_DOCS && docsName) {
    mkdirSync('docs/screens', { recursive: true });
    await page.screenshot({ path: `docs/screens/${docsName}.png`, animations: 'disabled' });
  }
}

test('일꾼: [👷 300원] → 👷 1/10·돈 −300, 5초마다 +5원 / 모자라면 "…원이 더 필요해요" / 10명이면 👷 최대(금색)', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  const hire = page.getByTestId('hud-hire');
  const workers = page.getByTestId('hud-workers');
  await expect(hire).toHaveText('👷 300원');
  await expect(workers).toHaveText('0/10');
  // 게임은 실시간으로 흐르고 일꾼 수입은 100틱(5초)마다 들어온다 → 돈을 읽는 시점과 수입 틱이 겹쳐도 맞게 확인한다
  // (돈을 두 번 나눠 읽으면 그 사이에 수입이 끼어 테스트가 흔들렸다).
  await hire.click();
  await expect(workers).toHaveText('1/10');
  // 돈 −300: 지금 돈 = 시작 1,000 − 300 + 그동안 번 돈(수입 틱이 이미 지났을 수 있음 — 타워가 없어 처치 보상은 없다). 한 번에 읽는다.
  const paid = await inScene(page, (s) => ({ gold: s.match.state.gold, earned: s.match.state.goldEarned }), null);
  expect(paid.gold).toBe(1000 - 300 + paid.earned);
  // 다음 100틱 배수까지 → +5원 (읽기와 빨리 감기를 한 동기 구간에서 — 사이에 프레임이 끼지 않는다)
  const income = await inScene(
    page,
    (s) => {
      const g0 = s.match.state.gold;
      s.debugFastForward(100 - (s.match.tick % 100) + 1);
      return s.match.state.gold - g0;
    },
    null,
  );
  expect(income).toBe(5);
  // 두 명 더 → 돈 300원 미만 → 고용 버튼은 흐리고, 누르면 모자란 만큼 알림
  await hire.click();
  await expect(workers).toHaveText('2/10');
  await hire.click();
  await expect(workers).toHaveText('3/10');
  await expect(hire).toHaveClass(/is-off/);
  // 돈을 읽고 누르는 사이에 수입 틱이 끼면 알림 금액이 달라진다 → 장면 갱신(틱)을 멈춘 채 읽고 누른다.
  // 고용 버튼은 누르는 순간의 돈으로 미리 검사해 바로 알림을 띄운다 (틱이 돌지 않아도 됨).
  // pause()·resume()은 ScenePlugin을 돌려주므로 중괄호로 감싸 아무것도 돌려주지 않는다 — Phaser 객체 그래프를 직렬화하느라
  // 한 번에 약 10초씩 페이지가 멈췄다 (테스트가 느려 시간 초과로 실패한 주원인).
  await inScene(
    page,
    (s) => {
      s.scene.pause();
    },
    null,
  );
  const gold = await inScene(page, (s) => s.match.state.gold, null);
  expect(gold).toBeLessThan(300);
  await hire.click();
  await expect(page.locator('.toast', { hasText: `${300 - gold}원이 더 필요해요` })).toBeVisible();
  expect(await inScene(page, (s) => ({ gold: s.match.state.gold, workers: s.match.state.workers }), null)).toEqual({ gold, workers: 3 });
  await inScene(
    page,
    (s) => {
      s.scene.resume();
    },
    null,
  );
  // 돈을 넣고 10명까지 → 👷 최대 (금색), 누르면 "일꾼이 꽉 찼어요 (10/10)"
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '돈 추가 (디버그)' }).click();
  for (let i = 3; i < 10; i++) {
    await hire.click();
    await expect(page.getByTestId('hud-workers')).toHaveText(`${i + 1}/10`);
  }
  await expect(hire).toHaveText('👷 최대');
  await expect(page.locator('.hud-workers')).toHaveClass(/is-full/);
  await hire.click();
  await expect(page.locator('.toast', { hasText: '일꾼이 꽉 찼어요 (10/10)' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('보스: 10단계 박쥐 여왕 — 보스 막대(이름표·체력·남은 초) + 큰 보스 그림, 잡으면 +200원 + 카드 3장 고르기 창 → 고르면 효과', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  expect(await skipTo(page, 10)).toBe(10);
  // 보스 등장 = 한 줄 배너 하나 ('N단계 보스 단계!' 알림을 따로 띄우지 않는다 — 맵 0~1줄을 가리던 것, 검토 반영).
  // 배너는 실제 시간 3.2초 — 느린 헤드리스 화면에서도 놓치지 않게 건너뛰자마자 본다
  await expect(page.getByTestId('banner-boss')).toHaveText('👑 10단계 · 질풍 군단 · 대장 「박쥐 여왕」');
  await expect(page.locator('.toast', { hasText: '보스 단계!' })).toHaveCount(0);
  await expect(page.getByTestId('hud-boss-name')).toHaveText('질풍 군단 · 대장 「박쥐 여왕」');
  await expect(page.getByTestId('hud-boss-time')).toHaveText(/^\d+초$/);
  expect(await page.getByTestId('hud-boss-hp').evaluate((el) => (el as HTMLElement).style.width)).toBe('100%');
  await page.getByRole('button', { name: '일시정지' }).click();
  await expect(page.locator('.layer-toast > *')).toHaveCount(0); // 일시정지 메뉴 위에도 알림이 남지 않는다 (검토 반영)
  await page.waitForTimeout(100);
  const drawn = await inScene(page, (s) => ({ sim: s.match.mobs().length, drawn: s.renderedMobCount }), null);
  expect(drawn.drawn).toBe(drawn.sim);
  await page.getByRole('button', { name: '계속' }).click();
  // 안쪽 블록 레전드 → 보스를 잡는다
  await place(page, innerRing(['fortuna', 'archmage', 'dragoncaller', 'warlord']));
  const gold0 = await inScene(page, (s) => s.match.state.gold, null);
  await expect.poll(() => inScene(page, (s) => s.match.state.bossId, null), { timeout: 20_000 }).toBe('');
  expect(await inScene(page, (s) => s.match.state.gold, null)).toBeGreaterThanOrEqual(gold0 + 200);
  await expect(page.getByTestId('hud-boss-name')).toHaveText('👑 보스 처치! 남은 시간은 휴식');
  // 카드 고르기 창: 3장, 고르면 창이 닫히고 효과
  const panel = page.getByTestId('choice-card');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.cp-option')).toHaveCount(3);
  const first = await inScene(page, (s) => s.match.state.cardOffers[0]!.cards[0]!, null);
  await shot(page, 'M4-cards');
  // [나중에] → 창은 접히고 알약만 (선택은 남아 있다) → 알약으로 다시 펼친다
  await page.getByTestId('choice-later').click();
  await expect(panel).toBeHidden();
  await expect(page.getByTestId('choice-reopen')).toBeVisible();
  expect(await inScene(page, (s) => s.match.state.cardOffers.length, null)).toBe(1);
  // 알약은 아래 띠 안 (맵 칸을 덮어 소환 탭을 가로채지 않는다 — 검토 반영: 예전엔 맵 맨 아래 줄 오른쪽 칸 위. T-3: 순환의 정원 v2 (4~6, 10))
  const pill = (await page.getByTestId('choice-reopen').boundingBox())!;
  const band = (await page.locator('.hud-bottom').boundingBox())!;
  expect(pill.y).toBeGreaterThanOrEqual(band.y);
  expect(pill.y + pill.height).toBeLessThanOrEqual(band.y + band.height + 0.5);
  for (const tx of [4, 5, 6]) {
    const c = await tileCenter(page, tx, 10);
    expect(await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.tagName, [c.x, c.y])).toBe('CANVAS');
  }
  await expect(page.getByTestId('hud-hint')).toBeHidden(); // 알약이 있는 동안 소환 안내는 숨김 (아래 띠가 넘치지 않게)
  expect(await page.locator('.hud-bottom').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.getByTestId('choice-reopen').click();
  await expect(panel).toBeVisible();
  await page.getByTestId('choice-0').click();
  await expect(panel).toBeHidden();
  expect(await inScene(page, (s) => s.match.state.cardsPicked, null)).toEqual([first]);
  await expect(page.locator('.toast', { hasText: '🃏' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('보스 제한 시간: 10단계 보스를 60초 안에 못 잡으면 패배 화면 "10단계 보스를 제한 시간 안에 잡지 못했어요"', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  await skipTo(page, 10);
  await ff(page, 1250);
  await expect(page.getByText('10단계 보스를 제한 시간 안에 잡지 못했어요')).toBeVisible();
  expect(await inScene(page, (s) => [s.match.state.phase, s.match.state.defeatReason, s.match.state.stage], null)).toEqual(['defeat', 'bossTime', 10]);
  // 패배 화면 위에 알림·배너가 남지 않는다 (알림 층이 화면 층보다 위라 '패배' 제목을 가리던 것, 검토 반영)
  await expect(page.locator('.layer-toast > *')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /패배/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('투명 몹: 감지 없이 처음 나오면 경고 배너, 정찰병 감지 오라 안에서는 보라 외곽선 (화면 외곽선 수 = sim 드러난 투명 몹 수)', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  await skipTo(page, 35);
  await ff(page, 900); // 투명 도둑은 무리 뒤쪽 (15번째 칸 이후)
  await expect(page.getByTestId('banner-shadow')).toContainText('투명 몹 출현! 감지 타워가 필요해요');
  // 둘째 줄은 내 덱(기본 덱)의 감지 타워만 — 기본 덱에 없는 정찰병은 추천하지 않는다 (검토 반영)
  await expect(page.getByTestId('banner-shadow')).toContainText('💡 덱의 감지 타워: 저격수·그림자 암살자');
  await expect(page.getByTestId('banner-shadow')).not.toContainText('정찰병');
  await shot(page, 'M4-invisible-warn');
  expect(await inScene(page, (s) => s.match.mobs().filter((m) => m.invisible).length, null)).toBeGreaterThan(0);
  // 정찰병 2개 (위·아래 경로)
  await place(page, [
    [4, 3, 'scout'],
    [4, 7, 'scout'],
  ]);
  await expect
    .poll(() => inScene(page, (s) => s.match.mobs().filter((m) => m.invisible && s.match.tick < m.revealedUntil).length, null), { timeout: 20_000 })
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: '일시정지' }).click();
  await page.waitForTimeout(150);
  const v = await inScene(
    page,
    (s) => ({ sim: s.match.mobs().filter((m) => m.invisible && s.match.tick < m.revealedUntil).length, drawn: s.revealedOutlineCount }),
    null,
  );
  expect(v.drawn).toBe(v.sim);
  expect(errors).toEqual([]);
});

test('편대 예고: 45단계 10초 전 "⚠ 다음 단계: 돌파 편대 — 보석 골렘 + 암흑 고블린 떼!" 배너 + 대응 힌트', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  await skipTo(page, 44);
  await inScene(page, (s) => s.debugFastForward(s.match.ticksToNextStage() - 200 + 1), null);
  const banner = page.getByTestId('banner-warn');
  await expect(banner).toContainText('⚠ 다음 단계: 돌파 편대 — 보석 골렘 + 암흑 고블린 떼!');
  await expect(banner).toContainText('진흙 둔화 + 광역 추천');
  // 제목은 한 줄 (넘치면 글자를 줄여 맞춘다) → 배너는 제목 + 힌트 두 줄 (예전엔 412px에서 제목이 이름 중간에서 꺾여 3줄, 검토 반영)
  const lines = await banner.evaluate((el) =>
    Array.from(el.children).map((c) => {
      const line = c as HTMLElement;
      const lh = parseFloat(getComputedStyle(line).fontSize) * 1.2;
      return { rows: Math.round(line.getBoundingClientRect().height / lh), fits: line.scrollWidth <= el.clientWidth };
    }),
  );
  expect(lines).toEqual([
    { rows: 1, fits: true },
    { rows: 1, fits: true },
  ]);
  await shot(page, 'M4-formation-banner');
  expect(errors).toEqual([]);
});

test('승급의 축복 카드: 승급하면 "결과 2개 중 선택" 창 → [바꾸기]를 누르면 같은 칸 타워가 다른 결과로', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  const idx = await inScene(page, (s) => s.match.rules.cards.findIndex((c) => c.id === 'mergeBless'), null);
  await inScene(page, (s, c) => s.match.world.enqueue({ type: 'debugCard', c }), idx);
  await place(page, [
    [1, 0, 'goblin'],
    [2, 0, 'goblin'],
    [1, 1, 'goblin'],
  ]);
  await inScene(page, (s) => s.match.world.enqueue({ type: 'merge', x: 1, y: 0 }), null);
  const panel = page.getByTestId('choice-merge');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.cp-option')).toHaveCount(2);
  await shot(page, 'M4-merge-pick');
  const pick = await inScene(page, (s) => s.match.state.mergePicks[0]!, null);
  await page.getByTestId('choice-1').click();
  await expect(panel).toBeHidden();
  const t = await inScene(page, (s, id) => s.match.towers().find((x) => x.id === id)?.tower, pick.id);
  expect(t).toBe(pick.alt);
  // 맵 그림도 새 타워로 (예전엔 sim·패널만 바뀌고 맵에는 원래 결과 그림이 남았다 — 검토 반영)
  await expect.poll(() => inScene(page, (s, id) => s.drawnTowerType(id), pick.id)).toBe(pick.alt);
  expect(errors).toEqual([]);
});

test('승급의 축복을 정보 패널 [⬆ 승급]으로: 고르기 창이 뜨면 패널은 닫힌다 / 창이 펼쳐진 동안 타워를 누르면 창은 알약으로 접히고 패널만 (바텀 시트 하나)', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  const idx = await inScene(page, (s) => s.match.rules.cards.findIndex((c) => c.id === 'mergeBless'), null);
  await inScene(page, (s, c) => s.match.world.enqueue({ type: 'debugCard', c }), idx);
  await place(page, [
    [1, 0, 'goblin'],
    [2, 0, 'goblin'],
    [1, 1, 'goblin'],
    [5, 0, 'archer'],
  ]);
  await tapTile(page, 1, 0);
  await expect(page.getByTestId('tower-panel')).toBeVisible();
  await page.locator('.tp-merge').click();
  const choice = page.getByTestId('choice-merge');
  await expect(choice).toBeVisible();
  // 패널은 닫힘 → 창 아래로 패널의 승급 버튼이 눌리지 않는다
  await expect(page.locator('.layer-panel > *')).toHaveCount(0);
  expect(await inScene(page, (s) => s.panelOpen, null)).toBe(false);
  await shot(page, 'M4-merge-pick-panel');
  // 창이 펼쳐진 동안 위쪽 타워 탭 → 창은 알약으로, 패널만 보인다
  await tapTile(page, 5, 0);
  await expect(page.getByTestId('tower-panel')).toBeVisible();
  await expect(choice).toBeHidden();
  expect(await inScene(page, (s) => s.choiceCollapsed, null)).toBe(true);
  // 패널을 닫고 알약을 누르면 창이 다시 펼쳐진다 (선택은 그대로)
  await page.getByRole('button', { name: '닫기' }).click();
  await expect(page.getByTestId('tower-panel')).toBeHidden();
  await page.getByTestId('choice-reopen').click();
  await expect(choice).toBeVisible();
  expect(await inScene(page, (s) => s.panelOpen, null)).toBe(false);
  const pick = await inScene(page, (s) => s.match.state.mergePicks[0]!, null);
  await page.getByTestId('choice-1').click();
  await expect(choice).toBeHidden();
  await expect.poll(() => inScene(page, (s, id) => s.drawnTowerType(id), pick.id)).toBe(pick.alt);
  expect(errors).toEqual([]);
});

test('킹 슬라임(20단계) 분열: 조각 두 개가 같은 크기로 그려진다 (원래 보스 몸만 크게 남던 것, 검토 반영)', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  expect(await skipTo(page, 20)).toBe(20);
  expect(await inScene(page, (s) => s.match.state.bossId, null)).toBe('kingslime');
  await place(page, innerRing(['archmage', 'dragoncaller', 'warlord', 'fortuna']));
  // 분열(보스 조각 2)이 보일 때까지 조금씩 빨리 감기
  const split = await inScene(
    page,
    (s) => {
      for (let i = 0; i < 4000; i++) {
        s.debugFastForward(1);
        const parts = s.match.mobs().filter((m) => m.boss);
        if (parts.length === 2) return true;
        if (s.match.state.bossId === '') return false;
      }
      return false;
    },
    null,
  );
  expect(split).toBe(true);
  await page.getByRole('button', { name: '일시정지' }).click();
  await page.waitForTimeout(150);
  const scales = await inScene(page, (s) => s.match.mobs().filter((m) => m.boss).map((m) => ({ part: m.part, drawn: s.drawnMobScale(m.id) })), null);
  expect(scales).toHaveLength(2);
  expect(scales.every((x) => x.part)).toBe(true);
  expect(scales[0]!.drawn).not.toBeNull();
  expect(scales[0]!.drawn).toBe(scales[1]!.drawn);
  expect(scales[0]!.drawn).toBeCloseTo(0.8, 5);
  await shot(page, 'M4-kingslime-split');
  expect(errors).toEqual([]);
});

test('혼돈의 용(60단계): 15초마다 타워 3개 기절 → 기절한 타워만 잿빛 (화면 = sim)', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  await place(page, [
    [1, 0, 'archer'],
    [2, 0, 'archer'],
    [4, 0, 'archer'],
    [5, 0, 'archer'],
    [1, 1, 'archer'],
  ]);
  await skipTo(page, 60);
  expect(await inScene(page, (s) => s.match.state.bossId, null)).toBe('chaosdragon');
  await ff(page, 305);
  await page.getByRole('button', { name: '일시정지' }).click();
  await page.waitForTimeout(150);
  const v = await inScene(page, (s) => ({ sim: s.match.towers().filter((t) => s.match.tick < t.stunUntil).length, drawn: s.stunnedTowerCount }), null);
  expect(v.sim).toBe(3);
  expect(v.drawn).toBe(3);
  await shot(page, 'M4-dragon-stun');
  expect(errors).toEqual([]);
});

test('M4 스크린샷: 40단계 망령 군주 — 줄어드는 보스 막대 + 정찰병이 드러낸 보라 외곽선 + 투명 유령 + 일꾼 3명', async ({ page }) => {
  test.slow(); // 긴 흐름 + 스크린샷 → 기본 제한의 3배
  const errors = collectErrors(page);
  await start(page, '?debug=1&seed=7');
  await page.getByRole('button', { name: '돈 추가 (디버그)' }).click();
  for (let i = 0; i < 3; i++) await page.getByTestId('hud-hire').click();
  await expect(page.getByTestId('hud-workers')).toHaveText('3/10');
  // 안쪽 블록 네 귀퉁이에 정찰병(감지 오라 r3) + 나머지 가장자리에 레전드: 드러난 보스의 체력 막대가 줄어드는 모습 (패널·고르기 창은 열지 않음)
  await place(page, [
    [1, 3, 'scout'],
    [5, 3, 'scout'],
    [1, 7, 'scout'],
    [5, 7, 'scout'],
    ...innerRing(['fortuna', 'dragoncaller', 'archmage', 'warlord'], [
      [1, 3],
      [5, 3],
      [1, 7],
      [5, 7],
    ]),
  ]);
  await skipTo(page, 40);
  expect(await inScene(page, (s) => s.match.state.bossId, null)).toBe('wraithlord');
  // 보스가 드러난 채 체력 85% 아래 + 투명 유령이 있을 때까지 빨리 돌린다 (12초마다 투명 유령 3마리, 제한 60초 안)
  const ready = await inScene(
    page,
    (s) => {
      const ok = (): boolean => {
        const mobs = s.match.mobs();
        const boss = mobs.find((m) => m.boss);
        return !!boss && s.match.tick < boss.revealedUntil && boss.hp < boss.maxHp * 0.85 && mobs.some((m) => m.mob === 'ghost' && m.invisible);
      };
      for (let i = 0; i < 1000 && !ok(); i++) s.debugFastForward(1);
      return ok();
    },
    null,
  );
  expect(ready).toBe(true);
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 8000 });
  await page.waitForFunction(
    () => {
      const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game') as {
        match: { tick: number; mobs(): { boss: boolean; invisible: boolean; revealedUntil: number; hp: number; maxHp: number; mob: string }[] };
        scene: { pause(): void };
      };
      const t = s.match.tick;
      const mobs = s.match.mobs();
      const boss = mobs.find((m) => m.boss);
      const ok = !!boss && t < boss.revealedUntil && boss.hp < boss.maxHp * 0.85 && mobs.some((m) => m.mob === 'ghost' && m.invisible);
      if (ok) s.scene.pause();
      return ok;
    },
    null,
    { polling: 50, timeout: 60_000 },
  );
  await page.waitForTimeout(150);
  expect(await inScene(page, (s) => s.revealedOutlineCount, null)).toBeGreaterThan(0);
  await expect(page.getByTestId('hud-boss-name')).toHaveText('그림자 군단 · 대장 「망령 군주」');
  await shot(page, 'M4-boss', 'M4');
  await inScene(
    page,
    (s) => {
      s.scene.resume(); // 돌려주는 값(ScenePlugin)을 버린다 — 직렬화하면 페이지가 10초쯤 멈춘다
    },
    null,
  );
  expect(errors).toEqual([]);
});
