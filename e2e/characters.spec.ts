/**
 * 캐릭터 다양화 E2E: 갤러리(?gallery=1) 세 탭이 오류 없이 뜨고 캐릭터 수가 맞는지, 각성 토글(53종)·등급 거르기·대기 동작 재생/멈춤·표정 바꾸기,
 * 게임 화면의 타워·몹이 새 캐릭터 그림(파츠 텍스처)으로 그려지는지. SAVE_SCREENS=1(npm run screens)이면 docs/screens/characters-*.png 저장.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SAVE_DOCS = process.env.SAVE_SCREENS === '1';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  return errors;
}

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync('test-results/screens', { recursive: true });
  await page.screenshot({ path: `test-results/screens/${name}.png`, animations: 'disabled' });
  if (SAVE_DOCS) {
    mkdirSync('docs/screens', { recursive: true });
    await page.screenshot({ path: `docs/screens/${name}.png`, animations: 'disabled' });
  }
}

const cards = (page: Page) => page.getByTestId('gallery-card');

async function openGallery(page: Page, query = ''): Promise<void> {
  await page.goto(`/?gallery=1${query}`);
  await expect(page.getByTestId('gallery')).toBeVisible();
  // 게임(Phaser)은 만들지 않는다 → 기존 게임 흐름과 무관
  expect(await page.locator('#game canvas').count()).toBe(0);
}

test('갤러리 세 탭: 타워 65 / 적 32 / 인물 9가 오류 없이 뜬다', async ({ page }) => {
  const errors = collectErrors(page);
  await openGallery(page);
  await expect(cards(page)).toHaveCount(65);
  await expect(page.getByTestId('gallery-count')).toHaveText('65명');
  // 등급 묶음 제목 7개 (노말~히든)
  await expect(page.locator('.gal-group')).toHaveCount(7);
  await page.getByTestId('gallery-tab-enemies').click();
  await expect(cards(page)).toHaveCount(32);
  expect(await cards(page).evaluateAll((els) => els.filter((e) => (e as HTMLElement).dataset.kind === 'mob').length)).toBe(13);
  await expect(page.locator('.gal-group')).toHaveCount(4);
  await page.getByTestId('gallery-tab-people').click();
  await expect(cards(page)).toHaveCount(9);
  // 모든 카드 캔버스가 실제로 그려졌다 (투명하지 않은 픽셀이 있다)
  for (const tab of ['towers', 'enemies', 'people'] as const) {
    await page.getByTestId(`gallery-tab-${tab}`).click();
    const blank = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLCanvasElement>('[data-testid="gallery-card"] canvas')).filter((c) => {
        const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
        for (let i = 3; i < d.length; i += 16) if (d[i]! > 0) return false;
        return true;
      }).length,
    );
    expect(blank, tab).toBe(0);
  }
  expect(errors).toEqual([]);
});

test('갤러리: 등급 거르기(20·20·25), 각성 토글 53종, 대기 동작 재생/멈춤, 인물 표정', async ({ page }) => {
  const errors = collectErrors(page);
  await openGallery(page);
  for (const [f, n] of [
    ['nr', 20],
    ['uh', 20],
    ['lgh', 25],
    ['all', 65],
  ] as const) {
    await page.getByTestId(`gallery-filter-${f}`).click();
    await expect(cards(page)).toHaveCount(n);
  }
  await page.getByTestId('gallery-awaken').click();
  await expect(page.locator('[data-testid="gallery-card"][data-awakened="true"]')).toHaveCount(53);
  await expect(page.getByTestId('gallery-count')).toHaveText('65명 · 각성 53');
  // 히든 12종은 각성 외형이 없다
  await page.getByTestId('gallery-filter-lgh').click();
  await expect(page.locator('[data-testid="gallery-card"][data-awakened="true"]')).toHaveCount(13);

  // 대기 동작: 재생 중에는 그림이 바뀌고, 멈추면 그대로
  const pixels = (): Promise<string> => page.locator('[data-testid="gallery-card"] canvas').first().evaluate((c) => (c as HTMLCanvasElement).toDataURL());
  const a = await pixels();
  await page.waitForTimeout(450);
  const b = await pixels();
  expect(b).not.toBe(a);
  await page.getByTestId('gallery-play').click();
  await expect(page.getByTestId('gallery-play')).toHaveAttribute('aria-pressed', 'false');
  const c = await pixels();
  await page.waitForTimeout(400);
  expect(await pixels()).toBe(c);

  await page.getByTestId('gallery-tab-people').click();
  const first = cards(page).first();
  await expect(first.locator('.gal-expr')).toHaveText('보통');
  await first.click();
  await expect(first.locator('.gal-expr')).toHaveText('화남');
  await first.click();
  await expect(first.locator('.gal-expr')).toHaveText('웃음');
  expect(errors).toEqual([]);
});

test('갤러리 휴대폰 412×915: 세로로 스크롤되고 가로로 넘치지 않는다', async ({ page }) => {
  await openGallery(page);
  const m = await page.getByTestId('gallery').evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight, sw: el.scrollWidth, cw: el.clientWidth }));
  expect(m.sh).toBeGreaterThan(m.ch);
  expect(m.sw).toBeLessThanOrEqual(m.cw);
  await page.getByTestId('gallery').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(cards(page).last()).toBeInViewport();
  // 머리글은 붙어 있다
  await expect(page.getByTestId('gallery-tab-people')).toBeInViewport();
});

test('캐릭터 스크린샷 (갤러리: 타워 3장·각성·적·인물)', async ({ page }) => {
  test.skip(!SAVE_DOCS, 'SAVE_SCREENS=1일 때만');
  test.setTimeout(60_000);
  for (const [name, q] of [
    ['characters-towers-1', '&filter=nr&play=0'],
    ['characters-towers-2', '&filter=uh&play=0'],
    ['characters-towers-3', '&filter=lgh&play=0'],
    ['characters-awaken', '&filter=nr&awaken=1&play=0'],
    ['characters-awaken-2', '&filter=uh&awaken=1&play=0'],
    ['characters-awaken-3', '&filter=lgh&awaken=1&play=0'],
    ['characters-enemies', '&tab=enemies&play=0'],
    ['characters-people', '&tab=people&play=0'],
  ] as const) {
    await openGallery(page, q);
    await page.waitForTimeout(300);
    await shot(page, name);
  }
});

type SceneLike = {
  match: {
    towers(): { id: number; tower: string }[];
    mobCount(): number;
    state: { stage: number };
    rules: { towerOrder: string[] };
    world: { enqueue(c: unknown): { ok: boolean } };
  };
  debugFastForward(n: number): number;
  towerLayer: { characterKeys: string[]; characterKeyOf(id: number): string | null };
  mobLayer: { newArtCount: number; count: number };
  textures: { exists(k: string): boolean };
};

async function inScene<T, A>(page: Page, fn: (s: SceneLike, arg: A) => T, arg: A): Promise<T> {
  return page.evaluate(
    ([src, a]) => {
      const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game');
      return new Function('s', 'a', `return (${src})(s, a);`)(s, a) as T;
    },
    [fn.toString(), arg] as const,
  );
}

/** 게임 중 화면에 세울 타워 (여러 등급·종족, 몹을 한 번에 다 지우지 않게 전체 공격 타워는 뺀다) */
const INGAME_TOWERS = [
  'miner', 'archer', 'drummer', 'goblin', 'apprentice', 'warrior', 'ninja', 'k9', 'stonegolem', 'spearman',
  'bard', 'scout', 'merchant', 'flamemage', 'dwarfbomber', 'windarcher', 'gunner', 'mudshaman',
  'icemage', 'gambler', 'blacksmith', 'goblinchief', 'astrologer', 'lightning', 'banker', 'sniper',
  'summoner', 'scholar', 'chronomancer', 'alchemist', 'paladin', 'necromancer', 'swordsaint', 'prophet',
  'dragoncaller', 'warlord', 'archmage', 'fortuna', 'tycoon', 'saint',
];

test('게임 화면: 타워·몹이 새 캐릭터 그림(파츠 텍스처)으로 그려진다', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await page.goto('/?debug=1&seed=7');
  await page.getByRole('button', { name: '시작' }).click();
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
  const placed = await inScene(
    page,
    (s, ids) => {
      const cells: [number, number][] = [];
      for (let y = 2; y <= 8; y++) for (let x = 2; x <= 6; x++) cells.push([x, y]);
      for (let x = 0; x <= 8; x++) cells.push([x, 0], [x, 10]);
      for (let y = 1; y <= 9; y++) cells.push([0, y], [8, y]);
      let n = 0;
      cells.forEach(([x, y], i) => {
        const id = ids[i % ids.length]!;
        if (s.match.world.enqueue({ type: 'debugTower', x, y, t: s.match.rules.towerOrder.indexOf(id) }).ok) n++;
      });
      s.debugFastForward(1);
      return n;
    },
    INGAME_TOWERS,
  );
  expect(placed).toBe(71);
  // 다음 프레임에 그림이 생긴다: 모든 타워가 새 파츠 텍스처, 종류마다 한 장
  await expect.poll(() => inScene(page, (s) => s.towerLayer.characterKeys.length, null)).toBe(71);
  const keys = await inScene(page, (s) => s.towerLayer.characterKeys, null);
  expect(keys.every((k) => k.startsWith('char-tower-'))).toBe(true);
  expect(new Set(keys).size).toBe(INGAME_TOWERS.length);
  expect(await inScene(page, (s) => ['char-tower-miner-n', 'char-tower-saint-n'].every((k) => s.textures.exists(k)), null)).toBe(true);
  // 몹: 몹이 살아 있는 단계로 건너뛰면 새 적 그림
  await inScene(
    page,
    (s) => {
      while (s.match.state.stage < 41) {
        s.match.world.enqueue({ type: 'debugSkipStage' });
        s.debugFastForward(1);
      }
      s.debugFastForward(160);
      return s.match.mobCount();
    },
    null,
  );
  await expect.poll(() => inScene(page, (s) => s.mobLayer.newArtCount, null)).toBeGreaterThan(3);
  const m = await inScene(page, (s) => ({ newArt: s.mobLayer.newArtCount, all: s.mobLayer.count }), null);
  expect(m.newArt).toBe(m.all);
  await page.waitForTimeout(400);
  await shot(page, 'characters-ingame');
  expect(errors).toEqual([]);
});
