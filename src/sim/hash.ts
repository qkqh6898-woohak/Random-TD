/**
 * 상태 해시 (FNV-1a 32비트).
 *
 * - `fnv1a32(text)`: 문자열을 UTF-8 바이트로 보고 FNV-1a 해시. 표준 테스트 벡터와 일치한다.
 * - `canonicalize(value)`: 객체를 결정적인 문자열로 직렬화한다.
 *   객체 키는 정렬, Map은 키 순, Set은 값 순, 엔티티 배열은 호출하는 쪽에서 ID 순으로 넘긴다.
 *   sim 상태는 정수만 써야 하므로 정수가 아닌 숫자(소수·NaN·Infinity)를 만나면 경로와 함께 에러를 낸다.
 *   Map 키와 Set 값은 **모두 안전한 정수이거나 모두 문자열**이어야 한다 (객체·섞인 타입은 넣은 순서가 새므로 거부).
 *   정수 키는 따옴표 없이(`M{1:…}`), 문자열 키는 따옴표와 함께(`M{"1":…}`) 써서 서로 구분한다.
 * - `hashValue(value)`: canonicalize + fnv1a32.
 *
 * 멀티(MULTIPLAYER.md 4.3)에서 1초마다 이 해시를 주고받아 디싱크를 찾는다.
 */

export const FNV_OFFSET_BASIS = 0x811c9dc5;
export const FNV_PRIME = 0x01000193;

function fnvByte(h: number, byte: number): number {
  return Math.imul(h ^ byte, FNV_PRIME) >>> 0;
}

/** 문자열의 UTF-8 바이트에 대한 FNV-1a 32비트 해시 (부호 없는 정수). */
export function fnv1a32(text: string, basis: number = FNV_OFFSET_BASIS): number {
  let h = basis >>> 0;
  const len = text.length;
  for (let i = 0; i < len; i++) {
    let code = text.charCodeAt(i);
    if (code < 0x80) {
      h = fnvByte(h, code);
      continue;
    }
    if (code < 0x800) {
      h = fnvByte(h, 0xc0 | (code >> 6));
      h = fnvByte(h, 0x80 | (code & 0x3f));
      continue;
    }
    // 서로게이트 쌍 → 4바이트 UTF-8
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < len) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
        i++;
        h = fnvByte(h, 0xf0 | (code >> 18));
        h = fnvByte(h, 0x80 | ((code >> 12) & 0x3f));
        h = fnvByte(h, 0x80 | ((code >> 6) & 0x3f));
        h = fnvByte(h, 0x80 | (code & 0x3f));
        continue;
      }
    }
    // 나머지 BMP 글자(한글 포함)와 짝 없는 서로게이트 → 3바이트
    h = fnvByte(h, 0xe0 | (code >> 12));
    h = fnvByte(h, 0x80 | ((code >> 6) & 0x3f));
    h = fnvByte(h, 0x80 | (code & 0x3f));
  }
  return h >>> 0;
}

/** 해시를 8자리 16진수 문자열로 (로그·리플레이 파일용). */
export function hashHex(h: number): string {
  return (h >>> 0).toString(16).padStart(8, '0');
}

export class HashError extends Error {
  readonly path: string;
  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'HashError';
    this.path = path;
  }
}

/** 직렬화 방식을 직접 정하고 싶은 객체(예: Rng)는 이 메서드를 구현한다. */
export interface Hashable {
  toHashable(): unknown;
}

function isHashable(v: object): v is Hashable {
  return typeof (v as Partial<Hashable>).toHashable === 'function';
}

/** 문자열 비교 (UTF-16 코드 단위 순, 로케일 무관). */
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function describeValue(v: unknown): string {
  if (typeof v === 'number') return `숫자 ${String(v)}`;
  if (typeof v === 'string') return `문자열 ${JSON.stringify(v)}`;
  if (v === null) return 'null';
  if (Array.isArray(v)) return '배열';
  return typeof v;
}

/**
 * Map 키·Set 값 정렬. 모두 안전한 정수(숫자 순)이거나 모두 문자열(코드 단위 순)이어야 한다.
 * 그 밖의 값(객체·소수·섞인 타입)은 정렬 순서가 정해지지 않아 넣은 순서가 해시에 새므로 거부한다.
 */
function sortedKeys(values: unknown[], path: string, what: 'Map 키' | 'Set 값'): { kind: 'int' | 'string'; keys: (number | string)[] } {
  const topic = what === 'Map 키' ? 'Map 키는' : 'Set 값은';
  let kind: 'int' | 'string' | null = null;
  for (const v of values) {
    let k: 'int' | 'string';
    if (typeof v === 'string') k = 'string';
    else if (typeof v === 'number' && Number.isSafeInteger(v)) k = 'int';
    else throw new HashError(path, `${topic} 안전한 정수나 문자열만 쓴다 (받은 값: ${describeValue(v)})`);
    if (kind === null) kind = k;
    else if (kind !== k) throw new HashError(path, `${what}에 정수와 문자열을 섞어 쓰지 않는다`);
  }
  if (kind === 'int') return { kind, keys: (values as number[]).sort((a, b) => a - b) };
  return { kind: 'string', keys: (values as string[]).sort(compareStrings) };
}

function write(value: unknown, path: string, out: string[]): void {
  if (value === null || value === undefined) {
    out.push('null');
    return;
  }
  switch (typeof value) {
    case 'boolean':
      out.push(value ? 'true' : 'false');
      return;
    case 'number':
      if (!Number.isSafeInteger(value)) {
        throw new HashError(path, `sim 상태에는 안전한 정수만 넣는다 (받은 값: ${String(value)})`);
      }
      out.push(String(value)); // -0 도 "0"
      return;
    case 'string':
      out.push(JSON.stringify(value));
      return;
    case 'bigint':
      out.push(`${value.toString()}n`);
      return;
    case 'object':
      break;
    default:
      throw new HashError(path, `해시할 수 없는 값 (${typeof value})`);
  }

  const obj = value as object;
  if (isHashable(obj)) {
    write(obj.toHashable(), path, out);
    return;
  }
  if (Array.isArray(obj)) {
    out.push('[');
    for (let i = 0; i < obj.length; i++) {
      if (i > 0) out.push(',');
      write(obj[i], `${path}[${i}]`, out);
    }
    out.push(']');
    return;
  }
  if (obj instanceof Map) {
    const { keys } = sortedKeys([...obj.keys()], path, 'Map 키');
    out.push('M{');
    keys.forEach((k, i) => {
      if (i > 0) out.push(',');
      // 정수 키는 따옴표 없이, 문자열 키는 JSON 문자열로 → 1 과 "1" 이 서로 다르게 직렬화된다
      out.push(typeof k === 'number' ? String(k) : JSON.stringify(k), ':');
      write(obj.get(k), `${path}.${String(k)}`, out);
    });
    out.push('}');
    return;
  }
  if (obj instanceof Set) {
    const { keys } = sortedKeys([...obj.values()], path, 'Set 값');
    out.push('S');
    write(keys, path, out);
    return;
  }
  const record = obj as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((k) => record[k] !== undefined)
    .sort();
  out.push('{');
  keys.forEach((k, i) => {
    if (i > 0) out.push(',');
    out.push(JSON.stringify(k), ':');
    write(record[k], path ? `${path}.${k}` : k, out);
  });
  out.push('}');
}

/** 결정적인 직렬화 문자열. 같은 내용이면 키 삽입 순서와 상관없이 같은 문자열이 나온다. */
export function canonicalize(value: unknown, rootPath = 'state'): string {
  const out: string[] = [];
  write(value, rootPath, out);
  return out.join('');
}

/** canonicalize한 뒤 FNV-1a 32비트 해시. */
export function hashValue(value: unknown): number {
  return fnv1a32(canonicalize(value));
}
