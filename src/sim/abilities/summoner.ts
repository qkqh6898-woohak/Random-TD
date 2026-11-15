/**
 * 소환사 ★ (히어로): 5초 → 3초마다 병사 소환 (공격력 = 소환사 × 0.8, 몹 3마리 공격 또는 6초 후 소멸).
 * - 병사는 소환사에서 가장 가까운 경로 지점에 나와 경로를 **거슬러** 걷는다 (GDD 5.2 '소환', Soldiers 시스템이 움직이고 공격한다).
 * - 공격력 = 소환사 1회 공격력 × 공격력%(오라·레벨 포함) × 0.8 (params.soldierAtk), 소환할 때 정해 병사에 싣는다. 치명타 없음.
 * - 걷는 속도·닿는 거리·공격 수·수명은 params (soldierSpeed 1.5칸/초, soldierReach 0.5칸, soldierHits 3, soldierLife 6초).
 * - 맵에 드러난 몹이 없으면 기다렸다가 나오면 바로 소환한다. 'soldier' 사건. 각성(병사 2명씩)은 M9.
 */
import { mulBp } from '../Fixed';
import { SOLDIER_KIND, type Soldier } from '../entities/Soldier';
import { nearestProgress } from '../map';
import { restartTimer, revealedMobs, timerReady, towerEff } from './common';
import { NON_NEG, POSITIVE } from './params';
import { defineAbility } from './types';

export interface SummonerParams {
  cdTicks: number;
  /** 병사 공격력 배율 (bp, ×0.8 = 8000) */
  atkMulBp: number;
  hits: number;
  lifeTicks: number;
  /** 단위/초 */
  speed: number;
  /** 단위 */
  reach: number;
}

export default defineAbility<SummonerParams>({
  id: 'summoner',
  compile: (r) => ({
    cdTicks: r.ticks('summonCd', POSITIVE),
    atkMulBp: r.mul('soldierAtk', NON_NEG),
    hits: r.int('soldierHits', POSITIVE),
    lifeTicks: r.ticks('soldierLife', POSITIVE),
    speed: r.units('soldierSpeed', POSITIVE),
    reach: r.units('soldierReach', POSITIVE),
  }),
  tick(env, tower, p) {
    const { ctx, world } = env;
    if (!timerReady(tower, world.tick, p.cdTicks)) return;
    if (revealedMobs(world).length === 0) return;
    const stats = ctx.rules.towers.get(tower.tower);
    if (!stats) return;
    const eff = towerEff(env, tower);
    const f = (c: number): number => (c > 0 ? mulBp(mulBp(c, eff.atkMulBp), p.atkMulBp) : 0);
    const at = nearestProgress(ctx.map.path, tower.x, tower.y);
    const soldier = world.entities.add({
      kind: SOLDIER_KIND,
      source: tower.id,
      tower: tower.tower,
      owner: tower.owner,
      progress: at.progress,
      moveRem: 0,
      speed: p.speed,
      reach: p.reach,
      hitsLeft: p.hits,
      hitIds: [],
      dmgP: f(stats.atkC),
      dmgM: f(stats.matkC),
      dmgT: f(stats.tatkC),
      armorPenBp: eff.armorPenBp,
      magicPenBp: eff.magicPenBp,
      bornTick: world.tick,
      until: world.tick + p.lifeTicks,
    } satisfies Omit<Soldier, 'id'>) as Soldier;
    restartTimer(tower, world.tick, p.cdTicks);
    world.emit('soldier', { id: soldier.id, tower: tower.id, x: at.x, y: at.y });
  },
});
