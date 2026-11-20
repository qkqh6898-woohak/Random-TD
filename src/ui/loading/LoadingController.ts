import { loadDesignFont } from '../design-system/font';
import { createLoadingView, type LoadingView } from './LoadingView';
import { loadingProgress, LOADING_HINT_MS, LOADING_HINTS, TRANSITION_DELAY_MS } from './model';

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
  void loadDesignFont().catch(() => undefined);
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
  return {
    setProgress(value) {
      if (destroyed || startupDone) return;
      progress = loadingProgress(progress, value);
      view?.progress(progress);
    },
    completeStartup() {
      if (destroyed || startupDone) return;
      startupDone = true;
      clearHints();
      view?.progress(1);
      clearView();
      unblock();
    },
    beginTransition() {
      if (destroyed || !startupDone || transitioning) return;
      transitioning = true;
      block();
      delay = setTimeout(() => {
        delay = null;
        if (destroyed || !transitioning) return;
        view = createLoadingView('transition', version);
        host.append(view.el);
      }, TRANSITION_DELAY_MS);
    },
    endTransition,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearDelay(); clearHints(); clearView(); unblock();
      transitioning = false;
    },
  };
}
