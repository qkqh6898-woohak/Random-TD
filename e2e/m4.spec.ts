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

async function ff(page: Page, ticks: number): Promise<void> {
  await inScene(page, (s, n) => s.debugFastForward(n), ticks);
}

/** 순환의 정원 안쪽 블록 가장자리 칸들 (경로와 맞닿음) */
function innerRing(kinds: string[], skip: [number, number][] = []): [number, number, string][] {
  const out: [number, number, string][] = [];
  let k = 0;
  for (let y = 2; y <= 8; y++) {
    for (let x = 2; x <= 6; x++) {
      if (!(x === 2 || x === 6 || y === 2 || y === 8)) continue;
      if (skip.some(([a, b]) => a === x && b === y)) continue;
      out.push([x, y, kinds[k++ % kinds.length]!]);
    }
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
  await expect(hire).toHaveText('👷 300원');
  await expect(page.getByTestId('hud-workers')).toHaveText('0/10');
  await hire.click();
  await expect(page.getByTestId('hud-workers')).toHaveText('1/10');
  expect(await inScene(page, (s) => s.match.state.gold, null)).toBe(700);
  // 다음 100틱 배수까지 → +5원
  const g0 = await inScene(page, (s) => s.match.state.gold, null);
  await inScene(page, (s) => s.debugFastForward(100 - (s.match.tick % 100) + 1), null);
  expect(await inScene(page, (s) => s.match.state.gold, null)).toBe(g0 + 5);
  // 두 명 더 → 돈 205원 → 고용 버튼은 흐리고, 누르면 모자란 만큼 알림
  await hire.click();
  await expect(page.getByTestId('hud-workers')).toHaveText('2/10');
  await hire.click();
  await expect(page.getByTestId('hud-workers')).toHaveText('3/10');
  await expect(hire).toHaveClass(/is-off/);
  const gold = await inScene(page, (s) => s.match.state.gold, null);
  await hire.click();
  await expect(page.locator('.toast', { hasText: `${300 - gold}원이 더 필요해요` })).toBeVisible();
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
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await start(page);
  expect(await skipTo(page, 10)).toBe(10);
  await expect(page.getByTestId('hud-boss-name')).toHaveText('질풍 군단 · 대장 「박쥐 여왕」');
  await expect(page.getByTestId('hud-boss-time')).toHaveText(/^\d+초$/);
  expect(await page.getByTestId('hud-boss-hp').evaluate((el) => (el as HTMLElement).style.width)).toBe('100%');
  await expect(page.locator('.toast', { hasText: '박쥐 여왕' }).first()).toBeVisible();
  await page.getByRole('button', { name: '일시정지' }).click();
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
  expect(errors).toEqual([]);
});

test('투명 몹: 감지 없이 처음 나오면 경고 배너, 정찰병 감지 오라 안에서는 보라 외곽선 (화면 외곽선 수 = sim 드러난 투명 몹 수)', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await start(page);
  await skipTo(page, 35);
  await ff(page, 900); // 투명 도둑은 무리 뒤쪽 (15번째 칸 이후)
  await expect(page.getByTestId('banner-shadow')).toContainText('투명 몹 출현! 감지 타워가 필요해요');
  await shot(page, 'M4-invisible-warn');
  expect(await inScene(page, (s) => s.match.mobs().filter((m) => m.invisible).length, null)).toBeGreaterThan(0);
  // 정찰병 2개 (위·아래 경로)
  await place(page, [
    [4, 2, 'scout'],
    [4, 8, 'scout'],
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
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await start(page);
  await skipTo(page, 44);
  await inScene(page, (s) => s.debugFastForward(s.match.ticksToNextStage() - 200 + 1), null);
  const banner = page.getByTestId('banner-warn');
  await expect(banner).toContainText('⚠ 다음 단계: 돌파 편대 — 보석 골렘 + 암흑 고블린 떼!');
  await expect(banner).toContainText('진흙 둔화 + 광역 추천');
  await shot(page, 'M4-formation-banner');
  expect(errors).toEqual([]);
});

test('승급의 축복 카드: 승급하면 "결과 2개 중 선택" 창 → [바꾸기]를 누르면 같은 칸 타워가 다른 결과로', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  const idx = await inScene(page, (s) => s.match.rules.cards.findIndex((c) => c.id === 'mergeBless'), null);
  await inScene(page, (s, c) => s.match.world.enqueue({ type: 'debugCard', c }), idx);
  await place(page, [
    [0, 0, 'goblin'],
    [1, 0, 'goblin'],
    [2, 0, 'goblin'],
  ]);
  await inScene(page, (s) => s.match.world.enqueue({ type: 'merge', x: 0, y: 0 }), null);
  const panel = page.getByTestId('choice-merge');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.cp-option')).toHaveCount(2);
  await shot(page, 'M4-merge-pick');
  const pick = await inScene(page, (s) => s.match.state.mergePicks[0]!, null);
  await page.getByTestId('choice-1').click();
  await expect(panel).toBeHidden();
  const t = await inScene(page, (s, id) => s.match.towers().find((x) => x.id === id)?.tower, pick.id);
  expect(t).toBe(pick.alt);
  expect(errors).toEqual([]);
});

test('혼돈의 용(60단계): 15초마다 타워 3개 기절 → 기절한 타워만 잿빛 (화면 = sim)', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await start(page);
  await place(page, [
    [0, 0, 'archer'],
    [2, 0, 'archer'],
    [4, 0, 'archer'],
    [6, 0, 'archer'],
    [8, 0, 'archer'],
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
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await start(page, '?debug=1&seed=7');
  await page.getByRole('button', { name: '돈 추가 (디버그)' }).click();
  for (let i = 0; i < 3; i++) await page.getByTestId('hud-hire').click();
  await expect(page.getByTestId('hud-workers')).toHaveText('3/10');
  // 안쪽 블록 네 귀퉁이에 정찰병(감지 오라 r3) + 나머지 가장자리에 레전드: 드러난 보스의 체력 막대가 줄어드는 모습 (패널·고르기 창은 열지 않음)
  await place(page, [
    [2, 2, 'scout'],
    [6, 2, 'scout'],
    [2, 8, 'scout'],
    [6, 8, 'scout'],
    ...innerRing(['fortuna', 'dragoncaller', 'archmage', 'warlord'], [
      [2, 2],
      [6, 2],
      [2, 8],
      [6, 8],
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
  await inScene(page, (s) => s.scene.resume(), null);
  expect(errors).toEqual([]);
});
