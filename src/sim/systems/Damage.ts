/**
 * 피해 공식 (DEV_PLAN M3-4, GDD 5.4) — 순수 계산만 (상태를 바꾸지 않는다). 전투(Combat)·상태 이상 지속 피해(Status)·
 * 특색 능력(운석 등)·소환 병사가 같이 쓴다.
 *
 * 모든 계산은 공격력 × ATK_SCALE(100) 정수 단위에서 하고, 정수 피해로는 맨 끝에 한 번만 자른다:
 *  1. 쏠 때 (rollHit): 1회 공격력 × (1 + 공격력% 합) × 치명타 배율(치명타일 때). 관통 합·보스 배율도 이때 실어 보낸다.
 *  2. 맞을 때 (damageAgainst): × (1 + 받는 피해 증가% 합, 최대 +100%) × 보스 피해 배율(대상이 보스일 때).
 *     물리는 방어력, 마법은 마법 저항으로 깎는다: 감소율 A ÷ (A + 100),
 *     A = max(0, 방어력 × (1 − 관통 합) − 고정 관통), 관통 합 = 타워 + 강화 + 몹의 표식, 최대 90%.
 *     고정 피해(독·화상·출혈 포함)는 깎이지 않는다. 1회 피해 = 세 값의 합 (종류마다 따로 자르지 않는다).
 *  3. 합 + 나머지(0~99)를 100으로 나눈 몫이 실제 피해 (splitAtk).
 */
import type { Rng } from '../Rng';
import { BP_ONE, mulBp, mulDiv } from '../Fixed';
import type { Mob } from '../entities/Mob';
import { ATK_SCALE, type MatchRules, type TowerStats } from '../rules';
import { capPen, type EffectiveStats } from '../stats';

/**
 * 1회 공격 (× ATK_SCALE 정수): 공격력%·치명타를 곱한 물리·마법·고정 + 쏜 타워의 관통·보스 배율.
 * 관통·보스 배율·치명타를 생략하면 0·×1·아님 (M2 기본 피해와 같다).
 */
export interface RawHit {
  p: number;
  m: number;
  t: number;
  crit?: boolean;
  /** 방어·마법 관통 합 (bp, 한도 적용 전 — 맞을 때 몹의 표식을 더하고 90%로 자른다) */
  armorPenBp?: number;
  magicPenBp?: number;
  /** 고정 방어·마법 관통 (방어력 수치) */
  flatArmorPen?: number;
  flatMagicPen?: number;
  /** 보스 피해 배율 (bp, ×1 = 10000). 대상이 보스일 때만 곱한다 */
  bossMulBp?: number;
  /**
   * 공격한 타워의 데이터 id (M3b). 맞은 몹에게 그 타워의 지속 피해(dot)·특색 능력(둔화·빙결·표식·약화·즉사)을 건다.
   * 없으면(소환 병사·운석 같은 능력 피해) 아무것도 걸지 않는다.
   */
  src?: string;
  /** 공격한 타워의 주인 (특색 수치 레벨을 고를 때) */
  owner?: number;
  /** 지속 피해의 초당 피해 (× ATK_SCALE, 치명타 없이 공격력%만 반영). 0이면 지속 피해 없음 */
  dotDps?: number;
  /**
   * 화면 연출 표시 (예: 운석 'meteor'). 'hit' 사건에 그대로 실려 화면이 그 피해에만 연출을 붙인다
   * (같은 틱에 착탄한 같은 타워의 일반 투사체 피해와 구별 — 검토 반영). 규칙에는 쓰지 않는다.
   */
  fx?: string;
  /**
   * 광역 피해인가 (광역·근접 광역·연쇄·전체, M4-3): 방패병 보호막이 광역 피해를 2배로 받는다 (ENEMIES.md 6장).
   * Combat이 형태대로 붙인다. 단일·근접·관통·다중·지속 피해·능력 피해는 아님.
   */
  area?: boolean;
}

/** 몹에게 들어가는 피해 (× ATK_SCALE 정수): 종류별 + 합. */
export interface ScaledDamage {
  p: number;
  m: number;
  t: number;
  total: number;
}

/** 피해 계산 한도 (game.json combat → MatchRules). */
export interface DamageCaps {
  /** 방어·마법 관통 최대 (bp) */
  penMaxBp: number;
  /** 받는 피해 증가 합 최대 (bp) */
  vulnMaxBp: number;
}

/** 한도 없음 (단위 테스트용 기본값). 판에서는 rules의 한도를 넘긴다. */
export const NO_CAPS: DamageCaps = Object.freeze({ penMaxBp: BP_ONE, vulnMaxBp: Number.MAX_SAFE_INTEGER });

/** 피해 공식이 읽는 몹 값. 보스·약화·표식·피해 감소는 생략하면 아님·0. */
export type DamageTarget = Pick<Mob, 'armor' | 'magicRes'> & Partial<Pick<Mob, 'boss' | 'vulnBp' | 'markBp' | 'dmgCutBp'>>;

/** 방어 감소율 계산에 쓰는 '100' (A ÷ (A + 100))을 bp 단위로 */
const RESIST_BASE_BP = 100 * BP_ONE;

/**
 * 방어(또는 마법 저항) resist로 깎은 값: x × 100 ÷ (A + 100) 내림, A = max(0, resist × (1 − 관통) − 고정 관통).
 * A를 bp 단위 정수(resist × (10000 − 관통bp) − 고정 × 10000)로 들고 계산해 A가 소수여도 한 번만 내린다.
 * 예: 100 vs 방어 100 → 50, 관통 50% → A = 50 → 66, 100 vs 마저 60·관통 20% → A = 48 → 67, 방어 300 → 25.
 * @param penBp 관통 (bp, 한도는 부르는 쪽이 적용)
 */
export function reduceDamage(x: number, resist: number, penBp = 0, flatPen = 0): number {
  if (x <= 0) return 0;
  const aBp = resist * (BP_ONE - penBp) - flatPen * BP_ONE;
  if (aBp <= 0) return x;
  return mulDiv(x, RESIST_BASE_BP, aBp + RESIST_BASE_BP);
}

/** × ATK_SCALE 피해 합과 나머지(0 ~ ATK_SCALE − 1) → 이번 정수 피해와 새 나머지. */
export function splitAtk(totalC: number, rem: number): { dmg: number; rem: number } {
  const total = totalC + rem;
  const dmg = Math.floor(total / ATK_SCALE);
  return { dmg, rem: total - dmg * ATK_SCALE };
}

/** 확률 판정 (bp): 0 이하면 난수를 쓰지 않고 false, 100% 이상이면 난수 없이 true (치명타·광부 돈·도박꾼 등). */
export function rollChanceBp(rng: Rng, chance: number): boolean {
  if (chance <= 0) return false;
  if (chance >= BP_ONE) return true;
  return rng.chanceBp(chance);
}

/** 치명타 판정: 확률 0이면 난수를 쓰지 않고 아님, 100% 이상이면 난수 없이 치명타. */
export function rollCrit(rng: Rng, critBp: number): boolean {
  return rollChanceBp(rng, critBp);
}

/**
 * 타워의 1회 공격 (× ATK_SCALE): 기본 공격력 × 공격력 배율 × 치명타 배율(crit일 때). 관통·보스 배율을 같이 싣는다.
 * eff를 생략하면 데이터 기본값 (공격력% 0, 타워 관통만). 지속 피해가 있는 타워는 초당 피해(dotDps)도 싣는다
 * (= 치명타 없는 1회 공격력 합 × 초당 비율, GDD 5.4 '독·화상·출혈: 고정 피해, 치명타 없음').
 */
export function rollHit(stats: TowerStats, eff?: EffectiveStats, crit = false): RawHit {
  const atkMul = eff?.atkMulBp ?? BP_ONE;
  const critMul = crit ? (eff?.critMulBp ?? stats.critMulBp) : BP_ONE;
  const f = (x: number): number => (x > 0 ? mulBp(mulBp(x, atkMul), critMul) : 0);
  const hit: RawHit = {
    p: f(stats.atkC),
    m: f(stats.matkC),
    t: f(stats.tatkC),
    crit,
    armorPenBp: eff?.armorPenBp ?? stats.armorPenBp,
    magicPenBp: eff?.magicPenBp ?? stats.magicPenBp,
    flatArmorPen: eff?.flatArmorPen ?? 0,
    flatMagicPen: eff?.flatMagicPen ?? 0,
    bossMulBp: eff?.bossMulBp ?? BP_ONE,
    src: stats.id,
  };
  if (stats.dot) {
    const base = mulBp(stats.atkC + stats.matkC + stats.tatkC, atkMul);
    hit.dotDps = mulBp(base, stats.dot.perSecBp);
  }
  return hit;
}

/** 피해에 배율(bp)을 곱한 새 공격 (연쇄 감소 등). 관통·보스 배율·치명타·출처는 그대로. */
export function scaleHit(hit: RawHit, mulBpValue: number): RawHit {
  return { ...hit, p: mulBp(hit.p, mulBpValue), m: mulBp(hit.m, mulBpValue), t: mulBp(hit.t, mulBpValue) };
}

/** 피해에 분수 num/den을 곱한 새 공격 (도박꾼 주사위: × 눈 ÷ 평균). 내림. */
export function scaleHitFrac(hit: RawHit, num: number, den: number): RawHit {
  const f = (x: number): number => (x > 0 ? mulDiv(x, num, den) : 0);
  return { ...hit, p: f(hit.p), m: f(hit.m), t: f(hit.t) };
}

/** 연쇄 k번째 튕김의 피해 배율 (bp): keep^k (k = 0이면 ×1). */
export function chainFalloffBp(keepBp: number, k: number): number {
  let v = BP_ONE;
  for (let i = 0; i < k; i++) v = mulBp(v, keepBp);
  return v;
}

/**
 * 몹에게 실제로 들어가는 피해 (× ATK_SCALE, 종류별 + 합계).
 * × (1 + 약화, 한도) × 보스 배율(보스일 때) → 물리는 방어력, 마법은 마법 저항으로 감소(관통 + 표식, 한도) → 고정은 그대로.
 */
export function damageAgainst(hit: RawHit, mob: DamageTarget, caps: DamageCaps = NO_CAPS): ScaledDamage {
  const vulnRaw = mob.vulnBp ?? 0;
  const vuln = vulnRaw < 0 ? 0 : vulnRaw > caps.vulnMaxBp ? caps.vulnMaxBp : vulnRaw;
  const boss = mob.boss === true ? (hit.bossMulBp ?? BP_ONE) : BP_ONE;
  // 받는 피해 감소 (혼돈의 용 66%·33% −50%, M4-5): 모든 종류에 곱한다
  const cutRaw = mob.dmgCutBp ?? 0;
  const keep = cutRaw <= 0 ? BP_ONE : cutRaw >= BP_ONE ? 0 : BP_ONE - cutRaw;
  const amp = (x: number): number => {
    if (x <= 0) return 0;
    let v = vuln > 0 ? mulBp(x, BP_ONE + vuln) : x;
    if (boss !== BP_ONE) v = mulBp(v, boss);
    if (keep !== BP_ONE) v = mulBp(v, keep);
    return v;
  };
  const mark = mob.markBp ?? 0;
  const p = reduceDamage(amp(hit.p), mob.armor, capPen((hit.armorPenBp ?? 0) + mark, caps.penMaxBp), hit.flatArmorPen ?? 0);
  const m = reduceDamage(amp(hit.m), mob.magicRes, capPen((hit.magicPenBp ?? 0) + mark, caps.penMaxBp), hit.flatMagicPen ?? 0);
  const t = amp(hit.t);
  return { p, m, t, total: p + m + t };
}

/** value × 10000 ÷ bpValue 내림 (bpValue > 0). 큰 값도 2^53을 넘지 않게 몫·나머지로. */
export function divBp(value: number, bpValue: number): number {
  const q = Math.floor(value / bpValue);
  const r = value - q * bpValue;
  return q * BP_ONE + Math.floor((r * BP_ONE) / bpValue);
}

/**
 * 보호막 (방패병, M4-3): 정수 피해 dmg 중 보호막이 막은 양을 돌려주고 보호막을 깎는다 (체력에는 dmg − 막은 양).
 * 광역 피해는 보호막에 areaMulBp배(×2)로 들어간다 → 보호막 100에 광역 30 = 보호막 −60, 광역 80 = 보호막 0 + 체력 −30.
 * 보호막이 없으면 0.
 */
export function absorbShield(mob: Pick<Mob, 'shield'>, dmg: number, areaMulBp = BP_ONE): number {
  if (mob.shield <= 0 || dmg <= 0) return 0;
  const mul = areaMulBp > 0 ? areaMulBp : BP_ONE;
  const toShield = mul === BP_ONE ? dmg : mulBp(dmg, mul);
  if (toShield <= mob.shield) {
    mob.shield -= toShield;
    return dmg;
  }
  // 넘친 만큼(보호막 단위)을 피해 단위로 되돌려 체력으로
  const over = toShield - mob.shield;
  mob.shield = 0;
  const back = mul === BP_ONE ? over : divBp(over, mul);
  return dmg - back < 0 ? 0 : dmg - back;
}

/** 판 규칙의 피해 한도. */
export function damageCaps(rules: Pick<MatchRules, 'penMaxBp' | 'vulnMaxBp'>): DamageCaps {
  return { penMaxBp: rules.penMaxBp, vulnMaxBp: rules.vulnMaxBp };
}
