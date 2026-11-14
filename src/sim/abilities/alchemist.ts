/**
 * 연금술사 ★ (히어로): 10초마다 +20원 → +80원, 맞은 몹 방어력·마법 저항 −15% (3초).
 * - 돈은 놓인 뒤 10초마다 (몹이 없어도). 방어 감소는 표식(가장 강한 것만, 관통 합에 더해짐 — 최대 90%), 출처 'alchemist'.
 * 각성(승급할 때마다 +100원)은 M9.
 */
import { applyMark } from '../systems/Status';
import { giveGold, restartTimer, timerReady } from './common';
import { defineAbility } from './types';

export interface AlchemistParams {
  gold: number;
  cdTicks: number;
  shredBp: number;
  shredTicks: number;
}

export default defineAbility<AlchemistParams>({
  id: 'alchemist',
  compile: (r) => ({ gold: r.int('gold'), cdTicks: r.ticks('cd'), shredBp: r.bp('shred'), shredTicks: r.ticks('shredDur') }),
  tick(env, tower, p) {
    if (!timerReady(tower, env.world.tick, p.cdTicks)) return;
    giveGold(env, tower, p.gold);
    restartTimer(tower, env.world.tick, p.cdTicks);
  },
  onHit(env, mob, p) {
    applyMark(env.ctx.rules.status, mob, env.world.tick, 'alchemist', p.shredBp, p.shredTicks);
  },
});
