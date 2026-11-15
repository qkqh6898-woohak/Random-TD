/**
 * ⚔ 도전 시트 (DEV_PLAN M5-2, UI.md 4.5): 단계 카드 목록 (보스 그림 · 이름 · 체력 · 보상 · 특수 능력 · 상태).
 * 상태: [시작] / ⏳4:32 / 🔒 / 진행 중. 진행 중이면 맨 위에 '진행 중 · 3단계 돌거북 · 18초'.
 * [시작]을 누르면 onStart(lv) → Game 장면이 startChallenge 명령을 보낸다 (sim이 실행 틱에 다시 검사).
 * 값은 sheetModels.challengeSheetModel(순수), 여기서는 그리기만 (바뀐 글자만 쓴다).
 */
import { h } from '../dom';
import { createBottomSheet, type BottomSheetView } from './BottomSheet';
import type { ChallengeRowModel, ChallengeSheetModel } from './sheetModels';

export interface ChallengeSheetOptions {
  onStart: (lv: number) => void;
  onClose: () => void;
  /** 도전 보스 그림 주소 (없으면 null → 단계 숫자) */
  portrait: (mobId: string) => string | null;
}

export interface ChallengeSheetView extends BottomSheetView<never> {
  update(model: ChallengeSheetModel): void;
}

interface RowEls {
  root: HTMLElement;
  btn: HTMLButtonElement;
  done: HTMLElement;
  last: Partial<ChallengeRowModel>;
}

export function createChallengeSheet(opts: ChallengeSheetOptions, first: ChallengeSheetModel): ChallengeSheetView {
  const sheet = createBottomSheet<never>({ kind: 'challenge', title: '⚔ 도전', onClose: opts.onClose });
  const active = h('div', { class: 'ch-active', attrs: { 'data-testid': 'challenge-active', role: 'timer', 'aria-live': 'off' } });
  const note = h('div', { class: 'bs-note', text: '단계마다 30초 · 끝나면 그 단계만 5분 쉬어요 · 실패해도 벌칙 없음' });
  const list = h('div', { class: 'ch-list' });
  sheet.body.append(active, note, list);
  const rows = new Map<number, RowEls>();
  for (const r of first.rows) {
    const src = opts.portrait(r.id);
    const pic = src
      ? h('img', { class: 'ch-pic', attrs: { src, alt: '', draggable: 'false' } })
      : h('span', { class: 'ch-pic ch-pic-num', text: String(r.lv), attrs: { 'aria-hidden': 'true' } });
    const btn = h('button', {
      class: 'btn ch-btn',
      attrs: { type: 'button', 'data-testid': `challenge-start-${r.lv}`, 'aria-label': `도전 ${r.lv}단계 ${r.name} 시작` },
      text: r.label,
      on: { click: () => opts.onStart(r.lv) },
    });
    const done = h('span', { class: 'ch-done', text: '✅', attrs: { 'aria-label': '잡음', hidden: '' } });
    const root = h(
      'div',
      { class: 'ch-row', attrs: { 'data-lv': String(r.lv), 'data-testid': `challenge-row-${r.lv}` } },
      h('div', { class: 'ch-pic-wrap' }, pic, h('span', { class: 'ch-lv', text: `${r.lv}단계` })),
      h(
        'div',
        { class: 'ch-main' },
        h('div', { class: 'ch-name' }, h('span', { text: r.name }), done),
        h('div', { class: 'ch-stats' }, h('span', { class: 'ch-hp', text: r.hp }), h('span', { class: 'ch-reward', text: r.reward })),
        r.ability ? h('div', { class: 'ch-ability', text: r.ability }) : null,
      ),
      btn,
    );
    list.append(root);
    rows.set(r.lv, { root, btn, done, last: {} });
  }
  let lastActive: string | null = null;
  const view: ChallengeSheetView = {
    ...sheet,
    get size() {
      return sheet.size;
    },
    get tab() {
      return sheet.tab;
    },
    update(model) {
      if (model.activeText !== lastActive) {
        lastActive = model.activeText;
        active.textContent = model.activeText;
        active.hidden = model.activeText === '';
      }
      active.classList.toggle('is-warn', model.activeSec > 0 && model.activeSec <= 10);
      for (const r of model.rows) {
        const e = rows.get(r.lv);
        if (!e) continue;
        if (e.last.label !== r.label) e.btn.textContent = r.label;
        if (e.last.state !== r.state) {
          e.root.dataset.state = r.state;
          e.btn.disabled = r.state !== 'ready';
        }
        if (e.last.cleared !== r.cleared) e.done.hidden = !r.cleared;
        e.last = r;
      }
    },
  };
  view.update(first);
  return view;
}
