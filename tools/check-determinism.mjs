#!/usr/bin/env node
/**
 * 결정성 검사: src/sim/ 안에서 금지 API를 쓰면 실패한다 (CLAUDE.md 2장, MULTIPLAYER.md 4.2).
 *
 * 사용법:  node tools/check-determinism.mjs            (src/sim 검사)
 *          node tools/check-determinism.mjs <폴더…>    (지정한 폴더 검사, 테스트용)
 *
 * - 주석과 문자열 안의 글자는 무시한다 (한국어 설명에 'Date'가 들어가도 괜찮음). 템플릿 문자열의 ${…} 안은 코드로 본다.
 * - 위반이 있으면 "파일:줄:열  규칙 — 이유"를 출력하고 종료 코드 1.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 금지 규칙. pattern은 주석·문자열을 지운 코드에 적용한다. */
export const RULES = [
  { id: 'Math.random', pattern: /\bMath\s*\.\s*random\b/g, why: '시드 난수 Rng(src/sim/Rng.ts)를 쓴다' },
  { id: 'Date', pattern: /\bDate\b/g, why: '시계 대신 틱 번호를 쓴다' },
  { id: 'performance', pattern: /\bperformance\b/g, why: '시계 대신 틱 번호를 쓴다' },
  { id: 'Math.pow', pattern: /\bMath\s*\.\s*pow\b/g, why: '미리 계산한 표(src/data/curves.json)나 정수 곱셈을 쓴다' },
  { id: 'Math.exp', pattern: /\bMath\s*\.\s*exp(m1)?\b/g, why: '기기마다 결과가 다를 수 있다. 미리 계산한 표를 쓴다' },
  { id: 'Math.sin/cos/tan', pattern: /\bMath\s*\.\s*(a?sinh?|a?cosh?|a?tanh?|atan2)\b/g, why: '삼각함수는 기기마다 결과가 다를 수 있다. 표나 정수 벡터를 쓴다' },
  { id: 'Math.log', pattern: /\bMath\s*\.\s*log(2|10|1p)?\b/g, why: '로그는 기기마다 결과가 다를 수 있다. 미리 계산한 표를 쓴다' },
  { id: 'Math.sqrt/cbrt/hypot', pattern: /\bMath\s*\.\s*(sqrt|cbrt|hypot)\b/g, why: '거리 비교는 제곱 거리(dist2), 꼭 필요하면 isqrt(Fixed.ts)' },
  { id: 'Math[…]', pattern: /\bMath\s*\[/g, why: '동적 접근으로 금지 API를 우회하지 않는다' },
  { id: '**', pattern: /\*\*/g, why: '거듭제곱 연산자 금지. 정수 곱셈이나 미리 계산한 표를 쓴다' },
  { id: 'window', pattern: /\bwindow\b/g, why: 'sim은 브라우저를 모른다 (view/ui에서 처리)' },
  { id: 'document', pattern: /\bdocument\b/g, why: 'sim은 DOM을 모른다 (view/ui에서 처리)' },
  { id: 'globalThis', pattern: /\bglobalThis\b/g, why: 'sim은 전역 환경에 의존하지 않는다' },
  { id: 'navigator', pattern: /\bnavigator\b/g, why: 'sim은 브라우저를 모른다' },
  { id: 'localStorage', pattern: /\b(localStorage|sessionStorage|indexedDB)\b/g, why: '저장은 src/save에서' },
  { id: 'timer', pattern: /\b(setTimeout|setInterval|requestAnimationFrame|setImmediate)\b/g, why: '시간 흐름은 World.step()(고정 틱)으로만' },
  { id: 'fetch', pattern: /\b(fetch|XMLHttpRequest|WebSocket)\b/g, why: 'sim은 네트워크를 쓰지 않는다 (src/net, src/update)' },
  { id: 'crypto', pattern: /\bcrypto\s*\.\s*(getRandomValues|randomUUID)\b/g, why: '시드 난수 Rng를 쓴다' },
];

/** sim이 import하면 안 되는 대상. */
const FORBIDDEN_IMPORT_DIRS = ['view', 'ui', 'art', 'audio', 'net', 'save', 'update', 'meta', 'main'];
const FORBIDDEN_PACKAGES = ['phaser'];

/**
 * 주석을 공백으로, 문자열 리터럴 내용을 공백으로 바꾼다 (줄 번호·열 위치 유지).
 * 템플릿 문자열의 ${ … } 안은 코드로 남긴다. import 경로 검사를 위해 문자열 원문은 따로 모은다.
 * @param {string} src
 * @returns {{ code: string, strings: { value: string, index: number }[] }}
 */
export function stripCommentsAndStrings(src) {
  const out = src.split('');
  const strings = [];
  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  /** 템플릿 중괄호 깊이 스택: 템플릿 안의 ${ 마다 0부터 센다 */
  const templateStack = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '/' && next === '/') {
      const end = src.indexOf('\n', i);
      const stop = end === -1 ? n : end;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      strings.push({ value: src.slice(i + 1, j), index: i });
      blank(i + 1, j);
      i = j + 1;
      continue;
    }
    if (c === '`' || (c === '}' && templateStack.length > 0 && templateStack[templateStack.length - 1] === 0)) {
      // 템플릿 문자열 시작, 또는 ${ … } 가 끝나고 템플릿 본문으로 돌아옴
      if (c === '}') templateStack.pop();
      let j = i + 1;
      while (j < n) {
        if (src[j] === '\\') {
          j += 2;
          continue;
        }
        if (src[j] === '`') break;
        if (src[j] === '$' && src[j + 1] === '{') break;
        j++;
      }
      blank(i + 1, j);
      if (j < n && src[j] === '$') {
        templateStack.push(0);
        i = j + 2;
      } else {
        i = j + 1;
      }
      continue;
    }
    if (templateStack.length > 0) {
      if (c === '{') templateStack[templateStack.length - 1]++;
      else if (c === '}') templateStack[templateStack.length - 1]--;
    }
    i++;
  }
  return { code: out.join(''), strings };
}

function lineCol(src, index) {
  let line = 1;
  let last = -1;
  for (let k = 0; k < index; k++) {
    if (src.charCodeAt(k) === 10) {
      line++;
      last = k;
    }
  }
  return { line, col: index - last };
}

/**
 * 소스 하나 검사.
 * @param {string} src 파일 내용
 * @param {string} file 표시용 파일 경로
 * @param {string | null} absPath import 경로 해석용 실제 경로 (없으면 import 폴더 검사 생략)
 * @returns {{ file: string, line: number, col: number, rule: string, why: string }[]}
 */
export function scanSource(src, file, absPath = null) {
  const { code, strings } = stripCommentsAndStrings(src);
  const violations = [];
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    let m;
    while ((m = rule.pattern.exec(code)) !== null) {
      const { line, col } = lineCol(src, m.index);
      violations.push({ file, line, col, rule: rule.id, why: rule.why });
    }
  }
  // import / export from / import() 대상 검사
  const importRe = /\b(?:from|import)\s*\(?\s*$/;
  for (const str of strings) {
    const before = code.slice(Math.max(0, str.index - 40), str.index);
    if (!importRe.test(before)) continue;
    const spec = str.value;
    const { line, col } = lineCol(src, str.index);
    if (FORBIDDEN_PACKAGES.some((p) => spec === p || spec.startsWith(`${p}/`))) {
      violations.push({ file, line, col, rule: `import ${spec}`, why: 'sim은 Phaser를 import하지 않는다' });
      continue;
    }
    if (absPath && spec.startsWith('.')) {
      const target = resolve(dirname(absPath), spec);
      const srcDir = join(ROOT, 'src');
      const rel = relative(srcDir, target);
      if (!rel.startsWith('..')) {
        const top = rel.split(sep)[0].replace(/\.(ts|js|mjs)$/, '');
        if (FORBIDDEN_IMPORT_DIRS.includes(top)) {
          violations.push({ file, line, col, rule: `import ${spec}`, why: `sim은 src/${top}를 import하지 않는다 (화면 → sim 한 방향)` });
        }
      }
    }
  }
  violations.sort((a, b) => a.line - b.line || a.col - b.col);
  return violations;
}

function listFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...listFiles(p));
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(p);
  }
  return out.sort();
}

/**
 * 폴더 검사.
 * @param {string[]} dirs
 */
export function scanDirs(dirs) {
  const files = dirs.flatMap((d) => listFiles(d));
  const violations = files.flatMap((f) => scanSource(readFileSync(f, 'utf8'), relative(ROOT, f) || f, f));
  return { files, violations };
}

function main(argv) {
  const dirs = argv.length > 0 ? argv.map((d) => resolve(d)) : [join(ROOT, 'src', 'sim')];
  const { files, violations } = scanDirs(dirs);
  if (violations.length > 0) {
    console.error(`❌ 결정성 검사 실패: ${violations.length}건`);
    for (const v of violations) console.error(`  ${v.file}:${v.line}:${v.col}  ${v.rule} — ${v.why}`);
    return 1;
  }
  console.log(`✅ 결정성 검사 통과: ${files.length}개 파일 (${dirs.map((d) => relative(ROOT, d) || d).join(', ')})`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
