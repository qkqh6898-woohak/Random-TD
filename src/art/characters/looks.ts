/**
 * 캐릭터 외형 데이터 (`src/data/characterLooks.json`) 읽기·검사 (순수, Phaser·DOM 없음).
 *
 * - 디자인 시트(docs/CHARACTERS.md, 106명)의 외형 설명을 그림 코드가 쓰는 필드로 옮긴 데이터다.
 * - 데이터 로더(`src/data/load.ts`)와 같은 검사기(`schema.ts`)로 필드·허용 값을 검사하고, 틀리면 파일 이름 + 필드 경로가 든 `DataError`를 던진다.
 *   (그림 전용 데이터라 sim이 쓰는 GameData에는 넣지 않는다. 타워·적 id가 towers.json·enemies.json과 맞는지는 단위 테스트가 교차 검사한다.)
 * - id는 종류 묶음(타워 / 적 / 인물) 안에서만 유일하다: 타워 '고블린'(goblin)과 적 '암흑 고블린 떼'(goblin)가 같은 id.
 * - 각성 외형(awaken)은 바꿀 필드만 적고, `resolveLook(look, true)`가 덮어써 돌려준다.
 */
import looksJson from '../../data/characterLooks.json';
import { DataError } from '../../data/load';
import type { Grade } from '../../data/load';
import { GRADES } from '../../data/load';
import { s, validate, type Issue, type Schema } from '../../data/schema';
import {
  AURAS,
  BACKS,
  BEARDS,
  BODIES,
  CHARACTER_KINDS,
  CREATURES,
  EARS,
  EYEWEAR,
  FACES,
  FRONTS,
  FX,
  GROUNDS,
  HAIR_STYLES,
  HEADGEAR,
  HEAD_DECOS,
  IDLES,
  LEGIONS,
  MOTIONS,
  OFFHANDS,
  OUTFITS,
  OUTFIT_DECOS,
  PETS,
  PORTRAIT_ITEMS,
  PROPS,
  RANKS,
  type AuraId,
  type BackId,
  type BeardId,
  type BodyId,
  type CharacterKind,
  type CreatureId,
  type EarId,
  type EyewearId,
  type FaceId,
  type FrontId,
  type FxId,
  type GroundId,
  type HairStyle,
  type HeadDeco,
  type HeadgearId,
  type IdleId,
  type LegionId,
  type MotionId,
  type OffhandId,
  type OutfitDeco,
  type OutfitId,
  type PetId,
  type PortraitItem,
  type PropId,
  type RankId,
} from './library';

export const LOOKS_FILE = 'characterLooks.json';

/** 사람형 캐릭터 (타워·조언자·미오·총지휘관) */
export interface HumanLook {
  id: string;
  kind: 'tower' | 'advisor' | 'sidekick';
  name: string;
  /** towers.json factions 키 또는 ancient·alliance */
  faction: string;
  grade?: Grade;
  body: BodyId;
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  beard: BeardId;
  beardColor?: string;
  ears: EarId;
  eyeColor?: string;
  face: FaceId;
  eyewear: EyewearId;
  tusks?: boolean;
  paint?: boolean;
  head: HeadgearId;
  headColor?: string;
  headDeco?: HeadDeco;
  outfit: OutfitId;
  /** 옷 색 [주 색, 보조 색] — 등급 색 테두리는 그릴 때 등급에서 정한다 */
  colors: string[];
  deco?: OutfitDeco[];
  prop?: PropId;
  /** 소품 색 ('#RRGGBB' 또는 'rainbow') */
  propColor?: string;
  /** 소품 빛 (각성 등) */
  propGlow?: string;
  offhand?: OffhandId;
  front?: FrontId;
  frontColor?: string;
  back?: BackId;
  backColor?: string;
  ground?: GroundId;
  pet?: PetId;
  fx?: FxId;
  aura?: AuraId;
  /** 떠 있는 높이 (그림 단위, 요정은 체형이 따로 띄움) */
  lift?: number;
  /** 몸 기울기 (도, + = 바라보는 쪽으로 앞으로 기욺 — F10 고블린 '앞으로 기운 자세'). 절차 그림에만 (바깥 그림은 그림 자체 자세) */
  lean?: number;
  idle?: IdleId;
  /** 인물 초상 특징 */
  item?: PortraitItem;
  /**
   * 화면 크기 배수 (HF-2, 사용자 요청 '캐릭터 크기는 다 다르게, 꼭 칸에 안 맞춰도 돼'): 1 = 보통 사람 크기.
   * 요정 ~0.8 · 고블린·드워프 ~0.9 · 사람·엘프 ~1.0 · 중갑·오크 ~1.1 · 골렘·정령·신 1.25~1.5 + 등급 덤. 타워는 꼭 적는다 (각성에서 바꿀 수 있음)
   */
  scale?: number;
  /** 각성 외형: 바뀌는 필드만 */
  awaken?: Partial<Omit<HumanLook, 'id' | 'kind' | 'name' | 'faction' | 'grade' | 'awaken'>>;
}

/** 녹스 군단 적 (하수인·대장·4천왕·군주) */
export interface EnemyLook {
  id: string;
  kind: 'mob' | 'captain' | 'commander' | 'lord';
  name: string;
  legion: LegionId;
  rank: RankId;
  creature: CreatureId;
  /** [몸 색, 강조 색] */
  colors: string[];
  motion: MotionId;
  /** 눈 색: 기본 녹스 보라, 녹투르만 붉은 눈 */
  eyes?: 'nox' | 'red';
  /** 화면 크기 배수 (HF-2): 몸집 크기 분류(소형·중형·대형·보스)에 곱한다 — 하수인 0.8~1.1, 대장 1.0~1.2, 4천왕·군주 1.2~1.35. 꼭 적는다 */
  scale: number;
}

export type CharacterLook = HumanLook | EnemyLook;

/** 같은 id가 묶음마다 따로 있다 */
export type LookGroup = 'tower' | 'enemy' | 'person';

export function groupOf(kind: CharacterKind): LookGroup {
  if (kind === 'tower') return 'tower';
  if (kind === 'advisor' || kind === 'sidekick') return 'person';
  return 'enemy';
}

export function isEnemyLook(l: CharacterLook): l is EnemyLook {
  return groupOf(l.kind) === 'enemy';
}

const HEX = /^#[0-9A-Fa-f]{6}$/;
const color = (): Schema =>
  s.withCheck<string>(s.str(), (v, path, issues) => {
    if (!HEX.test(v)) issues.push({ path, message: `색은 '#RRGGBB' 형식이어야 하는데 ${JSON.stringify(v)}` });
  });
const colorOrRainbow = (): Schema =>
  s.withCheck<string>(s.str(), (v, path, issues) => {
    if (v !== 'rainbow' && !HEX.test(v)) issues.push({ path, message: `색은 '#RRGGBB' 또는 'rainbow'여야 하는데 ${JSON.stringify(v)}` });
  });
const e = (list: readonly string[]): Schema => s.str({ enum: list });
/** 화면 크기 배수 범위 (HF-2): 너무 작으면 안 보이고, 너무 크면 맵 절반을 덮는다 */
export const LOOK_SCALE_MIN = 0.6;
export const LOOK_SCALE_MAX = 1.6;
const scaleField = (): Schema => s.num({ min: LOOK_SCALE_MIN, max: LOOK_SCALE_MAX });
const opt = s.opt;

/**
 * 정해진 필드만 허용하는 객체 (검토 반영): 'propColour'·'backcolor' 같은 오타가 조용히 무시되면 기본값으로 그려져
 * 구별되던 모습이 사라진다 → 모르는 키는 오류.
 */
function strictObj<T>(fields: Record<string, Schema>, check?: (v: T, path: string, issues: Issue[]) => void): Schema {
  return s.withCheck<T>(s.obj(fields), (v, path, issues) => {
    for (const k of Object.keys(v as Record<string, unknown>)) {
      if (!(k in fields)) issues.push({ path: `${path}.${k}`, message: '모르는 필드 (오타?)' });
    }
    check?.(v, path, issues);
  });
}

/** 각성에서 바꿀 수 있는 필드 (사람형 외형 필드) */
const humanFields: Record<string, Schema> = {
  body: e(BODIES),
  skin: color(),
  hair: color(),
  hairStyle: e(HAIR_STYLES),
  beard: e(BEARDS),
  beardColor: opt(color()),
  ears: e(EARS),
  eyeColor: opt(color()),
  face: e(FACES),
  eyewear: e(EYEWEAR),
  tusks: opt(s.bool()),
  paint: opt(s.bool()),
  head: e(HEADGEAR),
  headColor: opt(color()),
  headDeco: opt(e(HEAD_DECOS)),
  outfit: e(OUTFITS),
  colors: s.arr(color(), { minLength: 2, maxLength: 3 }),
  deco: opt(s.arr(e(OUTFIT_DECOS))),
  prop: opt(e(PROPS)),
  propColor: opt(colorOrRainbow()),
  propGlow: opt(color()),
  offhand: opt(e(OFFHANDS)),
  front: opt(e(FRONTS)),
  frontColor: opt(color()),
  back: opt(e(BACKS)),
  backColor: opt(color()),
  ground: opt(e(GROUNDS)),
  pet: opt(e(PETS)),
  fx: opt(e(FX)),
  aura: opt(e(AURAS)),
  lift: opt(s.int({ min: 0, max: 60 })),
  lean: opt(s.int({ min: -15, max: 15 })),
  idle: opt(e(IDLES)),
  item: opt(e(PORTRAIT_ITEMS)),
  scale: opt(scaleField()),
};

const awakenSchema: Schema = s.withCheck<Record<string, unknown>>(s.rec(s.any()), (v, path, issues) => {
  for (const [k, val] of Object.entries(v)) {
    const field = humanFields[k];
    if (!field) {
      issues.push({ path: `${path}.${k}`, message: `각성에서 바꿀 수 없는 필드` });
      continue;
    }
    validate(val, field.kind === 'optional' ? field.inner : field, `${path}.${k}`, issues);
  }
  if (Object.keys(v).length === 0) issues.push({ path, message: '각성 외형이 비어 있다' });
});

const humanSchema: Schema = strictObj<HumanLook>(
  {
    id: s.str({ nonEmpty: true }),
    kind: s.str({ enum: ['tower', 'advisor', 'sidekick'] }),
    name: s.str({ nonEmpty: true }),
    faction: s.str({ nonEmpty: true }),
    grade: opt(s.str({ enum: GRADES })),
    ...humanFields,
    awaken: opt(awakenSchema),
  },
  (v, path, issues) => {
    if (v.kind === 'tower') {
      // 타워는 맵 위에서 움직이므로 등급·소품·대기 동작이 반드시 있어야 한다
      if (!v.grade) issues.push({ path: `${path}.grade`, message: '타워는 등급이 필요하다' });
      if (!v.prop) issues.push({ path: `${path}.prop`, message: '타워는 주 소품이 필요하다' });
      if (!v.idle) issues.push({ path: `${path}.idle`, message: '타워는 대기 동작이 필요하다' });
      if (v.scale === undefined) issues.push({ path: `${path}.scale`, message: '타워는 화면 크기(scale)가 필요하다' });
    } else if (!v.item) issues.push({ path: `${path}.item`, message: '인물은 초상 특징(item)이 필요하다' });
  },
);

const enemySchema: Schema = strictObj({
  id: s.str({ nonEmpty: true }),
  kind: s.str({ enum: ['mob', 'captain', 'commander', 'lord'] }),
  name: s.str({ nonEmpty: true }),
  legion: e(LEGIONS),
  rank: e(RANKS),
  creature: e(CREATURES),
  colors: s.arr(color(), { minLength: 2, maxLength: 3 }),
  motion: e(MOTIONS),
  eyes: opt(s.str({ enum: ['nox', 'red'] })),
  scale: scaleField(),
});

const characterSchema: Schema = s.withCheck<{ kind: string }>(s.obj({ kind: s.str({ enum: CHARACTER_KINDS }) }), () => {});

export interface LooksFile {
  version: number;
  note: string;
  characters: CharacterLook[];
}

/** 외형 데이터를 검사해 돌려준다. 문제가 있으면 DataError. */
export function parseLooks(raw: unknown): LooksFile {
  const issues: Issue[] = [];
  validate(raw, s.obj({ version: s.int({ min: 1 }), note: s.str(), characters: s.arr(s.any(), { minLength: 1 }) }), '', issues);
  if (issues.length > 0) throw new DataError(LOOKS_FILE, issues);
  const file = raw as LooksFile;
  const seen = new Map<string, number>();
  file.characters.forEach((c, i) => {
    const path = `characters[${i}]`;
    if (!validate(c, characterSchema, path, issues)) return;
    const group = groupOf(c.kind);
    validate(c, group === 'enemy' ? enemySchema : humanSchema, path, issues);
    const key = lookKey(group, c.id);
    const first = seen.get(key);
    if (first !== undefined) issues.push({ path: `${path}.id`, message: `id 중복: ${key} (처음: characters[${first}])` });
    else seen.set(key, i);
  });
  if (issues.length > 0) throw new DataError(LOOKS_FILE, issues);
  return file;
}

export function lookKey(group: LookGroup, id: string): string {
  return `${group}:${id}`;
}

let cached: { file: LooksFile; byKey: Map<string, CharacterLook> } | null = null;

function db(): { file: LooksFile; byKey: Map<string, CharacterLook> } {
  if (!cached) {
    const file = parseLooks(looksJson);
    const byKey = new Map<string, CharacterLook>();
    for (const c of file.characters) byKey.set(lookKey(groupOf(c.kind), c.id), c);
    cached = { file, byKey };
  }
  return cached;
}

/** 모든 캐릭터 (데이터 순서: 타워 65 → 인물 9 → 적 32) */
export function allLooks(): readonly CharacterLook[] {
  return db().file.characters;
}

export function towerLook(id: string): HumanLook | undefined {
  return db().byKey.get(lookKey('tower', id)) as HumanLook | undefined;
}

export function enemyLook(id: string): EnemyLook | undefined {
  return db().byKey.get(lookKey('enemy', id)) as EnemyLook | undefined;
}

export function personLook(id: string): HumanLook | undefined {
  return db().byKey.get(lookKey('person', id)) as HumanLook | undefined;
}

export function findLook(group: LookGroup, id: string): CharacterLook | undefined {
  return db().byKey.get(lookKey(group, id));
}

/** 각성 외형을 덮어쓴 외형 (각성 데이터가 없으면 그대로). */
export function resolveLook(look: HumanLook, awakened: boolean): HumanLook {
  if (!awakened || !look.awaken) return look;
  return { ...look, ...look.awaken } as HumanLook;
}

/**
 * 화면 크기 배수 (HF-2): 데이터 scale (각성이면 각성 값), 없으면 1. 범위 밖 값은 LOOK_SCALE_MIN~MAX로 자른다.
 * 타워 그림·적 그림·절차 대체 그림이 모두 이 값을 쓴다.
 */
export function lookScale(look: CharacterLook | undefined, awakened = false): number {
  if (!look) return 1;
  const v = isEnemyLook(look) ? look.scale : resolveLook(look, awakened).scale;
  if (v === undefined || !Number.isFinite(v)) return 1;
  return Math.min(LOOK_SCALE_MAX, Math.max(LOOK_SCALE_MIN, v));
}

export function hasAwaken(look: CharacterLook): boolean {
  return !isEnemyLook(look) && look.awaken !== undefined;
}
