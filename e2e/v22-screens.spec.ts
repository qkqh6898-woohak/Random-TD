/**
 * v0.1.22 화면 고침 (사용자 휴대폰 피드백) — 412×915·320×640 둘 다.
 *  1 위쪽 알림 한 줄 (결정 A①): 빠르게 3개 → 1개만 보이고 가장 최근 글자, 같은 종류는 '×n'으로 합침, 320px에서도 글자가 잘리지 않음(12px까지 줄이고 두 줄).
 *  2 정보 패널 머리줄 버튼 (결정 B①): [⬆ 승급] [↔ 이동] [판매] [✕] 순서·한 줄·44px·화면 안, 아래 버튼 줄 없음, 못 하면 회색 + 이유, 꾹 누르면 모두 승급.
 *  3 초상이 빈 네모로 보이던 것: [ℹ] 누르기 칸이 그림을 가리지 않는다 (무한의 검 ×3 포함).
 *  4 리미티드 도감 재료 칩 = 재료 등급 색 + 읽어 주기 글자.
 *  5 보상 선택 창(5단계 보너스) 머리줄이 창·화면 안에 다 보이고 눌린다.
 *  6 도전 시트 높이 ≤ 맵 50% (360px 이하 60%), 위 끝은 머리줄 나무색.
 *  7 시작할 때 흰 추천 칸은 첫 판에서만 (결정 E①) — 그 뒤 판은 없고 #79 잘못 누르기 안내는 그대로.
 * R22_SHOTS=<폴더>면 스크린샷(deviceScaleFactor 1)을 그 폴더에 V2-R22-<이름>-<폭>.png로 저장한다.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { clickStart } from './title';
import { E2E_MATCH_SWITCHES_OFF } from './seed';

const SIZES = [
  [412, 915],
  [320, 640],
] as const;

async function scene<T, A = null>(page: Page, fn: (s: any, a: A) => T, arg: A = null as A): Promise<T> {
  return page.evaluate(([src, a]) => new Function('s', 'a', `return (${src})(s, a);`)((window as any).__rtd.game.scene.getScene('Game'), a) as T, [fn.toString(), arg] as const);
}

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.R22_SHOTS;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  const w = page.viewportSize()!.width;
  await page.screenshot({ path: `${dir}/V2-R22-${name}-${w}.png`, animations: 'disabled' });
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

/** 정보 패널을 누르면 바로 승급하지 않게 (눌러서 바로 승급 끔) */
async function seedSettings(page: Page): Promise<void> {
  await page.addInitScript((off) => localStorage.setItem('rtd.settings', JSON.stringify({ v: 2, tapMerge: false, ...off })), E2E_MATCH_SWITCHES_OFF);
}

async function start(page: Page, query = '?debug=1&seed=42'): Promise<void> {
  await page.goto(`/${query}`);
  await clickStart(page);
  await expect(page.locator('[data-screen="game"]')).toBeVisible();
}

async function tilePoint(page: Page, tx: number, ty: number): Promise<{ x: number; y: number }> {
  return page.evaluate(([x, y]) => {
    const L = (window as any).__rtd.game.scene.getScene('Game').mapLayout;
    const r = document.getElementById('stage')!.getBoundingClientRect();
    const k = r.width / 1080;
    return { x: r.left + (L.originX + (x + 0.5) * L.tile) * k, y: r.top + (L.originY + (y + 0.5) * L.tile) * k };
  }, [tx, ty] as const);
}

async function tapTile(page: Page, tx: number, ty: number): Promise<void> {
  const p = await tilePoint(page, tx, ty);
  await page.mouse.click(p.x, p.y);
}

async function place(page: Page, list: [number, number, string, number][]): Promise<void> {
  const n = list.reduce((a, l) => a + l[3], 0);
  await scene(
    page,
    (s, l: [number, number, string, number][]) => {
      for (const [x, y, id, k] of l) for (let i = 0; i < k; i++) s.match.world.enqueue({ type: 'debugTower', x, y, t: s.match.rules.towerOrder.indexOf(id) });
    },
    list,
  );
  await expect.poll(() => scene(page, (s) => s.match.towers().length)).toBeGreaterThanOrEqual(n);
}

/** 맵 칸 위치 (세로 줄) — 맵 높이 비교용 */
async function fieldBox(page: Page): Promise<{ top: number; bottom: number; height: number }> {
  return scene(page, (s) => {
    const L = s.mapLayout;
    const st = document.getElementById('stage')!.getBoundingClientRect();
    const k = st.width / 1080;
    const top = st.top + L.originY * k;
    const bottom = st.top + (L.originY + s.match.map.height * L.tile) * k;
    return { top, bottom, height: bottom - top };
  });
}

for (const [W, H] of SIZES) {
  test.describe(`${W}×${H}`, () => {
    test.use({ viewport: { width: W, height: H } });

    test(`1 알림 한 줄 ${W}: 빠르게 3개 → 1개(가장 최근), 같은 종류 ×n, 글자 안 잘림`, async ({ page }) => {
      const errors = collectErrors(page);
      await seedSettings(page);
      await start(page);
      const lane = page.locator('.layer-toast > *');
      const LONG = '💠 원소 지배자 재료가 모였어요 — [리미티드]에서 만들어요';
      await scene(page, (s, t: string) => {
        s.ctx.ui.toast('원소 지배자의 필살 폭격!', 4000, 'ult-nuke');
        s.ctx.ui.toast('시간의 지배자의 전체 기절! (6)', 4000, 'ult-stun');
        s.ctx.ui.toast(t, 4000);
      }, LONG);
      await expect(lane).toHaveCount(1);
      await expect(lane).toHaveText(LONG);
      // 같은 글자 두 번 → 한 알림 '×2' (예전엔 두 줄로 쌓였다)
      await scene(page, (s) => {
        s.ctx.ui.toast('125원이 더 필요해요', 4000);
        s.ctx.ui.toast('125원이 더 필요해요', 4000);
      });
      await expect(lane).toHaveCount(1);
      await expect(page.locator('.layer-toast .toast-text')).toHaveText('125원이 더 필요해요');
      await expect(page.locator('.layer-toast .toast-count')).toHaveText('×2');
      // 같은 필살기는 다른 타워여도 합치고 글자는 가장 최근
      await scene(page, (s) => {
        s.ctx.ui.toast('🔥 원소 지배자의 필살 폭격!', 4000, 'ult-nuke');
        s.ctx.ui.toast('🔥 천상의 궁수의 필살 폭격!', 4000, 'ult-nuke');
        s.ctx.ui.banner('보스 등장!', null, 4000, 'boss');
        s.ctx.ui.toast('🔥 원소 지배자의 필살 폭격!', 4000, 'ult-nuke');
      });
      // 배너(보스 등장)는 같은 프레임의 일반 알림에 바로 밀리지 않는다 (최소 1.5초) → 그 뒤 가장 최근 일반 알림
      await expect(lane).toHaveCount(1);
      await expect(page.getByTestId('banner-boss')).toBeVisible();
      await expect(page.locator('.layer-toast .toast-text')).toHaveText('🔥 원소 지배자의 필살 폭격!');
      await expect(lane).toHaveCount(1);
      // 긴 알림: 12px 아래로 줄지 않고, 넘치면 두 줄 — 알림이 무대 밖으로 나가지 않는다
      await scene(page, (s, t: string) => s.ctx.ui.toast(t, 4000), LONG);
      const m = await page.evaluate(() => {
        const el = document.querySelector<HTMLElement>('.layer-toast .toast')!;
        const tx = el.querySelector<HTMLElement>('.toast-text')!;
        const st = document.getElementById('stage')!.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(tx);
        const lines = Math.round(tx.getBoundingClientRect().height / parseFloat(cs.lineHeight));
        return { left: r.left - st.left, right: st.right - r.right, font: parseFloat(cs.fontSize), clipped: tx.classList.contains('is-clipped'), fits: tx.scrollWidth <= tx.clientWidth + 1, lines, overflowY: tx.scrollHeight - tx.clientHeight };
      });
      expect(m.left).toBeGreaterThanOrEqual(0);
      expect(m.right).toBeGreaterThanOrEqual(0);
      expect(m.font).toBeGreaterThanOrEqual(12);
      // 한 줄에 다 들어가거나, 두 줄(12px)로 다 보인다 (말줄임 없이)
      expect(m.fits || (m.clipped && m.lines <= 2 && m.overflowY <= 1), JSON.stringify(m)).toBe(true);
      await shot(page, 'notice');
      expect(errors).toEqual([]);
    });

    test(`2·3 정보 패널 ${W}: 머리줄 [⬆ 승급][↔ 이동][판매][✕], 아래 줄 없음, 회색 + 이유, 12px 글자, 초상 보임, 꾹 누르면 모두 승급`, async ({ page }) => {
      const errors = collectErrors(page);
      await seedSettings(page);
      await start(page, '?seed=42'); // 개발자 [🛠 변환] 없는 일반 판
      // 일반 판: 배치는 [🎲 소환] 한 번 (개발자 명령 없이)
      await page.getByTestId('hud-summon').click();
      await expect.poll(() => scene(page, (s) => s.match.towers().length)).toBe(1);
      const t = await scene(page, (s) => { const x = s.match.towers()[0]; return [x.tx, x.ty] as [number, number]; });
      await tapTile(page, t[0], t[1]);
      const panel = page.getByTestId('tower-panel');
      await expect(panel).toBeVisible();
      await page.waitForTimeout(400); // 등장 애니메이션
      await expect(page.locator('.tp-act-wrap, .tp-actions')).toHaveCount(0);
      const order = ['[data-action="merge"]', '[data-action="move"]', '[data-testid="tp-sell"]', '[data-action="panel-close"]'];
      const boxes = [];
      for (const sel of order) {
        const b = (await panel.locator(`.tp-head ${sel}`).boundingBox())!;
        expect(b, sel).not.toBeNull();
        expect(b.height, sel).toBeGreaterThanOrEqual(44);
        expect(b.width, sel).toBeGreaterThanOrEqual(44);
        expect(b.x, sel).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width, sel).toBeLessThanOrEqual(W);
        boxes.push(b);
      }
      for (let i = 1; i < boxes.length; i++) {
        expect(boxes[i]!.x, order[i]).toBeGreaterThanOrEqual(boxes[i - 1]!.x + boxes[i - 1]!.width - 0.5); // 왼쪽 → 오른쪽 순서
        expect(Math.abs(boxes[i]!.y - boxes[0]!.y), order[i]).toBeLessThan(2); // 한 줄
      }
      // 버튼 글자가 잘리지 않는다
      const clipped = await panel.evaluate((p) => [...p.querySelectorAll<HTMLElement>('.tp-head-actions > .btn')].filter((b) => b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > b.clientHeight + 1).map((b) => b.className));
      expect(clipped).toEqual([]);
      // 승급 못 함: 차분한 회색(빨간 글자 아님) + 이유는 aria-label·title·숨은 설명
      const merge = page.locator('[data-action="merge"]');
      await expect(merge).toBeDisabled();
      await expect(merge).toHaveAttribute('aria-label', /^승급할 수 없어요 — 같은 타워 3개가 한 칸에 모이면/);
      await expect(merge).toHaveAttribute('title', /승급할 수 없어요/);
      await expect(page.getByTestId('tp-note')).toContainText('3개가 한 칸에 모이면');
      expect(await merge.evaluate((b) => getComputedStyle(b).color)).toBe('rgb(92, 73, 62)');
      await expect(page.locator('[data-action="merge-all"]')).toBeDisabled();
      // 작은 정보 글자 12px 이상
      const small = await panel.evaluate((p) =>
        [...p.querySelectorAll<HTMLElement>('.tp-stats *, .tp-detect *, .tp-ability *, .tp-owned-row *, .tp-sub, .tp-level')]
          .filter((e) => e.offsetParent && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim()))
          .map((e) => [e.className || e.tagName, parseFloat(getComputedStyle(e).fontSize)] as const)
          .filter(([, f]) => f < 12),
      );
      expect(small).toEqual([]);
      // 3 초상: 그림이 읽혔고 [ℹ] 누르기 칸 바탕이 투명 (예전엔 V2 버튼 바탕이 그림을 덮어 빈 네모)
      const pic = await panel.evaluate((p) => {
        const img = p.querySelector<HTMLImageElement>('.tp-portrait')!;
        const info = p.querySelector<HTMLElement>('.tp-info')!;
        const cs = getComputedStyle(info);
        return { ok: img.complete && img.naturalWidth > 0 && !img.hidden && getComputedStyle(img).visibility === 'visible', bg: cs.backgroundColor, bgi: cs.backgroundImage };
      });
      expect(pic).toEqual({ ok: true, bg: 'rgba(0, 0, 0, 0)', bgi: 'none' });
      await shot(page, 'panel-normal');
      expect(errors).toEqual([]);
    });

    test(`2·3 정보 패널 ${W}: 무한의 검 ×3 초상 · 꾹 눌러 모두 승급 (짧게 누르면 한 칸만)`, async ({ page }) => {
      const errors = collectErrors(page);
      await seedSettings(page);
      await start(page);
      const cells = await scene(page, (s) => s.match.map.buildable as [number, number][]);
      const top = cells.reduce((a, c) => (c[1] < a[1] ? c : a));
      const bot = cells.reduce((a, c) => (c[1] > a[1] ? c : a));
      const others = cells.filter((c) => c !== top && c !== bot);
      await place(page, [
        [bot[0], bot[1], 'infiniteblade', 3],
        [top[0], top[1], 'warrior', 3],
        [others[0]![0], others[0]![1], 'archer', 3],
        [others[1]![0], others[1]![1], 'goblin', 3],
      ]);
      await scene(page, (s) => s.debugFastForward(4));
      // 무한의 검 ×3 (예전에 빈 네모로 보이던 리미티드)
      await tapTile(page, bot[0], bot[1]);
      const panel = page.getByTestId('tower-panel');
      await expect(page.getByTestId('tp-name')).toHaveText('무한의 검 ×3');
      await page.waitForTimeout(400);
      const pic = await panel.evaluate((p) => {
        const img = p.querySelector<HTMLImageElement>('.tp-portrait')!;
        const r = img.getBoundingClientRect();
        return { ok: img.complete && img.naturalWidth > 0 && !img.hidden, w: r.width, h: r.height, bg: getComputedStyle(p.querySelector('.tp-info')!).backgroundColor };
      });
      expect(pic.ok).toBe(true);
      expect(pic.w).toBeGreaterThan(30);
      expect(pic.bg).toBe('rgba(0, 0, 0, 0)');
      // 리미티드는 승급할 수 없다 → 회색 + 이유
      await expect(page.locator('[data-action="merge"]')).toBeDisabled();
      await expect(page.locator('[data-action="merge"]')).toHaveAttribute('aria-label', /^승급할 수 없어요 — /);
      await shot(page, 'panel-limited');
      await page.locator('[data-action="panel-close"]').click();
      // 승급할 무더기 3개(전사·궁수·고블린): 패널 [⬆ 승급]에 '꾹 ×3'
      await tapTile(page, top[0], top[1]);
      await expect(page.getByTestId('tp-name')).toHaveText('전사 ×3');
      const merge = page.locator('[data-action="merge"]');
      await expect(merge).toBeEnabled();
      await expect(page.getByTestId('tp-hold-hint')).toHaveText('꾹 ×3');
      await expect(merge).toHaveAttribute('aria-label', '승급 · 꾹 누르면 모두 승급 ×3');
      await shot(page, 'panel-merge-hold');
      const merges0 = await scene(page, (s) => s.match.state.merges);
      // 꾹 누르기 (0.5초 넘게) → 판 전체 모두 승급 (세 무더기), 손을 떼며 따라오는 click은 한 번 더 승급하지 않는다
      const b = (await merge.boundingBox())!;
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await expect(merge).toHaveClass(/is-holding/);
      await page.waitForTimeout(800);
      await page.mouse.up();
      await expect.poll(() => scene(page, (s) => s.match.state.merges)).toBe(merges0 + 3);
      await page.waitForTimeout(600);
      expect(await scene(page, (s) => s.match.state.merges)).toBe(merges0 + 3);
      expect(errors).toEqual([]);
    });

    test(`4 리미티드 도감 ${W}: 재료 칩 = 등급 색, 판 위면 채운 칩 + ✓, aria-label`, async ({ page }) => {
      const errors = collectErrors(page);
      await page.addInitScript(() => localStorage.setItem('rtd.account', JSON.stringify({ v: 1, level: 1, hidden: [], guides: ['firstMerge'], codex: { elemental: { found: true } } })));
      await seedSettings(page);
      await start(page);
      const cells = await scene(page, (s) => s.match.map.buildable as [number, number][]);
      await place(page, [[cells[0]![0], cells[0]![1], 'flamemage', 1]]);
      await page.getByTestId('menu-mythic').click();
      const row = page.getByTestId('mythic-row-elemental');
      await expect(row).toBeVisible();
      const chips = await row.locator('.my-mat').evaluateAll((els) =>
        els.map((e) => {
          const cs = getComputedStyle(e);
          return { text: e.textContent, grade: e.getAttribute('data-grade'), label: e.getAttribute('aria-label'), bg: cs.backgroundColor, border: cs.borderTopColor, color: cs.color, on: e.classList.contains('is-on'), font: parseFloat(cs.fontSize) };
        }),
      );
      expect(chips.map((c) => c.grade)).toEqual(['rare', 'unique', 'legend']); // 화염 마법사·얼음 마법사·대마법사 (towers.json 등급)
      expect(chips[0]).toMatchObject({ text: '✓ 화염 마법사', on: true, label: '화염 마법사 · 레어 · 판 위에 있어요', bg: 'rgb(62, 79, 140)', color: 'rgb(255, 255, 255)' });
      expect(chips[1]).toMatchObject({ on: false, label: '얼음 마법사 · 유니크 · 판 위에 없어요', bg: 'rgb(255, 248, 230)', border: 'rgb(106, 58, 156)', color: 'rgb(59, 35, 20)' });
      expect(chips[2]).toMatchObject({ on: false, border: 'rgb(226, 119, 42)', color: 'rgb(59, 35, 20)' });
      for (const c of chips) expect(c.font).toBeGreaterThanOrEqual(12);
      await shot(page, 'codex');
      expect(errors).toEqual([]);
    });

    test(`5 보상 선택 창 ${W}: 5단계 보너스 머리줄이 다 보이고 눌린다 · 높이 상한 그대로`, async ({ page }) => {
      const errors = collectErrors(page);
      await seedSettings(page);
      await start(page);
      await scene(page, (s) => { for (let i = 0; i < 4; i++) s.match.world.enqueue({ type: 'debugSkipStage', tick: s.match.tick + i }); });
      await expect.poll(async () => { await scene(page, (s) => s.debugFastForward(40)); return page.locator('.choice-panel:not([hidden])').count(); }, { timeout: 60_000 }).toBe(1);
      expect(await scene(page, (s) => s.match.state.stage)).toBe(5);
      await page.waitForTimeout(400);
      const g = await page.evaluate(() => {
        const p = document.querySelector<HTMLElement>('.choice-panel:not([hidden])')!.getBoundingClientRect();
        const head = document.querySelector<HTMLElement>('.choice-panel .cp-head')!;
        const h = head.getBoundingClientRect();
        const hit = document.elementFromPoint(h.left + h.width / 2, h.top + h.height / 2);
        const hits = [...head.querySelectorAll<HTMLElement>('[data-testid="choice-peek"], [data-testid="choice-later"]')].map((b) => {
          const r = b.getBoundingClientRect();
          return b.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
        });
        return { p: { top: p.top, bottom: p.bottom, left: p.left, right: p.right, height: p.height }, h: { top: h.top, bottom: h.bottom, left: h.left, right: h.right }, inHead: !!hit && head.contains(hit), hits, vw: innerWidth, vh: innerHeight };
      });
      expect(g.h.top).toBeGreaterThanOrEqual(g.p.top - 0.5);
      expect(g.h.bottom).toBeLessThanOrEqual(g.p.bottom + 0.5);
      expect(g.h.left).toBeGreaterThanOrEqual(Math.max(0, g.p.left - 0.5));
      expect(g.h.right).toBeLessThanOrEqual(Math.min(g.vw, g.p.right + 0.5));
      expect(g.h.top).toBeGreaterThanOrEqual(0);
      expect(g.h.bottom).toBeLessThanOrEqual(g.vh);
      expect(g.inHead).toBe(true);
      expect(g.hits).toEqual([true, true]);
      // V2-R21 높이 상한: 맵의 50% (360px 이하 60%)
      const f = await fieldBox(page);
      expect(g.p.height).toBeLessThanOrEqual(f.height * (W <= 360 ? 0.6 : 0.5) + 1);
      await shot(page, 'reward');
      // 카드가 커져 창이 넘쳐도(휴대폰 글자 크기) 머리줄은 그대로, 아래만 스크롤
      await page.addStyleTag({ content: '.cp-desc{font-size:22px!important}' });
      const g2 = await page.evaluate(() => {
        const p = document.querySelector<HTMLElement>('.choice-panel:not([hidden])')!;
        const body = p.querySelector<HTMLElement>('.cp-body')!;
        body.scrollTop = body.scrollHeight;
        p.scrollTop = 9999;
        const h = p.querySelector<HTMLElement>('.cp-head')!.getBoundingClientRect();
        const r = p.getBoundingClientRect();
        return { scrolls: body.scrollHeight > body.clientHeight, headTop: h.top - r.top, panelScroll: p.scrollTop };
      });
      expect(g2.scrolls).toBe(true);
      expect(g2.panelScroll).toBe(0);
      expect(g2.headTop).toBeLessThan(12);
      // [나중에]가 실제로 눌린다
      await page.getByTestId('choice-later').click();
      await expect(page.locator('.choice-panel:not([hidden])')).toHaveCount(0);
      expect(errors).toEqual([]);
    });

    test(`6 도전 시트 ${W}: 높이 ≤ 맵 ${W <= 360 ? 60 : 50}%, 목록은 안에서 스크롤, 위 끝은 머리줄 나무색`, async ({ page }) => {
      const errors = collectErrors(page);
      await seedSettings(page);
      await start(page, '?seed=42');
      await page.getByTestId('menu-challenge').click();
      const sheet = page.getByTestId('sheet-challenge');
      await expect(sheet).toBeVisible();
      await page.waitForTimeout(400);
      const f = await fieldBox(page);
      const box = (await sheet.boundingBox())!;
      expect(box.height).toBeLessThanOrEqual(f.height * (W <= 360 ? 0.6 : 0.5) + 1);
      const menu = (await page.locator('.hud-menu').boundingBox())!;
      expect(Math.abs(box.y + box.height - menu.y)).toBeLessThan(2); // 아래 끝은 하단 메뉴 위 그대로
      const look = await sheet.evaluate((el) => {
        const grip = el.querySelector<HTMLElement>('.bs-grip')!;
        const head = el.querySelector<HTMLElement>('.bs-head')!;
        const body = el.querySelector<HTMLElement>('.bs-body')!;
        return { first: el.firstElementChild === grip, grip: getComputedStyle(grip).backgroundColor, head: getComputedStyle(head).backgroundColor, scroll: body.scrollHeight > body.clientHeight, gripTop: grip.getBoundingClientRect().top - el.getBoundingClientRect().top };
      });
      expect(look.first).toBe(true);
      expect(look.grip).toBe(look.head); // 손잡이 칸도 나무색 — 종이색 띠가 따로 보이지 않는다
      expect(look.gripTop).toBeLessThanOrEqual(3);
      expect(look.scroll).toBe(true);
      await expect(page.getByTestId('challenge-start-1')).toBeVisible();
      await shot(page, 'challenge');
      // 손잡이를 위로 끌면 예전처럼 85%
      const grip = (await page.getByTestId('sheet-grip').boundingBox())!;
      await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
      await page.mouse.down();
      await page.mouse.move(grip.x + grip.width / 2, grip.y - H * 0.3, { steps: 6 });
      await page.mouse.up();
      await expect.poll(() => scene(page, (s) => s.sheetSize)).toBe('full');
      expect(errors).toEqual([]);
    });
  });
}

test.describe('7 첫 판에서만 추천 칸', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  for (const [W, H] of SIZES) {
    test(`${W}×${H}: 빈 계정 첫 판 = 추천 칸 + 안내, 소환하면 기록 → 다음 판은 칸 없음 · 잘못 누르기 안내는 그대로`, async ({ page }) => {
      await page.setViewportSize({ width: W, height: H });
      const errors = collectErrors(page);
      await page.addInitScript(() => {
        const w = window as unknown as { __toasts: string[] };
        w.__toasts = [];
        new MutationObserver((ms) => {
          for (const m of ms) for (const n of m.addedNodes) if ((n as HTMLElement).classList?.contains('toast')) w.__toasts.push((n as HTMLElement).textContent ?? '');
        }).observe(document, { childList: true, subtree: true });
      });
      await start(page, '?seed=42');
      await expect.poll(() => scene(page, (s) => s.guideState.recommended.length)).toBe(3);
      await expect.poll(() => page.evaluate(() => (window as any).__toasts.some((t: string) => t.includes('빛나는 칸을 눌러')))).toBe(true);
      await page.waitForTimeout(300);
      await shot(page, 'start-first');
      const rec = await scene(page, (s) => s.guideState.recommended[0] as [number, number]);
      await tapTile(page, rec[0], rec[1]);
      await expect.poll(() => scene(page, (s) => s.match.towers().length)).toBe(1);
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('rtd.account') ?? '{}').guides ?? [])).toContain('firstSummon');
      // 다음 판: 추천 칸·안내 없음
      await page.evaluate(() => ((window as any).__toasts = []));
      await start(page, '?seed=42');
      await page.waitForTimeout(1500);
      expect(await scene(page, (s) => s.guideState.recommended.length)).toBe(0);
      expect(await scene(page, (s) => s.match.towers().length)).toBe(0);
      expect(await page.evaluate(() => (window as any).__toasts.filter((t: string) => t.includes('빛나는 칸을 눌러')))).toEqual([]);
      await shot(page, 'start-later');
      // #79 잘못 누르기 안내 (길을 누르면 배치 칸 1.2초)는 그대로
      const road: [number, number] = [0, 3]; // 순환의 정원 길 (field-context #79와 같은 칸)
      expect(await scene(page, (s, c: [number, number]) => (s.match.map.buildable as number[][]).some((x) => x[0] === c[0] && x[1] === c[1]), road)).toBe(false);
      const p = await tilePoint(page, road[0], road[1]);
      await page.touchscreen.tap(p.x, p.y);
      await expect.poll(() => scene(page, (s) => s.buildHint)).toBeGreaterThan(0);
      expect(await scene(page, (s) => s.match.towers().length)).toBe(0);
      expect(errors).toEqual([]);
    });
  }
});
