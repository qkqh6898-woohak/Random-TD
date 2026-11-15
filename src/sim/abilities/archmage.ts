/**
 * 대마법사 ★ (레전드, 🔥화염): 12초마다 운석 — 드러난 모든 몹에 현재 체력 8% → 15% 피해 (보스 2%), 마법 관통 30%(스탯).
 * - 운석 피해 = 현재 체력 × 비율 (내림, 최소 1)을 고정 피해로 (방어·마법 저항 무시, 약화는 곱해짐) — '현재 체력 %'라서
 *   단계가 올라 방어가 높아져도 비율이 그대로 들어가게.
 * - 맵에 드러난 몹이 없으면 기다렸다가 나오면 바로 떨어진다. 'meteor' 사건 + 몹마다 'hit' { fx: 'meteor' }. 각성(주기 8초)은 M9.
 */
import { mulBp } from '../Fixed';
import { ATK_SCALE } from '../rules';
import { positionAt } from '../map';
import { applyHit } from '../systems/Combat';
import { restartTimer, revealedMobs, timerReady } from './common';
import { POSITIVE, RATIO } from './params';
import { defineAbility } from './types';

/** 운석 피해의 'hit' 사건 fx 값 (화면이 그 자리에 불덩이를 떨어뜨린다) */
export const METEOR_FX = 'meteor';

export interface ArchmageParams {
  pctBp: number;
  bossPctBp: number;
  cdTicks: number;
}

export default defineAbility<ArchmageParams>({
  id: 'archmage',
  compile: (r) => ({ pctBp: r.bp('meteorPct', RATIO), bossPctBp: r.bp('meteorBossPct', RATIO), cdTicks: r.ticks('cd', POSITIVE) }),
  tick(env, tower, p) {
    const { ctx, world } = env;
    if (!timerReady(tower, world.tick, p.cdTicks)) return;
    const mobs = revealedMobs(world);
    if (mobs.length === 0) return;
    restartTimer(tower, world.tick, p.cdTicks);
    world.emit('meteor', { tower: tower.id, x: tower.x, y: tower.y, count: mobs.length });
    for (const m of mobs) {
      if (!world.entities.has(m.id)) continue;
      const dmg = Math.max(1, mulBp(m.hp, m.boss ? p.bossPctBp : p.pctBp));
      const at = positionAt(ctx.map.path, m.progress);
      applyHit(ctx, world, m, { p: 0, m: 0, t: dmg * ATK_SCALE, fx: METEOR_FX }, at, tower.id);
    }
  },
});
