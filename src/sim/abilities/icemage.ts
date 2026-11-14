/**
 * 얼음 마법사 ★ (유니크, ❄얼음): 맞은 몹 빙결(일시 정지) 0.5초 → 1.0초, 같은 몹은 3초에 1번 (보스는 지속 30%).
 * - 빙결 = 행동 불가 + 받는 피해 +10% (game.json status.freezeVuln). 광역 r1.2라 맞은 몹 모두 얼 수 있다.
 * - '같은 몹은 3초에 1번': 실제로 얼린 몹에게만 몹별 재사용 대기를 건다 (면역·저항으로 안 얼면 대기 없음).
 * 각성(빙결 중 받는 피해 +20%)은 M9.
 */
import { applyHardCc, cdReady, setCd } from '../systems/Status';
import { defineAbility } from './types';

export interface IcemageParams {
  freezeTicks: number;
  /** 같은 몹 재빙결 대기 (틱) */
  cdTicks: number;
}

export default defineAbility<IcemageParams>({
  id: 'icemage',
  compile: (r) => ({ freezeTicks: r.ticks('freeze'), cdTicks: r.ticks('perMobCd') }),
  onHit(env, mob, p) {
    const tick = env.world.tick;
    if (!cdReady(mob, 'icemage', tick)) return;
    const status = env.ctx.rules.status;
    if (applyHardCc(status, mob, tick, 'freeze', p.freezeTicks, status.freezeVulnBp)) setCd(mob, 'icemage', tick, p.cdTicks);
  },
});
