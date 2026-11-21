/**
 * F10-2 첫 보스 E2E: 9단계 보스 예고 배너 → 10단계 박쥐 여왕 → 비행 중 표시('비행 중 · 사거리 2칸 이하 공격 불가') →
 * 처치 → 카드 3장 고르기, 제한 시간 패배 화면(사유 + 남은 체력 % + 대응 한 줄), 연출 끄기여도 글자는 그대로, 360px 넘침 없음.
 * 단계 이동·타워는 개발용 명령(?debug=1 / ?dev=1). sim은 window.__rtd로 읽기만 한다 (명령은 enqueue).
 */
import { expect, test, type Page } from '@playwright/test';
import { clickStart } from './title';
import { mkdirSync } from 'node:fs';
import { E2E_MATCH_SWITCHES_OFF } from './seed';

const SAVE_DOCS = process.env.SAVE_SCREENS === '1';

type SceneLike = {
  match: {
    tick: number;
    state: { stage: number; phase: string; defeatReason: string; summons: number; bossId: string; bossMaxHp: number; cardOffers: { cards: string[] }[]; cardsPicked: string[] };
    mobs(): { boss: boolean; hp: number; flyUntil: number; challenge: number }[];
    towers(): unknown[];
    rules: { towerOrder: string[] };
    world: { enqueue(c: unknown): { ok: boolean } };
  };
  debugFastForward(n: number): number;
  refreshHud(): void;
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

/** debug 단계 건너뛰기를 한 틱에 하나씩 → 지금 단계. 한 번의 evaluate(= 한 프레임)라 사이 단계 알림은 마지막 단계 것만 뜬다. */
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

/** 순환의 정원 v2 고리 안쪽 블록 16칸 */
// 순환의 정원 v4 (G-1 마당 맵): 길에 닿은 마당 가장자리 16칸
const INNER: [number, number][] = [
  [1, 1], [2, 1], [3, 1], [4, 1],
  [1, 2], [4, 2], [1, 3], [4, 3], [1, 4], [4, 4], [1, 5], [4, 5],
  [1, 6], [2, 6], [3, 6], [4, 6],
];

async function placeInner(page: Page, kinds: string[]): Promise<void> {
  const ok = await inScene(
    page,
    (s, a) => a.cells.every(([x, y], i) => s.match.world.enqueue({ type: 'debugTower', x, y, t: s.match.rules.towerOrder.indexOf(a.kinds[i % a.kinds.length]!) }).ok),
    { cells: INNER, kinds },
  );
  expect(ok).toBe(true);
  await ff(page, 1);
}

async function shot(page: Page, name: string, docsName?: string): Promise<void> {
  mkdirSync('test-results/screens', { recursive: true });
  await page.screenshot({ path: `test-results/screens/${name}.png`, animations: 'disabled' });
  if (SAVE_DOCS && docsName) {
    mkdirSync('docs/screens', { recursive: true });
    await page.screenshot({ path: `docs/screens/${docsName}.png`, animations: 'disabled' });
  }
}

/** 요소가 무대(화면) 가로 안에 있고 글자가 잘리지 않는가 */
async function fitsWidth(page: Page, testId: string): Promise<boolean> {
  return page.getByTestId(testId).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.left >= -0.5 && r.right <= window.innerWidth + 0.5 && el.scrollWidth <= el.clientWidth + 1;
  });
}

const PREVIEW = '⚠ 다음 단계 보스: 박쥐 여왕';
const COUNTER = '💡 날 때는 사거리 2칸 이하 타워가 못 때려요 · 원거리 물리 타워를 길목에';
const FLY = '🦇 비행 중 · 사거리 2칸 이하 공격 불가';

test('9단계 예고 → 10단계 박쥐 여왕 → 비행 중 표시 → 처치 → 카드 3장 중 1장', async ({ page }) => {
  test.slow();
  const errors = collectErrors(page);
  await start(page);
  // 8단계에서는 예고 없음, 9단계가 시작되면 예고 배너 (배너는 실제 시간 5.2초 — 건너뛰자마자 본다)
  await skipTo(page, 8);
  await expect(page.locator('[data-testid="banner-boss"]', { hasText: PREVIEW })).toHaveCount(0);
  await skipTo(page, 9);
  const preview = page.locator('[data-testid="banner-boss"]', { hasText: PREVIEW });
  await expect(preview).toBeVisible();
  await expect(preview).toContainText(COUNTER);
  await shot(page, 'F10-preview', 'F10-boss-preview');
  // 10단계: 보스 등장, 아직 날지 않음
  await skipTo(page, 10);
  // G-1: 5단계 3택 1 강화 카드는 먼저 골라 둔다 (보스 카드 창만 보려고)
  await inScene(page, (s) => {
    const st = s.match.state as unknown as { cardOffers: { stage?: number }[] };
    st.cardOffers.filter((o) => o.stage !== undefined).forEach(() => s.match.world.enqueue({ type: 'pickCard', i: 0 }));
    s.debugFastForward(1);
    return null;
  }, null);
  await expect(page.getByTestId('hud-boss-name')).toHaveText('질풍 군단 · 대장 「박쥐 여왕」');
  await expect(page.getByTestId('hud-boss-note')).toBeHidden();
  // 15초(300틱) 뒤 3초 날아오름 → 보스 막대 아래 짧은 표시, 내려오면 사라짐.
  // 느린 헤드리스에서 3초(실제 시간)가 검사 중에 끝나지 않게: 날아오른 틱으로 넘긴 뒤 HUD를 한 번 그리고 장면을 멈춘다
  const flying = await inScene(
    page,
    (s) => {
      s.debugFastForward(302);
      s.refreshHud();
      s.scene.pause();
      return s.match.mobs().some((m) => m.boss && m.flyUntil > s.match.tick);
    },
    null,
  );
  expect(flying).toBe(true);
  const note = page.getByTestId('hud-boss-note');
  await expect(note).toHaveText(FLY);
  await expect(note).toBeVisible();
  expect(await fitsWidth(page, 'hud-boss-note')).toBe(true);
  // 표시는 자리를 차지하지 않고 누르기를 통과시킨다 (맵 조작 그대로)
  expect(await note.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
  await shot(page, 'F10-fly', 'F10-boss-fly');
  await inScene(page, (s) => s.scene.resume(), null);
  await ff(page, 70);
  await expect(note).toBeHidden();
  // 안쪽 블록 레전드로 잡는다 → 카드 3장
  await placeInner(page, ['fortuna', 'archmage', 'dragoncaller', 'warlord']);
  await expect.poll(() => inScene(page, (s) => s.match.state.bossId, null), { timeout: 30_000 }).toBe('');
  const panel = page.getByTestId('choice-card');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.cp-option')).toHaveCount(3);
  const first = await inScene(page, (s) => s.match.state.cardOffers[0]!.cards[0]!, null);
  await page.getByTestId('choice-0').click();
  await expect(panel).toBeHidden();
  expect((await inScene(page, (s) => s.match.state.cardsPicked, null)).at(-1)).toEqual(first);
  expect(errors).toEqual([]);
});

test('제한 시간 패배: "박쥐 여왕을 90초 안에 잡지 못했어요 · 남은 체력 N%" + 대응 한 줄 (N = sim 남은 체력 올림)', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  // 개발자 '이번 판 기록'용 첫 소환 한 번 (F10-4 검토: 패배 화면·지난 판에 기록이 남는지)
  await page.getByTestId('hud-summon').click();
  await expect.poll(() => inScene(page, (s) => s.match.state.summons, null)).toBe(1);
  await skipTo(page, 10);
  // 노말 타워 몇 개로 조금만 깎는다 → 남은 체력이 100% 아래
  await inScene(
    page,
    (s) => [[1, 2], [2, 2], [3, 2]].every(([x, y]) => s.match.world.enqueue({ type: 'debugTower', x, y, t: 0 }).ok),
    null,
  );
  await ff(page, 1850);
  const st = await inScene(
    page,
    (s) => {
      let hp = 0;
      for (const m of s.match.mobs()) if (m.boss && !m.challenge) hp += Math.max(0, m.hp);
      return { phase: s.match.state.phase, reason: s.match.state.defeatReason, hp, max: s.match.state.bossMaxHp };
    },
    null,
  );
  expect([st.phase, st.reason]).toEqual(['defeat', 'bossTime']);
  const pct = Math.min(100, Math.ceil((st.hp * 100) / st.max));
  expect(pct).toBeGreaterThan(0);
  await expect(page.locator('.gameover-reason')).toHaveText(`박쥐 여왕을 90초 안에 잡지 못했어요 · 남은 체력 ${pct}%`);
  await expect(page.getByTestId('gameover-tip')).toHaveText(COUNTER);
  await expect(page.locator('.gameover-record')).toHaveText('10단계까지 버텼어요');
  // 개발자 모드: 패배 화면에 이번 판 기록 (패배 화면이 🛠를 덮어도 읽을 수 있게, 결정 6)
  const goLog = page.getByTestId('gameover-run-log');
  await expect(goLog).toBeVisible();
  await expect(goLog).toContainText('첫 소환');
  await expect(goLog).toContainText(`시간 초과 · 남은 체력 ${pct}%`);
  // 패배 화면 안에 다 들어간다 (버튼이 밀려 화면 밖으로 나가지 않음)
  const retryBox = (await page.getByRole('button', { name: '다시 하기' }).boundingBox())!;
  expect(retryBox.y + retryBox.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await shot(page, 'F10-timeout', 'F10-boss-timeout');
  // 다시 하기 → 새 판 (같은 경로로 재시작)
  await page.getByRole('button', { name: '다시 하기' }).click();
  await expect.poll(() => inScene(page, (s) => [s.match.state.stage, s.match.state.phase], null)).toEqual([0, 'playing']);
  // 새 판의 🛠: 이번 판 기록은 새로 시작, 지난 판 기록에 방금 판(10단계 패배 · 보스 시간 초과 · 남은 체력)
  await page.getByTestId('menu-dev').click();
  await expect(page.getByTestId('dev-run-log')).toContainText('— (아직)');
  const past = page.getByTestId('dev-past-run').first();
  await expect(past).toContainText('10단계 패배 · 보스 시간 초과');
  await expect(past).toContainText(`남은 체력 ${pct}%`);
  expect(errors).toEqual([]);
});

test('연출 끄기(개발자)여도 예고·비행 글자는 그대로, 360px에서 넘치지 않음', async ({ page }) => {
  test.slow();
  await page.setViewportSize({ width: 360, height: 800 });
  await page.addInitScript((off) => localStorage.setItem('rtd.settings', JSON.stringify({ v: 2, tapMerge: true, effectsOff: true, ...off })), E2E_MATCH_SWITCHES_OFF);
  const errors = collectErrors(page);
  await start(page, '?dev=1&seed=7');
  await expect(page.locator('#ui-root')).toHaveClass(/fx-off/);
  await skipTo(page, 9);
  const preview = page.locator('[data-testid="banner-boss"]', { hasText: PREVIEW });
  await expect(preview).toBeVisible();
  await expect(preview).toContainText(COUNTER);
  // 배너는 한 줄씩 맞춰 줄인다 (fitBannerLines) — 360px 무대 안
  expect(
    await preview.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.left >= -0.5 && r.right <= window.innerWidth + 0.5;
    }),
  ).toBe(true);
  await skipTo(page, 10);
  await inScene(
    page,
    (s) => {
      s.debugFastForward(302);
      s.refreshHud();
      s.scene.pause();
    },
    null,
  );
  const note = page.getByTestId('hud-boss-note');
  await expect(note).toHaveText(FLY);
  expect(await note.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  expect(await fitsWidth(page, 'hud-boss-note')).toBe(true);
  expect(errors).toEqual([]);
});
