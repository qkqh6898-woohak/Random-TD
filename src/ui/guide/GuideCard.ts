/**
 * 첫 승급 안내 카드 (F10, DOM guide 층). 제목 · 한두 줄 설명 · 단계 'n/2' · [다음](마지막 단계는 [확인] = 닫기) · [✕].
 * 카드 자체는 누르기를 통과시킨다 (CSS pointer-events: none) → 카드가 칸·HUD 위에 있어도 그 아래를 누를 수 있다. 버튼만 받는다.
 * 위치: 강조한 칸이 맵 아래쪽이면 위(알림 자리 아래), 아니면 아래(하단 메뉴 위) — Game 장면이 setSide로 정한다.
 */
import { h } from '../dom';
import type { UiView } from '../root';
import { uiIcon } from '../uiIcons';

export interface GuideCardOptions {
  onNext: () => void;
  onClose: () => void;
}

export interface GuideCardView extends UiView {
  update(m: { title: string; body: string; step: number; steps: number; side: 'top' | 'bottom' }): void;
}

export function createGuideCard(opts: GuideCardOptions): GuideCardView {
  const title = h('span', { class: 'guide-title-text' });
  const stepEl = h('span', { class: 'guide-step', attrs: { 'data-testid': 'guide-step' } });
  const body = h('div', { class: 'guide-body', attrs: { 'data-testid': 'guide-body' } });
  const next = h('button', {
    class: 'btn guide-next',
    attrs: { type: 'button', 'data-testid': 'guide-next' },
    text: '다음',
    // 마지막 단계에선 [확인] = 닫기 (F10-4 검토: 예전엔 2/2에서도 [다음]이 보였고 눌러도 아무 일이 없었다)
    on: { click: () => (isLast ? opts.onClose() : opts.onNext()) },
  });
  const close = h(
    'button',
    {
      class: 'btn guide-close',
      attrs: { type: 'button', 'data-testid': 'guide-close', 'aria-label': '도움말 닫기' },
      on: { click: () => opts.onClose() },
    },
    uiIcon('ui-close'),
  );
  const el = h(
    'div',
    { class: 'guide-card is-bottom', attrs: { 'data-testid': 'guide-card', role: 'note' } },
    h('div', { class: 'guide-main' }, h('div', { class: 'guide-title', attrs: { 'data-testid': 'guide-title' } }, title, stepEl), body),
    next,
    close,
  );
  let last = '';
  let isLast = false;
  return {
    el,
    update(m) {
      const key = `${m.title}|${m.body}|${m.step}|${m.steps}|${m.side}`;
      if (key === last) return;
      last = key;
      title.textContent = m.title;
      stepEl.textContent = `${m.step}/${m.steps}`;
      body.textContent = m.body;
      isLast = m.step >= m.steps;
      next.textContent = isLast ? '확인' : '다음';
      next.setAttribute('aria-label', isLast ? '확인 — 도움말 닫기' : '다음');
      el.classList.toggle('is-top', m.side === 'top');
      el.classList.toggle('is-bottom', m.side === 'bottom');
    },
  };
}
