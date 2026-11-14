/**
 * 타이틀 화면 (UI.md 2장). M0: 로고 + [시작] 버튼.
 * 계정 레벨·행운석·하단 메뉴·이어하기는 M6~M8에서 붙인다.
 * 배경(하늘·성벽·대기 동작 타워)은 Phaser Boot 장면이 그린다 — 이 화면은 그 위의 DOM 층.
 */
import { h } from '../dom';
import type { UiView } from '../root';

export interface TitleScreenOptions {
  version: string;
  onStart: () => void;
}

export function createTitleScreen(opts: TitleScreenOptions): UiView {
  const start = h('button', {
    class: 'btn btn-primary btn-start',
    attrs: { type: 'button', 'data-action': 'start', 'aria-label': '시작' },
    on: {
      click: () => {
        start.disabled = true; // 두 번 눌러도 한 번만
        opts.onStart();
      },
    },
  }, h('span', { class: 'btn-icon', text: '▶' }), h('span', { text: '시작' }));

  const el = h(
    'div',
    { class: 'screen title-screen', attrs: { 'data-screen': 'title' } },
    h(
      'div',
      { class: 'title-logo' },
      h('span', { class: 'title-dice', text: '🎲', attrs: { 'aria-hidden': 'true' } }),
      h('h1', { class: 'title-name', text: '운빨 디펜스' }),
      h('span', { class: 'title-dice title-dice-right', text: '🎲', attrs: { 'aria-hidden': 'true' } }),
    ),
    h('p', { class: 'title-sub', text: '아트라 연합군이여, 녹스 군단을 막아라!' }),
    h('div', { class: 'title-actions' }, start),
    h('div', { class: 'title-version', text: opts.version }),
  );
  return { el };
}
