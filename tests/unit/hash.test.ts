import { describe, expect, it } from 'vitest';
import { HashError, canonicalize, fnv1a32, hashHex, hashValue } from '../../src/sim/hash';

/** 바이트 배열 기준 FNV-1a (비교 기준). */
function referenceFnv(bytes: Uint8Array): number {
  let h = 0x811c9dc5;
  for (const b of bytes) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h >>> 0;
}

describe('FNV-1a 32', () => {
  it('표준 테스트 벡터', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('a')).toBe(0xe40c292c);
    expect(fnv1a32('foobar')).toBe(0xbf9cf968);
  });

  it('한글·이모지는 UTF-8 바이트 기준 (TextEncoder 결과와 같다)', () => {
    for (const text of ['운빨 디펜스', '🎲 주사위', 'abc가나다😀', 'ü€']) {
      expect(fnv1a32(text)).toBe(referenceFnv(new TextEncoder().encode(text)));
    }
  });

  it('hashHex는 8자리', () => {
    expect(hashHex(0x1a)).toBe('0000001a');
    expect(hashHex(0xffffffff)).toBe('ffffffff');
  });
});

describe('canonicalize / hashValue', () => {
  it('객체 키 순서가 달라도 같은 해시', () => {
    const a = { tick: 3, gold: 100, towers: [{ id: 1, hp: 5 }] };
    const b = { towers: [{ hp: 5, id: 1 }], gold: 100, tick: 3 };
    expect(canonicalize(a)).toBe(canonicalize(b));
    expect(hashValue(a)).toBe(hashValue(b));
  });

  it('값이 하나라도 다르면 다른 해시', () => {
    expect(hashValue({ gold: 100 })).not.toBe(hashValue({ gold: 101 }));
    expect(hashValue([1, 2])).not.toBe(hashValue([2, 1])); // 배열 순서는 의미가 있다
  });

  it('Map은 키 순, Set은 값 순으로 직렬화', () => {
    const m1 = new Map<number, string>([
      [2, 'b'],
      [10, 'c'],
      [1, 'a'],
    ]);
    const m2 = new Map<number, string>([
      [10, 'c'],
      [1, 'a'],
      [2, 'b'],
    ]);
    expect(canonicalize(m1)).toBe(canonicalize(m2));
    expect(canonicalize(m1)).toBe('M{"1":"a","2":"b","10":"c"}');
    expect(canonicalize(new Set([3, 1, 2]))).toBe(canonicalize(new Set([2, 3, 1])));
  });

  it('undefined 필드는 빠지고, -0은 0과 같다', () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe(canonicalize({ a: 1 }));
    expect(canonicalize({ v: -0 })).toBe(canonicalize({ v: 0 }));
  });

  it('소수·NaN·Infinity는 경로와 함께 거부 (sim 상태는 정수만)', () => {
    expect(() => canonicalize({ mobs: [{ id: 1, x: 1.5 }] })).toThrow(HashError);
    try {
      canonicalize({ mobs: [{ id: 1, x: 1.5 }] });
    } catch (e) {
      expect((e as HashError).path).toBe('state.mobs[0].x');
    }
    expect(() => canonicalize(Number.NaN)).toThrow(HashError);
    expect(() => canonicalize({ f: () => 1 })).toThrow(HashError);
  });

  it('toHashable을 구현한 객체는 그 결과로 직렬화', () => {
    const obj = { toHashable: () => ({ s: 1 }) };
    expect(canonicalize(obj)).toBe(canonicalize({ s: 1 }));
  });
});
