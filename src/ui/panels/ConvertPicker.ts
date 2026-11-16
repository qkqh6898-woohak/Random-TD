/**
 * 개발자 변환 고르기 창 (T-2, 개발자 모드만): 타워 패널 [🛠 변환] → 같은 등급의 다른 타워 목록 (초상화 + 이름).
 * 고르면 onPick(id) → Game 장면이 debugConvertTower 명령을 보낸다 (그 자리에서 그 타워로 바뀜). ✕·Esc·바깥 누름으로 닫는다.
 * 초상화는 Game이 넘기는 이미지 주소 (힉스필드 그림이 불러와졌으면 그 텍스처, 아니면 절차 생성 그림).
 */
import { h } from '../dom';
import type { UiView } from '../root';

export interface ConvertItem {
  id: string;
  name: string;
  portrait: string | null;
}

export interface ConvertPickerOptions {
  /** 머리줄 '레전드 · 용 소환사 → ?' */
  title: string;
  items: readonly ConvertItem[];
  onPick: (id: string) => void;
  onClose: () => void;
}

export function createConvertPicker(opts: ConvertPickerOptions): UiView {
  const close = h('button', {
    class: 'btn btn-chip cv-close',
    attrs: { type: 'button', 'aria-label': '닫기' },
    text: '✕',
    on: { click: () => opts.onClose() },
  });
  const grid = h(
    'div',
    { class: 'cv-grid' },
    ...opts.items.map((it) =>
      h(
        'button',
        {
          class: 'btn cv-item',
          attrs: { type: 'button', 'data-testid': `convert-item-${it.id}`, 'aria-label': `${it.name}(으)로 변환` },
          on: { click: () => opts.onPick(it.id) },
        },
        it.portrait
          ? h('img', { class: 'cv-pic', attrs: { src: it.portrait, alt: '', draggable: 'false' } })
          : h('span', { class: 'cv-pic cv-pic-empty', text: '?' }),
        h('span', { class: 'cv-name', text: it.name }),
      ),
    ),
  );
  const panel = h(
    'div',
    { class: 'cv-panel', attrs: { role: 'dialog', 'aria-label': '타워 변환 (개발자)' } },
    h('div', { class: 'cv-head' }, h('span', { class: 'cv-title', text: opts.title }), close),
    h('div', { class: 'cv-note', text: '개발자 도구 · 그 자리에서 바로 바뀌어요' }),
    grid,
  );
  const el = h('div', { class: 'cv-backdrop', attrs: { 'data-testid': 'convert-picker' } }, panel);
  el.addEventListener('pointerdown', (ev) => {
    if (ev.target === el) opts.onClose();
  });
  const onKey = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') opts.onClose();
  };
  window.addEventListener('keydown', onKey);
  return {
    el,
    destroy() {
      window.removeEventListener('keydown', onKey);
    },
  };
}
