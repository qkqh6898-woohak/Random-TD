/**
 * DOM 무대(#stage) 크기 맞추기 (T-3 '화면 꽉 차게').
 *
 * - `applyStageFit`: viewport.ts `fitStage`가 정한 CSS 크기를 무대에 넣는다 (#app이 가운데 정렬).
 * - `watchViewport`: 화면 크기·방향이 바뀌면 (resize·orientationchange·visualViewport) 다음 프레임에 한 번 다시 맞춘다.
 * - `setSideBackground`: 무대 밖 띠(넓은 화면의 양옆, 아주 길쭉한 화면의 위아래)에 깔 배경 그림 주소 (#app::before, 흐리고 어둡게).
 *   전투 배경·타이틀 그림이 바뀔 때 장면이 넣는다. null이면 기본 남색 그라데이션.
 */
import { fitStage, type StageFit } from '../view/viewport';

export function applyStageFit(stage: HTMLElement, fit: StageFit): void {
  if (!(fit.cssW > 0) || !(fit.cssH > 0)) return;
  stage.style.width = `${fit.cssW}px`;
  stage.style.height = `${fit.cssH}px`;
  stage.style.aspectRatio = 'auto';
  stage.dataset.full = fit.full ? '1' : '0';
}

/** 지금 창 크기로 무대를 맞추고 그 배치를 돌려준다. */
export function fitStageToWindow(win: Window, stage: HTMLElement): StageFit {
  const fit = fitStage(win.innerWidth, win.innerHeight);
  applyStageFit(stage, fit);
  return fit;
}

/** 화면 크기가 바뀌면 (한 프레임에 한 번) onChange. 그만 볼 때 부르는 함수를 돌려준다. */
export function watchViewport(win: Window, onChange: () => void): () => void {
  let raf = 0;
  const schedule = (): void => {
    if (raf) return;
    raf = win.requestAnimationFrame(() => {
      raf = 0;
      onChange();
    });
  };
  win.addEventListener('resize', schedule);
  win.addEventListener('orientationchange', schedule);
  win.visualViewport?.addEventListener('resize', schedule);
  return () => {
    win.removeEventListener('resize', schedule);
    win.removeEventListener('orientationchange', schedule);
    win.visualViewport?.removeEventListener('resize', schedule);
    if (raf) win.cancelAnimationFrame(raf);
  };
}

let lastSideUrl: string | null = null;

/** 무대 밖 띠의 배경 그림 (같은 주소면 아무것도 하지 않음). */
export function setSideBackground(url: string | null): void {
  if (url === lastSideUrl || typeof document === 'undefined') return;
  lastSideUrl = url;
  const app = document.getElementById('app');
  if (!app) return;
  if (url === null) app.style.removeProperty('--side-bg');
  else app.style.setProperty('--side-bg', `url("${url.replace(/"/g, '%22')}")`);
}
