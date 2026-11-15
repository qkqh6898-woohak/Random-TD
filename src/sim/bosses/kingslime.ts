/**
 * 킹 슬라임 (역병 군단 대장, ENEMIES.md 4장): 체력 50%에서 둘로 분열 (각각 남은 체력의 50%). 둘 다 잡아야 처치.
 * - 문턱을 넘은 다음 틱에 분열 (한 방에 죽으면 분열하지 않는다). 조각 = 같은 자리의 보스 (상태 이상은 새로),
 *   최대 체력 = 원래 × 50% (조각 체력 막대가 반쯤 찬 채로 보인다), 조각은 다시 분열하지 않는다.
 * - 'bossSplit' 사건 { id, parts }.
 */
import { mulBp } from '../Fixed';
import { emptyMobStatus, emptyMobTraits, MOB_KIND, type Mob } from '../entities/Mob';
import { POSITIVE, RATIO } from '../abilities/params';
import { hpAtOrBelow } from './common';
import { defineBoss } from './types';

export interface KingSlimeParams {
  atBp: number;
  parts: number;
  hpBp: number;
}

export default defineBoss<KingSlimeParams>({
  id: 'kingslime',
  compile: (r) => ({ atBp: r.bp('splitAt', RATIO), parts: r.int('splitParts', { min: 2, max: 8 }), hpBp: r.bp('splitHp', { ...POSITIVE, max: 10000 }) }),
  tick(env, mob, p) {
    if (mob.part || !hpAtOrBelow(mob, p.atBp)) return;
    const { world } = env;
    let each = mulBp(mob.hp, p.hpBp);
    if (each < 1) each = 1;
    const maxHp = Math.max(each, mulBp(mob.maxHp, p.hpBp));
    mob.hp = each;
    mob.maxHp = maxHp;
    mob.part = true;
    for (let i = 1; i < p.parts; i++) {
      world.entities.add({
        kind: MOB_KIND,
        mob: mob.mob,
        stage: mob.stage,
        hp: each,
        maxHp,
        armor: mob.armor,
        magicRes: mob.magicRes,
        speed: mob.speed,
        ccResistBp: mob.ccResistBp,
        lifeDamage: mob.lifeDamage,
        reward: 0,
        progress: mob.progress,
        moveRem: mob.moveRem,
        swarmIndex: i,
        invisible: mob.invisible,
        legion: mob.legion,
        boss: true,
        vulnBp: 0,
        markBp: 0,
        ...emptyMobStatus(),
        ...emptyMobTraits(),
        part: true,
      } satisfies Omit<Mob, 'id'>);
      env.ctx.state.spawned += 1;
    }
    world.emit('bossSplit', { id: mob.id, boss: mob.mob, parts: p.parts });
  },
});
