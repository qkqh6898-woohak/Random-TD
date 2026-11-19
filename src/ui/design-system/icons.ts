import { assetUrl } from '../../assets';
import { h } from '../dom';

export const DESIGN_ICONS = ['shop', 'heroes', 'battle', 'codex', 'campaign', 'friends', 'mail', 'menu', 'quests', 'settings', 'mission', 'stats', 'speed', 'chat', 'sell', 'delete', 'pause', 'info', 'close', 'gold', 'diamond', 'flame', 'energy', 'battle-coin', 'luck', 'upgrade', 'plus', 'mythic', 'roulette'] as const;
export type DesignIcon = (typeof DESIGN_ICONS)[number];

/** Decorative art: the owner button/field supplies its accessible name. No external URL. */
export function createIcon(id: DesignIcon): HTMLImageElement {
  return h('img', { class: 'rtd-icon', attrs: { src: assetUrl(`assets/ui/v2/${id}.svg`), alt: '', 'aria-hidden': 'true', draggable: 'false', decoding: 'async', width: '48', height: '48' } });
}
