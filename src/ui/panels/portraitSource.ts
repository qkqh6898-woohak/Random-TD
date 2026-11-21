/**
 * 정보 패널·캐릭터 카드·도감 초상 주소 (v0.1.22 '초상이 빈 네모' 고침). 순수 함수 (Phaser·DOM 없음 → 단위 테스트).
 *
 * - 바깥 그림(WebP)이 읽혀 있으면 그 파일 주소 — 로비 영웅 카드(Boot.portraitOf)와 같다. 예전처럼 텍스처를 캔버스에 다시 그려
 *   data URI(약 120KB)로 굽지 않는다 (긴 판에서 메모리가 모자라면 toDataURL이 빈 'data:,'를 돌려줄 수 있다).
 * - 없으면 절차 그림을 구운 data URI (bake). 쓸 수 없는 주소('', 'data:,', 내용 없는 data URI)는 버리고 다음 후보로.
 * 빈 네모의 실제 원인은 CSS였다: 초상 전체를 덮는 [ℹ] 누르기 칸이 V2 버튼 바탕을 받아 그림을 가렸다 (battleV2.css v0.1.22).
 */
import { externalArtKey, externalArtUrl } from '../../art/characters/external';

/** data URI 머리 'data:image/png;base64,' 뒤에 내용이 이만큼은 있어야 그림으로 본다 */
const MIN_DATA_PAYLOAD = 16;

/** 이미지 주소로 쓸 수 있는가: 빈 글자·'data:,'·내용 없는 data URI는 안 됨. */
export function usableImageUrl(u: unknown): u is string {
  if (typeof u !== 'string' || u.trim() === '') return false;
  if (!u.startsWith('data:')) return true;
  const comma = u.indexOf(',');
  return comma > 5 && u.length - comma - 1 >= MIN_DATA_PAYLOAD;
}

export interface PortraitDeps {
  /** 그 텍스처 키가 읽혀 있는가 (Phaser textures.exists) */
  externalLoaded(key: string): boolean;
  /** 앱 안 그림 주소 (assets.ts assetUrl — 한 파일 빌드면 data URI) */
  assetUrl(path: string): string;
  /** 절차 그림을 구운 이미지 주소 (실패하면 null) */
  bake(): string | null;
}

/** 타워 초상 주소: 바깥 그림 파일 → 구운 절차 그림 → null. */
export function towerPortraitSource(towerId: string, awakened: boolean, deps: PortraitDeps): string | null {
  if (deps.externalLoaded(externalArtKey('tower', towerId, awakened))) {
    const url = deps.assetUrl(externalArtUrl('tower', towerId, awakened));
    if (usableImageUrl(url)) return url;
  }
  if (awakened && deps.externalLoaded(externalArtKey('tower', towerId, false))) {
    const url = deps.assetUrl(externalArtUrl('tower', towerId, false));
    if (usableImageUrl(url)) return url;
  }
  let baked: string | null = null;
  try {
    baked = deps.bake();
  } catch {
    baked = null;
  }
  return usableImageUrl(baked) ? baked : null;
}
