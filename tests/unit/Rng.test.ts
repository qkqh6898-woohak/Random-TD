import { describe, expect, it } from 'vitest';
import { Rng, deriveSeed, mix32 } from '../../src/sim/Rng';

/** 널리 쓰이는 mulberry32 원본 구현 (비교 기준). */
function referenceMulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

function take(r: Rng, n: number): number[] {
  return Array.from({ length: n }, () => r.nextU32());
}

describe('Rng 재현성', () => {
  it('시드 42의 첫 5개 값이 고정되어 있다 (스냅샷)', () => {
    expect(take(new Rng(42), 5)).toEqual([2581720956, 1925393290, 3661312704, 2876485805, 750819978]);
  });

  it('mulberry32 원본 구현과 같은 수열을 낸다', () => {
    for (const seed of [0, 1, 42, 123456789, 0xffffffff, 0x80000000]) {
      const ref = referenceMulberry32(seed);
      const r = new Rng(seed);
      for (let i = 0; i < 1000; i++) expect(r.nextU32()).toBe(ref());
    }
  });

  it('같은 시드는 같은 수열, 다른 시드는 다른 수열', () => {
    expect(take(new Rng(7), 50)).toEqual(take(new Rng(7), 50));
    expect(take(new Rng(7), 50)).not.toEqual(take(new Rng(8), 50));
  });

  it('음수·큰 시드는 32비트로 맞춰진다', () => {
    expect(new Rng(-1).seed).toBe(0xffffffff);
    expect(take(new Rng(-1), 5)).toEqual(take(new Rng(0xffffffff), 5));
  });

  it('정수가 아닌 시드는 거부', () => {
    expect(() => new Rng(1.5)).toThrow();
  });

  it('snapshot/restore 후 같은 수열이 이어진다', () => {
    const a = new Rng(99);
    take(a, 17);
    const b = Rng.restore(a.snapshot());
    expect(take(b, 20)).toEqual(take(a, 20));
    expect(b.seed).toBe(a.seed);
  });
});

describe('Rng 흐름 분리 (fork)', () => {
  it('부모를 얼마나 썼는지와 상관없이 같은 이름의 흐름은 같다', () => {
    const p1 = new Rng(2026);
    const p2 = new Rng(2026);
    take(p2, 1000);
    expect(take(p1.fork('world'), 20)).toEqual(take(p2.fork('world'), 20));
  });

  it('fork 순서와 상관없이 같다', () => {
    const p1 = new Rng(5);
    const a1 = p1.fork('p0.summon');
    p1.fork('world');
    const p2 = new Rng(5);
    p2.fork('world');
    const a2 = p2.fork('p0.summon');
    expect(take(a1, 20)).toEqual(take(a2, 20));
  });

  it('한 흐름을 써도 다른 흐름은 바뀌지 않는다 (독립)', () => {
    const root = new Rng(31337);
    const world = root.fork('world');
    const summon = root.fork('p0.summon');
    const expected = take(new Rng(31337).fork('world'), 30);
    take(summon, 5000); // P1이 소환을 많이 해도
    expect(take(world, 30)).toEqual(expected); // 세계 흐름(몹 등장)은 그대로
  });

  it('이름이 다르면 다른 흐름, 부모 시드가 다르면 다른 흐름', () => {
    const root = new Rng(1);
    expect(take(root.fork('a'), 10)).not.toEqual(take(root.fork('b'), 10));
    expect(take(new Rng(1).fork('a'), 10)).not.toEqual(take(new Rng(2).fork('a'), 10));
    expect(take(root.fork('a'), 10)).not.toEqual(take(new Rng(1), 10));
  });

  it('흐름 사이에 뚜렷한 상관이 없다 (같은 위치 값이 같을 확률 ≈ 0)', () => {
    const a = new Rng(10).fork('x');
    const b = new Rng(10).fork('y');
    let same = 0;
    for (let i = 0; i < 10000; i++) if (a.int(100) === b.int(100)) same++;
    expect(same).toBeGreaterThan(50); // 기대 100
    expect(same).toBeLessThan(160);
  });

  it('deriveSeed/mix32는 32비트 부호 없는 정수', () => {
    for (const name of ['world', '한글 흐름', '']) {
      const v = deriveSeed(123, name);
      expect(Number.isInteger(v) && v >= 0 && v <= 0xffffffff).toBe(true);
    }
    expect(mix32(0)).toBe(0);
    expect(mix32(1)).not.toBe(1);
  });
});

describe('Rng 분포와 도우미', () => {
  it('int(n)은 [0, n) 범위이고 균등하다 (5종 각 20% ±1%)', () => {
    const r = new Rng(77);
    const counts = [0, 0, 0, 0, 0];
    const N = 100000;
    for (let i = 0; i < N; i++) {
      const v = r.int(5);
      counts[v] = (counts[v] ?? 0) + 1;
    }
    for (const c of counts) {
      expect(c / N).toBeGreaterThan(0.19);
      expect(c / N).toBeLessThan(0.21);
    }
  });

  it('int 경계: int(1)=0, int(2^32)은 nextU32와 같고, 잘못된 n은 거부', () => {
    const r = new Rng(3);
    for (let i = 0; i < 100; i++) expect(r.int(1)).toBe(0);
    const a = new Rng(9);
    const b = new Rng(9);
    expect(a.int(4294967296)).toBe(b.nextU32());
    for (const bad of [0, -1, 1.5, 4294967297, Number.NaN]) expect(() => r.int(bad)).toThrow();
  });

  it('큰 n에서도 거절 표본으로 편향이 없다 (n = 3×2^30, 위/아래 절반 비율 ≈ 50%)', () => {
    const r = new Rng(11);
    const n = 3 * 1073741824;
    let low = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const v = r.int(n);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(n);
      if (v < n / 2) low++;
    }
    expect(low / N).toBeGreaterThan(0.48);
    expect(low / N).toBeLessThan(0.52);
  });

  it('range(min, max)는 양 끝을 포함한다', () => {
    const r = new Rng(4);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(r.range(-2, 2));
    expect([...seen].sort((a, b) => a - b)).toEqual([-2, -1, 0, 1, 2]);
    expect(() => r.range(3, 1)).toThrow();
  });

  it('chanceBp: 0은 항상 false, 10000은 항상 true, 2500은 약 25%', () => {
    const r = new Rng(5);
    let hits = 0;
    for (let i = 0; i < 1000; i++) {
      expect(r.chanceBp(0)).toBe(false);
      expect(r.chanceBp(10000)).toBe(true);
    }
    for (let i = 0; i < 40000; i++) if (r.chanceBp(2500)) hits++;
    expect(hits / 40000).toBeGreaterThan(0.24);
    expect(hits / 40000).toBeLessThan(0.26);
  });

  it('pick·shuffle·weightedIndex', () => {
    const r = new Rng(6);
    expect(() => r.pick([])).toThrow();
    const items = ['a', 'b', 'c'];
    for (let i = 0; i < 50; i++) expect(items).toContain(r.pick(items));

    const arr = Array.from({ length: 20 }, (_, i) => i);
    const shuffled = new Rng(8).shuffle([...arr]);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(arr);
    expect(shuffled).not.toEqual(arr);
    expect(new Rng(8).shuffle([...arr])).toEqual(shuffled); // 같은 시드 → 같은 순서

    const w = new Rng(12);
    const counts = [0, 0, 0];
    for (let i = 0; i < 30000; i++) {
      const k = w.weightedIndex([1, 0, 3]);
      counts[k] = (counts[k] ?? 0) + 1;
    }
    expect(counts[1]).toBe(0);
    expect((counts[2] ?? 0) / 30000).toBeGreaterThan(0.73);
    expect((counts[2] ?? 0) / 30000).toBeLessThan(0.77);
    expect(() => w.weightedIndex([0, 0])).toThrow();
    expect(() => w.weightedIndex([1, 0.5])).toThrow();
  });
});
