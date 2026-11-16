/**
 * 타이틀 화면 (UI.md 2장). M1: 로고 + [시작] = 무한 모드(순환의 정원).
 * ?debug=1 이면 [캠페인 1 (디버그)] = 테마 1 사거리 미로 (월드맵·덱 확인 화면은 M6). 이 버튼은 [시작] 아래 여백에 따로 띄워
 * [시작] 위치가 debug와 같게 둔다.
 * 진행 중 저장이 있으면 [이어 하기]와 [새 게임]을 보여준다.
 * 로고가 포함된 로컬 타이틀 아트 위에 실제 DOM 버튼을 배치한다.
 */
import titleArt from '../../art/title-summoning.webp';
import { h } from '../dom';
import type { UiView } from '../root';
import { createRecordsDialog, type BattleRecordsView } from './BattleRecordsDialog';

export interface TitleScreenOptions {
  version: string;
  /** [시작] → 무한 모드 */
  onStart: () => void;
  saved?: { stage: string; onResume: () => void };
  records?: BattleRecordsView;
  /** 있으면 [캠페인 1] 버튼을 보여준다 (debug) */
  onCampaign?: () => void;
}

export function createTitleScreen(opts: TitleScreenOptions): UiView {
  const artwork = h('img', {
    class: 'title-art',
    attrs: { src: titleArt, alt: '', draggable: 'false', fetchpriority: 'high' },
    on: { load: () => artwork.parentElement?.classList.add('has-title-art') },
  });
  const startGame = () => {
    if (start.disabled) return;
    start.disabled = true;
    if (resume) resume.disabled = true;
    if (campaign) campaign.disabled = true;
    confirmNew?.close();
    opts.onStart();
  };
  const confirmNew = opts.saved ? h('dialog', { class: 'title-confirm', attrs: { 'aria-labelledby': 'new-game-title' } },
    h('h2', { attrs: { id: 'new-game-title' }, text: '새 게임을 시작할까요?' }),
    h('p', { text: '자동 저장된 판은 새 판으로 바뀌어요.' }),
    h('div', { class: 'title-confirm-actions' },
      h('button', { class: 'btn', text: '취소', attrs: { autofocus: '', type: 'button' }, on: { click: () => confirmNew?.close() } }),
      h('button', { class: 'btn btn-primary', text: '새 게임 시작', attrs: { type: 'button' }, on: { click: startGame } }),
    ),
  ) : null;
  const start = h('button', {
    class: opts.saved ? 'btn btn-campaign' : 'btn btn-start',
    attrs: { type: 'button', 'data-action': 'start' },
    on: { click: () => { if (confirmNew) confirmNew.showModal(); else startGame(); } },
  }, opts.saved ? '새 게임' : '시작');
  const resume = opts.saved ? h('button', {
    class: 'btn btn-start btn-resume-match',
    attrs: { type: 'button', 'data-action': 'resume-match' },
    on: { click: () => { resume!.disabled = true; start.disabled = true; opts.saved?.onResume(); } },
  }, '이어 하기', h('small', { class: 'title-save-stage', text: opts.saved.stage })) : null;
  const records = opts.records ? createRecordsDialog(opts.records) : null;
  const openRecords = records ? h('button', {
    class: 'btn btn-chip btn-title-records',
    text: '기록',
    attrs: { type: 'button', 'aria-haspopup': 'dialog' },
    on: { click: () => records.showModal() },
  }) : null;

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
    { class: 'screen title-screen', attrs: { 'data-screen': 'title' } },
    artwork,
    h('h1', { class: 'title-name', text: '운빨 디펜스' }),
    // debug 버튼은 따로 띄워 [시작] 자리가 debug 여부와 상관없이 같게 (가운데 캐릭터를 덮지 않게)
    h('div', { class: 'title-actions' }, resume ?? start,
      resume || campaign ? h('div', { class: 'title-debug' }, resume ? start : campaign) : null),
    confirmNew,
    openRecords,
    records,
    h('div', { class: 'title-version', text: opts.version }),
  );
  return { el };
}
