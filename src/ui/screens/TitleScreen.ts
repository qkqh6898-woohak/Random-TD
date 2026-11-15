/**
 * 타이틀 화면 (UI.md 2장). M1: 로고 + [시작] = 무한 모드(순환의 정원).
 * ?debug=1 이면 [캠페인 1 (디버그)] = 테마 1 사거리 미로 (월드맵·덱 확인 화면은 M6). 이 버튼은 [시작] 아래 여백에 따로 띄워
 * [시작] 위치가 debug와 같게 둔다.
 * 계정 레벨·행운석·하단 메뉴·이어하기는 M6~M8에서 붙인다.
 * 배경(하늘·성벽·대기 동작 타워)은 Phaser Boot 장면이 그린다 — 이 화면은 그 위의 DOM 층.
 */
import { h } from '../dom';
import type { UiView } from '../root';

export interface TitleScreenOptions {
  version: string;
  /** [시작] → 무한 모드 */
  onStart: () => void;
  /** 있으면 [캠페인 1] 버튼을 보여준다 (debug) */
  onCampaign?: () => void;
  /** 뒤에 힉스필드 타이틀 그림이 깔려 있다 (HF-2: 글자 그림자를 진하게) */
  keyArt?: boolean;
}

export function createTitleScreen(opts: TitleScreenOptions): UiView {
  const start = h('button', {
    class: 'btn btn-primary btn-start',
    attrs: { type: 'button', 'data-action': 'start', 'aria-label': '시작' },
    on: {
      click: () => {
        start.disabled = true; // 두 번 눌러도 한 번만
        if (campaign) campaign.disabled = true;
        opts.onStart();
      },
    },
  }, h('span', { class: 'btn-icon', text: '▶' }), h('span', { text: '시작' }));

  const campaign = opts.onCampaign
    ? h(
        'button',
        {
          class: 'btn btn-campaign',
          attrs: { type: 'button', 'data-action': 'campaign', 'aria-label': '캠페인 1 (디버그)' },
          on: {
            click: () => {
              campaign!.disabled = true;
              start.disabled = true;
              opts.onCampaign?.();
            },
          },
        },
        h('span', { class: 'btn-icon', text: '🏰', attrs: { 'aria-hidden': 'true' } }),
        h('span', { text: '캠페인 1 (디버그)' }),
      )
    : null;

  const el = h(
    'div',
    { class: `screen title-screen${opts.keyArt ? ' has-keyart' : ''}`, attrs: { 'data-screen': 'title', 'data-keyart': opts.keyArt ? '1' : '0' } },
    h(
      'div',
      { class: 'title-logo' },
      h('span', { class: 'title-dice', text: '🎲', attrs: { 'aria-hidden': 'true' } }),
      h('h1', { class: 'title-name', text: '운빨 디펜스' }),
      h('span', { class: 'title-dice title-dice-right', text: '🎲', attrs: { 'aria-hidden': 'true' } }),
    ),
    h('p', { class: 'title-sub', text: '아트라 연합군이여, 녹스 군단을 막아라!' }),
    // debug 버튼은 따로 띄워 [시작] 자리가 debug 여부와 상관없이 같게 (가운데 캐릭터를 덮지 않게)
    h('div', { class: 'title-actions' }, start, campaign ? h('div', { class: 'title-debug' }, campaign) : null),
    h('div', { class: 'title-version', text: opts.version }),
  );
  return { el };
}
