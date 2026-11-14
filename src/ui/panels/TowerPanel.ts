/**
 * 타워 정보 패널 (DOM, DEV_PLAN M3-11, UI.md 4.4). 타워를 터치하면 화면 아래(타워가 아래쪽이면 위)에서 반쯤 올라온다.
 *
 * - 글자·버튼 상태는 towerPanelModel.ts(순수 함수)가 만들고, 여기서는 바뀐 부분만 DOM에 쓴다.
 * - [⬆ 승급] [⬆⬆ 모두 승급]은 sim 명령(merge/mergeAll)을 보내는 콜백만 부른다 (패널은 sim을 바꾸지 않는다).
 * - ✕·Esc(뒤로가기)로 닫는다. 맵의 빈 곳을 터치해도 닫힌다 (Game 장면).
 * - 캐릭터 그림은 Game 장면이 구운 타워 텍스처를 이미지 주소로 넘겨준다. CSS로 숨쉬기 동작을 반복한다.
 */
import { h } from '../dom';
import type { UiView } from '../root';
import type { StatCell, TowerPanelModel } from './towerPanelModel';

export interface TowerPanelOptions {
  onMerge: () => void;
  onMergeAll: () => void;
  onClose: () => void;
}

export type PanelSide = 'bottom' | 'top';

export interface TowerPanelView extends UiView {
  update(model: TowerPanelModel, portrait: string | null): void;
  /** 패널을 화면 아래 또는 위에 붙인다. top이면 위쪽 여백(CSS px) */
  setSide(side: PanelSide, topPx: number): void;
  /** 패널 상자 (무대 기준 CSS px) — 맵 탭이 패널 밑으로 새지 않았는지 볼 때 */
  rect(): DOMRect;
}

/** 타워 화면 위치(무대 높이 비율 0~1) → 패널을 붙일 쪽. 아래쪽 45% 안의 타워는 패널이 가리지 않게 위에 띄운다. */
export function panelSideFor(towerYRatio: number): PanelSide {
  return towerYRatio > 0.55 ? 'top' : 'bottom';
}

function statSpan(c: StatCell): HTMLElement {
  return h(
    'span',
    { class: `tp-stat${c.buffed ? ' is-buffed' : ''}` },
    h('span', { class: 'tp-label', text: c.label }),
    h('b', { class: 'tp-value', text: c.value }),
    c.base !== undefined ? h('span', { class: 'tp-base', text: `(${c.base})` }) : null,
  );
}

export function createTowerPanel(opts: TowerPanelOptions): TowerPanelView {
  const portrait = h('img', { class: 'tp-portrait', attrs: { alt: '', 'aria-hidden': 'true', draggable: 'false' } });
  const stars = h('span', { class: 'tp-stars', attrs: { 'data-testid': 'tp-stars' } });
  const name = h('span', { class: 'tp-name', attrs: { 'data-testid': 'tp-name' } });
  const level = h('span', { class: 'tp-level' });
  const subtitle = h('div', { class: 'tp-sub', attrs: { 'data-testid': 'tp-sub' } });
  const close = h('button', {
    class: 'btn btn-chip tp-close',
    attrs: { type: 'button', 'aria-label': '닫기', 'data-action': 'panel-close' },
    text: '✕',
    on: { click: () => opts.onClose() },
  });
  const statsEl = h('div', { class: 'tp-stats', attrs: { 'data-testid': 'tp-stats' } });
  const detect = h('div', { class: 'tp-line', attrs: { 'data-testid': 'tp-detect' } });
  const ability = h('div', { class: 'tp-line tp-ability', attrs: { 'data-testid': 'tp-ability' } });
  const owned = h('b', { class: 'tp-owned', attrs: { 'data-testid': 'tp-owned' } });
  const target = h('span', { class: 'tp-target', attrs: { 'data-testid': 'tp-target' } });
  const pausedEl = h('span', { class: 'tp-paused', text: '이동 중', attrs: { hidden: '' } });
  const mergeBtn = h('button', {
    class: 'btn tp-merge',
    attrs: { type: 'button', 'data-action': 'merge' },
    text: '⬆ 승급',
    on: { click: () => opts.onMerge() },
  });
  const mergeAllBtn = h('button', {
    class: 'btn tp-merge-all',
    attrs: { type: 'button', 'data-action': 'merge-all' },
    text: '⬆⬆ 모두 승급',
    on: { click: () => opts.onMergeAll() },
  });
  const note = h('div', { class: 'tp-note', attrs: { 'data-testid': 'tp-note' } });
  const outcomes = h('div', { class: 'tp-outcomes', attrs: { 'data-testid': 'tp-outcomes' } });

  const el = h(
    'section',
    { class: 'tower-panel is-bottom', attrs: { 'data-testid': 'tower-panel', role: 'dialog', 'aria-label': '타워 정보' } },
    h(
      'div',
      { class: 'tp-head' },
      h('div', { class: 'tp-portrait-wrap' }, portrait),
      h('div', { class: 'tp-title' }, h('div', { class: 'tp-name-row' }, stars, name, level), subtitle),
      close,
    ),
    statsEl,
    detect,
    ability,
    h(
      'div',
      { class: 'tp-line tp-owned-row' },
      h('span', { class: 'tp-label', text: '보유' }),
      owned,
      pausedEl,
      h('span', { class: 'hud-spacer' }),
      h('span', { class: 'tp-label', text: '대상' }),
      target,
    ),
    h('div', { class: 'tp-actions' }, mergeBtn, mergeAllBtn),
    note,
    outcomes,
  );

  const onKey = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') opts.onClose();
  };
  window.addEventListener('keydown', onKey);

  let lastKey = '';
  let lastPortrait: string | null = null;
  return {
    el,
    update(m, portraitUrl) {
      const key = JSON.stringify(m);
      if (portraitUrl !== lastPortrait) {
        lastPortrait = portraitUrl;
        if (portraitUrl) portrait.src = portraitUrl;
        portrait.hidden = !portraitUrl;
      }
      if (key === lastKey) return;
      lastKey = key;
      el.dataset.tower = m.towerId;
      el.dataset.grade = m.grade;
      stars.textContent = m.stars;
      stars.style.color = m.gradeColor;
      name.textContent = m.name;
      level.textContent = m.level;
      subtitle.textContent = m.subtitle;
      statsEl.replaceChildren(...m.stats.map((row) => h('div', { class: 'tp-row' }, ...row.map(statSpan))));
      detect.replaceChildren(h('span', { class: 'tp-label', text: '👁 감지' }), h('b', { text: m.detect }));
      ability.replaceChildren(h('span', { class: 'tp-label', text: '특색' }), h('span', { text: m.ability }));
      owned.textContent = m.owned;
      owned.classList.toggle('is-ready', m.ownedReady);
      target.textContent = m.target;
      pausedEl.hidden = !m.paused;
      mergeBtn.disabled = !m.mergeEnabled;
      mergeAllBtn.disabled = !m.mergeAllEnabled;
      mergeAllBtn.textContent = m.mergeAllTimes > 1 ? `⬆⬆ 모두 승급 ×${m.mergeAllTimes}` : '⬆⬆ 모두 승급';
      note.textContent = m.note;
      note.hidden = m.note === '';
      outcomes.textContent = m.outcomes ? `승급하면: ${m.outcomes}` : '';
      outcomes.hidden = m.outcomes === '';
    },
    setSide(side, topPx) {
      el.classList.toggle('is-bottom', side === 'bottom');
      el.classList.toggle('is-top', side === 'top');
      if (side === 'top') el.style.top = `${Math.round(topPx)}px`;
      else el.style.removeProperty('top');
    },
    rect() {
      return el.getBoundingClientRect();
    },
    destroy() {
      window.removeEventListener('keydown', onKey);
    },
  };
}
