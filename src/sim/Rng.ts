/**
 * 시드 난수 (mulberry32) + 흐름 분리.
 *
 * - sim 안의 모든 무작위는 이 클래스를 거친다 (`Math.random` 금지, CLAUDE.md 2장).
 * - 32비트 정수 연산(`Math.imul`, 비트 연산)만 써서 어느 브라우저에서나 같은 수열이 나온다.
 * - `fork(name)`: 이름으로 독립된 흐름을 만든다. 자식 시드는 **부모의 처음 시드 + 이름**으로만 정해지므로
 *   부모를 얼마나 썼는지, 어떤 순서로 fork했는지와 상관없이 같은 흐름이 나온다.
 *   (MULTIPLAYER.md 4.2: 세계 / 플레이어별 소환·승급 / 도박 흐름을 분리해 한 사람의 조작이 다른 흐름을 바꾸지 않게)
 */

import { fnv1a32, type Hashable } from './hash';

const TWO_POW_32 = 4294967296;
const GOLDEN = 0x9e3779b9;

/** murmur3 finalizer: 32비트 값을 고르게 섞는다. */
export function mix32(x: number): number {
  let h = x >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** 부모 시드와 흐름 이름으로 자식 시드를 만든다. */
export function deriveSeed(parentSeed: number, name: string): number {
  return mix32((parentSeed >>> 0) ^ mix32(Math.imul(fnv1a32(name), GOLDEN) >>> 0));
}

export interface RngSnapshot {
  seed: number;
  state: number;
}

export class Rng implements Hashable {
  /** 이 흐름의 처음 시드 (fork의 기준). */
  readonly seed: number;
  private s: number;

  constructor(seed: number) {
    if (!Number.isInteger(seed)) throw new Error(`Rng 시드는 정수여야 한다: ${seed}`);
    this.seed = seed >>> 0;
    this.s = this.seed;
  }

  /** 다음 32비트 부호 없는 정수 [0, 2^32). mulberry32 원본과 같은 수열. */
  nextU32(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /**
   * [0, n) 균등 정수. 나머지 편향을 없애려고 거절 표본(rejection sampling)을 쓴다.
   * n은 1 이상 2^32 이하 정수.
   */
  int(n: number): number {
    if (!Number.isInteger(n) || n < 1 || n > TWO_POW_32) {
      throw new Error(`Rng.int(n): n은 1~2^32 정수여야 한다 (받은 값: ${n})`);
    }
    if (n === 1) return 0;
    const limit = TWO_POW_32 - (TWO_POW_32 % n); // n의 배수 중 2^32 이하 최대값
    let u = this.nextU32();
    while (u >= limit) u = this.nextU32();
    return u % n;
  }

  /** [min, max] 균등 정수 (양 끝 포함). */
  range(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new Error(`Rng.range(min, max): 정수이고 min ≤ max 여야 한다 (${min}, ${max})`);
    }
    return min + this.int(max - min + 1);
  }

  /** bp(1/10000) 확률로 true. 0 이하는 항상 false, 10000 이상은 항상 true (난수는 항상 1개 소비). */
  chanceBp(bp: number): boolean {
    return this.int(10000) < bp;
  }

  /** 배열에서 하나 고르기. 빈 배열이면 에러. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick: 빈 배열');
    return items[this.int(items.length)] as T;
  }

  /** 가중치(정수) 목록에서 인덱스 하나 고르기. */
  weightedIndex(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) {
      if (!Number.isInteger(w) || w < 0) throw new Error(`Rng.weightedIndex: 가중치는 0 이상 정수 (${w})`);
      total += w;
    }
    if (total <= 0) throw new Error('Rng.weightedIndex: 가중치 합이 0');
    let r = this.int(total);
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i] as number;
      if (r < 0) return i;
    }
    return weights.length - 1; // 도달하지 않음
  }

  /** 제자리 섞기 (Fisher–Yates). 같은 배열을 돌려준다. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = items[i] as T;
      items[i] = items[j] as T;
      items[j] = tmp;
    }
    return items;
  }

  /** 이름으로 독립된 하위 흐름. 부모의 사용량·fork 순서와 무관하게 결정된다. */
  fork(name: string): Rng {
    return new Rng(deriveSeed(this.seed, name));
  }

  snapshot(): RngSnapshot {
    return { seed: this.seed, state: this.s };
  }

  static restore(snap: RngSnapshot): Rng {
    const r = new Rng(snap.seed);
    r.s = snap.state >>> 0;
    return r;
  }

  toHashable(): RngSnapshot {
    return this.snapshot();
  }
}
