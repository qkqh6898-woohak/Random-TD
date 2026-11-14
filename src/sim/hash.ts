/**
 * 상태 해시 (FNV-1a 32비트).
 *
 * - `fnv1a32(text)`: 문자열을 UTF-8 바이트로 보고 FNV-1a 해시. 표준 테스트 벡터와 일치한다.
 * - `canonicalize(value)`: 객체를 결정적인 문자열로 직렬화한다.
 *   객체 키는 정렬, Map은 키 순, Set은 값 순, 엔티티 배열은 호출하는 쪽에서 ID 순으로 넘긴다.
 *   sim 상태는 정수만 써야 하므로 정수가 아닌 숫자(소수·NaN·Infinity)를 만나면 경로와 함께 에러를 낸다.
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

function compareKeys(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
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
    const keys = [...obj.keys()] as (string | number)[];
    for (const k of keys) {
      if (typeof k !== 'string' && typeof k !== 'number') {
        throw new HashError(path, 'Map 키는 문자열이나 정수만 쓴다');
      }
    }
    keys.sort(compareKeys);
    out.push('M{');
    keys.forEach((k, i) => {
      if (i > 0) out.push(',');
      out.push(JSON.stringify(String(k)), ':');
      write(obj.get(k), `${path}.${String(k)}`, out);
    });
    out.push('}');
    return;
  }
  if (obj instanceof Set) {
    const vals = [...obj.values()] as (string | number)[];
    vals.sort(compareKeys);
    out.push('S');
    write(vals, path, out);
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
