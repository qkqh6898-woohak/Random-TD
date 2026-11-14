/**
 * 용 소환사 ★ (레전드, 🔥화염): 브레스(광역 r1.5)에 맞은 몹이 받는 피해 +10% → +25% (5초).
 * 약화 = 서로 다른 출처는 합산, 최대 +100% (game.json combat.vulnMax), 같은 출처('dragoncaller')는 갱신. 각성(용 2마리)은 M9.
 */
import { applyVuln } from '../systems/Status';
import { defineAbility } from './types';

export interface DragoncallerParams {
  vulnBp: number;
  vulnTicks: number;
}

export default defineAbility<DragoncallerParams>({
  id: 'dragoncaller',
  compile: (r) => ({ vulnBp: r.bp('vuln'), vulnTicks: r.ticks('vulnDur') }),
  onHit(env, mob, p) {
    applyVuln(env.ctx.rules.status, mob, env.world.tick, 'dragoncaller', p.vulnBp, p.vulnTicks);
  },
});
