/**
 * 상인 ★ (레어): 사거리 안에서 처치된 몹 1마리당 +1원 → +5원 (누가 잡아도 — 다른 타워·지속 피해·운석·병사 포함).
 * 처치 지점(몹 위치)이 상인 칸 중심에서 사거리 안(경계 포함)이면 받는다. 상인이 여러 개면 각자 받는다 (상인마다 '1마리당').
 * 대상 우선순위 '최저 체력'은 towers.json target. 각성(보스 처치 +200원)은 M9.
 */
import { dist2 } from '../Fixed';
import { giveGold } from './common';
import { NON_NEG } from './params';
import { defineAbility } from './types';

export interface MerchantParams {
  /** 처치 1마리당 돈 (원) */
  killGold: number;
}

export default defineAbility<MerchantParams>({
  id: 'merchant',
  compile: (r) => ({ killGold: r.int('killGold', NON_NEG) }),
  onAnyKill(env, tower, p, _mob, at) {
    const range = env.ctx.rules.towers.get(tower.tower)?.range ?? 0;
    if (dist2(tower.x, tower.y, at.x, at.y) <= range * range) giveGold(env, tower, p.killGold);
  },
});
