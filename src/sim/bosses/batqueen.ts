/**
 * 박쥐 여왕 (질풍 군단 대장, ENEMIES.md 4장): 10초마다 박쥐 5마리 소환, 15초마다 3초간 날아올라 사거리 2 이하 타워의 공격을 받지 않음.
 * - 박쥐는 여왕 자리에서 지금 단계 스탯으로 나온다 (보상 = 일반 박쥐). 날아오른 동안 사거리 2칸 이하 타워는 여왕을 대상으로 고르지도,
 *   광역·연쇄로 맞히지도 못한다 (Combat — 이미 날아가던 투사체도 헛발). 운석 같은 전체 능력·상태 이상은 그대로.
 * - 'bossSummon' { boss, mob, count }, 'bossFly' { id, until }.
 */
import { POSITIVE } from '../abilities/params';
import { isDisabled } from '../systems/Status';
import { summonAround } from './common';
import { defineBoss } from './types';

export interface BatQueenParams {
  summonTicks: number;
  mob: string;
  count: number;
  flyEveryTicks: number;
  flyTicks: number;
  flyBlock: number;
}

export default defineBoss<BatQueenParams>({
  id: 'batqueen',
  compile: (r, mobIds) => ({
    summonTicks: r.ticks('summonEvery', POSITIVE),
    mob: r.str('summonMob', mobIds),
    count: r.int('summonCount', { min: 0, max: 50 }),
    flyEveryTicks: r.ticks('flyEvery', POSITIVE),
    flyTicks: r.ticks('flySeconds', POSITIVE),
    flyBlock: r.units('flyBlockRange', POSITIVE),
  }),
  onSpawn(env, mob, p) {
    mob.traitAt = env.world.tick + p.summonTicks;
    mob.traitAt2 = env.world.tick + p.flyEveryTicks;
  },
  tick(env, mob, p) {
    const { ctx, world } = env;
    const tick = world.tick;
    if (isDisabled(mob, tick)) return;
    if (tick >= mob.traitAt) {
      mob.traitAt = tick + p.summonTicks;
      if (p.count > 0) summonAround(ctx, world, mob, p.mob, p.count);
    }
    if (tick >= mob.traitAt2) {
      mob.traitAt2 = tick + p.flyEveryTicks;
      mob.flyUntil = tick + p.flyTicks;
      mob.flyBlock = p.flyBlock;
      world.emit('bossFly', { id: mob.id, until: mob.flyUntil });
    }
  },
});
