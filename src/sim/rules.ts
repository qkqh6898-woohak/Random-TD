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
 *
 * 타워 (M2, towers.json → TowerStats):
 *  - 사거리(칸) → 단위 (1.5칸 = 1500), 공속(회/초) → ×1000 정수 (0.8 → 800), 공격력 → ×100 정수 (6.5 → 650).
 *    공격력의 ×100 나머지는 타워마다 이어 가서(Tower.remP 등) 소수 공격력도 평균적으로 정확하게 들어간다.
 *  - 근접(melee·melee_aoe)과 전체(global)는 즉시 피해, 나머지는 투사체(초속 12칸)가 도착할 때 피해 (GDD 5.2).
 */
import { DECK_GRADES, deckIssues, type DeckData } from '../data/deck';
import type { CurvesFile, DamageType, GameData, Grade, MobData, Shape, TargetRule, ThemeData, TowerData } from '../data/load';
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

/** 공속 정수 배율: 초당 공격 횟수 × 1000 (0.3회/초 = 300) */
export const APS_SCALE = 1000;
/** 공격력 정수 배율: 1회 공격력 × 100 (6.5 = 650) */
export const ATK_SCALE = 100;

/** 즉시 피해 공격 형태 (GDD 5.2: 원거리는 투사체, 근접·광역 일부는 즉시) */
export const INSTANT_SHAPES: ReadonlySet<Shape> = new Set<Shape>(['melee', 'melee_aoe', 'global']);

/** 타워 하나의 기본 스탯 (타워 Lv1·판 내 강화 0, 정수). */
export interface TowerStats {
  readonly id: string;
  readonly name: string;
  readonly grade: Grade;
  readonly faction: string;
  readonly damageType: DamageType;
  readonly shape: Shape;
  /** 즉시 피해(근접·전체)인가. 아니면 투사체 */
  readonly instant: boolean;
  /** 사거리 (단위). 1.5칸 = 1500 */
  readonly range: number;
  /** 초당 공격 횟수 × APS_SCALE */
  readonly apsMilli: number;
  /** 1회 물리·마법·고정 공격력 × ATK_SCALE */
  readonly atkC: number;
  readonly matkC: number;
  readonly tatkC: number;
  /** 대상 우선순위 (M2는 모두 '선두'로 고른다. 최대 체력·보스 우선 등은 M3) */
  readonly target: TargetRule;
}

/** 덱 (등급별 타워 id). */
export type Deck = Readonly<Record<(typeof DECK_GRADES)[number], readonly string[]>>;

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
  /** 타워 기본 스탯 (towers.json 전체 65종, id → 스탯) */
  readonly towers: ReadonlyMap<string, TowerStats>;
  /** 신 타워 id (towers.json 순서). 소환·승급 때 신 판정에 걸리면 이 중 균등 */
  readonly godTowers: readonly string[];
  /** 소환 비용 (원) */
  readonly summonCost: number;
  /** 신 타워 확률 (bp, 0.01% = 1) */
  readonly godChanceBp: number;
  /** 투사체 속도 (단위/틱). 12칸/초 = 600 */
  readonly projectileSpeed: number;
  /** 기본 덱 (decks.json base) */
  readonly baseDeck: Deck;
  /** 덱의 등급별 종류 수 (5) */
  readonly deckPerGrade: number;
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

export function buildTowerStats(t: TowerData): TowerStats {
  return Object.freeze({
    id: t.id,
    name: t.name,
    grade: t.grade,
    faction: t.faction,
    damageType: t.damageType,
    shape: t.shape,
    instant: INSTANT_SHAPES.has(t.shape),
    range: tiles(t.range),
    apsMilli: Math.round(t.aps * APS_SCALE),
    atkC: Math.round(t.atk * ATK_SCALE),
    matkC: Math.round(t.matk * ATK_SCALE),
    tatkC: Math.round(t.tatk * ATK_SCALE),
    target: t.target,
  });
}

function freezeDeck(deck: DeckData): Deck {
  return Object.freeze(Object.fromEntries(DECK_GRADES.map((g) => [g, Object.freeze([...deck[g]])]))) as Deck;
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
  const towers = new Map<string, TowerStats>();
  for (const t of data.towers.towers) towers.set(t.id, buildTowerStats(t));
  const projectileUnitsPerSec = tiles(game.combat.projectileSpeed);
  if (projectileUnitsPerSec % TICK_HZ !== 0 || projectileUnitsPerSec <= 0) {
    throw new Error(`game.json combat.projectileSpeed ${game.combat.projectileSpeed}칸/초는 1틱에 정수 단위로 움직이지 않는다`);
  }
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
    towers,
    godTowers: Object.freeze(data.towers.towers.filter((t) => t.grade === 'god').map((t) => t.id)),
    summonCost: game.summon.cost,
    godChanceBp: bp(game.summon.godChance),
    projectileSpeed: projectileUnitsPerSec / TICK_HZ,
    baseDeck: freezeDeck(data.decks.base),
    deckPerGrade: data.decks.perGrade,
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

/** 덱 검사 (등급별 5종, 같은 등급의 서로 다른 타워). 문제가 있으면 에러 (판을 만들 때). */
export function checkDeck(rules: MatchRules, deck: Deck, label = '덱'): void {
  const issues = deckIssues(deck, [...rules.towers.values()], rules.deckPerGrade, label);
  if (issues.length > 0) throw new Error(`${label}가 올바르지 않다: ${issues.map((i) => `${i.path}: ${i.message}`).join(' / ')}`);
}
