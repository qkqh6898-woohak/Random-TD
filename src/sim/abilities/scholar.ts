/**
 * 학자 ★ (히어로): 전체 타워 공격력 +20% → +35% (지원 효과 '전체' = 자신 포함, 학자 2개 = +20%만 — GDD 5.6).
 * 각성(판 내 강화 비용 −20%)은 M9.
 */
import { defineAbility } from './types';

export interface ScholarParams {
  atkBp: number;
}

export default defineAbility<ScholarParams>({
  id: 'scholar',
  compile: (r) => ({ atkBp: r.bp('globalAtk') }),
  aura: (p) => ({ area: 'global', atkPctBp: p.atkBp, apsPctBp: 0 }),
});
