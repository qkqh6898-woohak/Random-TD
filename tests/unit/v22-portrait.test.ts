/**
 * v0.1.22 '정보 패널 초상이 빈 네모' (무한의 검 ×3, 181단계): 모든 타워가 패널에서 비어 있지 않은 초상을 갖는다.
 * 원인은 CSS — 초상 전체를 덮는 [ℹ] 누르기 칸이 V2 버튼 바탕(.battle-v2 … .btn)을 받아 그림을 가렸다. 주소 고르기는 portraitSource(순수).
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { externalArtKey } from '../../src/art/characters/external';
import { towerPortraitSource, usableImageUrl } from '../../src/ui/panels/portraitSource';

const towers = (JSON.parse(readFileSync(new URL('../../src/data/towers.json', import.meta.url), 'utf8')) as { towers: { id: string; name: string }[] }).towers;
const manifest = JSON.parse(readFileSync(new URL('../../public/assets/characters/manifest.json', import.meta.url), 'utf8')) as { characters: string[] };
const loaded = new Set(manifest.characters.map((c) => externalArtKey('tower', c.replace(/_awaken$/, ''), c.endsWith('_awaken'))));
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('v0.1.22 정보 패널 초상', () => {
  it('쓸 수 없는 주소를 거른다 (빈 data URI · 빈 글자)', () => {
    expect(usableImageUrl('data:,')).toBe(false);
    expect(usableImageUrl('')).toBe(false);
    expect(usableImageUrl('data:image/png;base64,')).toBe(false);
    expect(usableImageUrl(null)).toBe(false);
    expect(usableImageUrl(PNG)).toBe(true);
    expect(usableImageUrl('assets/characters/archer.webp')).toBe(true);
  });

  it.each(towers.map((t) => [t.id, t.name] as const))('%s (%s): 바깥 그림 파일 주소 — 파일이 실제로 있다', (id) => {
    const url = towerPortraitSource(id, false, { externalLoaded: (k) => loaded.has(k), assetUrl: (p) => p, bake: () => null });
    expect(url, id).toBeTruthy();
    expect(existsSync(new URL(`../../public/${url}`, import.meta.url)), url!).toBe(true);
  });

  it('바깥 그림이 없거나 읽히지 않았으면 구운 절차 그림, 그것도 비면 null (빈 네모 대신 다시 시도)', () => {
    const none = { externalLoaded: () => false, assetUrl: (p: string) => p };
    expect(towerPortraitSource('infiniteblade', false, { ...none, bake: () => PNG })).toBe(PNG);
    expect(towerPortraitSource('infiniteblade', false, { ...none, bake: () => 'data:,' })).toBeNull();
    expect(towerPortraitSource('infiniteblade', false, { ...none, bake: () => { throw new Error('canvas'); } })).toBeNull();
    // 각성 그림이 없으면 기본 그림 파일
    expect(towerPortraitSource('infiniteblade', true, { externalLoaded: (k) => k === externalArtKey('tower', 'infiniteblade', false), assetUrl: (p) => p, bake: () => null })).toBe('assets/characters/infiniteblade.webp');
  });

  it('[ℹ] 누르기 칸은 초상을 가리지 않는다 (V2 버튼 바탕 투명)', () => {
    const css = readFileSync(new URL('../../src/ui/battle/battleV2.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.battle-v2 \.tower-panel \.tp-portrait-wrap > \.tp-info \{ background:transparent;/);
    const game = readFileSync(new URL('../../src/view/scenes/Game.ts', import.meta.url), 'utf8');
    expect(game).toContain('towerPortraitSource(');
  });
});
