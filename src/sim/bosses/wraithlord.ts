/**
 * 망령 군주 (그림자 군단 대장, ENEMIES.md 4장): 항상 투명 — 감지 범위 안에서만 피해를 받음.
 * 12초마다 주변 몹 체력 10% 회복 + 투명 유령 3마리 소환.
 * - 투명은 데이터(invisible: true). 드러나지 않으면 대상·광역·상태 이상·지속 피해 모두 무효 (Detection·Combat) → 감지 없이는 못 잡는다.
 * - '주변 몹' = 반경 healRadius칸 안의 **다른** 몹 (자기 자신은 회복하지 않음 — 4천왕 모르가스의 '초당 1% 회복'과 구별).
 * - 유령은 자기 자리에서 투명으로 나온다 (유령의 30% 회피는 그대로).
 */
import { POSITIVE, RATIO } from '../abilities/params';
import { isDisabled } from '../systems/Status';
import { healAround, summonAround } from './common';
import { defineBoss } from './types';

export interface WraithLordParams {
  healTicks: number;
  healBp: number;
  healRadius: number;
  summonTicks: number;
  mob: string;
  count: number;
  invisible: boolean;
}

export default defineBoss<WraithLordParams>({
  id: 'wraithlord',
  compile: (r, mobIds) => ({
    healTicks: r.ticks('healEvery', POSITIVE),
    healBp: r.bp('healPct', RATIO),
    healRadius: r.units('healRadius', POSITIVE),
    summonTicks: r.ticks('summonEvery', POSITIVE),
    mob: r.str('summonMob', mobIds),
    count: r.int('summonCount', { min: 0, max: 50 }),
    invisible: r.bool('summonInvisible'),
  }),
  onSpawn(env, mob, p) {
    mob.traitAt = env.world.tick + p.healTicks;
    mob.traitAt2 = env.world.tick + p.summonTicks;
  },
  tick(env, mob, p) {
    const { ctx, world } = env;
    const tick = world.tick;
    if (isDisabled(mob, tick)) return;
    if (tick >= mob.traitAt) {
      mob.traitAt = tick + p.healTicks;
      healAround(ctx, world, mob, p.healRadius, p.healBp);
    }
    if (tick >= mob.traitAt2) {
      mob.traitAt2 = tick + p.summonTicks;
      if (p.count > 0) summonAround(ctx, world, mob, p.mob, p.count, p.invisible);
    }
  },
});
