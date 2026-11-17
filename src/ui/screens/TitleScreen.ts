/**
 * 타이틀 화면 (UI.md 2장). M1: 로고 + [시작] = 무한 모드(순환의 정원).
 * ?debug=1 이면 [캠페인 1 (디버그)] = 테마 1 사거리 미로 (월드맵·덱 확인 화면은 M6). 이 버튼은 [시작] 아래 여백에 따로 띄워
 * [시작] 위치가 debug와 같게 둔다.
 * A-1 (Codex 갈래 M6-5·M6-6에서 옮김): 자동 저장된 판이 있으면 [시작] 자리에 [▶ 이어 하기 · n단계], 그 아래 여백에 [새 게임]
 * (누르면 '저장된 판이 지워져요' 확인 창). 왼쪽 위 [📜 기록] = 전투 기록 창. 개발자 모드 판 저장은 '🛠 개발자 판'으로 표시한다.
 * 계정 레벨·행운석·하단 메뉴는 M6~M8에서 붙인다.
 * 배경(하늘·성벽·대기 동작 타워)은 Phaser Boot 장면이 그린다 — 이 화면은 그 위의 DOM 층.
 */
import { h } from '../dom';
import type { UiView } from '../root';
import { createRecordsDialog, type BattleRecordsView } from './BattleRecordsDialog';

export interface TitleSavedMatch {
  /** 저장된 판 단계 글자 ('3단계' · '준비' · '1-4') */
  stage: string;
  /** 개발자 모드 판 저장 */
  dev: boolean;
  onResume: () => void;
}

export interface TitleScreenOptions {
  version: string;
  /** [시작]·[새 게임 시작] → 무한 모드 */
  onStart: () => void;
  /** 있으면 [캠페인 1] 버튼을 보여준다 (debug) */
  onCampaign?: () => void;
  /** 뒤에 힉스필드 타이틀 그림이 깔려 있다 (HF-2: 글자 그림자를 진하게) */
  keyArt?: boolean;
  /** 이어 할 판 (A-1) */
  saved?: TitleSavedMatch;
  /** 전투 기록 (A-1). 있으면 [📜 기록] */
  records?: BattleRecordsView;
}

export function createTitleScreen(opts: TitleScreenOptions): UiView {
  const buttons: HTMLButtonElement[] = [];
  /** 두 번 눌러도 한 번만: 하나를 누르면 모두 잠근다 */
  const lockAll = (): void => {
    for (const b of buttons) b.disabled = true;
  };
  const saved = opts.saved;

  let confirmNew: HTMLDialogElement | null = null;
  if (saved) {
    const cancel = h('button', { class: 'btn', text: '취소', attrs: { type: 'button', 'data-testid': 'new-game-cancel' } });
    const ok = h('button', { class: 'btn btn-primary', text: '새 게임 시작', attrs: { type: 'button', 'data-testid': 'new-game-ok' } });
    confirmNew = h(
      'dialog',
      { class: 'title-dialog title-confirm', attrs: { 'aria-labelledby': 'new-game-title', 'data-testid': 'new-game-dialog' } },
      h(
        'div',
        { class: 'title-dialog-body' },
        h('h2', { attrs: { id: 'new-game-title' }, text: '새 게임을 시작할까요?' }),
        h('p', { text: `이어 하던 판(${saved.stage})은 지워져요.` }),
        h('div', { class: 'title-confirm-actions' }, cancel, ok),
      ),
    );
    const dialog = confirmNew;
    cancel.addEventListener('click', () => dialog.close());
    ok.addEventListener('click', () => {
      if (ok.disabled) return;
      ok.disabled = true;
      lockAll();
      dialog.close();
      opts.onStart();
    });
  }

  const start = saved
    ? h(
        'button',
        {
          class: 'btn btn-primary btn-start btn-resume',
          attrs: { type: 'button', 'data-action': 'resume-match', 'aria-label': `이어 하기 ${saved.stage}${saved.dev ? ' (개발자 판)' : ''}` },
          on: {
            click: () => {
              lockAll();
              saved.onResume();
            },
          },
        },
        h('span', { class: 'btn-icon', text: '▶', attrs: { 'aria-hidden': 'true' } }),
        h('span', { text: '이어 하기' }),
        h('small', { class: 'title-save-stage', text: saved.stage }),
        saved.dev ? h('small', { class: 'title-save-dev', text: '🛠 개발자 판' }) : null,
      )
    : h(
        'button',
        {
          class: 'btn btn-primary btn-start',
          attrs: { type: 'button', 'data-action': 'start', 'aria-label': '시작' },
          on: {
            click: () => {
              lockAll();
              opts.onStart();
            },
          },
        },
        h('span', { class: 'btn-icon', text: '▶' }),
        h('span', { text: '시작' }),
      );
  buttons.push(start);

  const newGame = confirmNew
    ? h('button', {
        class: 'btn btn-campaign btn-new-game',
        text: '새 게임',
        attrs: { type: 'button', 'data-action': 'new-game', 'aria-haspopup': 'dialog' },
        on: { click: () => confirmNew?.showModal() },
      })
    : null;
  if (newGame) buttons.push(newGame);

  const campaign = opts.onCampaign
    ? h(
        'button',
        {
          class: 'btn btn-campaign',
          attrs: { type: 'button', 'data-action': 'campaign', 'aria-label': '캠페인 1 (디버그)' },
          on: {
            click: () => {
              lockAll();
              opts.onCampaign?.();
            },
          },
        },
        h('span', { class: 'btn-icon', text: '🏰', attrs: { 'aria-hidden': 'true' } }),
        h('span', { text: '캠페인 1 (디버그)' }),
      )
    : null;
  if (campaign) buttons.push(campaign);

  const recordsDialog = opts.records ? createRecordsDialog(opts.records) : null;
  const recordsBtn = recordsDialog
    ? h(
        'button',
        {
          class: 'btn btn-chip title-records-btn',
          attrs: { type: 'button', 'data-action': 'records', 'aria-haspopup': 'dialog', 'aria-label': '기록' },
          on: { click: () => recordsDialog.showModal() },
        },
        h('span', { text: '📜', attrs: { 'aria-hidden': 'true' } }),
        h('span', { text: '기록' }),
      )
    : null;

  const below = [newGame, campaign].filter((b): b is HTMLButtonElement => b !== null);
  const el = h(
    'div',
    { class: `screen title-screen${opts.keyArt ? ' has-keyart' : ''}`, attrs: { 'data-screen': 'title', 'data-keyart': opts.keyArt ? '1' : '0' } },
    h(
      'div',
      { class: 'title-logo' },
      // G-2: 주사위 장식 대신 캐릭터 문장 (기사·마법사 방패, theme.ts crestSvg)
      h('span', { class: 'title-crest', attrs: { 'aria-hidden': 'true' } }),
      h('h1', { class: 'title-name', text: '운빨 디펜스' }),
      h('span', { class: 'title-crest title-crest-right', attrs: { 'aria-hidden': 'true' } }),
    ),
    h('p', { class: 'title-sub', text: '아트라 연합군이여, 녹스 군단을 막아라!' }),
    // debug 버튼·[새 게임]은 따로 띄워 [시작] 자리가 debug 여부와 상관없이 같게 (가운데 캐릭터를 덮지 않게)
    h(
      'div',
      { class: 'title-actions' },
      start,
      below.length > 0 ? h('div', { class: `title-debug${below.length > 1 ? ' is-pair' : ''}` }, ...below) : null,
    ),
    recordsBtn,
    confirmNew,
    recordsDialog,
    h('div', { class: 'title-version', text: opts.version }),
  );
  return { el };
}
