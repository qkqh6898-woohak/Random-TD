/**
 * 진흙 주술사 ★ (레어, 🟫진흙): 맞은 몹 둔화 25% → 40% (2초) + 8초 → 5초마다 경로에 진흙 웅덩이
 * (지나가는 몹 둔화 50%, 웅덩이 3초 유지).
 * - 맞은 몹 둔화 출처 'mudshaman', 웅덩이 둔화 출처 'mudshaman.puddle' → 둔화는 가장 강한 것 하나만 (Status).
 * - 웅덩이 자리 = 사거리 안 선두 몹이 지금 있는 경로 위 지점, 반경 params.puddleRadius(0.75칸). 사거리 안에 몹이 없으면
 *   기다렸다가 몹이 들어오면 바로 만든다 (빈 경로에 낭비하지 않음). 웅덩이 안 몹 둔화는 능력 시스템이 틱마다 건다.
 * 각성(웅덩이 2개 동시)은 M9.
 */
import { PUDDLE_KIND, type Puddle } from '../entities/Puddle';
import { applySlow } from '../systems/Status';
import { leaderRuleFor, pickTarget, targetCandidates } from '../systems/Targeting';
import { restartTimer, timerReady } from './common';
import { POSITIVE, RATIO } from './params';
import { defineAbility } from './types';

export interface MudshamanParams {
  slowBp: number;
  slowTicks: number;
  puddleCdTicks: number;
  puddleSlowBp: number;
  puddleTicks: number;
  /** 웅덩이 반경 (단위) */
  puddleR: number;
}

/** 웅덩이 둔화의 출처 이름 (맞은 몹 둔화와 따로 들고 가장 강한 것만 적용) */
export const PUDDLE_SRC = 'mudshaman.puddle';

export default defineAbility<MudshamanParams>({
  id: 'mudshaman',
  compile: (r) => ({
    slowBp: r.bp('slow', RATIO),
    slowTicks: r.ticks('slowDur', POSITIVE),
    puddleCdTicks: r.ticks('puddleCd', POSITIVE),
    puddleSlowBp: r.bp('puddleSlow', RATIO),
    puddleTicks: r.ticks('puddleDur', POSITIVE),
    puddleR: r.units('puddleRadius', POSITIVE),
  }),
  onHit(env, mob, p) {
    applySlow(env.ctx.rules.status, mob, env.world.tick, 'mudshaman', p.slowBp, p.slowTicks);
  },
  tick(env, tower, p) {
    const { ctx, world } = env;
    if (!timerReady(tower, world.tick, p.puddleCdTicks)) return;
    const stats = ctx.rules.towers.get(tower.tower);
    if (!stats) return;
    const leader = pickTarget(targetCandidates(world, ctx.map.path), tower.x, tower.y, stats.range, 'first', leaderRuleFor(ctx.state.mode));
    if (!leader) return;
    const puddle = world.entities.add({
      kind: PUDDLE_KIND,
      source: tower.id,
      tower: tower.tower,
      owner: tower.owner,
      x: leader.x,
      y: leader.y,
      r: p.puddleR,
      slowBp: p.puddleSlowBp,
      bornTick: world.tick,
      until: world.tick + p.puddleTicks,
    } satisfies Omit<Puddle, 'id'>) as Puddle;
    restartTimer(tower, world.tick, p.puddleCdTicks);
    world.emit('puddle', { id: puddle.id, tower: tower.id, x: puddle.x, y: puddle.y, r: puddle.r });
  },
});
