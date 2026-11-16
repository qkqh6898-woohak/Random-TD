/**
 * 앱 안 업데이트 창 (U-1). 안드로이드 앱에서 새 버전이 있으면 타이틀 위에 뜬다 (UpdateService가 있을 때만 — 브라우저는 없음).
 *
 *   새 버전 v0.1.10이 나왔어요 (지금 v0.1.9)
 *   바뀐 점(짧게, 스크롤) · 내려받기 크기
 *   [나중에] [지금 업데이트]
 * → (설치 권한이 없으면) 설명 + [설정 열기] → 내려받는 중 n% (진행 막대) [취소] → 확인 중 → 설치 화면 안내 [닫기]
 * 업데이트 중 실패는 창을 닫고 짧은 알림(toast) — 게임은 그대로. 시작할 때 확인 실패(오프라인 등)는 알리지 않는다.
 * 창은 타이틀이 보일 때만 연다 (확인이 늦게 끝나 이미 전투면, 타이틀로 돌아왔을 때). [나중에]·뒤로 가기 = 이번 실행에서는 다시 묻지 않음.
 * 타이틀 창(.title-dialog)과 같은 모양. 뒤로 가기는 nativeBack이 열린 <dialog>를 닫는다 → close 사건 → 나중에/취소.
 */
import { h } from '../dom';
import type { UpdateService } from '../../update/UpdateService';
import { cleanNotes, errorMessage, formatMb, progressPercent, type UpdateState } from '../../update/updateModel';

export interface UpdateDialogHost {
  /** 창을 붙일 곳 (UI 루트 — 장면이 바뀌어도 남는다) */
  el: HTMLElement;
  toast(text: string, ms?: number): unknown;
}

/** 실패 알림 시간 (ms) */
const ERROR_TOAST_MS = 2800;

export function mountUpdateDialog(service: UpdateService, host: UpdateDialogHost): () => void {
  const title = h('h2', { attrs: { id: 'update-title', 'data-testid': 'update-title' } });
  const status = h('p', { class: 'update-status', attrs: { 'data-testid': 'update-status' } });
  const notes = h('ul', { class: 'update-notes', attrs: { 'data-testid': 'update-notes', 'aria-label': '바뀐 점' } });
  const fill = h('div', { class: 'update-progress-fill' });
  const progress = h(
    'div',
    { class: 'update-progress', attrs: { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0', 'data-testid': 'update-progress' } },
    fill,
  );
  const actions = h('div', { class: 'title-confirm-actions' });
  const dialog = h(
    'dialog',
    { class: 'title-dialog update-dialog', attrs: { 'aria-labelledby': 'update-title', 'data-testid': 'update-dialog' } },
    h('div', { class: 'title-dialog-body' }, title, status, notes, progress, actions),
  );
  host.el.append(dialog);

  /** 지금 버튼 줄이 어느 상태의 것인가 (진행률만 바뀔 때 버튼을 다시 만들지 않게) */
  let actionsFor = '';

  const button = (text: string, testId: string, onClick: () => void, primary = false): HTMLButtonElement =>
    h('button', { class: primary ? 'btn btn-primary' : 'btn', text, attrs: { type: 'button', 'data-testid': testId }, on: { click: onClick } });

  const setActions = (key: string, ...buttons: HTMLButtonElement[]): void => {
    if (actionsFor === key) return;
    actionsFor = key;
    actions.replaceChildren(...buttons);
  };

  /** 코드가 닫는 것은 상태가 이미 끝났을 때(나중에·실패·설치됨)뿐이다 — close 사건 처리기가 상태로 구분한다 */
  const close = (): void => {
    if (dialog.open) dialog.close();
  };

  const render = (s: UpdateState): void => {
    if (!('offer' in s)) return;
    const { offer } = s;
    title.replaceChildren(`새 버전 v${offer.version}이 나왔어요 `, h('small', { class: 'update-current', text: `(지금 v${offer.current})` }));
    const showNotes = s.kind === 'available';
    notes.hidden = !showNotes;
    if (showNotes && notes.childElementCount === 0) notes.replaceChildren(...cleanNotes(offer.notes).map((line) => h('li', { text: line })));
    const showProgress = s.kind === 'downloading' || s.kind === 'verifying' || s.kind === 'installing';
    progress.hidden = !showProgress;
    const pct = s.kind === 'downloading' ? progressPercent(s.received, s.total) : showProgress ? 100 : 0;
    fill.style.width = `${pct}%`;
    progress.setAttribute('aria-valuenow', String(pct));
    switch (s.kind) {
      case 'available':
        status.textContent = `내려받기 ${formatMb(offer.size)} · 저장한 판과 기록은 그대로예요`;
        setActions(
          'available',
          button('나중에', 'update-later', () => service.later()),
          button('지금 업데이트', 'update-now', () => service.start(), true),
        );
        break;
      case 'permission':
        status.textContent = "설치하려면 이 앱에 '출처를 알 수 없는 앱 설치'를 한 번 허용해야 해요. [설정 열기]에서 '이 출처 허용'을 켜고 돌아와 주세요.";
        setActions(
          'permission',
          button('나중에', 'update-later', () => service.later()),
          button('설정 열기', 'update-settings', () => service.openSettings(), true),
        );
        break;
      case 'downloading':
        status.textContent = `내려받는 중… ${pct}% (${formatMb(s.received)} / ${formatMb(s.total)})`;
        setActions('downloading', button('취소', 'update-cancel', () => service.cancel()));
        break;
      case 'verifying':
        status.textContent = '받은 파일을 확인하는 중이에요…';
        setActions('downloading', button('취소', 'update-cancel', () => service.cancel()));
        break;
      case 'installing':
        status.textContent = s.confirm
          ? '설치 화면에서 [업데이트]를 눌러 주세요. 저장한 판과 기록은 그대로예요.'
          : '설치 화면을 여는 중이에요…';
        setActions('installing', button('닫기', 'update-close', () => service.later()));
        break;
    }
  };

  const onChange = (s: UpdateState): void => {
    if (s.kind === 'error') {
      close();
      if (s.during === 'update') host.toast(errorMessage(s.code), ERROR_TOAST_MS);
      return;
    }
    if (!('offer' in s)) {
      close();
      return;
    }
    if (!dialog.open) {
      // 처음 여는 것은 '새 버전이 있음'일 때, 타이틀 화면에서만
      if (s.kind !== 'available' || !service.onTitle) return;
      render(s);
      dialog.showModal();
      return;
    }
    render(s);
  };

  // 사람이 닫음 (뒤로 가기 → nativeBack이 dialog.close(), Esc): 받는 중이면 취소, 아니면 나중에.
  // close 사건은 나중에(비동기) 오므로, 코드가 닫은 경우(상태가 이미 끝남 — offer 없음)는 상태로 걸러 낸다.
  dialog.addEventListener('close', () => {
    const s = service.state;
    if (!('offer' in s)) return;
    if (s.kind === 'downloading' || s.kind === 'verifying') service.cancel();
    else service.later();
  });

  const unsubscribe = service.subscribe((s) => onChange(s));
  onChange(service.state);
  return () => {
    unsubscribe();
    close();
    dialog.remove();
  };
}
