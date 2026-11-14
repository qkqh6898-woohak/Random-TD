/**
 * DOM 오버레이 루트. Phaser 캔버스 위에 같은 9:16 영역으로 겹쳐 있다 (#ui-root).
 *
 * 층(layer):
 *  - screen: 전체 화면 (타이틀, 결과 …) — 한 번에 하나
 *  - hud: 게임 중 상단·하단 HUD
 *  - panel: 게임 중 타워 정보 패널 (HUD 위, 일시정지·패배 화면 아래)
 *  - toast: 짧은 알림 (단계 시작 등). 화면 읽기 프로그램이 읽어 주는 곳(aria-live)은 이 층뿐이다.
 *    HUD의 틱·시간처럼 초당 수십 번 바뀌는 값을 live 영역에 두면 계속 읽어 대므로 루트에는 aria-live를 달지 않는다.
 * UI는 sim 상태를 읽기만 하고, 바꾸려면 명령을 만들어 world.enqueue() 한다 (CLAUDE.md 2장).
 */
import { h } from './dom';

export interface UiView {
  el: HTMLElement;
  destroy?(): void;
}

export type LayerName = 'screen' | 'hud' | 'panel' | 'toast';

export class UiRoot {
  private readonly layers: Record<LayerName, HTMLElement>;
  private readonly mounted: Partial<Record<LayerName, UiView>> = {};

  constructor(readonly el: HTMLElement) {
    el.replaceChildren();
    this.layers = {
      screen: h('div', { class: 'layer layer-screen' }),
      hud: h('div', { class: 'layer layer-hud' }),
      panel: h('div', { class: 'layer layer-panel' }),
      toast: h('div', { class: 'layer layer-toast', attrs: { role: 'status', 'aria-live': 'polite' } }),
    };
    el.append(this.layers.hud, this.layers.panel, this.layers.screen, this.layers.toast);
  }

  /** 층에 화면 하나를 띄운다 (그 층의 이전 화면은 닫힘). */
  show(layer: LayerName, view: UiView): void {
    this.clear(layer);
    this.mounted[layer] = view;
    this.layers[layer].append(view.el);
  }

  /** 층 비우기. */
  clear(layer: LayerName): void {
    const view = this.mounted[layer];
    if (view) {
      view.destroy?.();
      view.el.remove();
      delete this.mounted[layer];
    }
  }

  /**
   * 짧은 알림 (toast 층, 화면 읽기 프로그램이 읽어 줌). 같은 때 최대 3개, ms 뒤 사라진다.
   * 알림은 게임 상태를 바꾸지 않는다 (보여주기만).
   */
  toast(text: string, ms = 1600): HTMLElement {
    const layer = this.layers.toast;
    // 같은 글자가 이미 떠 있으면 그것을 지우고 새로 띄운다 (연타해도 같은 알림이 쌓이지 않게)
    for (const child of [...layer.children]) if (child.textContent === text) child.remove();
    while (layer.childElementCount >= UiRoot.MAX_TOASTS) layer.firstElementChild?.remove();
    const el = h('div', { class: 'toast', text });
    layer.append(el);
    setTimeout(() => el.remove(), ms);
    return el;
  }

  private static readonly MAX_TOASTS = 3;

  /**
   * 알림 한 줄의 높이 (CSS px). 보이지 않는 알림을 잠깐 넣어 실제 DOM 높이를 잰다 (글자 크기가 무대 너비(cqw)를 따라 바뀜).
   * Game 장면이 HUD 띠와 맵 사이에 알림 자리를 비워 두는 데 쓴다 → 알림이 맵 첫 줄을 가리지 않는다.
   */
  measureToastHeight(): number {
    const probe = h('div', { class: 'toast', text: '가', attrs: { 'aria-hidden': 'true' } });
    probe.style.visibility = 'hidden';
    probe.style.position = 'absolute';
    probe.style.animation = 'none';
    this.layers.toast.append(probe);
    const height = probe.offsetHeight;
    probe.remove();
    return height;
  }

  /** 알림이 뜨는 높이 (무대 위쪽에서 CSS px). HUD 띠 바로 아래에 띄우려고 Game 장면이 넣는다. null이면 기본값. */
  setToastTop(cssPx: number | null): void {
    if (cssPx === null || !Number.isFinite(cssPx)) this.layers.toast.style.removeProperty('--toast-top');
    else this.layers.toast.style.setProperty('--toast-top', `${Math.round(cssPx)}px`);
  }

  clearAll(): void {
    (Object.keys(this.layers) as LayerName[]).forEach((l) => this.clear(l));
  }

  /** 치명적 오류 화면 (데이터 오류 등). */
  showError(title: string, detail: string): void {
    this.clearAll();
    this.show('screen', {
      el: h(
        'div',
        { class: 'screen error-screen', attrs: { role: 'alert', 'data-screen': 'error' } },
        h('h2', { text: `⚠ ${title}` }),
        h('pre', { class: 'error-detail', text: detail }),
        h('button', { class: 'btn', text: '다시 시도', on: { click: () => location.reload() } }),
      ),
    });
  }
}
