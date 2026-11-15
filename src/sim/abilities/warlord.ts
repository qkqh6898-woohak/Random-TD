/**
 * 전쟁 군주 ★ (레전드): 전체 타워 공격속도 +15% → +30% (지원 효과 '전체' = 자신 포함, 비중첩). 공속 한도(×5·15회)는 stats.ts.
 * 각성(보스 단계 공속 +20%)은 M9.
 */
import { NON_NEG } from './params';
import { defineAbility } from './types';

export interface WarlordParams {
  apsBp: number;
}

export default defineAbility<WarlordParams>({
  id: 'warlord',
  compile: (r) => ({ apsBp: r.bp('globalAps', NON_NEG) }),
  aura: (p) => ({ area: 'global', atkPctBp: 0, apsPctBp: p.apsBp }),
});
