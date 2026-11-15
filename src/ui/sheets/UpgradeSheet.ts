/**
 * ⬆ 강화 시트 (DEV_PLAN M5-3·M5-5, UI.md 4.5): 탭 3개 [등급 강화] / [능력치 강화] / [도박], 머리줄에 지금 공속 배율 '⚡×2.6'.
 *
 * - 강화 줄: 그림 · 이름 · Lv · 효과 '+40% → +44%' · [비용] 버튼. 버튼을 길게 누르면 돈이 허락하는 만큼 연속 (ui/hold.ts).
 *   초월은 등급 강화 3종이 모두 Lv50이 되면 능력치 탭 맨 아래에 나타난다.
 * - 도박 탭: 테이블 4개 (1000원 계정 Lv7 · 10000원 Lv20 — 잠겨 있으면 🔒), 슬롯 릴(1초), 잭팟 게이지 10칸, 배율표·기대값,
 *   최근 결과 5개. 숙련도(건너뛰기·10연속)는 M10.
 * 버튼은 onUpgrade(k)·onGamble(t)를 부르고, 실제 명령은 Game 장면이 보낸다 (sim이 실행 틱에 다시 검사).
 * onUpgrade가 false를 돌려주면 길게 누르기 연속이 멈춘다 (돈이 모자람·최대).
 * 값은 sheetModels(순수), 여기서는 그리기만.
 */
import { GRADE_COLORS } from '../../art/palette';
import type { Grade } from '../../data/load';
import { h } from '../dom';
import { attachHoldRepeat, type HoldHandle } from '../hold';
import { createBottomSheet, type BottomSheetView } from './BottomSheet';
import type { GambleSheetModel, GambleTableModel, UpgradeRowModel, UpgradeSheetModel, UpgradeTab } from './sheetModels';
import type { SlotFrame } from './slot';

export interface UpgradeSheetOptions {
  onUpgrade: (k: number) => boolean;
  onGamble: (t: number) => void;
  onClose: () => void;
  onTab?: (tab: UpgradeTab) => void;
  tab?: UpgradeTab;
  /** 강화 k의 대상 첫 등급 (그림 색) */
  gradeOf: (k: number) => Grade | null;
}

export interface UpgradeSheetView extends BottomSheetView<UpgradeTab> {
  update(model: UpgradeSheetModel, gamble: GambleSheetModel, slot: (SlotFrame & { result: string }) | null): void;
}

interface RowEls {
  root: HTMLElement;
  lv: HTMLElement;
  effect: HTMLElement;
  btn: HTMLButtonElement;
  hold: HoldHandle;
  last: Partial<UpgradeRowModel>;
}

const TABS = [
  { id: 'grade', label: '등급 강화' },
  { id: 'stat', label: '능력치 강화' },
  { id: 'gamble', label: '🎰 도박' },
] as const;

export function createUpgradeSheet(opts: UpgradeSheetOptions, first: UpgradeSheetModel, firstGamble: GambleSheetModel): UpgradeSheetView {
  const panes: Record<UpgradeTab, HTMLElement> = {
    grade: h('div', { class: 'up-pane', attrs: { 'data-pane': 'grade' } }),
    stat: h('div', { class: 'up-pane', attrs: { 'data-pane': 'stat' } }),
    gamble: h('div', { class: 'up-pane gb-pane', attrs: { 'data-pane': 'gamble' } }),
  };
  const showPane = (tab: UpgradeTab): void => {
    for (const [id, p] of Object.entries(panes)) p.hidden = id !== tab;
  };
  const sheet = createBottomSheet<UpgradeTab>({
    kind: 'upgrade',
    title: '⬆ 강화',
    tabs: TABS,
    tab: opts.tab ?? 'grade',
    onTab: (t) => {
      showPane(t);
      opts.onTab?.(t);
    },
    onClose: opts.onClose,
  });
  const aps = h('span', { class: 'up-aps', attrs: { 'data-testid': 'upgrade-aps', 'aria-label': '지금 공격속도 배율' } });
  sheet.extra.append(aps);
  panes.grade.append(h('div', { class: 'bs-note', text: '등급군의 지금·앞으로 나올 타워 모두 · 길게 누르면 연속 강화' }));
  panes.stat.append(h('div', { class: 'bs-note', text: '모든 타워 · 한도: 공속 ×5(초당 15회) · 관통 90% · 치명 100%' }));
  sheet.body.append(panes.grade, panes.stat, panes.gamble);
  showPane(sheet.tab ?? 'grade');

  const rows = new Map<number, RowEls>();
  const makeRow = (r: UpgradeRowModel, host: HTMLElement): void => {
    const grade = opts.gradeOf(r.k);
    const icon =
      grade && r.icon === '⬆'
        ? h('span', { class: 'up-icon up-icon-grade', text: r.name.slice(0, 2), attrs: { 'aria-hidden': 'true' } })
        : h('span', { class: 'up-icon', text: r.icon, attrs: { 'aria-hidden': 'true' } });
    if (grade) icon.style.setProperty('--grade-color', GRADE_COLORS[grade]);
    const lv = h('span', { class: 'up-lv' });
    const effect = h('div', { class: 'up-effect' });
    const btn = h('button', {
      class: 'btn up-buy',
      attrs: { type: 'button', 'data-testid': `upgrade-buy-${r.id}`, 'aria-label': `${r.name} 강화` },
    });
    const root = h(
      'div',
      { class: 'up-row', attrs: { 'data-testid': `upgrade-row-${r.id}` } },
      icon,
      h('div', { class: 'up-main' }, h('div', { class: 'up-name' }, h('span', { text: r.name }), lv), effect, h('div', { class: 'up-target', text: r.target })),
      btn,
    );
    host.append(root);
    const hold = attachHoldRepeat(btn, () => opts.onUpgrade(r.k));
    rows.set(r.k, { root, lv, effect, btn, hold, last: {} });
  };
  for (const r of first.grade) makeRow(r, panes.grade);
  for (const r of first.stat) makeRow(r, panes.stat);
  // 초월 자리: 열리면 채운다
  const transcendHost = h('div', { class: 'up-transcend' });
  panes.stat.append(transcendHost);

  // ---- 도박
  const reel = h('div', { class: 'gb-reel', attrs: { 'data-testid': 'gamble-reel', 'aria-live': 'polite' }, text: '🎰' });
  const resultEl = h('div', { class: 'gb-result', attrs: { 'data-testid': 'gamble-result' }, text: '테이블을 골라 돌려 보세요' });
  const gaugeCells = Array.from({ length: firstGamble.gaugeMax }, () => h('span', { class: 'gb-cell' }));
  const gaugeText = h('span', { class: 'gb-gauge-text', attrs: { 'data-testid': 'gamble-gauge' } });
  const gauge = h(
    'div',
    { class: 'gb-gauge', attrs: { 'aria-label': '잭팟 게이지' } },
    h('span', { class: 'gb-gauge-label', text: '잭팟' }),
    h('span', { class: 'gb-cells' }, ...gaugeCells),
    gaugeText,
  );
  const tableBtns = new Map<number, { btn: HTMLButtonElement; last: Partial<GambleTableModel> }>();
  const tables = h(
    'div',
    { class: 'gb-tables' },
    ...firstGamble.tables.map((tb) => {
      const btn = h(
        'button',
        {
          class: 'btn gb-table',
          attrs: { type: 'button', 'data-testid': `gamble-table-${tb.cost}`, 'aria-label': `${tb.costText} 도박` },
          on: { click: () => opts.onGamble(tb.t) },
        },
        h('span', { class: 'gb-cost', text: tb.costText }),
        h('span', { class: 'gb-range', text: tb.range }),
        h('span', { class: 'gb-lock' }),
      );
      tableBtns.set(tb.t, { btn, last: {} });
      return btn;
    }),
  );
  const odds = h('div', { class: 'gb-odds', attrs: { 'data-testid': 'gamble-odds' } });
  const recent = h('div', { class: 'gb-recent', attrs: { 'data-testid': 'gamble-recent' } });
  panes.gamble.append(h('div', { class: 'gb-slot' }, reel, resultEl), gauge, tables, odds, recent);

  let lastAps = '';
  let lastOdds = '';
  let lastRecent = '';
  let lastGauge = -1;
  let lastReady = false;
  let lastResult = '';
  let transcendBuilt = false;
  const updateRow = (r: UpgradeRowModel): void => {
    const e = rows.get(r.k);
    if (!e) return;
    if (e.last.levelText !== r.levelText) e.lv.textContent = r.levelText;
    if (e.last.effect !== r.effect) e.effect.textContent = r.effect;
    if (e.last.costText !== r.costText) e.btn.textContent = r.costText;
    if (e.last.state !== r.state) {
      e.root.dataset.state = r.state;
      e.btn.classList.toggle('is-off', r.state !== 'ok');
      e.btn.disabled = r.state === 'max' || r.state === 'locked';
      if (r.state === 'max') e.hold.stop();
    }
    e.last = r;
  };

  const view: UpgradeSheetView = {
    ...sheet,
    get size() {
      return sheet.size;
    },
    get tab() {
      return sheet.tab;
    },
    update(model, gb, slot) {
      if (model.apsMul !== lastAps) aps.textContent = lastAps = model.apsMul;
      for (const r of model.grade) updateRow(r);
      for (const r of model.stat) updateRow(r);
      if (model.transcend) {
        if (!transcendBuilt) {
          transcendBuilt = true;
          makeRow(model.transcend, transcendHost);
        }
        updateRow(model.transcend);
      }
      // 도박
      for (const tb of gb.tables) {
        const e = tableBtns.get(tb.t);
        if (!e) continue;
        if (e.last.state !== tb.state) {
          e.btn.dataset.state = tb.state;
          e.btn.classList.toggle('is-off', tb.state === 'gold' || tb.state === 'locked');
          const lock = e.btn.querySelector('.gb-lock');
          if (lock) lock.textContent = tb.state === 'locked' ? tb.lockText : tb.state === 'debug' ? '디버그' : '';
        }
        e.last = tb;
      }
      const spinning = slot?.spinning === true;
      for (const { btn } of tableBtns.values()) btn.toggleAttribute('aria-busy', spinning);
      if (gb.gauge !== lastGauge || gb.jackpotReady !== lastReady) {
        lastGauge = gb.gauge;
        lastReady = gb.jackpotReady;
        gaugeCells.forEach((c, i) => c.classList.toggle('is-on', i < gb.gauge));
        gauge.classList.toggle('is-ready', gb.jackpotReady);
        gaugeText.textContent = gb.jackpotReady ? '다음 ×3 이상!' : `${gb.gauge}/${gb.gaugeMax}`;
      }
      const oddsKey = `${gb.odds.map((o) => `${o.mul} ${o.pct}`).join(' · ')} — ${gb.expectation}`;
      if (oddsKey !== lastOdds) odds.textContent = lastOdds = oddsKey;
      const recentKey = gb.recent.length > 0 ? `최근: ${gb.recent.join(' ')}` : '최근: —';
      if (recentKey !== lastRecent) recent.textContent = lastRecent = recentKey;
      if (slot) {
        if (reel.textContent !== slot.reel) reel.textContent = slot.reel;
        reel.classList.toggle('is-spin', slot.spinning);
        const text = slot.spinning ? '두근두근…' : slot.result;
        if (text !== lastResult) resultEl.textContent = lastResult = text;
      }
    },
    destroy() {
      for (const e of rows.values()) e.hold.detach();
    },
  };
  view.update(first, firstGamble, null);
  return view;
}
