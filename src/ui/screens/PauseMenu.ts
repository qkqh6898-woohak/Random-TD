/**
 * 일시정지 메뉴 (UI.md 4.6). HUD의 ⏸를 누르거나 앱이 백그라운드로 가면 열린다.
 * M0: [계속] [타이틀로]. 설정·도감·포기(정산)는 해당 마일스톤에서 붙인다.
 * 메뉴가 열려 있는 동안 게임 시간은 멈춘다 (Game 장면이 TickClock 배속을 0으로).
 */
import { h } from '../dom';
import type { UiView } from '../root';

export interface PauseMenuOptions {
  onResume: () => void;
  onExit: () => void;
}

export function createPauseMenu(opts: PauseMenuOptions): UiView {
  const resume = h(
    'button',
    {
      class: 'btn btn-primary pause-resume',
      attrs: { type: 'button', 'data-action': 'resume', 'aria-label': '계속' },
      on: { click: () => opts.onResume() },
    },
    h('span', { class: 'btn-icon', text: '▶', attrs: { 'aria-hidden': 'true' } }),
    h('span', { text: '계속' }),
  );
  const exit = h('button', {
    class: 'btn pause-exit',
    attrs: { type: 'button', 'data-action': 'exit', 'aria-label': '타이틀로' },
    text: '타이틀로',
    on: { click: () => opts.onExit() },
  });
  const el = h(
    'div',
    { class: 'screen pause-screen', attrs: { 'data-screen': 'pause', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'pause-title' } },
    h(
      'div',
      { class: 'pause-panel' },
      h('h2', { class: 'pause-title', text: '일시정지', attrs: { id: 'pause-title' } }),
      resume,
      exit,
      h('p', { class: 'pause-note', text: '타이틀로 나가면 이 판은 끝나요' }),
    ),
  );
  // 키보드 사용자를 위해 [계속]에 초점 (화면에 붙은 뒤)
  queueMicrotask(() => resume.focus({ preventScroll: true }));
  return { el };
}
