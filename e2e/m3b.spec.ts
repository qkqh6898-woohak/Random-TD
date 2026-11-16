/**
 * M3b E2E: 상태 이상 표시(색·머리 위 아이콘 = sim 상태), 진흙 웅덩이·소환 병사(화면 수 = sim 수, 병사는 경로를 거슬러 걷는다),
 * 오라(대장장이를 고르면 3×3 범위·효과 받는 타워, 옆 궁수 패널 공격력 초록 11 (10)), 특색 연출(연금 돈·운석·시간 정지·주사위),
 * M3b 스크린샷. 특색 타워는 개발용 debugTower 명령(?debug=1)으로 놓는다. sim은 window.__rtd로 읽기만 한다.
 */
import { expect, test, type Page } from '@playwright/test';
import { clickStart } from './title';
import { mkdirSync } from 'node:fs';

const SAVE_DOCS = process.env.SAVE_SCREENS === '1';

interface MobLite {
  id: number;
  progress: number;
  slowBp: number;
  freezeUntil: number;
  stopUntil: number;
  stunUntil: number;
  dots: { kind: string; until: number }[];
}

type SceneLike = {
  match: {
    tick: number;
    state: { stage: number; gold: number };
    mobs(): MobLite[];
    towers(): { id: number; tx: number; ty: number; tower: string }[];
    puddles(): { id: number }[];
    soldiers(): { id: number; progress: number }[];
    rules: { towerOrder: string[] };
    world: { enqueue(c: unknown): { ok: boolean }; entities: { remove(id: number): void } };
    map: { buildable: [number, number][] };
  };
  mapLayout: { originX: number; originY: number; tile: number };
  renderedPuddleCount: number;
  renderedSoldierCount: number;
  statusIconCount: number;
  tintedMobCount: number;
  selectedTowerId: number | null;
  selectedAura: { area: string; radius: number; buffed: number } | null;
  passiveAuras: { tx: number; ty: number; radius: number }[];
  floatingLabels: string[];
  abilityFxCount(kind: string): number;
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

/** Game 장면에서 함수 실행 (함수는 문자열로 넘어가 페이지 안에서 돈다). */
async function inScene<T, A>(page: Page, fn: (s: SceneLike, arg: A) => T, arg: A): Promise<T> {
  return page.evaluate(
    ([src, a]) => {
      const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game');
      return new Function('s', 'a', `return (${src})(s, a);`)(s, a) as T;
    },
    [fn.toString(), arg] as const,
  );
}

/** 개발용 명령으로 타워 놓기 [x, y, 타워 id]. 다음 틱에 놓인다. */
async function place(page: Page, list: [number, number, string][]): Promise<void> {
  const ok = await inScene(
    page,
    (s, l) => l.every(([x, y, id]) => s.match.world.enqueue({ type: 'debugTower', x, y, t: s.match.rules.towerOrder.indexOf(id) }).ok),
    list,
  );
  expect(ok).toBe(true);
  await expect.poll(() => inScene(page, (s) => s.match.towers().length, null)).toBeGreaterThanOrEqual(list.length);
}

async function fastForwardTo(page: Page, tick: number): Promise<void> {
  await inScene(page, (s, t) => s.debugFastForward(Math.max(0, t - s.match.tick)), tick);
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
  await page.mouse.click(p.x, p.y);
}

async function shot(page: Page, name: string, docsName?: string): Promise<void> {
  mkdirSync('test-results/screens', { recursive: true });
  await page.screenshot({ path: `test-results/screens/${name}.png`, animations: 'disabled' });
  if (SAVE_DOCS && docsName) {
    mkdirSync('docs/screens', { recursive: true });
    await page.screenshot({ path: `docs/screens/${docsName}.png`, animations: 'disabled' });
  }
}

test('상태 이상 표시: 얼음·진흙·화염 타워가 맞힌 몹에 색·머리 위 아이콘이 생기고, 멈추면 화면 색 = sim 상태', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  await place(page, [
    [2, 3, 'icemage'],
    [1, 3, 'mudshaman'],
    [5, 3, 'flamemage'],
  ]);
  await fastForwardTo(page, 1200 + 400);
  await expect.poll(() => inScene(page, (s) => s.statusIconCount, null), { timeout: 15_000 }).toBeGreaterThan(0);
  await expect.poll(() => inScene(page, (s) => s.tintedMobCount, null), { timeout: 15_000 }).toBeGreaterThan(0);
  await page.getByRole('button', { name: '일시정지' }).click();
  await page.waitForTimeout(150);
  const v = await inScene(
    page,
    (s) => {
      // 화면에 색이 칠해져야 하는 sim 몹 = 빙결·정지·기절·화상·독·둔화 (표식·약화·출혈만이면 아이콘만)
      const t = s.match.tick;
      const sim = s.match
        .mobs()
        .filter((m) => t < m.freezeUntil || t < m.stopUntil || t < m.stunUntil || m.slowBp > 0 || m.dots.some((d) => d.until > t && (d.kind === 'burn' || d.kind === 'poison')))
        .length;
      return { sim, tinted: s.tintedMobCount, icons: s.statusIconCount };
    },
    null,
  );
  expect(v.tinted).toBe(v.sim);
  expect(v.icons).toBeGreaterThanOrEqual(v.tinted);
  expect(errors).toEqual([]);
});

test('진흙 웅덩이·소환 병사: 화면 수 = sim 수, 병사는 경로를 거슬러 걷는다 (진행도 감소)', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  // 진흙 주술사는 몹이 처음 지나는 윗줄 옆(사거리 3 안에 등장 칸), 소환사는 고리 아래쪽 — 병사가 몹을 등장 칸에서 다 잡아
  // 주술사 사거리에 몹이 들어오지 않던 것 (T-3 작은 맵)
  await place(page, [
    [2, 3, 'mudshaman'],
    [5, 7, 'summoner'],
  ]);
  await fastForwardTo(page, 1200 + 150);
  await expect.poll(() => inScene(page, (s) => s.match.soldiers().length, null), { timeout: 15_000 }).toBeGreaterThan(0);
  const p0 = await inScene(page, (s) => s.match.soldiers().map((x) => ({ id: x.id, p: x.progress })), null);
  await page.waitForTimeout(500);
  const p1 = await inScene(page, (s) => s.match.soldiers().map((x) => ({ id: x.id, p: x.progress })), null);
  const same = p1.find((x) => p0.some((y) => y.id === x.id));
  if (same) expect(same.p).toBeLessThan(p0.find((y) => y.id === same.id)!.p);
  await expect.poll(() => inScene(page, (s) => s.match.puddles().length, null), { timeout: 20_000 }).toBeGreaterThan(0);
  await page.getByRole('button', { name: '일시정지' }).click();
  await page.waitForTimeout(150);
  const v = await inScene(
    page,
    (s) => ({ puddles: s.match.puddles().length, drawnPuddles: s.renderedPuddleCount, soldiers: s.match.soldiers().length, drawnSoldiers: s.renderedSoldierCount }),
    null,
  );
  expect(v.drawnPuddles).toBe(v.puddles);
  expect(v.drawnSoldiers).toBe(v.soldiers);
  expect(errors).toEqual([]);
});

test('오라: 대장장이를 고르면 3×3 범위와 효과 받는 타워, 옆 궁수 패널 공격력은 초록 11 (기본 10)', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  // 순환의 정원 v2: 대장장이 (4,4)의 주변 8칸 안 배치 칸 = (4,3)·(5,3)·(5,4)
  await place(page, [
    [4, 4, 'blacksmith'],
    [4, 3, 'archer'],
    [5, 4, 'apprentice'],
    [1, 7, 'warrior'],
  ]);
  await tapTile(page, 4, 3);
  const panel = page.getByTestId('tower-panel');
  await expect(panel).toBeVisible();
  const atk = panel.locator('.tp-stat.is-buffed').filter({ hasText: '물리' });
  await expect(atk.locator('.tp-value')).toHaveText('11');
  await expect(atk.locator('.tp-base')).toHaveText('(10)');
  await tapTile(page, 4, 3); // 닫기
  await tapTile(page, 4, 4);
  await expect.poll(() => inScene(page, (s) => s.selectedAura, null)).toEqual({ area: 'around8', radius: 1, buffed: 2 });
  await expect(panel.getByTestId('tp-ability')).toContainText('주변 8칸');
  expect(errors).toEqual([]);
});

test('평소 오라 빛: 고르지 않아도 대장장이(3×3)·학자(자기 칸)가 옅게 빛나고, 고르면 진한 범위 표시로 바뀐다 (ART.md 2.4, 검토 반영)', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  await place(page, [
    [4, 4, 'blacksmith'],
    [2, 6, 'scholar'],
    [1, 9, 'archer'],
  ]);
  await expect
    .poll(() => inScene(page, (s) => s.passiveAuras, null))
    .toEqual([
      { tx: 4, ty: 4, radius: 1 },
      { tx: 2, ty: 6, radius: 0 },
    ]);
  await tapTile(page, 4, 4);
  await expect.poll(() => inScene(page, (s) => s.selectedAura, null)).toEqual({ area: 'around8', radius: 1, buffed: 0 });
  await expect.poll(() => inScene(page, (s) => s.passiveAuras, null)).toEqual([{ tx: 2, ty: 6, radius: 0 }]);
  expect(errors).toEqual([]);
});

test('정보 패널: 맵 가운데 줄(4·6·7줄) 타워를 골라도 특색 줄이 보인다 — 보유·대상·관통 줄을 먼저 접는다 (검토 반영)', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  // 순환의 정원 v2(7×11): 가운데 5줄은 빈 땅 → 그 위아래 배치 칸 줄
  const cells = await inScene(page, (s) => [4, 6, 7].map((y) => s.match.map.buildable.find(([, yy]) => yy === y)!), null);
  for (const id of ['scholar', 'archmage']) {
    for (const [x, y] of cells) {
      await inScene(
        page,
        (s) => {
          for (const t of s.match.towers()) s.match.world.entities.remove(t.id);
          return null;
        },
        null,
      );
      await place(page, [[x, y, id]]);
      await tapTile(page, x, y);
      const panel = page.getByTestId('tower-panel');
      await expect(panel).toBeVisible();
      await page.waitForTimeout(250); // 등장 애니메이션 뒤 자리·접기 단계가 정해진다
      const ability = panel.getByTestId('tp-ability');
      await expect(ability, `${id} ${y}줄 (접기 ${await panel.getAttribute('data-density')})`).toBeVisible();
      // 이 두 타워의 특색은 한 줄도 잘리지 않는다 (줄임표 없이 전부)
      const clipped = await ability.evaluate((el) => {
        const t = el.querySelector('span:last-child') as HTMLElement;
        return t.scrollHeight > t.clientHeight + 1;
      });
      expect(clipped, `${id} ${y}줄`).toBe(false);
      await page.locator('[data-action="panel-close"]').click();
      await expect(panel).toHaveCount(0);
    }
  }
  expect(errors).toEqual([]);
});

test('특색 연출: 연금술사 10초 +20원, 운석·시간 정지·주사위 연출이 뜬다', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  await place(page, [
    [5, 0, 'alchemist'],
    [5, 9, 'archmage'],
    [1, 9, 'chronomancer'],
    [1, 1, 'gambler'],
  ]);
  // 몹이 나오기 직전으로 → 첫 몹이 나오자마자 운석·시간 정지 (주기는 이미 찼다)
  await fastForwardTo(page, 1190);
  const gold0 = await inScene(page, (s) => s.match.state.gold, null);
  await page.getByRole('button', { name: '배속' }).click(); // ×2
  await expect.poll(() => inScene(page, (s) => s.abilityFxCount('meteor'), null), { timeout: 10_000 }).toBeGreaterThan(0);
  await expect.poll(() => inScene(page, (s) => s.abilityFxCount('timeStop'), null), { timeout: 10_000 }).toBeGreaterThan(0);
  await expect.poll(() => inScene(page, (s) => s.abilityFxCount('dice'), null), { timeout: 15_000 }).toBeGreaterThan(0);
  await expect.poll(() => inScene(page, (s) => s.abilityFxCount('gold'), null), { timeout: 15_000 }).toBeGreaterThan(0);
  expect(await inScene(page, (s) => s.match.state.gold, null)).toBeGreaterThan(gold0);
  expect(errors).toEqual([]);
});

test('M3b 스크린샷: 상태 이상 아이콘·진흙 웅덩이·소환 병사·대장장이 오라 범위', async ({ page }) => {
  test.slow(); // 긴 흐름 + 스크린샷 → 기본 제한의 3배
  const errors = collectErrors(page);
  await start(page, '?debug=1&seed=7');
  // 화력이 약한 조합 → 몹이 오래 살아 상태 이상이 여러 마리에 보인다
  // 패널이 아래 절반을 덮으므로 특색 타워는 위쪽 경로(몹이 처음 지나는 줄) 둘레에
  await place(page, [
    [1, 3, 'mudshaman'],
    [4, 1, 'icemage'],
    [5, 3, 'mudshaman'],
    [5, 1, 'summoner'],
    [2, 4, 'blacksmith'],
    [1, 4, 'archer'],
    [2, 3, 'warrior'],
  ]);
  // 15단계까지 건너뛴 뒤(M4: 10단계 보스를 이 약한 조합으로는 못 잡아 제한 시간 패배 → debug 건너뛰기는 보스를 지운다) 400틱:
  // 몹이 단단해 상태 이상이 오래 보인다
  await inScene(
    page,
    (s, n) => {
      for (let i = 0; i < n; i++) s.match.world.enqueue({ type: 'debugSkipStage', tick: s.match.tick + i });
    },
    15,
  );
  await inScene(page, (s) => s.debugFastForward(15 + 400), null);
  expect(await inScene(page, (s) => s.match.state.stage, null)).toBe(15);
  await expect.poll(() => inScene(page, (s) => s.statusIconCount, null), { timeout: 15_000 }).toBeGreaterThan(1);
  await expect.poll(() => inScene(page, (s) => s.renderedPuddleCount + s.renderedSoldierCount, null), { timeout: 20_000 }).toBeGreaterThan(1);
  await tapTile(page, 2, 4);
  await expect(page.getByTestId('tower-panel')).toBeVisible();
  await expect.poll(() => inScene(page, (s) => s.selectedAura?.buffed ?? 0, null)).toBeGreaterThan(0);
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 5000 });
  // 위쪽 경로(진행도 0~6000 = 순환의 정원 v2 고리 윗줄, 패널에 가리지 않는 줄)에 얼어 있는 몹·병사와 웅덩이가 같이 있는 순간에 장면을 멈추고 찍는다
  // (빙결은 0.5초라 50ms마다 본다. Phaser 장면만 멈추므로 일시정지 메뉴는 뜨지 않는다)
  await page.waitForFunction(
    () => {
      const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game') as {
        match: { tick: number; mobs(): { freezeUntil: number; progress: number }[]; puddles(): unknown[]; soldiers(): { progress: number }[] };
        scene: { pause(): void };
      };
      const t = s.match.tick;
      const top = (p: number): boolean => ((p % 24000) + 24000) % 24000 < 6000;
      const ok =
        s.match.mobs().some((m) => t + 3 < m.freezeUntil && top(m.progress)) &&
        s.match.soldiers().some((x) => top(x.progress)) &&
        s.match.puddles().length > 0;
      if (ok) s.scene.pause();
      return ok;
    },
    null,
    { polling: 50, timeout: 60_000 },
  );
  await page.waitForTimeout(100);
  await shot(page, 'M3b-abilities', 'M3b');
  await inScene(
    page,
    (s) => {
      (s as unknown as { scene: { resume(): void } }).scene.resume(); // 돌려주는 값(ScenePlugin)을 버린다 — 직렬화하면 페이지가 10초쯤 멈춘다
    },
    null,
  );
  expect(errors).toEqual([]);
});
