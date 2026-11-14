import { describe, expect, it } from 'vitest';
import { BP_ONE, TILE, addBp, bp, clamp, dist2, idiv, isqrt, mulBp, mulDiv, pct, tiles, withinRange } from '../../src/sim/Fixed';

describe('Fixed 상수와 변환', () => {
  it('1칸 = 1000, 100% = 10000bp', () => {
    expect(TILE).toBe(1000);
    expect(BP_ONE).toBe(10000);
  });

  it('bp(): 소수 비율 → bp, 부동소수 오차는 반올림으로 흡수', () => {
    expect(bp(0.25)).toBe(2500);
    expect(bp(0.29)).toBe(2900); // 0.29*10000 = 2899.9999999999995
    expect(bp(0.015)).toBe(150);
    expect(bp(1)).toBe(10000);
    expect(bp(0)).toBe(0);
    expect(bp(-0.3)).toBe(-3000);
    expect(() => bp(Number.NaN)).toThrow();
  });

  it('pct(): 퍼센트 → bp', () => {
    expect(pct(25)).toBe(2500);
    expect(pct(0.5)).toBe(50);
    expect(pct(100)).toBe(10000);
  });

  it('tiles(): 칸 소수 → 정수 단위', () => {
    expect(tiles(1.5)).toBe(1500);
    expect(tiles(2.4)).toBe(2400);
    expect(tiles(0.1)).toBe(100);
    expect(tiles(12)).toBe(12000);
  });
});

describe('mulBp (곱한 뒤 내림)', () => {
  it('기본 값', () => {
    expect(mulBp(100, 2500)).toBe(25);
    expect(mulBp(100, 10000)).toBe(100);
    expect(mulBp(100, 0)).toBe(0);
    expect(mulBp(0, 9999)).toBe(0);
  });

  it('소수 부분은 내림 (반올림 아님)', () => {
    expect(mulBp(1, 9999)).toBe(0);
    expect(mulBp(3, 3333)).toBe(0); // 0.9999
    expect(mulBp(7, 15000)).toBe(10); // 10.5
    expect(mulBp(199, 5000)).toBe(99); // 99.5
    expect(mulBp(66, 15000)).toBe(99);
  });

  it('음수는 -∞ 방향으로 내림', () => {
    expect(mulBp(-7, 15000)).toBe(-11); // -10.5
    expect(mulBp(7, -15000)).toBe(-11);
    expect(mulBp(-100, 2500)).toBe(-25);
  });

  it('큰 값도 정확하다 (2^53 근처, 단순 곱셈이면 오차가 나는 경우)', () => {
    const big = 9007199254740000; // < 2^53
    expect(mulBp(big, 10000)).toBe(big);
    expect(mulBp(big, 5000)).toBe(4503599627370000);
    expect(mulBp(123456789012345, 3333)).toBe(41148147777814); // BigInt로 계산한 정답 = 41148147777814 (내림)
    expect(() => mulBp(big, 20000)).toThrow(RangeError);
  });

  it('정수가 아닌 입력은 거부', () => {
    expect(() => mulBp(1.5, 100)).toThrow(RangeError);
    expect(() => mulBp(100, 2.5)).toThrow(RangeError);
  });

  it('addBp: +25% / -30%', () => {
    expect(addBp(200, 2500)).toBe(250);
    expect(addBp(10, -3000)).toBe(7);
    expect(addBp(3, 5000)).toBe(4); // 4.5 → 4
  });
});

describe('정수 나눗셈·곱나눗셈', () => {
  it('idiv는 내림, 0으로 나누면 에러', () => {
    expect(idiv(7, 2)).toBe(3);
    expect(idiv(-7, 2)).toBe(-4);
    expect(idiv(6, 3)).toBe(2);
    expect(() => idiv(1, 0)).toThrow(RangeError);
  });

  it('mulDiv(a,b,c) = ⌊a×b/c⌋, 중간값이 넘치면 에러', () => {
    expect(mulDiv(10, 3, 4)).toBe(7);
    expect(mulDiv(1000, 1500, 1000)).toBe(1500);
    expect(() => mulDiv(2 ** 30, 2 ** 30, 1)).toThrow(RangeError);
  });
});

describe('거리', () => {
  it('dist2: 제곱 거리, 대칭', () => {
    expect(dist2(0, 0, 3000, 4000)).toBe(25000000);
    expect(dist2(3000, 4000, 0, 0)).toBe(25000000);
    expect(dist2(1500, -500, 1500, -500)).toBe(0);
  });

  it('withinRange: 사거리 경계 포함', () => {
    const r = 2500; // 2.5칸
    expect(withinRange(dist2(0, 0, 2500, 0), r)).toBe(true); // 정확히 경계
    expect(withinRange(dist2(0, 0, 2501, 0), r)).toBe(false);
    expect(withinRange(dist2(0, 0, 1500, 2000), r)).toBe(true); // 3-4-5 → 2500
    expect(withinRange(dist2(0, 0, 1500, 2001), r)).toBe(false);
  });

  it('isqrt: 0~20000 전수 검사', () => {
    for (let n = 0; n <= 20000; n++) {
      const r = isqrt(n);
      expect(r * r <= n && (r + 1) * (r + 1) > n).toBe(true);
    }
  });

  it('isqrt: 큰 값', () => {
    expect(isqrt(4503599627370496)).toBe(67108864); // 2^52 → 2^26
    expect(isqrt(Number.MAX_SAFE_INTEGER)).toBe(94906265);
    expect(isqrt(25000000)).toBe(5000);
    expect(isqrt(24999999)).toBe(4999);
    expect(() => isqrt(-1)).toThrow(RangeError);
    expect(() => isqrt(2.5)).toThrow(RangeError);
  });

  it('clamp', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
});
