/**
 * 피드백 #75 '제안: 이펙트 끄기 버튼 / 효과 끄기 버튼' (휴대폰 412×915, 일반 주소 — 개발자 모드 아님):
 * 일시정지 메뉴 '✨ 화려한 효과' 스위치(기본 켜짐 = 효과 보임 — 결정 M, 저장값 effectsOff는 반대) → 끄면 UI 루트 .fx-off(DOM 애니메이션 끔) + 소환 반짝임(초상 카드)·피해 숫자가 안 나온다.
 * 값은 계정 설정 rtd.settings.effectsOff(true = 효과 끔)에 남아 다시 열어도·새 판에도 그대로, 로비 ⚙ 설정의 같은 스위치로도 바꾼다.
 * 메뉴는 한 줄이 늘어도 412×915 한 화면 안.
 */
import { expect, test, type Page } from '@playwright/test';
import { clickStart, openLobbyMenu } from './title';

test.describe.configure({ timeout: 150_000 });

type SceneLike = {
  summonFxStats: { shown: number };
  floatingLabels: unknown[];
  match: { towers(): unknown[] };
};

async function inScene<R>(page: Page, fn: (s: SceneLike) => R): Promise<R> {
  return page.evaluate((src) => {
    const s = (window as unknown as { __rtd: { game: { scene: { getScene(k: string): unknown } } } }).__rtd.game.scene.getScene('Game');
    return new Function('s', `return (${src})(s);`)(s) as R;
  }, fn.toString());
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

const savedEffectsOff = (page: Page): Promise<unknown> => page.evaluate(() => JSON.parse(localStorage.getItem('rtd.settings') ?? '{}').effectsOff);

test('✨ 화려한 효과: 일시정지 메뉴 스위치를 끄면 소환 반짝임·피해 숫자 없음, 다시 열어도·새 판에도 남고 로비 설정에서 다시 켠다', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=42');
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
  const root = page.locator('#ui-root');
  await expect(root).not.toHaveClass(/fx-off/);

  // 효과 켜짐(기본): 소환하면 초상 카드 반짝임이 나온다
  await page.getByTestId('hud-summon').click();
  await expect.poll(() => inScene(page, (s) => s.match.towers().length)).toBe(1);
  await expect.poll(() => inScene(page, (s) => s.summonFxStats.shown)).toBeGreaterThan(0);

  // 일시정지 메뉴: 자동 판매 줄 아래 '✨ 화려한 효과' (기본 켜짐 = 효과 보임), 메뉴는 한 화면 안
  await page.locator('[data-action="pause"]').click();
  const sw = page.getByTestId('pause-effects-off');
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await expect(sw).toHaveAttribute('aria-label', '✨ 화려한 효과');
  await expect(sw).toHaveText('켜짐');
  await expect(sw).toHaveClass(/is-on/);
  const row = page.locator('.pause-setting', { has: sw });
  await expect(row).toContainText('✨ 화려한 효과');
  await expect(row).not.toContainText('끄기');
  // 이름이 한 줄 (줄바꿈·잘림 없음): 이름 칸 높이가 글자 한 줄, 글자가 칸 밖으로 넘치지 않는다
  const nameFits = await row.locator('.pause-setting-name').evaluate((el) => {
    const cs = getComputedStyle(el);
    return { heightInEm: el.getBoundingClientRect().height / parseFloat(cs.fontSize), over: el.scrollWidth - el.clientWidth };
  });
  expect(nameFits.heightInEm).toBeLessThan(2); // 한 줄 ≈ 1.2~1.5em, 두 줄이면 2.4em 이상
  expect(nameFits.over).toBeLessThanOrEqual(1);
  const panel = (await page.locator('.pause-panel').boundingBox())!;
  expect(panel.y).toBeGreaterThanOrEqual(0);
  expect(panel.y + panel.height).toBeLessThanOrEqual(915);
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await expect(sw).toHaveText('꺼짐');
  await expect(sw).not.toHaveClass(/is-on/);
  await expect(root).toHaveClass(/fx-off/);
  expect(await savedEffectsOff(page)).toBe(true);
  await page.locator('[data-action="resume"]').click();

  // 효과 끔: 소환해도 반짝임 수가 늘지 않고, 몹을 때려도 피해 숫자가 안 뜬다
  const shown = await inScene(page, (s) => s.summonFxStats.shown);
  await page.getByTestId('hud-summon').click();
  await expect.poll(() => inScene(page, (s) => s.match.towers().length)).toBe(2);
  for (let i = 0; i < 8; i++) {
    expect(await inScene(page, (s) => s.summonFxStats.shown)).toBe(shown);
    expect(await inScene(page, (s) => s.floatingLabels.length)).toBe(0);
    await page.waitForTimeout(500);
  }

  // 다시 열어도 남는다 (일반 주소에서도 저장값을 따른다) → 로비 ⚙ 설정에도 같은 값
  await page.goto('/?seed=42');
  await expect(page.locator('[data-screen="title"][data-lobby="1"]')).toBeVisible();
  await expect(root).toHaveClass(/fx-off/);
  // PR-D: [설정]은 로비 메뉴 안
  await openLobbyMenu(page);
  await page.locator('[data-action=\"settings\"]').click();
  const lobbySw = page.getByTestId('lobby-effects-off');
  await expect(lobbySw).toHaveAttribute('aria-checked', 'false');
  await expect(lobbySw).toHaveText('꺼짐');
  await expect(lobbySw).toHaveAttribute('aria-label', '✨ 화려한 효과');
  await expect(page.locator('.lobby-setting', { has: lobbySw })).toContainText('✨ 화려한 효과');

  // 새 판에도 남는다 (판 안 스위치처럼 꺼짐으로 돌아가지 않음)
  await page.getByTestId('settings-dialog-close').click();
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
  await expect(root).toHaveClass(/fx-off/);
  await page.locator('[data-action="pause"]').click();
  await expect(page.getByTestId('pause-effects-off')).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('pause-effects-off')).toHaveText('꺼짐');

  // 로비 설정에서 다시 켜면 저장값 effectsOff false, .fx-off도 빠진다
  await page.goto('/?seed=42');
  // PR-D: [설정]은 로비 메뉴 안
  await openLobbyMenu(page);
  await page.locator('[data-action=\"settings\"]').click();
  await page.getByTestId('lobby-effects-off').click();
  await expect(page.getByTestId('lobby-effects-off')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('lobby-effects-off')).toHaveText('켜짐');
  await expect(page.getByTestId('lobby-effects-off')).toHaveClass(/is-on/);
  await expect(root).not.toHaveClass(/fx-off/);
  expect(await savedEffectsOff(page)).toBe(false);
  expect(errors).toEqual([]);
});
