/**
 * 고르기 창 (M4-7, DOM): 보스 카드 3장 중 1장 / 승급의 축복 결과 2개 중 1개.
 *
 * - modal 층, 화면 가운데 아래쪽 (맵 일부만 가림). 게임 시간은 계속 흐른다 (GDD 2.2 '팝업을 열어도 시간은 흐름').
 * - 고르면 onPick(i) 한 번 → Game 장면이 명령(pickCard·pickMerge)을 보낸다. 명령이 실행되어 sim 상태에서 그 선택이 사라지면
 *   Game 장면이 창을 닫는다. 그 사이 다시 누르지 못하게 버튼을 잠근다.
 * - [나중에]를 누르면 창을 접고 작은 [🃏 카드 고르기] 알약만 남긴다 (맵 아래쪽을 가리지 않게 — 위급할 때 소환부터).
 *   알약을 누르면 다시 펼친다. 선택은 sim 상태에 남아 있으므로 접어도 사라지지 않는다.
 *   알약은 HUD 아래 띠 자리(pillHost)에 넣는다 (검토 반영: 맵 위에 떠 있으면 순환의 정원 배치 칸 3개를 덮어 소환 탭을 가로챘다).
 *   아래 띠에 [⬆ 승급 가능 n]이 함께 보이면 알약은 그림 글자(🃏)만 남긴다 (412px에서 잘리지 않게, CSS).
 * - 바텀 시트는 하나만 (검토 반영): Game 장면이 타워 정보 패널을 열 때 collapse()로 접고, 알약으로 다시 펼치면 onExpand로
 *   정보 패널을 닫는다.
 * - 값 계산은 choiceModel(순수, 단위 테스트), 여기서는 그리기만.
 */
import { h } from '../dom';
import type { UiView } from '../root';
import type { ChoiceModel } from './choiceModel';

export interface ChoicePanelView extends UiView {
  readonly key: string;
  /** 접혀 있는가 (E2E) */
  readonly collapsed: boolean;
  /** 알약으로 접는다 (타워 정보 패널을 열 때 — 바텀 시트 둘이 겹치지 않게) */
  collapse(): void;
}

export interface ChoicePanelOptions {
  /** 알약을 넣을 곳 (HUD 아래 띠 자리). 없으면 창 안(modal 층)에 둔다 */
  pillHost?: HTMLElement;
  /** 알약을 눌러 다시 펼쳤을 때 (Game 장면이 정보 패널을 닫는다) */
  onExpand?: () => void;
}

export function createChoicePanel(model: ChoiceModel, onPick: (index: number) => void, opts: ChoicePanelOptions = {}): ChoicePanelView {
  let locked = false;
  let collapsed = false;
  const options = model.options.map((o, i) =>
    h(
      'button',
      {
        class: `btn cp-option${o.rare ? ' is-rare' : ''}${o.current ? ' is-current' : ''}`,
        attrs: { type: 'button', 'data-index': String(i), 'data-testid': `choice-${i}`, 'aria-label': `${o.title} — ${o.desc}` },
        on: {
          click: () => {
            if (locked) return;
            locked = true;
            el.classList.add('is-locked');
            onPick(i);
          },
        },
      },
      o.badge ? h('span', { class: 'cp-badge', text: o.badge }) : null,
      o.icon ? h('span', { class: 'cp-icon', text: o.icon, attrs: { 'aria-hidden': 'true' } }) : null,
      h('span', { class: 'cp-name', text: o.title }),
      h('span', { class: 'cp-desc', text: o.desc }),
    ),
  );
  const setCollapsed = (on: boolean): void => {
    collapsed = on;
    panel.hidden = on;
    pill.hidden = !on;
  };
  const later = h('button', {
    class: 'btn cp-later',
    attrs: { type: 'button', 'data-testid': 'choice-later', 'aria-label': '나중에 고르기 (창 접기)' },
    text: '나중에',
    on: { click: () => setCollapsed(true) },
  });
  const panel = h(
    'div',
    { class: `choice-panel is-${model.kind}`, attrs: { role: 'dialog', 'aria-label': model.title, 'data-testid': `choice-${model.kind}` } },
    h('div', { class: 'cp-head' }, h('div', { class: 'cp-title', text: model.title }), later),
    model.sub ? h('div', { class: 'cp-sub', text: model.sub }) : null,
    h('div', { class: `cp-options cp-n${options.length}` }, ...options),
  );
  const pillLabel = model.kind === 'card' ? '카드 고르기' : '결과 고르기';
  const pill = h(
    'button',
    {
      class: `btn btn-chip cp-pill is-${model.kind}`,
      attrs: { type: 'button', 'data-testid': 'choice-reopen', 'aria-label': pillLabel, hidden: '' },
      on: {
        click: () => {
          setCollapsed(false);
          opts.onExpand?.();
        },
      },
    },
    h('span', { class: 'cp-pill-icon', text: model.kind === 'card' ? '🃏' : '✨', attrs: { 'aria-hidden': 'true' } }),
    h('span', { class: 'cp-pill-text', text: pillLabel, attrs: { 'aria-hidden': 'true' } }),
  );
  const el = h('div', { class: 'choice-root' }, panel);
  if (opts.pillHost) opts.pillHost.append(pill);
  else el.append(pill);
  return {
    el,
    key: model.key,
    get collapsed() {
      return collapsed;
    },
    collapse() {
      if (!collapsed) setCollapsed(true);
    },
    destroy() {
      pill.remove();
    },
  };
}
