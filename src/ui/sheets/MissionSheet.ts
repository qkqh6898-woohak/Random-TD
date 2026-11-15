/**
 * 📋 미션 시트 (DEV_PLAN M5-6, UI.md 4.5): 탭 [일반 30] [히든 ???], 줄마다 진행도 바 · 보상 · [받기], 머리줄에 [모두 받기].
 * 받을 수 있는 것 → 진행 중 → 받은 것 순으로 정렬한다 (달성해 받은 미션은 아래로). 히든은 발견 전까지 '???'.
 * [받기]·[모두 받기]는 onClaim(i)·onClaimAll() → Game 장면이 claimMission·claimAllMissions 명령을 보낸다.
 * 값은 sheetModels.missionSheetModel(순수), 여기서는 그리기만 (줄 순서가 바뀔 때만 다시 붙인다).
 */
import { h } from '../dom';
import { withCommas } from '../hud/hudModel';
import { createBottomSheet, type BottomSheetView } from './BottomSheet';
import type { MissionRowModel, MissionSheetModel, MissionTab } from './sheetModels';

export interface MissionSheetOptions {
  onClaim: (i: number) => void;
  onClaimAll: () => void;
  onClose: () => void;
  onTab?: (tab: MissionTab) => void;
  tab?: MissionTab;
  tabLabels: Record<MissionTab, string>;
}

export interface MissionSheetView extends BottomSheetView<MissionTab> {
  update(model: MissionSheetModel): void;
}

interface RowEls {
  root: HTMLElement;
  name: HTMLElement;
  cat: HTMLElement;
  fill: HTMLElement;
  prog: HTMLElement;
  reward: HTMLElement;
  btn: HTMLButtonElement;
  last: Partial<MissionRowModel>;
}

export function createMissionSheet(opts: MissionSheetOptions, first: MissionSheetModel): MissionSheetView {
  const lists: Record<MissionTab, HTMLElement> = {
    normal: h('div', { class: 'ms-list', attrs: { 'data-pane': 'normal' } }),
    hidden: h('div', { class: 'ms-list', attrs: { 'data-pane': 'hidden' } }),
  };
  const summary = h('div', { class: 'bs-note ms-summary', attrs: { 'data-testid': 'mission-summary' } });
  const showPane = (tab: MissionTab): void => {
    for (const [id, p] of Object.entries(lists)) p.hidden = id !== tab;
  };
  const sheet = createBottomSheet<MissionTab>({
    kind: 'mission',
    title: '📋 미션',
    tabs: [
      { id: 'normal', label: opts.tabLabels.normal },
      { id: 'hidden', label: opts.tabLabels.hidden },
    ],
    tab: opts.tab ?? 'normal',
    onTab: (t) => {
      showPane(t);
      lastSummary = '';
      opts.onTab?.(t);
    },
    onClose: opts.onClose,
  });
  const claimAll = h('button', {
    class: 'btn ms-claim-all',
    attrs: { type: 'button', 'data-testid': 'mission-claim-all' },
    text: '모두 받기',
    on: { click: () => opts.onClaimAll() },
  });
  sheet.extra.append(claimAll);
  sheet.body.append(summary, lists.normal, lists.hidden);
  showPane(sheet.tab ?? 'normal');

  const rows = new Map<number, RowEls>();
  const build = (r: MissionRowModel): RowEls => {
    const name = h('span', { class: 'ms-name-text' });
    const cat = h('span', { class: 'ms-cat' });
    const fill = h('span', { class: 'ms-fill' });
    const prog = h('span', { class: 'ms-prog' });
    const reward = h('span', { class: 'ms-reward' });
    const btn = h('button', {
      class: 'btn ms-claim',
      attrs: { type: 'button', 'data-testid': `mission-claim-${r.id}` },
      text: '받기',
      on: { click: () => opts.onClaim(r.i) },
    });
    const root = h(
      'div',
      { class: `ms-row${r.hidden ? ' is-hidden' : ''}`, attrs: { 'data-testid': `mission-row-${r.id}`, 'data-id': r.id } },
      h('div', { class: 'ms-main' }, h('div', { class: 'ms-name' }, cat, name), h('div', { class: 'ms-bar' }, fill, prog)),
      h('div', { class: 'ms-side' }, reward, btn),
    );
    return { root, name, cat, fill, prog, reward, btn, last: {} };
  };
  const orderKey: Record<MissionTab, string> = { normal: '', hidden: '' };
  let lastSummary = '';
  let lastClaim = '';

  const view: MissionSheetView = {
    ...sheet,
    get size() {
      return sheet.size;
    },
    get tab() {
      return sheet.tab;
    },
    update(model) {
      for (const tab of ['normal', 'hidden'] as const) {
        const list = model[tab];
        for (const r of list) {
          let e = rows.get(r.i);
          if (!e) {
            e = build(r);
            rows.set(r.i, e);
          }
          if (e.last.name !== r.name) e.name.textContent = r.name;
          if (e.last.cat !== r.cat) e.cat.textContent = r.cat;
          if (e.last.reward !== r.reward) e.reward.textContent = r.reward;
          if (e.last.progressText !== r.progressText) e.prog.textContent = r.progressText;
          const [v, n] = r.progress;
          const pct = r.status !== 'open' ? 100 : n > 0 ? Math.floor((Math.min(v, n) * 100) / n) : 0;
          const width = `${pct}%`;
          if (e.fill.style.width !== width) e.fill.style.width = width;
          if (e.last.status !== r.status) {
            e.root.dataset.status = r.status;
            e.btn.hidden = r.status === 'open';
            e.btn.disabled = r.status !== 'done';
            e.btn.textContent = r.status === 'claimed' ? '✅ 받음' : '받기';
          }
          if (e.last.revealed !== r.revealed) e.root.classList.toggle('is-revealed', r.revealed);
          e.last = r;
        }
        const key = list.map((r) => r.i).join(',');
        if (key !== orderKey[tab]) {
          orderKey[tab] = key;
          lists[tab].replaceChildren(...list.map((r) => (rows.get(r.i) as RowEls).root));
        }
      }
      const sum = sheet.tab === 'hidden' ? model.hiddenSummary : model.normalSummary;
      if (sum !== lastSummary) summary.textContent = lastSummary = sum;
      const claimKey = `${model.claimable}|${model.claimableTotal}`;
      if (claimKey !== lastClaim) {
        lastClaim = claimKey;
        claimAll.disabled = model.claimable === 0;
        claimAll.textContent = model.claimable > 0 ? `모두 받기 ${model.claimable} · +${withCommas(model.claimableTotal)}원` : '모두 받기';
      }
    },
  };
  view.update(first);
  return view;
}
