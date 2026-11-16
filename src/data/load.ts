/**
 * 데이터 로더: JSON을 읽고 필수 필드·타입을 검사한 뒤 타입이 붙은 객체로 돌려준다.
 *
 * - 데이터는 번들에 포함된다(정적 import) → 완전 오프라인.
 * - 검사에 실패하면 `DataError`를 던진다. 메시지에 **파일 이름 + 필드 경로**가 들어간다.
 *   예: `towers.json: towers[3].aps: 숫자여야 하는데 문자열 "fast"`
 * - 맵은 `src/data/maps/*.json`을 모두 자동으로 읽는다 (M6에서 테마 맵 추가 시 코드 수정 불필요).
 * - `curves.json`은 `tools/precompute-curves.mjs`가 enemies.json growth로 만든 표다 (sim은 거듭제곱을 못 쓴다).
 * - `decks.json`은 덱 규칙(등급별 5종)과 기본 덱이다. 덱의 타워 id·등급은 towers.json과 교차 검사한다.
 * - `cards.json`은 보스 효과 카드 12장(GDD.md 3.1, M4-7)이다.
 * - `missions.json`은 판 안 미션 41개(GDD.md 8장, M5-6)다. 조건 종류마다 필요한 값·타워 id는 crossCheck에서 확인한다.
 * - 수치 해석(소수 → 정수 단위 변환)은 각 시스템이 로드할 때 `src/sim/Fixed.ts`로 한다.
 */

import towersJson from './towers.json';
import enemiesJson from './enemies.json';
import campaignJson from './campaign.json';
import gameJson from './game.json';
import curvesJson from './curves.json';
import decksJson from './decks.json';
import cardsJson from './cards.json';
import missionsJson from './missions.json';
import { TICK_HZ } from '../sim/World';
import { s, validate, type Issue, type Schema } from './schema';
import { DECK_GRADES, deckIssues, type DeckData } from './deck';

export { DECK_GRADES, deckIssues, type DeckData, type DeckGrade } from './deck';

// ---------------------------------------------------------------------------
// 에러
// ---------------------------------------------------------------------------

export class DataError extends Error {
  readonly file: string;
  readonly issues: readonly Issue[];
  constructor(file: string, issues: readonly Issue[]) {
    const shown = issues.slice(0, 20).map((i) => `  - ${i.file ?? file}: ${i.path || '(최상위)'}: ${i.message}`);
    const more = issues.length > 20 ? [`  … 외 ${issues.length - 20}건`] : [];
    super([`데이터 오류 (${file}) ${issues.length}건`, ...shown, ...more].join('\n'));
    this.name = 'DataError';
    this.file = file;
    this.issues = issues;
  }
}

// ---------------------------------------------------------------------------
// 타입
// ---------------------------------------------------------------------------

export const GRADES = ['normal', 'rare', 'unique', 'hero', 'legend', 'god', 'hidden'] as const;
export type Grade = (typeof GRADES)[number];
export const DAMAGE_TYPES = ['physical', 'magic', 'hybrid', 'true'] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];
export const SHAPES = ['single', 'melee', 'aoe', 'melee_aoe', 'pierce', 'chain', 'multi', 'global'] as const;
export type Shape = (typeof SHAPES)[number];
export const DETECTS = ['none', 'aura', 'self'] as const;
export type Detect = (typeof DETECTS)[number];
export const TARGETS = ['first', 'boss', 'lowest', 'unmarked', 'maxhp'] as const;
export type TargetRule = (typeof TARGETS)[number];
export const UNLOCKS = ['base', 'unlock', 'recipe', 'god'] as const;
export type UnlockKind = (typeof UNLOCKS)[number];

export interface DecksFile {
  version: number;
  /** 등급별 종류 수 (5) */
  perGrade: number;
  /** 처음 지급하는 기본 덱 (TOWERS.md 10장) */
  base: DeckData;
}
/** towers.json의 factions에 없는 특수 종족 (연합·고대신). */
export const SPECIAL_FACTIONS = ['alliance', 'ancient'] as const;

export interface DotData {
  kind: string;
  perSec: number;
  dur: number;
  stacks: number;
}

export interface TowerData {
  id: string;
  name: string;
  /** 캐릭터 설명: 어떤 인물인가 (한 문장, 화면 전용 — 정보 패널·캐릭터 카드) */
  lore: string;
  /** 캐릭터 설명: 전투에서 하는 일 (한 문장, 화면 전용) */
  role: string;
  grade: Grade;
  special: number;
  unlock: UnlockKind;
  tags: string[];
  damageType: DamageType;
  shape: Shape;
  shapeValue: number;
  aps: number;
  range: number;
  armorPen: number;
  magicPen: number;
  crit: number;
  critMul: number;
  detect: Detect;
  detectRange: number;
  target: TargetRule;
  dot: DotData | null;
  ability: string;
  awaken: string;
  params: Record<string, unknown>;
  recipe: string[] | null;
  design: { ratio: number; shapeFactor: number };
  atk: number;
  matk: number;
  tatk: number;
  faction: string;
  element: string | null;
}

export interface FactionData {
  name: string;
  color: string;
  thresholds: number[];
  bonus: string[];
}

export interface TowersFile {
  version: number;
  baseDps: Record<Grade, number>;
  towers: TowerData[];
  factions: Record<string, FactionData>;
  rivals: [string, string, string][];
  alliance: { desc: string };
  elements: Record<string, { name: string; effect: string }>;
}

export interface MobData {
  id: string;
  name: string;
  look: string;
  fromStage: number;
  hpMul: number;
  armor: number;
  magicRes: number;
  speed: number;
  ccResist: number;
  traits: string[];
  lifeDamage: number;
  rewardMul: number;
  size: string;
  special: boolean;
  legion: string;
  spawnOnly?: boolean;
  splitInto?: SplitData;
  /** 떼: 1칸에 이만큼 붙어서 등장 (암흑 고블린 떼 3). 없으면 1 */
  swarm?: number;
  /** 투명 (ENEMIES.md 5장). 등장 순서에서 무리 뒤쪽에 놓인다 */
  invisible?: boolean;
  /** 단일 공격 회피 확률 (유령 0.3, M4-3) */
  evade?: number;
  /** 치유 (치유사 M4-3): everySeconds초마다 반경 radius칸 안 다른 몹 체력 pct 회복 */
  heal?: { everySeconds: number; radius: number; pct: number };
  /** 보호막 (방패병 M4-3): 최대 체력 × pct, 광역 피해는 areaMul배로 받음 */
  shield?: { pct: number; areaMul: number };
  /** 가속 (그림자 늑대 M4-3): 체력 belowHp 이하에서 이동속도 +speed */
  haste?: { belowHp: number; speed: number };
}

/** 죽으면 깨져서 나오는 몹 (분열 슬라임·보석 골렘, M4-3). */
export interface SplitData {
  id: string;
  count: number;
  /** 조각 체력 = 부모 최대 체력 × hpOfParent */
  hpOfParent: number;
  /** 조각 이동속도 (칸/초, 없으면 그 몹의 속도) */
  speed?: number;
  /** 조각 처치 보상 (원, 없으면 그 몹의 보상) */
  reward?: number;
  /** 작게 그림 (화면용) */
  small?: boolean;
}

export interface BossData {
  stage: number;
  id: string;
  name: string;
  look: string;
  hpMul: number;
  armor: number;
  magicRes: number;
  speed: number;
  ccResist: number;
  invisible: boolean;
  pattern: string;
  legion: string;
  rank: string;
  /** 패턴 수치 (M4-5, 보스마다 다름 — enemies.json bossNote). 보스 모듈(src/sim/bosses)이 정수로 바꾸고 검사한다 */
  params: Record<string, unknown>;
}

export interface ChallengeData {
  level: number;
  id: string;
  name: string;
  look: string;
  hp: number;
  reward: number;
  armor: number;
  magicRes: number;
  speed: number;
  invisible: boolean;
  ability: string;
  legion: string;
  /** 체력을 함께 쓰는 마리 수 (쌍둥이 박쥐 2, M5-2) */
  twin?: number;
  /** 면역 (slow 둔화 · burn 화상) */
  immune?: ChallengeImmune[];
  /** everySeconds초마다 경로를 tiles칸 앞으로 순간이동 */
  teleport?: { everySeconds: number; tiles: number };
  /** everySeconds초마다 반경 radius칸 안 타워를 seconds초 동결 (공격 불가) */
  freezeTowers?: { everySeconds: number; radius: number; seconds: number };
  /** everySeconds초마다 최대 체력 pct 회복 */
  regen?: { everySeconds: number; pct: number };
  /** 체력 at 이하에서 한 번 seconds초 무적 + 이동속도 ×speedMul */
  invulnerable?: { at: number; seconds: number; speedMul: number };
}

/** 도전 보스 면역 종류 */
export const CHALLENGE_IMMUNES = ['slow', 'burn'] as const;
export type ChallengeImmune = (typeof CHALLENGE_IMMUNES)[number];

export interface CompositionEntry {
  stages: [number, number];
  mix: Record<string, number>;
}

export interface FormationData {
  id: string;
  name: string;
  mix: Record<string, number>;
  from: number;
  why: string;
  counter: string;
  /** 예고 배너의 구성 요약 ("보석 골렘 + 암흑 고블린 떼") */
  banner: string;
  /** 예고 배너 아래 대응 힌트 한 줄 */
  hint: string;
}

/** 무한 모드 보스 순환 (ENEMIES.md 4.1, M4-5a). */
export interface BossCycleData {
  note?: string;
  every: number;
  captains: string[];
  commanderEvery: number;
  commanders: string[];
  lordEvery: number;
  lord: string;
}

/** 단계별 성장 수치 (ENEMIES.md 2장). curves.json의 원본. */
export interface GrowthData {
  note?: string;
  maxStage: number;
  hp: { base: number; segments: { from: number; rate: number }[] };
  armor: { perStage: number; flatFrom: number; flatPerStage: number };
  reward: { base: number; perStages: number };
}

/** 한 단계 등장 순서 규칙 (ENEMIES.md 3.2). slots는 1부터 센 [처음, 끝] (양 끝 포함). */
export interface SpawnOrderData {
  note?: string;
  middle: { slots: [number, number]; mobs: string[] };
  back: { slots: [number, number] };
}

export interface EnemiesFile {
  version: number;
  formulas: Record<string, string>;
  growth: GrowthData;
  mobs: MobData[];
  composition: CompositionEntry[];
  spawnOrder: SpawnOrderData;
  bosses: BossData[];
  challenges: ChallengeData[];
  eliteChance: { fromStage: number; chance: number; hpMul: number; rewardMul: number; scale: number };
  formations: FormationData[];
  formationRule: Record<string, string>;
  hierarchy: Record<string, unknown>;
  infiniteBosses: Record<string, string>;
  bossCycle: BossCycleData;
  traitsNote?: string;
  bossNote?: string;
}

export interface ThemeData {
  theme: number;
  name: string;
  region: string;
  faction: string;
  mapId: string;
  mapName: string;
  background: string;
  gimmick: string;
  finalBoss: { name: string; look: string; pattern: string; rank: string; legion?: string };
  hpMul: number;
  armorOffset: number;
  specialOffset: number;
  bossSchedule: Record<string, string>;
}

export interface CampaignFile {
  version: number;
  stagesPerTheme: number;
  checkpointEvery: number;
  stageBands: { stages: [number, number]; sky: string }[];
  checkpointStart: {
    prepSeconds: number;
    supportGold: Record<string, number>;
    workers: Record<string, number>;
  };
  checkpointRewards: Record<string, unknown>;
  difficulty: Record<string, string>;
  themes: ThemeData[];
}

export type Point = [number, number];

export interface MapData {
  id: string;
  name: string;
  mode: 'infinite' | 'stage';
  version: number;
  width: number;
  height: number;
  legend: Record<string, string>;
  tiles: string[];
  waypoints: Point[];
  loop?: boolean;
  spawn: Point;
  exit?: Point;
  pathLength: number;
  turns: number;
  crossings: Point[];
  mobLimit?: number;
  lives?: number;
  blocks: Record<string, { x: number; y: number; w: number; h: number }>;
  buildableCount: number;
  notes: string;
  edgePlots?: Record<string, Point[]>;
}

export interface SpeedOption {
  mul: number;
  unlockLevel: number;
}

/** 한 판의 흐름 (GDD.md 2.2). */
export interface MatchConfig {
  startGold: number;
  prepSeconds: number;
  stageSeconds: number;
  slotsPerStage: number;
  /** 0.05초(1틱) 단위 */
  spawnIntervalSeconds: number;
  bossEvery: number;
  infiniteMapId: string;
}

/** 소환 (GDD.md 3·4.3). */
export interface SummonConfig {
  /** 소환 비용 (원) */
  cost: number;
  /** 신 타워 확률 (0.0001 = 0.01%) */
  godChance: number;
  /** 자동 소환 칸 고르기 반경 (체비쇼프 칸, T-2 꾹 눌러 연속 소환·[🎲 소환] 버튼) */
  autoRadius: number;
}

/** 타워 판매 (T-2, GDD 3장): 받는 돈 = 가치 × rateBp ÷ 10000 내림. 가치 = 소환 비용 × gradeMul (히든 = 재료 가치 합). */
export interface SellConfig {
  rateBp: number;
  /** 등급별 가치 배율 (노말 1·레어 3·유니크 9·히어로 27·레전드 81·신 = 레전드). 히든은 재료 합이라 없다 */
  gradeMul: Record<Exclude<Grade, 'hidden'>, number>;
  /** 판매 버튼을 두 번 눌러야 하는 등급 */
  confirmGrades: Grade[];
  /** 두 번째 누르기를 기다리는 시간 (초) */
  confirmSeconds: number;
}

/** 개발자 도구 '확률 조정' 한 줄 (T-2): key = sim이 아는 확률 이름 (god·gamble:i·cardRare·critBonus·summonRare·mergeDouble·elite) */
export interface DevChanceData {
  key: string;
  name: string;
  note?: string;
}

export interface DevChancesConfig {
  /** 한 번 누를 때 바뀌는 값 (bp, 10 = 0.1%p) */
  stepBp: number;
  list: DevChanceData[];
}

/** 전투 (GDD.md 5.2~5.4, 4.5). */
export interface CombatConfig {
  /** 원거리 투사체 속도 (칸/초) */
  projectileSpeed: number;
  /** 공속 한도: 기본 공속의 몇 배까지 (5) */
  apsMaxMul: number;
  /** 공속 한도: 초당 최대 공격 횟수 (15) */
  apsMaxPerSec: number;
  /** 방어 관통·마법 관통 최대 (0.9 = 90%) */
  penMax: number;
  /** 치명타 확률 최대 (1 = 100%) */
  critChanceMax: number;
  /** 받는 피해 증가(약화) 합 최대 (1 = +100%) */
  vulnMax: number;
  /** 연쇄: 튕길 때마다 피해 감소 (0.2 = −20%, 곱연산 0.8^k) */
  chainFalloff: number;
  /** 연쇄: 다음 몹을 찾는 반경 (칸) */
  chainRange: number;
  /** 관통: 직선의 폭 (칸). 몹 중심이 직선에서 폭의 절반 안이면 맞는다 */
  pierceWidth: number;
  /** 이동·교환한 타워가 공격하지 않는 시간 (초, 1틱 단위) */
  movePauseSeconds: number;
}

/** 승급 (GDD.md 4.4). */
export interface MergeConfig {
  /** 같은 종류·같은 등급 몇 개로 승급하는가 (3) */
  count: number;
}

/** 상태 이상 (GDD.md 5.5, M3b). */
export interface StatusConfig {
  /** 둔화 최대 (0.7 = 70%). 둔화는 가장 강한 것 하나만 적용 */
  slowMax: number;
  /** 보스 둔화 배율 (0.5 = 효과 절반) */
  bossSlowMul: number;
  /** 보스 기절·정지·빙결 지속시간 배율 (0.3 = 30%) */
  bossCcDurationMul: number;
  /** 기절·정지·빙결이 끝난 직후 행동 불가 면역 (초, 1틱 단위) */
  ccImmuneSeconds: number;
  /** 빙결 중 받는 피해 증가 (0.1 = +10%) */
  freezeVuln: number;
  /** 지속 피해(화상·독·출혈)가 들어가는 간격 (초, 1틱 단위) */
  dotIntervalSeconds: number;
}

/** 지원 효과 범위 (GDD.md 5.6): 체비쇼프 거리. */
export interface AuraConfig {
  /** '주변 8칸' (3×3, 자신 제외) = 1 */
  around8: number;
  /** '주변 24칸' (5×5, 자신 제외) = 2 */
  around24: number;
}

/** 타워 레벨 (TOWERS.md 0.1, M9에서 계정이 레벨을 준다. 지금은 모두 1). */
export interface TowerLevelConfig {
  /** 최대 레벨 (15). 특색 params [Lv1, Lv15]는 (lv − 1) ÷ (max − 1)로 보간 */
  max: number;
  /** 레벨당 공격력 증가 (0.04 = +4%, Lv1 = 0) */
  atkPerLevel: number;
}

/** HUD 경고 기준 (UI.md 4.2). */
export interface HudConfig {
  timerWarnSeconds: number;
  mobWarnCount: number;
  livesWarn: number;
}

/** 개발용 치트 (?debug=1, CLAUDE.md 4장). */
export interface DebugConfig {
  /** HUD [💰+] 한 번에 더하는 돈 (원) */
  addGold: number;
}

/** 일꾼 (GDD.md 3장, M4-1). */
export interface WorkerConfig {
  /** 고용 비용 (원) */
  cost: number;
  /** 최대 수 (카드 '무료 일꾼'은 이 수를 넘길 수 있다) */
  max: number;
  /** 수입 간격 (초, 1틱 단위) — 판 시작부터 이 간격마다 */
  intervalSeconds: number;
  /** 1명당 한 번 수입 (원) */
  income: number;
}

/** 기본 보스 (ENEMIES.md 4장, M4-5·M4-6). */
export interface BossConfig {
  /** 처치 보상 (원) */
  reward: number;
  /** 제한 시간 (초) — 단계 길이 이하 */
  timeLimitSeconds: number;
}

/** 투명·감지 (GDD.md 5.7, M4-4). */
export interface DetectionConfig {
  /** 감지 오라를 벗어나도 드러난 채로 남는 시간 (초, 1틱 단위) */
  revealHoldSeconds: number;
}

/** 조합 편대 (ENEMIES.md 3.4, M4-3b). */
export interface FormationConfig {
  /** 예고 배너: 다음 단계 시작 몇 초 전 */
  previewSeconds: number;
  /** 편대 단계 주기 (5의 배수) */
  every: number;
  /** 캠페인 테마 t 등장 단계 = from − campaignShift × (t − 1) */
  campaignShift: number;
  /** 캠페인 등장 단계 최소 */
  campaignMin: number;
}

/** 등급 강화 하나 (GDD.md 7.1, M5-3): 대상 등급들의 타워 공격력 +atkPerLevel/Lv, 비용 cost[0] + cost[1] × Lv. */
export interface GradeUpgradeConfig {
  id: string;
  name: string;
  grades: Grade[];
  atkPerLevel: number;
  max: number;
  cost: [number, number];
}

/** 능력치 강화가 올리는 값 */
export const UPGRADE_STATS = ['apsPct', 'armorPen', 'magicPen', 'critChance', 'critMul', 'rangePct'] as const;
export type UpgradeStat = (typeof UPGRADE_STATS)[number];

/** 능력치 강화 하나 (모든 타워). */
export interface StatUpgradeConfig {
  id: string;
  name: string;
  icon: string;
  stat: UpgradeStat;
  perLevel: number;
  max: number;
  cost: [number, number];
}

/** 초월 강화 (등급 강화 3종이 모두 최대일 때). 비용 표는 curves.json transcendCost. */
export interface TranscendConfig {
  id: string;
  name: string;
  atkPerLevel: number;
  costBase: number;
  costGrowth: number;
}

export interface UpgradeConfig {
  grade: GradeUpgradeConfig[];
  stat: StatUpgradeConfig[];
  transcend: TranscendConfig;
}

/** 도박 (GDD.md 7.2, M5-5). */
export interface GambleConfig {
  tables: { cost: number; unlockLevel: number }[];
  outcomes: { mul: number; chance: number }[];
  jackpot: { gauge: number; minMul: number };
  /** 도박꾼 특색이 줄인 ×0 확률을 더할 배율 (outcomes의 mul 값) */
  zeroShiftTo: number;
  recent: number;
  /** 화면 대박 연출 최소 배율 (UI.md 10장 '도박 ×5 이상') */
  bigMul: number;
}

/** 도전 (GDD.md 6장, M5-2). */
export interface ChallengeConfig {
  cooldownSeconds: number;
  timeLimitSeconds: number;
}

export interface GameConfig {
  version: number;
  speeds: SpeedOption[];
  /** 개발자 모드 배속 순환 목록 (T-1, src/devMode.ts). ×1부터 오름차순, 최대 ×16 (T-2: ×1·×2·×4·×8·×16 — 일반 ×3은 없음) */
  devSpeeds: number[];
  maxFrameMs: number;
  maxPlayers: number;
  match: MatchConfig;
  summon: SummonConfig;
  /** 타워 판매 (T-2) */
  sell: SellConfig;
  /** 개발자 도구 확률 조정 목록 (T-2) */
  devChances: DevChancesConfig;
  combat: CombatConfig;
  merge: MergeConfig;
  hud: HudConfig;
  debug: DebugConfig;
  status: StatusConfig;
  aura: AuraConfig;
  towerLevel: TowerLevelConfig;
  worker: WorkerConfig;
  boss: BossConfig;
  detection: DetectionConfig;
  formation: FormationConfig;
  upgrade: UpgradeConfig;
  gamble: GambleConfig;
  challenge: ChallengeConfig;
  /** 화면 전용 그림 설정 (HF-2): 전투 배경 밴드·보스 컷인. sim은 읽지 않는다 */
  art: ArtConfig;
}

/** game.json art (HF-2, 화면 전용) — 뜻은 game.json art.note */
export interface ArtConfig {
  note: string;
  /** 하늘 밴드 하나의 단계 수 (10) */
  bandStages: number;
  /** 밴드 수 (5: 낮·노을·밤·전운·침공 절정) */
  bands: number;
  /** 무한 모드에서 테마 하나가 이어지는 단계 수 (50) */
  infiniteThemeStages: number;
  /** 배경 테마 수 (10) */
  themes: number;
  /** 밴드가 끝나기 몇 단계 전부터 다음 배경을 미리 받나 */
  preloadStages: number;
  /** 배경이 바뀔 때 서서히 바뀌는 시간 (ms, 실제 시간) */
  crossfadeMs: number;
  /** 보스 컷인 전체 길이 (ms, 실제 시간 — 배속과 무관) */
  cutinMs: number;
  /** 타이틀 그림 수 (public/assets/title/title_keyart_1~n.webp, 0이면 절차 타이틀만) */
  titleArts: number;
  /** 컷인 그림이 있는 보스 id (public/assets/cutins/cutin_<id>.webp) */
  cutins: string[];
}

/** 보스 효과 카드 효과 종류 (cards.json effect.type) */
export const CARD_EFFECTS = [
  'atkPct',
  'goldPerBoss',
  'rareSummons',
  'workerMul',
  'quake',
  'summonDiscount',
  'mobSlow',
  'freeWorkers',
  'mergeChoice',
  'twinSummon',
  'godMul',
  'goldPct',
] as const;
export type CardEffectType = (typeof CARD_EFFECTS)[number];

/** 카드 효과: 종류 + 수치 (종류마다 value·min·max·seconds 중 쓰는 것). */
export interface CardEffect {
  type: CardEffectType;
  value?: number;
  min?: number;
  max?: number;
  seconds?: number;
}

export interface CardData {
  id: string;
  name: string;
  /** common 일반 · rare 희귀 */
  grade: 'common' | 'rare';
  desc: string;
  effect: CardEffect;
}

/** cards.json: 보스 효과 카드 (GDD.md 3.1, M4-7). */
export interface CardsFile {
  version: number;
  notes?: string;
  /** 한 번에 보여주는 카드 수 (3) */
  offerSize: number;
  /** 카드 1장마다 희귀 카드일 확률 (0.15) */
  rareChance: number;
  cards: CardData[];
}

/** 미리 계산한 성장 곡선 표 (tools/precompute-curves.mjs). 인덱스 = 단계 (0 ~ maxStage). */
export interface CurvesFile {
  version: number;
  source: string;
  maxStage: number;
  /** 단계별 기준 체력 HP(s), 정수. hp[0] = 0 (준비 단계) */
  hp: number[];
  /** 방어력·마법 저항 배율 (bp). 10000 + 200s */
  armorMulBp: number[];
  /** 방어력·마법 저항 추가값. max(0, s − 100) */
  armorFlat: number[];
  /** 초월 강화 Lv → Lv+1 비용 (game.json upgrade.transcend, M5-3). 표 끝 = 최대 레벨 */
  transcendCost: number[];
}

/** 판 안 미션 조건 종류 (missions.json cond.type, M5-6) */
export const MISSION_TYPES = ['distinct', 'same', 'towers', 'own', 'stat', 'upgradeLevel', 'idle', 'danger', 'gamble', 'reach', 'edge', 'family'] as const;
export type MissionType = (typeof MISSION_TYPES)[number];
/** stat 조건이 읽는 판 상태 */
export const MISSION_STATS = ['summons', 'merges', 'upgrades', 'gambles', 'workers', 'gold', 'kills', 'bossesKilled', 'challengeBest', 'challengeClears', 'stage'] as const;
export type MissionStat = (typeof MISSION_STATS)[number];

/** 미션 조건 (종류마다 쓰는 값만, missions.json notes). */
export interface MissionCond {
  type: MissionType;
  n?: number;
  grade?: Grade;
  key?: string;
  seconds?: number;
  mobs?: number;
  lives?: number;
  table?: number;
  minMul?: number;
  maxMul?: number;
  maxGold?: number;
  stage?: number;
  onlyGrade?: Grade;
  minWorkers?: number;
  maxTowers?: number;
  maxSummons?: number;
  maxUpgrades?: number;
  belowLimit?: number;
  towers?: string[];
}

export interface MissionData {
  id: string;
  no: number;
  hidden: boolean;
  cat: string;
  name: string;
  desc: string;
  reward: number;
  cond: MissionCond;
}

/** missions.json: 판 안 미션 (GDD.md 8장). */
export interface MissionsFile {
  version: number;
  notes?: string;
  missions: MissionData[];
}

export interface GameData {
  towers: TowersFile;
  enemies: EnemiesFile;
  campaign: CampaignFile;
  maps: Record<string, MapData>;
  game: GameConfig;
  curves: CurvesFile;
  decks: DecksFile;
  cards: CardsFile;
  missions: MissionsFile;
}

// ---------------------------------------------------------------------------
// 스키마
// ---------------------------------------------------------------------------

const point = s.tuple(s.int(), s.int());
const stageRange = s.withCheck<[number, number]>(s.tuple(s.int({ min: 1 }), s.int({ min: 1 })), (v, path, issues) => {
  if (v[0] > v[1]) issues.push({ path, message: `시작 단계(${v[0]})가 끝 단계(${v[1]})보다 크다` });
});
const mix = s.rec(s.int({ min: 1 }));
/** 색: `#RRGGBB` (화면이 16진수 정수로 바꿔 쓴다. 'blue' 같은 이름은 그리기에서 예외가 난다). */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const color = s.withCheck<string>(s.str({ nonEmpty: true }), (v, path, issues) => {
  if (!HEX_COLOR.test(v)) issues.push({ path, message: `색은 #RRGGBB 형식이어야 하는데 ${JSON.stringify(v)}` });
});

/** 캐릭터 설명 한 문장 (HF-2): 비어 있지 않고, 마침표로 끝나며, 중간에 문장이 끊기지 않고, 정보 패널 두 줄에 들어가는 길이 */
export const DESC_MAX_CHARS = 80;
const sentence = s.withCheck<string>(s.str({ nonEmpty: true }), (v, path, issues) => {
  const t = v.trim();
  if (!/[.!?]$/.test(t)) issues.push({ path, message: `한 문장(마침표로 끝남)이어야 하는데 ${JSON.stringify(v)}` });
  else if (/[.!?]\s/.test(t.slice(0, -1))) issues.push({ path, message: `한 문장이어야 하는데 문장이 둘 이상: ${JSON.stringify(v)}` });
  if (t.length > DESC_MAX_CHARS) issues.push({ path, message: `${DESC_MAX_CHARS}자 이하여야 하는데 ${t.length}자` });
});

const towerSchema = s.obj({
  id: s.str({ nonEmpty: true }),
  name: s.str({ nonEmpty: true }),
  lore: sentence,
  role: sentence,
  grade: s.str({ enum: GRADES }),
  special: s.int({ min: 0 }),
  unlock: s.str({ enum: UNLOCKS }),
  tags: s.arr(s.str()),
  damageType: s.str({ enum: DAMAGE_TYPES }),
  shape: s.str({ enum: SHAPES }),
  shapeValue: s.num({ min: 0 }),
  aps: s.num({ min: 0 }),
  range: s.num({ min: 0 }),
  armorPen: s.num({ min: 0, max: 1 }),
  magicPen: s.num({ min: 0, max: 1 }),
  crit: s.num({ min: 0, max: 1 }),
  critMul: s.num({ min: 1 }),
  detect: s.str({ enum: DETECTS }),
  detectRange: s.num({ min: 0 }),
  target: s.str({ enum: TARGETS }),
  dot: s.nullable(
    s.obj({ kind: s.str({ nonEmpty: true }), perSec: s.num({ min: 0 }), dur: s.num({ min: 0 }), stacks: s.int({ min: 1 }) }),
  ),
  ability: s.str(),
  awaken: s.str(),
  params: s.rec(s.any()),
  recipe: s.nullable(s.arr(s.str({ nonEmpty: true }), { minLength: 2 })),
  design: s.obj({ ratio: s.num({ min: 0 }), shapeFactor: s.num({ min: 0 }) }),
  atk: s.num({ min: 0 }),
  matk: s.num({ min: 0 }),
  tatk: s.num({ min: 0 }),
  faction: s.str({ nonEmpty: true }),
  element: s.nullable(s.str({ nonEmpty: true })),
});

export const towersSchema: Schema = s.obj({
  version: s.int({ min: 1 }),
  baseDps: s.obj(Object.fromEntries(GRADES.map((g) => [g, s.num({ min: 0 })]))),
  towers: s.arr(towerSchema, { minLength: 1, uniqueBy: 'id' }),
  factions: s.rec(
    s.obj({
      name: s.str({ nonEmpty: true }),
      color,
      thresholds: s.arr(s.int({ min: 1 }), { minLength: 1 }),
      bonus: s.arr(s.str(), { minLength: 1 }),
    }),
  ),
  rivals: s.arr(s.tuple(s.str(), s.str(), s.str())),
  alliance: s.obj({ desc: s.str() }),
  elements: s.rec(s.obj({ name: s.str({ nonEmpty: true }), effect: s.str() })),
});

const mobSchema = s.obj({
  id: s.str({ nonEmpty: true }),
  name: s.str({ nonEmpty: true }),
  look: s.str(),
  /** 0 = 일반 등장 없음 (spawnOnly: 다른 몹이 깨질 때만 등장) */
  fromStage: s.int({ min: 0 }),
  hpMul: s.num({ min: 0 }),
  armor: s.num({ min: 0 }),
  magicRes: s.num({ min: 0 }),
  speed: s.num({ min: 0 }),
  ccResist: s.num({ min: 0, max: 1 }),
  traits: s.arr(s.str()),
  lifeDamage: s.int({ min: 0 }),
  rewardMul: s.num({ min: 0 }),
  size: s.str(),
  special: s.bool(),
  legion: s.str({ nonEmpty: true }),
  spawnOnly: s.opt(s.bool()),
  splitInto: s.opt(
    s.obj({
      id: s.str({ nonEmpty: true }),
      count: s.int({ min: 1, max: 10 }),
      hpOfParent: s.num({ min: 0.0001, max: 10 }),
      speed: s.opt(s.num({ min: 0 })),
      reward: s.opt(s.int({ min: 0 })),
      small: s.opt(s.bool()),
    }),
  ),
  swarm: s.opt(s.int({ min: 1, max: 10 })),
  invisible: s.opt(s.bool()),
  evade: s.opt(s.num({ min: 0, max: 1 })),
  heal: s.opt(s.obj({ everySeconds: tickSeconds(0.05, 600), radius: s.num({ min: 0 }), pct: s.num({ min: 0, max: 1 }) })),
  shield: s.opt(s.obj({ pct: s.num({ min: 0, max: 10 }), areaMul: s.num({ min: 1, max: 10 }) })),
  haste: s.opt(s.obj({ belowHp: s.num({ min: 0, max: 1 }), speed: s.num({ min: 0, max: 10 }) })),
});

const slotRange = s.withCheck<[number, number]>(s.tuple(s.int({ min: 1 }), s.int({ min: 1 })), (v, path, issues) => {
  if (v[0] > v[1]) issues.push({ path, message: `시작 칸(${v[0]})이 끝 칸(${v[1]})보다 크다` });
});

const growthSchema = s.obj({
  note: s.opt(s.str()),
  maxStage: s.int({ min: 1, max: 1000 }),
  hp: s.obj({
    base: s.num({ min: 1 }),
    segments: s.withCheck<{ from: number; rate: number }[]>(
      s.arr(s.obj({ from: s.int({ min: 1 }), rate: s.num({ min: 1 }) }), { minLength: 1 }),
      (v, path, issues) => {
        if (v[0]?.from !== 1) issues.push({ path: `${path}[0].from`, message: '첫 구간은 1단계부터' });
        for (let i = 1; i < v.length; i++) {
          if ((v[i] as { from: number }).from <= (v[i - 1] as { from: number }).from) {
            issues.push({ path: `${path}[${i}].from`, message: '구간 시작 단계는 오름차순이어야 한다' });
          }
        }
      },
    ),
  }),
  armor: s.obj({ perStage: s.num({ min: 0 }), flatFrom: s.int({ min: 0 }), flatPerStage: s.num({ min: 0 }) }),
  reward: s.obj({ base: s.int({ min: 0 }), perStages: s.int({ min: 1 }) }),
});

const bossSchema = s.obj({
  stage: s.int({ min: 1 }),
  id: s.str({ nonEmpty: true }),
  name: s.str({ nonEmpty: true }),
  look: s.str(),
  hpMul: s.num({ min: 0 }),
  armor: s.num({ min: 0 }),
  magicRes: s.num({ min: 0 }),
  speed: s.num({ min: 0 }),
  ccResist: s.num({ min: 0, max: 1 }),
  invisible: s.bool(),
  pattern: s.str(),
  legion: s.str({ nonEmpty: true }),
  rank: s.str({ nonEmpty: true }),
  params: s.rec(s.any()),
});

const challengeSchema = s.obj({
  level: s.int({ min: 1 }),
  id: s.str({ nonEmpty: true }),
  name: s.str({ nonEmpty: true }),
  look: s.str(),
  hp: s.int({ min: 1 }),
  reward: s.int({ min: 0 }),
  armor: s.num({ min: 0 }),
  magicRes: s.num({ min: 0 }),
  speed: s.num({ min: 0 }),
  invisible: s.bool(),
  ability: s.str(),
  legion: s.str({ nonEmpty: true }),
  twin: s.opt(s.int({ min: 2, max: 8 })),
  immune: s.opt(s.arr(s.str({ enum: CHALLENGE_IMMUNES }), { minLength: 1 })),
  teleport: s.opt(s.obj({ everySeconds: tickSeconds(0.05, 60), tiles: s.num({ min: 0.001, max: 100 }) })),
  freezeTowers: s.opt(s.obj({ everySeconds: tickSeconds(0.05, 60), radius: s.num({ min: 0.001, max: 50 }), seconds: tickSeconds(0.05, 60) })),
  regen: s.opt(s.obj({ everySeconds: tickSeconds(0.05, 60), pct: s.num({ min: 0, max: 1 }) })),
  invulnerable: s.opt(s.obj({ at: s.num({ min: 0, max: 1 }), seconds: tickSeconds(0.05, 60), speedMul: s.num({ min: 1, max: 10 }) })),
});

export const enemiesSchema: Schema = s.obj({
  version: s.int({ min: 1 }),
  formulas: s.rec(s.str()),
  mobs: s.arr(mobSchema, { minLength: 1, uniqueBy: 'id' }),
  growth: growthSchema,
  composition: s.arr(s.obj({ stages: stageRange, mix }), { minLength: 1 }),
  spawnOrder: s.obj({
    note: s.opt(s.str()),
    middle: s.obj({ slots: slotRange, mobs: s.arr(s.str({ nonEmpty: true })) }),
    back: s.obj({ slots: slotRange }),
  }),
  bosses: s.arr(bossSchema, { minLength: 1, uniqueBy: 'id' }),
  challenges: s.arr(challengeSchema, { minLength: 1, uniqueBy: 'id' }),
  eliteChance: s.obj({
    fromStage: s.int({ min: 1 }),
    chance: s.num({ min: 0, max: 1 }),
    hpMul: s.num({ min: 0 }),
    rewardMul: s.num({ min: 0 }),
    scale: s.num({ min: 0.1, max: 5 }),
  }),
  formations: s.arr(
    s.obj({
      id: s.str({ nonEmpty: true }),
      name: s.str({ nonEmpty: true }),
      mix,
      from: s.int({ min: 1 }),
      why: s.str(),
      counter: s.str(),
      banner: s.str({ nonEmpty: true }),
      hint: s.str({ nonEmpty: true }),
    }),
    { uniqueBy: 'id' },
  ),
  formationRule: s.rec(s.str()),
  hierarchy: s.rec(s.any()),
  infiniteBosses: s.rec(s.str()),
  bossCycle: s.obj({
    note: s.opt(s.str()),
    every: s.int({ min: 1 }),
    captains: s.arr(s.str({ nonEmpty: true }), { minLength: 1 }),
    commanderEvery: s.int({ min: 1 }),
    commanders: s.arr(s.str({ nonEmpty: true }), { minLength: 1 }),
    lordEvery: s.int({ min: 1 }),
    lord: s.str({ nonEmpty: true }),
  }),
  traitsNote: s.opt(s.str()),
  bossNote: s.opt(s.str()),
});

export const campaignSchema: Schema = s.obj({
  version: s.int({ min: 1 }),
  stagesPerTheme: s.int({ min: 1 }),
  checkpointEvery: s.int({ min: 1 }),
  stageBands: s.arr(s.obj({ stages: stageRange, sky: s.str({ nonEmpty: true }) }), { minLength: 1 }),
  checkpointStart: s.obj({
    prepSeconds: s.int({ min: 0 }),
    supportGold: s.rec(s.int({ min: 0 }), /^\d+$/),
    workers: s.rec(s.int({ min: 0 }), /^\d+$/),
  }),
  /** 키: 발판 단계("10"…"50") + "repeat"(재통과 보상 설명) */
  checkpointRewards: s.rec(s.any(), /^(\d+|repeat)$/),
  difficulty: s.rec(s.str()),
  themes: s.arr(
    s.obj({
      theme: s.int({ min: 1 }),
      name: s.str({ nonEmpty: true }),
      region: s.str(),
      faction: s.str({ nonEmpty: true }),
      mapId: s.str({ nonEmpty: true }),
      mapName: s.str({ nonEmpty: true }),
      background: s.str(),
      gimmick: s.str(),
      finalBoss: s.obj({
        name: s.str({ nonEmpty: true }),
        look: s.str(),
        pattern: s.str(),
        rank: s.str({ nonEmpty: true }),
        /** 4천왕·군주는 군단장 자신이라 legion이 없다 (enemies.json hierarchy 참고) */
        legion: s.opt(s.str({ nonEmpty: true })),
      }),
      hpMul: s.num({ min: 0 }),
      armorOffset: s.num({ min: 0 }),
      specialOffset: s.int({ min: 0 }),
      bossSchedule: s.rec(s.str({ nonEmpty: true }), /^\d+$/),
    }),
    { minLength: 1, uniqueBy: 'theme' },
  ),
});

const samePoint = (a: Point, b: Point): boolean => a[0] === b[0] && a[1] === b[1];
const fmtPoint = (p: Point): string => `[${p[0]},${p[1]}]`;

/**
 * 웨이포인트에서 경로 길이(맨해튼 길이 합)와 방향 전환 수를 계산한다.
 * loop 맵은 마지막 구간 → 첫 구간으로 이어질 때의 방향 전환도 센다.
 */
export function measurePath(waypoints: readonly Point[], loop: boolean): { length: number; turns: number } {
  let length = 0;
  const dirs: string[] = [];
  for (let i = 1; i < waypoints.length; i++) {
    const [ax, ay] = waypoints[i - 1] as Point;
    const [bx, by] = waypoints[i] as Point;
    length += Math.abs(bx - ax) + Math.abs(by - ay);
    dirs.push(`${Math.sign(bx - ax)},${Math.sign(by - ay)}`);
  }
  let turns = 0;
  for (let i = 1; i < dirs.length; i++) if (dirs[i] !== dirs[i - 1]) turns++;
  if (loop && dirs.length > 1 && dirs[0] !== dirs[dirs.length - 1]) turns++;
  return { length, turns };
}

/**
 * 맵 의미 검사: 격자 크기, 글자, 배치 칸 수, 웨이포인트 직각 연결,
 * 그리고 웨이포인트에서 나오는 값(spawn·exit·pathLength·turns)이 적어 둔 값과 맞는지.
 * M6에서 생성하는 테마 맵도 이 검사를 통과해야 한다.
 */
function checkMap(m: MapData, root: string, issues: Issue[]): void {
  const path = root ? `${root}.` : '';
  if (m.tiles.length !== m.height) {
    issues.push({ path: `${path}tiles`, message: `줄 수(${m.tiles.length})가 height(${m.height})와 다르다` });
  }
  const legendChars = Object.keys(m.legend);
  let buildable = 0;
  m.tiles.forEach((row, y) => {
    if (row.length !== m.width) {
      issues.push({ path: `${path}tiles[${y}]`, message: `길이(${row.length})가 width(${m.width})와 다르다` });
    }
    for (let x = 0; x < row.length; x++) {
      const ch = row[x] as string;
      if (!legendChars.includes(ch)) {
        issues.push({ path: `${path}tiles[${y}]`, message: `legend에 없는 글자 ${JSON.stringify(ch)} (x=${x})` });
      }
      if (ch === 'B') buildable++;
    }
  });
  if (buildable !== m.buildableCount) {
    issues.push({ path: `${path}buildableCount`, message: `배치 칸(B) 실제 ${buildable}개인데 ${m.buildableCount}로 적혀 있다` });
  }
  for (let i = 1; i < m.waypoints.length; i++) {
    const [ax, ay] = m.waypoints[i - 1] as Point;
    const [bx, by] = m.waypoints[i] as Point;
    if (ax !== bx && ay !== by) {
      issues.push({ path: `${path}waypoints[${i}]`, message: `직각 경로가 아니다 ([${ax},${ay}] → [${bx},${by}])` });
    }
  }
  const inside = ([x, y]: Point): boolean => x >= -1 && y >= -1 && x <= m.width && y <= m.height;
  m.waypoints.forEach((p, i) => {
    if (!inside(p)) issues.push({ path: `${path}waypoints[${i}]`, message: `맵 밖 좌표 [${p[0]},${p[1]}]` });
    if (i > 0 && samePoint(p, m.waypoints[i - 1] as Point)) {
      issues.push({ path: `${path}waypoints[${i}]`, message: `앞 점과 같은 좌표 ${fmtPoint(p)} (길이 0 구간)` });
    }
  });
  const first = m.waypoints[0] as Point;
  const last = m.waypoints[m.waypoints.length - 1] as Point;
  if (!samePoint(m.spawn, first)) {
    issues.push({ path: `${path}spawn`, message: `spawn ${fmtPoint(m.spawn)}이 첫 웨이포인트 ${fmtPoint(first)}와 다르다` });
  }
  if (m.loop) {
    if (!samePoint(first, last)) {
      issues.push({ path: `${path}waypoints`, message: `loop 맵은 마지막 웨이포인트 ${fmtPoint(last)}가 첫 점 ${fmtPoint(first)}으로 돌아와야 한다` });
    }
  } else if (m.exit !== undefined && !samePoint(m.exit, last)) {
    issues.push({ path: `${path}exit`, message: `exit ${fmtPoint(m.exit)}이 마지막 웨이포인트 ${fmtPoint(last)}와 다르다` });
  }
  // 경로가 지나는 맵 안 칸은 모두 P, P 칸은 모두 경로 위 (그림과 실제 이동이 어긋나지 않게)
  const onPath = new Set<string>();
  for (let i = 1; i < m.waypoints.length; i++) {
    const [ax, ay] = m.waypoints[i - 1] as Point;
    const [bx, by] = m.waypoints[i] as Point;
    if (ax !== bx && ay !== by) continue; // 위에서 이미 보고함
    const dx = Math.sign(bx - ax);
    const dy = Math.sign(by - ay);
    for (let x = ax, y = ay; ; x += dx, y += dy) {
      onPath.add(`${x},${y}`);
      if (x === bx && y === by) break;
    }
  }
  const pathNotP: string[] = [];
  const pNotPath: string[] = [];
  m.tiles.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const isP = row[x] === 'P';
      const on = onPath.has(`${x},${y}`);
      if (on && !isP) pathNotP.push(`[${x},${y}]`);
      if (isP && !on) pNotPath.push(`[${x},${y}]`);
    }
  });
  if (pathNotP.length > 0) {
    issues.push({ path: `${path}tiles`, message: `경로가 지나는데 P가 아닌 칸: ${pathNotP.slice(0, 8).join(' ')}` });
  }
  if (pNotPath.length > 0) {
    issues.push({ path: `${path}tiles`, message: `경로가 지나지 않는 P 칸: ${pNotPath.slice(0, 8).join(' ')}` });
  }
  const measured = measurePath(m.waypoints, m.loop === true);
  if (measured.length !== m.pathLength) {
    issues.push({ path: `${path}pathLength`, message: `웨이포인트 길이 합은 ${measured.length}칸인데 ${m.pathLength}로 적혀 있다` });
  }
  if (measured.turns !== m.turns) {
    issues.push({ path: `${path}turns`, message: `웨이포인트 방향 전환은 ${measured.turns}번인데 ${m.turns}로 적혀 있다` });
  }
  if (m.mode === 'infinite' && m.mobLimit === undefined) {
    issues.push({ path: `${path}mobLimit`, message: '무한 모드 맵에는 mobLimit이 필요하다' });
  }
  if (m.mode === 'stage') {
    if (m.lives === undefined) issues.push({ path: `${path}lives`, message: '스테이지 맵에는 lives가 필요하다' });
    if (m.exit === undefined) issues.push({ path: `${path}exit`, message: '스테이지 맵에는 exit가 필요하다' });
  }
}

export const mapSchema: Schema = s.withCheck<MapData>(
  s.obj({
    id: s.str({ nonEmpty: true }),
    name: s.str({ nonEmpty: true }),
    mode: s.str({ enum: ['infinite', 'stage'] }),
    version: s.int({ min: 1 }),
    width: s.int({ min: 1, max: 64 }),
    height: s.int({ min: 1, max: 64 }),
    legend: s.rec(s.str()),
    tiles: s.arr(s.str({ nonEmpty: true }), { minLength: 1 }),
    waypoints: s.arr(point, { minLength: 2 }),
    loop: s.opt(s.bool()),
    spawn: point,
    exit: s.opt(point),
    pathLength: s.int({ min: 1 }),
    turns: s.int({ min: 0 }),
    crossings: s.arr(point),
    mobLimit: s.opt(s.int({ min: 1 })),
    lives: s.opt(s.int({ min: 1 })),
    blocks: s.rec(s.obj({ x: s.int({ min: 0 }), y: s.int({ min: 0 }), w: s.int({ min: 1 }), h: s.int({ min: 1 }) })),
    buildableCount: s.int({ min: 0 }),
    notes: s.str(),
    edgePlots: s.opt(s.rec(s.arr(point))),
  }),
  checkMap,
);

/** 0.05초(1틱) 단위 초 (min ~ max). */
function tickSeconds(min: number, max: number): Schema {
  return s.withCheck<number>(s.num({ min, max }), (v, path, issues) => {
    const ticks = v * TICK_HZ;
    if (Math.abs(ticks - Math.round(ticks)) > 1e-9) issues.push({ path, message: `0.05초(1틱) 단위여야 하는데 ${v}` });
  });
}

export const gameSchema: Schema = s.obj({
  version: s.int({ min: 1 }),
  speeds: s.withCheck<SpeedOption[]>(
    s.arr(s.obj({ mul: s.int({ min: 1, max: 16 }), unlockLevel: s.int({ min: 1 }) }), { minLength: 1 }),
    (v, path, issues) => {
      if (v[0]?.mul !== 1) issues.push({ path: `${path}[0].mul`, message: '첫 배속은 ×1이어야 한다' });
      for (let i = 1; i < v.length; i++) {
        if ((v[i] as SpeedOption).mul <= (v[i - 1] as SpeedOption).mul) {
          issues.push({ path: `${path}[${i}].mul`, message: '배속은 오름차순이어야 한다' });
        }
      }
    },
  ),
  // 개발자 배속 (T-1): TickClock이 받는 최대 배속이 ×16
  devSpeeds: s.withCheck<number[]>(s.arr(s.int({ min: 1, max: 16 }), { minLength: 1 }), (v, path, issues) => {
    if (v[0] !== 1) issues.push({ path: `${path}[0]`, message: '첫 개발자 배속은 ×1이어야 한다' });
    for (let i = 1; i < v.length; i++) {
      if ((v[i] as number) <= (v[i - 1] as number)) issues.push({ path: `${path}[${i}]`, message: '개발자 배속은 오름차순이어야 한다' });
    }
  }),
  maxFrameMs: s.int({ min: 50, max: 2000 }),
  maxPlayers: s.int({ min: 1, max: 4 }),
  match: s.obj({
    startGold: s.int({ min: 0 }),
    prepSeconds: s.int({ min: 0 }),
    stageSeconds: s.int({ min: 1 }),
    slotsPerStage: s.int({ min: 1, max: 100 }),
    spawnIntervalSeconds: s.withCheck<number>(s.num({ min: 0.05 }), (v, path, issues) => {
      // 1틱(0.05초) 단위가 아니면 틱으로 정확히 바꿀 수 없다
      const ticks = v * TICK_HZ;
      if (Math.abs(ticks - Math.round(ticks)) > 1e-9) issues.push({ path, message: `0.05초(1틱) 단위여야 하는데 ${v}` });
    }),
    bossEvery: s.int({ min: 1 }),
    infiniteMapId: s.str({ nonEmpty: true }),
  }),
  summon: s.obj({
    cost: s.int({ min: 1 }),
    godChance: s.num({ min: 0, max: 1 }),
    autoRadius: s.int({ min: 0, max: 10 }),
  }),
  // 타워 판매 (T-2): 가치 배율은 노말~신 (히든 = 조합 재료 합)
  sell: s.obj({
    rateBp: s.int({ min: 0, max: 10000 }),
    gradeMul: s.obj({
      normal: s.int({ min: 0 }),
      rare: s.int({ min: 0 }),
      unique: s.int({ min: 0 }),
      hero: s.int({ min: 0 }),
      legend: s.int({ min: 0 }),
      god: s.int({ min: 0 }),
    }),
    confirmGrades: s.arr(s.str({ enum: GRADES })),
    confirmSeconds: s.num({ min: 0, max: 10 }),
  }),
  // 개발자 도구 확률 조정 (T-2): key는 sim이 아는 이름 (교차 검사)
  devChances: s.obj({
    stepBp: s.int({ min: 1, max: 10000 }),
    list: s.arr(s.obj({ key: s.str({ nonEmpty: true }), name: s.str({ nonEmpty: true }), note: s.opt(s.str()) }), { uniqueBy: 'key' }),
  }),
  combat: s.obj({
    projectileSpeed: s.withCheck<number>(s.num({ min: 0.02 }), (v, path, issues) => {
      // 1틱에 정수 단위(1칸 = 1000)만큼 움직여야 한다: 칸/초 × 1000 ÷ 20 이 정수 → 0.02칸/초 단위
      const perTick = (v * 1000) / TICK_HZ;
      if (Math.abs(perTick - Math.round(perTick)) > 1e-9) issues.push({ path, message: `0.02칸/초 단위여야 하는데 ${v}` });
    }),
    apsMaxMul: s.int({ min: 1, max: 100 }),
    apsMaxPerSec: s.int({ min: 1, max: 1000 }),
    penMax: s.num({ min: 0, max: 1 }),
    critChanceMax: s.num({ min: 0, max: 1 }),
    vulnMax: s.num({ min: 0, max: 10 }),
    chainFalloff: s.num({ min: 0, max: 1 }),
    chainRange: s.num({ min: 0 }),
    pierceWidth: s.num({ min: 0 }),
    movePauseSeconds: s.withCheck<number>(s.num({ min: 0, max: 10 }), (v, path, issues) => {
      const ticks = v * TICK_HZ;
      if (Math.abs(ticks - Math.round(ticks)) > 1e-9) issues.push({ path, message: `0.05초(1틱) 단위여야 하는데 ${v}` });
    }),
  }),
  merge: s.obj({
    count: s.int({ min: 2, max: 10 }),
  }),
  hud: s.obj({
    timerWarnSeconds: s.int({ min: 0 }),
    mobWarnCount: s.int({ min: 0 }),
    livesWarn: s.int({ min: 0 }),
  }),
  debug: s.obj({
    // debugAddGold 명령 한도(MAX_DEBUG_GOLD = 10억)를 넘지 않게
    addGold: s.int({ min: 1, max: 1_000_000_000 }),
  }),
  status: s.obj({
    slowMax: s.num({ min: 0, max: 1 }),
    bossSlowMul: s.num({ min: 0, max: 1 }),
    bossCcDurationMul: s.num({ min: 0, max: 1 }),
    ccImmuneSeconds: tickSeconds(0, 60),
    freezeVuln: s.num({ min: 0, max: 10 }),
    dotIntervalSeconds: tickSeconds(0.05, 10),
  }),
  aura: s.obj({
    around8: s.int({ min: 1, max: 10 }),
    around24: s.int({ min: 1, max: 10 }),
  }),
  towerLevel: s.obj({
    max: s.int({ min: 2, max: 100 }),
    atkPerLevel: s.num({ min: 0, max: 1 }),
  }),
  worker: s.obj({
    cost: s.int({ min: 0 }),
    max: s.int({ min: 0, max: 1000 }),
    intervalSeconds: tickSeconds(0.05, 600),
    income: s.int({ min: 0 }),
  }),
  boss: s.obj({
    reward: s.int({ min: 0 }),
    timeLimitSeconds: tickSeconds(1, 3600),
  }),
  detection: s.obj({
    revealHoldSeconds: tickSeconds(0, 60),
  }),
  formation: s.obj({
    previewSeconds: tickSeconds(0, 600),
    every: s.int({ min: 1 }),
    campaignShift: s.int({ min: 0 }),
    campaignMin: s.int({ min: 1 }),
  }),
  upgrade: s.obj({
    grade: s.arr(
      s.obj({
        id: s.str({ nonEmpty: true }),
        name: s.str({ nonEmpty: true }),
        grades: s.arr(s.str({ enum: GRADES }), { minLength: 1 }),
        atkPerLevel: s.num({ min: 0, max: 10 }),
        max: s.int({ min: 1, max: 1000 }),
        cost: s.tuple(s.int({ min: 0 }), s.int({ min: 0 })),
      }),
      { minLength: 1, uniqueBy: 'id' },
    ),
    stat: s.arr(
      s.obj({
        id: s.str({ nonEmpty: true }),
        name: s.str({ nonEmpty: true }),
        icon: s.str({ nonEmpty: true }),
        stat: s.str({ enum: UPGRADE_STATS }),
        perLevel: s.num({ min: 0, max: 10 }),
        max: s.int({ min: 1, max: 1000 }),
        cost: s.tuple(s.int({ min: 0 }), s.int({ min: 0 })),
      }),
      { minLength: 1, uniqueBy: 'id' },
    ),
    transcend: s.obj({
      id: s.str({ nonEmpty: true }),
      name: s.str({ nonEmpty: true }),
      atkPerLevel: s.num({ min: 0, max: 10 }),
      costBase: s.int({ min: 1 }),
      costGrowth: s.num({ min: 1, max: 10 }),
    }),
  }),
  gamble: s.obj({
    tables: s.arr(s.obj({ cost: s.int({ min: 1 }), unlockLevel: s.int({ min: 1 }) }), { minLength: 1, maxLength: 10 }),
    outcomes: s.arr(s.obj({ mul: s.num({ min: 0, max: 1000 }), chance: s.num({ min: 0, max: 1 }) }), { minLength: 1, maxLength: 20 }),
    jackpot: s.obj({ gauge: s.int({ min: 1, max: 100 }), minMul: s.num({ min: 0 }) }),
    zeroShiftTo: s.num({ min: 0 }),
    recent: s.int({ min: 0, max: 20 }),
    bigMul: s.num({ min: 0 }),
  }),
  challenge: s.obj({
    cooldownSeconds: tickSeconds(0, 3600),
    timeLimitSeconds: tickSeconds(1, 600),
  }),
  art: s.obj({
    note: s.str(),
    bandStages: s.int({ min: 1, max: 100 }),
    bands: s.int({ min: 1, max: 20 }),
    infiniteThemeStages: s.int({ min: 1, max: 1000 }),
    themes: s.int({ min: 1, max: 50 }),
    preloadStages: s.int({ min: 0, max: 20 }),
    crossfadeMs: s.int({ min: 0, max: 5000 }),
    cutinMs: s.int({ min: 300, max: 5000 }),
    titleArts: s.int({ min: 0, max: 20 }),
    cutins: s.withCheck<string[]>(s.arr(s.str({ nonEmpty: true })), (v, path, issues) => {
      if (new Set(v).size !== v.length) issues.push({ path, message: '컷인 id가 겹친다' });
    }),
  }),
});

/** cards.json (GDD.md 3.1): 카드 효과 종류마다 쓰는 수치가 있는지는 crossCheck에서. */
export const cardsSchema: Schema = s.obj({
  version: s.int({ min: 1 }),
  notes: s.opt(s.str()),
  offerSize: s.int({ min: 1, max: 6 }),
  rareChance: s.num({ min: 0, max: 1 }),
  cards: s.arr(
    s.obj({
      id: s.str({ nonEmpty: true }),
      name: s.str({ nonEmpty: true }),
      grade: s.str({ enum: ['common', 'rare'] }),
      desc: s.str({ nonEmpty: true }),
      effect: s.obj({
        type: s.str({ enum: CARD_EFFECTS }),
        value: s.opt(s.num({ min: 0 })),
        min: s.opt(s.num({ min: 0 })),
        max: s.opt(s.num({ min: 0 })),
        seconds: s.opt(tickSeconds(0.05, 3600)),
      }),
    }),
    { minLength: 1, uniqueBy: 'id' },
  ),
});

const intArray = s.arr(s.int({ min: 0, max: Number.MAX_SAFE_INTEGER }), { minLength: 2 });

export const curvesSchema: Schema = s.withCheck<CurvesFile>(
  s.obj({
    version: s.int({ min: 1 }),
    source: s.str(),
    maxStage: s.int({ min: 1 }),
    hp: intArray,
    armorMulBp: intArray,
    armorFlat: intArray,
    transcendCost: s.arr(s.int({ min: 1, max: Number.MAX_SAFE_INTEGER }), { minLength: 1 }),
  }),
  (v, path, issues) => {
    const p = path ? `${path}.` : '';
    for (const key of ['hp', 'armorMulBp', 'armorFlat'] as const) {
      if (v[key].length !== v.maxStage + 1) {
        issues.push({ path: `${p}${key}`, message: `길이가 maxStage + 1(${v.maxStage + 1})이어야 하는데 ${v[key].length}` });
      }
    }
    for (let i = 2; i < v.hp.length; i++) {
      if ((v.hp[i] as number) < (v.hp[i - 1] as number)) {
        issues.push({ path: `${p}hp[${i}]`, message: '체력 곡선은 단계가 오를수록 줄면 안 된다' });
        break;
      }
    }
  },
);

// ---------------------------------------------------------------------------
// 로드
// ---------------------------------------------------------------------------

const deckIds = s.arr(s.str({ nonEmpty: true }), { minLength: 1 });

/** decks.json: 덱 규칙(등급별 개수)과 기본 덱 (TOWERS.md 10장). 타워 존재·등급·중복 검사는 crossCheck. */
export const decksSchema: Schema = s.obj({
  version: s.int({ min: 1 }),
  notes: s.opt(s.str()),
  perGrade: s.int({ min: 1, max: 10 }),
  base: s.obj(Object.fromEntries(DECK_GRADES.map((g) => [g, deckIds]))),
});

/** missions.json (GDD.md 8장): 조건 종류마다 필요한 값은 crossCheck에서. */
export const missionsSchema: Schema = s.obj({
  version: s.int({ min: 1 }),
  notes: s.opt(s.str()),
  missions: s.arr(
    s.obj({
      id: s.str({ nonEmpty: true }),
      no: s.int({ min: 1 }),
      hidden: s.bool(),
      cat: s.str({ nonEmpty: true }),
      name: s.str({ nonEmpty: true }),
      desc: s.str({ nonEmpty: true }),
      reward: s.int({ min: 0 }),
      cond: s.obj({
        type: s.str({ enum: MISSION_TYPES }),
        n: s.opt(s.int({ min: 1 })),
        grade: s.opt(s.str({ enum: GRADES })),
        key: s.opt(s.str({ nonEmpty: true })),
        seconds: s.opt(tickSeconds(0.05, 36000)),
        mobs: s.opt(s.int({ min: 0 })),
        lives: s.opt(s.int({ min: 0 })),
        table: s.opt(s.int({ min: 1 })),
        minMul: s.opt(s.num({ min: 0 })),
        maxMul: s.opt(s.num({ min: 0 })),
        maxGold: s.opt(s.int({ min: 0 })),
        stage: s.opt(s.int({ min: 1 })),
        onlyGrade: s.opt(s.str({ enum: GRADES })),
        minWorkers: s.opt(s.int({ min: 0 })),
        maxTowers: s.opt(s.int({ min: 0 })),
        maxSummons: s.opt(s.int({ min: 0 })),
        maxUpgrades: s.opt(s.int({ min: 0 })),
        belowLimit: s.opt(s.int({ min: 0 })),
        towers: s.opt(s.arr(s.str({ nonEmpty: true }), { minLength: 1 })),
      }),
    }),
    { minLength: 1, uniqueBy: 'id' },
  ),
});

/** 값 하나를 스키마로 검사하고 통과하면 T로 돌려준다. 실패하면 DataError. */
export function parseData<T>(file: string, raw: unknown, schema: Schema): T {
  const issues: Issue[] = [];
  validate(raw, schema, '', issues);
  if (issues.length > 0) throw new DataError(file, issues.map((i) => ({ ...i, file: i.file ?? file })));
  return raw as T;
}

/** JSON 문자열을 파싱 + 검사 (업데이트로 받은 데이터 등). 문법 오류도 DataError로. */
export function parseJsonText<T>(file: string, text: string, schema: Schema): T {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new DataError(file, [{ path: '', message: `JSON 문법 오류: ${(e as Error).message}` }]);
  }
  return parseData<T>(file, raw, schema);
}

/** 파일 사이 참조 검사 (종족·원소·조합 재료·몹 id·맵·곡선 표). */
export function crossCheck(data: GameData): Issue[] {
  const issues: Issue[] = [];
  const { towers, enemies } = data;
  const factionIds = new Set([...Object.keys(towers.factions), ...SPECIAL_FACTIONS]);
  const elementIds = new Set(Object.keys(towers.elements));
  const towerIds = new Set(towers.towers.map((t) => t.id));
  const mobIds = new Set(enemies.mobs.map((m) => m.id));

  towers.towers.forEach((t, i) => {
    if (!factionIds.has(t.faction)) issues.push({ file: 'towers.json', path: `towers[${i}].faction`, message: `없는 종족: ${t.faction}` });
    if (t.element !== null && !elementIds.has(t.element)) {
      issues.push({ file: 'towers.json', path: `towers[${i}].element`, message: `없는 원소: ${t.element}` });
    }
    t.recipe?.forEach((id, j) => {
      if (!towerIds.has(id)) issues.push({ file: 'towers.json', path: `towers[${i}].recipe[${j}]`, message: `없는 타워: ${id}` });
    });
  });
  towers.rivals.forEach(([a, b], i) => {
    for (const f of [a, b]) {
      if (!factionIds.has(f)) issues.push({ file: 'towers.json', path: `rivals[${i}]`, message: `없는 종족: ${f}` });
    }
  });
  enemies.composition.forEach((c, i) => {
    for (const id of Object.keys(c.mix)) {
      if (!mobIds.has(id)) issues.push({ file: 'enemies.json', path: `composition[${i}].mix.${id}`, message: `없는 몹: ${id}` });
    }
  });
  enemies.formations.forEach((f, i) => {
    for (const id of Object.keys(f.mix)) {
      if (!mobIds.has(id)) issues.push({ file: 'enemies.json', path: `formations[${i}].mix.${id}`, message: `없는 몹: ${id}` });
    }
  });
  enemies.spawnOrder.middle.mobs.forEach((id, i) => {
    if (!mobIds.has(id)) issues.push({ file: 'enemies.json', path: `spawnOrder.middle.mobs[${i}]`, message: `없는 몹: ${id}` });
  });
  for (const [key, slots] of [['middle', enemies.spawnOrder.middle.slots], ['back', enemies.spawnOrder.back.slots]] as const) {
    if (slots[1] > data.game.match.slotsPerStage) {
      issues.push({
        file: 'enemies.json',
        path: `spawnOrder.${key}.slots`,
        message: `끝 칸(${slots[1]})이 단계당 칸 수(game.json match.slotsPerStage = ${data.game.match.slotsPerStage})보다 크다`,
      });
    }
  }
  const slotsPerStage = data.game.match.slotsPerStage;
  enemies.composition.forEach((c, i) => {
    const total = Object.values(c.mix).reduce((a, b) => a + b, 0);
    if (total !== slotsPerStage) {
      issues.push({ file: 'enemies.json', path: `composition[${i}].mix`, message: `칸 수 합계 ${total} ≠ 단계당 칸 수 ${slotsPerStage}` });
    }
  });
  for (const [id, m] of Object.entries(data.maps)) {
    if (m.id !== id) issues.push({ file: `maps/${id}.json`, path: 'id', message: `파일 이름(${id})과 id(${m.id})가 다르다` });
  }
  const infinite = data.maps[data.game.match.infiniteMapId];
  if (!infinite) {
    issues.push({ file: 'game.json', path: 'match.infiniteMapId', message: `없는 맵: ${data.game.match.infiniteMapId}` });
  } else if (infinite.mode !== 'infinite') {
    issues.push({ file: 'game.json', path: 'match.infiniteMapId', message: `${infinite.id}는 무한 모드 맵이 아니다 (mode: ${infinite.mode})` });
  }
  if (data.curves.maxStage !== enemies.growth.maxStage) {
    issues.push({
      file: 'curves.json',
      path: 'maxStage',
      message: `enemies.json growth.maxStage(${enemies.growth.maxStage})와 다르다 → node tools/precompute-curves.mjs`,
    });
  } else if (data.curves.hp[1] !== Math.round(enemies.growth.hp.base)) {
    issues.push({
      file: 'curves.json',
      path: 'hp[1]',
      message: `growth.hp.base(${enemies.growth.hp.base})와 다르다 → node tools/precompute-curves.mjs`,
    });
  }
  // 덱: 기본 덱은 등급별 perGrade종이고 모두 처음부터 해금(unlock = base)된 타워 (PROGRESSION.md: 처음 해금 = 기본 덱)
  for (const i of deckIssues(data.decks.base, towers.towers, data.decks.perGrade, 'base')) issues.push({ ...i, file: 'decks.json' });
  for (const g of DECK_GRADES) {
    data.decks.base[g].forEach((id, i) => {
      const t = towers.towers.find((x) => x.id === id);
      if (t && t.unlock !== 'base') {
        issues.push({ file: 'decks.json', path: `base.${g}[${i}]`, message: `${id}는 처음부터 해금된 타워가 아니다 (unlock: ${t.unlock})` });
      }
    });
  }
  // 반대 방향: 처음부터 해금된 타워(unlock = base)는 모두 기본 덱에 있다 → 기본 덱 = unlock 'base' 25종 (TOWERS.md 0.2·10장)
  const baseIds = new Set(DECK_GRADES.flatMap((g) => data.decks.base[g]));
  towers.towers.forEach((t, i) => {
    if (t.unlock === 'base' && !baseIds.has(t.id)) {
      issues.push({ file: 'towers.json', path: `towers[${i}].unlock`, message: `${t.id}는 unlock = base인데 기본 덱(decks.json base)에 없다` });
    }
  });
  // 공격 형태 값: 광역·근접 광역 = 반경(칸, 0보다 큼), 관통·연쇄·다중 = 마리 수(1 이상 정수) (GDD 5.2)
  towers.towers.forEach((t, i) => {
    const path = `towers[${i}].shapeValue`;
    if ((t.shape === 'aoe' || t.shape === 'melee_aoe') && !(t.shapeValue > 0)) {
      issues.push({ file: 'towers.json', path, message: `${t.shape}의 반경은 0보다 커야 한다 (${t.shapeValue})` });
    }
    if ((t.shape === 'pierce' || t.shape === 'chain' || t.shape === 'multi') && !(Number.isInteger(t.shapeValue) && t.shapeValue >= 1)) {
      issues.push({ file: 'towers.json', path, message: `${t.shape}의 마리 수는 1 이상 정수여야 한다 (${t.shapeValue})` });
    }
  });
  if (!towers.towers.some((t) => t.grade === 'god') && data.game.summon.godChance > 0) {
    issues.push({ file: 'game.json', path: 'summon.godChance', message: '신 타워가 없는데 확률이 0보다 크다' });
  }
  // (T-1의 '개발자 배속은 일반 배속을 모두 포함' 검사는 T-2에서 뺐다 — 사용자 요청 "배속은 2 4 8 16만": 개발자 순환에 ×3 없음)
  crossCheckM4(data, issues);
  crossCheckM5(data, issues);
  crossCheckT2(data, issues);
  return issues;
}

/** 개발자 도구 확률 조정이 아는 이름 (gamble:i는 배율표 번호 — ×0이 아닌 배율만). sim/chances.ts와 같은 목록 */
export const DEV_CHANCE_KEYS = ['god', 'cardRare', 'critBonus', 'summonRare', 'mergeDouble', 'elite'] as const;

/** T-2 교차 검사: 판매 등급·히든 재료, 확률 조정 key. */
function crossCheckT2(data: GameData, issues: Issue[]): void {
  const { game, towers } = data;
  const byId = new Map(towers.towers.map((t) => [t.id, t]));
  towers.towers.forEach((t, i) => {
    if (t.grade !== 'hidden') return;
    if (!Array.isArray(t.recipe) || t.recipe.length === 0) {
      issues.push({ file: 'towers.json', path: `towers[${i}].recipe`, message: '히든 타워는 판매 가치를 정할 조합 재료가 있어야 한다' });
      return;
    }
    t.recipe.forEach((id, j) => {
      const m = byId.get(id);
      if (!m) issues.push({ file: 'towers.json', path: `towers[${i}].recipe[${j}]`, message: `없는 재료: ${id}` });
      else if (m.grade === 'hidden') issues.push({ file: 'towers.json', path: `towers[${i}].recipe[${j}]`, message: `히든 재료는 히든일 수 없다: ${id}` });
    });
  });
  const zero = game.gamble.outcomes.findIndex((o) => o.mul === 0);
  game.devChances.list.forEach((c, i) => {
    const path = `devChances.list[${i}].key`;
    const m = /^gamble:(\d+)$/.exec(c.key);
    if (m) {
      const k = Number(m[1]);
      if (k >= game.gamble.outcomes.length || k === zero) issues.push({ file: 'game.json', path, message: `도박 배율표에 ×0이 아닌 ${k}번째 배율이 없다` });
    } else if (!(DEV_CHANCE_KEYS as readonly string[]).includes(c.key)) {
      issues.push({ file: 'game.json', path, message: `모르는 확률 이름: ${c.key} (${DEV_CHANCE_KEYS.join('·')}·gamble:i)` });
    }
  });
}

/** M4 데이터 교차 검사: 깨지는 몹·보스 소환 몹·보스 순환·보스 제한 시간·카드 수치. */
function crossCheckM4(data: GameData, issues: Issue[]): void {
  const { enemies, game, cards } = data;
  const mobIds = new Set(enemies.mobs.map((m) => m.id));
  enemies.mobs.forEach((m, i) => {
    if (m.splitInto && !mobIds.has(m.splitInto.id)) {
      issues.push({ file: 'enemies.json', path: `mobs[${i}].splitInto.id`, message: `없는 몹: ${m.splitInto.id}` });
    }
  });
  enemies.bosses.forEach((b, i) => {
    const sm = b.params.summonMob;
    if (sm !== undefined && (typeof sm !== 'string' || !mobIds.has(sm))) {
      issues.push({ file: 'enemies.json', path: `bosses[${i}].params.summonMob`, message: `없는 몹: ${String(sm)}` });
    }
    if (b.stage % game.match.bossEvery !== 0) {
      issues.push({ file: 'enemies.json', path: `bosses[${i}].stage`, message: `보스 단계(${b.stage})가 보스 주기(${game.match.bossEvery})의 배수가 아니다` });
    }
  });
  // 보스 순환에 적힌 id는 기본 보스(bosses) 또는 군단 체계(hierarchy: 대장·4천왕·군주)에 있어야 한다
  const known = new Set<string>(enemies.bosses.map((b) => b.id));
  const h = enemies.hierarchy as { lord?: { id?: string }; captains?: { id?: string }[]; legions?: Record<string, { commander?: { id?: string } }> };
  if (h.lord?.id) known.add(h.lord.id);
  for (const c of h.captains ?? []) if (c.id) known.add(c.id);
  for (const l of Object.values(h.legions ?? {})) if (l.commander?.id) known.add(l.commander.id);
  const cyc = enemies.bossCycle;
  const cycIds: [string, string][] = [
    ...cyc.captains.map((id, i) => [`bossCycle.captains[${i}]`, id] as [string, string]),
    ...cyc.commanders.map((id, i) => [`bossCycle.commanders[${i}]`, id] as [string, string]),
    ['bossCycle.lord', cyc.lord],
  ];
  for (const [path, id] of cycIds) if (!known.has(id)) issues.push({ file: 'enemies.json', path, message: `보스 데이터·군단 체계에 없는 id: ${id}` });
  if (cyc.every !== game.match.bossEvery) {
    issues.push({ file: 'enemies.json', path: 'bossCycle.every', message: `보스 주기(game.json match.bossEvery = ${game.match.bossEvery})와 다르다` });
  }
  for (const [key, v] of [['commanderEvery', cyc.commanderEvery], ['lordEvery', cyc.lordEvery]] as const) {
    if (v % cyc.every !== 0) issues.push({ file: 'enemies.json', path: `bossCycle.${key}`, message: `${v}가 every(${cyc.every})의 배수가 아니다` });
  }
  // 보스 컷인 (HF-2): 보스 데이터·군단 체계에 있는 id만
  game.art.cutins.forEach((id, i) => {
    if (!known.has(id)) issues.push({ file: 'game.json', path: `art.cutins[${i}]`, message: `보스 데이터·군단 체계에 없는 id: ${id}` });
  });
  if (game.boss.timeLimitSeconds > game.match.stageSeconds) {
    issues.push({ file: 'game.json', path: 'boss.timeLimitSeconds', message: `단계 길이(${game.match.stageSeconds}초)보다 길다` });
  }
  if (game.formation.previewSeconds >= game.match.stageSeconds) {
    issues.push({ file: 'game.json', path: 'formation.previewSeconds', message: `단계 길이(${game.match.stageSeconds}초)보다 짧아야 한다` });
  }
  // 카드: 효과 종류마다 필요한 수치
  if (cards.cards.length < cards.offerSize) {
    issues.push({ file: 'cards.json', path: 'cards', message: `카드 ${cards.cards.length}장 < 한 번에 보여주는 수 ${cards.offerSize}` });
  }
  const need: Record<CardEffectType, { key: 'value' | 'seconds'; int?: boolean; ratio?: boolean }[]> = {
    atkPct: [{ key: 'value', ratio: false }],
    goldPerBoss: [{ key: 'value', int: true }],
    rareSummons: [{ key: 'value', int: true }],
    workerMul: [{ key: 'value', int: true }],
    quake: [{ key: 'value', ratio: true }],
    summonDiscount: [{ key: 'value', int: true }],
    mobSlow: [{ key: 'value', ratio: true }],
    freeWorkers: [{ key: 'value', int: true }],
    mergeChoice: [{ key: 'value', int: true }],
    twinSummon: [{ key: 'seconds' }],
    godMul: [{ key: 'value', int: true }],
    goldPct: [{ key: 'value' }],
  };
  cards.cards.forEach((c, i) => {
    const e = c.effect;
    for (const r of need[e.type]) {
      const v = e[r.key];
      const path = `cards[${i}].effect.${r.key}`;
      if (v === undefined) issues.push({ file: 'cards.json', path, message: `${e.type} 효과에 필요한 값이 없다` });
      else if (r.int && !Number.isInteger(v)) issues.push({ file: 'cards.json', path, message: `정수여야 하는데 ${v}` });
      else if (r.ratio && v > 1) issues.push({ file: 'cards.json', path, message: `0~1이어야 하는데 ${v}` });
    }
    if (e.type === 'summonDiscount' && (e.min === undefined || !Number.isInteger(e.min) || e.min < 1)) {
      issues.push({ file: 'cards.json', path: `cards[${i}].effect.min`, message: '소환 비용 최소(1 이상 정수)가 필요하다' });
    }
    if (e.type === 'mobSlow' && (e.max === undefined || e.max > 1)) {
      issues.push({ file: 'cards.json', path: `cards[${i}].effect.max`, message: '이동속도 감소 합 최대(0~1)가 필요하다' });
    }
    if (e.type === 'godMul' && (e.value ?? 0) < 1) issues.push({ file: 'cards.json', path: `cards[${i}].effect.value`, message: '신 확률 배율은 1 이상' });
  });
}

/** 미션 조건 종류마다 반드시 있어야 하는 값 (missions.json notes). */
const MISSION_NEEDS: Record<MissionType, readonly (keyof MissionCond)[]> = {
  distinct: ['grade', 'n'],
  same: ['n'],
  towers: ['n'],
  own: ['grade'],
  stat: ['key', 'n'],
  upgradeLevel: ['key', 'n'],
  idle: ['seconds'],
  danger: ['mobs', 'lives'],
  gamble: ['n'],
  reach: ['stage'],
  edge: ['belowLimit', 'lives'],
  family: ['towers', 'n'],
};

/** M5 데이터 교차 검사: 강화(등급 빠짐·겹침, 초월 비용 표), 도박(확률 합·배율), 도전 보스, 미션 조건. */
function crossCheckM5(data: GameData, issues: Issue[]): void {
  const { game, enemies, missions, towers } = data;
  // 등급 강화: 모든 등급이 정확히 한 강화에 들어간다
  const covered = new Map<string, number>();
  game.upgrade.grade.forEach((g, i) => {
    g.grades.forEach((gr, j) => {
      const prev = covered.get(gr);
      if (prev !== undefined) {
        issues.push({ file: 'game.json', path: `upgrade.grade[${i}].grades[${j}]`, message: `${gr} 등급이 upgrade.grade[${prev}]에도 있다` });
      } else covered.set(gr, i);
    });
  });
  for (const gr of GRADES) {
    if (!covered.has(gr)) issues.push({ file: 'game.json', path: 'upgrade.grade', message: `${gr} 등급을 올리는 등급 강화가 없다` });
  }
  const ids = new Set<string>();
  for (const [path, id] of [
    ...game.upgrade.grade.map((g, i) => [`upgrade.grade[${i}].id`, g.id] as const),
    ...game.upgrade.stat.map((g, i) => [`upgrade.stat[${i}].id`, g.id] as const),
    ['upgrade.transcend.id', game.upgrade.transcend.id] as const,
  ]) {
    if (ids.has(id)) issues.push({ file: 'game.json', path, message: `강화 id 중복: ${id}` });
    ids.add(id);
  }
  const statSeen = new Set<string>();
  game.upgrade.stat.forEach((u, i) => {
    if (statSeen.has(u.stat)) issues.push({ file: 'game.json', path: `upgrade.stat[${i}].stat`, message: `같은 능력치(${u.stat})를 올리는 강화가 둘이다` });
    statSeen.add(u.stat);
  });
  if (data.curves.transcendCost[0] !== game.upgrade.transcend.costBase) {
    issues.push({ file: 'curves.json', path: 'transcendCost[0]', message: `game.json upgrade.transcend.costBase(${game.upgrade.transcend.costBase})와 다르다 → node tools/precompute-curves.mjs` });
  }
  // 도박: 확률 합 = 1, 배율 중복 없음, 잭팟·×0 이동 대상 배율이 표에 있음, 테이블 비용 오름차순
  const outs = game.gamble.outcomes;
  const sumBp = outs.reduce((a, o) => a + Math.round(o.chance * 10000), 0);
  if (sumBp !== 10000) issues.push({ file: 'game.json', path: 'gamble.outcomes', message: `확률 합이 1이어야 하는데 ${sumBp / 10000}` });
  const muls = outs.map((o) => o.mul);
  muls.forEach((m, i) => {
    if (muls.indexOf(m) !== i) issues.push({ file: 'game.json', path: `gamble.outcomes[${i}].mul`, message: `배율 중복: ${m}` });
    if (Math.abs(m * 10000 - Math.round(m * 10000)) > 1e-9) issues.push({ file: 'game.json', path: `gamble.outcomes[${i}].mul`, message: `0.0001 단위여야 하는데 ${m}` });
  });
  if (!muls.includes(0)) issues.push({ file: 'game.json', path: 'gamble.outcomes', message: '×0 배율이 없다 (잭팟 게이지가 차지 않는다)' });
  if (!muls.includes(game.gamble.zeroShiftTo)) issues.push({ file: 'game.json', path: 'gamble.zeroShiftTo', message: `배율표에 없는 배율: ${game.gamble.zeroShiftTo}` });
  if (!outs.some((o) => o.mul >= game.gamble.jackpot.minMul && o.chance > 0)) {
    issues.push({ file: 'game.json', path: 'gamble.jackpot.minMul', message: `×${game.gamble.jackpot.minMul} 이상 배율(확률 > 0)이 없다` });
  }
  game.gamble.tables.forEach((t, i) => {
    const prev = game.gamble.tables[i - 1];
    if (prev && t.cost <= prev.cost) issues.push({ file: 'game.json', path: `gamble.tables[${i}].cost`, message: '테이블 비용은 오름차순이어야 한다' });
  });
  // 도전 보스: 단계 = 1부터 차례로, 체력 = 2700 × 2.2^(n-1) 은 표 그대로(문서 표와 같은 값)이므로 여기서는 순서만
  enemies.challenges.forEach((c, i) => {
    if (c.level !== i + 1) issues.push({ file: 'enemies.json', path: `challenges[${i}].level`, message: `단계는 1부터 차례로 (${i + 1}이어야 하는데 ${c.level})` });
    if (c.twin !== undefined && c.twin > 1 && c.hp < c.twin) issues.push({ file: 'enemies.json', path: `challenges[${i}].hp`, message: '체력이 마리 수보다 작다' });
  });
  // 미션
  const towerIds = new Set(towers.towers.map((t) => t.id));
  const upgradeIds = new Set([...game.upgrade.grade.map((g) => g.id), ...game.upgrade.stat.map((g) => g.id)]);
  const tableCosts = new Set(game.gamble.tables.map((t) => t.cost));
  missions.missions.forEach((m, i) => {
    const c = m.cond;
    const base = `missions[${i}].cond`;
    for (const key of MISSION_NEEDS[c.type]) {
      if (c[key] === undefined) issues.push({ file: 'missions.json', path: `${base}.${key}`, message: `${c.type} 조건에 필요한 값이 없다` });
    }
    if (c.type === 'stat' && c.key !== undefined && !(MISSION_STATS as readonly string[]).includes(c.key)) {
      issues.push({ file: 'missions.json', path: `${base}.key`, message: `모르는 판 상태: ${c.key}` });
    }
    if (c.type === 'upgradeLevel' && c.key !== undefined && !upgradeIds.has(c.key)) {
      issues.push({ file: 'missions.json', path: `${base}.key`, message: `game.json upgrade에 없는 강화: ${c.key}` });
    }
    if (c.table !== undefined && !tableCosts.has(c.table)) {
      issues.push({ file: 'missions.json', path: `${base}.table`, message: `game.json gamble에 없는 테이블: ${c.table}` });
    }
    c.towers?.forEach((id, j) => {
      if (!towerIds.has(id)) issues.push({ file: 'missions.json', path: `${base}.towers[${j}]`, message: `없는 타워: ${id}` });
    });
  });
}

/** 원본 JSON 묶음 (테스트에서 일부를 바꿔 넣을 수 있게 분리). */
export interface RawGameData {
  towers: unknown;
  enemies: unknown;
  campaign: unknown;
  game: unknown;
  curves: unknown;
  decks: unknown;
  cards: unknown;
  missions: unknown;
  /** 키 = 파일 이름(확장자 없이) */
  maps: Record<string, unknown>;
}

const mapModules = import.meta.glob<unknown>('./maps/*.json', { eager: true, import: 'default' });

/** 번들에 들어 있는 원본 JSON. */
export function bundledRawData(): RawGameData {
  const maps: Record<string, unknown> = {};
  for (const [path, mod] of Object.entries(mapModules)) {
    const name = path.replace(/^.*\//, '').replace(/\.json$/, '');
    maps[name] = mod;
  }
  return { towers: towersJson, enemies: enemiesJson, campaign: campaignJson, game: gameJson, curves: curvesJson, decks: decksJson, cards: cardsJson, missions: missionsJson, maps };
}

/** 원본 JSON 묶음 → 검사 → GameData. 문제가 있으면 DataError (모든 파일의 문제를 모아서). */
export function buildGameData(raw: RawGameData): GameData {
  const errors: DataError[] = [];
  const attempt = <T>(file: string, value: unknown, schema: Schema): T | undefined => {
    try {
      return parseData<T>(file, value, schema);
    } catch (e) {
      if (e instanceof DataError) {
        errors.push(e);
        return undefined;
      }
      throw e;
    }
  };
  const towers = attempt<TowersFile>('towers.json', raw.towers, towersSchema);
  const enemies = attempt<EnemiesFile>('enemies.json', raw.enemies, enemiesSchema);
  const campaign = attempt<CampaignFile>('campaign.json', raw.campaign, campaignSchema);
  const game = attempt<GameConfig>('game.json', raw.game, gameSchema);
  const curves = attempt<CurvesFile>('curves.json', raw.curves, curvesSchema);
  const decks = attempt<DecksFile>('decks.json', raw.decks, decksSchema);
  const cards = attempt<CardsFile>('cards.json', raw.cards, cardsSchema);
  const missions = attempt<MissionsFile>('missions.json', raw.missions, missionsSchema);
  const maps: Record<string, MapData> = {};
  for (const [name, value] of Object.entries(raw.maps)) {
    const m = attempt<MapData>(`maps/${name}.json`, value, mapSchema);
    if (m) maps[name] = m;
  }
  if (errors.length > 0) {
    if (errors.length === 1) throw errors[0];
    throw new DataError(
      errors.map((e) => e.file).join(', '),
      errors.flatMap((e) => e.issues.map((i) => ({ ...i, file: i.file ?? e.file }))),
    );
  }
  const data: GameData = { towers: towers!, enemies: enemies!, campaign: campaign!, game: game!, curves: curves!, decks: decks!, cards: cards!, missions: missions!, maps };
  const cross = crossCheck(data);
  if (cross.length > 0) throw new DataError('교차 참조', cross);
  return data;
}

let cached: GameData | null = null;

/** 번들 데이터를 검사해서 돌려준다 (한 번만 검사하고 캐시). */
export function loadGameData(): GameData {
  if (!cached) cached = buildGameData(bundledRawData());
  return cached;
}
