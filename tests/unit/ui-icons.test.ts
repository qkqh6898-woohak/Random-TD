/**
 * ART-2 V2 UI 아이콘 39장 등록부 (src/ui/uiIcons.ts).
 * - id 하나마다 public/assets/ui/icons/<id>.webp 파일이 있고(192×192 WebP), 폴더에 등록부에 없는 파일이 없다.
 * - 화면 코드가 쓰지 않는 아이콘 = UI_ICONS_UNUSED (이유는 등록부 주석) — 쓰기 시작하면 목록에서 빼야 통과한다.
 * - 상점 상품 id 표 = progression.json shop id, 예전 ART-1 이름 호환, 한 파일 빌드 주소(data URI), 대체 글리프 SVG.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  GLYPH_ICONS,
  LEGACY_UI_ART,
  SHOP_ICONS,
  UI_ICONS,
  UI_ICONS_UNUSED,
  UI_ICON_FALLBACK,
  glyphSvgUrl,
  iconForGlyph,
  isUiIconId,
  uiIconPath,
  uiIconUrl,
  type UiIconId,
} from '../../src/ui/uiIcons';
import { UI_ART, uiArtUrl } from '../../src/art/uiIcons';

const ROOT = join(__dirname, '../..');
const ICON_DIR = join(ROOT, 'public/assets/ui/icons');

/** src 아래 .ts 파일 (등록부 자신과 예전 이름 호환 파일은 뺀다 — 거기 적힌 id는 '쓰임'이 아니다) */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (p.endsWith('.ts') && !p.endsWith(join('ui', 'uiIcons.ts')) && !p.endsWith(join('art', 'uiIcons.ts'))) out.push(p);
  }
  return out;
}

/** WebP(VP8X) 머리에서 가로·세로 */
function webpSize(buf: Buffer): { w: number; h: number } {
  expect(buf.toString('ascii', 0, 4)).toBe('RIFF');
  expect(buf.toString('ascii', 8, 12)).toBe('WEBP');
  expect(buf.toString('ascii', 12, 16)).toBe('VP8X');
  return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
}

describe('ART-2 V2 UI 아이콘 등록부', () => {
  afterEach(() => {
    delete (globalThis as { __RTD_ASSETS__?: unknown }).__RTD_ASSETS__;
  });

  it('39개 · queue.json(그림 작업 목록)과 같은 id·순서', () => {
    const queue = JSON.parse(readFileSync(join(ROOT, 'docs/art/higgsfield/icons/queue.json'), 'utf8')) as { file: string }[];
    expect(UI_ICONS).toHaveLength(39);
    expect([...UI_ICONS]).toEqual(queue.map((q) => q.file));
    for (const id of UI_ICONS) expect(UI_ICON_FALLBACK[id].length).toBeGreaterThan(0);
  });

  it('id마다 192×192 WebP 파일이 있고, 폴더에 등록부에 없는 파일이 없다', () => {
    const files = readdirSync(ICON_DIR).sort();
    expect(files).toEqual([...UI_ICONS].map((id) => `${id}.webp`).sort());
    for (const id of UI_ICONS) {
      const buf = readFileSync(join(ROOT, 'public', uiIconPath(id)));
      expect(webpSize(buf), id).toEqual({ w: 192, h: 192 });
      expect(buf.length, id).toBeLessThan(20_000);
    }
  });

  it('화면 코드가 쓰지 않는 아이콘은 UI_ICONS_UNUSED뿐 (목록의 아이콘은 정말 어디서도 안 쓴다)', () => {
    const src = sourceFiles(join(ROOT, 'src'))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    const used = new Set<UiIconId>([...Object.values(SHOP_ICONS), ...Object.values(GLYPH_ICONS)]);
    for (const id of UI_ICONS) if (src.includes(`'${id}'`)) used.add(id);
    const unused = UI_ICONS.filter((id) => !used.has(id));
    expect(unused.sort()).toEqual([...UI_ICONS_UNUSED].sort());
  });

  it('상점 상품 id 표 = progression.json shop id (상품마다 그림 하나)', () => {
    const prog = JSON.parse(readFileSync(join(ROOT, 'src/data/progression.json'), 'utf8')) as { shop: { id: string; icon: string }[] };
    expect(Object.keys(SHOP_ICONS).sort()).toEqual(prog.shop.map((s) => s.id).sort());
    for (const s of prog.shop) {
      const id = SHOP_ICONS[s.id]!;
      expect(isUiIconId(id)).toBe(true);
      expect(id).toBe(`shop-${s.id}`);
      // 데이터의 icon 이모지 = 그림을 못 읽을 때 대신 보일 글리프와 같다
      expect(UI_ICON_FALLBACK[id]).toBe(s.icon);
    }
  });

  it('주소: 평소 상대 주소, 한 파일 빌드(__RTD_ASSETS__)면 data URI', () => {
    expect(uiIconPath('hud-gamble')).toBe('assets/ui/icons/hud-gamble.webp');
    expect(uiIconUrl('hud-gamble')).toBe('./assets/ui/icons/hud-gamble.webp');
    (globalThis as { __RTD_ASSETS__?: unknown }).__RTD_ASSETS__ = { 'assets/ui/icons/hud-gamble.webp': 'data:image/webp;base64,AAAA' };
    expect(uiIconUrl('hud-gamble')).toBe('data:image/webp;base64,AAAA');
    expect(uiIconUrl('hud-summon')).toBe('./assets/ui/icons/hud-summon.webp');
  });

  it('예전 ART-1 이름(artIcon·WORKER_PORTRAIT 호환)은 모두 V2 아이콘 주소로', () => {
    expect([...UI_ART].sort()).toEqual(['chest-legend', 'fragments', 'gamble', 'gold-bag', 'mythic', 'pack-basic', 'pack-fine', 'shop', 'summon', 'upgrade', 'worker']);
    for (const id of UI_ART) expect(uiArtUrl(id)).toBe(`./assets/ui/icons/${LEGACY_UI_ART[id]}.webp`);
    expect(uiArtUrl('worker')).toBe('./assets/ui/icons/hud-worker.webp');
  });

  it('데이터 이모지 → 아이콘: 🍀·🎲만, 나머지는 글자 그대로', () => {
    expect(iconForGlyph('🍀')).toBe('ui-luck');
    expect(iconForGlyph(' 🎲 ')).toBe('hud-summon');
    expect(iconForGlyph('🏷️')).toBeNull();
    expect(isUiIconId('ui-close')).toBe(true);
    expect(isUiIconId('toString')).toBe(false);
  });

  it('대체 그림: 글리프 하나를 그린 SVG data URI (특수 문자는 이스케이프)', () => {
    const url = glyphSvgUrl('🎰');
    expect(url.startsWith('data:image/svg+xml,')).toBe(true);
    const svg = decodeURIComponent(url.slice('data:image/svg+xml,'.length));
    expect(svg).toContain('>🎰</text>');
    expect(decodeURIComponent(glyphSvgUrl('<&>'))).toContain('>&lt;&amp;&gt;</text>');
  });
});
