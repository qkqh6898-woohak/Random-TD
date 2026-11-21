/**
 * ART-2 V2 UI 아이콘 39장 등록부 (힉스필드 '통통한 캐주얼' 그림, 사용자 결정 '아이콘은 전부 힉스필드 그림').
 *
 * - 파일: `public/assets/ui/icons/<id>.webp` (192×192 투명 WebP, 프롬프트·한글 이름은 docs/art/higgsfield/icons/queue.json).
 * - 주소는 `assetUrl()`로 얻는다 → 한 파일 빌드(`window.__RTD_ASSETS__`)에서는 data URI, 평소에는 './assets/ui/icons/…'.
 * - `uiIcon(id)` = 꾸밈 그림 `<img class="ui-icon" alt="" aria-hidden="true">`. 버튼의 접근성 이름은 글자 라벨·aria-label이 맡는다.
 * - 그림을 못 읽으면(파일 없음·망가짐) 같은 <img>의 src를 예전 이모지/글자를 그린 SVG로 바꾼다 (`data-fallback`) — 빈칸이 생기지 않고,
 *   요소를 갈아 끼우지 않으니 부르는 쪽이 쥔 참조·크기 CSS가 그대로다.
 * - 예전 ART-1 그림 이름(`src/art/uiIcons.ts` UiArt)은 다른 갈래 호환용으로 이 아이콘에 이어 둔다 (`LEGACY_UI_ART`).
 */
import { assetUrl } from '../assets';
import { h } from './dom';

/** 아이콘 id → 그림을 못 읽을 때 대신 보이는 예전 이모지/글자 (= 이 아이콘이 바꾼 글리프). 순서 = queue.json */
export const UI_ICON_FALLBACK = {
  // 전투 HUD
  'hud-summon': '🎲',
  'hud-gamble': '🎰',
  'hud-limited': '💠',
  'hud-worker': '👷',
  'hud-upgrade': '⬆',
  'hud-challenge': '⚔',
  'hud-mission': '📋',
  'hud-merge': '⏫',
  // 상점 상품 (progression.json shop id → SHOP_ICONS)
  'shop-pack-basic': '🃏',
  'shop-pack-fine': '🎴',
  'shop-chest-legend': '🎁',
  'shop-fragments': '🧩',
  'shop-gold-bag': '💰',
  // 로비 아래 메뉴
  'nav-shop': '🛒',
  'nav-heroes': '🦸',
  'nav-battle': '⚔️',
  'nav-codex': '📖',
  'nav-campaign': '🏰',
  // 로비 옆 버튼
  'side-quests': '📜',
  'side-recruit': '🎺',
  'side-records': '🏆',
  'side-settings': '⚙️',
  'side-mail': '✉️',
  'side-friends': '👥',
  // 재화
  'cur-gold': '💰',
  'cur-gems': '💎',
  'cur-flame': '🔥',
  // 작은 조작
  'ui-speed': '⏩',
  'ui-pause': '⏸',
  'ui-close': '✕',
  'ui-info': 'ℹ',
  'ui-plus': '＋',
  'ui-sell': '💰',
  'ui-delete': '🗑',
  'ui-menu': '☰',
  'ui-stats': '📊',
  'ui-chat': '💬',
  'ui-luck': '🍀',
  'ui-roulette': '🎡',
} as const satisfies Record<string, string>;

export type UiIconId = keyof typeof UI_ICON_FALLBACK;

/** 아이콘 id 전체 (39개, queue.json 순서) */
export const UI_ICONS = Object.keys(UI_ICON_FALLBACK) as readonly UiIconId[];

/**
 * 그림 묶음에 함께 왔지만 지금 화면(main)에 그 개념이 없어 쓰지 않는 아이콘 — 쓸 자리가 생기면 여기서 뺀다.
 * (우편·친구 버튼, 지우기·더하기·메뉴·통계 단추, 룰렛 화면이 아직 없다. 판매 버튼은 글자만 보이는 좁은 머리줄 칩이라 그대로.)
 * 단위 테스트가 '쓰지 않는 아이콘 = 이 목록'인지 확인한다.
 */
export const UI_ICONS_UNUSED: readonly UiIconId[] = ['side-mail', 'side-friends', 'ui-plus', 'ui-sell', 'ui-delete', 'ui-menu', 'ui-stats', 'ui-roulette'];

/** 상점 상품 id (progression.json `shop[].id`) → 아이콘. 데이터의 `icon` 이모지는 그림을 못 읽을 때 대신 쓴다. */
export const SHOP_ICONS: Readonly<Record<string, UiIconId>> = {
  'pack-basic': 'shop-pack-basic',
  'pack-fine': 'shop-pack-fine',
  'chest-legend': 'shop-chest-legend',
  fragments: 'shop-fragments',
  'gold-bag': 'shop-gold-bag',
};

/** 예전 ART-1 그림 이름(public/assets/ui/<name>.webp, ART-2에서 지움) → V2 아이콘. 다른 갈래의 artIcon()·uiArtUrl() 호환용. */
export const LEGACY_UI_ART = {
  worker: 'hud-worker',
  shop: 'nav-shop',
  gamble: 'hud-gamble',
  mythic: 'hud-limited',
  summon: 'hud-summon',
  upgrade: 'hud-upgrade',
  'pack-basic': 'shop-pack-basic',
  'pack-fine': 'shop-pack-fine',
  'chest-legend': 'shop-chest-legend',
  fragments: 'shop-fragments',
  'gold-bag': 'shop-gold-bag',
} as const satisfies Record<string, UiIconId>;

/** 데이터에서 온 이모지(시트 줄 아이콘 등) 중 그림으로 바꾸는 것 → 아이콘 (없으면 글자 그대로) */
export const GLYPH_ICONS: Readonly<Record<string, UiIconId>> = {
  '🍀': 'ui-luck',
  '🎲': 'hud-summon',
};

export function isUiIconId(id: string): id is UiIconId {
  return Object.prototype.hasOwnProperty.call(UI_ICON_FALLBACK, id);
}

/** 그림 파일 상대 경로 ('assets/ui/icons/hud-gamble.webp') */
export function uiIconPath(id: UiIconId): string {
  return `assets/ui/icons/${id}.webp`;
}

/** 그림 주소 (한 파일 빌드면 data URI) */
export function uiIconUrl(id: UiIconId): string {
  return assetUrl(uiIconPath(id));
}

/** 데이터 이모지 → 아이콘 id (바꾸지 않는 글리프면 null) */
export function iconForGlyph(glyph: string): UiIconId | null {
  return GLYPH_ICONS[glyph.trim()] ?? null;
}

/** 그림을 못 읽을 때 쓰는 대체 그림: 글리프 하나를 가운데 그린 SVG (시스템 글꼴 — 외부 요청 없음) */
export function glyphSvgUrl(glyph: string): string {
  const esc = glyph.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><text x="32" y="34" font-size="44" text-anchor="middle" dominant-baseline="central" font-family="sans-serif" fill="#fff5d6">${esc}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export interface UiIconOptions {
  /** 더할 class (크기·자리 CSS). 'ui-icon'은 늘 붙는다 */
  className?: string;
  /** 그림을 못 읽을 때 보일 글리프 (기본 = UI_ICON_FALLBACK[id]) */
  fallback?: string;
}

/** 그림 오류 → 대체 글리프 SVG로 (한 번만). E2E·화면 확인용으로 data-icon-state="fallback". */
function useFallback(img: HTMLImageElement): void {
  if (img.dataset.iconState === 'fallback') return;
  img.dataset.iconState = 'fallback';
  img.classList.add('is-fallback');
  img.src = glyphSvgUrl(img.dataset.fallback ?? '');
}

/** 꾸밈 아이콘 그림. 크기는 CSS(class)로 — 기본 1.6em 정사각형, object-fit: contain (feedback-design.css `.ui-icon`). */
export function uiIcon(id: UiIconId, opts: UiIconOptions = {}): HTMLImageElement {
  const img = h('img', {
    class: opts.className ? `ui-icon ${opts.className}` : 'ui-icon',
    attrs: {
      src: uiIconUrl(id),
      alt: '',
      'aria-hidden': 'true',
      draggable: 'false',
      decoding: 'async',
      'data-icon': id,
      'data-fallback': opts.fallback ?? UI_ICON_FALLBACK[id],
    },
  });
  img.addEventListener('error', () => useFallback(img));
  return img;
}

/** 데이터 이모지 자리: 그림으로 바꾸는 글리프면 아이콘, 아니면 예전처럼 글자 span (같은 class). */
export function glyphOrIcon(glyph: string, className: string): HTMLElement {
  const id = iconForGlyph(glyph);
  return id ? uiIcon(id, { className, fallback: glyph }) : h('span', { class: className, text: glyph, attrs: { 'aria-hidden': 'true' } });
}
