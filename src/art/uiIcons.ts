/**
 * FB-15/16/18 ART-1 UI 그림 이름 (예전 public/assets/ui/<name>.webp). ART-2에서 V2 아이콘(src/ui/uiIcons.ts)으로 바꾸고 예전 파일은 지웠다.
 * 이 이름·함수는 아직 artIcon()·WORKER_PORTRAIT를 쓰는 다른 갈래가 깨지지 않게 남긴 호환 창구 — 새 코드는 uiIcon()/uiIconUrl()을 쓴다.
 */
import { LEGACY_UI_ART, uiIconUrl } from '../ui/uiIcons';

export const UI_ART = Object.keys(LEGACY_UI_ART) as readonly (keyof typeof LEGACY_UI_ART)[];
export type UiArt = keyof typeof LEGACY_UI_ART;

/** 예전 이름 → 같은 뜻의 V2 아이콘 주소 (한 파일 빌드도 assetUrl로) */
export function uiArtUrl(id: UiArt): string {
  return uiIconUrl(LEGACY_UI_ART[id]);
}
