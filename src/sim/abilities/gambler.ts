/**
 * 도박꾼 ★ (유니크): 판 위에 있는 동안 도박 ×0 확률 −3%p → −10%p (M5 도박이 gambleZeroReduction으로 읽는다).
 * 피해 = 공격력 × 주사위(1~6) ÷ 3.5 — 공격마다 전투 난수 흐름으로 주사위를 굴려 1회 공격(물리·마법)에 × 눈 ÷ 평균(= 2 × 눈 ÷ 7).
 * 'dice' 사건 { tower, value } (화면: 나온 눈 표시). 각성(단계마다 무료 도박)은 M9.
 */
import { STREAM_COMBAT } from '../World';
import { scaleHitFrac } from '../systems/Damage';
import { defineAbility } from './types';

export interface GamblerParams {
  /** 도박 ×0 확률 감소 (bp, 3%p = 300) */
  zeroReductionBp: number;
  /** 주사위 면 수 (6) */
  dice: number;
}

export default defineAbility<GamblerParams>({
  id: 'gambler',
  compile: (r) => {
    const dice = r.int('dice');
    if (dice < 1) throw new Error('towers.json gambler.params.dice: 1 이상');
    return { zeroReductionBp: -r.bp('gambleZero'), dice };
  },
  onAttack(env, tower, p, hit) {
    const value = env.world.rng(STREAM_COMBAT).range(1, p.dice);
    env.world.emit('dice', { tower: tower.id, value, x: tower.x, y: tower.y });
    // × 눈 ÷ 평균((면 + 1) ÷ 2) = × 2·눈 ÷ (면 + 1)
    return scaleHitFrac(hit, 2 * value, p.dice + 1);
  },
  gambleZeroBp: (p) => p.zeroReductionBp,
});
