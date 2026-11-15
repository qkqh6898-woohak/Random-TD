/**
 * 경로 이동 (DEV_PLAN M1-3).
 *
 * - 몹 위치 = 진행도(정수 단위) 하나. 틱마다 속도(단위/초) ÷ 20 만큼 늘어난다.
 *   속도가 20으로 나누어떨어지지 않아도(예: 1.25칸/초 = 62.5단위/틱) 나머지(moveRem)를 이어 가서 1초에 정확히 속도만큼 걷는다.
 * - loop 맵(순환의 정원)은 진행도가 계속 늘고, 위치는 길이로 나눈 나머지 지점 → 1.5칸/초 몹이 28칸 한 바퀴 = 374틱(18.7초).
 * - 스테이지 맵은 진행도가 경로 길이에 닿으면 출구 도달: 몹이 사라지고 목숨이 몹의 lifeDamage만큼 준다 (CAMPAIGN 목숨 20).
 * - 상태 이상 (M3-6, Status.ts): 행동 불가(기절·정지·빙결) 동안은 움직이지 않고, 둔화는 속도 × (1 − 지금 둔화) (Mob.slowBp,
 *   가장 강한 것 하나·최대 70%·보스 절반·상태이상 저항이 이미 반영된 값). 상태 이상 시스템이 이동 바로 앞에서 값을 정리한다.
 * - M4: 속도 = 기본 × (1 + 가속) × (1 − 둔화) × (1 − 카드 '끈끈이', 보스 제외). 가속 = 그림자 늑대 +30%·고대 골렘 분노 +100%
 *   (MobTraits·보스 패턴이 Mob.speedBonusBp에 넣는다). 곱할 때마다 내림.
 * - 캠페인에서 보스가 출구에 닿으면 즉시 패배 ('bossLeak', GDD 2.1). 도전 보스(M5-2)는 목숨 감소 없이 도전 실패.
 */
import type { System, World } from '../World';
import { TICK_HZ } from '../World';
import { isMob, type Mob } from '../entities/Mob';
import type { MatchContext } from '../state';
import { BP_ONE, mulBp } from '../Fixed';
import { isDisabled } from './Status';
import { declareDefeat } from './Defeat';
import { challengeEscaped } from './Challenge';

/**
 * 이번 틱 실제 속도 (단위/초): 행동 불가면 0, 아니면 기본 × (1 + 가속) × (1 − 둔화) × (1 − 카드 감속) — 곱할 때마다 내림.
 * @param cardSlowBp 카드 '끈끈이' 감속 (bp). 보스에게는 적용하지 않는다
 */
export function effectiveSpeed(
  mob: Pick<Mob, 'speed' | 'slowBp' | 'ccEnd'> & Partial<Pick<Mob, 'speedBonusBp' | 'boss'>>,
  tick = 0,
  cardSlowBp = 0,
): number {
  if (isDisabled(mob, tick)) return 0;
  let v = mob.speed;
  const bonus = mob.speedBonusBp ?? 0;
  if (bonus > 0) v = mulBp(v, BP_ONE + bonus);
  if (mob.slowBp > 0) v = mulBp(v, BP_ONE - mob.slowBp);
  if (cardSlowBp > 0 && mob.boss !== true) v = mulBp(v, BP_ONE - cardSlowBp);
  return v;
}

/** 몹 하나를 1틱 움직인다 (진행도·나머지만 바꿈). */
export function advanceMob(mob: Mob, tick = 0, cardSlowBp = 0): void {
  const total = effectiveSpeed(mob, tick, cardSlowBp) + mob.moveRem;
  const step = Math.floor(total / TICK_HZ);
  mob.moveRem = total - step * TICK_HZ;
  mob.progress += step;
}

/** 출구 도달 처리: 몹 제거 + 목숨 감소 + 사건. 보스면 즉시 패배. */
export function leakMob(ctx: MatchContext, world: World, mob: Mob): void {
  const { state } = ctx;
  // 도전 보스 (M5-2): 목숨 감소 없이 도전 실패
  if (mob.challenge) {
    challengeEscaped(ctx, world, mob);
    return;
  }
  world.entities.remove(mob.id);
  state.leaked += 1;
  state.lives = state.lives > mob.lifeDamage ? state.lives - mob.lifeDamage : 0;
  world.emit('leak', { id: mob.id, mob: mob.mob, lifeDamage: mob.lifeDamage, lives: state.lives, ...(mob.boss ? { boss: true } : {}) });
  if (mob.boss) declareDefeat(ctx, world, 'bossLeak');
}

export function createMovementSystem(ctx: MatchContext): System {
  const { path } = ctx.map;
  return (world) => {
    if (ctx.state.phase !== 'playing') return;
    const reached: Mob[] = [];
    const cardSlow = ctx.state.mobSlowBp;
    for (const e of world.entities.list()) {
      if (!isMob(e)) continue;
      advanceMob(e, world.tick, cardSlow);
      if (!path.loop && e.progress >= path.length) reached.push(e);
    }
    for (const mob of reached) {
      if (ctx.state.phase !== 'playing') break;
      // 쌍둥이 도전 보스는 한 마리가 닿으면 무리가 같이 사라진다 (이미 지워졌으면 건너뜀)
      if (!world.entities.has(mob.id)) continue;
      leakMob(ctx, world, mob);
    }
  };
}
