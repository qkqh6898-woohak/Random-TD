import { assetUrl } from '../../assets';
import { h } from '../dom';
import { createProgress } from '../design-system/components';
import '../design-system/tokens.css';
import '../design-system/components.css';
import './loading.css';

export interface LoadingView {
  el: HTMLElement;
  progress(value: number): void;
  hint(text: string): void;
}

function portrait(className: string): HTMLImageElement {
  const img = h('img', { class: className, attrs: { src: assetUrl('assets/characters/miner.webp'), alt: '', 'aria-hidden': 'true', draggable: 'false' } });
  // A missing character image must not leave an empty loading screen.
  img.addEventListener('error', () => { img.src = assetUrl('assets/ui/v2/heroes.svg'); }, { once: true });
  return img;
}

export function createLoadingView(kind: 'startup' | 'transition', version: string): LoadingView {
  const bar = createProgress(0, '게임 리소스 준비');
  const runner = portrait('rtd-loading-runner');
  const track = h('div', { class: 'rtd-loading-track' }, runner, bar);
  const hint = h('p', { class: 'rtd-loading-hint rtd-outlined', attrs: { 'aria-live': 'off' }, text: kind === 'startup' ? '광부가 주사위를 닦는 중…' : '로딩 중…' });
  const el = h('section', { class: `rtd-v2 rtd-loading rtd-loading--${kind}`, attrs: { 'data-testid': `loading-${kind}`, role: 'region', 'aria-label': kind === 'startup' ? '게임 시작 준비' : '화면 전환 중', 'aria-busy': 'true' } });
  el.style.setProperty('--rtd-loading-pattern', `url("${assetUrl('assets/ui/v2/loading/pattern.svg')}")`);
  if (kind === 'startup') {
    const logo = h('h1', { class: 'rtd-loading-logo', attrs: { 'aria-label': '운빨 디펜스' } }, h('span', { text: '운빨' }), h('span', { text: '디펜스' }));
    el.append(h('div', { class: 'rtd-loading-content' }, logo, portrait('rtd-loading-mascot'), h('div', { class: 'rtd-loading-bottom' }, track, hint)), h('small', { class: 'rtd-loading-version', text: version }));
  } else {
    el.append(h('div', { class: 'rtd-loading-transition-content' }, portrait('rtd-loading-small'), hint));
  }
  return {
    el,
    progress(value) {
      const percent = Math.round(value * 100);
      bar.style.setProperty('--rtd-fill', `${percent}%`);
      bar.setAttribute('aria-valuenow', String(percent));
      runner.style.left = `${percent}%`;
    },
    hint(text) { hint.textContent = text; },
  };
}
