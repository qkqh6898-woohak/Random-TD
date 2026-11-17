/**
 * 💠 신화 시트 (G-1 하단 메뉴 [신화]): 신화(히든) 조합 도감 12종 + [제작].
 *
 * - 줄: 초상화 · 이름 · 재료 칩 (판 위에 있으면 ✓) · [제작].
 *   발견 전 조합은 초상화를 실루엣(검게)으로, 이름 '???', 재료는 힌트 하나(등급이 가장 높은 재료)만 이름 — 나머지 '???'.
 * - 발견 = 만들었거나 재료를 한꺼번에 가졌을 때 (계정에 영구 기록 — src/meta/account.ts codex).
 * - [제작]은 발견한 조합에서 재료가 모두 판 위에 있고 놓을 칸이 있을 때만 켜진다 → onCraft(r) → Game이 craft 명령.
 * 값은 g1Models.codexSheetModel(순수), 여기서는 그리기만.
 */
import { h } from '../dom';
import { createBottomSheet, type BottomSheetView } from './BottomSheet';
import type { CodexRowModel, CodexSheetModel } from './g1Models';

export interface MythicSheetOptions {
  onCraft: (r: number) => void;
  onClose: () => void;
  portrait: (towerId: string) => string | null;
}

export interface MythicSheetView extends BottomSheetView<never> {
  update(model: CodexSheetModel): void;
}

export function createMythicSheet(opts: MythicSheetOptions, first: CodexSheetModel): MythicSheetView {
  const sheet = createBottomSheet<never>({ kind: 'mythic', title: '💠 신화 도감', onClose: opts.onClose });
  const summary = h('span', { class: 'my-summary', attrs: { 'data-testid': 'mythic-summary' } });
  sheet.extra.append(summary);
  const note = h('div', { class: 'bs-note', text: '재료가 모두 판 위에 있으면 만들 수 있어요 · 만들거나 재료를 한꺼번에 모으면 도감에 기록돼요' });
  sheet.body.append(note);
  interface RowEls {
    root: HTMLElement;
    pic: HTMLImageElement;
    name: HTMLElement;
    mats: HTMLElement;
    btn: HTMLButtonElement;
    note: HTMLElement;
    key: string;
  }
  const rows = new Map<number, RowEls>();
  for (const r of first.rows) {
    const pic = h('img', { class: 'my-pic', attrs: { alt: '', 'aria-hidden': 'true' } });
    const src = opts.portrait(r.id);
    if (src) pic.src = src;
    const name = h('span', { class: 'my-name' });
    const mats = h('div', { class: 'my-mats' });
    const btn = h('button', {
      class: 'btn up-buy my-craft',
      attrs: { type: 'button', 'data-testid': `mythic-craft-${r.id}` },
      text: '제작',
      on: { click: () => opts.onCraft(r.r) },
    });
    const rowNote = h('div', { class: 'my-note' });
    const root = h(
      'div',
      { class: 'up-row my-row', attrs: { 'data-testid': `mythic-row-${r.id}` } },
      pic,
      h('div', { class: 'up-main' }, h('div', { class: 'up-name' }, name), mats, rowNote),
      btn,
    );
    sheet.body.append(root);
    rows.set(r.r, { root, pic, name, mats, btn, note: rowNote, key: '' });
  }
  let lastSummary = '';
  const paint = (e: RowEls, r: CodexRowModel): void => {
    const key = `${r.found}|${r.name}|${r.craftable}|${r.note}|${r.materials.map((m) => `${m.name}:${m.onBoard}`).join(',')}`;
    if (key === e.key) return;
    e.key = key;
    e.root.dataset.found = r.found ? '1' : '0';
    e.root.classList.toggle('is-ready', r.craftable);
    e.pic.classList.toggle('is-silhouette', !r.found);
    e.name.textContent = r.found ? `💠 ${r.name}` : '💠 ???';
    e.mats.replaceChildren(
      ...r.materials.map((m) => h('span', { class: `my-mat${m.onBoard ? ' is-on' : ''}${m.known ? '' : ' is-unknown'}`, text: m.onBoard ? `✓ ${m.name}` : m.name })),
    );
    e.btn.disabled = !r.craftable;
    e.btn.classList.toggle('is-off', !r.craftable);
    e.btn.hidden = !r.found;
    e.note.textContent = r.note;
  };
  const view: MythicSheetView = {
    ...sheet,
    get size() {
      return sheet.size;
    },
    get tab() {
      return sheet.tab;
    },
    update(m) {
      if (m.summary !== lastSummary) summary.textContent = lastSummary = m.summary;
      for (const r of m.rows) {
        const e = rows.get(r.r);
        if (e) paint(e, r);
      }
    },
  };
  view.update(first);
  return view;
}
