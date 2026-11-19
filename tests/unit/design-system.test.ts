import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { formatCompactNumber } from '../../src/ui/design-system/format';
import { DESIGN_ICONS } from '../../src/ui/design-system/icons';

describe('PR-B display number formatting', () => {
  it.each([[0, '0'], [9999, '9,999'], [10000, '10K'], [10800, '10.8K'], [999949, '999.9K'], [999950, '1M'], [1200000, '1.2M'], [-10800, '−10.8K']])('%s → %s', (n, text) => expect(formatCompactNumber(Number(n))).toBe(text));
  it('represents invalid display inputs without leaking NaN/Infinity', () => {
    expect(formatCompactNumber(NaN)).toBe('—'); expect(formatCompactNumber(Infinity)).toBe('—');
  });
});

describe('PR-B offline original art', () => {
  it('all exported icon IDs have self-contained vector assets and no external dependencies', () => {
    const files = readdirSync('public/assets/ui/v2').filter(f => f.endsWith('.svg')).sort();
    expect(files).toEqual(DESIGN_ICONS.map(id => `${id}.svg`).sort());
    expect(DESIGN_ICONS.length).toBeGreaterThanOrEqual(12);
    for (const file of files) {
      const svg = readFileSync(`public/assets/ui/v2/${file}`, 'utf8');
      expect(svg).toContain('viewBox="0 0 48 48"');
      expect(svg).not.toMatch(/<(script|foreignObject|image)\b|\b(href|onload)=/);
    }
  });
});
