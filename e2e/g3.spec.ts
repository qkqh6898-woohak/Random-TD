/**
 * G-3 로비·영웅 수집·성장 E2E (휴대폰 412×915, 내비 360·320):
 *  a. 로비: 최고 웨이브 · 웨이브 길(10웨이브마다 보상 받기) · [빠른 시작] → 전투
 *  b. 영웅 탭: 모든 타워가 [영웅]/[리미티드] 격자에 (보유 / 보유하지 않음), [등급 순]/[레벨 순]
 *  c. 레벨업: 카드 + 골드를 쓰고 Lv이 오르며, 다음 판 입력(MatchOptions.levels)에 들어간다
 *  d. 패배 → 정산(경험치·골드·카드·조각) 표시, 로비 최고 웨이브·골드 갱신, 같은 판은 한 번만, 일일 퀘스트 받기
 *  e. 리미티드 조각: 5개(피드백 #59, 예전 20) 모은 히든 영웅을 [해방] → 잠긴 목록(MatchOptions.lockedHidden)에서 빠짐
 *  f. 아래 메뉴 5칸이 412·360·320에서 한 줄, 44px 이상, 가로 넘침 없음
 *  g. 안드로이드 뒤로 가기: 창 → [전투] 탭 → 앱 종료(처리 안 함)
 * 스크린샷 (deviceScaleFactor 1): docs/screens/G3-{lobby,heroes,hero-detail,gameover-rewards,codex-fragments}.png
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { clickStart } from './title';

type SceneLike = {
  match: {
    tick: number;
    state: { stage: number; nextStageTick: number; bossesKilled: number; summons: number; merges: number };
    rules: { bossTimeTicks: number };
    ctx: { levels: Record<string, number>[]; lockedHidden: Set<string>[] };
  };
  debugFastForward(n: number): number;
};

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync('docs/screens', { recursive: true });
  await page.screenshot({ path: `docs/screens/${name}.png`, animations: 'disabled' });
}

async function openLobby(page: Page, query = ''): Promise<void> {
  await page.goto(`/${query}`);
  await expect(page.locator('[data-screen="title"][data-lobby="1"]')).toBeVisible();
}

/** 저장된 진행을 고쳐 새로 연다 (로비가 처음 만든 rtd.progress 위에) */
async function patchProgress(page: Page, patch: string, query = ''): Promise<void> {
  await page.evaluate((src) => {
    const p = JSON.parse(localStorage.getItem('rtd.progress')!) as Record<string, unknown>;
    new Function('p', src)(p);
    localStorage.setItem('rtd.progress', JSON.stringify(p));
  }, patch);
  await openLobby(page, query);
}

async function progress(page: Page): Promise<{ gold: number; gems: number; level: number; bestWave: number; heroes: Record<string, { level: number; cards: number }>; daily: { claimed: string[] }; claimedWaves: number[] }> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('rtd.progress')!));
}

async function inScene<T>(page: Page, fn: (s: SceneLike) => T): Promise<T> {
  return page.evaluate((src) => {
    const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game');
    return new Function('s', `return (${src})(s);`)(s) as T;
  }, fn.toString());
}

async function back(page: Page): Promise<boolean> {
  return page.evaluate(() => !window.dispatchEvent(new Event('randomtd:native-back', { cancelable: true })));
}

test('G-3 a. 로비: 최고 웨이브 · 웨이브 길 보상 받기 · [빠른 시작] → 전투', async ({ page }) => {
  const errors = collectErrors(page);
  await openLobby(page);
  await expect(page.getByTestId('wave-best')).toContainText('최고 웨이브');
  await expect(page.getByTestId('wave-best')).toContainText('0');
  await expect(page.getByTestId('lobby-level')).toHaveText('Lv 1');
  await expect(page.getByTestId('lobby-gold')).toContainText('1,000');
  await expect(page.getByTestId('lobby-gems')).toContainText('50');
  // 최고 40웨이브로 → 10·20·30·40 보상을 받을 수 있다
  await patchProgress(page, 'p.bestWave = 40; p.totals.bestWave = 40; p.recruit = 17;');
  await expect(page.getByTestId('wave-best')).toContainText('40');
  await expect(page.locator('.wave-node.is-ready')).toHaveCount(4);
  await expect(page.locator('.wave-node[data-wave="50"]')).toHaveClass(/is-locked/);
  await expect(page.getByTestId('recruit-gauge')).toHaveText('17/30');
  await expect(page.locator('.lobby-nav [data-tab="battle"] .lobby-badge')).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, 'G3-lobby');
  // 피드백 #57: 10웨이브 [받기] 하나로 10·20·30·40 모두 받기 → 받은 창 한 번 (골드 300 + 600, 보석 30 + 50, 카드·조각)
  await page.getByTestId('wave-claim-10').click();
  const grant = page.getByTestId('grant-dialog');
  await expect(grant).toBeVisible();
  await expect(grant).toContainText('웨이브 보상 4개');
  await expect(grant.locator('.grant-card')).not.toHaveCount(0);
  // ART-2: 💰·💎는 V2 재화 아이콘 그림 + 숫자
  await expect(grant.getByTestId('grant-gold')).toHaveText('+900');
  await expect(grant.getByTestId('grant-gold').locator('[data-icon="cur-gold"]')).toBeVisible();
  await expect(grant.getByTestId('grant-gems')).toHaveText('+80');
  await page.getByTestId('grant-dialog-close').click();
  await expect(page.getByTestId('lobby-gold')).toContainText('1,900');
  await expect(page.locator('.wave-node.is-ready')).toHaveCount(0);
  await expect(page.locator('.wave-node.is-claimed')).toHaveCount(4);
  await expect(page.locator('.wave-node[data-wave="50"]')).toHaveClass(/is-locked/);
  const after = await progress(page);
  expect(after.gold).toBe(1900);
  expect(after.gems).toBe(130);
  expect(after.claimedWaves).toEqual([10, 20, 30, 40]);
  // [빠른 시작] → 전투 (무한 모드)
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
  await expect(page.locator('[data-screen="title"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('G-3 b. 영웅 탭: 모든 타워 격자 · [영웅]/[리미티드] · 정렬 · 상점에서 카드 사기', async ({ page }) => {
  const errors = collectErrors(page);
  await openLobby(page);
  await patchProgress(page, "p.heroes.miner.level = 6; p.heroes.archer.level = 4; p.heroes.miner.cards = 9;");
  await page.locator('.lobby-nav [data-tab="heroes"]').click();
  await expect(page.locator('[data-screen="title"]')).toHaveAttribute('data-tab', 'heroes');
  const owned = page.getByTestId('hero-grid-owned').locator('.hero-card');
  const unowned = page.getByTestId('hero-grid-unowned').locator('.hero-card');
  await expect(owned).toHaveCount(25);
  await expect(unowned).toHaveCount(25);
  await expect(unowned.first()).toHaveClass(/is-unowned/);
  await expect(page.locator('.hero-unowned h3')).toHaveText('보유하지 않음');
  // 등급 순: 레전드가 앞, 노말이 뒤
  await expect(owned.first()).toHaveAttribute('data-grade', 'legend');
  await expect(owned.last()).toHaveAttribute('data-grade', 'normal');
  // 레벨 순: 광부 Lv6 → 궁수 Lv4가 맨 앞 (광부 Lv6 → 7은 카드 10장 — 9장이라 화살표 없음)
  await page.locator('[data-sort="level"]').click();
  await expect(owned.nth(0)).toHaveAttribute('data-hero', 'miner');
  await expect(owned.nth(1)).toHaveAttribute('data-hero', 'archer');
  await expect(owned.nth(0).locator('.hero-card-num')).toHaveText('9/10');
  // 초상 그림 (바깥 WebP 또는 절차 그림)
  await expect(owned.nth(0).locator('img.hero-portrait')).toHaveCount(1);
  await page.waitForTimeout(300);
  await shot(page, 'G3-heroes');
  // [리미티드]: 히든 12 + 신 3, 모두 보유하지 않음 · 히든은 잠김
  await page.locator('[data-hero-tab="mythic"]').click();
  await expect(page.getByTestId('hero-grid-owned').locator('.hero-card')).toHaveCount(0);
  await expect(unowned).toHaveCount(15);
  await expect(page.locator('.hero-card.is-locked')).toHaveCount(12);
  // 상점: 💰800 카드 묶음 → 카드 5장, 골드 200
  await page.locator('.lobby-nav [data-tab="shop"]').click();
  await page.getByTestId('shop-buy-pack-basic').click();
  await expect(page.getByTestId('grant-dialog').locator('.grant-n')).not.toHaveCount(0);
  await page.getByTestId('grant-dialog-close').click();
  await expect(page.getByTestId('lobby-gold')).toContainText('200');
  await expect(page.getByTestId('shop-buy-pack-basic')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('G-3 c. 레벨업: 카드 + 🔥 불꽃(V2.0 PR-A, 예전 골드)을 쓰고, 다음 판 입력에 영웅 레벨이 들어간다', async ({ page }) => {
  const errors = collectErrors(page);
  await openLobby(page);
  await patchProgress(page, 'p.heroes.miner.cards = 5; p.flame = 100;');
  await page.locator('.lobby-nav [data-tab="heroes"]').click();
  const miner = page.locator('.hero-card[data-hero="miner"]');
  await expect(miner.getByTestId('hero-up')).toBeVisible();
  await miner.click();
  const dlg = page.getByTestId('hero-detail');
  await expect(dlg).toBeVisible();
  await expect(page.getByTestId('hero-detail-level')).toHaveText('Lv 1');
  await expect(page.getByTestId('hero-detail-cards')).toHaveText('🃏 카드 5/2');
  await expect(page.getByTestId('hero-detail-bonus')).toHaveText('전투 공격력 +0% → +4%');
  await page.waitForTimeout(300);
  await shot(page, 'G3-hero-detail');
  await page.getByTestId('hero-levelup').click();
  await expect(page.getByTestId('hero-detail-level')).toHaveText('Lv 2');
  await expect(page.getByTestId('hero-detail-cards')).toHaveText('🃏 카드 3/3');
  await expect(page.getByTestId('hero-detail-bonus')).toHaveText('전투 공격력 +4% → +8%');
  await expect(page.getByTestId('lobby-flame')).toContainText('90');
  // 카드 3장 · 불꽃 90 → 한 번 더 (Lv2 → 3: 카드 3, 불꽃 15)
  await page.getByTestId('hero-levelup').click();
  await expect(page.getByTestId('hero-detail-level')).toHaveText('Lv 3');
  await expect(page.getByTestId('hero-levelup')).toBeDisabled();
  await expect(dlg.locator('.hero-detail-why')).toHaveText('카드가 모자라요');
  expect((await progress(page)).heroes.miner).toEqual({ level: 3, cards: 0 });
  await page.getByTestId('hero-detail-close').click();
  await expect(page.locator('.hero-card[data-hero="miner"]')).toHaveAttribute('data-level', '3');
  // 다음 판: MatchOptions.levels = { miner: 3 }
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
  expect(await inScene(page, (s) => s.match.ctx.levels[0])).toEqual({ miner: 3 });
  expect(errors).toEqual([]);
});

test('G-3 d. 패배 → 정산 표시 · 최고 웨이브 갱신 · 한 번만 · 일일 퀘스트 받기', async ({ page }) => {
  test.slow();
  const errors = collectErrors(page);
  await openLobby(page, '?seed=61');
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
  await inScene(page, (s) => {
    const m = s.match;
    m.state.stage = 19;
    m.state.bossesKilled = 1;
    m.state.summons = 60;
    m.state.merges = 12;
    m.state.nextStageTick = m.tick;
    s.debugFastForward(1 + m.rules.bossTimeTicks);
  });
  const over = page.locator('[data-screen="gameover"]');
  await expect(over).toBeVisible();
  const rewards = page.getByTestId('gameover-rewards');
  await expect(rewards).toBeVisible();
  await expect(rewards).toContainText('최고 웨이브 20');
  await expect(rewards).toContainText('새 기록!');
  // 20단계 · 보스 1 · 새 기록: 경험치 200 + 50 + 100, 골드 400 + 100, 카드 8장, 조각 1
  await expect(page.getByTestId('go-xp')).toHaveText('⭐경험치 +350');
  await expect(page.getByTestId('go-gold')).toHaveText('+500'); // ART-2: 💰는 아이콘 그림
  await expect(page.getByTestId('go-gold').locator('[data-icon="cur-gold"]')).toBeVisible();
  await expect(page.getByTestId('go-cards')).toHaveAttribute('aria-label', '영웅 카드 8장');
  await expect(page.getByTestId('go-frags')).toContainText('+1');
  await expect(rewards).toContainText('계정 Lv 3');
  await page.waitForTimeout(400);
  await shot(page, 'G3-gameover-rewards');
  const after = await progress(page);
  expect(after.bestWave).toBe(20);
  expect(after.gold).toBe(1500);
  expect(after.level).toBe(3);
  await over.getByRole('button', { name: '로비로' }).click();
  await expect(page.getByTestId('wave-best')).toContainText('20');
  await expect(page.getByTestId('lobby-gold')).toContainText('1,500');
  await expect(page.getByTestId('lobby-level')).toHaveText('Lv 3');
  await expect(page.locator('.wave-node.is-ready')).toHaveCount(2);
  // 일일 퀘스트: 1판·15웨이브·소환 50·승급 10 모두 → 받기 4 + 보너스
  await page.locator('[data-action="quests"]').click();
  const q = page.getByTestId('quest-dialog');
  await expect(q).toBeVisible();
  await page.getByTestId('quest-claim-d-play').click();
  await expect(page.getByTestId('grant-dialog').getByTestId('grant-gold')).toHaveText('+200');
  await page.getByTestId('grant-dialog-close').click();
  for (const id of ['d-wave', 'd-summon', 'd-merge']) {
    await page.getByTestId(`quest-claim-${id}`).click();
    await page.getByTestId('grant-dialog-close').click();
  }
  await page.getByTestId('quest-claim-bonus').click();
  await expect(page.getByTestId('grant-dialog').getByTestId('grant-gems')).toHaveText('+20');
  await page.getByTestId('grant-dialog-close').click();
  expect((await progress(page)).daily.claimed).toEqual(['d-merge', 'd-play', 'd-summon', 'd-wave']);
  // 업적 탭: 보스 3마리는 아직 (1/3)
  await page.locator('[data-quest-tab="achievements"]').click();
  await expect(page.getByTestId('quest-claim-a-boss-3')).toHaveText('1/3');
  await page.getByTestId('quest-dialog-close').click();
  // 새로고침해도 같은 판을 두 번 정산하지 않는다 (판 저장은 지워짐)
  await openLobby(page);
  expect((await progress(page)).gold).toBe(after.gold + 200 + 300);
  expect(errors).toEqual([]);
});

test('G-3 e. 리미티드 조각 5개 → [해방] → 다음 판 잠긴 목록에서 빠짐', async ({ page }) => {
  const errors = collectErrors(page);
  await openLobby(page);
  await page.locator('.lobby-nav [data-tab="codex"]').click();
  const rows = page.locator('.codex-row');
  await expect(rows).toHaveCount(12);
  const id = (await rows.nth(1).getAttribute('data-hero'))!;
  await patchProgress(page, `p.heroes[${JSON.stringify(id)}].cards = 5;`);
  await page.locator('.lobby-nav [data-tab="codex"]').click();
  await expect(page.getByTestId('codex-count')).toHaveText('해방 0/12');
  await expect(page.getByTestId(`codex-frag-${id}`)).toHaveText('🧩 5/5');
  await expect(page.locator('.lobby-nav [data-tab="codex"] .lobby-badge')).toHaveText('1');
  await page.waitForTimeout(300);
  await shot(page, 'G3-codex-fragments');
  // 다른 히든은 해방할 수 없다
  const other = (await rows.nth(0).getAttribute('data-hero'))!;
  await expect(page.getByTestId(`codex-unlock-${other}`)).toBeDisabled();
  // 해방 전 판: 12종 모두 잠김
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
  expect(await inScene(page, (s) => s.match.ctx.lockedHidden[0]!.size)).toBe(12);
  await openLobby(page);
  await page.locator('[data-action="new-game"]').waitFor();
  await page.locator('.lobby-nav [data-tab="codex"]').click();
  await page.getByTestId(`codex-unlock-${id}`).click();
  await expect(page.getByTestId('codex-count')).toHaveText('해방 1/12');
  await expect(page.locator(`.codex-row[data-hero="${id}"]`)).toHaveClass(/is-unlocked/);
  expect((await progress(page)).heroes[id]).toEqual({ level: 1, cards: 0 });
  // 영웅 탭 [리미티드]에도 보유로
  await page.locator('.lobby-nav [data-tab="heroes"]').click();
  await page.locator('[data-hero-tab="mythic"]').click();
  await expect(page.getByTestId('hero-grid-owned').locator(`.hero-card[data-hero="${id}"]`)).toHaveCount(1);
  // 다음 판: 잠긴 히든 11종 (해방한 것은 빠짐) — 판 입력이라 이어 하기 저장에도 실린다
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
  const locked = await inScene(page, (s) => [...s.match.ctx.lockedHidden[0]!]);
  expect(locked).toHaveLength(11);
  expect(locked).not.toContain(id);
  expect(errors).toEqual([]);
});

for (const vp of [
  { width: 412, height: 915 },
  { width: 360, height: 800 },
  { width: 320, height: 640 },
]) {
  test(`G-3 f. ${vp.width}×${vp.height}: 아래 메뉴 5칸 한 줄 · 44px 이상 · 가로 넘침 없음`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize(vp);
    await openLobby(page);
    for (const tab of ['battle', 'heroes', 'shop', 'codex', 'locked']) {
      await page.locator(`.lobby-nav [data-tab="${tab}"]`).click();
      const m = await page.evaluate(() => {
        const btns = [...document.querySelectorAll<HTMLElement>('.lobby-nav-btn')];
        const boxes = btns.map((b) => b.getBoundingClientRect());
        const labels = [...document.querySelectorAll<HTMLElement>('.lobby-nav-label')];
        const stage = document.getElementById('stage')!.getBoundingClientRect();
        return {
          n: btns.length,
          tops: new Set(boxes.map((b) => Math.round(b.top))).size,
          minH: Math.min(...boxes.map((b) => b.height)),
          minW: Math.min(...boxes.map((b) => b.width)),
          right: Math.max(...boxes.map((b) => b.right)),
          bottom: Math.max(...boxes.map((b) => b.bottom)),
          labelsFit: labels.every((l) => l.scrollWidth <= l.clientWidth + 1),
          docW: document.documentElement.scrollWidth,
          stageR: stage.right,
          stageB: stage.bottom,
          lobbyOverflow: [...document.querySelectorAll<HTMLElement>('.lobby-screen, .lobby-top, .lobby-panel:not([hidden])')].some((e) => e.scrollWidth > e.clientWidth + 1),
        };
      });
      expect(m.n).toBe(5);
      expect(m.tops).toBe(1);
      expect(m.minH).toBeGreaterThanOrEqual(44);
      expect(m.minW).toBeGreaterThanOrEqual(56);
      expect(m.right).toBeLessThanOrEqual(m.stageR + 0.5);
      expect(m.bottom).toBeLessThanOrEqual(m.stageB + 0.5);
      expect(m.labelsFit).toBe(true);
      expect(m.docW).toBeLessThanOrEqual(vp.width);
      expect(m.lobbyOverflow).toBe(false);
    }
    // 전투 탭: [빠른 시작]이 메뉴 위에 보이고 겹치지 않는다
    await page.locator('.lobby-nav [data-tab="battle"]').click();
    const start = (await page.locator('[data-action="start"]').boundingBox())!;
    const nav = (await page.getByTestId('lobby-nav').boundingBox())!;
    expect(start.y + start.height).toBeLessThanOrEqual(nav.y);
    expect(start.height).toBeGreaterThanOrEqual(44);
    expect(errors).toEqual([]);
  });
}

test('G-3 g. 뒤로 가기: 열린 창 → [전투] 탭 → 처리 안 함(앱 종료)', async ({ page }) => {
  await openLobby(page);
  await page.locator('.lobby-nav [data-tab="heroes"]').click();
  await page.locator('.hero-card[data-hero="miner"]').click();
  await expect(page.getByTestId('hero-detail')).toBeVisible();
  expect(await back(page)).toBe(true);
  await expect(page.getByTestId('hero-detail')).toBeHidden();
  await expect(page.locator('[data-screen="title"]')).toHaveAttribute('data-tab', 'heroes');
  expect(await back(page)).toBe(true);
  await expect(page.locator('[data-screen="title"]')).toHaveAttribute('data-tab', 'battle');
  // 전투 탭의 퀘스트 창도 먼저 닫힌다
  await page.locator('[data-action="quests"]').click();
  await expect(page.getByTestId('quest-dialog')).toBeVisible();
  expect(await back(page)).toBe(true);
  await expect(page.getByTestId('quest-dialog')).toBeHidden();
  expect(await back(page)).toBe(false);
  // 캠페인 탭: 계정 Lv10 전에는 잠김
  await page.locator('.lobby-nav [data-tab="locked"]').click();
  await expect(page.getByTestId('mode-lock-campaign')).toHaveText('계정 Lv 10에 열려요 (지금 Lv 1)');
  expect(await back(page)).toBe(true);
  await expect(page.locator('[data-screen="title"]')).toHaveAttribute('data-tab', 'battle');
});
