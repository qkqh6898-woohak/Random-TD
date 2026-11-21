import { loadDesignFont } from '../design-system/font';
import { createLoadingView, type LoadingView } from './LoadingView';
import { FONT_WAIT_MS, loadingProgress, LOADING_HINT_MS, LOADING_HINTS, TRANSITION_DELAY_MS } from './model';

export interface LoadingController {
  setProgress(value: number): void;
  completeStartup(): void;
  beginTransition(): void;
  endTransition(): void;
  destroy(): void;
}

/** A presentation adapter. Completion is supplied by the real scene-ready events. */
export function createLoadingController(host: HTMLElement, target: HTMLElement, version: string, showStartup = true): LoadingController {
  let view: LoadingView | null = null;
  let progress = 0;
  let startupDone = !showStartup;
  let destroyed = false;
  let transitioning = false;
  let delay: ReturnType<typeof setTimeout> | null = null;
  let hints: ReturnType<typeof setInterval> | null = null;
  let hintIndex = 0;
  let ownsInert = false;
  let wasInert = false;
  const block = (): void => { if (!ownsInert) { wasInert = target.inert; ownsInert = true; target.inert = true; } };
  const unblock = (): void => { if (ownsInert) { target.inert = wasInert; ownsInert = false; } };
  const clearView = (): void => { view?.el.remove(); view = null; };
  const clearDelay = (): void => { if (delay !== null) clearTimeout(delay); delay = null; };
  const clearHints = (): void => { if (hints !== null) clearInterval(hints); hints = null; };
  // Font failure falls back to the bundled screen's system font; it never blocks ready.
  // V2-R21 (PR-C 검토 🟠): 로비가 보인 뒤 글꼴이 바뀌어 보이지 않게, 시작 화면을 닫기 전에 글꼴을 최대 FONT_WAIT_MS만 기다린다
  // (Promise.race — 이미 읽었으면 바로, 늦거나 실패하면 시스템 글꼴로 그냥 진행).
  let fontSettled = false;
  const fontGate = Promise.race([
    loadDesignFont().then(() => undefined, () => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, FONT_WAIT_MS)),
  ]).then(() => { fontSettled = true; });
  let finishing = false;
  let transitionQueued = false;
  if (showStartup) {
    block();
    view = createLoadingView('startup', version);
    host.append(view.el);
    hints = setInterval(() => {
      hintIndex = (hintIndex + 1) % LOADING_HINTS.length;
      view?.hint(LOADING_HINTS[hintIndex]!);
    }, LOADING_HINT_MS);
  }
  const endTransition = (): void => {
    clearDelay();
    transitioning = false;
    if (startupDone) { clearView(); unblock(); }
  };
  const controller: LoadingController = {
    setProgress(value) {
      if (destroyed || startupDone) return;
      progress = loadingProgress(progress, value);
      view?.progress(progress);
    },
    completeStartup() {
      if (destroyed || startupDone || finishing) return;
      const finish = (): void => {
        finishing = false;
        if (destroyed || startupDone) return;
        startupDone = true;
        clearHints();
        view?.progress(1);
        clearView();
        unblock();
        // 글꼴을 기다리는 동안 들어온 화면 전환 요청은 이제 처리한다
        if (transitionQueued) { transitionQueued = false; controller.beginTransition(); }
      };
      if (fontSettled || !view) { finish(); return; }
      finishing = true;
      view.progress(1);
      void fontGate.then(finish);
    },
    beginTransition() {
      if (destroyed || transitioning) return;
      if (!startupDone) { if (finishing) transitionQueued = true; return; }
      transitioning = true;
      block();
      delay = setTimeout(() => {
        delay = null;
        if (destroyed || !transitioning) return;
        view = createLoadingView('transition', version);
        host.append(view.el);
      }, TRANSITION_DELAY_MS);
    },
    endTransition() { transitionQueued = false; endTransition(); },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearDelay(); clearHints(); clearView(); unblock();
      transitioning = false;
    },
  };
  return controller;
}
