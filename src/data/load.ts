/**
 * 데이터 로더: JSON을 읽고 필수 필드·타입을 검사한 뒤 타입이 붙은 객체로 돌려준다.
 *
 * - 데이터는 번들에 포함된다(정적 import) → 완전 오프라인.
 * - 검사에 실패하면 `DataError`를 던진다. 메시지에 **파일 이름 + 필드 경로**가 들어간다.
 *   예: `towers.json: towers[3].aps: 숫자여야 하는데 문자열 "fast"`
 * - 맵은 `src/data/maps/*.json`을 모두 자동으로 읽는다 (M6에서 테마 맵 추가 시 코드 수정 불필요).
 * - 수치 해석(소수 → 정수 단위 변환)은 각 시스템이 로드할 때 `src/sim/Fixed.ts`로 한다.
 */

import towersJson from './towers.json';
import enemiesJson from './enemies.json';
import campaignJson from './campaign.json';
import gameJson from './game.json';
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
  swarm?: unknown;
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

export interface EnemiesFile {
  version: number;
  formulas: Record<string, string>;
  mobs: MobData[];
  composition: CompositionEntry[];
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

export interface GameConfig {
  version: number;
  speeds: SpeedOption[];
  maxFrameMs: number;
  maxPlayers: number;
}

export interface GameData {
  towers: TowersFile;
  enemies: EnemiesFile;
  campaign: CampaignFile;
  maps: Record<string, MapData>;
  game: GameConfig;
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
  swarm: s.opt(s.any()),
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
  composition: s.arr(s.obj({ stages: stageRange, mix }), { minLength: 1 }),
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
});

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

/** 파일 사이 참조 검사 (종족·원소·조합 재료·몹 id). */
export function crossCheck(data: Omit<GameData, 'game'>): Issue[] {
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
  for (const [id, m] of Object.entries(data.maps)) {
    if (m.id !== id) issues.push({ file: `maps/${id}.json`, path: 'id', message: `파일 이름(${id})과 id(${m.id})가 다르다` });
  }
  return issues;
}

/** 원본 JSON 묶음 (테스트에서 일부를 바꿔 넣을 수 있게 분리). */
export interface RawGameData {
  towers: unknown;
  enemies: unknown;
  campaign: unknown;
  game: unknown;
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
  return { towers: towersJson, enemies: enemiesJson, campaign: campaignJson, game: gameJson, maps };
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
  const data: GameData = { towers: towers!, enemies: enemies!, campaign: campaign!, game: game!, maps };
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
