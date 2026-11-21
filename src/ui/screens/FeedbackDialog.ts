/**
 * 💬 피드백 보내기 창 (FB-1). 로비 ⚙ 설정 창과 전투 일시정지 메뉴에서 연다 — 누구나 (개발자 모드 전용 아님).
 *
 * 짧은 글(꼭, 1000자까지) + 분류(버그·밸런스·제안·기타) + '판 기록 첨부'(전투 중 기본 켜짐) → [보내기]
 * = GitHub 새 이슈 화면(이슈 폼 feedback.yml)을 미리 채워 휴대폰 브라우저로 연다. 앱은 아무것도 보내지 않는다.
 * [기록 복사] = 전체 판 기록 JSON을 클립보드로 (주소에는 길이 때문에 마지막 기록만 들어갈 수 있음 → 글 끝에 안내).
 * <dialog>라 안드로이드 뒤로 가기(nativeBack)·Esc가 닫는다. UI 루트가 pointer-events none이라 창에서 다시 켠다(src/ui/screens/feedback.css — main.ts가 불러옴).
 */
import { h } from '../dom';
import { uiIcon } from '../uiIcons';
import type { ReplayFile } from '../../sim/replay';
import {
  FEEDBACK_CATEGORIES,
  MAX_FEEDBACK_TEXT,
  buildFeedbackUrl,
  feedbackReplayJson,
  feedbackTextError,
  type FeedbackCategory,
  type FeedbackGameInfo,
} from '../../feedback/feedbackModel';
import { copyText, openFeedbackUrl, type FeedbackHost } from '../../feedback/openFeedback';

export const FEEDBACK_SENT_TOAST = 'GitHub에서 [Submit new issue]를 눌러 주세요';

export interface FeedbackSnapshot {
  info: FeedbackGameInfo;
  /** 판 기록 (전투 중일 때만 — 로비는 없음) */
  replay?: () => ReplayFile | null;
}

export interface FeedbackDialogOptions {
  /** 창을 열 때마다 부른다: 그때의 게임 정보 (+ 판 기록) */
  snapshot: () => FeedbackSnapshot;
  host: FeedbackHost;
  toast: (text: string, ms?: number) => void;
  /** '판 기록 첨부' 기본값 (전투 true) */
  attachDefault?: boolean;
}

export interface FeedbackDialogView {
  el: HTMLDialogElement;
  open(): void;
}

/** [💬 피드백 보내기] 버튼 (로비 설정·일시정지 메뉴 공용) */
export function feedbackButton(view: FeedbackDialogView, cls: string): HTMLButtonElement {
  return h(
    'button',
    {
      class: `btn feedback-open ${cls}`,
      attrs: { type: 'button', 'aria-haspopup': 'dialog', 'data-testid': 'feedback-open', 'aria-label': '피드백 보내기' },
      on: { click: () => view.open() },
    },
    uiIcon('ui-chat'),
    '피드백 보내기',
  );
}

export function createFeedbackDialog(opts: FeedbackDialogOptions): FeedbackDialogView {
  let category: FeedbackCategory = '버그';
  let replay: ReplayFile | null = null;
  let copied = false;

  const close = h('button', { class: 'btn lobby-close feedback-close', text: '닫기', attrs: { type: 'button', 'data-testid': 'feedback-close' } });
  const catButtons = FEEDBACK_CATEGORIES.map((c) =>
    h('button', {
      class: 'btn feedback-cat',
      text: c,
      attrs: { type: 'button', role: 'radio', 'aria-checked': 'false', 'data-category': c, 'data-testid': 'feedback-category' },
    }),
  );
  const showCategory = (): void => {
    for (const b of catButtons) {
      const on = b.dataset.category === category;
      b.setAttribute('aria-checked', String(on));
      b.classList.toggle('is-on', on);
    }
  };
  for (const b of catButtons) {
    b.addEventListener('click', () => {
      category = b.dataset.category as FeedbackCategory;
      showCategory();
    });
  }
  const text = h('textarea', {
    class: 'feedback-text',
    attrs: {
      id: 'feedback-text',
      rows: '5',
      maxlength: String(MAX_FEEDBACK_TEXT),
      placeholder: '예) 8단계에서 보스가 길 밖으로 나가요 / 광부가 너무 세요',
      'aria-describedby': 'feedback-count feedback-error',
      'data-testid': 'feedback-text',
    },
  });
  const count = h('span', { class: 'feedback-count', attrs: { id: 'feedback-count', 'data-testid': 'feedback-count' } });
  const error = h('p', { class: 'feedback-error', attrs: { id: 'feedback-error', role: 'alert', 'data-testid': 'feedback-error' } });
  const showCount = (): void => {
    count.textContent = `${Array.from(text.value).length}/${MAX_FEEDBACK_TEXT}`;
  };
  text.addEventListener('input', () => {
    showCount();
    if (error.textContent) error.textContent = '';
  });

  const attach = h('input', { class: 'feedback-attach', attrs: { id: 'feedback-attach', type: 'checkbox', 'data-testid': 'feedback-attach' } });
  const attachHint = h('small', { class: 'feedback-hint', attrs: { 'data-testid': 'feedback-attach-hint' } });
  const copy = h('button', { class: 'btn feedback-copy', text: '📋 기록 복사', attrs: { type: 'button', 'data-testid': 'feedback-copy' } });
  copy.addEventListener('click', () => {
    if (!replay) return;
    const json = feedbackReplayJson(replay);
    // 창이 맨 위 층(top layer)이라 알림 대신 버튼 글자로 알린다
    void copyText(json).then((ok) => {
      if (ok) copied = true;
      copy.textContent = ok ? '✓ 복사했어요' : '복사하지 못했어요';
    });
  });

  const send = h('button', { class: 'btn btn-primary feedback-send', text: '보내기', attrs: { type: 'button', 'data-testid': 'feedback-send' } });
  const cancel = h('button', { class: 'btn feedback-cancel', text: '취소', attrs: { type: 'button', 'data-testid': 'feedback-cancel' } });

  const dialog = h(
    'dialog',
    { class: 'title-dialog lobby-dialog feedback-dialog', attrs: { 'aria-labelledby': 'feedback-title', 'data-testid': 'feedback-dialog' } },
    h('header', { class: 'lobby-dialog-head' }, h('h2', { attrs: { id: 'feedback-title' }, text: '💬 피드백 보내기' }), close),
    h(
      'div',
      { class: 'lobby-dialog-body feedback-body' },
      h('p', { class: 'feedback-intro', text: '불편한 점이나 바라는 점을 짧게 적어 주세요. [보내기]를 누르면 GitHub 새 이슈 화면이 열려요.' }),
      h('div', { class: 'feedback-cats', attrs: { role: 'radiogroup', 'aria-label': '분류' } }, ...catButtons),
      h('label', { class: 'feedback-label', attrs: { for: 'feedback-text' } }, h('span', { text: '내용' }), count),
      text,
      error,
      h(
        'div',
        { class: 'feedback-attach-row' },
        h('label', { class: 'feedback-check', attrs: { for: 'feedback-attach' } }, attach, h('span', { text: '판 기록 첨부' })),
        copy,
      ),
      attachHint,
      h('div', { class: 'feedback-actions' }, cancel, send),
      h('p', { class: 'feedback-foot', text: 'GitHub 계정이 필요해요 · 앱 버전·화면 크기·판 상태가 함께 들어가요 · 앱이 직접 보내지 않아요' }),
    ),
  );

  close.addEventListener('click', () => dialog.close());
  cancel.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (ev) => {
    if (ev.target === dialog) dialog.close();
  });

  let info: FeedbackGameInfo | null = null;

  send.addEventListener('click', () => {
    const err = feedbackTextError(text.value);
    if (err) {
      error.textContent = err;
      text.focus();
      return;
    }
    if (!info) return;
    const link = buildFeedbackUrl({ category, text: text.value, info, replay: attach.checked ? replay : null, replayCopied: copied });
    dialog.dataset.replay = link.replay;
    const r = openFeedbackUrl(link.url, opts.host);
    if (r === 'native' || r === 'browser') {
      opts.toast(FEEDBACK_SENT_TOAST, 3200);
      text.value = '';
      copied = false;
      dialog.close();
    } else if (r === 'old-app') {
      void copyText(link.url).then((ok) => {
        opts.toast(ok ? '앱을 업데이트하면 바로 열려요 · 주소를 복사했어요. 브라우저에 붙여 넣어 주세요' : '앱을 업데이트하면 보낼 수 있어요', 4000);
      });
    } else {
      opts.toast('GitHub를 열지 못했어요', 2400);
    }
  });

  return {
    el: dialog,
    open() {
      const snap = opts.snapshot();
      info = snap.info;
      try {
        replay = snap.replay?.() ?? null;
      } catch {
        replay = null;
      }
      copied = false;
      copy.textContent = '📋 기록 복사';
      error.textContent = '';
      attach.checked = replay !== null && (opts.attachDefault ?? true);
      attach.disabled = replay === null;
      copy.disabled = replay === null;
      copy.hidden = replay === null;
      attachHint.textContent = replay
        ? `명령 ${replay.commands.length}개 · 주소가 길면 마지막 기록만 들어가요. [기록 복사]로 전체를 붙여 넣을 수 있어요.`
        : '판 기록은 전투 중(일시정지 메뉴)에만 첨부할 수 있어요.';
      showCategory();
      showCount();
      if (!dialog.open) dialog.showModal();
    },
  };
}
