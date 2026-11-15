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
