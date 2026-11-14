/**
 * 판 규칙 수치: GameData(JSON, 소수 포함) → sim이 쓰는 정수 값.
 *
 * 데이터의 소수는 여기서 한 번만 정수로 바꾼다 (CLAUDE.md 2장 3번): 퍼센트·배율 → bp, 속도(칸/초) → 단위/초, 초 → 틱.
 * sim 상태에는 이 정수만 들어간다 (hash.ts가 소수를 거부한다).
 *
 * 성장 곡선 (ENEMIES.md 2장, BALANCE.md 1·3장):
 *  - 기준 체력 HP(s): curves.json 표 (tools/precompute-curves.mjs가 거듭제곱으로 미리 계산)
 *  - 방어력·마법 저항: mulBp(기본값, armorMulBp[s]) + armorFlat[s]  (= 기본값 × (1 + 0.02s) 내림 + max(0, s − 100))
 *  - 처치 보상: mulBp(base + ⌊s / perStages⌋, rewardMulBp)  (= (10 + ⌊s/10⌋) × 배율 내림)
 *  - 표 끝(maxStage = 500)을 넘는 단계는 마지막 값을 쓴다 (HP(500) ≈ 9.6×10¹³. 실제로 닿을 일이 없는 단계).
 */
import type { CurvesFile, GameData, MobData, ThemeData } from '../data/load';
import { BP_ONE, bp, idiv, mulBp, tiles } from './Fixed';
import { TICK_HZ, secondsToTicks } from './World';

/** 몹 하나의 기본 스탯 (단계 성장 전, 정수). */
export interface MobStats {
  readonly id: string;
  readonly name: string;
  readonly legion: string;
  readonly size: string;
  readonly hpMulBp: number;
  readonly armor: number;
  readonly magicRes: number;
  /** 이동 속도 (단위/초). 1.5칸/초 = 1500 */
  readonly speed: number;
  readonly ccResistBp: number;
  readonly lifeDamage: number;
  readonly rewardMulBp: number;
  /** 1칸에 붙어서 나오는 수 (암흑 고블린 떼 3) */
  readonly swarm: number;
  readonly invisible: boolean;
  readonly spawnOnly: boolean;
  readonly special: boolean;
}

/** 등장 구성표 한 줄: stages [from, to]에서 몹별 칸 수 (몹 순서 = enemies.json mobs 순서). */
export interface CompositionBand {
  readonly from: number;
  readonly to: number;
  readonly mix: readonly (readonly [string, number])[];
}

/** 등장 순서 규칙 (칸 번호 0부터, 양 끝 포함). */
export interface SpawnOrderRules {
  readonly middleFrom: number;
  readonly middleTo: number;
  readonly middleMobs: ReadonlySet<string>;
  readonly backFrom: number;
  readonly backTo: number;
}

/** 테마 보정 (캠페인 테마 t, 무한 모드는 기본값). BALANCE.md 5.4 */
export interface ThemeMods {
  readonly theme: number;
  readonly hpMulBp: number;
  readonly armorOffset: number;
  readonly specialOffset: number;
}

export const NO_THEME: ThemeMods = Object.freeze({ theme: 0, hpMulBp: BP_ONE, armorOffset: 0, specialOffset: 0 });

export interface MatchRules {
  readonly mobs: ReadonlyMap<string, MobStats>;
  /** enemies.json mobs 순서 (구성표를 펼칠 때 이 순서로) */
  readonly mobOrder: readonly string[];
  readonly composition: readonly CompositionBand[];
  readonly spawnOrder: SpawnOrderRules;
  readonly curves: Pick<CurvesFile, 'maxStage' | 'hp' | 'armorMulBp' | 'armorFlat'>;
  readonly rewardBase: number;
  readonly rewardPerStages: number;
  readonly startGold: number;
  readonly prepTicks: number;
  readonly stageTicks: number;
  readonly slotsPerStage: number;
  readonly spawnIntervalTicks: number;
  readonly bossEvery: number;
}

/** 정수여야 하는 데이터 값 확인 (스키마가 num만 보장하는 필드). */
function int(name: string, v: number): number {
  if (!Number.isSafeInteger(v)) throw new Error(`${name}: 정수여야 하는데 ${v}`);
  return v;
}

/** 소수 초 → 틱 (1틱 단위가 아니면 에러). */
export function secondsToTicksExact(seconds: number): number {
  const t = Math.round(seconds * TICK_HZ);
  if (Math.abs(t - seconds * TICK_HZ) > 1e-9) throw new Error(`${seconds}초는 1틱(${1000 / TICK_HZ}ms) 단위가 아니다`);
  return t;
}

export function buildMobStats(m: MobData): MobStats {
  return Object.freeze({
    id: m.id,
    name: m.name,
    legion: m.legion,
    size: m.size,
    hpMulBp: bp(m.hpMul),
    armor: int(`${m.id}.armor`, m.armor),
    magicRes: int(`${m.id}.magicRes`, m.magicRes),
    speed: tiles(m.speed),
    ccResistBp: bp(m.ccResist),
    lifeDamage: m.lifeDamage,
    rewardMulBp: bp(m.rewardMul),
    swarm: m.swarm ?? 1,
    invisible: m.invisible === true,
    spawnOnly: m.spawnOnly === true,
    special: m.special,
  });
}

const rulesCache = new WeakMap<GameData, MatchRules>();

/** GameData → 정수 규칙. 같은 데이터 객체면 캐시를 돌려준다. */
export function buildMatchRules(data: GameData): MatchRules {
  const cached = rulesCache.get(data);
  if (cached) return cached;
  const { enemies, game, curves } = data;
  const mobs = new Map<string, MobStats>();
  for (const m of enemies.mobs) mobs.set(m.id, buildMobStats(m));
  const mobOrder = enemies.mobs.map((m) => m.id);
  const composition = enemies.composition.map((c) =>
    Object.freeze({
      from: c.stages[0],
      to: c.stages[1],
      mix: Object.freeze(mobOrder.filter((id) => (c.mix[id] ?? 0) > 0).map((id) => Object.freeze([id, c.mix[id] as number] as const))),
    }),
  );
  const so = enemies.spawnOrder;
  const match = game.match;
  const rules: MatchRules = Object.freeze({
    mobs,
    mobOrder,
    composition,
    spawnOrder: Object.freeze({
      middleFrom: so.middle.slots[0] - 1,
      middleTo: so.middle.slots[1] - 1,
      middleMobs: new Set(so.middle.mobs),
      backFrom: so.back.slots[0] - 1,
      backTo: so.back.slots[1] - 1,
    }),
    curves: { maxStage: curves.maxStage, hp: curves.hp, armorMulBp: curves.armorMulBp, armorFlat: curves.armorFlat },
    rewardBase: enemies.growth.reward.base,
    rewardPerStages: enemies.growth.reward.perStages,
    startGold: match.startGold,
    prepTicks: secondsToTicks(match.prepSeconds),
    stageTicks: secondsToTicks(match.stageSeconds),
    slotsPerStage: match.slotsPerStage,
    spawnIntervalTicks: secondsToTicksExact(match.spawnIntervalSeconds),
    bossEvery: match.bossEvery,
  });
  // 한 단계의 등장이 다음 단계 시작 전에 끝나야 한다 (GDD 2.2: 50초 등장 + 10초 휴식)
  if ((rules.slotsPerStage - 1) * rules.spawnIntervalTicks >= rules.stageTicks) {
    throw new Error(
      `game.json match: 단계당 ${rules.slotsPerStage}칸 × ${match.spawnIntervalSeconds}초 간격이 단계 길이 ${match.stageSeconds}초 안에 끝나지 않는다`,
    );
  }
  rulesCache.set(data, rules);
  return rules;
}

/** 캠페인 테마 보정 (bp·정수). */
export function themeMods(theme: ThemeData): ThemeMods {
  return Object.freeze({
    theme: theme.theme,
    hpMulBp: bp(theme.hpMul),
    armorOffset: int(`테마 ${theme.theme} armorOffset`, theme.armorOffset),
    specialOffset: theme.specialOffset,
  });
}

/** 표 인덱스로 쓸 단계 (0 ~ maxStage로 자름). */
function curveIndex(rules: MatchRules, stage: number): number {
  return stage < 0 ? 0 : stage > rules.curves.maxStage ? rules.curves.maxStage : stage;
}

/** 단계 기준 체력 HP(s). */
export function stageHp(rules: MatchRules, stage: number): number {
  return rules.curves.hp[curveIndex(rules, stage)] as number;
}

/** 단계에 따른 방어력·마법 저항 (기본값 × (1 + 0.02s) 내림 + max(0, s − 100)). */
export function stageArmor(rules: MatchRules, base: number, stage: number): number {
  const i = curveIndex(rules, stage);
  return mulBp(base, rules.curves.armorMulBp[i] as number) + (rules.curves.armorFlat[i] as number);
}

/** 처치 보상 (10 + ⌊s/10⌋) × 배율, 내림. 예: 10단계 슬라임 = 11원. */
export function killReward(rules: MatchRules, stage: number, rewardMulBp: number): number {
  return mulBp(rules.rewardBase + idiv(stage, rules.rewardPerStages), rewardMulBp);
}

/** 그 단계의 등장 구성 (없으면 null). */
export function compositionFor(rules: MatchRules, stage: number): CompositionBand | null {
  for (const c of rules.composition) if (stage >= c.from && stage <= c.to) return c;
  return null;
}

/** 보스 단계인가 (10의 배수). */
export function isBossStage(rules: MatchRules, stage: number): boolean {
  return stage > 0 && stage % rules.bossEvery === 0;
}

/** 단계 s에 등장하는 몹 하나의 실제 스탯 (체력 배율·테마 보정 반영). */
export interface SpawnStats {
  hp: number;
  armor: number;
  magicRes: number;
  reward: number;
}

export function spawnStats(rules: MatchRules, mob: MobStats, stage: number, theme: ThemeMods = NO_THEME): SpawnStats {
  const hp = mulBp(mulBp(stageHp(rules, stage), mob.hpMulBp), theme.hpMulBp);
  return {
    // 체력 1 미만이면 바로 죽은 몹이 되므로 최소 1
    hp: hp < 1 ? 1 : hp,
    armor: stageArmor(rules, mob.armor, stage) + theme.armorOffset,
    magicRes: stageArmor(rules, mob.magicRes, stage) + theme.armorOffset,
    reward: killReward(rules, stage, mob.rewardMulBp),
  };
}
