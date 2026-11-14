#!/usr/bin/env node
/**
 * 결정성 검사: src/sim/ 안에서 금지 API를 쓰면 실패한다 (CLAUDE.md 2장, MULTIPLAYER.md 4.2).
 *
 * 사용법:  node tools/check-determinism.mjs            (src/sim 검사)
 *          node tools/check-determinism.mjs <폴더…>    (지정한 폴더 검사, 테스트용)
 *
 * - 주석·문자열·정규식 리터럴 안의 글자는 무시한다 (한국어 설명에 'Date'가 들어가도 괜찮음). 템플릿 문자열의 ${…} 안은 코드로 본다.
 * - 위반이 있으면 "파일:줄:열  규칙 — 이유"를 출력하고 종료 코드 1.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * sim에서 직접 불러도 되는 Math 함수 (정수 연산·정확한 반올림만, 모든 기기에서 같은 결과).
 * 이 목록 밖의 `Math` 사용(별칭 `const M = Math`, 구조 분해 `const { pow } = Math`, `Math?.x`, 다른 함수·상수)은 모두 위반이다.
 */
export const ALLOWED_MATH = ['floor', 'ceil', 'round', 'trunc', 'imul', 'min', 'max', 'abs', 'sign', 'clz32', 'fround'];

/** 아래 규칙이 이름을 붙여 따로 잡는 Math 함수 (같은 곳을 두 번 보고하지 않게 일반 규칙에서 뺀다). */
const NAMED_MATH = String.raw`random|pow|expm1|exp|a?sinh?|a?cosh?|a?tanh?|atan2|log2|log10|log1p|log|sqrt|cbrt|hypot`;
/** `Math.` 또는 `Math?.` (사이 공백 허용) */
const MATH_DOT = String.raw`\bMath\s*\??\.\s*`;
const mathRule = (names) => new RegExp(`${MATH_DOT}(?:${names})\\b`, 'g');

/** 금지 규칙. pattern은 주석·문자열을 지운 코드에 적용한다. */
export const RULES = [
  { id: 'Math.random', pattern: mathRule('random'), why: '시드 난수 Rng(src/sim/Rng.ts)를 쓴다' },
  { id: 'Date', pattern: /\bDate\b/g, why: '시계 대신 틱 번호를 쓴다' },
  { id: 'performance', pattern: /\bperformance\b/g, why: '시계 대신 틱 번호를 쓴다' },
  { id: 'Math.pow', pattern: mathRule('pow'), why: '미리 계산한 표(src/data/curves.json)나 정수 곱셈을 쓴다' },
  { id: 'Math.exp', pattern: mathRule('expm1|exp'), why: '기기마다 결과가 다를 수 있다. 미리 계산한 표를 쓴다' },
  { id: 'Math.sin/cos/tan', pattern: mathRule('a?sinh?|a?cosh?|a?tanh?|atan2'), why: '삼각함수는 기기마다 결과가 다를 수 있다. 표나 정수 벡터를 쓴다' },
  { id: 'Math.log', pattern: mathRule('log2|log10|log1p|log'), why: '로그는 기기마다 결과가 다를 수 있다. 미리 계산한 표를 쓴다' },
  { id: 'Math.sqrt/cbrt/hypot', pattern: mathRule('sqrt|cbrt|hypot'), why: '거리 비교는 제곱 거리(dist2), 꼭 필요하면 isqrt(Fixed.ts)' },
  { id: 'Math[…]', pattern: /\bMath\s*(?:\?\.)?\s*\[/g, why: '동적 접근으로 금지 API를 우회하지 않는다' },
  {
    id: 'Math (허용 목록 밖)',
    pattern: new RegExp(
      String.raw`\bMath\b(?!\s*\??\.\s*(?:${ALLOWED_MATH.join('|')}|${NAMED_MATH})\b)(?!\s*(?:\?\.)?\s*\[)`,
      'g',
    ),
    why: `Math는 ${ALLOWED_MATH.join('·')}만 Math.이름(…) 꼴로 직접 부른다 (별칭·구조 분해·다른 함수 금지)`,
  },
  { id: '**', pattern: /\*\*/g, why: '거듭제곱 연산자 금지. 정수 곱셈이나 미리 계산한 표를 쓴다' },
  { id: 'eval/Function', pattern: /\b(eval|Function)\b/g, why: '문자열을 코드로 실행하면 검사를 우회한다' },
  { id: 'Reflect', pattern: /\bReflect\b/g, why: '동적 접근으로 금지 API를 우회하지 않는다' },
  { id: 'import()', pattern: /\bimport\s*\(/g, why: '동적 import는 대상을 검사할 수 없다. 정적 import만 쓴다' },
  { id: 'locale', pattern: /\b(localeCompare|toLocale\w*|Intl)\b/g, why: '로케일·기기 설정에 따라 결과가 달라진다. 정렬은 < 비교나 숫자 비교를 쓴다' },
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
    if (c === '/' && isRegexStart(out, i)) {
      // 정규식 리터럴: /…/flags — 안의 글자(따옴표·Date 등)는 코드가 아니다
      let j = i + 1;
      let inClass = false;
      while (j < n && src[j] !== '\n') {
        const ch = src[j];
        if (ch === '\\') {
          j += 2;
          continue;
        }
        if (ch === '[') inClass = true;
        else if (ch === ']') inClass = false;
        else if (ch === '/' && !inClass) break;
        j++;
      }
      if (j < n && src[j] === '/') {
        blank(i + 1, j);
        i = j + 1;
        continue;
      }
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

const REGEX_PREV_CHARS = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);
const REGEX_PREV_WORDS = /\b(return|typeof|case|do|else|in|of|new|delete|void|throw|yield|await)\s*$/;

/** i 위치의 '/'가 나눗셈이 아니라 정규식 시작인가 (앞의 코드 글자로 판단). */
function isRegexStart(out, i) {
  const next = out[i + 1];
  if (next === '/' || next === '*') return false;
  let k = i - 1;
  while (k >= 0 && /\s/.test(out[k])) k--;
  if (k < 0) return true;
  // 후위 증감 `i++ / 2`, `i-- / 2` 뒤의 '/'는 나눗셈이다 (정규식으로 오인하면 그 사이 코드가 검사에서 빠진다)
  if ((out[k] === '+' || out[k] === '-') && out[k - 1] === out[k]) return false;
  if (REGEX_PREV_CHARS.has(out[k])) return true;
  const tail = out.slice(Math.max(0, k - 10), k + 1).join('');
  return REGEX_PREV_WORDS.test(tail);
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
