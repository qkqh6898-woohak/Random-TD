/**
 * 바깥 그림 연결 지점 (순수, Phaser 없음): 힉스필드 크레딧이 생겨 그림 파일을 만들면 절차 그림 대신 쓴다.
 *
 * - 그림 파일: `public/assets/characters/<이름>.webp` (빌드하면 `assets/characters/`로 복사됨)
 * - 목록: `public/assets/characters/manifest.json`의 `characters` 배열에 항목을 적어야 쓴다 (파일만 두고 목록에 없으면 무시 → 없는 파일을 찾느라 404가 나지 않는다).
 * - 항목 이름: 타워 `miner`, 각성 `miner_awaken`, 적 `enemy:slime`, 인물 `person:lena` (프롬프트 원문은 docs/art/characterArt.json).
 */
import type { LookGroup } from './looks';

export const EXTERNAL_ART_DIR = 'assets/characters/';
export const EXTERNAL_ART_MANIFEST = `${EXTERNAL_ART_DIR}manifest.json`;

export interface ExternalArtManifest {
  version: number;
  characters: string[];
}

export function externalArtKey(group: LookGroup, id: string, awakened: boolean): string {
  return `ext-char-${group}-${id}${awakened ? '-a' : ''}`;
}

export function externalArtUrl(group: LookGroup, id: string, awakened: boolean): string {
  const name = group === 'tower' ? id : `${group}_${id}`;
  return `${EXTERNAL_ART_DIR}${name}${awakened ? '_awaken' : ''}.webp`;
}

/** 매니페스트 항목 → (묶음, id, 각성) */
export function parseExternalEntry(entry: string): { group: LookGroup; id: string; awakened: boolean } | null {
  const m = /^(?:(tower|enemy|person):)?([a-z0-9_]+?)(_awaken)?$/.exec(entry);
  if (!m) return null;
  return { group: (m[1] as LookGroup | undefined) ?? 'tower', id: m[2] as string, awakened: m[3] !== undefined };
}

/** 바깥 그림의 높이 (그림 단위, 크기 배수 1일 때): 절차 그림의 발밑~별 높이와 비슷하게. 실제 크기는 캐릭터별 배수(looks scale)를 곱한다 */
export const EXTERNAL_FIGURE_UNITS = 230;
/**
 * 바깥 그림의 최대 너비 (그림 단위, 약 1.6칸): HF-2부터 칸 너비에 맞추지 않는다(사용자: '꼭 칸에 안 맞춰도 돼') —
 * 아주 넓은 그림만 이 너비로 줄인다 (맵 절반을 덮지 않게).
 */
export const EXTERNAL_FIGURE_MAX_W = 400;

/** 바깥 적 그림 크기 배수 (몹 지름 대비) */
export const EXTERNAL_ENEMY_SCALE = 1.5;

/** 바깥 그림 배율 (순수): 높이를 맞추되 너비가 상한을 넘치면 상한에 맞춘다 */
export function externalFigureScale(w: number, h: number, units = EXTERNAL_FIGURE_UNITS, maxW = EXTERNAL_FIGURE_MAX_W): number {
  return Math.min(units / Math.max(1, h), maxW / Math.max(1, w));
}
