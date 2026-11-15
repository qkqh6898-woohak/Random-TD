/**
 * 한 파일 테스트 빌드 (T-1): `npm run build:single`
 *
 * 1) `VITE_TEST_BUILD=1`로 vite build → `dist-single/` (base './'). 테스트 빌드는 개발자 빌드다 (src/devMode.ts:
 *    ⏭ 즉시 다음 단계·💰+·×16 배속이 주소 옵션 없이 보인다).
 * 2) `dist-single/index.html`을 한 파일로: CSS는 `<style>`, JS 번들은 `<script type="module">` 안에 그대로 넣고('</script' 등은 이스케이프),
 *    그 앞에 `<script>window.__RTD_ASSETS__={...}</script>` — `dist-single/assets/**`의 나머지 파일(그림·JSON, public/assets에서 온 것)을
 *    상대 경로 키('assets/characters/miner.webp')로: 그림 등은 base64 data URI, .json은 읽은 객체 그대로. (src/assets.ts가 이 표를 먼저 본다)
 * 3) `release/운빨디펜스-test.html`에 쓰고 크기를 출력한다. 서버 없이 file://로 열린다.
 *
 * HTML 바꾸기는 순수 함수(inlineSingleHtml: html + 파일 표 → html)라 단위 테스트한다 (tests/unit/build-single.test.ts).
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_DIR = 'dist-single';
export const RELEASE_FILE = join('release', '운빨디펜스-test.html');

const MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
  txt: 'text/plain',
  css: 'text/css',
  js: 'text/javascript',
  html: 'text/html',
  webmanifest: 'application/manifest+json',
};

/** 확장자 → MIME (모르면 application/octet-stream). */
export function mimeOf(path) {
  const m = /\.([a-z0-9]+)$/i.exec(path);
  return (m && MIME[m[1].toLowerCase()]) || 'application/octet-stream';
}

/** 문자열이면 UTF-8 바이트로. */
function toBytes(content) {
  return typeof content === 'string' ? Buffer.from(content, 'utf8') : Buffer.from(content);
}

/** 문자열로 (바이트면 UTF-8로 읽음). */
function toText(content) {
  return typeof content === 'string' ? content : Buffer.from(content).toString('utf8');
}

/**
 * `<script>` 안에 넣을 JS: HTML 파서가 스크립트를 일찍 끝내거나 이스케이프 상태로 들어가지 않게
 * '</script' → '<\/script', '<!--' → '\x3C!--' (문자열·정규식 안에서 뜻이 같다).
 */
export function escapeInlineScript(js) {
  return js.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '\\x3C!--');
}

/** `<style>` 안에 넣을 CSS: '</style' → '<\/style' (CSS에서 '\/'는 '/'). */
export function escapeInlineStyle(css) {
  return css.replace(/<\/(style)/gi, '<\\/$1');
}

/** href·src → 파일 표 키 ('./assets/a.js' · '/assets/a.js' · 'assets/a.js' → 'assets/a.js'). */
export function normalizeRef(ref) {
  return ref.replace(/^\.\//, '').replace(/^\/+/, '').split('?')[0].split('#')[0];
}

/** 파일 표에서 assets/ 아래 나머지 파일 → __RTD_ASSETS__ 표 (.json은 객체, 나머지는 data URI). 키 순서는 정렬. */
export function buildAssetTable(files, exclude = new Set()) {
  const table = {};
  for (const key of Object.keys(files).sort()) {
    if (!key.startsWith('assets/') || exclude.has(key)) continue;
    const content = files[key];
    if (/\.json$/i.test(key)) table[key] = JSON.parse(toText(content));
    else table[key] = `data:${mimeOf(key)};base64,${toBytes(content).toString('base64')}`;
  }
  return table;
}

/** 표 → `<script>window.__RTD_ASSETS__=…</script>` ('<'는 <로 — 표 안 글자가 태그를 끝내지 않게). */
export function assetsScriptTag(table) {
  const json = JSON.stringify(table).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `<script>window.__RTD_ASSETS__=${json};</script>`;
}

/**
 * vite가 만든 index.html + 결과 파일 표 → 한 파일 HTML (순수 함수).
 * @param {string} html dist-single/index.html
 * @param {Record<string, string | Uint8Array>} files dist-single 기준 상대 경로 → 내용 ('assets/index-abc.js' 등)
 * @returns {string}
 */
export function inlineSingleHtml(html, files) {
  const used = new Set();
  const read = (ref) => {
    const key = normalizeRef(ref);
    if (!(key in files)) throw new Error(`한 파일 빌드: ${ref} 파일이 없다`);
    used.add(key);
    return toText(files[key]);
  };
  let out = html;
  // modulepreload는 필요 없다 (번들이 하나)
  out = out.replace(/[ \t]*<link\b[^>]*\brel=["']?modulepreload["']?[^>]*>\s*\n?/gi, '');
  // CSS
  out = out.replace(/<link\b[^>]*\brel=["']?stylesheet["']?[^>]*>/gi, (tag) => {
    const href = /\bhref=["']([^"']+)["']/i.exec(tag);
    if (!href) return tag;
    return `<style>${escapeInlineStyle(read(href[1]))}</style>`;
  });
  // JS (모듈 스크립트 하나) + 그 앞에 그림·JSON 표
  const scripts = [];
  out = out.replace(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (tag, a, src, b) => {
    const attrs = `${a} ${b}`;
    if (!/\btype=["']?module["']?/i.test(attrs)) throw new Error(`한 파일 빌드: 모듈이 아닌 외부 스크립트 ${src}`);
    const marker = `\u0000RTD_SCRIPT_${scripts.length}\u0000`;
    scripts.push(read(src));
    return marker;
  });
  if (scripts.length !== 1) throw new Error(`한 파일 빌드: 모듈 스크립트가 ${scripts.length}개 (1개여야 한다 — 코드 나누기를 끄거나 동적 import를 없앨 것)`);
  const extraJs = Object.keys(files).filter((k) => k.startsWith('assets/') && /\.(m?js|css)$/i.test(k) && !used.has(k));
  if (extraJs.length > 0) throw new Error(`한 파일 빌드: index.html이 부르지 않는 번들 조각 ${extraJs.join(', ')}`);
  const table = buildAssetTable(files, used);
  scripts.forEach((js, i) => {
    const tag = `${assetsScriptTag(table)}\n    <script type="module">${escapeInlineScript(js)}</script>`;
    out = out.replace(`\u0000RTD_SCRIPT_${i}\u0000`, () => tag);
  });
  return out;
}

/** 폴더 아래 모든 파일 → { 상대 경로(/ 구분): Buffer }. */
export function readTree(dir) {
  const out = {};
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out[relative(dir, p).split(sep).join('/')] = readFileSync(p);
    }
  };
  walk(dir);
  return out;
}

/** 크기 글자 (KB·MB). */
function fmtSize(bytes) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
}

async function main() {
  const { build } = await import('vite');
  const outDir = join(ROOT, OUT_DIR);
  // 테스트(개발자) 빌드 표시: 환경 변수 + define 둘 다 (vite가 VITE_ 환경 변수를 import.meta.env로 넘긴다)
  process.env.VITE_TEST_BUILD = '1';
  await build({
    root: ROOT,
    configFile: join(ROOT, 'vite.config.ts'),
    base: './',
    logLevel: 'warn',
    define: { 'import.meta.env.VITE_TEST_BUILD': JSON.stringify('1') },
    build: { outDir, emptyOutDir: true, modulePreload: false, cssCodeSplit: false, rollupOptions: { output: { inlineDynamicImports: true } } },
  });
  const files = readTree(outDir);
  // SINGLE_SKIP=assets/backgrounds,assets/cutins → 그 폴더 파일은 한 파일에 넣지 않는다 (아직 쓰지 않는 그림으로 파일이 커지지 않게)
  const skip = (process.env.SINGLE_SKIP ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  for (const k of Object.keys(files)) if (skip.some((p) => k.startsWith(p.endsWith('/') ? p : `${p}/`))) delete files[k];
  const html = toText(files['index.html']);
  delete files['index.html'];
  const single = inlineSingleHtml(html, files);
  const target = join(ROOT, process.env.SINGLE_OUT || RELEASE_FILE);
  rmSync(target, { force: true });
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, single);
  const assets = Object.keys(buildAssetTable(files, new Set(Object.keys(files).filter((k) => /\.(m?js|css)$/i.test(k))))).length;
  console.log(`한 파일 빌드: ${relative(ROOT, target)} — ${fmtSize(Buffer.byteLength(single))} (그림·JSON ${assets}개 포함)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
