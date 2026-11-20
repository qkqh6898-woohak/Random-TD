/**
 * A-1 안드로이드 빌드 통합 (v0.1.8) E2E — Codex 갈래 save·audio·dice-effects 스펙을 우리 화면에 맞춰 옮김:
 * - 자동 저장·이어 하기: 앱 백그라운드(randomtd:native-pause) → 일시정지 + '자동 저장했어요' → 새로고침 → [이어 하기 1단계]
 *   → 돈·타워·강화·배속·단계 그대로, [새 게임]은 확인 창 → 새 판. 망가진 저장은 버려진다. 개발자 판은 따로 표시된다.
 * - 전투 기록·최근 5판: 빈 기록 → 20단계 패배(박쥐 여왕·도전 1 처치) → '새 최고 기록' → [📜 기록]에 최고 20단계·보스·최근 판.
 * - 효과음: 사람 입력 전 AudioContext 없음, 볼륨 기본 40%·5 단위·음소거·미리 듣기·기기 저장, 소환·승급 소리.
 * - 화면 흔들림·소환 연출: 동작 줄이기면 기본 꺼짐·켜면 흔들림·저장, 소환·승급 연출(G-2: 주사위 → 초상 카드·소환문·등급 별), 동작 줄이기·연출 끄기면 카드 없음.
 * - 안드로이드 뒤로 가기: 열린 시트·패널 → 일시정지 ↔ 계속, 타이틀의 [기록] 창 닫기, 타이틀에서는 처리 안 함(앱 종료).
 * 스크린샷 (SAVE_SCREENS=1): docs/screens/A1-title.png · A1-records.png · A1-pause.png · A1-dice.png (412×915, deviceScaleFactor 1).
 */
import { expect, test, type Page } from '@playwright/test';

const SAVE_DOCS = process.env.SAVE_SCREENS === '1';

async function shot(page: Page, name: string): Promise<void> {
  if (SAVE_DOCS) await page.screenshot({ path: `docs/screens/${name}.png`, animations: 'disabled' });
}

interface SceneLike {
  match: {
    tick: number;
    state: { stage: number; gold: number; workers: number; upgrades: number[][]; nextStageTick: number; defeatTick: number; debug: boolean; mode: string };
    rules: { towerOrder: string[]; bossTimeTicks: number };
    world: { enqueue(c: unknown): { ok: boolean }; emit(type: string, data?: unknown): void; setCommandFilter(f: null): void };
    towers(): { tower: string; tx: number; ty: number }[];
    map: { buildable: [number, number][] };
    mobs(): { boss?: boolean }[];
    hash(): number;
    ctx: unknown;
  };
  saveState: { runId: string; saved: boolean; resumed: boolean; lastTick: number };
  summonFxStats: { active: number; shown: number; peak: number; portals: number; silhouettes: number; stars: number };
  sheetOpen: string | null;
  panelOpen: boolean;
  debugFastForward(n: number): number;
  cameras: { main: { on(ev: string, fn: () => void): void } };
  tweens: { pauseAll(): void; resumeAll(): void };
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

async function openTitle(page: Page, query: string): Promise<void> {
  await page.goto(`/${query}`);
  await expect(page.locator('[data-screen="title"]')).toBeVisible();
}

async function waitGame(page: Page): Promise<void> {
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
  await expect.poll(() => inScene(page, (s) => s.saveState.saved, null)).toBe(true);
}

/** 첫 승급 3개: 개발자 명령 없이 판 상태를 잠깐 debug로 바꿔 광부 3개를 놓는다 (Codex 스펙과 같은 방법) */
async function placeThreeMiners(page: Page): Promise<void> {
  await inScene(
    page,
    (s) => {
      const m = s.match;
      const was = m.state.debug;
      m.state.debug = true;
      const t = m.rules.towerOrder.indexOf('miner');
      const used = new Set(m.towers().map((k) => `${k.tx},${k.ty}`));
      // G-1 칸 무더기: 빈 칸 하나에 광부 3개 (3개가 쌓인 칸이 승급한다)
      const free = m.map.buildable.filter(([x, y]) => !used.has(`${x},${y}`)).slice(0, 1);
      for (const [x, y] of [...free, ...free, ...free]) m.world.enqueue({ type: 'debugTower', x, y, t });
      s.debugFastForward(1);
      m.state.debug = was;
    },
    null,
  );
}

test.describe('A-1 자동 저장·이어 하기', () => {
  test('백그라운드 → 자동 저장 → 새로고침 → [이어 하기]로 같은 판(돈·타워·강화·일꾼·배속), [새 게임]은 확인 뒤 새 판', async ({ page }) => {
    test.slow();
    await openTitle(page, '?seed=61');
    // 저장이 없으면 예전 [▶ 시작] 그대로
    await expect(page.locator('[data-action="resume-match"]')).toHaveCount(0);
    await page.getByRole('button', { name: '시작' }).click();
    await waitGame(page);
    await page.getByTestId('hud-summon').click();
    await expect(page.getByTestId('hud-towers')).toHaveText(/^1\//);
    await inScene(page, (s) => s.match.world.enqueue({ type: 'upgrade', k: 0 }), null);
    await inScene(page, (s) => s.match.world.enqueue({ type: 'hireWorker' }), null);
    await page.getByRole('button', { name: '배속' }).click();
    await expect(page.getByRole('button', { name: '배속' })).toHaveText(/2/);
    await page.getByTestId('hud-ready').click();
    await expect(page.getByTestId('hud-stage')).toHaveText('WAVE 1');

    // 앱이 백그라운드로 (안드로이드 GameActivity.onPause → 이 사건)
    await page.evaluate(() => window.dispatchEvent(new Event('randomtd:native-pause')));
    await expect(page.locator('[data-screen="pause"]')).toBeVisible();
    await expect(page.getByTestId('pause-note')).toHaveText('자동 저장했어요 · 로비에서 이어 할 수 있어요');
    const before = await inScene(page, (s) => ({ tick: s.match.tick, gold: s.match.state.gold, workers: s.match.state.workers, up: s.match.state.upgrades[0]![0], towers: s.match.towers().length, hash: s.match.hash(), runId: s.saveState.runId }), null);
    expect(before.up).toBe(1);
    expect(before.workers).toBe(1);
    expect(await page.evaluate(() => (localStorage.getItem('rtd.match') ?? '').startsWith('RTD1 '))).toBe(true);

    await page.reload();
    await expect(page.locator('[data-screen="title"]')).toBeVisible();
    const resume = page.getByRole('button', { name: '이어 하기 1단계' });
    await expect(resume).toBeVisible();
    await shot(page, 'A1-title');
    // [새 게임] → 확인 창 → [취소]
    await page.locator('[data-action="new-game"]').click();
    await expect(page.getByTestId('new-game-dialog')).toBeVisible();
    await expect(page.getByTestId('new-game-dialog')).toContainText('이어 하던 판(1단계)은 지워져요.');
    await page.getByTestId('new-game-cancel').click();
    await expect(page.getByTestId('new-game-dialog')).toBeHidden();

    await resume.click();
    await waitGame(page);
    const after = await inScene(page, (s) => ({ resumed: s.saveState.resumed, runId: s.saveState.runId, gold: s.match.state.gold, workers: s.match.state.workers, up: s.match.state.upgrades[0]![0], towers: s.match.towers().length, tick: s.match.tick }), null);
    expect(after.resumed).toBe(true);
    expect(after.runId).toBe(before.runId);
    expect(after.up).toBe(1);
    expect(after.workers).toBe(1);
    expect(after.towers).toBe(before.towers);
    expect(after.tick).toBeGreaterThanOrEqual(before.tick);
    await expect(page.getByTestId('hud-stage')).toHaveText('WAVE 1');
    await expect(page.getByRole('button', { name: '배속' })).toHaveText(/2/);

    // ⏸ → [타이틀로] → [이어 하기] 그대로 → [새 게임] → [새 게임 시작] → 새 판
    await page.getByRole('button', { name: '일시정지' }).click();
    await page.getByRole('button', { name: '로비로' }).click();
    await expect(page.locator('[data-action="resume-match"]')).toBeVisible();
    await page.locator('[data-action="new-game"]').click();
    await page.getByTestId('new-game-ok').click();
    await waitGame(page);
    await expect(page.getByTestId('hud-stage')).toHaveText('준비');
    await expect(page.getByTestId('hud-gold')).toHaveText('1,000원');
    await expect(page.getByTestId('hud-towers')).toHaveText(/^0\//);
    expect(await inScene(page, (s) => s.saveState.resumed, null)).toBe(false);
  });

  test('망가진 저장은 버리고 [시작], 개발자 판 저장은 개발자 주소에서만 🛠 표시로 보인다', async ({ page }) => {
    await openTitle(page, '?seed=3');
    await page.getByRole('button', { name: '시작' }).click();
    await waitGame(page);
    await page.evaluate(() => {
      const raw = localStorage.getItem('rtd.match')!;
      localStorage.setItem('rtd.match', raw.replace('"gold":', '"gold":1'));
    });
    await openTitle(page, '?seed=3');
    await expect(page.locator('[data-action="resume-match"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '시작' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('rtd.match'))).toBeNull();

    // 개발자 판
    await openTitle(page, '?dev=1&seed=4');
    await page.getByRole('button', { name: '시작' }).click();
    await waitGame(page);
    expect(await page.evaluate(() => localStorage.getItem('rtd.match.dev') !== null && localStorage.getItem('rtd.match') === null)).toBe(true);
    await openTitle(page, '?dev=1');
    await expect(page.getByRole('button', { name: /^이어 하기 .*\(개발자 판\)$/ })).toBeVisible();
    await expect(page.locator('.title-save-dev')).toHaveText('🛠 개발자 판');
    // [새 게임]·[캠페인 1]이 나란히, 둘 다 44px 이상
    for (const sel of ['[data-action="new-game"]', '[data-action="campaign"]']) {
      const b = (await page.locator(sel).boundingBox())!;
      expect(b.height).toBeGreaterThanOrEqual(44);
    }
    // 일반 주소에는 보이지 않는다
    await openTitle(page, '');
    await expect(page.locator('[data-action="resume-match"]')).toHaveCount(0);
  });
});

test('A-1 전투 기록: 빈 기록 → 20단계 패배(박쥐 여왕·도전 1 처치) → 새 최고 기록 → 최근 판 2개', async ({ page }) => {
  test.slow();
  await openTitle(page, '?seed=61');
  const dialog = page.getByTestId('records-dialog');
  await page.getByRole('button', { name: '기록', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('records-best')).toHaveText('기록 없음');
  await expect(dialog.getByText('아직 처치한 보스가 없어요.')).toBeVisible();
  await expect(dialog.getByText('무한 모드에서 판이 끝나면 여기에 표시돼요.')).toBeVisible();
  // 안드로이드 뒤로 가기는 열린 창을 닫는다 (처리됨 = preventDefault)
  const handled = await page.evaluate(() => !window.dispatchEvent(new Event('randomtd:native-back', { cancelable: true })));
  expect(handled).toBe(true);
  await expect(dialog).toBeHidden();
  // 열린 창이 없는 타이틀에서는 처리하지 않는다 (앱이 닫힘)
  expect(await page.evaluate(() => !window.dispatchEvent(new Event('randomtd:native-back', { cancelable: true })))).toBe(false);

  await page.getByRole('button', { name: '시작' }).click();
  await waitGame(page);
  const duration = await page.evaluate(async () => {
    const killPath = '/src/sim/systems/Kill.ts';
    const chalPath = '/src/sim/systems/Challenge.ts';
    const { killMob } = (await import(/* @vite-ignore */ killPath)) as { killMob: (c: unknown, w: unknown, m: unknown, p: number, x: number) => void };
    const { startChallenge } = (await import(/* @vite-ignore */ chalPath)) as { startChallenge: (c: unknown, w: unknown, p: number, lv: number) => unknown };
    const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): SceneLike } } } }).__rtd.game.scene.getScene('Game');
    const m = s.match;
    m.state.stage = 9;
    m.state.nextStageTick = m.tick;
    s.debugFastForward(1);
    killMob(m.ctx, m.world, m.mobs().find((x) => x.boss), 0, 0);
    killMob(m.ctx, m.world, startChallenge(m.ctx, m.world, 0, 1), 0, 0);
    m.state.stage = 19;
    m.state.nextStageTick = m.tick;
    s.debugFastForward(1 + m.rules.bossTimeTicks);
    return Math.floor((m.state.defeatTick + 1) / 20);
  });
  const over = page.locator('[data-screen="gameover"]');
  await expect(over).toBeVisible();
  await expect(over).toContainText('🏆 새 최고 기록');
  // 끝난 판의 자동 저장은 지운다
  expect(await page.evaluate(() => localStorage.getItem('rtd.match'))).toBeNull();
  await over.getByRole('button', { name: '로비로' }).click();
  await page.getByRole('button', { name: '시작' }).click();
  await waitGame(page);
  await inScene(page, (s) => s.debugFastForward(30000), null);
  await expect(over).toBeVisible();
  await expect(over).not.toContainText('새 최고 기록');
  await over.getByRole('button', { name: '로비로' }).click();

  await page.reload();
  await page.getByRole('button', { name: '기록', exact: true }).click();
  await expect(page.getByTestId('records-best')).toHaveText('20단계');
  await expect(dialog.locator('li').filter({ hasText: '박쥐 여왕' })).toContainText('10단계');
  await expect(dialog.locator('li').filter({ hasText: '황금 슬라임' })).toContainText('도전 1');
  const runs = dialog.locator('details');
  await expect(runs).toHaveCount(2);
  await expect(runs.nth(0).locator('summary strong')).not.toHaveText('20단계');
  const earlier = runs.nth(1);
  await expect(earlier.locator('summary strong')).toHaveText('20단계');
  await expect(earlier.locator('time')).toHaveAttribute('datetime', `PT${duration}S`);
  await expect(earlier.getByText('단계 보스 · 박쥐 여왕')).toBeHidden();
  await earlier.locator('summary').click();
  await expect(earlier.getByText('단계 보스 · 박쥐 여왕')).toBeVisible();
  await expect(earlier.getByText('도전 보스 · 황금 슬라임')).toBeVisible();
  // 412px 안, [닫기] 44px
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(412);
  expect((await page.getByTestId('records-close').boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await shot(page, 'A1-records');
  await page.getByTestId('records-close').click();
  await expect(dialog).toBeHidden();
});

test('A-1 효과음: 사람 입력 전 무음, 볼륨 기본 40%·5 단위·음소거·미리 듣기·저장, 소환·승급 소리', async ({ page }) => {
  test.slow();
  await page.addInitScript(() => {
    const w = window as unknown as { audioProbe: { notes: number[]; contexts: number } };
    w.audioProbe = { notes: [], contexts: 0 };
    const Orig = window.AudioContext;
    const osc = Orig.prototype.createOscillator;
    Orig.prototype.createOscillator = function (this: AudioContext) {
      const node = osc.call(this);
      const set = node.frequency.setValueAtTime.bind(node.frequency);
      node.frequency.setValueAtTime = (hz: number, t: number) => {
        w.audioProbe.notes.push(hz);
        return set(hz, t);
      };
      return node;
    };
    window.AudioContext = class extends Orig {
      constructor(opts?: AudioContextOptions) {
        super(opts);
        w.audioProbe.contexts++;
      }
    };
  });
  const probe = () => page.evaluate(() => (window as unknown as { audioProbe: { notes: number[]; contexts: number } }).audioProbe);
  await openTitle(page, '?seed=42');
  expect((await probe()).contexts).toBe(0);
  await page.getByRole('button', { name: '시작' }).click();
  await waitGame(page);
  expect((await probe()).contexts).toBe(1);

  const slider = page.getByTestId('pause-volume');
  const preview = page.getByTestId('pause-volume-preview');
  await page.getByRole('button', { name: '일시정지' }).click();
  await expect(slider).toHaveValue('40');
  await expect(page.getByTestId('pause-volume-value')).toHaveText('40%');
  await slider.focus();
  await slider.press('ArrowRight');
  await expect(slider).toHaveValue('45');
  await expect(page.getByTestId('pause-volume-value')).toHaveText('45%');
  expect(await page.evaluate(() => localStorage.getItem('rtd.effectVolume'))).toBe('45');
  await preview.click();
  await expect.poll(async () => (await probe()).notes).toEqual([392, 523.25, 783.99]);
  await shot(page, 'A1-pause');
  // 412×915에서 메뉴가 화면 안
  const panel = (await page.locator('.pause-panel').boundingBox())!;
  expect(panel.y).toBeGreaterThanOrEqual(0);
  expect(panel.y + panel.height).toBeLessThanOrEqual(915);

  await slider.press('Home');
  await expect(slider).toHaveAttribute('aria-valuetext', '음소거');
  await expect(preview).toBeDisabled();
  await page.getByRole('button', { name: '계속' }).click();
  await page.getByTestId('hud-summon').click();
  await expect(page.getByTestId('hud-towers')).toHaveText(/^1\//);
  expect((await probe()).notes).toHaveLength(3);

  await page.getByRole('button', { name: '일시정지' }).click();
  await slider.press('End');
  await slider.press('ArrowLeft');
  await expect(slider).toHaveValue('95');
  await page.reload();
  await page.getByRole('button', { name: /^이어 하기/ }).click();
  await waitGame(page);
  await page.getByRole('button', { name: '일시정지' }).click();
  await expect(slider).toHaveValue('95');
  await page.getByRole('button', { name: '계속' }).click();
  await page.getByTestId('hud-summon').click();
  await expect(page.getByTestId('hud-towers')).toHaveText(/^2\//);
  await expect.poll(async () => (await probe()).notes).toEqual([300, 523.25]);

  await placeThreeMiners(page);
  const n = (await probe()).notes.length;
  await page.getByTestId('hud-merge-all').click(); // 피드백 #65: 승급 버튼은 [⏫ 모두 승급] 하나
  await expect.poll(async () => (await probe()).notes.slice(n)).toEqual([392, 523.25, 783.99]);
});

test.describe('A-1 화면 흔들림·소환 연출', () => {
  test('동작 줄이기면 흔들림 기본 꺼짐·초상 카드 없음, 켜면 흔들고 기기에 저장', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openTitle(page, '?seed=42');
    await page.getByRole('button', { name: '시작' }).click();
    await waitGame(page);
    const sw = page.getByTestId('pause-screen-shake');
    await page.getByRole('button', { name: '일시정지' }).click();
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    await sw.click();
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    expect(await page.evaluate(() => localStorage.getItem('rtd.screenShake'))).toBe('on');
    await page.getByRole('button', { name: '계속' }).click();
    await page.evaluate(() => {
      const w = window as unknown as { shakes: number; __rtd: { game: { scene: { getScene(k: string): SceneLike } } } };
      w.shakes = 0;
      w.__rtd.game.scene.getScene('Game').cameras.main.on('camerashakestart', () => w.shakes++);
    });
    const shakes = () => page.evaluate(() => (window as unknown as { shakes: number }).shakes);
    await inScene(page, (s) => s.match.world.emit('quake'), null);
    await expect.poll(shakes).toBe(1);
    // 동작 줄이기: 소환해도 초상 카드 없음 (빛 기둥만)
    await page.getByTestId('hud-summon').click();
    await expect(page.getByTestId('hud-towers')).toHaveText(/^1\//);
    await page.waitForTimeout(300);
    expect((await inScene(page, (s) => s.summonFxStats, null)).shown).toBe(0);

    await page.getByRole('button', { name: '일시정지' }).click();
    await sw.click();
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.reload();
    await page.getByRole('button', { name: /^이어 하기/ }).click();
    await waitGame(page);
    await page.getByRole('button', { name: '일시정지' }).click();
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    await page.getByRole('button', { name: '계속' }).click();
    await page.evaluate(() => {
      const w = window as unknown as { shakes: number; __rtd: { game: { scene: { getScene(k: string): SceneLike } } } };
      w.shakes = 0;
      w.__rtd.game.scene.getScene('Game').cameras.main.on('camerashakestart', () => w.shakes++);
    });
    const tick = await inScene(page, (s) => s.match.tick, null);
    await inScene(page, (s) => s.match.world.emit('quake'), null);
    await expect.poll(() => inScene(page, (s) => s.match.tick, null)).toBeGreaterThan(tick + 2);
    expect(await shakes()).toBe(0);
  });

  test('소환·승급 초상 카드 (동시 12개까지, 주사위 없음), 안드로이드 뒤로 가기: 시트 닫기 → 일시정지 → 계속', async ({ page }) => {
    test.slow();
    await openTitle(page, '?seed=42');
    await page.getByRole('button', { name: '시작' }).click();
    await waitGame(page);
    await page.evaluate(() => {
      const w = window as unknown as { diceSeen: string[]; dieTex: number; __rtd: { game: { scene: { getScene(k: string): { events: { on(e: string, f: () => void): void }; children: { list: { name: string; texture?: { key: string } }[] } } } } } };
      const s = w.__rtd.game.scene.getScene('Game');
      w.diceSeen = [];
      w.dieTex = 0;
      // G-2: 소환·승급 연출 이름 (초상 카드·소환문·실루엣·빛 구슬) + 주사위 텍스처(fx-dice-*)를 쓰는 물체가 없는지 (이 판엔 도박꾼 없음)
      s.events.on('postupdate', () => {
        for (const c of s.children.list) {
          if (/^(summon|merge)-/.test(c.name) && !w.diceSeen.includes(c.name)) w.diceSeen.push(c.name);
          if (c.texture?.key.startsWith('fx-dice-')) w.dieTex++;
        }
      });
    });
    const seen = () => page.evaluate(() => (window as unknown as { diceSeen: string[] }).diceSeen);
    await page.getByTestId('hud-summon').click();
    await expect.poll(seen).toContain('summon-card');
    // 초상 카드가 떠 있는 순간 (트윈을 잠깐 멈추고 찍음)
    await page.getByTestId('hud-summon').click();
    await expect.poll(() => inScene(page, (s) => s.summonFxStats.active, null)).toBeGreaterThan(0);
    await inScene(page, (s) => s.tweens.pauseAll(), null);
    await shot(page, 'A1-dice');
    await inScene(page, (s) => s.tweens.resumeAll(), null);

    await placeThreeMiners(page);
    await page.getByTestId('hud-merge-all').click(); // 피드백 #65: 승급 버튼은 [⏫ 모두 승급] 하나
    await expect.poll(seen).toEqual(expect.arrayContaining(['summon-card', 'summon-portal', 'merge-material-orb', 'merge-card', 'merge-star']));
    expect(await page.evaluate(() => (window as unknown as { dieTex: number }).dieTex)).toBe(0);
    // 한도: 한 프레임에 소환 20번이어도 동시에 떠 있는 초상 카드는 12개까지 (A-1 주사위 한도 그대로)
    const queued = await inScene(
      page,
      (s) => {
        const m = s.match;
        m.state.gold += 100000;
        const used = new Set(m.towers().map((k) => `${k.tx},${k.ty}`));
        // G-1 마당 맵(24칸): 남은 빈 칸 모두 (12칸 이상)
        const free = m.map.buildable.filter(([x, y]) => !used.has(`${x},${y}`));
        // 예전 칸 지정 summon(리플레이용)은 일반 판에서 거절된다 (V2 L2) — 이 연출 시험에서만 거절 필터를 끈다
        m.world.setCommandFilter(null);
        for (const [x, y] of free) m.world.enqueue({ type: 'summon', x, y });
        return { free: free.length, pads: m.map.buildable.length };
      },
      null,
    );
    expect(queued.free).toBeGreaterThanOrEqual(12);
    // 예전 칸 지정 summon 명령(리플레이용)은 인원 한도를 보지 않아 모든 칸이 찬다
    await expect(page.getByTestId('hud-towers')).toHaveText(new RegExp(`^${queued.pads}/`));
    expect((await inScene(page, (s) => s.summonFxStats, null)).peak).toBe(12);

    // 뒤로 가기: 열린 타워 패널 → 닫힘, 강화 시트 → 닫힘, 그다음 일시정지 → 계속
    // (피드백 #65: [⏫ 모두 승급]은 패널을 열지 않는다 → 타워 하나를 골라 패널을 연다)
    const back = () => page.evaluate(() => !window.dispatchEvent(new Event('randomtd:native-back', { cancelable: true })));
    await inScene(
      page,
      (s) => {
        const g = s as unknown as { selectTower(id: number): void; match: { towers(): { id: number }[] } };
        g.selectTower(g.match.towers()[0]!.id);
        return null;
      },
      null,
    );
    await expect.poll(() => inScene(page, (s) => s.panelOpen, null)).toBe(true);
    expect(await back()).toBe(true);
    await expect.poll(() => inScene(page, (s) => s.panelOpen, null)).toBe(false);
    await expect(page.locator('[data-screen="pause"]')).toHaveCount(0);
    await page.getByTestId('menu-upgrade').click();
    await expect.poll(() => inScene(page, (s) => s.sheetOpen, null)).toBe('upgrade');
    expect(await back()).toBe(true);
    await expect.poll(() => inScene(page, (s) => s.sheetOpen, null)).toBeNull();
    await expect(page.locator('[data-screen="pause"]')).toHaveCount(0);
    expect(await back()).toBe(true);
    await expect(page.locator('[data-screen="pause"]')).toBeVisible();
    expect(await back()).toBe(true);
    await expect(page.locator('[data-screen="pause"]')).toHaveCount(0);
  });

  test('?dev=1 연출 끄기면 초상 카드도 없다', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('rtd.settings', JSON.stringify({ v: 2, tapMerge: true, effectsOff: true, revealHidden: false })));
    await openTitle(page, '?dev=1&seed=42');
    await page.getByRole('button', { name: '시작' }).click();
    await waitGame(page);
    await page.getByTestId('hud-summon').click();
    await expect(page.getByTestId('hud-towers')).toHaveText(/^1\//);
    await page.waitForTimeout(300);
    expect((await inScene(page, (s) => s.summonFxStats, null)).shown).toBe(0);
  });
});

test.describe('A-1b 뒤로 가기: 장면 넘어가는 중·첫 승급 안내', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('[시작] 직후(타이틀 → 전투 넘어가는 중) 뒤로 가기는 삼키고, 첫 승급 안내 카드는 일시정지보다 먼저 닫힌다', async ({ page }) => {
    test.slow();
    await openTitle(page, '?seed=42');
    const back = () => page.evaluate(() => !window.dispatchEvent(new Event('randomtd:native-back', { cancelable: true })));
    // 누르자마자 (Game 장면이 처리기를 걸기 전일 수 있음) — 처리됨 = 앱이 닫히지 않음
    await page.getByRole('button', { name: '시작' }).click();
    expect(await back()).toBe(true);
    await waitGame(page);
    // 일시정지가 열렸다면 닫고 진행
    if (await page.locator('[data-screen="pause"]').isVisible()) await page.getByRole('button', { name: '계속' }).click();
    await placeThreeMiners(page);
    await expect(page.getByTestId('guide-card')).toBeVisible();
    expect(await back()).toBe(true);
    await expect(page.getByTestId('guide-card')).toBeHidden();
    await expect(page.locator('[data-screen="pause"]')).toHaveCount(0);
    expect(await page.evaluate(() => (JSON.parse(localStorage.getItem('rtd.account') ?? '{}') as { guides?: string[] }).guides)).toEqual(['firstMerge']);
    // 닫을 것이 없으면 일시정지
    expect(await back()).toBe(true);
    await expect(page.locator('[data-screen="pause"]')).toBeVisible();
  });
});
