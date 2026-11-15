/**
 * T-1 한 파일 빌드: HTML 바꾸기(순수 함수) — CSS·JS를 안에 넣고, 나머지 assets/**를 window.__RTD_ASSETS__로.
 */
import { describe, expect, it } from 'vitest';
import {
  assetsScriptTag,
  buildAssetTable,
  escapeInlineScript,
  escapeInlineStyle,
  inlineSingleHtml,
  mimeOf,
  normalizeRef,
} from '../../tools/build-single.mjs';

const HTML = `<!doctype html>
<html lang="ko">
  <head>
    <title>운빨 디펜스</title>
    <script type="module" crossorigin src="./assets/index-abc.js"></script>
    <link rel="modulepreload" crossorigin href="./assets/index-abc.js">
    <link rel="stylesheet" crossorigin href="./assets/index-def.css">
  </head>
  <body><div id="game"></div></body>
</html>`;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

describe('한 파일 빌드 (tools/build-single.mjs)', () => {
  it('CSS는 <style>, JS는 <script type="module">로 안에, 그 앞에 __RTD_ASSETS__ 표 — 바깥 파일 참조가 남지 않는다', () => {
    const out = inlineSingleHtml(HTML, {
      'assets/index-abc.js': 'console.log("hi")',
      'assets/index-def.css': 'body{color:red}',
      'assets/characters/miner.png': PNG,
      'assets/data/meta.json': '{"a":[1,2]}',
    });
    expect(out).toContain('<style>body{color:red}</style>');
    expect(out).toContain('<script type="module">console.log("hi")</script>');
    expect(out).not.toMatch(/\bsrc=|\bhref="\.\/assets|modulepreload/);
    const assetsAt = out.indexOf('window.__RTD_ASSETS__=');
    expect(assetsAt).toBeGreaterThan(0);
    expect(assetsAt).toBeLessThan(out.indexOf('<script type="module">'));
    const json = /window\.__RTD_ASSETS__=(\{.*?\});<\/script>/.exec(out)?.[1] ?? '';
    const table = JSON.parse(json) as Record<string, unknown>;
    expect(table).toEqual({
      'assets/characters/miner.png': 'data:image/png;base64,iVBORw==',
      'assets/data/meta.json': { a: [1, 2] },
    });
    expect(out.startsWith('<!doctype html>')).toBe(true);
    expect(out).toContain('<title>운빨 디펜스</title>');
  });

  it("JS 안의 '</script'·'<!--'는 이스케이프 (문서가 일찍 끝나지 않게), CSS 안의 '</style'도", () => {
    expect(escapeInlineScript('a="</script>";b="</SCRIPT x"')).toBe('a="<\\/script>";b="<\\/SCRIPT x"');
    expect(escapeInlineScript('s="<!--x"')).toBe('s="\\x3C!--x"');
    expect(escapeInlineStyle('a{content:"</style>"}')).toBe('a{content:"<\\/style>"}');
    const out = inlineSingleHtml(HTML, {
      'assets/index-abc.js': 'const t="</script><b>";',
      'assets/index-def.css': '',
    });
    // 진짜 닫는 태그만 남는다: 열린 스크립트 수 = 닫는 태그 수
    expect((out.match(/<script\b/g) ?? []).length).toBe((out.match(/<\/script>/g) ?? []).length);
    expect(out).toContain('const t="<\\/script><b>";');
  });

  it("JS 안의 '$&' 같은 글자가 바꾸기 패턴으로 해석되지 않는다", () => {
    const out = inlineSingleHtml(HTML, { 'assets/index-abc.js': 'x.replace(/a/g,"$&$1$$")', 'assets/index-def.css': '' });
    expect(out).toContain('x.replace(/a/g,"$&$1$$")');
  });

  it("표 안 글자의 '<'는 \\u003c (표가 스크립트를 끝내지 않게)", () => {
    const tag = assetsScriptTag({ 'assets/x.json': { s: '</script>' } });
    expect(tag).not.toContain('</script>"');
    expect(tag.endsWith('</script>')).toBe(true);
    expect((tag.match(/<\/script>/g) ?? []).length).toBe(1);
  });

  it('파일이 없거나 번들 조각이 여러 개면 알려 준다', () => {
    expect(() => inlineSingleHtml(HTML, { 'assets/index-def.css': '' })).toThrow(/index-abc\.js 파일이 없다/);
    expect(() =>
      inlineSingleHtml(HTML, { 'assets/index-abc.js': '', 'assets/index-def.css': '', 'assets/chunk-2.js': '' }),
    ).toThrow(/chunk-2\.js/);
  });

  it('도우미: 경로 정리·MIME·표 (js·css·assets 밖 파일은 넣지 않음)', () => {
    expect(normalizeRef('./assets/a.js?v=1')).toBe('assets/a.js');
    expect(normalizeRef('/assets/a.js')).toBe('assets/a.js');
    expect(mimeOf('assets/a.webp')).toBe('image/webp');
    expect(mimeOf('assets/a.SVG')).toBe('image/svg+xml');
    expect(mimeOf('assets/a.bin')).toBe('application/octet-stream');
    const t = buildAssetTable({ 'assets/a.js': 'x', 'assets/b.png': PNG, 'sw.js': 'y' }, new Set(['assets/a.js']));
    expect(Object.keys(t)).toEqual(['assets/b.png']);
  });
});
