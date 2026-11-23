/**
 * 지원 효과 — 오라 (DEV_PLAN M3-7, GDD 5.6).
 *
 * - "주변 8칸" = 자신을 둘러싼 3×3 (자신 제외), "주변 24칸" = 5×5 (자신 제외): 칸 거리(체비쇼프, max(|dx|, |dy|)) ≤ 1 / 2.
 *   범위는 game.json aura (around8 = 1, around24 = 2).
 * - "전체" = 판 위 모든 (내) 타워, **자신 포함**.
 * - **같은 타워의 지원 효과는 중첩되지 않음** (학자 2개 = +20%만, 대장장이 둘 사이 타워 = +10%만).
 *   **서로 다른 타워의 효과는 중첩** (대장장이 +10% + 학자 +20% = +30%, 공격력%는 합연산).
 *   같은 종류 둘이 서로를 감싸면 서로에게는 준다 (대장장이 A 옆 대장장이 B = 둘 다 +10%, 자기 자신에게만 안 줌).
 * - 위치로 매 틱 다시 계산한다 → 이동·교환하면 바로 반영 (DEV_PLAN 3.1 '이동 후 재계산'). 끄는 중인 타워는 원래 칸에서 준다.
 * - 주는 쪽과 받는 쪽은 같은 주인끼리만 (2인 판에서 남의 타워를 버프하지 않는다 — 협동 모드 규칙은 M13에서 다시 정한다).
 * 타워 한 개의 최종 보정(TowerBonus) = 오라 + 타워 레벨 공격력(레벨당 +4%) + 등급 강화(M5-3, 등급군 공격력%) + 자기 특색(광전사 공속·암살자 보스 배율)
 * → stats.effectiveStats.
 */
import type { World } from '../World';
import { BP_ONE, mulBp } from '../Fixed';
import { isTower, type Tower } from '../entities/Tower';
import type { MatchRules } from '../rules';
import type { MatchContext } from '../state';
import type { TowerBonus } from '../stats';
import { abilityOf, abilityParams, towerLevel, towerMilestone } from '../abilities';
import type { AuraArea, AuraSpec } from '../abilities/types';
import { gradeUpgradeBp } from './Upgrade';
import { chanceBonus } from '../chances';
import { relicGoldAtkBp, relicSum } from '../relics';

/** 오라 하나가 받는 타워에게 닿는가. */
export function auraCovers(
  rules: Pick<MatchRules, 'auraAround8' | 'auraAround24'>,
  area: AuraArea,
  src: Pick<Tower, 'id' | 'tx' | 'ty'>,
  dst: Pick<Tower, 'id' | 'tx' | 'ty'>,
): boolean {
  if (area === 'global') return true;
  if (src.id === dst.id) return false;
  const r = area === 'around8' ? rules.auraAround8 : rules.auraAround24;
  const dx = dst.tx - src.tx;
  const dy = dst.ty - src.ty;
  return dx <= r && dx >= -r && dy <= r && dy >= -r;
}

/** 오라를 주는 타워 하나. */
export interface AuraSource {
  tower: Tower;
  spec: AuraSpec;
}

/** 판 위 오라 타워 (ID 순). */
export function auraSources(ctx: MatchContext, world: World): AuraSource[] {
  const out: AuraSource[] = [];
  for (const e of world.entities.list()) {
    if (!isTower(e)) continue;
    const def = abilityOf(e.tower);
    if (!def?.aura) continue;
    out.push({ tower: e, spec: boostAura(def.aura(abilityParams(ctx, e.owner, def)), towerMilestone(ctx, e.owner, e.tower).auraBp) });
  }
  return out;
}

/** 타워 하나가 받는 오라 합 (공격력%·공속%)과 준 타워 종류. */
export interface AuraBonus {
  atkPctBp: number;
  apsPctBp: number;
  /** 효과를 준 타워 종류 (id, 처음 닿은 순) — 화면 표시용 */
  from: string[];
}

/** 타워 엔티티 id → 받는 오라 합. 오라를 하나도 받지 않는 타워는 없다(맵에 없음). */
export type AuraMap = ReadonlyMap<number, AuraBonus>;

/**
 * 모든 타워가 받는 오라를 계산한다. 같은 주인의 오라만, 같은 타워 종류는 한 번만(닿는 것이 하나라도 있으면), 다른 종류는 합.
 * 같은 종류의 수치는 주인·레벨이 같아 모두 같으므로 '한 번만' = 그 값.
 */
export function computeAuras(ctx: MatchContext, world: World, sources: readonly AuraSource[] = auraSources(ctx, world)): AuraMap {
  const out = new Map<number, AuraBonus>();
  if (sources.length === 0) return out;
  for (const e of world.entities.list()) {
    if (!isTower(e)) continue;
    let bonus: AuraBonus | null = null;
    const got = new Set<string>();
    for (const s of sources) {
      if (s.tower.owner !== e.owner || got.has(s.tower.tower)) continue;
      if (!auraCovers(ctx.rules, s.spec.area, s.tower, e)) continue;
      got.add(s.tower.tower);
      bonus ??= { atkPctBp: 0, apsPctBp: 0, from: [] };
      bonus.atkPctBp += s.spec.atkPctBp;
      bonus.apsPctBp += s.spec.apsPctBp;
      bonus.from.push(s.tower.tower);
    }
    if (bonus) out.set(e.id, bonus);
  }
  return out;
}

/**
 * 타워 하나의 최종 보정: 받는 오라 + 타워 레벨 공격력((레벨 − 1) × 4%) + 등급 강화 공격력% + 자기 특색 (광전사 연속 공격 공속%, 암살자 보스 배율 ×).
 * @param auras computeAuras 결과 (한 틱에 한 번 계산해 모든 타워가 같이 쓴다)
 */
export function towerBonus(ctx: MatchContext, tower: Tower, auras: AuraMap): TowerBonus {
  const a = auras.get(tower.id);
  const level = towerLevel(ctx, tower.owner, tower.tower);
  // 등급 강화 (M5-3): 그 타워 등급군의 공격력% — 지금 타워와 앞으로 나올 타워 모두 (등급은 데이터, 강화 레벨은 주인 것)
  const grade = ctx.rules.towers.get(tower.tower)?.grade;
  const gradeUp = grade ? gradeUpgradeBp(ctx, tower.owner, grade) : 0;
  // V3 P1 영웅 마일스톤: 기존 (레벨 − 1) × 4% 위에 더한다 (공격력·공속 합연산, 치명 확률 기존 상한)
  const ms = towerMilestone(ctx, tower.owner, tower.tower);
  let atk = (a?.atkPctBp ?? 0) + (level - 1) * ctx.rules.atkPerLevelBp + gradeUp + ms.atkBp + relicAtkBp(ctx, tower);
  // 필살기 '전군 가속' (G-1): 그 플레이어 모든 타워 공속% (끝나면 Ultimate 시스템이 0으로)
  let aps = (a?.apsPctBp ?? 0) + (ctx.state.rallyBp?.[tower.owner] ?? 0) + ms.apsBp + relicSum(ctx, tower.owner, 'apsPct');
  let boss = BP_ONE;
  const def = abilityOf(tower.tower);
  if (def) {
    const p = abilityParams(ctx, tower.owner, def);
    if (def.apsBonusBp) aps += def.apsBonusBp(tower, p);
    if (def.bossMulBp) boss = mulBp(boss, def.bossMulBp(p));
  }
  // V3 P2 사냥꾼 표식: 보스 피해 ×(1 + 값)
  const bossRelic = relicSum(ctx, tower.owner, 'bossPct');
  if (bossRelic > 0) boss = mulBp(boss, BP_ONE + bossRelic);
  if (atk < -BP_ONE) atk = -BP_ONE;
  // 개발자 확률 조정 'critBonus' (T-2): 모든 타워 치명타 확률 + (한도는 effectiveStats가 자른다)
  const crit = chanceBonus(ctx.state, 'critBonus') + ms.critBp;
  return crit > 0 ? { atkPctBp: atk, apsPctBp: aps, bossMulBp: boss, critBp: crit } : { atkPctBp: atk, apsPctBp: aps, bossMulBp: boss };
}

/**
 * V3 P2 유물 공격력% (합연산): 숫돌(모든 타워) + 쇠뇌 깃털(물리·혼합) + 별빛 잉크(마법·혼합) + 금화 망치(보유금 1,000원당, 상한).
 * 유물이 없으면 0.
 */
export function relicAtkBp(ctx: MatchContext, tower: Pick<Tower, 'owner' | 'tower'>): number {
  const dmg = ctx.rules.towers.get(tower.tower)?.damageType;
  let v = relicSum(ctx, tower.owner, 'atkPct');
  if (dmg === 'physical' || dmg === 'hybrid') v += relicSum(ctx, tower.owner, 'physPct');
  if (dmg === 'magic' || dmg === 'hybrid') v += relicSum(ctx, tower.owner, 'magicPct');
  return v + relicGoldAtkBp(ctx, tower.owner, ctx.state.gold);
}

/** 타워 하나가 주는 지원 효과 (없으면 null) — 화면이 범위를 그릴 때 읽는다. */
export function auraSpecOf(ctx: MatchContext, tower: Pick<Tower, 'tower' | 'owner'>): AuraSpec | null {
  const def = abilityOf(tower.tower);
  if (!def?.aura) return null;
  return boostAura(def.aura(abilityParams(ctx, tower.owner, def)), towerMilestone(ctx, tower.owner, tower.tower).auraBp);
}

/** 마일스톤 특색 강화(오라 종류): 오라 값 × (1 + bonus) 내림. bonus 0이면 그대로 (V3 P1). */
export function boostAura(spec: AuraSpec, bonusBp: number): AuraSpec {
  if (bonusBp <= 0) return spec;
  return { ...spec, atkPctBp: mulBp(spec.atkPctBp, BP_ONE + bonusBp), apsPctBp: mulBp(spec.apsPctBp, BP_ONE + bonusBp) };
}

/** 지원 효과 범위 → 칸 거리 (주변 8칸 1, 24칸 2, 전체 0). */
export function auraRadiusOf(rules: Pick<MatchRules, 'auraAround8' | 'auraAround24'>, area: AuraArea): number {
  return area === 'around8' ? rules.auraAround8 : area === 'around24' ? rules.auraAround24 : 0;
}
