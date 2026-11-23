/**
 * 판 규칙 수치: GameData(JSON, 소수 포함) → sim이 쓰는 정수 값.
 *
 * 데이터의 소수는 여기서 한 번만 정수로 바꾼다 (CLAUDE.md 2장 3번): 퍼센트·배율 → bp, 속도(칸/초) → 단위/초, 초 → 틱.
 * sim 상태에는 이 정수만 들어간다 (hash.ts가 소수를 거부한다).
 *
 * 성장 곡선 (ENEMIES.md 2장, BALANCE.md 1·3장):
 *  - 기준 체력 HP(s): curves.json 표 (tools/precompute-curves.mjs가 거듭제곱으로 미리 계산)
 *  - 방어력·마법 저항: mulBp(기본값, armorMulBp[s]) + armorFlat[s]  (= 기본값 × (1 + 0.02s) 내림 + max(0, s − 100))
 *  - 처치 보상: mulBp(base + ⌊s / perStages⌋, rewardMulBp)  (= (5 + ⌊s/4⌋) × 배율 내림 — V2 사용자 결정 D, PR-A는 3 + ⌊s/4⌋, 예전 (10 + ⌊s/10⌋))
 *  - 표 끝(maxStage = 500)을 넘는 단계는 마지막 값을 쓴다 (HP(500) ≈ 9.6×10¹³. 실제로 닿을 일이 없는 단계).
 *
 * 타워 (M2, towers.json → TowerStats):
 *  - 사거리(칸) → 단위 (1.5칸 = 1500), 공속(회/초) → ×1000 정수 (0.8 → 800), 공격력 → ×100 정수 (6.5 → 650).
 *    피해는 ×100 단위로 방어까지 계산한 뒤 정수로 한 번만 자르고, 나머지는 타워마다 이어 간다(Tower.remDmg)
 *    → 소수 공격력·방어로 깎인 소수 피해도 평균적으로 정확하게 들어간다 (Combat).
 *  - 근접(melee·melee_aoe)과 전체(global)는 즉시 피해, 나머지는 투사체(초속 12칸)가 도착할 때 피해 (GDD 5.2).
 *  - M3: 공격 형태 값(광역 반경 → 단위, 관통·연쇄·다중 → 마리 수), 관통·치명타(bp), 감지. 공속 한도·관통 최대·연쇄 감소 등
 *    전투 규칙 수치는 game.json combat, 승급 개수는 game.json merge (MatchRules).
 */
import { GRADE_RANK } from '../data/grades';
import { DECK_GRADES, deckIssues, type DeckData } from '../data/deck';
import type {
  BossData,
  CardEffectType,
  CardPool,
  GachaGrade,
  UltKind,
  ChallengeData,
  CurvesFile,
  DamageType,
  Detect,
  GameData,
  Grade,
  MissionData,
  MobData,
  Shape,
  TargetRule,
  ThemeData,
  TowerData,
  TraitBoostKind,
  UpgradeStat,
} from '../data/load';
import { BP_ONE, bp, idiv, mulBp, tiles } from './Fixed';
import { TICK_HZ, secondsToTicks } from './World';
import { buildRelicRules, type RelicRule } from './relics';

/** 몹 하나의 기본 스탯 (단계 성장 전, 정수). */
/** V3 P1 영웅 마일스톤 한 칸 (정수 bp) */
export interface MilestoneRule {
  readonly level: number;
  readonly atkBp: number;
  readonly apsBp: number;
  readonly trait: boolean;
}

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
  /** 단일 공격 회피 확률 (bp, 유령 30% = 3000. 없으면 0) — M4-3 */
  readonly evadeBp: number;
  /** 치유 (치유사): 주기(틱)·반경(단위)·회복 비율(bp). 없으면 null */
  readonly heal: { readonly intervalTicks: number; readonly radius: number; readonly pctBp: number } | null;
  /** 보호막 (방패병): 최대 체력 비율(bp)·광역 피해 배율(bp, ×2 = 20000). 없으면 null */
  readonly shield: { readonly pctBp: number; readonly areaMulBp: number } | null;
  /** 가속 (그림자 늑대): 체력 이 비율(bp) 이하에서 이동속도 +speedBp. 없으면 null */
  readonly haste: { readonly belowBp: number; readonly speedBp: number } | null;
  /** 죽으면 깨져서 나오는 몹 (분열 슬라임·보석 골렘). 없으면 null */
  readonly split: SplitStats | null;
}

/** 깨짐 (M4-3): 몹 id·마리 수·체력(부모 최대 체력 × bp)·속도(단위/초, null = 그 몹 속도)·보상(원, null = 그 몹 보상). */
export interface SplitStats {
  readonly id: string;
  readonly count: number;
  readonly hpBp: number;
  readonly speed: number | null;
  readonly reward: number | null;
  readonly small: boolean;
}

/** 기본 보스 하나의 스탯 (단계 성장 전, 정수) — ENEMIES.md 4장. 패턴 수치(params)는 보스 모듈(src/sim/bosses)이 compile한다. */
export interface BossStats {
  readonly id: string;
  readonly name: string;
  /** 데이터 '기본 단계' (표 표시용 + 무한 순환에 아직 없는 보스를 대신할 때) */
  readonly stage: number;
  readonly legion: string;
  readonly rank: string;
  readonly hpMulBp: number;
  readonly armor: number;
  readonly magicRes: number;
  readonly speed: number;
  readonly ccResistBp: number;
  readonly invisible: boolean;
  /** F10-2: 대응 한 줄 (보스 예고·패배 화면 글자, sim 규칙에는 안 씀) */
  readonly counter: string;
  readonly params: Readonly<Record<string, unknown>>;
}

/** 조합 편대 (ENEMIES.md 3.4, M4-3b): 구성(몹 순서 = enemies.json mobs 순서)·무한 모드 등장 단계·예고 글자. */
export interface FormationStats {
  readonly id: string;
  readonly name: string;
  readonly from: number;
  readonly mix: readonly (readonly [string, number])[];
  readonly banner: string;
  readonly hint: string;
}

/** 보스 효과 카드 (GDD 3.1, M4-7) — 수치는 정수 단위로 바꾼 값. */
export interface CardStats {
  readonly id: string;
  readonly name: string;
  readonly rare: boolean;
  readonly desc: string;
  readonly type: CardEffectType;
  /** 효과 값: 비율은 bp, 원·횟수·배율은 정수 */
  readonly value: number;
  /** 소환 할인 최소 비용 (원) / 이동속도 감소 합 최대 (bp) */
  readonly limit: number;
  /** 쌍둥이 소환 지속 (틱) */
  readonly ticks: number;
  /** 나오는 묶음 (G-1: boss 보스 보상 · pick 3택 1 강화 선택) */
  readonly pools: readonly CardPool[];
}

/** 소환 도박 결과 등급 순위 (G-1): 꽝 0 · 노말 1 · 레어 2 · 유니크 3 · 히어로 4 · 레전드 5 · 신 6. 천장 '이상' 비교에 쓴다 */
export const GACHA_RANK: Readonly<Record<GachaGrade, number>> = Object.freeze({
  none: 0,
  normal: GRADE_RANK.normal,
  rare: GRADE_RANK.rare,
  unique: GRADE_RANK.unique,
  hero: GRADE_RANK.hero,
  legend: GRADE_RANK.legend,
  god: GRADE_RANK.god,
});

/** 소환 도박 한 종류 (G-1) — 확률은 bp. */
export interface GachaKindStats {
  readonly id: string;
  readonly name: string;
  readonly cost: number;
  readonly faction: boolean;
  readonly outcomes: readonly { readonly grade: GachaGrade; readonly bp: number }[];
  /** 천장: n번 연속 rank 이상이 안 나오면 다음 한 번은 rank 이상 확정 */
  readonly pityN: number;
  readonly pityRank: number;
}

/** 리미티드(히든) 조합 하나 (G-1 도감): 결과 타워 id와 재료 (같은 재료가 여럿일 수 있다) */
export interface RecipeStats {
  readonly id: string;
  readonly materials: readonly string[];
}

/** 필살기 수치 (G-1, 정수 단위). */
export interface UltRules {
  /** 등급 → 공격 1번에 차는 게이지 (bp, 가득 = BP_ONE) */
  readonly chargeBp: ReadonlyMap<Grade, number>;
  /** 타워 id → 필살기 종류 (필살기가 있는 등급만) */
  readonly kindOf: ReadonlyMap<string, UltKind>;
  readonly nukeRadius: number;
  readonly nukeMulBp: number;
  readonly stunRadius: number;
  readonly stunTicks: number;
  readonly rallyApsBp: number;
  readonly rallyTicks: number;
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
  /** 대상 우선순위 (GDD 5.3: 선두·최대 체력·보스 우선·무표식·최저 체력) */
  readonly target: TargetRule;
  /** 광역·근접 광역 반경 (단위). 그 밖의 형태는 0 */
  readonly radius: number;
  /** 관통·연쇄·다중 마리 수. 그 밖의 형태는 1 */
  readonly count: number;
  /** 방어 관통·마법 관통 (bp, 30% = 3000) */
  readonly armorPenBp: number;
  readonly magicPenBp: number;
  /** 치명타 확률 (bp)·배율 (bp, ×2 = 20000) */
  readonly critBp: number;
  readonly critMulBp: number;
  /** 감지: 없음·오라·자신, 오라 반경 (단위) — 투명 몹 처리는 M4 */
  readonly detect: Detect;
  readonly detectRange: number;
  /** 특색 타워인가 (towers.json special) */
  readonly special: boolean;
  /** 원소 (towers.json element, 없으면 null) — 원소 효과는 dot·특색 능력이 실제로 건다 */
  readonly element: string | null;
  /** 지속 피해 (화상·독·출혈, towers.json dot → 정수). 없으면 null */
  readonly dot: DotStats | null;
  /** 특색 수치 원본 (towers.json params). 능력 모듈(src/sim/abilities)이 레벨에 맞춰 정수로 바꾼다 */
  readonly params: Readonly<Record<string, unknown>>;
}

/** 지속 피해 (GDD 5.4·5.5): 맞을 때마다 1중첩, 초당 1회 공격력 × perSec, 고정 피해·치명타 없음. */
export interface DotStats {
  /** burn 화상 · poison 독 · bleed 출혈 */
  readonly kind: string;
  /** 초당 피해 = 1회 공격력 × 이 비율 (bp) */
  readonly perSecBp: number;
  /** 지속 (틱) */
  readonly durTicks: number;
  /** 최대 중첩 (같은 종류 타워에서 온 것끼리) */
  readonly stacks: number;
}

/** 상태 이상 규칙 (game.json status → 정수, GDD 5.5). */
export interface StatusRules {
  /** 둔화 최대 (bp, 70% = 7000) */
  readonly slowMaxBp: number;
  /** 보스 둔화 배율 (bp, 절반 = 5000) */
  readonly bossSlowMulBp: number;
  /** 보스 기절·정지·빙결 지속 배율 (bp, 30% = 3000) */
  readonly bossCcDurMulBp: number;
  /** 행동 불가 면역 (틱) */
  readonly ccImmuneTicks: number;
  /** 빙결 중 받는 피해 증가 (bp) */
  readonly freezeVulnBp: number;
  /** 지속 피해 간격 (틱) */
  readonly dotIntervalTicks: number;
}

/**
 * 판 내 강화 하나 (GDD 7.1, M5-3) — 정수 단위. 명령 upgrade {k}의 k = rules.upgrades의 순서 (등급 강화 → 능력치 강화 → 초월 → 소환 확률 → 인원 한도).
 * - grade: grades 등급 타워의 공격력 +perLevelBp/Lv (Aura.towerBonus가 타워 등급으로 더한다).
 * - stat: 모든 타워 stat +perLevelBp/Lv (PlayerMods에 더한다).
 * - transcend: 모든 타워 공격력 +perLevelBp/Lv (PlayerMods.atkPctBp). 등급 강화가 모두 최대일 때 열림. 비용 = 표.
 * - summon: 레어 직행 소환 확률 +perLevelBp/Lv (피드백 #27, Summon.summonRareChance가 더한다). k = 초월 다음 (예전 k 그대로).
 * - unitCap (피드백 #28, k = 소환 확률 다음): 내 타워 인원 한도 +perLevelBp명/Lv — 이 종류만 perLevelBp가 bp가 아니라 인원 수(정수). Board.unitCap이 더한다.
 */
export interface UpgradeRule {
  readonly k: number;
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly kind: 'grade' | 'stat' | 'transcend' | 'summon' | 'unitCap';
  readonly grades: readonly Grade[];
  /** 능력치 강화가 올리는 값 (grade·transcend는 null) */
  readonly stat: UpgradeStat | null;
  readonly perLevelBp: number;
  /** 최대 레벨 (초월 = 비용 표 길이) */
  readonly max: number;
  /** 비용 Lv → Lv+1 = costBase + costPer × Lv (초월은 transcendCost 표) */
  readonly costBase: number;
  readonly costPer: number;
}

/** 도박 배율 하나 (bp 정수). */
export interface GambleOutcome {
  /** 배율 (bp, ×0.5 = 5000) */
  readonly mulBp: number;
  /** 기본 확률 (bp) */
  readonly chanceBp: number;
}

/** 도전 보스 하나 (GDD 6장·ENEMIES.md 7장, M5-2) — 정수 단위. 체력·방어·마저는 단계와 관계없이 고정. */
export interface ChallengeStats {
  readonly level: number;
  readonly id: string;
  readonly name: string;
  readonly hp: number;
  readonly reward: number;
  readonly armor: number;
  readonly magicRes: number;
  readonly speed: number;
  readonly invisible: boolean;
  readonly legion: string;
  /** 체력을 함께 쓰는 마리 수 (1 = 혼자) */
  readonly twin: number;
  readonly immuneSlow: boolean;
  readonly immuneBurn: boolean;
  readonly teleport: { readonly everyTicks: number; readonly units: number } | null;
  readonly freezeTowers: { readonly everyTicks: number; readonly radius: number; readonly ticks: number } | null;
  readonly regen: { readonly everyTicks: number; readonly pctBp: number } | null;
  readonly invulnerable: { readonly atBp: number; readonly ticks: number; readonly speedBp: number } | null;
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
  /** 소환 기본 비용 (원, 첫 소환) */
  readonly summonCost: number;
  /** 일반 소환 1번마다 오르는 비용 (원, V2.0 PR-A) */
  readonly summonCostStep: number;
  /** 소환 비용 최대 (원) */
  readonly summonCostMax: number;
  /** 신 타워 확률 (bp, 0.01% = 1) */
  readonly godChanceBp: number;
  /** 투사체 속도 (단위/틱). 12칸/초 = 600 */
  readonly projectileSpeed: number;
  /** 기본 덱 (decks.json base) */
  readonly baseDeck: Deck;
  /** 덱의 등급별 종류 수 (5) */
  readonly deckPerGrade: number;
  /** 공속 한도: 기본의 몇 배 (5) */
  readonly apsMaxMul: number;
  /** 공속 한도: 초당 최대 횟수 × APS_SCALE (15회 = 15000) */
  readonly apsMaxMilli: number;
  /** 방어·마법 관통 최대 (bp, 90% = 9000) */
  readonly penMaxBp: number;
  /** 치명타 확률 최대 (bp) */
  readonly critChanceMaxBp: number;
  /** 모든 타워 공격력% 기본 보정 (bp, T-3 작은 맵 보정 — game.json combat.towerAtkPct). 공격력% 합에 더한다 */
  readonly towerAtkPctBp: number;
  /** 받는 피해 증가 합 최대 (bp, +100% = 10000) */
  readonly vulnMaxBp: number;
  /** 연쇄: 튕길 때마다 남는 피해 비율 (bp, −20% → 8000) */
  readonly chainKeepBp: number;
  /** 연쇄: 다음 몹을 찾는 반경 (단위) */
  readonly chainRange: number;
  /** 관통: 직선 폭의 절반 (단위) */
  readonly pierceHalfWidth: number;
  /** 이동·교환 뒤 공격 정지 (틱) */
  readonly movePauseTicks: number;
  /** 승급에 드는 같은 타워 수 (3) */
  readonly mergeCount: number;
  /** 상태 이상 규칙 (M3-6) */
  readonly status: StatusRules;
  /** 지원 효과 범위 (체비쇼프 거리, M3-7): 주변 8칸 = 1, 주변 24칸 = 2 */
  readonly auraAround8: number;
  readonly auraAround24: number;
  /** 타워 최대 레벨 (15)·레벨당 공격력 (bp, +4% = 400) */
  readonly towerLevelMax: number;
  readonly atkPerLevelBp: number;
  /** V3 P1 영웅 마일스톤 (레벨 오름차순, bp) — sim/milestones.ts */
  readonly milestones: readonly MilestoneRule[];
  /** 특색 강화: 타워 id → 종류 (없으면 traitDefault), 종류별 단계당 bp */
  readonly traitKind: ReadonlyMap<string, TraitBoostKind>;
  readonly traitDefault: TraitBoostKind;
  readonly traitStepBp: Readonly<Record<TraitBoostKind, number>>;
  /** V3 P2 유물 규칙 (id → 정수 규칙) — sim/relics.ts */
  readonly relics: ReadonlyMap<string, RelicRule>;
  /** towers.json 순서의 타워 id (개발용 debugTower 명령이 번호로 고른다) */
  readonly towerOrder: readonly string[];
  // ---- M4 ----
  /** 기본 보스 (enemies.json bosses, id → 스탯)와 데이터 순서 */
  readonly bosses: ReadonlyMap<string, BossStats>;
  readonly bossOrder: readonly string[];
  /** 보스 이름 → id (캠페인 bossSchedule은 이름으로 적혀 있다) */
  readonly bossByName: ReadonlyMap<string, string>;
  /** 무한 모드 보스 순환 (enemies.json bossCycle) */
  readonly bossCycle: Readonly<{
    every: number;
    captains: readonly string[];
    commanderEvery: number;
    commanders: readonly string[];
    lordEvery: number;
    lord: string;
    /** F10-2: 무한 모드 그 단계에 나오는 보스만 체력 배율 (bp, 단계 → bp; 없으면 BP_ONE) */
    stageHpMulBp: ReadonlyMap<number, number>;
  }>;
  /** 캠페인 테마별 보스 배치 (테마 → 단계 → 보스 이름) */
  readonly bossSchedules: ReadonlyMap<number, Readonly<Record<string, string>>>;
  /** 보스 처치 보상 (원)·제한 시간 (틱) */
  readonly bossReward: number;
  readonly bossTimeTicks: number;
  /** 일꾼: 고용 비용·최대 수·수입 간격(틱)·1명당 수입 */
  readonly workerCost: number;
  readonly workerMax: number;
  readonly workerIntervalTicks: number;
  readonly workerIncome: number;
  /** 단계 이자 (피드백 #10): 단계를 넘어갈 때 가진 돈 interestPer원마다 interestAmount원 */
  readonly interestPer: number;
  readonly interestAmount: number;
  /** 한 번에 받는 이자 상한 (원) */
  readonly interestMax: number;
  /** 감지 오라를 벗어난 투명 몹이 드러난 채로 남는 틱 */
  readonly revealHoldTicks: number;
  /** 조합 편대와 규칙 */
  readonly formations: readonly FormationStats[];
  readonly formationPreviewTicks: number;
  readonly formationEvery: number;
  readonly formationCampaignShift: number;
  readonly formationCampaignMin: number;
  /** 정예 몹 (51단계부터 1.5%, 체력 ×5, 보상 ×10) */
  readonly eliteFromStage: number;
  readonly eliteChanceBp: number;
  readonly eliteHpMulBp: number;
  readonly eliteRewardMulBp: number;
  /** 보스 카드 */
  readonly cards: readonly CardStats[];
  readonly cardById: ReadonlyMap<string, CardStats>;
  readonly cardOfferSize: number;
  readonly cardRareBp: number;
  /** 카드 '소환 할인' 합의 최대 (bp, 카드가 없으면 0) */
  readonly summonDiscountMaxBp: number;
  // ---- M5 ----
  /** 판 내 강화 (명령 upgrade {k}의 k 순서: 등급 강화 → 능력치 강화 → 초월 → 소환 확률 → 인원 한도) */
  readonly upgrades: readonly UpgradeRule[];
  /** 등급 → 그 등급을 올리는 등급 강화의 k */
  readonly gradeUpgradeOf: ReadonlyMap<Grade, number>;
  /** 초월 강화의 k */
  readonly transcendK: number;
  /** 초월 강화 비용 표 (curves.json transcendCost, Lv → Lv+1) */
  readonly transcendCost: readonly number[];
  /** 인원 한도 강화의 k (피드백 #28, 소환 확률 다음 — 예전 k는 그대로) */
  readonly unitCapK: number;
  /** 도박 테이블 (비용·해금 계정 레벨) */
  readonly gambleTables: readonly { readonly cost: number; readonly unlockLevel: number }[];
  /** 도박 배율표 (bp) */
  readonly gambleOutcomes: readonly GambleOutcome[];
  /** 잭팟 게이지 칸 수·확정 최소 배율 (bp) */
  readonly jackpotGauge: number;
  readonly jackpotMinMulBp: number;
  /** 도박꾼 특색이 줄인 ×0 확률을 더할 배율의 배율표 번호, ×0의 번호 */
  readonly gambleShiftIndex: number;
  readonly gambleZeroIndex: number;
  /** 화면에 보여줄 최근 결과 수 */
  readonly gambleRecent: number;
  /** 화면 대박 연출 최소 배율 (bp) */
  readonly gambleBigMulBp: number;
  /** 도전: 단계별 쿨타임·제한 시간 (틱) */
  readonly challengeCooldownTicks: number;
  readonly challengeTimeTicks: number;
  /** 도전 보스 (단계 1부터 차례로) */
  readonly challenges: readonly ChallengeStats[];
  /** 판 안 미션 (missions.json 순서 = 미션 번호) */
  readonly missions: readonly MissionData[];
  // ---- T-2 ----
  /** 자동 소환 칸 고르기 반경 (체비쇼프 칸) */
  readonly autoSummonRadius: number;
  /** 판매: 받는 돈 비율 (bp) */
  readonly sellRateBp: number;
  /** 타워 id → 판매 가치 (원, 판매가 = 가치 × sellRateBp 내림) */
  readonly towerValues: ReadonlyMap<string, number>;
  /** 일반 소환이 낼 수 있는 등급 (노말·레어 직행·신 — Summon.rollSummon). 이 등급의 판매가는 ⌊(지금 소환 비용 − 1) ÷ 2⌋ 이하 (쌍둥이 소환까지) (V2.0 PR-A) */
  readonly summonOutcomeGrades: readonly Grade[];
  /** 개발자 도구 확률 조정: 한 번에 바뀌는 값 (bp)과 이름 목록 (game.json devChances 순서) */
  readonly devChanceStepBp: number;
  readonly devChanceKeys: readonly string[];
  // ---- G-1 ----
  /** 칸 하나에 쌓는 같은 타워 수 (3) */
  readonly stackMax: number;
  /** 판 안 내 타워 인원 한도 기본값 (game.json board.unitCap) */
  readonly unitCap: number;
  /** 연쇄 승급 한 번에 최대 승급 수 */
  readonly mergeChainMax: number;
  /** 일반 소환 천장: n번 연속 rank 이상이 없으면 다음 소환은 rank 이상 (레어 직행) */
  readonly summonPityN: number;
  readonly summonPityRank: number;
  /** 소환 도박 4종 (명령 gacha {k}의 k 순서) */
  readonly gachaKinds: readonly GachaKindStats[];
  /** 종족 id (towers.json factions 순서, 명령 gacha {f}의 f) */
  readonly factionOrder: readonly string[];
  /** 리미티드 조합 (towers.json의 히든 타워 순서, 명령 craft {r}의 r) */
  readonly recipes: readonly RecipeStats[];
  /** 3택 1 강화 선택: from단계부터 every단계마다 (보스 단계 제외) */
  readonly pickFrom: number;
  readonly pickEvery: number;
  readonly ult: UltRules;
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
    evadeBp: bp(m.evade ?? 0),
    heal: m.heal
      ? Object.freeze({ intervalTicks: secondsToTicksExact(m.heal.everySeconds), radius: tiles(m.heal.radius), pctBp: bp(m.heal.pct) })
      : null,
    shield: m.shield ? Object.freeze({ pctBp: bp(m.shield.pct), areaMulBp: bp(m.shield.areaMul) }) : null,
    haste: m.haste ? Object.freeze({ belowBp: bp(m.haste.belowHp), speedBp: bp(m.haste.speed) }) : null,
    split: m.splitInto
      ? Object.freeze({
          id: m.splitInto.id,
          count: m.splitInto.count,
          hpBp: bp(m.splitInto.hpOfParent),
          speed: m.splitInto.speed === undefined ? null : tiles(m.splitInto.speed),
          reward: m.splitInto.reward ?? null,
          small: m.splitInto.small === true,
        })
      : null,
  });
}

export function buildBossStats(b: BossData): BossStats {
  return Object.freeze({
    id: b.id,
    name: b.name,
    stage: b.stage,
    legion: b.legion,
    rank: b.rank,
    hpMulBp: bp(b.hpMul),
    armor: int(`${b.id}.armor`, b.armor),
    magicRes: int(`${b.id}.magicRes`, b.magicRes),
    speed: tiles(b.speed),
    ccResistBp: bp(b.ccResist),
    invisible: b.invisible,
    counter: b.counter,
    params: Object.freeze({ ...b.params }),
  });
}

/** 공격 형태 값 → 반경(광역·근접 광역, 단위)과 마리 수(관통·연쇄·다중). 잘못된 값은 에러 (데이터 검사도 같은 규칙). */
export function shapeParams(t: Pick<TowerData, 'id' | 'shape' | 'shapeValue'>): { radius: number; count: number } {
  switch (t.shape) {
    case 'aoe':
    case 'melee_aoe': {
      const radius = tiles(t.shapeValue);
      if (radius <= 0) throw new Error(`${t.id}: ${t.shape} 반경은 0보다 커야 한다 (${t.shapeValue})`);
      return { radius, count: 1 };
    }
    case 'pierce':
    case 'chain':
    case 'multi': {
      const count = int(`${t.id}.shapeValue`, t.shapeValue);
      if (count < 1) throw new Error(`${t.id}: ${t.shape} 마리 수는 1 이상 (${t.shapeValue})`);
      return { radius: 0, count };
    }
    default:
      return { radius: 0, count: 1 };
  }
}

export function buildTowerStats(t: TowerData): TowerStats {
  const { radius, count } = shapeParams(t);
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
    radius,
    count,
    armorPenBp: bp(t.armorPen),
    magicPenBp: bp(t.magicPen),
    critBp: bp(t.crit),
    critMulBp: bp(t.critMul),
    detect: t.detect,
    detectRange: tiles(t.detectRange),
    special: t.special > 0,
    element: t.element,
    dot: t.dot
      ? Object.freeze({
          kind: t.dot.kind,
          perSecBp: bp(t.dot.perSec),
          durTicks: secondsToTicksExact(t.dot.dur),
          stacks: int(`${t.id}.dot.stacks`, t.dot.stacks),
        })
      : null,
    params: Object.freeze({ ...t.params }),
  });
}

/**
 * 덱을 등급별로 복사해 얼린다. 판은 이 복사본만 들고 있으므로 판을 만든 뒤 호출자가 원본 덱 배열을 고쳐도
 * 소환·승급 결과가 바뀌지 않는다 (덱은 해시에 들어가지 않으므로 바뀌면 리플레이·멀티가 몰래 어긋난다).
 */
export function freezeDeck(deck: DeckData | Deck): Deck {
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
    summonCostStep: game.summon.costStep,
    summonCostMax: game.summon.costMax,
    godChanceBp: bp(game.summon.godChance),
    projectileSpeed: projectileUnitsPerSec / TICK_HZ,
    baseDeck: freezeDeck(data.decks.base),
    deckPerGrade: data.decks.perGrade,
    apsMaxMul: int('game.json combat.apsMaxMul', game.combat.apsMaxMul),
    apsMaxMilli: int('game.json combat.apsMaxPerSec', game.combat.apsMaxPerSec) * APS_SCALE,
    penMaxBp: bp(game.combat.penMax),
    critChanceMaxBp: bp(game.combat.critChanceMax),
    towerAtkPctBp: bp(game.combat.towerAtkPct),
    vulnMaxBp: bp(game.combat.vulnMax),
    chainKeepBp: BP_ONE - bp(game.combat.chainFalloff),
    chainRange: tiles(game.combat.chainRange),
    pierceHalfWidth: idiv(tiles(game.combat.pierceWidth), 2),
    movePauseTicks: secondsToTicksExact(game.combat.movePauseSeconds),
    mergeCount: int('game.json merge.count', game.merge.count),
    status: Object.freeze({
      slowMaxBp: bp(game.status.slowMax),
      bossSlowMulBp: bp(game.status.bossSlowMul),
      bossCcDurMulBp: bp(game.status.bossCcDurationMul),
      ccImmuneTicks: secondsToTicksExact(game.status.ccImmuneSeconds),
      freezeVulnBp: bp(game.status.freezeVuln),
      dotIntervalTicks: secondsToTicksExact(game.status.dotIntervalSeconds),
    }),
    auraAround8: int('game.json aura.around8', game.aura.around8),
    auraAround24: int('game.json aura.around24', game.aura.around24),
    towerLevelMax: int('game.json towerLevel.max', game.towerLevel.max),
    atkPerLevelBp: bp(game.towerLevel.atkPerLevel),
    milestones: Object.freeze(
      game.towerLevel.milestones.map((m) => Object.freeze({ level: m.level, atkBp: exactBp(`game.json towerLevel.milestones ${m.level}.atkPct`, m.atkPct ?? 0), apsBp: exactBp(`game.json towerLevel.milestones ${m.level}.apsPct`, m.apsPct ?? 0), trait: m.trait === true })),
    ),
    traitKind: new Map(Object.entries(game.towerLevel.traitBoost.byTower).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
    traitDefault: game.towerLevel.traitBoost.default,
    traitStepBp: Object.freeze({
      aura: exactBp('game.json towerLevel.traitBoost.values.aura', game.towerLevel.traitBoost.values.aura),
      cc: exactBp('game.json towerLevel.traitBoost.values.cc', game.towerLevel.traitBoost.values.cc),
      crit: exactBp('game.json towerLevel.traitBoost.values.crit', game.towerLevel.traitBoost.values.crit),
    }),
    relics: buildRelicRules(game.relics),
    towerOrder: Object.freeze(data.towers.towers.map((t) => t.id)),
    ...buildM4Rules(data, mobOrder),
    ...buildM5Rules(data),
    ...buildT2Rules(data),
    ...buildG1Rules(data),
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

/** M4 규칙 (보스·일꾼·감지·편대·정예·카드). */
function buildM4Rules(data: GameData, mobOrder: readonly string[]): Pick<
  MatchRules,
  | 'bosses'
  | 'bossOrder'
  | 'bossByName'
  | 'bossCycle'
  | 'bossSchedules'
  | 'bossReward'
  | 'bossTimeTicks'
  | 'workerCost'
  | 'workerMax'
  | 'workerIntervalTicks'
  | 'workerIncome'
  | 'interestPer'
  | 'interestAmount'
  | 'interestMax'
  | 'revealHoldTicks'
  | 'formations'
  | 'formationPreviewTicks'
  | 'formationEvery'
  | 'formationCampaignShift'
  | 'formationCampaignMin'
  | 'eliteFromStage'
  | 'eliteChanceBp'
  | 'eliteHpMulBp'
  | 'eliteRewardMulBp'
  | 'cards'
  | 'cardById'
  | 'cardOfferSize'
  | 'cardRareBp'
  | 'summonDiscountMaxBp'
> {
  const { enemies, game, cards: cardsFile, campaign } = data;
  const bosses = new Map<string, BossStats>();
  const bossByName = new Map<string, string>();
  for (const b of enemies.bosses) {
    bosses.set(b.id, buildBossStats(b));
    bossByName.set(b.name, b.id);
  }
  const cyc = enemies.bossCycle;
  const cards = cardsFile.cards.map((c) => {
    const e = c.effect;
    const ratio =
      e.type === 'atkPct' || e.type === 'quake' || e.type === 'mobSlow' || e.type === 'goldPct' || e.type === 'apsPct' || e.type === 'ultCharge' || e.type === 'summonDiscount';
    return Object.freeze({
      id: c.id,
      name: c.name,
      rare: c.grade === 'rare',
      desc: c.desc,
      type: e.type,
      value: ratio ? bp(e.value ?? 0) : int(`cards.json ${c.id}.effect.value`, e.value ?? 0),
      limit: e.type === 'mobSlow' || e.type === 'summonDiscount' ? bp(e.max ?? 0) : int(`cards.json ${c.id}.effect.min`, e.min ?? 0),
      ticks: e.seconds === undefined ? 0 : secondsToTicksExact(e.seconds),
      pools: Object.freeze([...(c.pools ?? ['boss'])]),
    } satisfies CardStats);
  });
  return {
    bosses,
    bossOrder: Object.freeze(enemies.bosses.map((b) => b.id)),
    bossByName,
    bossCycle: Object.freeze({
      every: cyc.every,
      captains: Object.freeze([...cyc.captains]),
      commanderEvery: cyc.commanderEvery,
      commanders: Object.freeze([...cyc.commanders]),
      lordEvery: cyc.lordEvery,
      lord: cyc.lord,
      stageHpMulBp: new Map(Object.entries(cyc.stageHpMul ?? {}).map(([k, v]) => [Number(k), bp(v)] as [number, number])),
    }),
    bossSchedules: new Map(campaign.themes.map((t) => [t.theme, Object.freeze({ ...t.bossSchedule })])),
    bossReward: game.boss.reward,
    bossTimeTicks: secondsToTicksExact(game.boss.timeLimitSeconds),
    workerCost: game.worker.cost,
    workerMax: game.worker.max,
    workerIntervalTicks: secondsToTicksExact(game.worker.intervalSeconds),
    workerIncome: game.worker.income,
    interestPer: game.interest.per,
    interestAmount: game.interest.amount,
    interestMax: game.interest.max,
    revealHoldTicks: secondsToTicksExact(game.detection.revealHoldSeconds),
    formations: Object.freeze(
      enemies.formations.map((f) =>
        Object.freeze({
          id: f.id,
          name: f.name,
          from: f.from,
          mix: Object.freeze(mobOrder.filter((id) => (f.mix[id] ?? 0) > 0).map((id) => Object.freeze([id, f.mix[id] as number] as const))),
          banner: f.banner,
          hint: f.hint,
        }),
      ),
    ),
    formationPreviewTicks: secondsToTicksExact(game.formation.previewSeconds),
    formationEvery: game.formation.every,
    formationCampaignShift: game.formation.campaignShift,
    formationCampaignMin: game.formation.campaignMin,
    eliteFromStage: enemies.eliteChance.fromStage,
    eliteChanceBp: bp(enemies.eliteChance.chance),
    eliteHpMulBp: bp(enemies.eliteChance.hpMul),
    eliteRewardMulBp: bp(enemies.eliteChance.rewardMul),
    cards: Object.freeze(cards),
    cardById: new Map(cards.map((c) => [c.id, c])),
    cardOfferSize: cardsFile.offerSize,
    cardRareBp: bp(cardsFile.rareChance),
    summonDiscountMaxBp: cards.find((c) => c.type === 'summonDiscount')?.limit ?? 0,
  };
}

/** 배율·확률(소수) → bp 정수. 0.0001 단위가 아니면 에러 (데이터 검사가 먼저 잡는다). */
function exactBp(name: string, v: number): number {
  const r = Math.round(v * BP_ONE);
  if (Math.abs(r - v * BP_ONE) > 1e-6) throw new Error(`${name}: 0.0001 단위여야 하는데 ${v}`);
  return r;
}

export function buildChallengeStats(c: ChallengeData): ChallengeStats {
  return Object.freeze({
    level: c.level,
    id: c.id,
    name: c.name,
    hp: int(`${c.id}.hp`, c.hp),
    reward: int(`${c.id}.reward`, c.reward),
    armor: int(`${c.id}.armor`, c.armor),
    magicRes: int(`${c.id}.magicRes`, c.magicRes),
    speed: tiles(c.speed),
    invisible: c.invisible,
    legion: c.legion,
    twin: c.twin ?? 1,
    immuneSlow: c.immune?.includes('slow') === true,
    immuneBurn: c.immune?.includes('burn') === true,
    teleport: c.teleport ? Object.freeze({ everyTicks: secondsToTicksExact(c.teleport.everySeconds), units: tiles(c.teleport.tiles) }) : null,
    freezeTowers: c.freezeTowers
      ? Object.freeze({
          everyTicks: secondsToTicksExact(c.freezeTowers.everySeconds),
          radius: tiles(c.freezeTowers.radius),
          ticks: secondsToTicksExact(c.freezeTowers.seconds),
        })
      : null,
    regen: c.regen ? Object.freeze({ everyTicks: secondsToTicksExact(c.regen.everySeconds), pctBp: bp(c.regen.pct) }) : null,
    invulnerable: c.invulnerable
      ? Object.freeze({
          atBp: bp(c.invulnerable.at),
          ticks: secondsToTicksExact(c.invulnerable.seconds),
          speedBp: bp(c.invulnerable.speedMul) - BP_ONE,
        })
      : null,
  });
}

/** M5 규칙 (강화·도박·도전·미션). */
function buildM5Rules(data: GameData): Pick<
  MatchRules,
  | 'upgrades'
  | 'gradeUpgradeOf'
  | 'transcendK'
  | 'transcendCost'
  | 'unitCapK'
  | 'gambleTables'
  | 'gambleOutcomes'
  | 'jackpotGauge'
  | 'jackpotMinMulBp'
  | 'gambleShiftIndex'
  | 'gambleZeroIndex'
  | 'gambleRecent'
  | 'gambleBigMulBp'
  | 'challengeCooldownTicks'
  | 'challengeTimeTicks'
  | 'challenges'
  | 'missions'
> {
  const { game, curves, enemies, missions } = data;
  const up = game.upgrade;
  const upgrades: UpgradeRule[] = [];
  const gradeUpgradeOf = new Map<Grade, number>();
  for (const g of up.grade) {
    const k = upgrades.length;
    for (const gr of g.grades) gradeUpgradeOf.set(gr, k);
    upgrades.push(
      Object.freeze({
        k,
        id: g.id,
        name: g.name,
        icon: '⬆',
        kind: 'grade',
        grades: Object.freeze([...g.grades]),
        stat: null,
        perLevelBp: exactBp(`game.json upgrade ${g.id}.atkPerLevel`, g.atkPerLevel),
        max: g.max,
        costBase: g.cost[0],
        costPer: g.cost[1],
      } satisfies UpgradeRule),
    );
  }
  for (const u of up.stat) {
    upgrades.push(
      Object.freeze({
        k: upgrades.length,
        id: u.id,
        name: u.name,
        icon: u.icon,
        kind: 'stat',
        grades: Object.freeze([]),
        stat: u.stat,
        perLevelBp: exactBp(`game.json upgrade ${u.id}.perLevel`, u.perLevel),
        max: u.max,
        costBase: u.cost[0],
        costPer: u.cost[1],
      } satisfies UpgradeRule),
    );
  }
  const tr = up.transcend;
  const transcendK = upgrades.length;
  upgrades.push(
    Object.freeze({
      k: transcendK,
      id: tr.id,
      name: tr.name,
      icon: '🌟',
      kind: 'transcend',
      grades: Object.freeze([]),
      stat: null,
      perLevelBp: exactBp(`game.json upgrade ${tr.id}.atkPerLevel`, tr.atkPerLevel),
      max: curves.transcendCost.length,
      costBase: tr.costBase,
      costPer: 0,
    } satisfies UpgradeRule),
  );
  const su = up.summon;
  upgrades.push(
    Object.freeze({
      k: upgrades.length,
      id: su.id,
      name: su.name,
      icon: su.icon,
      kind: 'summon',
      grades: Object.freeze([]),
      stat: null,
      perLevelBp: exactBp(`game.json upgrade ${su.id}.rarePerLevel`, su.rarePerLevel),
      max: su.max,
      costBase: su.cost[0],
      costPer: su.cost[1],
    } satisfies UpgradeRule),
  );
  const uc = up.unitCap;
  const unitCapK = upgrades.length;
  upgrades.push(
    Object.freeze({
      k: unitCapK,
      id: uc.id,
      name: uc.name,
      icon: uc.icon,
      kind: 'unitCap',
      grades: Object.freeze([]),
      stat: null,
      perLevelBp: uc.perLevel,
      max: uc.max,
      costBase: uc.cost[0],
      costPer: uc.cost[1],
    } satisfies UpgradeRule),
  );
  const gb = game.gamble;
  const outcomes = gb.outcomes.map((o, i) =>
    Object.freeze({ mulBp: exactBp(`game.json gamble.outcomes[${i}].mul`, o.mul), chanceBp: exactBp(`game.json gamble.outcomes[${i}].chance`, o.chance) }),
  );
  const shift = outcomes.findIndex((o) => o.mulBp === exactBp('game.json gamble.zeroShiftTo', gb.zeroShiftTo));
  const zero = outcomes.findIndex((o) => o.mulBp === 0);
  if (shift < 0 || zero < 0) throw new Error('game.json gamble: ×0 또는 zeroShiftTo 배율이 배율표에 없다');
  return {
    upgrades: Object.freeze(upgrades),
    gradeUpgradeOf,
    transcendK,
    transcendCost: Object.freeze([...curves.transcendCost]),
    unitCapK,
    gambleTables: Object.freeze(gb.tables.map((t) => Object.freeze({ cost: t.cost, unlockLevel: t.unlockLevel }))),
    gambleOutcomes: Object.freeze(outcomes),
    jackpotGauge: gb.jackpot.gauge,
    jackpotMinMulBp: exactBp('game.json gamble.jackpot.minMul', gb.jackpot.minMul),
    gambleShiftIndex: shift,
    gambleZeroIndex: zero,
    gambleRecent: gb.recent,
    gambleBigMulBp: exactBp('game.json gamble.bigMul', gb.bigMul),
    challengeCooldownTicks: secondsToTicksExact(game.challenge.cooldownSeconds),
    challengeTimeTicks: secondsToTicksExact(game.challenge.timeLimitSeconds),
    challenges: Object.freeze(enemies.challenges.map(buildChallengeStats)),
    missions: Object.freeze(missions.missions.map((m) => Object.freeze({ ...m, cond: Object.freeze({ ...m.cond }) }))),
  };
}

/**
 * 타워 판매 가치 (원, T-2): 노말 가치(game.json sell.baseValue — V2.0 PR-A부터 소환 비용과 따로) × 등급 배율
 * (노말 1·레어 3·유니크 9·히어로 27·레전드 81·신 = game.json sell.gradeMul),
 * 히든 = 조합 재료 가치의 합. 거듭제곱은 데이터 표(gradeMul)로 — sim에서 계산하지 않는다.
 */
export function buildTowerValues(data: Pick<GameData, 'towers' | 'game'>): Map<string, number> {
  const { game, towers } = data;
  const out = new Map<string, number>();
  const byId = new Map(towers.towers.map((t) => [t.id, t]));
  const base = (id: string): number => {
    const t = byId.get(id);
    if (!t || t.grade === 'hidden') return 0;
    return game.sell.baseValue * game.sell.gradeMul[t.grade];
  };
  for (const t of towers.towers) {
    if (t.grade !== 'hidden') out.set(t.id, base(t.id));
    else out.set(t.id, (t.recipe ?? []).reduce((sum, id) => sum + base(id), 0));
  }
  return out;
}

/** T-2 규칙 (자동 소환·판매·개발자 확률 조정). */
function buildT2Rules(
  data: GameData,
): Pick<MatchRules, 'autoSummonRadius' | 'sellRateBp' | 'towerValues' | 'summonOutcomeGrades' | 'devChanceStepBp' | 'devChanceKeys'> {
  const { game } = data;
  return {
    autoSummonRadius: int('game.json summon.autoRadius', game.summon.autoRadius),
    sellRateBp: int('game.json sell.rateBp', game.sell.rateBp),
    towerValues: buildTowerValues(data),
    summonOutcomeGrades: Object.freeze(['normal', 'rare', ...(data.towers.towers.some((t) => t.grade === 'god') ? (['god'] as const) : [])] as Grade[]),
    devChanceStepBp: int('game.json devChances.stepBp', game.devChances.stepBp),
    devChanceKeys: Object.freeze(game.devChances.list.map((c) => c.key)),
  };
}

/**
 * 등급 → 등급 번호 (src/data/grades.ts GRADE_RANK: 노말 1 … 신 6 · 리미티드(hidden) 7, 꽝 0).
 * 천장·자동 판매·자동 승급 비교에 쓴다. V2.0 PR-A: 예전엔 히든을 레전드(5)와 같게 봤다 — 소환·도박은 히든을 내지 않고
 * 자동 판매·승급 기준은 유니크 이하라 동작은 같다.
 */
export function gradeRank(grade: Grade | GachaGrade): number {
  return grade === 'none' ? 0 : GRADE_RANK[grade];
}

/** 타워 데이터 → 필살기 종류 (game.json ultimate.rules 중 처음 맞는 것). */
export function ultKindFor(rules: GameData['game']['ultimate']['rules'], t: Pick<TowerData, 'shape' | 'tags' | 'damageType'>): UltKind {
  for (const r of rules) {
    if (r.shapes && !r.shapes.includes(t.shape)) continue;
    if (r.damageTypes && !r.damageTypes.includes(t.damageType)) continue;
    if (r.tags && !r.tags.some((tag) => t.tags.includes(tag))) continue;
    return r.kind;
  }
  return 'nuke';
}

/** G-1 규칙 (칸 쌓기·연쇄 승급·천장·소환 도박·리미티드 조합·3택 1·필살기). */
function buildG1Rules(data: GameData): Pick<
  MatchRules,
  'stackMax' | 'unitCap' | 'mergeChainMax' | 'summonPityN' | 'summonPityRank' | 'gachaKinds' | 'factionOrder' | 'recipes' | 'pickFrom' | 'pickEvery' | 'ult'
> {
  const { game, towers, cards } = data;
  const u = game.ultimate;
  const chargeBp = new Map<Grade, number>();
  for (const [g, attacks] of Object.entries(u.grades)) chargeBp.set(g as Grade, idiv(BP_ONE, attacks as number));
  const kindOf = new Map<string, UltKind>();
  for (const t of towers.towers) if (chargeBp.has(t.grade)) kindOf.set(t.id, ultKindFor(u.rules, t));
  return {
    stackMax: int('game.json board.stackMax', game.board.stackMax),
    unitCap: int('game.json board.unitCap', game.board.unitCap),
    mergeChainMax: int('game.json merge.chainMax', game.merge.chainMax),
    summonPityN: game.summon.pity.n,
    summonPityRank: gradeRank(game.summon.pity.grade),
    gachaKinds: Object.freeze(
      game.summonGamble.kinds.map((k) =>
        Object.freeze({
          id: k.id,
          name: k.name,
          cost: k.cost,
          faction: k.faction === true,
          outcomes: Object.freeze(k.outcomes.map((o) => Object.freeze({ grade: o.grade, bp: exactBp(`game.json summonGamble ${k.id}`, o.chance) }))),
          pityN: k.pity.n,
          pityRank: gradeRank(k.pity.grade),
        }),
      ),
    ),
    factionOrder: Object.freeze(Object.keys(towers.factions)),
    recipes: Object.freeze(
      towers.towers.filter((t) => t.grade === 'hidden' && (t.recipe?.length ?? 0) > 0).map((t) => Object.freeze({ id: t.id, materials: Object.freeze([...(t.recipe ?? [])]) })),
    ),
    pickFrom: cards.pick.from,
    pickEvery: cards.pick.every,
    ult: Object.freeze({
      chargeBp,
      kindOf,
      nukeRadius: tiles(u.kinds.nuke.radius),
      nukeMulBp: bp(u.kinds.nuke.atkMul),
      stunRadius: tiles(u.kinds.stun.radius),
      stunTicks: secondsToTicksExact(u.kinds.stun.seconds),
      rallyApsBp: bp(u.kinds.rally.apsPct),
      rallyTicks: secondsToTicksExact(u.kinds.rally.seconds),
    }),
  };
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
