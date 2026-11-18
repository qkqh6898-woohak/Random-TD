/**
 * F10 첫 10단계 개선 (UI 갈래) E2E:
 * - 새 플레이어 흐름 (디버그 없이): 타이틀 → 추천 칸 소환 → [준비 완료](연타해도 1단계 한 번) → 첫 전투 → 보유 2/3 → 첫 승급 안내
 *   (결과 칸·재료 두 칸 = sim 재료, [⬆ 승급 가능] 강조, 카드가 누르기를 막지 않음) → 다른 칸 고르기 → 승급 → 결과 이름·역할.
 * - 안내 닫기·재시작·[도움말 다시 보기], 안내 중 HUD 버튼, 패널로 고른 타워 = 결과 칸 (눌러서 바로 승급 꺼짐).
 * - 문서 1장 강화·미션: 일반 시작 준비 단계에서 열기·시트 하나만·닫으면 맵 조작·게임 시간 진행, 일반 강화 50원 → Lv1 +10%·돈 부족이면 그대로,
 *   미션 달성 → 배지 → [받기] 연타 한 번 지급 · [모두 받기] 연타 한 번, 360·412px 하단 버튼·배지 안 잘림 + 닫힌 HUD가 배치 칸을 덮지 않음.
 * - 문서 4장 기본 5종: 흑백 캡처(이름표 없이 나란히) 서로 다름, 큰 캐릭터(돌 골렘 ×1.25) 위 칸 누르기·길게 누르기.
 * - 결정 6: 개발자 도구 '이번 판 기록'.
 * 이 파일은 빈 저장소(첫 승급 안내를 아직 안 본 새 계정)로 시작한다 — 다른 스펙은 playwright.config의 '안내를 본 계정'.
 */
import { expect, test, type Page } from '@playwright/test';
import { clickStart } from './title';
import { mkdirSync } from 'node:fs';

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ timeout: 180_000 });

const SAVE_DOCS = process.env.SAVE_SCREENS === '1';

interface TowerLite {
  id: number;
  tx: number;
  ty: number;
  tower: string;
  owner: number;
}

type Tile = { tx: number; ty: number };

type SceneLike = {
  match: {
    tick: number;
    state: {
      stage: number;
      gold: number;
      phase: string;
      summons: number;
      merges: number;
      stageStartTick: number;
      nextStageTick: number;
      upgrades: number[][];
      missionStatus: number[];
    };
    map: { buildable: [number, number][]; width: number; height: number };
    rules: { towerOrder: string[]; missions: { id: string }[]; stageTicks: number };
    towers(): TowerLite[];
    mobCount(): number;
    world: { enqueue(c: unknown): { ok: boolean } };
  };
  mapLayout: { tile: number; originX: number; originY: number };
  guideState: {
    recommended: [number, number][];
    preview: { result: Tile; materials: Tile[] } | null;
    badges: number;
    ready: string;
    guide: { kind: string; anchorId: number; step: number } | null;
    resultToasts: number;
  };
  runLogRows: { label: string; value: string }[];
  sheetOpen: string | null;
  selectedTowerId: number | null;
  panelOpen: boolean;
  dragState: { id: number } | null;
  towerLayer: { artScaleOf(id: number): number | null };
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

async function start(page: Page, query: string): Promise<void> {
  await page.goto(`/${query}`);
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
  // 판 시작 첫 프레임들(텍스처 굽기)이 지나 layout·guideState가 채워질 때까지
  await expect.poll(() => inScene(page, (s) => s.mapLayout.tile, null)).toBeGreaterThan(0);
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

async function guide(page: Page): Promise<SceneLike['guideState']> {
  return inScene(page, (s) => s.guideState, null);
}

async function myTowers(page: Page): Promise<TowerLite[]> {
  return inScene(page, (s) => s.match.towers().map((t) => ({ id: t.id, tx: t.tx, ty: t.ty, tower: t.tower, owner: t.owner })), null);
}

/** 칸 (tx, ty)의 페이지 좌표 (dy = 칸 단위 위아래). */
async function tilePoint(page: Page, tx: number, ty: number, dy = 0): Promise<{ x: number; y: number }> {
  const L = await inScene(page, (s) => s.mapLayout, null);
  const r = (await page.locator('#stage').boundingBox())!;
  const k = r.width / 1080;
  return { x: r.x + (L.originX + (tx + 0.5) * L.tile) * k, y: r.y + (L.originY + (ty + 0.5 + dy) * L.tile) * k };
}

async function tapTile(page: Page, tx: number, ty: number, dy = 0): Promise<void> {
  const p = await tilePoint(page, tx, ty, dy);
  await page.touchscreen.tap(p.x, p.y);
  await page.waitForTimeout(150);
}

async function place(page: Page, list: [number, number, string][]): Promise<void> {
  const ok = await inScene(
    page,
    (s, l) => l.every(([x, y, id]) => s.match.world.enqueue({ type: 'debugTower', x, y, t: s.match.rules.towerOrder.indexOf(id) }).ok),
    list,
  );
  expect(ok).toBe(true);
  await inScene(page, (s) => s.debugFastForward(1), null);
}

async function shot(page: Page, docsName: string): Promise<void> {
  mkdirSync('test-results/screens', { recursive: true });
  await page.screenshot({ path: `test-results/screens/${docsName}.png` });
  if (SAVE_DOCS) {
    mkdirSync('docs/screens', { recursive: true });
    await page.screenshot({ path: `docs/screens/${docsName}.png` });
  }
}

/** sim 규칙의 재료: anchor를 뺀 같은 종류 중 ID가 큰 2개 (칸) */
function simMaterials(list: TowerLite[], anchorId: number): Tile[] {
  const a = list.find((t) => t.id === anchorId)!;
  return list
    .filter((t) => t.tower === a.tower && t.id !== anchorId)
    .sort((x, y) => y.id - x.id)
    .slice(0, 2)
    .map((t) => ({ tx: t.tx, ty: t.ty }));
}

test('새 플레이어 (디버그 없이): 추천 칸 소환 → 준비 완료 → 첫 전투 → 2/3 → 첫 승급 안내 (G-1: 한 칸 3개) → 승급 → 이름·역할', async ({ page }) => {
  const errors = collectErrors(page);
  // 알림 글자 기록 (2.6초 알림이 바쁜 컴퓨터에서 확인 전에 사라지지 않게)
  await page.addInitScript(() => {
    const w = window as unknown as { __allToasts: string[] };
    w.__allToasts = [];
    new MutationObserver((ms) => {
      for (const m of ms)
        for (const n of m.addedNodes) {
          const el = n as HTMLElement;
          if (el.classList?.contains('toast')) w.__allToasts.push(el.textContent ?? '');
        }
    }).observe(document, { childList: true, subtree: true });
  });
  await start(page, '?seed=65');
  // 추천 칸 3개 (자동 소환과 같은 점수), [준비 완료]는 타워가 없으니 아직 없음
  await expect.poll(async () => (await guide(page)).recommended.length).toBe(3);
  await expect(page.getByTestId('hud-ready')).toBeHidden();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __allToasts: string[] }).__allToasts.some((t) => t.includes('빛나는 칸을 눌러')))).toBe(true);
  await shot(page, 'F10-ui-recommend');
  const rec = (await guide(page)).recommended;
  await tapTile(page, rec[0]![0], rec[0]![1]);
  await expect.poll(async () => (await myTowers(page)).length).toBe(1);
  expect((await myTowers(page))[0]).toMatchObject({ tx: rec[0]![0], ty: rec[0]![1] });
  // 첫 소환 뒤 추천 칸은 꺼지고 [준비 완료]가 보인다
  await expect.poll(async () => (await guide(page)).recommended.length).toBe(0);
  const ready = page.getByTestId('hud-ready');
  await expect(ready).toBeVisible();
  await shot(page, 'F10-ui-ready');
  const box = (await ready.boundingBox())!;
  // 누르는 영역은 위아래로 넓혀 44px 이상 (보이는 막대보다 큼): 막대 위·아래 바깥을 눌러도 버튼
  const hit = await page.evaluate(
    ([x, y1, y2]) => [document.elementFromPoint(x, y1)?.closest('[data-testid="hud-ready"]') !== null, document.elementFromPoint(x, y2)?.closest('[data-testid="hud-ready"]') !== null],
    [box.x + box.width / 2, box.y - 6, box.y + box.height + 8] as const,
  );
  expect(hit).toEqual([true, true]);
  expect(box.height + 14).toBeGreaterThanOrEqual(44);
  // 준비 단계에서 연타 (한 번의 JS 차례에 3번) → 1단계는 한 번
  expect(await inScene(page, (s) => s.match.state.stage, null)).toBe(0);
  await page.evaluate(() => {
    const b = document.querySelector('[data-testid="hud-ready"]') as HTMLButtonElement;
    b.click();
    b.click();
    b.click();
  });
  await expect.poll(() => inScene(page, (s) => s.match.state.stage, null)).toBe(1);
  const st = await inScene(page, (s) => ({ start: s.match.state.stageStartTick, next: s.match.state.nextStageTick, per: s.match.rules.stageTicks }), null);
  expect(st.start).toBeLessThan(1200);
  expect(st.next - st.start).toBe(st.per);
  await expect(ready).toBeHidden();
  await expect(page.getByTestId('hud-stage')).toHaveText('WAVE 1');
  // 첫 전투: 1단계 몹이 나온다
  await expect.poll(() => inScene(page, (s) => s.match.mobCount(), null)).toBeGreaterThan(0);
  // 소환 1번 더 → 같은 타워 2개 → '2/3' 배지 2개
  await page.getByTestId('hud-summon').click();
  await expect.poll(async () => (await myTowers(page)).length).toBe(2);
  await expect.poll(async () => (await guide(page)).badges).toBe(2);
  await shot(page, 'F10-ui-pair');
  // 2번 더 → 같은 타워 3개 → 첫 승급 안내
  await page.getByTestId('hud-summon').click();
  await expect.poll(async () => (await myTowers(page)).length).toBe(3);
  await page.getByTestId('hud-summon').click();
  await expect.poll(async () => (await guide(page)).guide !== null).toBe(true);
  const card = page.getByTestId('guide-card');
  await expect(card).toBeVisible();
  await expect(page.getByTestId('guide-title')).toContainText('3개 — 승급할 수 있어요!');
  await expect(page.getByTestId('hud-merge-ready')).toHaveClass(/is-guide/);
  let g = await guide(page);
  let list = await myTowers(page);
  const anchor = list.find((t) => t.id === g.guide!.anchorId)!;
  expect(g.preview!.result).toEqual({ tx: anchor.tx, ty: anchor.ty });
  expect(g.preview!.materials).toEqual(simMaterials(list, anchor.id));
  // 안내 카드는 누르기를 막지 않는다 (카드 글자 위 = 캔버스)
  const cb = (await page.getByTestId('guide-body').boundingBox())!;
  expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName, [cb.x + cb.width / 2, cb.y + cb.height / 2] as const)).toBe('CANVAS');
  await shot(page, 'F10-ui-merge-guide');
  // [다음] → 2단계 글자
  await page.getByTestId('guide-next').click();
  await expect(page.getByTestId('guide-step')).toHaveText('2/2');
  // 마지막 단계: [다음] 대신 [확인] (F10-4 검토 — 예전엔 눌러도 아무 일 없는 [다음]이 남아 있었다)
  await expect(page.getByTestId('guide-next')).toBeVisible();
  await expect(page.getByTestId('guide-next')).toHaveText('확인');
  // G-1 칸 무더기: 같은 캐릭터 3개가 한 칸에 쌓여 있다 (결과·재료 칸이 같은 칸 — 예전 '다른 칸 고르기'는 없다)
  expect(list.filter((t) => t.tx === anchor.tx && t.ty === anchor.ty)).toHaveLength(3);
  const other = anchor;
  const stackIds = list.filter((t) => t.tx === anchor.tx && t.ty === anchor.ty).map((t) => t.id);
  // 결과 알림은 2.6초 뒤 사라진다 → 생길 때 글자를 기록해 둔다 (바쁜 컴퓨터에서 확인 전에 사라지지 않게)
  await page.evaluate(() => {
    const w = window as unknown as { __mergeBanners: string[][] };
    w.__mergeBanners = [];
    new MutationObserver((ms) => {
      for (const m of ms)
        for (const n of m.addedNodes) {
          const el = n as HTMLElement;
          if (el.classList?.contains('is-merge')) w.__mergeBanners.push([el.querySelector('.toast-title')?.textContent ?? '', el.querySelector('.toast-sub')?.textContent ?? '']);
        }
    }).observe(document.querySelector('.layer-toast')!, { childList: true });
  });
  // 3개 쌓인 칸을 누르면 정보창 → [⬆ 승급] (피드백 #17: 새 플레이어는 '눌러서 바로 승급' 꺼짐) → 그 칸 3개가 모두 사라지고 다음 등급 하나
  await tapTile(page, other.tx, other.ty);
  await expect(page.locator('[data-action="merge"]').first()).toBeVisible();
  expect(await inScene(page, (s) => s.match.state.merges, null)).toBe(0);
  await page.locator('[data-action="merge"]').first().click();
  await expect.poll(() => inScene(page, (s) => s.match.state.merges, null)).toBe(1);
  const after = await myTowers(page);
  for (const id of stackIds) expect(after.some((t) => t.id === id)).toBe(false);
  const result = after.find((t) => !list.some((b) => b.id === t.id))!;
  expect(result.tower).not.toBe(anchor.tower);
  // 결과 타워 이름·역할 알림
  await shot(page, 'F10-ui-result');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __mergeBanners: string[][] }).__mergeBanners.length)).toBe(1);
  const [bTitle, bSub] = await page.evaluate(() => (window as unknown as { __mergeBanners: string[][] }).__mergeBanners[0]!);
  const info = await page.evaluate(async (id) => {
    const r = await fetch('/src/data/towers.json');
    const d = (await r.json()) as { towers: { id: string; name: string; role?: string }[] };
    return d.towers.find((t) => t.id === id)!;
  }, result.tower);
  expect(bTitle).toContain(info.name);
  expect(bSub).toContain((info.role ?? '').slice(0, 10));
  // 안내는 끝나고 계정에 기록
  await expect(card).toBeHidden();
  await expect(page.getByTestId('hud-merge-ready')).not.toHaveClass(/is-guide/);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('rtd.account') ?? '{}') as { guides?: string[] });
  expect(saved.guides).toContain('firstMerge');
  expect(errors).toEqual([]);
});

test('두 묶음이 함께 준비되면: 다른 묶음 타워를 누르면 안내가 옮겨 가고(바로 승급 안 함), [⬆ 승급 가능]으로 묶음을 돌아가며 · 아래 띠 소환·일꾼 자리는 그대로 · [확인]로 닫기', async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('rtd.settings', JSON.stringify({ v: 2, tapMerge: true }))); // 피드백 #17: 바로 승급은 이제 기본 꺼짐 — 이 테스트는 켠 플레이어
  await start(page, '?debug=1&seed=7');
  // 승급 가능 버튼이 없을 때의 [🎲 소환]·[👷 일꾼] 자리
  const summon = page.getByTestId('hud-summon');
  const hire = page.getByTestId('hud-hire');
  await expect(page.getByTestId('hud-merge-ready')).toBeHidden();
  const s0 = (await summon.boundingBox())!;
  const h0 = (await hire.boundingBox())!;
  const cells = await inScene(page, (s) => s.match.map.buildable.slice(0, 6), null);
  // G-1 칸 무더기: 같은 캐릭터 3개가 한 칸에 쌓여야 승급 묶음이 된다
  await place(page, [
    ...[0, 1, 2].map(() => [cells[0]![0], cells[0]![1], 'goblin'] as [number, number, string]),
    ...[0, 1, 2].map(() => [cells[3]![0], cells[3]![1], 'archer'] as [number, number, string]),
  ]);
  await expect(page.getByTestId('guide-card')).toBeVisible();
  await expect(page.getByTestId('hud-merge-ready')).toBeVisible();
  // 아래 띠: 일꾼은 그대로, 소환은 오른쪽 끝이 그대로이고 예전 소환 가운데를 눌러도 소환 (일꾼 고용이 아님)
  const s1 = (await summon.boundingBox())!;
  const h1 = (await hire.boundingBox())!;
  expect(Math.abs(h1.x - h0.x)).toBeLessThan(1);
  expect(Math.abs(h1.width - h0.width)).toBeLessThan(1);
  expect(Math.abs(s1.x + s1.width - (s0.x + s0.width))).toBeLessThan(1);
  const oldCenter = { x: s0.x + s0.width / 2, y: s0.y + s0.height / 2 };
  expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-testid]')?.getAttribute('data-testid'), [oldCenter.x, oldCenter.y] as const)).toBe('hud-summon');
  // 안내는 먼저 소환된 고블린 묶음
  let g = await guide(page);
  expect(g.guide?.kind).toBe('goblin');
  // 궁수(다른 묶음)를 누르면: 승급하지 않고 안내가 궁수 묶음으로 — 그 궁수가 결과 칸, 재료 = sim 재료
  const list = await myTowers(page);
  const archer = list.find((t) => t.tower === 'archer')!;
  await tapTile(page, archer.tx, archer.ty);
  await expect.poll(async () => (await guide(page)).guide?.kind).toBe('archer');
  g = await guide(page);
  expect(await inScene(page, (s) => s.match.state.merges, null)).toBe(0);
  expect(g.guide?.anchorId).toBe(archer.id);
  expect(g.preview!.result).toEqual({ tx: archer.tx, ty: archer.ty });
  expect(g.preview!.materials).toEqual(simMaterials(list, archer.id));
  await expect(page.getByTestId('guide-title')).toContainText('궁수');
  // [⬆ 승급 가능]: 처음엔 안내 묶음(궁수) 결과 칸 패널, 패널의 [다음 묶음 ▶]을 누르면 다음 묶음(고블린)으로 — 안내도 함께
  await page.getByTestId('hud-merge-ready').click({ force: true }); // 안내 중엔 반짝이며 커졌다 작아진다
  await expect.poll(() => inScene(page, (s) => s.selectedTowerId, null)).toBe(archer.id);
  await page.locator('[data-action="merge-next"]').click();
  await expect.poll(async () => (await guide(page)).guide?.kind).toBe('goblin');
  const gob = (await guide(page)).guide!.anchorId;
  await expect.poll(() => inScene(page, (s) => s.selectedTowerId, null)).toBe(gob);
  expect(await inScene(page, (s) => s.match.state.merges, null)).toBe(0);
  await shot(page, 'F10-ui-two-groups');
  // 2/2의 [확인] = 닫기 (계정에 기록)
  if ((await page.getByTestId('guide-step').textContent()) !== '2/2') await page.getByTestId('guide-next').click();
  await expect(page.getByTestId('guide-next')).toHaveText('확인');
  await page.getByTestId('guide-next').click();
  await expect(page.getByTestId('guide-card')).toBeHidden();
  expect(await page.evaluate(() => (JSON.parse(localStorage.getItem('rtd.account') ?? '{}') as { guides?: string[] }).guides)).toEqual(['firstMerge']);
  expect(errors).toEqual([]);
});

test('안내: ✕로 닫으면 계정에 한 번 기록 → 재시작한 판엔 안 뜸 → [도움말 다시 보기]로 다시, 안내 중에도 HUD 버튼·패널 선택이 된다', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('rtd.settings')) localStorage.setItem('rtd.settings', JSON.stringify({ v: 1, tapMerge: false }));
  });
  const errors = collectErrors(page);
  await start(page, '?debug=1&seed=7');
  const cells = await inScene(page, (s) => s.match.map.buildable.slice(0, 4), null);
  // G-1 칸 무더기: 한 칸에 3개
  await place(page, [
    [cells[2]![0], cells[2]![1], 'goblin'],
    [cells[2]![0], cells[2]![1], 'goblin'],
    [cells[2]![0], cells[2]![1], 'goblin'],
  ]);
  await expect(page.getByTestId('guide-card')).toBeVisible();
  // 안내 중에도 HUD 버튼: 미션 시트가 열리고 닫힌다 (G-1: [📋]는 맵 오른쪽 둥근 버튼이라 열린 시트가 덮는다 → ✕로 닫기)
  await page.getByTestId('menu-mission').click();
  await expect.poll(() => inScene(page, (s) => s.sheetOpen, null)).toBe('mission');
  await page.getByTestId('sheet-close').click();
  await expect.poll(() => inScene(page, (s) => s.sheetOpen, null)).toBe(null);
  // 눌러서 바로 승급 꺼짐: 패널로 고른 타워가 결과 칸 (재료 = sim 재료)
  await tapTile(page, cells[2]![0], cells[2]![1]);
  await expect.poll(() => inScene(page, (s) => s.panelOpen, null)).toBe(true);
  const list = await myTowers(page);
  const picked = list.find((t) => t.tx === cells[2]![0] && t.ty === cells[2]![1])!;
  await expect.poll(async () => (await guide(page)).preview?.result).toEqual({ tx: picked.tx, ty: picked.ty });
  expect((await guide(page)).preview!.materials).toEqual(simMaterials(list, picked.id));
  // ✕ → 닫힘 + 계정 기록
  await page.getByTestId('guide-close').click();
  await expect(page.getByTestId('guide-card')).toBeHidden();
  expect(await page.evaluate(() => (JSON.parse(localStorage.getItem('rtd.account') ?? '{}') as { guides?: string[] }).guides)).toEqual(['firstMerge']);
  // 재시작 (타이틀로 → 시작): 다시 3개를 놓아도 안내 없음
  await page.locator('[data-action="pause"]').click();
  await page.locator('[data-action="exit"]').click();
  await start(page, '?debug=1&seed=7');
  const cells2 = await inScene(page, (s) => s.match.map.buildable.slice(0, 3), null);
  await place(page, cells2.map(() => [cells2[0]![0], cells2[0]![1], 'archer'] as [number, number, string]));
  await page.waitForTimeout(500);
  expect((await guide(page)).guide).toBeNull();
  await expect(page.getByTestId('guide-card')).toBeHidden();
  // 일시정지 → [도움말 다시 보기] → 계속 → 이 판에서 다시 안내
  await page.locator('[data-action="pause"]').click();
  await page.getByTestId('pause-help').click();
  await expect(page.getByTestId('pause-help')).toBeDisabled();
  await page.locator('[data-action="resume"]').click();
  await expect(page.getByTestId('guide-card')).toBeVisible();
  expect((await guide(page)).guide?.kind).toBe('archer');
  expect(errors).toEqual([]);
});

test('강화·미션 (일반 시작): 준비 단계에서 열기 · 시트는 하나만 · 시간은 흐름 · 닫으면 맵 조작 · 일반 강화 50원 → Lv1 +10% · 돈 부족이면 그대로', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, '?seed=11');
  expect(await inScene(page, (s) => s.match.state.stage, null)).toBe(0);
  await page.getByTestId('menu-upgrade').click();
  await expect.poll(() => inScene(page, (s) => s.sheetOpen, null)).toBe('upgrade');
  const row = page.getByTestId('upgrade-row-normal');
  await expect(row).toContainText('노말·레어 강화');
  await expect(row).toContainText('Lv 0/50');
  await expect(row).toContainText('+0% → +10%');
  await expect(page.getByTestId('upgrade-buy-normal')).toHaveText('50원');
  const t0 = Number(await page.locator('[data-screen="game"]').getAttribute('data-tick'));
  await page.waitForTimeout(700);
  expect(Number(await page.locator('[data-screen="game"]').getAttribute('data-tick'))).toBeGreaterThan(t0);
  await shot(page, 'F10-ui-upgrade');
  // 피드백 #23: 등급 강화 이름이 등급 표기 그대로 ('레전드·신·신화 강화'가 가장 길다) — 이름 줄이 버튼과 겹치지 않는다
  for (const [id, name] of [['normal', '노말·레어 강화'], ['hero', '유니크·히어로 강화'], ['legend', '레전드·신·신화 강화']] as const) {
    const r = page.getByTestId(`upgrade-row-${id}`);
    await expect(r.locator('.up-name')).toContainText(name);
    const right = await r.locator('.up-name > *').evaluateAll((els) => Math.max(...els.map((e) => e.getBoundingClientRect().right)));
    const buyBox = (await r.locator('.up-buy').boundingBox())!;
    expect(right).toBeLessThanOrEqual(buyBox.x + 1);
  }
  // 50원 → Lv1, 노말·레어 +10%
  await page.getByTestId('upgrade-buy-normal').click();
  await expect.poll(() => inScene(page, (s) => s.match.state.gold, null)).toBe(950);
  await expect(row).toContainText('Lv 1/50');
  await expect(row).toContainText('+10% → +20%');
  expect(await inScene(page, (s) => s.match.state.upgrades[0]![0], null)).toBe(1);
  // 다른 메뉴 → 시트 하나만 (G-1: 시트 아래에 보이는 하단 묶음 [🎰 도박]으로 바꾸기)
  await page.getByTestId('menu-gamble').click();
  await expect.poll(() => inScene(page, (s) => s.sheetOpen, null)).toBe('gamble');
  expect(await page.locator('.layer-sheet > *').count()).toBe(1);
  // ✕로 닫으면 바로 맵 조작 (빈 칸 소환)
  await page.getByTestId('sheet-close').click();
  await expect.poll(() => inScene(page, (s) => s.sheetOpen, null)).toBe(null);
  const cell = await inScene(page, (s) => s.match.map.buildable[5]!, null);
  await tapTile(page, cell[0], cell[1]);
  await expect.poll(async () => (await myTowers(page)).length).toBe(1);
  // 돈 부족: 850원 → 100+150+200+250 = 700 → 150원, 다음 300원은 차감 없음
  await page.getByTestId('menu-upgrade').click();
  for (let i = 0; i < 4; i++) {
    const before = await inScene(page, (s) => s.match.state.gold, null);
    await page.getByTestId('upgrade-buy-normal').click();
    await expect.poll(() => inScene(page, (s) => s.match.state.gold, null)).toBeLessThan(before);
  }
  expect(await inScene(page, (s) => s.match.state.gold, null)).toBe(150);
  // 알림은 1.6초 뒤 사라진다 → 생길 때 글자를 기록 (바쁜 컴퓨터에서 확인 전에 사라지지 않게)
  await page.evaluate(() => {
    const w = window as unknown as { __toasts: string[] };
    w.__toasts = [];
    new MutationObserver((ms) => {
      for (const m of ms) for (const n of m.addedNodes) w.__toasts.push((n as HTMLElement).textContent ?? '');
    }).observe(document.querySelector('.layer-toast')!, { childList: true });
  });
  await page.getByTestId('upgrade-buy-normal').click();
  await page.waitForTimeout(400);
  expect(await inScene(page, (s) => s.match.state.gold, null)).toBe(150);
  expect(await inScene(page, (s) => s.match.state.upgrades[0]![0], null)).toBe(5);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __toasts: string[] }).__toasts.some((t) => t.includes('원이 더 필요해요')))).toBe(true);
  expect(errors).toEqual([]);
});

test('미션 (일반 시작): 소환 10회 → 배지 "1 받기" → 받을 것이 맨 위 → [받기] 연타해도 +100원 한 번 / [모두 받기] 연타도 한 번', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, '?seed=12');
  for (let i = 0; i < 10; i++) {
    await page.getByTestId('hud-summon').click();
    await expect.poll(async () => (await myTowers(page)).length).toBe(i + 1);
  }
  expect(await inScene(page, (s) => s.match.state.gold, null)).toBe(0);
  await expect(page.getByTestId('menu-badge-mission')).toContainText('받기');
  const before = Number((await page.getByTestId('menu-badge-mission').textContent())?.match(/\d+/)?.[0] ?? '0');
  await page.getByTestId('menu-mission').click();
  const first = page.locator('.ms-list[data-pane="normal"] .ms-row').first();
  await expect(first).toHaveAttribute('data-status', 'done');
  await expect(page.getByTestId('mission-row-n09')).toContainText('소환 10회');
  await expect(page.getByTestId('mission-row-n09')).toContainText('+100원');
  await expect(page.getByTestId('mission-row-n09')).toContainText('10/10');
  const gold0 = await inScene(page, (s) => s.match.state.gold, null);
  await page.evaluate(() => {
    const b = document.querySelector('[data-testid="mission-claim-n09"]') as HTMLButtonElement;
    for (let i = 0; i < 5; i++) b.click();
  });
  await expect(page.getByTestId('mission-row-n09')).toHaveAttribute('data-status', 'claimed');
  await page.waitForTimeout(300);
  expect(await inScene(page, (s) => s.match.state.gold, null)).toBe(gold0 + 100);
  await expect.poll(async () => Number((await page.getByTestId('menu-badge-mission').textContent())?.match(/\d+/)?.[0] ?? '0')).toBe(before - 1);
  // 남은 받을 것이 있으면 [모두 받기] 연타 → 한 번씩만
  const rest = await inScene(page, (s) => s.match.state.missionStatus.filter((v) => v === 1).length, null);
  if (rest > 0) {
    const g1 = await inScene(page, (s) => s.match.state.gold, null);
    await page.evaluate(() => {
      const b = document.querySelector('[data-testid="mission-claim-all"]') as HTMLButtonElement;
      b.click();
      b.click();
      b.click();
    });
    await expect.poll(() => inScene(page, (s) => s.match.state.missionStatus.filter((v) => v === 1).length, null)).toBe(0);
    const got = (await inScene(page, (s) => s.match.state.gold, null)) - g1;
    expect(got).toBeGreaterThan(0);
    await page.waitForTimeout(300);
    expect((await inScene(page, (s) => s.match.state.gold, null)) - g1).toBe(got);
  }
  await expect(page.getByTestId('menu-badge-mission')).toHaveText('');
  expect(errors).toEqual([]);
});

test('[모두 받기] 연타 (개발자 판, 받을 것 여럿): 보상마다 한 번씩만', async ({ page }) => {
  await start(page, '?debug=1&seed=3');
  const cells = await inScene(page, (s) => s.match.map.buildable.slice(0, 5), null);
  // 노말 5종 동시 보유(n01 +100) + 소환 10회(n09 +100)
  await place(page, cells.map(([x, y], i) => [x, y, ['miner', 'goblin', 'archer', 'apprentice', 'warrior'][i]!] as [number, number, string]));
  await inScene(
    page,
    (s) => {
      s.match.world.enqueue({ type: 'debugAddGold', amount: 2000 });
      s.debugFastForward(1);
    },
    null,
  );
  for (let i = 0; i < 10; i++) {
    await page.getByTestId('hud-summon').click();
    await expect.poll(async () => (await myTowers(page)).length).toBe(6 + i);
  }
  await expect(page.getByTestId('menu-badge-mission')).toHaveText(/^[2-9] 받기$/);
  await page.getByTestId('menu-mission').click();
  // [모두 받기 n · +X원] 글자의 합계만큼만 들어와야 한다
  const label = (await page.getByTestId('mission-claim-all').textContent()) ?? '';
  const total = Number(label.match(/\+([\d,]+)원/)?.[1]?.replace(/,/g, '') ?? '0');
  expect(total).toBeGreaterThanOrEqual(200);
  const g0 = await inScene(page, (s) => s.match.state.gold, null);
  await page.evaluate(() => {
    const b = document.querySelector('[data-testid="mission-claim-all"]') as HTMLButtonElement;
    for (let i = 0; i < 4; i++) b.click();
  });
  await expect(page.getByTestId('menu-badge-mission')).toHaveText('');
  await page.waitForTimeout(300);
  expect((await inScene(page, (s) => s.match.state.gold, null)) - g0).toBe(total);
});

for (const vp of [
  { width: 360, height: 800 },
  { width: 412, height: 915 },
]) {
  test(`${vp.width}px: 하단 메뉴 버튼·배지가 잘리지 않고, 닫힌 HUD·[준비 완료]가 배치 칸을 덮지 않는다`, async ({ page }) => {
    await page.setViewportSize(vp);
    await start(page, '?debug=1&seed=5');
    const cells = await inScene(page, (s) => s.match.map.buildable, null);
    await place(page, [[cells[0]![0], cells[0]![1], 'goblin']]);
    await expect(page.getByTestId('hud-ready')).toBeVisible();
    // 하단 메뉴 버튼·배지: 화면 안 + 배지는 버튼 안 + 글자 넘침 없음 (한 번에 잰다)
    const menu = await page.evaluate(() =>
      ['challenge', 'upgrade', 'mission', 'dev'].map((kind) => {
        const btn = document.querySelector(`[data-testid="menu-${kind}"]`)!.getBoundingClientRect();
        const badgeEl = document.querySelector(`[data-testid="menu-badge-${kind}"]`) as HTMLElement | null;
        const b = badgeEl?.getBoundingClientRect();
        return {
          kind,
          btn: { l: btn.left, r: btn.right, b: btn.bottom, h: btn.height },
          badge: badgeEl && badgeEl.textContent && b ? { l: b.left, r: b.right, fits: badgeEl.scrollWidth <= badgeEl.clientWidth + 1 } : null,
        };
      }),
    );
    for (const m of menu) {
      expect(m.btn.l, m.kind).toBeGreaterThanOrEqual(0);
      expect(m.btn.r, m.kind).toBeLessThanOrEqual(vp.width + 0.5);
      expect(m.btn.b, m.kind).toBeLessThanOrEqual(vp.height + 0.5);
      expect(m.btn.h, m.kind).toBeGreaterThanOrEqual(44);
      if (m.badge) {
        expect(m.badge.l, m.kind).toBeGreaterThanOrEqual(m.btn.l - 0.5);
        expect(m.badge.r, m.kind).toBeLessThanOrEqual(m.btn.r + 0.5);
        expect(m.badge.fits, m.kind).toBe(true);
      }
    }
    // 닫힌 HUD: 배치 칸 가운데·위아래 0.4칸 자리가 모두 캔버스 (HUD·준비 완료 누르는 영역이 칸을 덮지 않음)
    const covered = await page.evaluate((list) => {
      const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game') as {
        mapLayout: { originX: number; originY: number; tile: number };
      };
      const L = s.mapLayout;
      const r = document.getElementById('stage')!.getBoundingClientRect();
      const k = r.width / 1080;
      const bad: string[] = [];
      for (const [x, y] of list) {
        for (const dy of [-0.4, 0, 0.4]) {
          const px = r.left + (L.originX + (x + 0.5) * L.tile) * k;
          const py = r.top + (L.originY + (y + 0.5 + dy) * L.tile) * k;
          const el = document.elementFromPoint(px, py);
          if (el?.tagName !== 'CANVAS') bad.push(`${x},${y},${dy}:${el?.className ?? 'none'}`);
        }
      }
      return bad;
    }, cells);
    expect(covered).toEqual([]);
    if (vp.width === 360) {
      // 미션 시트 360px: 넘침 없음
      await page.getByTestId('menu-mission').click();
      await expect.poll(() => inScene(page, (s) => s.sheetOpen, null)).toBe('mission');
      await page.waitForTimeout(400);
      const over = await page.evaluate(() => {
        const out: string[] = [];
        for (const el of document.querySelectorAll('.layer-sheet *')) {
          const r = (el as HTMLElement).getBoundingClientRect();
          if (r.width > 0 && (r.left < -0.5 || r.right > window.innerWidth + 0.5)) out.push((el as HTMLElement).className);
        }
        return out;
      });
      expect(over).toEqual([]);
      await shot(page, 'F10-ui-mission-360');
    }
  });
}

test('기본 5종: 이름표 없이 나란히 흑백 캡처해도 서로 다르고, 큰 캐릭터(돌 골렘) 위 칸 누르기·길게 누르기가 된다', async ({ page, context }) => {
  await start(page, '?debug=1&seed=9');
  const five = ['miner', 'goblin', 'archer', 'apprentice', 'warrior'];
  const cells = await inScene(page, (s) => s.match.map.buildable.slice(0, 5), null);
  // 먼 칸에 타워 하나를 먼저 놓아 추천 칸 빛(첫 소환 전)을 끈다 — 빈 땅 사진에 빛이 섞이지 않게
  const far = await inScene(page, (s) => s.match.map.buildable[s.match.map.buildable.length - 1]!, null);
  await place(page, [[far[0], far[1], 'drummer']]);
  // 이름표 없이 (HUD·알림 숨김) 타워 칸 둘레를 잘라 나란히 + 흑백. 타워를 놓기 전 같은 자리(빈 땅)도 잘라 두고 실루엣(바뀐 픽셀)을 뽑는다
  await page.addStyleTag({ content: '.layer-hud,.layer-toast,.layer-guide{display:none!important}' });
  await page.waitForTimeout(300);
  const L = await inScene(page, (s) => s.mapLayout, null);
  const r = (await page.locator('#stage').boundingBox())!;
  const k = r.width / 1080;
  const cropAll = async (): Promise<string[]> => {
    const out: string[] = [];
    for (const [x, y] of cells) {
      const p = await tilePoint(page, x, y);
      const w = L.tile * k * 1.4;
      const buf = await page.screenshot({ clip: { x: p.x - w / 2, y: p.y - L.tile * k * 1.05, width: w, height: L.tile * k * 1.6 } });
      out.push(`data:image/png;base64,${buf.toString('base64')}`);
    }
    return out;
  };
  const empty = await cropAll();
  await place(page, cells.map(([x, y], i) => [x, y, five[i]!] as [number, number, string]));
  await page.waitForTimeout(600);
  const crops = await cropAll();
  const sheet = await context.newPage();
  await sheet.setViewportSize({ width: 412, height: 915 });
  await sheet.setContent(
    // isMobile 문맥이라 viewport 메타가 없으면 980px 너비로 그려져 작게 줄어든다
    `<meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#556;display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:center;gap:2px;padding-top:300px;height:915px;box-sizing:border-box">${crops
      .map((c) => `<img src="${c}" style="width:80px;flex:none;filter:grayscale(1)">`)
      .join('')}<div style="width:100%"></div>${empty.map((c) => `<img class="bg" src="${c}" style="width:80px;flex:none;opacity:0">`).join('')}</body>`,
  );
  await sheet.waitForTimeout(200);
  // 흑백 실루엣 검사 (F10-4 검토: 예전엔 배경까지 든 자른 그림의 평균 차이만 봐서 실루엣이 다르다는 증거가 못 됐다)
  //  - 실루엣 = 빈 땅과 흑백 값이 크게 다른 픽셀. 다섯 실루엣이 서로 충분히 겹치지 않는다 (서로 다른 모양: 다른 부분 / 합친 부분)
  //  - 배경과 갈라진다: 실루엣 픽셀이 칸 둘레의 일정 비율 이상 (밝은 궁수·고블린이 풀밭에 묻히지 않게, 진한 외곽선)
  const sil = await sheet.evaluate(async () => {
    const W = 56;
    const H = 64;
    const gray = (im: HTMLImageElement): Uint8ClampedArray => {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const g = c.getContext('2d')!;
      g.filter = 'grayscale(1)';
      g.drawImage(im, 0, 0, W, H);
      return g.getImageData(0, 0, W, H).data;
    };
    const figs = [...document.images].filter((im) => !im.classList.contains('bg')).map(gray);
    const bgs = [...document.images].filter((im) => im.classList.contains('bg')).map(gray);
    const masks = figs.map((f, i) => {
      const b = bgs[i]!;
      const m = new Uint8Array(W * H);
      for (let p = 0; p < m.length; p++) m[p] = Math.abs(f[p * 4]! - b[p * 4]!) > 40 ? 1 : 0;
      return m;
    });
    const area = masks.map((m) => m.reduce((a, v) => a + v, 0) / m.length);
    const xor: number[] = [];
    for (let i = 0; i < masks.length; i++) {
      for (let j = i + 1; j < masks.length; j++) {
        let x = 0;
        let u = 0;
        for (let p = 0; p < W * H; p++) {
          const a = masks[i]![p]!;
          const b = masks[j]![p]!;
          if (a || b) u++;
          if (a !== b) x++;
        }
        xor.push(u > 0 ? x / u : 0);
      }
    }
    return { area, xor };
  });
  console.log('기본 5종 흑백 실루엣', JSON.stringify(sil));
  // 면적 하한 0.1: F10-4 실측 0.12~0.31, A-1에서 맵 위아래 여백을 없애 칸이 커진(135 → 141px) 뒤 고블린 0.116 (외곽선 두께가 정수 px로 반올림됨)
  for (const a of sil.area) expect(a).toBeGreaterThan(0.1);
  for (const x of sil.xor) expect(x).toBeGreaterThan(0.2);
  // 다섯 장이 서로 충분히 다르다 (흑백 평균 차이)
  const diffs = await sheet.evaluate(async () => {
    const imgs = [...document.images].filter((im) => !im.classList.contains('bg'));
    const data = imgs.map((im) => {
      const c = document.createElement('canvas');
      c.width = 48;
      c.height = 56;
      const g = c.getContext('2d')!;
      g.filter = 'grayscale(1)';
      g.drawImage(im, 0, 0, 48, 56);
      return g.getImageData(0, 0, 48, 56).data;
    });
    const out: number[] = [];
    for (let i = 0; i < data.length; i++) {
      for (let j = i + 1; j < data.length; j++) {
        let s = 0;
        for (let p = 0; p < data[i]!.length; p += 4) s += Math.abs(data[i]![p]! - data[j]![p]!);
        out.push(s / (data[i]!.length / 4));
      }
    }
    return out;
  });
  for (const d of diffs) expect(d).toBeGreaterThan(8);
  mkdirSync('test-results/screens', { recursive: true });
  await sheet.screenshot({ path: 'test-results/screens/F10-ui-five-gray.png' });
  if (SAVE_DOCS) await sheet.screenshot({ path: 'docs/screens/F10-ui-five-gray.png' });
  await sheet.close();
  await page.addStyleTag({ content: '.layer-hud,.layer-toast{display:block!important}' });

  // 큰 캐릭터: 2×2 블록에서 위아래로 붙은 빈 두 칸을 찾아 아래에 돌 골렘 (×1.25)
  const pair = await inScene(
    page,
    (s) => {
      const used = new Set(s.match.towers().map((t) => `${t.tx},${t.ty}`));
      const set = new Set(s.match.map.buildable.map(([x, y]) => `${x},${y}`));
      for (const [x, y] of s.match.map.buildable) if (set.has(`${x},${y + 1}`) && !used.has(`${x},${y}`) && !used.has(`${x},${y + 1}`)) return { ux: x, uy: y };
      return null;
    },
    null,
  );
  expect(pair).not.toBeNull();
  const { ux, uy } = pair!;
  await place(page, [[ux, uy + 1, 'stonegolem']]);
  const golem = (await myTowers(page)).find((t) => t.tx === ux && t.ty === uy + 1)!;
  await expect.poll(() => inScene(page, (s, id) => s.towerLayer.artScaleOf(id), golem.id)).toBeGreaterThan(1); // v0.1.17: 노말 골렘 ≈1.04 (등급 배율 × 1.4, 이웃과 무관)
  const n0 = (await myTowers(page)).length;
  // 위 칸이 빈 배치 칸일 때: 골렘 머리 중 위 칸 아래쪽 1/3(크기 1 높이)을 누르면 골렘 (위 칸에 소환되지 않음)
  await page.waitForTimeout(400);
  await tapTile(page, ux, uy, 0.35);
  await expect.poll(() => inScene(page, (s) => s.selectedTowerId, null)).toBe(golem.id);
  expect((await myTowers(page)).length).toBe(n0);
  await tapTile(page, ux, uy, 0.35); // 다시 눌러 패널 닫기
  await expect.poll(() => inScene(page, (s) => s.selectedTowerId, null)).toBeNull();
  // F10-4 검토: 빈 위 칸의 가운데를 누르면 (골렘 머리가 그려져 있어도) 그 칸에 소환된다 — 칸 테두리가 숨어 있어 가운데가 소환 자리
  // G-1 칸 무더기: 노말 5종이 이미 판 위에 있어 새 타워는 같은 캐릭터 칸에 쌓일 수 있다 (사용자 결정) → '하나 늘었고 위 칸 또는 같은 캐릭터 칸'
  const before = await myTowers(page);
  await tapTile(page, ux, uy, 0.05);
  await expect.poll(async () => (await myTowers(page)).length).toBe(before.length + 1);
  const added = (await myTowers(page)).find((t) => !before.some((b) => b.id === t.id))!;
  expect(added.tx === ux && added.ty === uy ? true : before.some((b) => b.tx === added.tx && b.ty === added.ty && b.tower === added.tower)).toBe(true);
  expect(await inScene(page, (s) => s.selectedTowerId, null)).toBeNull();
  if (!(await myTowers(page)).some((t) => t.tx === ux && t.ty === uy)) await place(page, [[ux, uy, 'drummer']]);
  // 위 칸에 타워가 있으면 위 칸 가운데(0.0) 누르기 = 위 타워
  const upper = (await myTowers(page)).find((t) => t.tx === ux && t.ty === uy)!;
  await page.waitForTimeout(300);
  await tapTile(page, ux, uy, 0);
  await expect.poll(() => inScene(page, (s) => s.selectedTowerId, null)).toBe(upper.id);
  await tapTile(page, ux, uy, 0);
  // 길게 눌러 끌기: 위 타워를 0.5초 누르면 위 타워가 들린다 (골렘이 아니라)
  const p = await tilePoint(page, ux, uy, 0);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await expect.poll(() => inScene(page, (s) => s.dragState?.id ?? null, null), { timeout: 5000 }).toBe(upper.id);
  await page.mouse.up();
});

test('개발자 도구 "이번 판 기록": 첫 소환·준비 완료·첫 승급·보스 등장 시각', async ({ page }) => {
  await start(page, '?debug=1&seed=65');
  await page.getByTestId('hud-summon').click();
  await expect.poll(async () => (await myTowers(page)).length).toBe(1);
  await page.getByTestId('hud-ready').click();
  await expect.poll(() => inScene(page, (s) => s.match.state.stage, null)).toBe(1);
  const cells = await inScene(page, (s) => s.match.map.buildable.slice(10, 13), null);
  await place(page, cells.map(([x, y]) => [x, y, 'goblin'] as [number, number, string]));
  await inScene(
    page,
    (s, c) => {
      s.match.world.enqueue({ type: 'merge', x: c[0], y: c[1] });
      s.debugFastForward(1);
    },
    cells[0]!,
  );
  await page.getByTestId('menu-dev').click();
  const log = page.getByTestId('dev-run-log');
  await expect(log).toContainText('첫 소환');
  await expect(log).toContainText('준비 완료');
  await expect(log).toContainText('초 일찍');
  await expect(log).toContainText('1단계');
  await expect.poll(async () => (await inScene(page, (s) => s.runLogRows, null)).find((r) => r.label === '첫 승급')?.value ?? '—').not.toBe('—');
  // 10단계로 건너뛰면 보스 등장 줄
  await inScene(
    page,
    (s) => {
      while (s.match.state.stage < 10) {
        s.match.world.enqueue({ type: 'debugSkipStage' });
        s.debugFastForward(1);
      }
    },
    null,
  );
  await expect(log).toContainText('10단계 박쥐 여왕');
  await expect(log).toContainText('등장');
});
