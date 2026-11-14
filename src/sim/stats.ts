/**
 * 타워의 지금 능력치 (DEV_PLAN M3-4, GDD 5.4 '규칙' 표). 기본 스탯(TowerStats, 데이터) + 판 내 보정(PlayerMods) → 실제로 쓰는 값.
 *
 * - 공격력%: 모두 더한 뒤 한 번 곱한다 (합연산). 배율 = 1 + 공격력% 합.
 * - 공속%: 모두 더한다. 최종 공속 = 기본 × (1 + 공속% 합), **최대 기본의 5배**, 그리고 **초당 15회**를 넘지 않는다 (game.json combat).
 *   0 아래로는 내려가지 않는다.
 * - 치명타 확률: 타워 + 강화 + 특성, 최대 100%. 치명타 배율: 타워 배율(기본 ×2, 저격수 ×3) + '치명타 피해' 강화.
 * - 방어·마법 관통: 타워 + 강화 + 상점 (+ 몹의 표식은 맞을 때 더한다), 각각 최대 90%.
 * - 보스 피해 배율: ×(1 + 보스 피해% 합) — 특성 '거인 사냥꾼'. 그림자 암살자 ×2 → ×3.5는 특색(M3-9)이 여기에 곱한다.
 * PlayerMods는 판 상태(MatchState.mods)라 해시에 들어간다. 판 내 강화(M5)·카드(M4)·상점(M8)·특성이 값을 더한다. 지금은 모두 0.
 * 타워마다 다른 보정(TowerBonus: 오라 M3-7, 타워 레벨 공격력, 특색의 자기 보정 — 광전사 공속·암살자 보스 배율)은
 * 네 번째 인자로 더한다 (Aura.towerBonus가 만든다). 종족 시너지(M7)도 여기에 더하면 된다.
 */
import type { MatchRules, TowerStats } from './rules';
import { BP_ONE, mulBp } from './Fixed';

/** 판 내 능력치 보정 (플레이어별, 모두 bp 또는 정수). 0 = 보정 없음. */
export interface PlayerMods {
  /** 공격력% 합 (bp, +25% = 2500) */
  atkPctBp: number;
  /** 공격속도% 합 (bp) */
  apsPctBp: number;
  /** 물리 관통 강화 (bp) */
  armorPenBp: number;
  /** 마법 관통 강화 (bp) */
  magicPenBp: number;
  /** 고정 방어·마법 관통 (방어력 수치를 그만큼 빼고 계산) */
  flatArmorPen: number;
  flatMagicPen: number;
  /** 치명타 확률 (bp) */
  critChanceBp: number;
  /** 치명타 피해 증가 (bp, 배율에 더한다: ×2 + 5000 = ×2.5) */
  critMulBp: number;
  /** 보스 피해% 합 (bp) */
  bossDmgPctBp: number;
}

export function newPlayerMods(): PlayerMods {
  return {
    atkPctBp: 0,
    apsPctBp: 0,
    armorPenBp: 0,
    magicPenBp: 0,
    flatArmorPen: 0,
    flatMagicPen: 0,
    critChanceBp: 0,
    critMulBp: 0,
    bossDmgPctBp: 0,
  };
}

export const NO_MODS: Readonly<PlayerMods> = Object.freeze(newPlayerMods());

/** 타워 한 개에만 붙는 보정 (오라·레벨·자기 특색). 공격력%·공속%는 PlayerMods에 더하고(합연산), 보스 배율은 곱한다. */
export interface TowerBonus {
  /** 공격력% (bp) — 오라(대장장이·학자) + 타워 레벨 (레벨당 +4%) */
  atkPctBp: number;
  /** 공속% (bp) — 오라(전쟁 군주) + 광전사 연속 공격 */
  apsPctBp: number;
  /** 보스 피해 배율 (bp, ×1 = 10000) — 그림자 암살자 ×2 → ×3.5 */
  bossMulBp: number;
}

export const NO_BONUS: Readonly<TowerBonus> = Object.freeze({ atkPctBp: 0, apsPctBp: 0, bossMulBp: BP_ONE });

/** 타워의 지금 능력치 (정수). */
export interface EffectiveStats {
  /** 최종 공속 × APS_SCALE (한도 적용) */
  apsMilli: number;
  /** 최종 공속 ÷ 기본 공속 (bp, 표시용 '×2.6' = 26000). 기본 공속이 0이면 10000 */
  apsMulBp: number;
  /** 공속 한도에 걸렸는가 */
  apsCapped: boolean;
  /** 공격력 배율 (bp, 1 + 공격력% 합) */
  atkMulBp: number;
  /** 방어·마법 관통 합 (bp, 한도 적용 전 — 맞을 때 몹의 표식을 더하고 한도로 자른다) */
  armorPenBp: number;
  magicPenBp: number;
  flatArmorPen: number;
  flatMagicPen: number;
  /** 치명타 확률 (bp, 한도 적용) */
  critBp: number;
  /** 치명타 배율 (bp) */
  critMulBp: number;
  /** 보스 피해 배율 (bp, ×1 = 10000) */
  bossMulBp: number;
}

/**
 * 최종 공속 (× APS_SCALE): 기본 × (1 + 공속% 합) 내림 → 기본의 apsMaxMul배와 초당 apsMaxPerSec회 중 작은 값으로 자름, 0 이상.
 * 예 (한도 ×5·15회): 1회/초 +500% → 5회/초, 2.5회/초 +900% → 12.5회/초, 3회/초 +500% → 15회/초.
 */
export function cappedAps(rules: Pick<MatchRules, 'apsMaxMul' | 'apsMaxMilli'>, baseMilli: number, apsPctBp: number): number {
  const raw = mulBp(baseMilli, BP_ONE + apsPctBp);
  const cap = Math.min(baseMilli * rules.apsMaxMul, rules.apsMaxMilli);
  return raw < 0 ? 0 : raw > cap ? cap : raw;
}

/** 관통 합을 한도(bp)로 자른다 (0 ~ 한도). */
export function capPen(penBp: number, maxBp: number): number {
  return penBp < 0 ? 0 : penBp > maxBp ? maxBp : penBp;
}

export function effectiveStats(
  rules: MatchRules,
  stats: TowerStats,
  mods: Readonly<PlayerMods> = NO_MODS,
  bonus: Readonly<TowerBonus> = NO_BONUS,
): EffectiveStats {
  const apsPct = mods.apsPctBp + bonus.apsPctBp;
  const apsMilli = cappedAps(rules, stats.apsMilli, apsPct);
  const uncapped = mulBp(stats.apsMilli, BP_ONE + apsPct);
  const crit = stats.critBp + mods.critChanceBp;
  const atkMul = BP_ONE + mods.atkPctBp + bonus.atkPctBp;
  return {
    apsMilli,
    apsMulBp: stats.apsMilli > 0 ? Math.floor((apsMilli * BP_ONE) / stats.apsMilli) : BP_ONE,
    apsCapped: uncapped > apsMilli,
    atkMulBp: atkMul < 0 ? 0 : atkMul,
    armorPenBp: stats.armorPenBp + mods.armorPenBp,
    magicPenBp: stats.magicPenBp + mods.magicPenBp,
    flatArmorPen: mods.flatArmorPen,
    flatMagicPen: mods.flatMagicPen,
    critBp: crit < 0 ? 0 : crit > rules.critChanceMaxBp ? rules.critChanceMaxBp : crit,
    critMulBp: stats.critMulBp + mods.critMulBp,
    bossMulBp: mulBp(BP_ONE + mods.bossDmgPctBp, bonus.bossMulBp),
  };
}
