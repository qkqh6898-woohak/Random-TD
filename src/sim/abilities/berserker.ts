/**
 * 광전사 (유니크, 특색 아님 — 능력 있음): 같은 대상 연속 공격 시 공격속도 증가 (최대 +50%).
 * 같은 몹을 이어서 칠 때마다 +10%(params.rampPerHit)씩, 최대 +50%(params.rampMax). 대상이 바뀌면 0부터.
 * 스택은 타워 엔티티(Tower.stacks)에 있어 승급하면 초기화된다 (GDD 4.4). 공속은 다음 틱부터 반영. 각성(최대 +80%)은 M9.
 */
import { defineAbility } from './types';

export interface BerserkerParams {
  perHitBp: number;
  maxBp: number;
}

/** 최대 스택 수 (+10%씩 최대 +50% → 5) */
export function berserkerMaxStacks(p: BerserkerParams): number {
  return p.perHitBp > 0 ? Math.ceil(p.maxBp / p.perHitBp) : 0;
}

export default defineAbility<BerserkerParams>({
  id: 'berserker',
  compile: (r) => ({ perHitBp: r.bp('rampPerHit'), maxBp: r.bp('rampMax') }),
  onAttack(_env, tower, p, hit, target) {
    if (tower.stackTarget === target.id) {
      const max = berserkerMaxStacks(p);
      if (tower.stacks < max) tower.stacks += 1;
    } else {
      tower.stackTarget = target.id;
      tower.stacks = 0;
    }
    return hit;
  },
  apsBonusBp(tower, p) {
    const v = tower.stacks * p.perHitBp;
    return v > p.maxBp ? p.maxBp : v;
  },
});
