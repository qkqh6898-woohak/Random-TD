/**
 * G 통합 E2E (휴대폰 412×915): G-1 게임 시스템 · G-2 금테 테마 · G-3 로비 · 통통한 캐주얼 WebP 그림이 한 판에서 같이 동작하는지.
 * - 로비: 금테 테마 + 영웅 초상이 WebP.
 * - 전투: 마당 맵 무더기(1·2·3개) + [리미티드][소환][도박]/[강화] 묶음에 금테 테마가 입혀짐.
 * - [리미티드] 도감: 새 계정(리미티드 모두 잠김)에서 판 ctx.lockedHidden이 차 있고 잠긴 줄에 '🔒 해방 필요 (조각 n/5)', [제작] 꺼짐 (해방 조각 수는 피드백 #59로 20 → 5).
 * - 보스: 10단계 보스가 바깥 그림(ext-char-enemy-*) 텍스처.
 * SAVE_SCREENS=1이면 docs/screens/GI-lobby.png · GI-battle.png · GI-codex.png · GI-boss.png.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { clickStart } from './title';

const SAVE_DOCS = process.env.SAVE_SCREENS === '1';
test.describe.configure({ timeout: 150_000 });

type SceneLike = {
  match: {
    state: { stage: number; bossId: string };
    ctx: { lockedHidden: Set<string>[] };
    map: { buildable: [number, number][] };
    towers(): { id: number; tx: number; ty: number; tower: string }[];
    mobs(): { boss: boolean; mob: string; challenge: number }[];
    rules: { towerOrder: string[] };
    world: { enqueue(c: unknown): { ok: boolean } };
  };
  ctx: { progress?: { state: { heroes: Record<string, { level: number; cards: number }> } } };
  children: { list: { texture?: { key: string }; visible: boolean; type: string }[] };
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

async function inScene<R, A>(page: Page, fn: (s: SceneLike, arg: A) => R, arg: A): Promise<R> {
  return page.evaluate(
    ([src, a]) => {
      const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game');
      return new Function('s', 'a', `return (${src})(s, a);`)(s, a) as R;
    },
    [fn.toString(), arg] as const,
  );
}

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync('test-results/screens', { recursive: true });
  await page.screenshot({ path: `test-results/screens/${name}.png`, animations: 'disabled' });
  if (SAVE_DOCS) await page.screenshot({ path: `docs/screens/${name}.png`, animations: 'disabled' });
}

async function start(page: Page, query: string): Promise<void> {
  await page.goto(`/${query}`);
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
}

test('로비: 금테 테마 · 영웅 초상이 바깥 그림(WebP)', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=42');
  await expect(page.locator('[data-screen="title"][data-lobby="1"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dataset.theme ?? document.body.dataset.theme)).toBe('gilded');
  await page.waitForTimeout(400);
  await shot(page, 'GI-lobby');
  await page.locator('.lobby-nav [data-tab="heroes"]').click();
  const img = page.locator('.hero-portrait').first();
  await expect(img).toBeVisible();
  expect(await img.getAttribute('src')).toMatch(/assets\/characters\/[a-z0-9_]+\.webp$/);
  expect(errors).toEqual([]);
});

test('전투: 마당 맵 무더기 1·2·3개 + V2 아래 묶음 [리미티드][소환][도박]/[강화]', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, '?dev=1&seed=42');
  const pads = await inScene(page, (s) => s.match.map.buildable, null);
  await inScene(
    page,
    (s, p) => {
      const put = (i: number, id: string, n: number): void => {
        for (let k = 0; k < n; k++) s.match.world.enqueue({ type: 'debugTower', x: p[i]![0], y: p[i]![1], t: s.match.rules.towerOrder.indexOf(id) });
      };
      put(0, 'miner', 3);
      put(1, 'archer', 2);
      put(2, 'apprentice', 1);
      put(5, 'warrior', 3);
      put(7, 'goblin', 2);
      put(9, 'merchant', 1);
      put(13, 'spearman', 3);
      s.debugFastForward(1);
      return null;
    },
    pads,
  );
  const per = await inScene(
    page,
    (s) => {
      const m = new Map<string, number>();
      for (const t of s.match.towers()) m.set(`${t.tx},${t.ty}`, (m.get(`${t.tx},${t.ty}`) ?? 0) + 1);
      return [...m.values()].sort();
    },
    null,
  );
  expect(per).toEqual([1, 1, 2, 2, 3, 3, 3]);
  for (const id of ['menu-mythic', 'hud-summon', 'menu-gamble', 'menu-upgrade']) await expect(page.getByTestId(id)).toBeVisible();
  // PR-G: flat navy limited button with a dark brown outline. Existing stack/input checks stay intact.
  const bg = await page.getByTestId('menu-mythic').evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(bg).toBe('none');
  expect(await page.getByTestId('menu-mythic').evaluate(el => ({ bg:getComputedStyle(el).backgroundColor, line:getComputedStyle(el).borderTopColor }))).toEqual({ bg:'rgb(40, 48, 81)', line:'rgb(59, 35, 20)' });
  await page.waitForTimeout(600);
  await shot(page, 'GI-battle');
  expect(errors).toEqual([]);
});

test('[리미티드] 도감: 새 계정은 리미티드가 잠겨 판에 들어가고, 잠긴 줄에 조각 n/5 · [제작] 꺼짐', async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(() => {
    if (sessionStorage.getItem('gi-seeded')) return;
    sessionStorage.setItem('gi-seeded', '1');
    localStorage.setItem('rtd.account', JSON.stringify({ v: 1, level: 1, hidden: [], guides: ['firstMerge'], codex: { goldking: { found: true }, festival: { found: true } } }));
  });
  await start(page, '?seed=42');
  const locked = await inScene(page, (s) => [...(s.match.ctx.lockedHidden[0] ?? [])], null);
  expect(locked).toHaveLength(12);
  expect(locked).toContain('goldking');
  // 계정 조각: 황금 왕 3개 (로비 상점·보상으로 모은 것처럼 — 해방에 5개, 피드백 #59)
  await inScene(
    page,
    (s) => {
      s.ctx.progress!.state.heroes.goldking = { level: 0, cards: 3 };
      return null;
    },
    null,
  );
  await page.getByTestId('menu-mythic').click();
  await expect(page.getByTestId('sheet-mythic')).toBeVisible();
  const row = page.getByTestId('mythic-row-goldking');
  await expect(row).toHaveClass(/is-locked/);
  await expect(row.locator('.my-note')).toHaveText('🔒 해방 필요 (조각 3/5)');
  await expect(page.getByTestId('mythic-craft-goldking')).toBeDisabled();
  await expect(page.getByTestId('mythic-row-festival').locator('.my-note')).toHaveText('🔒 해방 필요 (조각 0/5)');
  await page.waitForTimeout(300);
  await shot(page, 'GI-codex');
  expect(errors).toEqual([]);
});

test('보스: 10단계 보스가 바깥 그림(WebP) 텍스처로 그려진다', async ({ page }) => {
  test.slow();
  const errors = collectErrors(page);
  await start(page, '?dev=1&seed=42');
  await inScene(
    page,
    (s) => {
      while (s.match.state.stage < 10) {
        s.match.world.enqueue({ type: 'debugSkipStage' });
        s.debugFastForward(1);
      }
      const st = s.match.state as unknown as { cardOffers: { stage?: number }[] };
      st.cardOffers.filter((o) => o.stage !== undefined).forEach(() => s.match.world.enqueue({ type: 'pickCard', i: 0 }));
      s.debugFastForward(60);
      return null;
    },
    null,
  );
  const boss = await inScene(page, (s) => s.match.mobs().find((m) => m.boss && !m.challenge)?.mob ?? null, null);
  expect(boss).not.toBeNull();
  await expect
    .poll(() =>
      inScene(
        page,
        (s, id) => {
          type Obj = { texture?: { key: string }; list?: Obj[] };
          const walk = (l: Obj[]): boolean => l.some((c) => c.texture?.key === `ext-char-enemy-${id}` || (c.list ? walk(c.list) : false));
          return walk(s.children.list as Obj[]);
        },
        boss,
      ),
    )
    .toBe(true);
  await page.waitForTimeout(500);
  await shot(page, 'GI-boss');
  expect(errors).toEqual([]);
});
