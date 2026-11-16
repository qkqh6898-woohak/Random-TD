/**
 * HF-2 E2E: 힉스필드 그림 — 타이틀 그림, 전투 배경(⏭로 11단계가 되면 노을 밴드로), 10단계 보스 컷인(나타났다 2.5초 안에 사라짐),
 * 캐릭터별 크기(타워 65종), 정보 패널의 캐릭터 설명 두 문장과 캐릭터 카드(열기·✕·바깥·Esc).
 * SAVE_SCREENS=1(npm run screens)이면 docs/screens/T2-art-*.png 저장. sim은 window.__rtd로 읽기만 하고 버튼은 화면에서 누른다.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SAVE_DOCS = process.env.SAVE_SCREENS === '1';

test.describe.configure({ timeout: 150_000 });

type SceneLike = {
  match: {
    state: { stage: number };
    map: { buildable: [number, number][] };
    rules: { towerOrder: string[] };
    world: { enqueue(c: unknown): { ok: boolean } };
    towers(): { id: number; tower: string }[];
  };
  backgroundKey: string | null;
  cutinStats: { played: number; showing: boolean; preloaded: number };
  debugFastForward(n: number): number;
  towerLayer: { artScaleOf(id: number): number | null; footPx(id: number): { x: number; y: number } | null; count: number };
  textures: { exists(k: string): boolean };
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

async function shot(page: Page, name: string, opts: { animations?: 'disabled' | 'allow' } = {}): Promise<void> {
  const animations = opts.animations ?? 'disabled';
  mkdirSync('test-results/screens', { recursive: true });
  await page.screenshot({ path: `test-results/screens/${name}.png`, animations });
  if (SAVE_DOCS) {
    mkdirSync('docs/screens', { recursive: true });
    await page.screenshot({ path: `docs/screens/${name}.png`, animations });
  }
}

async function startGame(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.getByRole('button', { name: '시작' }).click();
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
}

/**
 * 개발자 debugTower로 타워를 순환의 정원 배치 칸마다 하나씩 놓는다 (T-3: 칸이 32개라 65종 중 등급을 고르게 32종 —
 * 크기 비교용 음유시인·궁수·운명의 여신은 꼭 넣는다). 놓은 수를 돌려준다.
 */
async function placeAllTowers(page: Page): Promise<number> {
  return sim(page, (s) => {
    const cells = s.match.map.buildable;
    const order = s.match.rules.towerOrder;
    const must = ['bard', 'archer', 'fate'].map((id) => order.indexOf(id));
    const spread = Array.from({ length: cells.length }, (_, k) => Math.floor((k * order.length) / cells.length));
    const pick = [...new Set([...must, ...spread])].slice(0, cells.length);
    pick.forEach((t, i) => {
      const c = cells[i]!;
      s.match.world.enqueue({ type: 'debugTower', x: c[0], y: c[1], t });
    });
    s.debugFastForward(1);
    return s.match.towers().length;
  });
}

/** 개발자 명령으로 그 단계까지 (⏭ 버튼과 같은 명령) */
async function skipTo(page: Page, stage: number): Promise<void> {
  await sim(
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

/** 단계 알림·배너·컷인이 걷힌 뒤 (스크린샷용) */
async function settle(page: Page): Promise<void> {
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId('boss-cutin')).toHaveCount(0, { timeout: 5_000 });
  await page.waitForTimeout(300);
}

test('타이틀: 힉스필드 타이틀 그림이 꽉 차게 깔리고 [▶ 시작]이 보인다', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  const title = page.locator('[data-screen="title"]');
  await expect(title).toBeVisible();
  await expect(title).toHaveAttribute('data-keyart', '1');
  await expect(title).toHaveClass(/has-keyart/);
  const hasTex = await page.evaluate(() => {
    const boot = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): { textures: { exists(k: string): boolean } } } } } }).__rtd.game.scene.getScene('Boot');
    return ['title-keyart-1', 'title-keyart-2'].filter((k) => boot.textures.exists(k)).length;
  });
  expect(hasTex).toBe(1); // 켤 때마다 하나만 받는다
  await expect(page.getByRole('button', { name: '시작' })).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, 'T2-art-title');
  expect(errors).toEqual([]);
});

test('전투 배경: 1단계 낮 → ⏭로 11단계가 되면 노을 밴드, 캐릭터별 크기가 다르다', async ({ page }) => {
  test.slow();
  const errors = collectErrors(page);
  await startGame(page, '/?dev=1&seed=7');
  await expect.poll(() => sim(page, (s) => s.backgroundKey), { timeout: 20_000 }).toBe('bg-t01-b1');
  // 캐릭터별 크기: 등급을 고르게 32종을 놓으면 그림 배수가 여러 가지 (요정은 작고 신은 크다)
  expect(await placeAllTowers(page)).toBe(32);
  await expect.poll(() => sim(page, (s) => s.towerLayer.count)).toBe(32);
  const scales = await sim(page, (s) => s.match.towers().map((t) => ({ id: t.tower, k: s.towerLayer.artScaleOf(t.id) })));
  const byId = new Map(scales.map((x) => [x.id, x.k ?? 0]));
  expect(new Set(scales.map((x) => x.k)).size).toBeGreaterThan(12);
  expect(byId.get('bard')!).toBeLessThan(byId.get('archer')!);
  expect(byId.get('archer')!).toBeLessThan(byId.get('fate')!);
  if (SAVE_DOCS) await settle(page);
  await shot(page, 'T2-art-stage1');
  // ⏭ 버튼으로 10번 → 11단계
  await skipTo(page, 9);
  const skip = page.getByRole('button', { name: '다음 단계로 즉시 이동' });
  await skip.click();
  await expect.poll(() => sim(page, (s) => s.match.state.stage)).toBe(10);
  await skip.click();
  await expect.poll(() => sim(page, (s) => s.match.state.stage)).toBe(11);
  await expect.poll(() => sim(page, (s) => s.backgroundKey), { timeout: 20_000 }).toBe('bg-t01-b2');
  // 다 바뀐 뒤 예전 배경 텍스처는 지운다 (지금 것 + 미리 받은 다음 것만)
  await expect.poll(() => sim(page, (s) => s.textures.exists('bg-t01-b1')), { timeout: 10_000 }).toBe(false);
  for (const [stage, name, key] of [
    [25, 'T2-art-stage25', 'bg-t01-b3'],
    [45, 'T2-art-stage45', 'bg-t01-b5'],
    [55, 'T2-art-stage55', 'bg-t02-b1'],
  ] as const) {
    await skipTo(page, stage);
    await expect.poll(() => sim(page, (s) => s.backgroundKey), { timeout: 20_000 }).toBe(key);
    if (SAVE_DOCS) {
      await sim(page, (s) => s.debugFastForward(120));
      await settle(page);
      // 타워들이 보스를 잡아 카드 고르기 창이 떴으면 접어 둔다 (배경이 보이게)
      const later = page.getByTestId('choice-later');
      if (await later.isVisible()) await later.click();
      await page.waitForTimeout(900); // 서서히 바뀌기가 끝나게
    }
    await shot(page, name);
  }
  expect(errors).toEqual([]);
});

test('보스 컷인: 10단계 보스가 나오면 그림·이름·등장!이 미끄러져 들어왔다가 2.5초 안에 사라진다', async ({ page }) => {
  const errors = collectErrors(page);
  await startGame(page, '/?dev=1&seed=7');
  expect(await sim(page, (s) => s.cutinStats.preloaded)).toBe(5);
  await skipTo(page, 9);
  await page.getByRole('button', { name: '다음 단계로 즉시 이동' }).click();
  const cutin = page.getByTestId('boss-cutin');
  await expect(cutin).toBeVisible({ timeout: 10_000 });
  const t0 = Date.now();
  // 컷인은 1.6초뿐이고 헤드리스 화면은 느리다 → 한 번에 읽는다. 문서용 스크린샷이면 같은 모양을 복사해 애니메이션 가운데에 멈춰 둔다
  // (화면 찍기가 1초 넘게 걸려 진짜 컷인은 찍는 동안 사라진다)
  const info = await page.evaluate((save) => {
    const el = document.querySelector<HTMLElement>('[data-testid="boss-cutin"]');
    if (!el) return null;
    if (save) {
      const c = el.cloneNode(true) as HTMLElement;
      c.dataset.testid = 'boss-cutin-shot';
      el.parentElement!.append(c);
      for (const a of c.getAnimations({ subtree: true })) {
        a.pause();
        a.currentTime = 650;
      }
    }
    return {
      name: el.querySelector('.bc-name')?.textContent ?? '',
      appear: el.querySelector('.bc-appear')?.textContent ?? '',
      src: el.querySelector('img.bc-art')?.getAttribute('src') ?? '',
      pointer: getComputedStyle(el).pointerEvents,
      layer: el.parentElement?.className ?? '',
    };
  }, SAVE_DOCS);
  expect(info).not.toBeNull();
  expect(info!.appear).toBe('등장!');
  expect(info!.name.length).toBeGreaterThan(1);
  expect(info!.src).toMatch(/cutin_[a-z]+\.webp$/);
  // 누르기를 막지 않는다, HUD 위·패널 아래 층
  expect(info!.pointer).toBe('none');
  expect(info!.layer).toContain('layer-cutin');
  await expect(cutin).toHaveCount(0, { timeout: 2_500 });
  expect(Date.now() - t0).toBeLessThan(2_500);
  if (SAVE_DOCS) {
    await shot(page, 'T2-art-cutin', { animations: 'allow' });
    await page.getByTestId('boss-cutin-shot').evaluate((el) => el.remove());
  }
  expect(await sim(page, (s) => s.cutinStats)).toMatchObject({ played: 1, showing: false });
  expect(errors).toEqual([]);
});

test('정보 패널: 캐릭터 설명 두 문장 + [ℹ] 캐릭터 카드 (✕ · 바깥 · Esc로 닫기)', async ({ page }) => {
  const errors = collectErrors(page);
  await startGame(page, '/?dev=1&seed=7');
  // 위쪽 줄(첫 줄)에 놓으면 패널이 아래에 펼친 그대로 (접지 않음)
  await sim(page, (s) => {
    s.match.world.enqueue({ type: 'debugTower', x: 4, y: 0, t: s.match.rules.towerOrder.indexOf('miner') });
    s.debugFastForward(1);
    return null;
  });
  await expect.poll(() => sim(page, (s) => s.towerLayer.count)).toBe(1);
  const xy = await sim(page, (s) => {
    const t = s.match.towers()[0]!;
    return s.towerLayer.footPx(t.id);
  });
  const box = (await page.locator('#game canvas').boundingBox())!;
  const k = box.width / 1080;
  await page.mouse.click(box.x + xy!.x * k, box.y + (xy!.y - 30) * k);
  const panel = page.getByTestId('tower-panel');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('tp-lore')).toHaveText('광산일을 마치고 전투에 참여한 드워프 광부다.');
  await expect(page.getByTestId('tp-role')).toContainText('돈을 캐낸다');
  await expect(page.getByTestId('tp-lore')).toBeVisible();
  // 두 줄을 넘지 않는다 (줄 높이 × 2 + 여유)
  for (const id of ['tp-lore', 'tp-role']) {
    const h = await page.getByTestId(id).evaluate((el) => el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight));
    expect(h, id).toBeLessThanOrEqual(2.05);
  }
  // 패널이 412px를 넘지 않는다
  expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);

  const info = page.getByRole('button', { name: '캐릭터 카드' });
  const card = page.getByTestId('character-card');
  // ✕로 닫기
  await info.click();
  await expect(card).toBeVisible();
  await expect(page.getByTestId('cc-name')).toHaveText('광부');
  await expect(page.getByTestId('cc-lore')).toHaveText('광산일을 마치고 전투에 참여한 드워프 광부다.');
  await expect(page.getByTestId('cc-role')).toContainText('돈을 캐낸다');
  await expect(card).toContainText('각성');
  // 힉스필드 초상 (텍스처 → data URL)
  expect(await page.getByTestId('cc-portrait').getAttribute('src')).toMatch(/^data:image\//);
  expect(await card.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.waitForTimeout(300);
  await shot(page, 'T2-art-card');
  await card.getByRole('button', { name: '닫기' }).click();
  await expect(card).toHaveCount(0);
  await expect(panel).toBeVisible();
  // 바깥 누르기로 닫기
  await info.click();
  await expect(card).toBeVisible();
  await page.mouse.click(box.x + 8, box.y + 8);
  await expect(card).toHaveCount(0);
  await expect(panel).toBeVisible();
  // Esc: 카드만 닫히고 패널은 그대로
  await info.click();
  await expect(card).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
  await expect(panel).toBeVisible();
  // 초상을 눌러도 열린다
  await page.locator('.tp-portrait').dispatchEvent('click'); // 숨쉬기 동작 중이라 위치가 계속 바뀐다
  await expect(card).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
  expect(errors).toEqual([]);
});
