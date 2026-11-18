/**
 * 피드백 #63 '레어 이하 자동 승급, 유니크 이하 자동 승급...' — 일시정지 메뉴 '자동 승급' 줄:
 * 누를 때마다 꺼짐 → 노말 → 레어 이하 → 유니크 이하 → 히어로 이하 → 꺼짐, 켜면 그 등급 이하 가득 찬 무더기를 바로 승급한다
 * (autoMerge 명령), 설정은 rtd.settings에 남고, 메뉴는 화면 안에 들어간다.
 */
import { expect, test, type Page } from '@playwright/test';
import { clickStart } from './title';

test.describe.configure({ timeout: 150_000 });

type SceneLike = {
  match: {
    state: { merges: number };
    towers(): { id: number; tower: string; tx: number; ty: number }[];
    rules: { towers: Map<string, { grade: string }> };
    world: { enqueue(c: unknown): { ok: boolean } };
  };
  debugFastForward(n: number): number;
};

async function inScene<R, A>(page: Page, fn: (s: SceneLike, arg: A) => R, arg: A): Promise<R> {
  return page.evaluate(
    ([src, a]) => {
      const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game');
      return new Function('s', 'a', `return (${src})(s, a);`)(s, a) as R;
    },
    [fn.toString(), arg] as const,
  );
}

/** 가득 찬(3개) 내 무더기의 등급 목록 */
function fullStackGrades(page: Page): Promise<string[]> {
  return inScene(
    page,
    (s) => {
      const by = new Map<string, string[]>();
      for (const t of s.match.towers()) {
        const k = `${t.tx},${t.ty}`;
        by.set(k, [...(by.get(k) ?? []), t.tower]);
      }
      return [...by.values()].filter((l) => l.length >= 3).map((l) => s.match.rules.towers.get(l[0]!)?.grade ?? '?');
    },
    null,
  );
}

test('피드백 #63: [자동 승급] 꺼짐 → 노말 → 레어 이하 → 유니크 이하 → 히어로 이하, 켜면 그 등급 이하 무더기를 바로 승급', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?dev=1&seed=42');
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();

  await page.locator('[data-action="pause"]').click();
  const btn = page.getByTestId('pause-auto-merge');
  await expect(btn).toHaveText('꺼짐');
  await expect(btn).toHaveAttribute('data-value', 'off');
  // 메뉴 전체가 화면 안 (줄을 하나 더해도 [로비로]가 보인다), 버튼 글자는 한 줄
  const exitBox = (await page.locator('[data-action="exit"]').boundingBox())!;
  expect(exitBox.y + exitBox.height).toBeLessThanOrEqual(915);
  const labels: string[] = [];
  for (let i = 0; i < 5; i++) {
    await btn.click();
    labels.push((await btn.textContent()) ?? '');
    const box = (await btn.boundingBox())!;
    expect(box.height).toBeLessThan(60);
  }
  expect(labels).toEqual(['노말', '레어 이하', '유니크 이하', '히어로 이하', '꺼짐']);
  // 레어 이하로
  await btn.click();
  await btn.click();
  await expect(btn).toHaveText('레어 이하');
  await expect(btn).toHaveClass(/is-on/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rtd.settings') ?? '{}').autoMerge)).toBe('rare');
  await page.locator('[data-action="resume"]').click();

  // 소환을 많이 하면 노말·레어 가득 찬 무더기는 바로 승급되어 남지 않는다
  await inScene(page, (s) => {
    s.match.world.enqueue({ type: 'debugAddGold', amount: 1_000_000 });
    s.debugFastForward(1);
    return null;
  }, null);
  for (let i = 0; i < 30; i++) await inScene(page, (s) => s.match.world.enqueue({ type: 'summonAuto' }).ok, null);
  await expect.poll(() => inScene(page, (s) => s.match.state.merges, null)).toBeGreaterThan(0);
  await expect.poll(async () => (await fullStackGrades(page)).filter((g) => g === 'normal' || g === 'rare').length).toBe(0);

  // 끄면 (꺼짐까지 돌리면) 더 승급하지 않는다
  await page.locator('[data-action="pause"]').click();
  for (let i = 0; i < 3; i++) await btn.click();
  await expect(btn).toHaveText('꺼짐');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rtd.settings') ?? '{}').autoMerge)).toBe('off');
  await page.locator('[data-action="resume"]').click();
  const before = await inScene(page, (s) => s.match.state.merges, null);
  for (let i = 0; i < 20; i++) await inScene(page, (s) => s.match.world.enqueue({ type: 'summonAuto' }).ok, null);
  await inScene(page, (s) => s.debugFastForward(20), null);
  expect(await inScene(page, (s) => s.match.state.merges, null)).toBe(before);
  expect(errors).toEqual([]);
});
