/**
 * 데이터 로더: JSON을 읽고 필수 필드·타입을 검사한 뒤 타입이 붙은 객체로 돌려준다.
 *
 * - 데이터는 번들에 포함된다(정적 import) → 완전 오프라인.
 * - 검사에 실패하면 `DataError`를 던진다. 메시지에 **파일 이름 + 필드 경로**가 들어간다.
 *   예: `towers.json: towers[3].aps: 숫자여야 하는데 문자열 "fast"`
 * - 맵은 `src/data/maps/*.json`을 모두 자동으로 읽는다 (M6에서 테마 맵 추가 시 코드 수정 불필요).
 * - `curves.json`은 `tools/precompute-curves.mjs`가 enemies.json growth로 만든 표다 (sim은 거듭제곱을 못 쓴다).
 * - 수치 해석(소수 → 정수 단위 변환)은 각 시스템이 로드할 때 `src/sim/Fixed.ts`로 한다.
 */

import towersJson from './towers.json';
import enemiesJson from './enemies.json';
import campaignJson from './campaign.json';
import gameJson from './game.json';
import curvesJson from './curves.json';
import { TICK_HZ } from '../sim/World';
import { s, validate, type Issue, type Schema } from './schema';

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
  splitInto?: unknown;
  /** 떼: 1칸에 이만큼 붙어서 등장 (암흑 고블린 떼 3). 없으면 1 */
  swarm?: number;
  /** 투명 (ENEMIES.md 5장). 등장 순서에서 무리 뒤쪽에 놓인다 */
  invisible?: boolean;
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
}

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
  eliteChance: { fromStage: number; chance: number; hpMul: number; rewardMul: number };
  formations: FormationData[];
  formationRule: Record<string, string>;
  hierarchy: Record<string, unknown>;
  infiniteBosses: Record<string, string>;
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

/** HUD 경고 기준 (UI.md 4.2). */
export interface HudConfig {
  timerWarnSeconds: number;
  mobWarnCount: number;
  livesWarn: number;
}

export interface GameConfig {
  version: number;
  speeds: SpeedOption[];
  maxFrameMs: number;
  maxPlayers: number;
  match: MatchConfig;
  hud: HudConfig;
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
}

export interface GameData {
  towers: TowersFile;
  enemies: EnemiesFile;
  campaign: CampaignFile;
  maps: Record<string, MapData>;
  game: GameConfig;
  curves: CurvesFile;
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

const towerSchema = s.obj({
  id: s.str({ nonEmpty: true }),
  name: s.str({ nonEmpty: true }),
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
  splitInto: s.opt(s.any()),
  swarm: s.opt(s.int({ min: 1, max: 10 })),
  invisible: s.opt(s.bool()),
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
  }),
  formations: s.arr(
    s.obj({
      id: s.str({ nonEmpty: true }),
      name: s.str({ nonEmpty: true }),
      mix,
      from: s.int({ min: 1 }),
      why: s.str(),
      counter: s.str(),
    }),
    { uniqueBy: 'id' },
  ),
  formationRule: s.rec(s.str()),
  hierarchy: s.rec(s.any()),
  infiniteBosses: s.rec(s.str()),
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
  hud: s.obj({
    timerWarnSeconds: s.int({ min: 0 }),
    mobWarnCount: s.int({ min: 0 }),
    livesWarn: s.int({ min: 0 }),
  }),
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
  return issues;
}

/** 원본 JSON 묶음 (테스트에서 일부를 바꿔 넣을 수 있게 분리). */
export interface RawGameData {
  towers: unknown;
  enemies: unknown;
  campaign: unknown;
  game: unknown;
  curves: unknown;
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
  return { towers: towersJson, enemies: enemiesJson, campaign: campaignJson, game: gameJson, curves: curvesJson, maps };
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
  const data: GameData = { towers: towers!, enemies: enemies!, campaign: campaign!, game: game!, curves: curves!, maps };
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
