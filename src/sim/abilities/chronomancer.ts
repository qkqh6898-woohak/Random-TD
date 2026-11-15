/**
 * 시간술사 ★ (히어로): 15초마다 맵 위 모든 몹 정지 1초 → 2.5초 (보스 30%).
 * - 정지 = 행동 불가(이동·회복·능력 정지) — 면역 1초·상태이상 저항·보스 30%는 Status.applyHardCc가 처리한다.
 * - '맵 위 모든 몹' = 드러난 몹 (드러나지 않은 투명 몹에게는 상태 이상 무효, GDD 5.7).
 * - 맵에 몹이 없으면 기다렸다가 나오면 바로 쓴다. 'timeStop' 사건 (화면: 흑백 0.2초). 각성(주기 10초)은 M9.
 */
import { applyHardCc } from '../systems/Status';
import { restartTimer, revealedMobs, timerReady } from './common';
import { POSITIVE } from './params';
import { defineAbility } from './types';

export interface ChronomancerParams {
  stopTicks: number;
  cdTicks: number;
}

export default defineAbility<ChronomancerParams>({
  id: 'chronomancer',
  compile: (r) => ({ stopTicks: r.ticks('freeze', POSITIVE), cdTicks: r.ticks('cd', POSITIVE) }),
  tick(env, tower, p) {
    const { ctx, world } = env;
    if (!timerReady(tower, world.tick, p.cdTicks)) return;
    const mobs = revealedMobs(world);
    if (mobs.length === 0) return;
    let stopped = 0;
    for (const m of mobs) if (applyHardCc(ctx.rules.status, m, world.tick, 'stop', p.stopTicks)) stopped++;
    restartTimer(tower, world.tick, p.cdTicks);
    world.emit('timeStop', { tower: tower.id, x: tower.x, y: tower.y, ticks: p.stopTicks, count: stopped });
  },
});
