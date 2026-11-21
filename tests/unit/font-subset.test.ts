import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 결정 A: 앱의 Jua 글꼴은 KS X 1001 완성형 한글 2,350자만 담은 woff2(≤300KB) — tools/font_subset.py.
 * src/에 그 밖의 한글이 들어오면 그 글자만 시스템 글꼴로 그려지므로, 여기서 미리 막는다.
 */
const ROOT = join(__dirname, '..', '..');

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|css|json|html)$/.test(name)) out.push(p);
  }
  return out;
}

function ksHangul(): Set<string> {
  const dec = new TextDecoder('euc-kr');
  const set = new Set<string>();
  for (let hi = 0xb0; hi <= 0xc8; hi++) {
    for (let lo = 0xa1; lo <= 0xfe; lo++) {
      const ch = dec.decode(new Uint8Array([hi, lo]));
      if (ch.length === 1 && ch >= '가' && ch <= '힣') set.add(ch);
    }
  }
  return set;
}

describe('Jua 글꼴 줄인 판', () => {
  it('woff2 하나만 들어 있고 300KB 이하', () => {
    const dir = join(ROOT, 'public', 'assets', 'fonts');
    const fonts = readdirSync(dir).filter((f) => /\.(woff2?|ttf|otf)$/.test(f));
    expect(fonts).toEqual(['Jua-Regular.subset.woff2']);
    expect(statSync(join(dir, fonts[0] ?? '')).size).toBeLessThanOrEqual(300 * 1024);
  });

  it('KS X 1001 한글은 2,350자', () => {
    expect(ksHangul().size).toBe(2350);
  });

  it('src/와 index.html의 모든 한글이 줄인 판 안에 있다', () => {
    const ks = ksHangul();
    const files = [...walk(join(ROOT, 'src'), []), join(ROOT, 'index.html')];
    const missing = new Map<string, string>();
    for (const f of files) {
      for (const ch of readFileSync(f, 'utf8')) {
        if (ch >= '가' && ch <= '힣' && !ks.has(ch) && !missing.has(ch)) missing.set(ch, f.slice(ROOT.length + 1));
      }
    }
    expect([...missing].map(([c, f]) => `${c} (${f})`)).toEqual([]);
  });
});
