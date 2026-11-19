/**
 * U-1 앱 안 업데이트 E2E — 안드로이드 앱의 자바 다리(window.RandomTDNative)를 addInitScript로 흉내 낸다.
 * 가짜 다리는 checkUpdate에만 정해 둔 답을 보내고, 그 뒤 사건(진행·확인·설치·실패)은 테스트가 window.__rtdUpdate로 직접 보낸다.
 * - 새 버전 창: 버전 둘 + 바뀐 점(설치 안내 줄 빠짐), [나중에] → 닫히고 게임 시작·일시정지 가능, 다시 확인하지 않음
 * - [지금 업데이트] → 진행 막대 → 확인 중 → 설치 화면 안내 → 사용자가 설치 화면에서 취소 → 알림
 * - 설치 권한 없음 → 설명 + [설정 열기] → 돌아와 받기 시작
 * - 받는 중 실패 → 창 닫힘 + 알림, 게임 그대로 / 받는 중 [취소]·뒤로 가기
 * - 다리 없음(브라우저) → 창도 __rtdUpdate도 없음 / 새 버전 없음·확인 실패 → 조용히 / 확인이 늦게 끝나 이미 전투면 창을 띄우지 않음
 * 스크린샷 (412×915, deviceScaleFactor 1): docs/screens/U1-update-dialog.png · U1-update-progress.png
 */
import { expect, test, type Page } from '@playwright/test';
import { clickStart } from './title';

const OFFER = {
  type: 'available',
  version: '0.1.10',
  current: '0.1.9',
  size: 14717353,
  notes: [
    'Assets의 APK를 내려받아 설치하거나 기존 앱 위에 업데이트하세요 (v0.1.7과 같은 앱 ID·서명). 앱은 오프라인에서 동작합니다.',
    '',
    '### 바뀐 점',
    '- U-1 자동 릴리스·앱 안 업데이트',
    '- 전투 화면 소환 연출: 캐릭터 2배·주사위가 머리 위에서 멈춤',
    '- 독립 검토 반영: HUD 한계 갱신·이웃 판정 하나로',
    '- 맵 위아래 여백 없앰',
  ].join('\n'),
};

type CheckAnswer = Record<string, unknown> | null;

/** 가짜 자바 다리. check = checkUpdate에 대한 답 (null이면 답하지 않음 — 테스트가 직접 보냄) */
async function installFakeBridge(page: Page, check: CheckAnswer): Promise<void> {
  await page.addInitScript((answer: CheckAnswer) => {
    const w = window as unknown as { RandomTDNative: unknown; __rtdUpdate?: (p: unknown) => void; __updateCalls: string[] };
    w.__updateCalls = [];
    const call = (name: string): void => {
      w.__updateCalls.push(name);
    };
    w.RandomTDNative = {
      checkUpdate(): void {
        call('check');
        if (answer) setTimeout(() => w.__rtdUpdate?.(answer), 150);
      },
      startUpdate: () => call('start'),
      openInstallSettings: () => call('settings'),
      cancelUpdate: () => call('cancel'),
    };
  }, check);
}

async function send(page: Page, payload: Record<string, unknown>): Promise<void> {
  await page.evaluate((p) => (window as unknown as { __rtdUpdate: (x: unknown) => void }).__rtdUpdate(p), payload);
}

const calls = (page: Page): Promise<string[]> => page.evaluate(() => [...(window as unknown as { __updateCalls: string[] }).__updateCalls]);

async function openTitle(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('[data-screen="title"]')).toBeVisible();
}

const dialog = (page: Page) => page.getByTestId('update-dialog');
const toast = (page: Page, text: string) => page.locator('.layer-toast .toast', { hasText: text });

async function openOffer(page: Page): Promise<void> {
  await installFakeBridge(page, OFFER);
  await openTitle(page);
  await expect(dialog(page)).toBeVisible();
}

test.describe('U-1 앱 안 업데이트', () => {
  test('새 버전 창: 버전·바뀐 점, [나중에] → 닫히고 게임은 그대로, 다시 묻지 않음', async ({ page }) => {
    await openOffer(page);
    await expect(page.getByTestId('update-title')).toHaveText('새 버전 v0.1.10이 나왔어요 (지금 v0.1.9)');
    const notes = page.getByTestId('update-notes');
    await expect(notes).toContainText('• U-1 자동 릴리스·앱 안 업데이트');
    await expect(notes).toContainText('바뀐 점');
    await expect(notes).not.toContainText('Assets의 APK');
    await expect(page.getByTestId('update-status')).toHaveText('내려받기 14.0MB · 계정·기록은 그대로예요. 진행 중인 판은 이어 할 수 있고, 게임 규칙이 바뀐 업데이트면 그때까지의 보상을 받고 끝나요.');
    await expect(page.getByTestId('update-progress')).toBeHidden();
    await expect(page.getByTestId('update-now')).toBeVisible();
    // 창이 화면 안에 들어오고 버튼이 손가락 크기
    const box = await dialog(page).boundingBox();
    expect(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 412 && box.y + box.height <= 915).toBe(true);
    const btn = await page.getByTestId('update-now').boundingBox();
    expect(btn?.height ?? 0).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: 'docs/screens/U1-update-dialog.png', animations: 'disabled' });

    await page.getByTestId('update-later').click();
    await expect(dialog(page)).toBeHidden();
    expect(await calls(page)).toEqual(['check']);
    // 게임은 그대로: 시작 → 전투 → 일시정지
    await clickStart(page);
    await expect(page.locator('[data-screen="game"]')).toBeVisible();
    await page.locator('[data-action="pause"]').click();
    await expect(page.locator('[data-screen="pause"]')).toBeVisible();
    // 늦게 온 사건은 무시 (나중에 = 이번 실행에서 끝)
    await send(page, { type: 'progress', received: 1, total: 2 });
    await expect(dialog(page)).toBeHidden();
    expect(await calls(page)).toEqual(['check']);
  });

  test('[지금 업데이트] → 진행 막대 → 확인 중 → 설치 화면 안내 → 설치 화면에서 취소하면 알림', async ({ page }) => {
    await openOffer(page);
    await page.getByTestId('update-now').click();
    await expect.poll(() => calls(page)).toEqual(['check', 'start']);
    // 버튼은 자바가 답할 때까지 그대로 (권한이 있으면 바로 progress 0)
    await send(page, { type: 'progress', received: 0, total: 14717353 });
    await expect(page.getByTestId('update-progress')).toBeVisible();
    await expect(page.getByTestId('update-notes')).toBeHidden();
    await expect(page.getByTestId('update-cancel')).toBeVisible();
    await send(page, { type: 'progress', received: 7358677, total: 14717353 });
    await expect(page.getByTestId('update-status')).toHaveText('내려받는 중… 50% (7.0MB / 14.0MB)');
    await expect(page.getByTestId('update-progress')).toHaveAttribute('aria-valuenow', '50');
    await page.screenshot({ path: 'docs/screens/U1-update-progress.png', animations: 'disabled' });
    await send(page, { type: 'progress', received: 14717353, total: 14717353 });
    await send(page, { type: 'verifying' });
    await expect(page.getByTestId('update-status')).toHaveText('받은 파일을 확인하는 중이에요…');
    await send(page, { type: 'installing' });
    await expect(page.getByTestId('update-status')).toHaveText('설치 화면을 여는 중이에요…');
    await send(page, { type: 'installing', step: 'confirm' });
    await expect(page.getByTestId('update-status')).toContainText('설치 화면에서 [업데이트]를 눌러 주세요');
    await expect(page.getByTestId('update-close')).toBeVisible();
    // 시스템 설치 화면에서 취소
    await send(page, { type: 'error', code: 'aborted' });
    await expect(dialog(page)).toBeHidden();
    await expect(toast(page, '업데이트를 취소했어요')).toBeVisible();
    await clickStart(page);
    await expect(page.locator('[data-screen="game"]')).toBeVisible();
  });

  test('설치 권한 없음 → 설명 + [설정 열기] → 돌아와 받기 시작', async ({ page }) => {
    await openOffer(page);
    await page.getByTestId('update-now').click();
    await send(page, { type: 'permission' });
    await expect(page.getByTestId('update-status')).toContainText('출처를 알 수 없는 앱 설치');
    await page.getByTestId('update-settings').click();
    await expect.poll(() => calls(page)).toEqual(['check', 'start', 'settings']);
    // 설정에서 허용하고 돌아옴 (자바 onResume → 받기 시작)
    await send(page, { type: 'progress', received: 0, total: 100 });
    await expect(page.getByTestId('update-progress')).toBeVisible();
    await expect(page.getByTestId('update-status')).toContainText('내려받는 중… 0%');
  });

  test('설정에서 허용하지 않고 돌아오면 알림 후 게임 그대로', async ({ page }) => {
    await openOffer(page);
    await page.getByTestId('update-now').click();
    await send(page, { type: 'permission' });
    await page.getByTestId('update-settings').click();
    await send(page, { type: 'error', code: 'permission' });
    await expect(dialog(page)).toBeHidden();
    await expect(toast(page, '설치 권한이 없어 업데이트를 멈췄어요')).toBeVisible();
  });

  test('받는 중 실패 → 창 닫힘 + 짧은 알림, 게임은 그대로', async ({ page }) => {
    await openOffer(page);
    await page.getByTestId('update-now').click();
    await send(page, { type: 'progress', received: 1000, total: 14717353 });
    await send(page, { type: 'error', code: 'network' });
    await expect(dialog(page)).toBeHidden();
    await expect(toast(page, '업데이트를 받지 못했어요. 인터넷 연결을 확인해 주세요')).toBeVisible();
    await clickStart(page);
    await expect(page.locator('[data-screen="game"]')).toBeVisible();
  });

  test('받은 파일이 맞지 않으면 알림 (자바가 파일을 지움)', async ({ page }) => {
    await openOffer(page);
    await page.getByTestId('update-now').click();
    await send(page, { type: 'progress', received: 14717353, total: 14717353 });
    await send(page, { type: 'verifying' });
    await send(page, { type: 'error', code: 'digest' });
    await expect(dialog(page)).toBeHidden();
    await expect(toast(page, '받은 파일이 맞지 않아 지웠어요')).toBeVisible();
  });

  test('받는 중 [취소] → 다리 cancelUpdate, 창 닫힘', async ({ page }) => {
    await openOffer(page);
    await page.getByTestId('update-now').click();
    await send(page, { type: 'progress', received: 1000, total: 14717353 });
    await page.getByTestId('update-cancel').click();
    await expect(dialog(page)).toBeHidden();
    expect(await calls(page)).toEqual(['check', 'start', 'cancel']);
    await send(page, { type: 'cancelled' });
    await expect(toast(page, '업데이트')).toHaveCount(0);
  });

  test('안드로이드 뒤로 가기: 창을 닫고(나중에) 앱은 닫히지 않음 · 받는 중이면 취소', async ({ page }) => {
    await openOffer(page);
    const back = (): Promise<boolean> =>
      page.evaluate(() => !window.dispatchEvent(new Event('randomtd:native-back', { cancelable: true })));
    expect(await back()).toBe(true);
    await expect(dialog(page)).toBeHidden();
    expect(await calls(page)).toEqual(['check']);
    // 타이틀에서 창이 없으면 처리하지 않음 (앱 종료) — 예전 그대로
    expect(await back()).toBe(false);

    // 받는 중 뒤로 가기 = 취소 (새로고침 = 새 실행)
    await page.reload();
    await expect(dialog(page)).toBeVisible();
    await page.getByTestId('update-now').click();
    await send(page, { type: 'progress', received: 10, total: 100 });
    expect(await back()).toBe(true);
    await expect(dialog(page)).toBeHidden();
    await expect.poll(() => calls(page)).toEqual(['check', 'start', 'cancel']);
  });

  test('다리가 없으면(브라우저·PWA) 아무것도 하지 않음', async ({ page }) => {
    await openTitle(page);
    await page.waitForTimeout(800);
    await expect(dialog(page)).toHaveCount(0);
    expect(await page.evaluate(() => typeof (window as unknown as { __rtdUpdate?: unknown }).__rtdUpdate)).toBe('undefined');
  });

  test('새 버전 없음·확인 실패(오프라인)는 조용히', async ({ page }) => {
    await installFakeBridge(page, { type: 'none', current: '0.1.9' });
    await openTitle(page);
    await expect.poll(() => calls(page)).toEqual(['check']);
    await page.waitForTimeout(600);
    await expect(dialog(page)).toBeHidden();

    const p2 = await page.context().newPage();
    await installFakeBridge(p2, { type: 'error', code: 'network' });
    await openTitle(p2);
    await expect.poll(() => calls(p2)).toEqual(['check']);
    await p2.waitForTimeout(600);
    await expect(dialog(p2)).toBeHidden();
    await expect(p2.locator('.layer-toast .toast')).toHaveCount(0);
  });

  test('확인이 늦게 끝나 이미 전투면 창을 띄우지 않는다 (타이틀로 돌아오면 그때)', async ({ page }) => {
    await installFakeBridge(page, null);
    await openTitle(page);
    await expect.poll(() => calls(page)).toEqual(['check']);
    await clickStart(page);
    await expect(page.locator('[data-screen="game"]')).toBeVisible();
    await send(page, OFFER);
    await page.waitForTimeout(500);
    await expect(dialog(page)).toBeHidden();
    // 일시정지 → 타이틀로 → 그때 창
    await page.locator('[data-action="pause"]').click();
    await page.locator('[data-screen="pause"] [data-action="exit"]').click();
    await expect(page.locator('[data-screen="title"]')).toBeVisible();
    await expect(dialog(page)).toBeVisible();
    expect(await calls(page)).toEqual(['check']);
  });
});
