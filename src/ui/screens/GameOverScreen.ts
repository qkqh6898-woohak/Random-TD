/**
 * 패배 화면 (M1 임시 결과 화면). 정식 결과·정산 화면(경험치·보상)은 M6·M8에서.
 * 무한: "8단계에서 몹이 150마리를 넘었어요" / 캠페인: "1-2에서 목숨을 모두 잃었어요".
 * 보스 제한 시간 (F10-2): "박쥐 여왕을 60초 안에 잡지 못했어요 · 남은 체력 34%" + 대응 한 줄.
 */
import { h } from '../dom';
import type { UiView } from '../root';

export interface GameOverOptions {
  /** 큰 제목 아래 한 줄 (예: '8단계에서 몹이 150마리를 넘었어요') */
  reason: string;
  /** 기록 (예: '최고 8단계') */
  record: string;
  /** 보스 패배일 때 대응 한 줄 (F10-2, 예: '💡 날 때는 …'). 빈 글자면 줄 없음 */
  tip?: string;
  onRetry: () => void;
  onExit: () => void;
}

/**
 * 사유 줄: ' · '로 나눈 조각마다 줄바꿈하지 않는 묶음 → 좁은 화면에서 '남은 / 체력 34%'처럼 중간에서 끊기지 않고 조각 사이에서 줄이 바뀐다.
 * 글자 내용(textContent)은 그대로.
 */
function reasonLine(reason: string): HTMLElement {
  const parts = reason.split(' · ');
  const kids: (HTMLElement | string)[] = [];
  parts.forEach((p, i) => {
    if (i > 0) kids.push(' · ');
    kids.push(h('span', { class: 'gameover-chunk', text: p }));
  });
  return h('p', { class: 'gameover-reason' }, ...kids);
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
      reasonLine(opts.reason),
      h('p', { class: 'gameover-record', text: opts.record }),
      opts.tip ? h('p', { class: 'gameover-tip', attrs: { 'data-testid': 'gameover-tip' }, text: opts.tip }) : null,
      retry,
      exit,
    ),
  );
  queueMicrotask(() => retry.focus({ preventScroll: true }));
  return { el };
}
