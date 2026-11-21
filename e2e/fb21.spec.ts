/**
 * 피드백 #21 '캐릭터 테두리 색을 등급별로 (흰색·빨간색·보라색 등)':
 * 맵 위 캐릭터 몸 그림(바깥 WebP)의 빛 테두리를 등급 색으로 굽는다 — 받침대·별 배지와 같은 등급 색.
 * v0.1.14 통합: 색·두께는 디자인 PR #54(FB-D1 #21, gradeOutline.gradeOutlineColor). 이 검사는 실제 판 위 텍스처에 등급 띠가 구워졌는지 본다.
 * 등급 7종 캐릭터를 세우고, 몸 텍스처 키(`<그림>-ol-<등급>`)와 테두리 픽셀 색이 그 등급 색인지 본다.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { clickStart } from './title';
import { gradeOutlineColor } from '../src/art/characters/gradeOutline';
import type { Grade } from '../src/data/load';
import { E2E_MATCH_SWITCHES_OFF } from './seed';

type Pres = { pedestal: string; body: string | null };
type SceneLike = {
  match: {
    map: { buildable: [number, number][] };
    rules: { towerOrder: string[] };
    towers(): { id: number; tower: string }[];
    world: { enqueue(c: Record<string, unknown>): { ok: boolean } };
  };
  mapLayout: { tile: number };
  towerLayer: { presentationOf(id: number): Pres | null };
  textures: { get(k: string): { getSourceImage(): HTMLCanvasElement } };
  debugFastForward(n: number): number;
};

async function sim<T, A = null>(page: Page, fn: (s: SceneLike, a: A) => T, arg: A = null as A): Promise<T> {
  return page.evaluate(
    ([src, a]) => {
      const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game');
      return (0, eval)(src)(s, a);
    },
    [`(${fn.toString()})`, arg] as const,
  ) as Promise<T>;
}

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

test('피드백 #21: 맵 캐릭터 테두리 = 등급 색 (받침대와 같은 색, 등급 7종이 서로 다름)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript((off) => localStorage.setItem('rtd.settings', JSON.stringify({ v: 1, tapMerge: false, ...off })), E2E_MATCH_SWITCHES_OFF);
  await page.goto('/?debug=1&seed=42');
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
  await expect.poll(() => sim(page, (s) => s.mapLayout.tile)).toBeGreaterThan(0);
  // 노말·레어·유니크·히어로·레전드·신·리미티드
  const ids = ['miner', 'merchant', 'icemage', 'summoner', 'dragoncaller', 'fate', 'elemental'];
  await sim(
    page,
    (s, l) => {
      const b = s.match.map.buildable;
      const picks = [0, 3, 6, 9, 12, 15, 18].map((i) => b[i % b.length]!);
      l.forEach((id, i) => s.match.world.enqueue({ type: 'debugTower', x: picks[i]![0], y: picks[i]![1], t: s.match.rules.towerOrder.indexOf(id) }));
      s.debugFastForward(1);
    },
    ids,
  );
  await page.waitForTimeout(500);
  // 몸 텍스처 가운데 줄을 왼쪽에서 훑어 처음 나오는 진한 픽셀 = 가장 바깥 테두리
  const rows = await sim(page, (s) =>
    s.match.towers().map((t) => {
      const p = s.towerLayer.presentationOf(t.id)!;
      let edge: number[] | null = null;
      if (p.body) {
        const cv = s.textures.get(p.body).getSourceImage();
        const d = cv.getContext('2d')!.getImageData(0, Math.floor(cv.height * 0.55), cv.width, 1).data;
        for (let x = 0; x < cv.width; x++) {
          if (d[x * 4 + 3]! > 200) {
            edge = [d[x * 4]!, d[x * 4 + 1]!, d[x * 4 + 2]!];
            break;
          }
        }
      }
      return { tower: t.tower, grade: p.pedestal.replace('pedestal-', ''), body: p.body, edge };
    }),
  );
  expect(rows).toHaveLength(7);
  expect(new Set(rows.map((r) => r.grade)).size).toBe(7);
  for (const r of rows) {
    expect(r.body, r.tower).toMatch(new RegExp(`-ol-${r.grade}$`));
    expect(r.edge, r.tower).not.toBeNull();
    const want = rgb(gradeOutlineColor(r.grade as Grade));
    for (let i = 0; i < 3; i++) expect(Math.abs(r.edge![i]! - want[i]!), `${r.tower} ${r.grade} ${r.edge}`).toBeLessThanOrEqual(24);
  }
  if (process.env.SAVE_SCREENS) {
    mkdirSync('docs/screens', { recursive: true });
    await page.screenshot({ path: 'docs/screens/FB21-borders.png', animations: 'disabled' });
  }
  expect(errors).toEqual([]);
});
