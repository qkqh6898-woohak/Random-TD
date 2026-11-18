/**
 * ⬆ 강화 시트 (DEV_PLAN M5-3·M5-5, UI.md 4.5): 탭 3개 [등급 강화] / [능력치 강화] / [도박], 머리줄에 지금 공속 배율 '⚡×2.6'.
 *
 * - 강화 줄: 그림 · 이름 · Lv · 효과 '+40% → +44%' · [비용] 버튼. 버튼을 길게 누르면 돈이 허락하는 만큼 연속 (ui/hold.ts).
 *   초월은 등급 강화 3종이 모두 Lv50이 되면 능력치 탭 맨 아래에 나타난다.
 *   인원 한도 강화(피드백 #28, '🗼 인원 한도 20명 → 21명')는 능력치 6줄 아래 — 안내 한 줄과 함께.
 * - 도박 탭 (T-2): 테이블마다 한 줄 [버튼 · 릴 · 결과] — 테이블끼리 따로 돌아 10원·100원을 동시에 돌릴 수 있다 (전역 잠금 없음).
 *   버튼을 짧게 누르면 한 번, **꾹 누르면 계속** (릴이 멈추면 다음 판, 약 1초마다 / 연출 끄기면 약 0.15초마다) — 손을 떼거나
 *   돈이 모자라거나 시트를 닫으면 멈춘다. 연속 중인 줄에는 '자동' 표시. 1000원 계정 Lv7 · 10000원 Lv20 — 잠겨 있으면 🔒.
 *   아래에 잭팟 게이지 10칸(모든 테이블이 같이 씀), 배율표·기대값, 최근 결과 5개.
 * 버튼은 onUpgrade(k)·onGamble(t)를 부르고, 실제 명령은 Game 장면이 보낸다 (sim이 실행 틱에 다시 검사).
 * onGamble은 'spun'(돌림) · 'wait'(앞 릴이 아직 도는 중 — 연속이면 기다림) · 'stop'(돈 부족·잠김 → 연속 멈춤)을 돌려준다.
 * onUpgrade가 false를 돌려주면 길게 누르기 연속이 멈춘다 (돈이 모자람·최대).
 * 값은 sheetModels(순수), 여기서는 그리기만.
 */
import { GRADE_COLORS } from '../../art/palette';
import type { Grade } from '../../data/load';
import { h } from '../dom';
import { attachHoldRepeat, gambleHoldDelay, type HoldHandle } from '../hold';
import { createBottomSheet, type BottomSheetView } from './BottomSheet';
import type { GambleSheetModel, GambleTableModel, UpgradeRowModel, UpgradeSheetModel, UpgradeTab } from './sheetModels';
import type { SlotFrame } from './slot';
import { createSummonPane, type SummonSheetOptions } from './SummonSheet';
import type { SummonSheetModel } from './g1Models';

export interface UpgradeSheetOptions {
  onUpgrade: (k: number) => boolean;
  onClose: () => void;
  onTab?: (tab: UpgradeTab) => void;
  tab?: UpgradeTab;
  /** 강화 k의 대상 첫 등급 (그림 색) */
  gradeOf: (k: number) => Grade | null;
}

/** 도박 버튼 한 번의 결과: 돌림 · 앞 릴을 기다림 · 멈춤 (돈 부족 등) */
export type GambleFire = 'spun' | 'wait' | 'stop';

/** 테이블 하나의 릴 (화면 연출 — 결과는 sim이 이미 정했다) */
export type GambleSlotView = SlotFrame & { result: string };

export interface UpgradeSheetView extends BottomSheetView<UpgradeTab> {
  update(model: UpgradeSheetModel): void;
}

/** G-1 [🎰 도박] 시트 탭: 돈 도박 · 소환 도박 */
export type GambleTab = 'money' | 'summon';

export interface GambleSheetView extends BottomSheetView<GambleTab> {
  /** slots: 테이블 번호 → 그 테이블 릴 (돌린 적 없으면 없음) */
  update(gamble: GambleSheetModel, slots: ReadonlyMap<number, GambleSlotView>, summon?: SummonSheetModel, summonResult?: string): void;
  /** 그 테이블 버튼을 꾹 누르는 중(자동 연속)인가 — E2E·테스트 */
  gambleAuto(t: number): boolean;
}

export interface GambleSheetOptions {
  onGamble: (t: number) => GambleFire;
  onClose: () => void;
  /** G-1 '✨ 소환 도박' 탭 (일반 소환 + 소환 도박 4종 + 천장) */
  summon?: { opts: Omit<SummonSheetOptions, 'onClose'>; first: SummonSheetModel };
  tab?: GambleTab;
  onTab?: (tab: GambleTab) => void;
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
] as const;

export function createUpgradeSheet(opts: UpgradeSheetOptions, first: UpgradeSheetModel): UpgradeSheetView {
  const panes: Record<Exclude<UpgradeTab, 'gamble'>, HTMLElement> = {
    grade: h('div', { class: 'up-pane', attrs: { 'data-pane': 'grade' } }),
    stat: h('div', { class: 'up-pane', attrs: { 'data-pane': 'stat' } }),
  };
  const showPane = (tab: UpgradeTab): void => {
    for (const [id, p] of Object.entries(panes)) p.hidden = id !== tab;
  };
  const sheet = createBottomSheet<UpgradeTab>({
    kind: 'upgrade',
    title: '⬆ 강화',
    tabs: TABS,
    tab: opts.tab === 'gamble' ? 'grade' : (opts.tab ?? 'grade'),
    onTab: (t) => {
      showPane(t);
      opts.onTab?.(t);
    },
    onClose: opts.onClose,
  });
  const aps = h('span', { class: 'up-aps', attrs: { 'data-testid': 'upgrade-aps', 'aria-label': '지금 공격속도 배율' } });
  sheet.extra.append(aps);
  panes.grade.append(h('div', { class: 'bs-note', text: '등급군의 지금·앞으로 나올 타워 모두 · 길게 누르면 연속 강화' }));
  panes.stat.append(h('div', { class: 'bs-note', attrs: { 'data-testid': 'upgrade-stat-note' }, text: first.statNote }));
  sheet.body.append(panes.grade, panes.stat);
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
  if (first.unitCap) {
    panes.stat.append(h('div', { class: 'bs-note', attrs: { 'data-testid': 'upgrade-unitcap-note' }, text: '인원 한도 · 소환할 수 있는 내 타워 수' }));
    makeRow(first.unitCap, panes.stat);
  }
  // 초월 자리: 열리면 채운다
  const transcendHost = h('div', { class: 'up-transcend' });
  panes.stat.append(transcendHost);

  let lastAps = '';
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
    update(model) {
      if (model.apsMul !== lastAps) aps.textContent = lastAps = model.apsMul;
      for (const r of model.grade) updateRow(r);
      for (const r of model.stat) updateRow(r);
      if (model.unitCap) updateRow(model.unitCap);
      if (model.transcend) {
        if (!transcendBuilt) {
          transcendBuilt = true;
          makeRow(model.transcend, transcendHost);
        }
        updateRow(model.transcend);
      }
    },
    destroy() {
      for (const e of rows.values()) e.hold.detach();
      sheet.destroy?.();
    },
  };
  view.update(first);
  return view;
}

/**
 * 🎰 도박 시트 (G-1 하단 메뉴 [도박] — 예전 강화 시트의 도박 탭을 그대로 옮김, data-testid 그대로).
 * 테이블마다 한 줄 [버튼 · 릴 · 결과 · 자동], 잭팟 게이지, 배율표·기대값, 최근 결과.
 */
export function createGambleSheet(opts: GambleSheetOptions, firstGamble: GambleSheetModel): GambleSheetView {
  const summon = opts.summon ? createSummonPane(opts.summon.opts, opts.summon.first) : null;
  const pane = h('div', { class: 'up-pane gb-pane', attrs: { 'data-pane': 'gamble' } });
  const show = (t: GambleTab): void => {
    pane.hidden = t !== 'money';
    if (summon) summon.el.hidden = t !== 'summon';
  };
  const sheet = createBottomSheet<GambleTab>({
    kind: 'gamble',
    title: '🎰 도박',
    ...(summon
      ? {
          tabs: [
            { id: 'money', label: '💰 돈 도박' },
            { id: 'summon', label: '✨ 소환 도박' },
          ],
          tab: opts.tab ?? 'money',
          onTab: (t: GambleTab) => {
            show(t);
            opts.onTab?.(t);
          },
        }
      : {}),
    onClose: opts.onClose,
  });
  sheet.body.append(pane);
  if (summon) sheet.body.append(summon.el);
  show(sheet.tab ?? 'money');
  // ---- 도박 (T-2): 테이블마다 한 줄 [버튼 · 릴 · 결과 · 자동]
  const gaugeCells = Array.from({ length: firstGamble.gaugeMax }, () => h('span', { class: 'gb-cell' }));
  const gaugeText = h('span', { class: 'gb-gauge-text', attrs: { 'data-testid': 'gamble-gauge' } });
  const gauge = h(
    'div',
    { class: 'gb-gauge', attrs: { 'aria-label': '잭팟 게이지' } },
    h('span', { class: 'gb-gauge-label', text: '잭팟' }),
    h('span', { class: 'gb-cells' }, ...gaugeCells),
    gaugeText,
  );
  interface TableEls {
    row: HTMLElement;
    btn: HTMLButtonElement;
    reel: HTMLElement;
    result: HTMLElement;
    auto: HTMLElement;
    hold: HoldHandle;
    last: Partial<GambleTableModel>;
    lastResult: string;
    lastAuto: boolean;
  }
  const tableEls = new Map<number, TableEls>();
  const tables = h(
    'div',
    { class: 'gb-tables' },
    ...firstGamble.tables.map((tb) => {
      const btn = h(
        'button',
        {
          class: 'btn gb-table',
          attrs: { type: 'button', 'data-testid': `gamble-table-${tb.cost}`, 'aria-label': `${tb.costText} 도박 (꾹 누르면 연속)` },
        },
        h('span', { class: 'gb-cost', text: tb.costText }),
        h('span', { class: 'gb-range', text: tb.range }),
        h('span', { class: 'gb-lock' }),
      );
      const reel = h('div', { class: 'gb-reel', attrs: { 'data-testid': `gamble-reel-${tb.cost}`, 'aria-live': 'polite' }, text: '🎰' });
      const result = h('div', { class: 'gb-result', attrs: { 'data-testid': `gamble-result-${tb.cost}` }, text: '' });
      const auto = h('span', { class: 'gb-auto', text: '자동', attrs: { 'data-testid': `gamble-auto-${tb.cost}`, hidden: '' } });
      const row = h('div', { class: 'gb-row', attrs: { 'data-testid': `gamble-row-${tb.cost}` } }, btn, h('div', { class: 'gb-slot' }, reel, auto), result);
      // 짧게 누르면 한 번, 꾹 누르면 릴이 멈출 때마다 다음 판 (Game이 'wait'로 릴을 기다리게 한다)
      const hold = attachHoldRepeat(btn, () => opts.onGamble(tb.t) !== 'stop', { delay: gambleHoldDelay });
      tableEls.set(tb.t, { row, btn, reel, result, auto, hold, last: {}, lastResult: '', lastAuto: false });
      return row;
    }),
  );
  // 배율표와 기대값은 따로 — 좁은 화면에서 '기대값'과 '91%'가 갈라져 줄이 바뀌지 않게 기대값 덩어리는 줄바꿈 없음 (M5 검토 반영)
  const oddsList = h('span', { class: 'gb-odds-list' });
  const oddsEv = h('span', { class: 'gb-odds-ev', attrs: { 'data-testid': 'gamble-ev' } });
  const odds = h('div', { class: 'gb-odds', attrs: { 'data-testid': 'gamble-odds' } }, oddsList, oddsEv);
  const recent = h('div', { class: 'gb-recent', attrs: { 'data-testid': 'gamble-recent' } });
  pane.append(
    h('div', { class: 'bs-note', text: '테이블마다 따로 돌아요 · 꾹 누르면 계속 돌아가요' }),
    tables,
    gauge,
    odds,
    recent,
  );

  let lastOdds = '';
  let lastEv = '';
  let lastRecent = '';
  let lastGauge = -1;
  let lastReady = false;
  const view: GambleSheetView = {
    ...sheet,
    get size() {
      return sheet.size;
    },
    get tab() {
      return sheet.tab;
    },
    update(gb, slots, sm, smResult) {
      if (summon && sm) summon.update(sm, smResult ?? '');
      // 도박: 테이블마다 버튼 상태 · 릴 · 결과 · 자동 표시
      for (const tb of gb.tables) {
        const e = tableEls.get(tb.t);
        if (!e) continue;
        if (e.last.state !== tb.state) {
          e.btn.dataset.state = tb.state;
          e.btn.classList.toggle('is-off', tb.state === 'gold' || tb.state === 'locked');
          const lock = e.btn.querySelector('.gb-lock');
          if (lock) lock.textContent = tb.state === 'locked' ? tb.lockText : tb.state === 'debug' ? '디버그' : '';
        }
        e.last = tb;
        const slot = slots.get(tb.t);
        if (slot) {
          if (e.reel.textContent !== slot.reel) e.reel.textContent = slot.reel;
          e.reel.classList.toggle('is-spin', slot.spinning);
          e.btn.toggleAttribute('aria-busy', slot.spinning);
          // 연속 중에는 도는 동안 앞 결과를 남겨 둔다 (글자가 깜빡이지 않게)
          const text = slot.spinning ? (e.hold.repeating && e.lastResult ? e.lastResult : '두근두근…') : slot.result;
          if (text !== e.lastResult) e.result.textContent = e.lastResult = text;
        }
        const auto = e.hold.repeating;
        if (auto !== e.lastAuto) {
          e.lastAuto = auto;
          e.auto.hidden = !auto;
          e.row.classList.toggle('is-auto', auto);
        }
      }
      if (gb.gauge !== lastGauge || gb.jackpotReady !== lastReady) {
        lastGauge = gb.gauge;
        lastReady = gb.jackpotReady;
        gaugeCells.forEach((c, i) => c.classList.toggle('is-on', i < gb.gauge));
        gauge.classList.toggle('is-ready', gb.jackpotReady);
        gaugeText.textContent = gb.jackpotReady ? gb.readyText : `${gb.gauge}/${gb.gaugeMax}`;
      }
      const oddsKey = gb.odds
        .filter((o) => o.pct !== '0%')
        .map((o) => `${o.mul}\u00a0${o.pct}`) // '×5'와 '2%'가 다른 줄로 갈라지지 않게
        .join(' · ');
      if (oddsKey !== lastOdds) oddsList.textContent = lastOdds = oddsKey;
      const evKey = ` — ${gb.expectation}`;
      if (evKey !== lastEv) oddsEv.textContent = lastEv = evKey;
      const recentKey = gb.recent.length > 0 ? `최근: ${gb.recent.join(' ')}` : '최근: —';
      if (recentKey !== lastRecent) recent.textContent = lastRecent = recentKey;
    },
    gambleAuto(t) {
      return tableEls.get(t)?.hold.repeating === true;
    },
    destroy() {
      for (const e of tableEls.values()) e.hold.detach();
      summon?.destroy();
      sheet.destroy?.();
    },
  };
  view.update(firstGamble, new Map());
  return view;
}
