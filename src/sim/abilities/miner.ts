/**
 * 광부 ★ (노말, TOWERS.md 1장): 공격할 때마다 1% → 20% 확률로 +5원.
 * 공격 1회마다 전투 난수 흐름으로 한 번 굴린다 (확률 0이면 난수를 쓰지 않는다). 각성(+10원)은 M9.
 */
import { STREAM_COMBAT } from '../World';
import { rollChanceBp } from '../systems/Damage';
import { giveGold } from './common';
import { NON_NEG, RATIO } from './params';
import { defineAbility } from './types';

export interface MinerParams {
  /** 공격마다 돈 확률 (bp) */
  chanceBp: number;
  /** 한 번에 받는 돈 (원) */
  gold: number;
}

export default defineAbility<MinerParams>({
  id: 'miner',
  compile: (r) => ({ chanceBp: r.bp('goldChance', RATIO), gold: r.int('gold', NON_NEG) }),
  onAttack(env, tower, p, hit) {
    if (rollChanceBp(env.world.rng(STREAM_COMBAT), p.chanceBp)) giveGold(env, tower, p.gold);
    return hit;
  },
});
