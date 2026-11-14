/**
 * 패배 화면 (M1 임시 결과 화면). 정식 결과·정산 화면(경험치·보상)은 M6·M8에서.
 * 무한: "8단계에서 몹이 150마리를 넘었어요" / 캠페인: "1-2에서 목숨을 모두 잃었어요".
 */
import { h } from '../dom';
import type { UiView } from '../root';

export interface GameOverOptions {
  /** 큰 제목 아래 한 줄 (예: '8단계에서 몹이 150마리를 넘었어요') */
  reason: string;
  /** 기록 (예: '최고 8단계') */
  record: string;
  onRetry: () => void;
  onExit: () => void;
}

export function createGameOverScreen(opts: GameOverOptions): UiView {
  const retry = h(
    'button',
    {
      class: 'btn btn-primary gameover-retry',
      attrs: { type: 'button', 'data-action': 'retry', 'aria-label': '다시 하기' },
      on: { click: () => opts.onRetry() },
    },
    h('span', { class: 'btn-icon', text: '↻', attrs: { 'aria-hidden': 'true' } }),
    h('span', { text: '다시 하기' }),
  );
  const exit = h('button', {
    class: 'btn gameover-exit',
    attrs: { type: 'button', 'data-action': 'exit', 'aria-label': '타이틀로' },
    text: '타이틀로',
    on: { click: () => opts.onExit() },
  });
  const el = h(
    'div',
    {
      class: 'screen gameover-screen',
      attrs: { 'data-screen': 'gameover', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'gameover-title' },
    },
    h(
      'div',
      { class: 'pause-panel gameover-panel' },
      h('h2', { class: 'gameover-title', text: '패배', attrs: { id: 'gameover-title' } }),
      h('p', { class: 'gameover-reason', text: opts.reason }),
      h('p', { class: 'gameover-record', text: opts.record }),
      retry,
      exit,
    ),
  );
  queueMicrotask(() => retry.focus({ preventScroll: true }));
  return { el };
}
