/**
 * 혼돈의 용 (군주 직속 대장, ENEMIES.md 4장): 15초마다 무작위 타워 3개 5초 기절. 체력 66%·33%에서 5초간 받는 피해 −50%.
 * - 기절한 타워는 공격·주기 능력을 쓰지 않는다 (Tower.stunUntil → Move.isPaused, Abilities). 타워 고르기는 **보스 난수 흐름**
 *   (판 위 타워 ID 순 목록에서 서로 다른 3개, 부분 섞기) → 타워 배치가 세계(몹 등장) 흐름을 바꾸지 않는다. 타워가 없으면 기다린다.
 * - 피해 감소: 문턱마다 한 번 (한 번에 두 문턱을 넘으면 한 번만 5초). Mob.dmgCutBp를 피해 공식(Damage.damageAgainst)이 모든 피해에 곱한다.
 * - 사건: 'bossStun' { id, towers: "id,id,id", until }, 'bossGuard' { id, until }.
 */
import type { Tower } from '../entities/Tower';
import { isTower } from '../entities/Tower';
import { POSITIVE, RATIO } from '../abilities/params';
import { STREAM_BOSS } from '../World';
import { isDisabled } from '../systems/Status';
import { hpAtOrBelow } from './common';
import { defineBoss } from './types';

export interface ChaosDragonParams {
  stunEveryTicks: number;
  towers: number;
  stunTicks: number;
  guardAt: number[];
  guardTicks: number;
  cutBp: number;
}

export default defineBoss<ChaosDragonParams>({
  id: 'chaosdragon',
  compile: (r) => ({
    stunEveryTicks: r.ticks('stunEvery', POSITIVE),
    towers: r.int('stunTowers', { min: 0, max: 100 }),
    stunTicks: r.ticks('stunSeconds', POSITIVE),
    guardAt: r.bpList('guardAt', RATIO),
    guardTicks: r.ticks('guardSeconds', POSITIVE),
    cutBp: r.bp('guardCut', RATIO),
  }),
  onSpawn(env, mob, p) {
    mob.traitAt = env.world.tick + p.stunEveryTicks;
  },
  tick(env, mob, p) {
    const { world } = env;
    const tick = world.tick;
    if (mob.dmgCutBp > 0 && tick >= mob.guardUntil) mob.dmgCutBp = 0;
    let guard = false;
    p.guardAt.forEach((at, i) => {
      const bit = 1 << i;
      if ((mob.phaseFlags & bit) !== 0 || !hpAtOrBelow(mob, at)) return;
      mob.phaseFlags |= bit;
      guard = true;
    });
    if (guard) {
      mob.dmgCutBp = p.cutBp;
      mob.guardUntil = tick + p.guardTicks;
      world.emit('bossGuard', { id: mob.id, until: mob.guardUntil });
    }
    if (isDisabled(mob, tick) || tick < mob.traitAt || p.towers <= 0) return;
    const list: Tower[] = [];
    for (const e of world.entities.list()) if (isTower(e)) list.push(e);
    if (list.length === 0) return;
    mob.traitAt = tick + p.stunEveryTicks;
    const rng = world.rng(STREAM_BOSS);
    const n = list.length < p.towers ? list.length : p.towers;
    // 부분 섞기: 앞 n칸에 서로 다른 타워
    for (let k = 0; k < n; k++) {
      const j = k + rng.int(list.length - k);
      const t = list[j] as Tower;
      list[j] = list[k] as Tower;
      list[k] = t;
    }
    const until = tick + p.stunTicks;
    const chosen = list.slice(0, n);
    for (const t of chosen) if (until > t.stunUntil) t.stunUntil = until;
    world.emit('bossStun', { id: mob.id, towers: chosen.map((t) => t.id).join(','), until });
  },
});
