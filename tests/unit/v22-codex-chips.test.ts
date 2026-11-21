/**
 * v0.1.22 리미티드 도감 재료 칩 = 재료 등급 색 (V2 [data-grade] 토큰). 판 위에 있으면 채운 칩 + ✓, 없으면 테두리 칩.
 * 색만으로 알리지 않게 aria-label에 이름·등급·있음. 글자 대비 4.5:1 이상 (토큰 색으로 계산).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { codexSheetModel } from '../../src/ui/sheets/g1Models';
import { arena, data } from '../helpers/match';

function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}
const contrast = (a: string, b: string): number => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

describe('v0.1.22 도감 재료 칩 등급 색', () => {
  it('재료마다 등급과 읽어 주기 글자 (모르는 재료는 등급 없음)', () => {
    const m = arena(24);
    const towers = data.towers.towers;
    const found = codexSheetModel(m.ctx, m.world, 0, towers, new Set(['elemental']));
    const el = found.rows.find((r) => r.id === 'elemental')!;
    const byId = new Map(towers.map((t) => [t.id, t]));
    for (const mat of el.materials) {
      expect(mat.grade).toBe(byId.get(mat.id)!.grade);
      expect(mat.label).toContain(mat.name);
      expect(mat.label).toMatch(/판 위에 (있어요|없어요)$/);
    }
    const none = codexSheetModel(m.ctx, m.world, 0, towers, new Set());
    const gk = none.rows.find((r) => r.id === 'goldking')!;
    expect(gk.materials.filter((x) => !x.known).every((x) => x.grade === null && x.label === '모르는 재료')).toBe(true);
    const hint = gk.materials.find((x) => x.known)!;
    expect(hint.grade).toBe(towers.find((t) => t.id === hint.id)!.grade); // 힌트 재료 연금술사
  });

  it('칩 글자 대비 4.5:1 이상 (채운 칩: 등급 바탕 위 / 테두리 칩: 종이 위)', () => {
    const tokens = readFileSync(new URL('../../src/ui/design-system/tokens.css', import.meta.url), 'utf8');
    const css = readFileSync(new URL('../../src/ui/battle/battleV2.css', import.meta.url), 'utf8');
    const white = /\[data-grade\]\.is-on:is\(([^)]*)\) \{ color:#FFFFFF; \}/.exec(css)![1]!.match(/'(\w+)'/g)!.map((s) => s.slice(1, -1));
    const outline = '#3B2314';
    for (const g of ['normal', 'rare', 'unique', 'hero', 'legend', 'god', 'hidden']) {
      const bg = new RegExp(`\\[data-grade='${g}'\\] \\{ --rtd-grade-bg: (#[0-9A-F]{6})`, 'i').exec(tokens)![1]!;
      const ink = white.includes(g) ? '#FFFFFF' : outline;
      expect(contrast(ink, bg), `${g} ${ink} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(outline, '#FFF8E6')).toBeGreaterThanOrEqual(4.5);
    const sheet = readFileSync(new URL('../../src/ui/sheets/MythicSheet.ts', import.meta.url), 'utf8');
    expect(sheet).toContain("'aria-label': m.label");
    expect(sheet).toContain("'data-grade': m.grade");
  });
});
