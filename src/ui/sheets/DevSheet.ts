/**
 * 🛠 개발자 도구 시트 (T-2, 개발자 모드만 — 하단 메뉴 넷째 칸 [🛠 개발]).
 *
 * 탭 [⚙ 설정] [🎲 확률] [💠 히든 조합]:
 * - 설정: '연출 끄기 (전체)' — 도박 릴·피해 숫자·동전·입자·화면 흔들림·소환/승급 반짝임·특색 효과·배너/시트 애니메이션·
 *   캐릭터 대기 동작·공격 몸짓·몹 흔들림을 모두 끈다 (게임 정보는 그대로). '히든 미션 조건 보기' — 미션 시트가 히든 미션 이름·조건을 보여 줌.
 *   둘 다 저장된다 (Game 장면이 settings에 쓴다).
 * - 확률: 줄마다 지금 값 · [−0.1%p] [+0.1%p] (꾹 누르면 계속) · 맨 위 [초기화]. 누르면 Game이 debugSetChance 명령을 보낸다.
 * - 히든 조합: 12종 결과 초상화·이름 + 재료 3개 (판 위에 있으면 ✓, 지금 덱에 있으면 '덱'). 보기만 (조합은 M6).
 * - '이번 판 기록' (F10, 설정 탭 맨 위): 첫 소환·준비 완료·첫 승급·보스 등장/처치 시각(게임 시간)과 시간 초과 때 남은 보스 체력
 *   — 실제 휴대폰 시험에서 첫 승급 시간·첫 보스 결과를 적어 두려고 (값은 ui/guide/guideModel.runLogRows).
 * 값은 devModels(순수), 여기서는 그리기만.
 */
import { h } from '../dom';
import { attachHoldRepeat, type HoldHandle } from '../hold';
import { createBottomSheet, type BottomSheetView } from './BottomSheet';
import type { DevChanceModel, DevChanceRow, DevTab, HiddenRecipeRow } from './devModels';
import type { PastRun } from '../guide/runHistory';

export interface DevSheetOptions {
  onClose: () => void;
  onTab?: (tab: DevTab) => void;
  tab?: DevTab;
  effectsOff: boolean;
  revealHidden: boolean;
  onEffects: (off: boolean) => void;
  onRevealHidden: (on: boolean) => void;
  /** ± 한 번: 보냈으면(또는 앞 명령을 기다리면) true, 끝에 닿았으면 false (꾹 누르기 멈춤) */
  onChance: (key: string, dir: 1 | -1) => boolean;
  onResetChances: () => void;
  portrait: (towerId: string) => string | null;
}

export interface DevSheetView extends BottomSheetView<DevTab> {
  update(
    chances: DevChanceModel,
    recipes: readonly HiddenRecipeRow[],
    runLog?: readonly { label: string; value: string }[],
    /** 지난 판 기록 (최근 판이 앞, 최대 3판) — F10-4 검토: 패배·다시 하기 뒤에도 읽을 수 있게 */
    past?: readonly PastRun[],
  ): void;
}

const TABS = [
  { id: 'fx', label: '⚙ 설정' },
  { id: 'chance', label: '🎲 확률' },
  { id: 'recipes', label: '💠 리미티드 조합' },
] as const;

/** 켜고 끄는 줄 (스위치 모양 버튼, aria-pressed) */
function toggleRow(testid: string, title: string, desc: string, on: boolean, onChange: (v: boolean) => void): HTMLElement {
  const btn = h('button', {
    class: 'btn dv-switch',
    attrs: { type: 'button', role: 'switch', 'aria-checked': String(on), 'data-testid': testid, 'aria-label': title },
    text: on ? '켜짐' : '꺼짐',
  });
  btn.classList.toggle('is-on', on);
  btn.addEventListener('click', () => {
    const v = btn.getAttribute('aria-checked') !== 'true';
    btn.setAttribute('aria-checked', String(v));
    btn.textContent = v ? '켜짐' : '꺼짐';
    btn.classList.toggle('is-on', v);
    onChange(v);
  });
  return h('div', { class: 'dv-row' }, h('div', { class: 'dv-main' }, h('div', { class: 'dv-name', text: title }), h('div', { class: 'dv-desc', text: desc })), btn);
}

export function createDevSheet(opts: DevSheetOptions, firstChances: DevChanceModel, firstRecipes: readonly HiddenRecipeRow[]): DevSheetView {
  const panes: Record<DevTab, HTMLElement> = {
    fx: h('div', { class: 'up-pane dv-pane', attrs: { 'data-pane': 'fx' } }),
    chance: h('div', { class: 'up-pane dv-pane', attrs: { 'data-pane': 'chance' } }),
    recipes: h('div', { class: 'up-pane dv-pane', attrs: { 'data-pane': 'recipes' } }),
  };
  const showPane = (tab: DevTab): void => {
    for (const [id, p] of Object.entries(panes)) p.hidden = id !== tab;
  };
  const sheet = createBottomSheet<DevTab>({
    kind: 'dev',
    title: '🛠 개발자 도구',
    tabs: TABS,
    tab: opts.tab ?? 'fx',
    onTab: (t) => {
      showPane(t);
      opts.onTab?.(t);
    },
    onClose: opts.onClose,
  });
  sheet.body.append(panes.fx, panes.chance, panes.recipes);
  showPane(sheet.tab ?? 'fx');

  // ---- 이번 판 기록 (F10)
  const logList = h('div', { class: 'dv-log-list', attrs: { 'data-testid': 'dev-run-log' } });
  panes.fx.append(h('div', { class: 'dv-log' }, h('div', { class: 'dv-log-title', text: '📝 이번 판 기록 (게임 시간)' }), logList));
  // 지난 판 (최근 3판): 패배 화면이 🛠를 덮고 [다시 하기]가 이번 판 기록을 지우므로, 끝난 판의 기록을 여기서 다시 본다
  const pastList = h('div', { class: 'dv-log-list', attrs: { 'data-testid': 'dev-past-runs' } });
  const pastBox = h('div', { class: 'dv-log dv-log-past', attrs: { hidden: '' } }, h('div', { class: 'dv-log-title', text: '🗂 지난 판 기록' }), pastList);
  panes.fx.append(pastBox);
  const logRow = (r: { label: string; value: string }): HTMLElement =>
    h('div', { class: 'dv-log-row' }, h('span', { class: 'dv-log-label', text: r.label }), h('span', { class: 'dv-log-value', text: r.value }));
  let lastLog = '';
  const drawLog = (rows: readonly { label: string; value: string }[]): void => {
    const key = rows.map((r) => `${r.label}=${r.value}`).join('|');
    if (key === lastLog) return;
    lastLog = key;
    logList.replaceChildren(...rows.map(logRow));
  };
  let lastPast = '';
  const drawPast = (runs: readonly PastRun[]): void => {
    const key = JSON.stringify(runs);
    if (key === lastPast) return;
    lastPast = key;
    pastBox.hidden = runs.length === 0;
    pastList.replaceChildren(
      ...runs.map((run) => h('div', { class: 'dv-past-run', attrs: { 'data-testid': 'dev-past-run' } }, h('div', { class: 'dv-past-title', text: run.title }), ...run.rows.map(logRow))),
    );
  };

  // ---- 설정
  panes.fx.append(
    h('div', { class: 'bs-note', text: '개발자 모드에서만 보여요 · 저장돼요' }),
    toggleRow(
      'dev-effects-off',
      '연출 끄기 (전체)',
      '도박 릴·피해 숫자·동전·입자·흔들림·반짝임·특색 효과·애니메이션·대기 동작을 모두 꺼요 (정보는 그대로)',
      opts.effectsOff,
      opts.onEffects,
    ),
    toggleRow('dev-reveal-hidden', '히든 미션 조건 보기', '미션 시트에서 히든 미션 이름·조건을 ??? 대신 보여요', opts.revealHidden, opts.onRevealHidden),
  );

  // ---- 확률
  const reset = h('button', {
    class: 'btn dv-reset',
    attrs: { type: 'button', 'data-testid': 'dev-chance-reset' },
    text: '초기화',
    on: { click: () => opts.onResetChances() },
  });
  const gambleLine = h('div', { class: 'dv-gamble-line', attrs: { 'data-testid': 'dev-gamble-line' } });
  panes.chance.append(h('div', { class: 'dv-chance-head' }, h('span', { class: 'bs-note', text: '0.1%p씩 · 꾹 누르면 계속 · 새 판은 기본값' }), reset));
  const holds: HoldHandle[] = [];
  const rowEls = new Map<string, { root: HTMLElement; value: HTMLElement; base: HTMLElement; down: HTMLButtonElement; up: HTMLButtonElement; last: Partial<DevChanceRow> }>();
  let gambleLinePlaced = false;
  for (const r of firstChances.rows) {
    const value = h('b', { class: 'dv-value', attrs: { 'data-testid': `dev-chance-value-${r.key}` } });
    const base = h('span', { class: 'dv-base' });
    const down = h('button', { class: 'btn dv-step', attrs: { type: 'button', 'data-testid': `dev-chance-down-${r.key}`, 'aria-label': `${r.name} −0.1%p` }, text: '−0.1' });
    const up = h('button', { class: 'btn dv-step', attrs: { type: 'button', 'data-testid': `dev-chance-up-${r.key}`, 'aria-label': `${r.name} +0.1%p` }, text: '+0.1' });
    holds.push(attachHoldRepeat(down, () => opts.onChance(r.key, -1)));
    holds.push(attachHoldRepeat(up, () => opts.onChance(r.key, 1)));
    const root = h(
      'div',
      { class: 'dv-row dv-chance', attrs: { 'data-testid': `dev-chance-${r.key}` } },
      h('div', { class: 'dv-main' }, h('div', { class: 'dv-name' }, h('span', { text: r.name }), r.note ? h('span', { class: 'dv-note', text: r.note }) : null), h('div', { class: 'dv-desc' }, value, base)),
      down,
      up,
    );
    // 도박 줄들이 끝난 바로 아래에 ×0·기대값 한 줄
    if (gambleLinePlaced === false && !r.key.startsWith('gamble:') && [...rowEls.keys()].some((k) => k.startsWith('gamble:'))) {
      panes.chance.append(gambleLine);
      gambleLinePlaced = true;
    }
    panes.chance.append(root);
    rowEls.set(r.key, { root, value, base, down, up, last: {} });
  }
  if (!gambleLinePlaced) panes.chance.append(gambleLine);

  // ---- 히든 조합
  panes.recipes.append(h('div', { class: 'bs-note', text: '조합은 나중에 열려요 · ✓ 판 위에 있음 · 덱 = 지금 덱에 있음' }));
  const recipeEls = new Map<string, { root: HTMLElement; marks: HTMLElement[]; last: string }>();
  for (const r of firstRecipes) {
    const pic = (id: string, cls: string): HTMLElement => {
      const src = opts.portrait(id);
      return src ? h('img', { class: cls, attrs: { src, alt: '', draggable: 'false' } }) : h('span', { class: `${cls} dv-pic-empty`, text: '?' });
    };
    const marks: HTMLElement[] = [];
    const mats = r.materials.map((m) => {
      const mark = h('span', { class: 'dv-mark' });
      marks.push(mark);
      return h('span', { class: 'dv-mat', attrs: { 'data-testid': `dev-recipe-mat-${r.id}-${m.id}` } }, pic(m.id, 'dv-mat-pic'), h('span', { class: 'dv-mat-name', text: m.name }), mark);
    });
    const root = h(
      'div',
      { class: 'dv-recipe', attrs: { 'data-testid': `dev-recipe-${r.id}` } },
      h('div', { class: 'dv-recipe-head' }, pic(r.id, 'dv-recipe-pic'), h('span', { class: 'dv-recipe-name', text: `💠 ${r.name}` })),
      h('div', { class: 'dv-mats' }, ...mats),
    );
    panes.recipes.append(root);
    recipeEls.set(r.id, { root, marks, last: '' });
  }

  let lastLine = '';
  const view: DevSheetView = {
    ...sheet,
    get size() {
      return sheet.size;
    },
    get tab() {
      return sheet.tab;
    },
    update(chances, recipes, runLog, past) {
      if (runLog) drawLog(runLog);
      if (past) drawPast(past);
      for (const r of chances.rows) {
        const e = rowEls.get(r.key);
        if (!e) continue;
        if (e.last.value !== r.value) e.value.textContent = r.value;
        if (e.last.base !== r.base) e.base.textContent = r.base;
        if (e.last.changed !== r.changed) e.root.classList.toggle('is-changed', r.changed);
        if (e.last.canDown !== r.canDown) e.down.disabled = !r.canDown;
        if (e.last.canUp !== r.canUp) e.up.disabled = !r.canUp;
        e.last = r;
      }
      if (chances.gambleLine !== lastLine) gambleLine.textContent = lastLine = chances.gambleLine;
      reset.disabled = !chances.anyChanged;
      for (const r of recipes) {
        const e = recipeEls.get(r.id);
        if (!e) continue;
        const key = r.materials.map((m) => `${m.onBoard ? 1 : 0}${m.inDeck ? 1 : 0}`).join('') + (r.ready ? 'R' : '');
        if (key === e.last) continue;
        e.last = key;
        r.materials.forEach((m, i) => {
          const mark = e.marks[i];
          if (!mark) return;
          mark.textContent = m.onBoard ? '✓' : m.inDeck ? '덱' : '';
          mark.className = `dv-mark${m.onBoard ? ' is-on' : m.inDeck ? ' is-deck' : ''}`;
        });
        e.root.classList.toggle('is-ready', r.ready);
      }
    },
    destroy() {
      for (const x of holds) x.detach();
      sheet.destroy?.();
    },
  };
  view.update(firstChances, firstRecipes);
  return view;
}
