import { assetUrl } from '../../assets';
import { h } from '../dom';
import { uiIcon, type UiIconId } from '../uiIcons';

export const DESIGN_ICONS = ['shop', 'heroes', 'battle', 'codex', 'campaign', 'friends', 'mail', 'menu', 'quests', 'settings', 'mission', 'stats', 'speed', 'chat', 'sell', 'delete', 'pause', 'info', 'close', 'gold', 'diamond', 'flame', 'energy', 'battle-coin', 'luck', 'upgrade', 'plus', 'mythic', 'roulette'] as const;
export type DesignIcon = (typeof DESIGN_ICONS)[number];

/**
 * PR-B 아이콘 이름 → ART-2 힉스필드 WebP (사용자 결정: 그림이 있으면 힉스필드가 기준, PR-B SVG는 못 읽을 때의 대체).
 * 지금 화면에 쓰는 이름만 잇는다 — 친구·우편·더하기·판매·지우기·룰렛은 화면이 없어 벡터 그대로(갤러리 표본),
 * 에너지·전투 코인은 같은 뜻의 그림이 없다. (UI_ICONS_UNUSED 단위 테스트가 이 표를 '쓰임'으로 센다.)
 */
export const DESIGN_ICON_ART: Readonly<Partial<Record<DesignIcon, UiIconId>>> = {
  shop: 'nav-shop',
  heroes: 'nav-heroes',
  battle: 'nav-battle',
  codex: 'nav-codex',
  campaign: 'nav-campaign',
  menu: 'ui-menu',
  quests: 'side-quests',
  settings: 'side-settings',
  mission: 'hud-mission',
  stats: 'ui-stats',
  speed: 'ui-speed',
  chat: 'ui-chat',
  pause: 'ui-pause',
  info: 'ui-info',
  close: 'ui-close',
  gold: 'cur-gold',
  diamond: 'cur-gems',
  flame: 'cur-flame',
  luck: 'ui-luck',
  upgrade: 'hud-upgrade',
  mythic: 'hud-limited',
};

export function designIconUrl(id: DesignIcon): string {
  return assetUrl(`assets/ui/v2/${id}.svg`);
}

export interface IconOptions {
  /** 힉스필드 그림 고르기: 없으면 DESIGN_ICON_ART[id], null이면 PR-B 벡터만 (개발용 갤러리 표본) */
  art?: UiIconId | null;
}

/**
 * Decorative art: the owner button/field supplies its accessible name. No external URL.
 * 힉스필드 그림이 있으면 `uiIcon()`(class 'ui-icon rtd-icon', data-icon)이고, 그 그림을 못 읽으면 같은 img가 PR-B SVG로 바뀐다.
 */
export function createIcon(id: DesignIcon, opts: IconOptions = {}): HTMLImageElement {
  const art = opts.art === undefined ? DESIGN_ICON_ART[id] : opts.art;
  if (art) {
    const img = uiIcon(art, { className: 'rtd-icon', fallbackSrc: designIconUrl(id) });
    img.width = 48;
    img.height = 48;
    img.dataset.designIcon = id;
    return img;
  }
  return h('img', { class: 'rtd-icon', attrs: { src: designIconUrl(id), alt: '', 'aria-hidden': 'true', draggable: 'false', decoding: 'async', width: '48', height: '48', 'data-design-icon': id } });
}
