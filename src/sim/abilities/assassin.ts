/**
 * 그림자 암살자 ★ (레전드): 감지 오라(반경 3) + 보스 피해 ×2 → ×3.5, 체력 5% → 12% 이하 일반 몹 즉사, 방어 관통 50%(스탯).
 * - 보스 피해 배율은 자기 보정(bossMulBp)으로 stats.effectiveStats의 보스 배율에 곱한다 (특성 '거인 사냥꾼'과 곱연산).
 * - 즉사: 이 타워의 공격에 맞고 살아남은 보스가 아닌 몹의 체력이 최대 체력 × 비율 이하면 바로 처치 ('execute' 사건).
 * - 감지 오라는 towers.json detect = aura, detectRange 3 → TowerStats.detect·detectRange (Detection.detectAuras가 모은다,
 *   투명 몹 드러내기는 M4). 대상 우선순위 '보스 우선'은 towers.json target. 각성(처치 시 순간이동 연속 공격)은 M9.
 */
import { mulBp } from '../Fixed';
import { killMob } from '../systems/Kill';
import { defineAbility } from './types';

export interface AssassinParams {
  /** 보스 피해 배율 (bp, ×2 = 20000) */
  bossMulBp: number;
  /** 즉사 체력 비율 (bp) */
  executeBp: number;
}

export default defineAbility<AssassinParams>({
  id: 'assassin',
  compile: (r) => ({ bossMulBp: r.mul('bossMul'), executeBp: r.bp('execute') }),
  bossMulBp: (p) => p.bossMulBp,
  onHit(env, mob, p, _hit, at) {
    if (mob.boss || mob.hp <= 0) return;
    if (mob.hp > mulBp(mob.maxHp, p.executeBp)) return;
    env.world.emit('execute', { target: mob.id, hp: mob.hp, x: at.x, y: at.y });
    killMob(env.ctx, env.world, mob, at.x, at.y);
  },
});
