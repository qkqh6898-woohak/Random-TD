/**
 * DOM 오버레이 루트. Phaser 캔버스 위에 같은 9:16 영역으로 겹쳐 있다 (#ui-root).
 *
 * 층(layer):
 *  - screen: 전체 화면 (타이틀, 결과 …) — 한 번에 하나
 *  - hud: 게임 중 상단·하단 HUD
 *  - toast: 짧은 알림 (M2)
 * UI는 sim 상태를 읽기만 하고, 바꾸려면 명령을 만들어 world.enqueue() 한다 (CLAUDE.md 2장).
 */
import { h } from './dom';

export interface UiView {
  el: HTMLElement;
  destroy?(): void;
}

export type LayerName = 'screen' | 'hud' | 'toast';

export class UiRoot {
  private readonly layers: Record<LayerName, HTMLElement>;
  private readonly mounted: Partial<Record<LayerName, UiView>> = {};

  constructor(readonly el: HTMLElement) {
    el.replaceChildren();
    this.layers = {
      screen: h('div', { class: 'layer layer-screen' }),
      hud: h('div', { class: 'layer layer-hud' }),
      toast: h('div', { class: 'layer layer-toast' }),
    };
    el.append(this.layers.hud, this.layers.screen, this.layers.toast);
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
