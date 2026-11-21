/**
 * DOM 오버레이 루트. Phaser 캔버스 위에 같은 9:16 영역으로 겹쳐 있다 (#ui-root).
 *
 * 층(layer):
 *  - screen: 전체 화면 (타이틀, 결과 …) — 한 번에 하나
 *  - hud: 게임 중 상단·하단 HUD
 *  - cutin: 보스 컷인 (HF-2). HUD 위·패널 아래, 누르기를 막지 않음 (pointer-events: none)
 *  - guide: 첫 승급 안내 카드 (F10). 컷인 위·패널 아래, 카드 자체는 누르기를 통과시키고 [다음]·✕ 버튼만 받는다
 *  - quick: 고른 영웅 칸 왼쪽 위 작은 [⬆ 승급] 버튼 (피드백 #47). 안내 카드 위·패널 아래
 *  - panel: 게임 중 타워 정보 패널 (HUD 위, 일시정지·패배 화면 아래)
 *  - sheet: 하단 메뉴 바텀 시트 (도전·강화·미션, M5-1). 패널과 같은 높이 — 바텀 시트는 하나만 열리게 Game 장면이 서로 닫는다
 *  - modal: 게임 중 고르기 창 (보스 카드·승급의 축복, M4-7). 패널 위, 일시정지·패배 화면 아래 — 게임 시간은 흐른다
 *  - card: 캐릭터 카드 (HF-2, 정보 패널의 [ℹ]). 고르기 창 위, 일시정지·패배 화면 아래
 *  - toast: 짧은 알림 (단계 시작 등). 화면 읽기 프로그램이 읽어 주는 곳(aria-live)은 이 층뿐이다.
 *    HUD의 틱·시간처럼 초당 수십 번 바뀌는 값을 live 영역에 두면 계속 읽어 대므로 루트에는 aria-live를 달지 않는다.
 * UI는 sim 상태를 읽기만 하고, 바꾸려면 명령을 만들어 world.enqueue() 한다 (CLAUDE.md 2장).
 */
import { h } from './dom';

export interface UiView {
  el: HTMLElement;
  destroy?(): void;
}

export type LayerName = 'screen' | 'hud' | 'cutin' | 'guide' | 'quick' | 'panel' | 'sheet' | 'modal' | 'card' | 'toast';

/** 배너 줄 글자를 줄일 수 있는 하한 (원래 크기의 비율) */
const BANNER_MIN_FONT_RATIO = 0.6;

/**
 * 배너의 각 줄(줄바꿈 없음)이 배너 안쪽 폭을 넘으면 그 줄 글자 크기를 폭에 맞게 줄인다 (원래의 60%까지).
 * 레이아웃이 없는 환경(폭 0)에서는 아무것도 하지 않는다.
 */
export function fitBannerLines(el: HTMLElement): void {
  const cs = getComputedStyle(el);
  const avail = el.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
  if (!(avail > 0)) return;
  for (const child of Array.from(el.children)) {
    const line = child as HTMLElement;
    const w = line.scrollWidth;
    if (!(w > avail)) continue;
    const size = parseFloat(getComputedStyle(line).fontSize);
    if (!(size > 0)) continue;
    const fitted = Math.floor(((size * avail) / w) * 10) / 10;
    line.style.fontSize = `${Math.max(size * BANNER_MIN_FONT_RATIO, fitted)}px`;
  }
}

export class UiRoot {
  private readonly layers: Record<LayerName, HTMLElement>;
  private readonly mounted: Partial<Record<LayerName, UiView>> = {};
  /**
   * 알림 한 줄 높이를 재는 보이지 않는 알림 (늘 붙어 있음). 알림 층과 같은 자리(같은 cqw·글꼴)에 있어 실제 알림과 높이가 같다.
   * Game 장면이 ResizeObserver로 지켜본다 → 스타일·글꼴·무대 크기가 늦게 적용돼 높이가 바뀌면 알림 자리를 다시 잰다
   * (T-3 병합: 첫 배치 때 잰 높이(약 21px)가 실제 알림(약 39px)보다 작아 알림이 위쪽 패널 머리줄을 11px 덮던 것).
   */
  readonly toastProbe: HTMLElement;

  constructor(readonly el: HTMLElement) {
    el.replaceChildren();
    this.layers = {
      screen: h('div', { class: 'layer layer-screen' }),
      hud: h('div', { class: 'layer layer-hud' }),
      cutin: h('div', { class: 'layer layer-cutin', attrs: { 'aria-hidden': 'true' } }),
      guide: h('div', { class: 'layer layer-guide' }),
      quick: h('div', { class: 'layer layer-quick' }),
      panel: h('div', { class: 'layer layer-panel' }),
      sheet: h('div', { class: 'layer layer-sheet' }),
      modal: h('div', { class: 'layer layer-modal' }),
      card: h('div', { class: 'layer layer-card' }),
      toast: h('div', { class: 'layer layer-toast', attrs: { role: 'status', 'aria-live': 'polite' } }),
    };
    this.toastProbe = h('div', { class: 'toast-probe', text: '가' });
    const measure = h('div', { class: 'layer layer-measure', attrs: { 'aria-hidden': 'true' } }, this.toastProbe);
    el.append(
      measure,
      this.layers.hud,
      this.layers.cutin,
      this.layers.guide,
      this.layers.quick,
      this.layers.panel,
      this.layers.sheet,
      this.layers.modal,
      this.layers.card,
      this.layers.screen,
      this.layers.toast,
    );
  }

  /** 층에 화면 하나를 띄운다 (그 층의 이전 화면은 닫힘). */
  show(layer: LayerName, view: UiView): void {
    this.clear(layer);
    this.mounted[layer] = view;
    this.layers[layer].append(view.el);
  }

  /** 그 층에 화면이 떠 있는가 (안드로이드 뒤로 가기: 열린 창부터 닫기, A-1). */
  has(layer: LayerName): boolean {
    return this.mounted[layer] !== undefined;
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

  /** 떠 있는 알림·배너를 모두 지운다 (패배·일시정지 화면을 열 때 — 알림 층이 화면 층보다 위라 제목을 가린다, M4 검토 반영). */
  clearToasts(): void {
    this.layers.cutin.querySelector('.wave-ribbon')?.remove();
    this.layers.toast.replaceChildren();
  }

  /** Presentation only: no timer, reward or stage state is changed. */
  waveRibbon(stage: number): void {
    if (!this.el.classList.contains('battle-v2') || !Number.isFinite(stage) || stage < 1) return;
    // 피드백 #75 '✨ 화려한 효과' 꺼짐(.fx-off): 꾸밈 띠는 띄우지 않는다 — 단계 숫자는 HUD에 그대로 (V2-R21)
    if (this.el.classList.contains('fx-off')) return;
    this.layers.cutin.querySelector('.wave-ribbon')?.remove();
    const ribbon = h('div', { class: 'wave-ribbon', attrs: { 'aria-hidden': 'true', 'data-testid': 'wave-ribbon' }, text: `WAVE ${stage}` });
    this.layers.cutin.append(ribbon);
    setTimeout(() => ribbon.remove(), 1500);
  }

  /**
   * 배너 알림 (M4): 두 줄(제목 + 힌트) 큰 알림 — 편대 예고(경고 주황)·투명 몹 경고(보라)·보스 이름표(은색)·보스 처치(금색).
   * 알림 층에 일반 알림과 같이 쌓이고(최대 3개, 같은 글자는 다시 띄움) ms 뒤 사라진다.
   * 줄마다 줄바꿈하지 않고, 배너 폭(92cqw)을 넘는 줄은 글자 크기를 줄여 한 줄에 맞춘다 (fitBannerLines) — 412px에서 편대 예고
   * 제목이 이름 중간에서 끊겨 배너가 3줄(72px)이 되어 맵 0줄을 반 넘게 덮던 것 (검토 반영).
   */
  banner(title: string, sub: string | null, ms = 3200, tone: 'warn' | 'shadow' | 'boss' | 'gold' | 'mission' | 'challenge' | 'merge' = 'warn'): HTMLElement {
    const layer = this.layers.toast;
    const key = sub ? `${title}\n${sub}` : title;
    for (const child of [...layer.children]) if ((child as HTMLElement).dataset.key === key) child.remove();
    while (layer.childElementCount >= UiRoot.MAX_TOASTS) layer.firstElementChild?.remove();
    const el = h(
      'div',
      { class: `toast toast-banner is-${tone}`, attrs: { 'data-key': key, 'data-testid': `banner-${tone}` } },
      h('span', { class: 'toast-title', text: title }),
      sub ? h('span', { class: 'toast-sub', text: sub }) : null,
    );
    layer.append(el);
    fitBannerLines(el);
    setTimeout(() => el.remove(), ms);
    return el;
  }

  /**
   * 알림 한 줄의 높이 (CSS px). 늘 붙어 있는 보이지 않는 알림(toastProbe)의 그려진 높이 (글자 크기가 무대 너비(cqw)를 따라 바뀜).
   * Game 장면이 HUD 띠와 맵 사이에 알림 자리를 비워 두는 데 쓴다 → 알림이 맵 첫 줄을 가리지 않는다.
   */
  measureToastHeight(): number {
    return this.toastProbe.offsetHeight;
  }

  /** 알림이 뜨는 높이 (무대 위쪽에서 CSS px). HUD 띠 바로 아래에 띄우려고 Game 장면이 넣는다. null이면 기본값. */
  setToastTop(cssPx: number | null): void {
    if (cssPx === null || !Number.isFinite(cssPx)) this.layers.toast.style.removeProperty('--toast-top');
    else this.layers.toast.style.setProperty('--toast-top', `${Math.round(cssPx)}px`);
  }

  /**
   * 알림을 가장 최근 하나만 보이게 (true) / 최대 3개 쌓이게 (false). 위쪽 정보 패널이 열려 있으면 Game 장면이 켠다
   * → 알림이 HUD 아래 한 줄 자리를 넘쳐 패널 머리줄(이름·별·✕)을 덮지 않는다.
   */
  setToastSingle(on: boolean): void {
    this.layers.toast.classList.toggle('is-single', on);
  }

  /**
   * 알림을 바텀 시트 아래쪽(하단 메뉴 바로 위)으로 (true) / HUD 띠 아래로 (false). 시트를 85%로 펼치면 시트 머리줄·탭이
   * HUD 아래 알림 자리까지 올라와 알림이 탭 줄을 덮었다 → 펼친 동안만 아래로 내린다 (M5 검토 반영). 가장 최근 하나만 보인다.
   */
  setToastLow(on: boolean): void {
    if (this.layers.toast.classList.contains('is-low') !== on) this.layers.toast.classList.toggle('is-low', on);
  }

  /**
   * 아래쪽 HUD 높이 (무대 아래에서 잰 CSS px, M5): menu = 하단 메뉴 높이(바텀 시트 아래 끝 --sheet-bottom),
   * dock = 아래 띠 + 하단 메뉴 높이(고르기 창 아래 끝 --dock-h). 루트에 CSS 변수로 둬 sheet·modal 층이 같이 읽는다. null이면 지운다.
   */
  setDockMetrics(menu: number | null, dock: number | null): void {
    const set = (name: string, v: number | null): void => {
      if (v === null || !Number.isFinite(v)) this.el.style.removeProperty(name);
      else this.el.style.setProperty(name, `${Math.max(0, Math.round(v))}px`);
    };
    set('--sheet-bottom', menu);
    set('--dock-h', dock);
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
