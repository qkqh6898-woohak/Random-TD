/**
 * 타워 정보 패널 (DOM, DEV_PLAN M3-11, UI.md 4.4). 타워를 터치하면 화면 아래(타워가 아래쪽이면 위)에서 반쯤 올라온다.
 *
 * - 자리 (검토 반영): 패널의 실제 높이와 고른 타워 그림(머리 ~ 받침대)의 화면 위치를 재서 **겹치지 않는 쪽**에 붙인다
 *   (아래 우선, 안 되면 위). 맵 가운데 줄처럼 어느 쪽도 안 되면 덜 중요한 줄부터 접는다:
 *   1단계 = 승급 결과 미리 보기·안내, 2단계 = 감지·보유/대상 줄, 3단계 = 관통·치명 줄, 4단계 = 특색 두 줄까지(…),
 *   5단계 = 특색 한 줄, 6단계 = 특색까지. 그래도 겹치면 가장 덜 겹치는 쪽.
 *   (검토 반영: 특색 설명은 이 패널에서만 보이므로 가장 늦게 접는다 — 예전엔 2단계에서 숨겨 가운데 줄 타워는 볼 수 없었다)
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
/**
 * 접기 단계: 0 = 모두, 1 = 승급 결과·안내 숨김, 2 = 감지·보유/대상 숨김, 3 = 관통·치명 줄 숨김,
 * 4 = 특색 두 줄까지, 5 = 특색 한 줄, 6 = 특색도 숨김 (styles.css)
 */
export type PanelDensity = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export const PANEL_DENSITIES: readonly PanelDensity[] = [0, 1, 2, 3, 4, 5, 6];

export interface PanelPlacement {
  side: PanelSide;
  density: PanelDensity;
  /** 고른 타워 그림과 겹치는 높이 (CSS px, 0이면 안 가림) */
  overlap: number;
}

/** 세로 구간 (무대 위쪽에서 CSS px) */
export interface Span {
  top: number;
  bottom: number;
}

function overlapOf(a: Span, b: Span): number {
  return Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
}

/**
 * 패널을 붙일 쪽과 접기 단계 (순수 함수). 접기 단계가 낮은(정보가 많은) 것부터, 같은 단계에서는 아래 → 위 순으로
 * 타워 그림과 겹치지 않는 첫 자리. 모두 겹치면 가장 많이 접은 단계에서 덜 겹치는 쪽 (같으면 아래).
 * @param heights 접기 단계별 패널 높이 (CSS px). 주어진 단계까지만 본다 (길이 3이면 0~2단계)
 * @param figure 고른 타워 그림의 세로 구간
 * @param topY 위에 붙일 때 패널 위쪽 끝
 * @param bottomY 아래에 붙일 때 패널 아래쪽 끝
 */
export function choosePanelPlacement(heights: readonly number[], figure: Span, topY: number, bottomY: number): PanelPlacement {
  const spanOf = (side: PanelSide, h: number): Span => (side === 'bottom' ? { top: bottomY - h, bottom: bottomY } : { top: topY, bottom: topY + h });
  let last: PanelPlacement = { side: 'bottom', density: 0, overlap: Infinity };
  for (const density of PANEL_DENSITIES.slice(0, Math.max(1, heights.length))) {
    const h = heights[density] ?? 0;
    const bottom = overlapOf(spanOf('bottom', h), figure);
    const top = overlapOf(spanOf('top', h), figure);
    if (bottom === 0) return { side: 'bottom', density, overlap: 0 };
    if (top === 0) return { side: 'top', density, overlap: 0 };
    last = top < bottom ? { side: 'top', density, overlap: top } : { side: 'bottom', density, overlap: bottom };
  }
  return last;
}

export interface TowerPanelView extends UiView {
  /** 글자·버튼 갱신. 바뀐 것이 있으면 true (패널 높이가 달라졌을 수 있다 → 자리를 다시 정한다) */
  update(model: TowerPanelModel, portrait: string | null): boolean;
  /**
   * 고른 타워 그림(무대 CSS px 세로 구간)을 가리지 않게 붙일 쪽과 접기 단계를 정해 적용한다.
   * @param topPx 위에 붙일 때 패널 위쪽 끝 (HUD 띠 + 알림 한 줄 아래)
   */
  place(figure: Span, topPx: number): PanelPlacement;
  /** 패널 상자 (무대 기준 CSS px) — 맵 탭이 패널 밑으로 새지 않았는지 볼 때 */
  rect(): DOMRect;
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
  const detect = h('div', { class: 'tp-line tp-detect', attrs: { 'data-testid': 'tp-detect' } });
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
    { class: 'tower-panel is-bottom', attrs: { 'data-testid': 'tower-panel', 'data-density': '0', role: 'dialog', 'aria-label': '타워 정보' } },
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
      if (key === lastKey) return false;
      lastKey = key;
      el.dataset.tower = m.towerId;
      el.dataset.grade = m.grade;
      stars.textContent = m.stars;
      stars.style.color = m.gradeColor;
      name.textContent = m.name;
      level.textContent = m.level;
      subtitle.textContent = m.subtitle;
      // 셋째 줄(방관·마관·치명)은 접기 3단계에서 숨긴다 (tp-row-pen)
      statsEl.replaceChildren(...m.stats.map((row, i) => h('div', { class: i === 2 ? 'tp-row tp-row-pen' : 'tp-row' }, ...row.map(statSpan))));
      detect.replaceChildren(h('span', { class: 'tp-label', text: '👁 감지' }), h('b', { text: m.detect }));
      ability.replaceChildren(h('span', { class: 'tp-label', text: m.abilityLabel }), h('span', { text: m.ability }));
      owned.textContent = m.owned;
      owned.classList.toggle('is-ready', m.ownedReady);
      target.textContent = m.target;
      pausedEl.hidden = !m.paused;
      if (m.paused && pausedEl.textContent !== m.pausedText) pausedEl.textContent = m.pausedText;
      mergeBtn.disabled = !m.mergeEnabled;
      mergeAllBtn.disabled = !m.mergeAllEnabled;
      mergeAllBtn.textContent = m.mergeAllTimes > 1 ? `⬆⬆ 모두 승급 ×${m.mergeAllTimes}` : '⬆⬆ 모두 승급';
      note.textContent = m.note;
      note.hidden = m.note === '';
      outcomes.textContent = m.outcomes ? `승급하면: ${m.outcomes}` : '';
      outcomes.hidden = m.outcomes === '';
      return true;
    },
    place(figure, topPx) {
      // 높이는 offsetHeight로 잰다 (등장 애니메이션의 transform에 영향받지 않음). 접기 단계마다 한 번씩
      const setSide = (side: PanelSide): void => {
        el.classList.toggle('is-bottom', side === 'bottom');
        el.classList.toggle('is-top', side === 'top');
        if (side === 'top') el.style.top = `${Math.round(topPx)}px`;
        else el.style.removeProperty('top');
      };
      setSide('bottom');
      const heights = PANEL_DENSITIES.map((d) => {
        el.dataset.density = String(d);
        return el.offsetHeight;
      });
      const bottomY = el.offsetTop + el.offsetHeight; // 아래에 붙였을 때 아래쪽 끝 (접기 단계와 무관)
      const placement = choosePanelPlacement(heights, figure, Math.round(topPx), bottomY);
      el.dataset.density = String(placement.density);
      setSide(placement.side);
      return placement;
    },
    rect() {
      return el.getBoundingClientRect();
    },
    destroy() {
      window.removeEventListener('keydown', onKey);
    },
  };
}
