/**
 * 대장장이 ★ (유니크): 주변 8칸 타워 공격력 +10% → +25% (지원 효과, Aura.ts — 자신 제외, 같은 타워 비중첩).
 * 각성(주변 8칸 공속 +10%)은 M9.
 */
import { AURA_AREAS, defineAbility, type AuraArea } from './types';

export interface BlacksmithParams {
  atkBp: number;
  area: AuraArea;
}

export default defineAbility<BlacksmithParams>({
  id: 'blacksmith',
  compile: (r) => ({ atkBp: r.bp('auraAtk'), area: r.str('aura', AURA_AREAS) }),
  aura: (p) => ({ area: p.area, atkPctBp: p.atkBp, apsPctBp: 0 }),
});
