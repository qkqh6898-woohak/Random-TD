/**
 * 일시정지 메뉴 (UI.md 4.6). HUD의 ⏸를 누르거나 앱이 백그라운드로 가면 열린다.
 * M0: [계속] [타이틀로]. 설정·도감·포기(정산)는 해당 마일스톤에서 붙인다.
 * T-2: 설정 한 줄 '눌러서 바로 승급' (켜짐: 승급할 수 있는 타워를 누르면 바로 승급 / 꺼짐: 패널을 연다). 저장은 Game 장면이 한다.
 * F10: [❔ 도움말 다시 보기] — 계정에 기록된 '본 도움말'(첫 승급 안내)을 지워, 다음에 승급할 수 있게 되면 다시 안내한다.
 * 메뉴가 열려 있는 동안 게임 시간은 멈춘다 (Game 장면이 TickClock 배속을 0으로).
 */
import { h } from '../dom';
import type { UiView } from '../root';

export interface PauseMenuOptions {
  onResume: () => void;
  onExit: () => void;
  /** '눌러서 바로 승급' 지금 값과 바꿀 때 (T-2). 없으면 줄도 없다 */
  tapMerge?: boolean;
  onTapMerge?: (on: boolean) => void;
  /** [❔ 도움말 다시 보기] (F10). 없으면 버튼도 없다 */
  onHelpAgain?: () => void;
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
  let tapRow: HTMLElement | null = null;
  if (opts.tapMerge !== undefined) {
    const sw = h('button', {
      class: 'btn dv-switch pause-switch',
      attrs: { type: 'button', role: 'switch', 'aria-checked': String(opts.tapMerge), 'data-testid': 'pause-tap-merge', 'aria-label': '눌러서 바로 승급' },
      text: opts.tapMerge ? '켜짐' : '꺼짐',
    });
    sw.classList.toggle('is-on', opts.tapMerge);
    sw.addEventListener('click', () => {
      const v = sw.getAttribute('aria-checked') !== 'true';
      sw.setAttribute('aria-checked', String(v));
      sw.textContent = v ? '켜짐' : '꺼짐';
      sw.classList.toggle('is-on', v);
      opts.onTapMerge?.(v);
    });
    tapRow = h(
      'div',
      { class: 'pause-setting' },
      h('div', { class: 'pause-setting-main' }, h('div', { class: 'pause-setting-name', text: '눌러서 바로 승급' }), h('div', { class: 'pause-setting-desc', text: '승급할 수 있는 타워를 누르면 바로 승급' })),
      sw,
    );
  }
  let help: HTMLButtonElement | null = null;
  if (opts.onHelpAgain) {
    const b = h('button', {
      class: 'btn pause-help',
      attrs: { type: 'button', 'data-testid': 'pause-help', 'aria-label': '도움말 다시 보기' },
      text: '❔ 도움말 다시 보기',
    });
    b.addEventListener('click', () => {
      opts.onHelpAgain?.();
      b.textContent = '✓ 안내를 다시 보여 드려요';
      b.disabled = true;
    });
    help = b;
  }
  const el = h(
    'div',
    { class: 'screen pause-screen', attrs: { 'data-screen': 'pause', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'pause-title' } },
    h(
      'div',
      { class: 'pause-panel' },
      h('h2', { class: 'pause-title', text: '일시정지', attrs: { id: 'pause-title' } }),
      resume,
      tapRow,
      help,
      exit,
      h('p', { class: 'pause-note', text: '타이틀로 나가면 이 판은 끝나요' }),
    ),
  );
  // 키보드 사용자를 위해 [계속]에 초점 (화면에 붙은 뒤)
  queueMicrotask(() => resume.focus({ preventScroll: true }));
  return { el };
}
