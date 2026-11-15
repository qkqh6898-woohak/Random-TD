/**
 * 캐릭터 카드 (HF-2, DOM 모달 — card 층): 큰 초상(힉스필드 그림, 각성했으면 각성 그림, 없으면 절차 그림) + 이름·별 + 등급·종족·원소 +
 * 설명 두 문장 + 능력치·특색·각성. 정보 패널의 [ℹ](또는 초상)으로 열고, ✕ · 바깥 누르기 · Esc로 닫는다.
 * 글자는 characterCardModel.ts(순수)가 만든다. 카드는 sim을 바꾸지 않는다.
 */
import { h } from '../dom';
import type { UiView } from '../root';
import type { CharacterCardModel } from './characterCardModel';
import type { StatCell } from './towerPanelModel';

export interface CharacterCardOptions {
  model: CharacterCardModel;
  /** 초상 이미지 주소 (data URL 등, 없으면 null → 별만 크게) */
  portrait: string | null;
  onClose: () => void;
}

function statSpan(c: StatCell): HTMLElement {
  return h(
    'span',
    { class: `cc-stat${c.buffed ? ' is-buffed' : ''}` },
    h('span', { class: 'cc-label', text: c.label }),
    h('b', { class: 'cc-value', text: c.value }),
  );
}

export function createCharacterCard(opts: CharacterCardOptions): UiView {
  const m = opts.model;
  const close = h('button', {
    class: 'btn btn-chip cc-close',
    attrs: { type: 'button', 'aria-label': '닫기', 'data-action': 'card-close' },
    text: '✕',
    on: { click: () => opts.onClose() },
  });
  const portrait = opts.portrait
    ? h('img', { class: 'cc-portrait', attrs: { src: opts.portrait, alt: `${m.name} 그림`, draggable: 'false', 'data-testid': 'cc-portrait' } })
    : h('div', { class: 'cc-portrait cc-portrait-empty', text: m.stars, attrs: { 'data-testid': 'cc-portrait' } });
  const card = h(
    'section',
    {
      class: 'character-card',
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': `${m.name} 캐릭터 카드`, 'data-testid': 'character-card', 'data-tower': m.towerId },
    },
    close,
    h(
      'div',
      { class: 'cc-hero' },
      h('div', { class: 'cc-portrait-wrap' }, portrait),
      h(
        'div',
        { class: 'cc-title' },
        h('span', { class: 'cc-stars', text: m.stars }),
        h('h2', { class: 'cc-name', text: m.name, attrs: { 'data-testid': 'cc-name' } }),
        h('div', { class: 'cc-tagline', text: m.tagline }),
        m.awakened ? h('span', { class: 'cc-awakened', text: '각성' }) : null,
      ),
    ),
    h(
      'div',
      { class: 'cc-desc' },
      h('p', { class: 'cc-lore', text: m.lore, attrs: { 'data-testid': 'cc-lore' } }),
      h('p', { class: 'cc-role', text: m.role, attrs: { 'data-testid': 'cc-role' } }),
    ),
    h('div', { class: 'cc-stats' }, ...m.stats.map((row) => h('div', { class: 'cc-row' }, ...row.map(statSpan)))),
    h(
      'div',
      { class: 'cc-line' },
      h('span', { class: 'cc-label', text: '👁 감지' }),
      h('b', { text: m.detect }),
      h('span', { class: 'hud-spacer' }),
      h('span', { class: 'cc-label', text: '대상' }),
      h('b', { text: m.target }),
    ),
    h('div', { class: 'cc-block' }, h('span', { class: 'cc-label', text: m.abilityLabel }), h('span', { text: m.ability })),
    m.awaken ? h('div', { class: 'cc-block cc-awaken' }, h('span', { class: 'cc-label', text: '각성' }), h('span', { text: m.awaken })) : null,
  );
  card.style.setProperty('--grade-color', m.gradeColor);
  const el = h('div', { class: 'cc-backdrop', attrs: { 'data-testid': 'character-card-backdrop' } }, card);
  // 바깥(어두운 곳)을 누르면 닫힌다. 카드 안을 누르는 것은 무시
  el.addEventListener('click', (ev) => {
    if (ev.target === el) opts.onClose();
  });
  // Esc: 카드만 닫는다 (같은 키로 정보 패널까지 닫히지 않게 — 먼저 받고 전파를 멈춘다)
  const onKey = (ev: KeyboardEvent): void => {
    if (ev.key !== 'Escape') return;
    ev.stopImmediatePropagation();
    opts.onClose();
  };
  window.addEventListener('keydown', onKey, true);
  queueMicrotask(() => close.focus({ preventScroll: true }));
  return {
    el,
    destroy() {
      window.removeEventListener('keydown', onKey, true);
    },
  };
}
