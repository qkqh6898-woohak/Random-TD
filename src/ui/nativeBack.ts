/**
 * 안드로이드 뒤로 가기 (A-1, Codex 갈래 M6-9에서 옮김).
 *
 * 앱(android/…/GameActivity.java)은 뒤로 가기를 누르면 페이지에 취소 가능한 `randomtd:native-back` 사건을 보낸다.
 * 웹 쪽이 처리했으면 preventDefault → 앱은 그대로, 처리하지 않았으면(타이틀에서 열린 창이 없음) 앱이 닫힌다.
 *
 * 처리 순서: ① 열린 <dialog>(타이틀 [기록]·[새 게임] 확인 등) 맨 위 하나를 닫는다 ② 지금 장면의 처리기
 * (전투: 열린 시트·패널·창을 먼저 닫고, 없으면 일시정지 ↔ 계속, 패배 화면이면 타이틀로).
 * 앱이 백그라운드로 갈 때는 `randomtd:native-pause` (전투면 일시정지 + 자동 저장 — Game 장면이 듣는다).
 */
export const NATIVE_BACK_EVENT = 'randomtd:native-back';
export const NATIVE_PAUSE_EVENT = 'randomtd:native-pause';

/** 처리했으면 true */
export type BackHandler = () => boolean;

let sceneHandler: BackHandler | null = null;

/** 지금 장면의 뒤로 가기 처리기 (장면이 시작할 때 걸고, 끝날 때 null). */
export function setBackHandler(handler: BackHandler | null): void {
  sceneHandler = handler;
}

/** 뒤로 가기 한 번 처리. 처리했으면 true. */
export function handleBack(doc: Pick<Document, 'querySelectorAll'>): boolean {
  const open = doc.querySelectorAll<HTMLDialogElement>('dialog[open]');
  const top = open[open.length - 1];
  if (top) {
    top.close();
    return true;
  }
  return sceneHandler?.() ?? false;
}

/** 페이지에 한 번 설치 (main.ts). */
export function installNativeBack(win: Pick<Window, 'addEventListener'>, doc: Pick<Document, 'querySelectorAll'>): void {
  win.addEventListener(NATIVE_BACK_EVENT, (ev) => {
    if (handleBack(doc)) ev.preventDefault();
  });
}
