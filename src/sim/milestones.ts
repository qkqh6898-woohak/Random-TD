/**
 * V3 P1 영웅 마일스톤 (docs/v3/p0-spec.md 2장, game.json towerLevel.milestones·traitBoost).
 *
 * 영웅(타워) 레벨이 Lv3/6/9/12/15 이상이면 **기존 효과 위에 더한다** — 레벨당 공격력 +4%와 특색 [Lv1, Lv15] 보간은 그대로다.
 *  - 공격력%·공속%: 타워 최종 보정(Aura.towerBonus)의 합연산 항에 더한다 (공속은 기존 상한 그대로).
 *  - 특색 강화 n단계: 그 타워의 종류(traitKind)에 따라
 *      aura = 그 타워가 주는 지원 오라 × (1 + 단계당 값 × n) 내림 (같은 종류 중첩 없음 규칙 그대로)
 *      cc   = 그 타워가 거는 둔화·빙결·정지 지속 × (1 + 단계당 값 × n) 내림 (보스·저항 배율은 그 뒤)
 *      crit = 치명타 확률 + 단계당 값 × n (기존 상한)
 * 레벨은 판 입력(MatchContext.levels)이라 판 상태·해시에 들어가지 않고, 같은 레벨이면 늘 같은 값이다.
 */
import type { MatchRules, MilestoneRule } from './rules';
import type { MatchContext } from './state';
import { BP_ONE, mulBp } from './Fixed';
import type { TraitBoostKind } from '../data/load';

export interface MilestoneBonus {
  atkBp: number;
  apsBp: number;
  critBp: number;
  auraBp: number;
  ccBp: number;
  /** 특색 강화 단계 수 */
  traitSteps: number;
}

export const NO_MILESTONE: Readonly<MilestoneBonus> = Object.freeze({ atkBp: 0, apsBp: 0, critBp: 0, auraBp: 0, ccBp: 0, traitSteps: 0 });

type Rules = Pick<MatchRules, 'milestones' | 'traitKind' | 'traitDefault' | 'traitStepBp'>;

/** 그 타워의 특색 강화 종류 */
export function traitKindOf(rules: Pick<MatchRules, 'traitKind' | 'traitDefault'>, towerId: string): TraitBoostKind {
  return rules.traitKind.get(towerId) ?? rules.traitDefault;
}

/** 레벨 level에서 달성한 마일스톤 (레벨 오름차순) */
export function reachedMilestones(rules: Pick<MatchRules, 'milestones'>, level: number): readonly MilestoneRule[] {
  return rules.milestones.filter((m) => level >= m.level);
}

/** 타워 id·레벨 → 마일스톤 보정 합 (bp). Lv1·2 = 모두 0 */
export function milestoneBonus(rules: Rules, towerId: string, level: number): MilestoneBonus {
  let atkBp = 0;
  let apsBp = 0;
  let traitSteps = 0;
  for (const m of rules.milestones) {
    if (level < m.level) break;
    atkBp += m.atkBp;
    apsBp += m.apsBp;
    if (m.trait) traitSteps += 1;
  }
  if (atkBp === 0 && apsBp === 0 && traitSteps === 0) return NO_MILESTONE;
  const kind = traitKindOf(rules, towerId);
  const step = rules.traitStepBp[kind] * traitSteps;
  return {
    atkBp,
    apsBp,
    critBp: kind === 'crit' ? step : 0,
    auraBp: kind === 'aura' ? step : 0,
    ccBp: kind === 'cc' ? step : 0,
    traitSteps,
  };
}

/** 주인 owner의 그 타워 종류 마일스톤 보정 (캐시 — 레벨은 판 입력이라 판 동안 같다). */
export function towerMilestone(ctx: Pick<MatchContext, 'levels' | 'rules' | 'cache'>, owner: number, towerId: string): MilestoneBonus {
  const key = `ms:${owner}:${towerId}`;
  const hit = ctx.cache.get(key) as MilestoneBonus | undefined;
  if (hit) return hit;
  const m = milestoneBonus(ctx.rules, towerId, ctx.levels[owner]?.[towerId] ?? 1);
  ctx.cache.set(key, m);
  return m;
}

/** 그 타워가 거는 제어(둔화·빙결·정지) 지속 틱 — 마일스톤 제어% 반영, 내림 (보스·저항 배율은 Status가 그 뒤에). */
export function ccTicks(ctx: Pick<MatchContext, 'levels' | 'rules' | 'cache'>, owner: number, towerId: string, ticks: number): number {
  const bonus = towerMilestone(ctx, owner, towerId).ccBp;
  return bonus > 0 ? mulBp(ticks, BP_ONE + bonus) : ticks;
}
