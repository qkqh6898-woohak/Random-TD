/**
 * V3 P1 영웅 마일스톤 — 화면용 모델 (로비 영웅 상세 띠). sim과 같은 규칙(src/sim/milestones.ts)을 같은 데이터(game.json towerLevel)로 읽는다.
 * 이미 그 레벨인 영웅은 구매·수령 없이 바로 '적용됨' (판 입력 = 영웅 레벨 → sim이 계산).
 */
import type { GameData } from '../../data/load';
import { milestoneBonus, traitKindOf } from '../../sim/milestones';
import { buildMatchRules, type MatchRules } from '../../sim/rules';

export interface MilestoneItem {
  level: number;
  reached: boolean;
  /** 짧은 이름 (띠 칸 아래) */
  short: string;
  /** 자세한 효과 (선택한 칸 아래) */
  detail: string;
}

let cachedRules: { data: unknown; rules: MatchRules } | null = null;
function rulesOf(data: GameData): MatchRules {
  if (!cachedRules || cachedRules.data !== data) cachedRules = { data, rules: buildMatchRules(data) };
  return cachedRules.rules;
}

const pct = (bp: number): string => `${bp % 100 === 0 ? bp / 100 : (bp / 100).toFixed(1)}%`;

/** 특색 강화 한 단계의 글 (종류별) */
export function traitBoostText(kind: 'aura' | 'cc' | 'crit', stepBp: number, steps: number): string {
  const total = stepBp * steps;
  if (kind === 'aura') return `특색 강화 ${steps}: 주는 지원 효과 +${pct(total)}`;
  if (kind === 'cc') return `특색 강화 ${steps}: 거는 둔화·빙결·정지 시간 +${pct(total)}`;
  return `특색 강화 ${steps}: 치명타 확률 +${pct(total)}p`;
}

/** 영웅 하나의 마일스톤 5칸 (레벨 오름차순) */
export function heroMilestones(data: GameData, towerId: string, level: number): MilestoneItem[] {
  const rules = rulesOf(data);
  const kind = traitKindOf(rules, towerId);
  let steps = 0;
  return rules.milestones.map((m) => {
    const parts: string[] = [];
    const shorts: string[] = [];
    if (m.atkBp > 0) {
      parts.push(`공격력 +${pct(m.atkBp)}`);
      shorts.push(`공격 +${pct(m.atkBp)}`);
    }
    if (m.apsBp > 0) {
      parts.push(`공격 속도 +${pct(m.apsBp)}`);
      shorts.push(`공속 +${pct(m.apsBp)}`);
    }
    if (m.atkBp > 0 && m.atkBp === m.apsBp) shorts.splice(0, shorts.length, `공격·공속 +${pct(m.atkBp)}`);
    if (m.trait) {
      steps += 1;
      parts.push(traitBoostText(kind, rules.traitStepBp[kind], steps));
      shorts.push(`특색 ${steps}`);
    }
    return { level: m.level, reached: level >= m.level, short: shorts.join('·'), detail: `${parts.join(' · ')} (기존 레벨 효과에 더해요)` };
  });
}

/** 레벨 from → to 사이에 새로 달성한 마일스톤 (레벨업 결과 표시) */
export function newMilestones(data: GameData, towerId: string, from: number, to: number): MilestoneItem[] {
  return heroMilestones(data, towerId, to).filter((m) => m.level > from && m.level <= to);
}

/** 영웅 레벨이 주는 전투 공격력% 합 (기존 (Lv−1)×4% + 마일스톤 공격력) — 상세 '전투 공격력' 표시 */
export function heroTotalAtkBp(data: GameData, towerId: string, level: number): number {
  const rules = rulesOf(data);
  const lv = Math.max(1, level);
  return (lv - 1) * rules.atkPerLevelBp + milestoneBonus(rules, towerId, lv).atkBp;
}
