/** FB-15/16/18: 같은 ART-1 그림체의 UI 그림. 한 파일 빌드도 assetUrl로 읽는다. */
import { assetUrl } from '../assets';

export const UI_ART = ['worker', 'shop', 'gamble', 'mythic', 'summon', 'upgrade', 'pack-basic', 'pack-fine', 'chest-legend', 'fragments', 'gold-bag'] as const;
export type UiArt = (typeof UI_ART)[number];

export function uiArtUrl(id: UiArt): string {
  return assetUrl(`assets/ui/${id}.webp`);
}
