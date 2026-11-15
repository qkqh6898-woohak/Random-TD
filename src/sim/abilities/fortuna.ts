/**
 * 행운의 여신 ★ (레전드): 소환 시 3% → 10% 레어 직행, 승급 시 0.5% → 2% 2등급 상승.
 * - 판 위에 있는 동안 그 주인의 소환·승급에 적용 (Summon.rollSummon ②, Deck.rollMerge ②). 여러 개여도 한 번만 (같은 타워 비중첩).
 * - 2등급 상승: 노말 → 유니크, 레어 → 히어로, 유니크 → 레전드 (덱의 그 등급 5종 균등). 히어로 승급은 레전드가 끝이라 해당 없음.
 * 각성(신 타워 확률 ×2)은 M9.
 */
import { RATIO } from './params';
import { defineAbility } from './types';

export interface FortunaParams {
  rareBp: number;
  doubleBp: number;
}

export default defineAbility<FortunaParams>({
  id: 'fortuna',
  compile: (r) => ({ rareBp: r.bp('rareSummon', RATIO), doubleBp: r.bp('doubleUp', RATIO) }),
  summonRareBp: (p) => p.rareBp,
  mergeDoubleBp: (p) => p.doubleBp,
});
