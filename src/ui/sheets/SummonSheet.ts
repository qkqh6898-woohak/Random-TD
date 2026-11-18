/**
 * ✨ 소환 시트 (G-1 하단 메뉴 [소환]): 일반 소환 + 소환 도박 4종 (행운 소환 · 종족 소환 · 등급 도전 · 신화 도박), 줄마다 확률과 천장.
 *
 * - 줄: 그림 · 이름 · 설명 · 확률 '노말 55% · 레어 35% · 유니크 10%' · 천장 '천장까지 12회 (유니크)' · [비용] 버튼.
 *   버튼을 짧게 누르면 한 번, 꾹 누르면 계속 (ui/hold.ts) — 돈이 모자라거나 칸이 없으면 멈춘다.
 * - 종족 소환: 줄 아래 종족 칩 7개 중 하나를 고른다 (고른 종족은 Game이 기억).
 * - 맨 아래 마지막 결과 한 줄.
 * 버튼은 onSummon()·onGacha(k)를 부르고, 실제 명령은 Game 장면이 보낸다 (sim이 실행 틱에 다시 검사). false면 꾹 누르기 멈춤.
 * 값은 g1Models.summonSheetModel(순수), 여기서는 그리기만.
 */
import { h } from '../dom';
import { attachHoldRepeat, type HoldHandle } from '../hold';
import { createBottomSheet, type BottomSheetView } from './BottomSheet';
import type { GachaRowModel, SummonSheetModel } from './g1Models';

export interface SummonSheetOptions {
  onSummon: () => boolean;
  onGacha: (k: number) => boolean;
  onFaction: (f: number) => void;
  onClose: () => void;
}

export interface SummonSheetView extends BottomSheetView<never> {
  update(model: SummonSheetModel, lastResult: string): void;
}

/** 소환 도박 판 (G-1): [🎰 도박] 시트의 '✨ 소환 도박' 탭이 쓴다. */
export interface SummonPane {
  readonly el: HTMLElement;
  update(model: SummonSheetModel, lastResult: string): void;
  destroy(): void;
}

export function createSummonSheet(opts: SummonSheetOptions, first: SummonSheetModel): SummonSheetView {
  const sheet = createBottomSheet<never>({ kind: 'summon', title: '✨ 소환', onClose: opts.onClose });
  const pane = createSummonPane(opts, first);
  sheet.body.append(pane.el);
  const view: SummonSheetView = {
    ...sheet,
    get size() {
      return sheet.size;
    },
    get tab() {
      return sheet.tab;
    },
    update: (m, r) => pane.update(m, r),
    destroy() {
      pane.destroy();
      sheet.destroy?.();
    },
  };
  return view;
}

export function createSummonPane(opts: Omit<SummonSheetOptions, 'onClose'>, first: SummonSheetModel): SummonPane {
  const root = h('div', { class: 'up-pane sm-pane', attrs: { 'data-pane': 'summon' } });
  const holds: HoldHandle[] = [];
  const note = h('div', { class: 'bs-note', text: '같은 캐릭터는 한 칸에 3개까지 쌓여요 · 3개가 된 칸을 누르면 승급 · 꾹 누르면 계속' });

  // 일반 소환 줄
  const nPity = h('span', { class: 'sm-pity', attrs: { 'data-testid': 'summon-pity-normal' } });
  const nBtn = h('button', { class: 'btn up-buy sm-buy', attrs: { type: 'button', 'data-testid': 'summon-buy-normal', 'aria-label': '일반 소환' } });
  holds.push(attachHoldRepeat(nBtn, () => opts.onSummon()));
  const nRow = h(
    'div',
    { class: 'up-row sm-row', attrs: { 'data-testid': 'summon-row-normal' } },
    h('span', { class: 'up-icon', text: '🎲', attrs: { 'aria-hidden': 'true' } }),
    h(
      'div',
      { class: 'up-main' },
      h('div', { class: 'up-name' }, h('span', { text: '일반 소환' })),
      h('div', { class: 'up-effect', text: '덱의 노말 5종 · 같은 칸에 쌓여요' }),
      nPity,
    ),
    nBtn,
  );

  interface RowEls {
    root: HTMLElement;
    odds: HTMLElement;
    pity: HTMLElement;
    btn: HTMLButtonElement;
    last: Partial<GachaRowModel>;
  }
  const rows = new Map<number, RowEls>();
  const factionChips: HTMLButtonElement[] = [];
  let factionSummary: HTMLElement | null = null;
  const rowEls = first.rows.map((r) => {
    const odds = h('div', { class: 'up-target sm-odds', attrs: { 'data-testid': `gacha-odds-${r.id}` } });
    const pity = h('span', { class: 'sm-pity', attrs: { 'data-testid': `gacha-pity-${r.id}` } });
    const btn = h('button', { class: 'btn up-buy sm-buy', attrs: { type: 'button', 'data-testid': `gacha-buy-${r.id}`, 'aria-label': `${r.name} ${r.costText}` } });
    holds.push(attachHoldRepeat(btn, () => opts.onGacha(r.k)));
    const extra: HTMLElement[] = [];
    if (r.faction) {
      const chips = h(
        'div',
        { class: 'sm-factions', attrs: { role: 'radiogroup', 'aria-label': '종족 고르기' } },
        ...first.factions.map((f, i) => {
          const b = h('button', {
            class: 'btn btn-chip sm-faction',
            attrs: { type: 'button', role: 'radio', 'data-testid': `gacha-faction-${f.id}` },
            text: f.name,
            on: { click: () => opts.onFaction(i) },
          });
          b.style.setProperty('--faction-color', f.color);
          factionChips.push(b);
          return b;
        }),
      );
      factionSummary = h('summary', { class: 'sm-faction-summary', text: '종족 고르기' });
      extra.push(h('details', { class: 'sm-faction-picker' }, factionSummary, h('div', { class: 'sm-faction-desc', text: r.desc }), chips));
    }
    const root = h(
      'div',
      { class: `up-row sm-row${r.faction ? ' sm-row-secondary' : ''}`, attrs: { 'data-testid': `gacha-row-${r.id}` } },
      h('span', { class: 'up-icon', text: r.icon, attrs: { 'aria-hidden': 'true' } }),
      h('div', { class: 'up-main' }, h('div', { class: 'up-name' }, h('span', { text: r.name })), r.faction ? null : h('div', { class: 'up-effect', text: r.desc }), odds, pity),
      btn,
      ...extra,
    );
    rows.set(r.k, { root, odds, pity, btn, last: {} });
    return root;
  });
  const result = h('div', { class: 'bs-note sm-result', attrs: { 'data-testid': 'gacha-result', 'aria-live': 'polite' } });
  root.append(note, nRow, h('div', { class: 'sm-sep', text: '소환 도박' }), ...rowEls, result);

  let lastN = '';
  let lastFaction = -1;
  let lastResult = '';
  const view: SummonPane = {
    el: root,
    update(m, res) {
      const nKey = `${m.normal.costText}|${m.normal.pity}|${m.normal.state}`;
      if (nKey !== lastN) {
        lastN = nKey;
        nBtn.textContent = m.normal.costText;
        nBtn.classList.toggle('is-off', m.normal.state !== 'ok');
        nPity.textContent = m.normal.pity;
        nPity.classList.toggle('is-hot', m.normal.pityLeft <= 3);
      }
      for (const r of m.rows) {
        const e = rows.get(r.k);
        if (!e) continue;
        if (e.last.odds !== r.odds) e.odds.textContent = r.odds;
        if (e.last.pity !== r.pity) e.pity.textContent = r.pity;
        if (e.last.pityLeft !== r.pityLeft) e.pity.classList.toggle('is-hot', r.pityLeft <= 3);
        if (e.last.costText !== r.costText) e.btn.textContent = r.costText;
        if (e.last.state !== r.state) {
          e.root.dataset.state = r.state;
          e.btn.classList.toggle('is-off', r.state !== 'ok');
        }
        e.last = r;
      }
      if (m.faction !== lastFaction) {
        lastFaction = m.faction;
        if (factionSummary) factionSummary.textContent = `종족 고르기 · ${first.factions[m.faction]?.name ?? ''}`;
        factionChips.forEach((b, i) => {
          b.classList.toggle('is-on', i === m.faction);
          b.setAttribute('aria-checked', i === m.faction ? 'true' : 'false');
        });
      }
      if (res !== lastResult) result.textContent = lastResult = res;
    },
    destroy() {
      for (const hd of holds) hd.detach();
    },
  };
  view.update(first, '');
  return view;
}
