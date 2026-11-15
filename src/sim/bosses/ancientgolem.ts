/**
 * 고대 골렘 (대지 군단 대장, ENEMIES.md 4장): 체력 30% 이하에서 이동속도 2배, 방어력 0.
 * - 문턱을 넘은 다음 틱부터 영구 (이동속도 +100% = Mob.speedBonusBp, 방어력 = enrageArmor). 'bossEnrage' 사건 { id }.
 */
import { NON_NEG, RATIO } from '../abilities/params';
import { hpAtOrBelow } from './common';
import { defineBoss } from './types';

export interface AncientGolemParams {
  atBp: number;
  speedBp: number;
  armor: number;
}

export const ENRAGED = 1;

export default defineBoss<AncientGolemParams>({
  id: 'ancientgolem',
  compile: (r) => ({ atBp: r.bp('enrageAt', RATIO), speedBp: r.bp('enrageSpeed', NON_NEG), armor: r.int('enrageArmor', NON_NEG) }),
  tick(env, mob, p) {
    if ((mob.phaseFlags & ENRAGED) !== 0 || !hpAtOrBelow(mob, p.atBp)) return;
    mob.phaseFlags |= ENRAGED;
    mob.armor = p.armor;
    mob.speedBonusBp = p.speedBp;
    env.world.emit('bossEnrage', { id: mob.id });
  },
});
