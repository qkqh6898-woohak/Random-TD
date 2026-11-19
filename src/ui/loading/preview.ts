import { h } from '../dom';
import { createLoadingController } from './LoadingController';
/** Vite DEV-only review route. The demo percentage never enters the real startup. */
export function mountLoadingPreview(host: HTMLElement, target: HTMLElement, kind: 'startup' | 'transition'): void {
  const loading = createLoadingController(host, target, `v${__APP_VERSION__}`);
  if (kind === 'startup') loading.setProgress(.62);
  else { loading.completeStartup(); loading.beginTransition(); }
  host.append(h('p', { class: 'rtd-loading-preview-note', text: '로딩 화면 미리보기' }));
}
