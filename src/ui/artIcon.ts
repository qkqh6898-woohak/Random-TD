import { uiArtUrl, type UiArt } from '../art/uiIcons';
import { h } from './dom';

/** 그림이 준비될 때까지/없으면 기존 이모지를 남긴다. 버튼의 접근성 이름은 바꾸지 않는다. */
export function artIcon(id: UiArt, fallback: string, className = ''): HTMLElement {
  const root = h('span', { class: `ui-art-icon ${className}`, attrs: { 'aria-hidden': 'true', 'data-art-icon': id } });
  const img = h('img', {
    attrs: { alt: '', src: uiArtUrl(id), decoding: 'async', draggable: 'false' },
    on: { load: () => root.classList.add('is-loaded'), error: () => root.classList.remove('is-loaded') },
  });
  root.append(img, h('span', { class: 'ui-art-fallback', text: fallback }));
  return root;
}
