import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanSource, stripCommentsAndStrings } from '../../tools/check-determinism.mjs';

const ROOT = resolve(__dirname, '../..');
const SCRIPT = join(ROOT, 'tools/check-determinism.mjs');

const rules = (src: string): string[] => scanSource(src, 'x.ts').map((v) => v.rule);

describe('결정성 검사: 금지 API 탐지', () => {
  it.each([
    ['const r = Math.random();', 'Math.random'],
    ['const t = Date.now();', 'Date'],
    ['const d = new Date();', 'Date'],
    ['const t = performance.now();', 'performance'],
    ['const p = Math.pow(2, 3);', 'Math.pow'],
    ['const e = Math.exp(1);', 'Math.exp'],
    ['const s = Math.sin(1);', 'Math.sin/cos/tan'],
    ['const c = Math.cos(1);', 'Math.sin/cos/tan'],
    ['const a = Math.atan2(1, 2);', 'Math.sin/cos/tan'],
    ['const l = Math.log(1);', 'Math.log'],
    ['const l = Math.log10(1);', 'Math.log'],
    ['const q = Math.sqrt(2);', 'Math.sqrt/cbrt/hypot'],
    ['const x = 2 ** 8;', '**'],
    ['let x = 2; x **= 3;', '**'],
    ['const f = Math["random"];', 'Math[…]'],
    ['window.alert(1);', 'window'],
    ['document.body;', 'document'],
    ['setTimeout(() => {}, 10);', 'timer'],
    ['localStorage.getItem("a");', 'localStorage'],
    ['crypto.getRandomValues(buf);', 'crypto'],
    ['fetch("/x");', 'fetch'],
  ])('%s → %s', (src, rule) => {
    expect(rules(src)).toContain(rule);
  });

  it('Math . random 처럼 공백을 넣어도 잡는다', () => {
    expect(rules('Math . random()')).toContain('Math.random');
  });

  it('허용: Math.floor/imul/min/max/abs/round, 이름에 Date가 섞인 식별자', () => {
    expect(rules('const v = Math.floor(Math.imul(a, b) / 2) + Math.min(1, 2) + Math.abs(-1) + Math.round(1.5);')).toEqual([]);
    expect(rules('const updateDate = 1; const dateLike = 2; const performanceScore = 3;')).toEqual([]);
  });

  it('주석과 문자열 안의 글자는 무시한다', () => {
    const src = [
      '// Math.random 쓰지 말 것, Date 도 금지',
      '/* performance.now() ** 2 */',
      "const msg = 'Math.random() 대신 Rng';",
      'const t = "Date";',
      'const u = `window ${1 + 2} document`;',
    ].join('\n');
    expect(rules(src)).toEqual([]);
  });

  it('템플릿 문자열의 ${…} 안은 코드로 검사한다', () => {
    expect(rules('const s = `값: ${Math.random()}`;')).toContain('Math.random');
    expect(rules('const s = `a ${ {k: Date.now()}.k } b`;')).toContain('Date');
  });

  it('정규식 리터럴 안의 따옴표·글자는 무시하고, 나눗셈 뒤 코드는 검사한다', () => {
    expect(rules("const re = /'/; const r = Math.random();")).toEqual(['Math.random']);
    expect(rules('const re = /Date|[/]window/g;')).toEqual([]);
    expect(rules('const half = a / 2; const t = Date.now() / 1000;')).toEqual(['Date']);
    expect(rules("if (x) return /a'b/.test(s); const q = Math.pow(2, 2);")).toEqual(['Math.pow']);
  });

  it('줄·열 위치를 알려준다', () => {
    const v = scanSource('const a = 1;\nconst b = Math.random();', 'src/sim/x.ts');
    expect(v).toEqual([{ file: 'src/sim/x.ts', line: 2, col: 11, rule: 'Math.random', why: expect.any(String) }]);
  });

  it('phaser import와 화면 폴더 import를 잡는다', () => {
    expect(rules("import Phaser from 'phaser';")).toContain('import phaser');
    const abs = join(ROOT, 'src/sim/systems/Foo.ts');
    const v = scanSource("import { Hud } from '../../ui/hud/Hud';\nimport { Rng } from '../Rng';", 'Foo.ts', abs);
    expect(v.map((x) => x.rule)).toEqual(['import ../../ui/hud/Hud']);
    const v2 = scanSource("import type { MapData } from '../data/load';", 'World.ts', join(ROOT, 'src/sim/World.ts'));
    expect(v2).toEqual([]); // 데이터는 읽어도 된다
  });

  it('stripCommentsAndStrings는 길이와 줄바꿈을 보존한다', () => {
    const src = "a // c\nb = 'x\\'y';\n/* m\nn */ c";
    const { code } = stripCommentsAndStrings(src);
    expect(code).toHaveLength(src.length);
    expect(code.split('\n')).toHaveLength(src.split('\n').length);
  });
});

describe('결정성 검사 CLI', () => {
  it('src/sim은 통과한다', () => {
    const out = execFileSync('node', [SCRIPT], { cwd: ROOT, encoding: 'utf8' });
    expect(out).toContain('결정성 검사 통과');
  });

  it('Math.random을 넣은 폴더는 실패한다 (종료 코드 1)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rtd-det-'));
    try {
      writeFileSync(join(dir, 'Bad.ts'), 'export const roll = (): number => Math.random();\n');
      writeFileSync(join(dir, 'Good.ts'), 'export const two = (): number => 1 + 1;\n');
      let code = 0;
      let stderr = '';
      try {
        execFileSync('node', [SCRIPT, dir], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
      } catch (e) {
        const err = e as { status: number; stderr: string };
        code = err.status;
        stderr = err.stderr;
      }
      expect(code).toBe(1);
      expect(stderr).toContain('Bad.ts:1:');
      expect(stderr).toContain('Math.random');
      expect(stderr).not.toContain('Good.ts');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
