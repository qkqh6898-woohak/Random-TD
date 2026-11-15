/**
 * 보스 컷인 (HF-2, DOM 오버레이): 단계 보스가 나오면 보스 그림이 오른쪽에서 미끄러져 들어와 어두운 사선 띠 위에
 * '보스 이름 + 등장!'을 보여 주고 잠깐 멈췄다가 빠져나간다.
 *
 * - 길이는 실제 시간 game.json art.cutinMs (약 1.6초, ×16에서도 같음 — CSS 애니메이션 + setTimeout).
 * - 누르기를 막지 않는다(pointer-events: none). HUD 위·패널/고르기 창 아래 층('cutin').
 * - 겹치지 않는다: 새 컷인이 오면 예전 것을 바로 바꾼다 (UiRoot.show가 같은 층의 예전 화면을 닫음).
 * - prefers-reduced-motion이면 미끄러짐 없이 서서히 나타났다 사라진다 (styles.css).
 * - 연출 끄기(effectsOff)면 아예 띄우지 않는다. 어떤 보스에 그림이 있는지는 데이터(game.json art.cutins).
 * 화면은 sim의 'bossSpawn' 사건을 읽기만 한다.
 */
import { h } from '../dom';
import type { UiRoot, UiView } from '../root';

/** 컷인 그림 경로 (assetUrl에 넘김) */
export function cutinPath(id: string): string {
  return `assets/cutins/cutin_${id}.webp`;
}

/** 이 보스의 컷인 그림 id (데이터에 없으면 null) — 순수 */
export function bossCutinId(bossId: string, cutins: readonly string[]): string | null {
  return cutins.includes(bossId) ? bossId : null;
}

export interface CutinRequest {
  /** 그림 주소 (assetUrl 결과) */
  src: string;
  /** 보스 한국어 이름 */
  name: string;
  /** 전체 길이 (ms, 실제 시간) */
  ms: number;
}

/** 컷인 DOM 한 장 (순수하게 만들기만; 띄우기는 BossCutinPlayer) */
export function createCutinView(req: CutinRequest): UiView {
  const img = h('img', { class: 'bc-art', attrs: { alt: '', draggable: 'false', src: req.src } });
  // 그림을 못 받으면 그림만 숨긴다 (이름 띠는 그대로)
  img.addEventListener('error', () => {
    img.hidden = true;
  });
  const el = h(
    'div',
    { class: 'boss-cutin', attrs: { 'data-testid': 'boss-cutin', 'aria-hidden': 'true' } },
    h('div', { class: 'bc-band' }),
    img,
    h('div', { class: 'bc-text' }, h('span', { class: 'bc-name', text: req.name }), h('span', { class: 'bc-appear', text: '등장!' })),
  );
  el.style.setProperty('--cutin-ms', `${Math.max(1, Math.round(req.ms))}ms`);
  return { el };
}

/** 컷인 띄우기: 하나만, ms 뒤 저절로 사라진다. */
export class BossCutinPlayer {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private view: UiView | null = null;
  /** 지금까지 띄운 컷인 수 (E2E) */
  played = 0;

  constructor(private readonly ui: UiRoot) {}

  play(req: CutinRequest): void {
    this.stop();
    const view = createCutinView(req);
    this.view = view;
    this.ui.show('cutin', view);
    this.played++;
    this.timer = setTimeout(() => {
      if (this.view === view) this.stop();
    }, req.ms);
  }

  /** 띄운 컷인을 바로 닫는다 (장면이 끝날 때·연출 끄기) */
  stop(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (this.view) this.ui.clear('cutin');
    this.view = null;
  }

  get showing(): boolean {
    return this.view !== null;
  }
}
