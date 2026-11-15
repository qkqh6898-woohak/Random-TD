/**
 * 캐릭터 파츠 배치 (순수 계산, Phaser·DOM 없음 → 단위 테스트).
 *
 * 사람형 캐릭터는 파츠 4장으로 나눠 굽는다 (ART.md 2.3 '파츠 분리 + 코드 애니메이션'):
 *  - back: 등 뒤 (날개·망토·후광 — 날갯짓·펄럭임), 몸 뒤에 그린다
 *  - body: 몸·머리·머리 장식·왼손 소품·발밑 장식·등급 별 (고정)
 *  - prop: 오른손 주 소품 (손 위치가 회전 중심 — 캐기·두드리기·돌리기·던지기)
 *  - pet: 동반자 (군견·아기 용·드론·정령…, 따로 뛰고 맴돈다)
 * 좌표는 '그림 단위': 발밑 중심 원점, 아래가 +y, 기본 머리 반지름 62 (기존 chibi.ts와 같은 크기 → 맵 위 크기·탭 판정 그대로).
 */
import type { BackId, BodyId, PetId, PropId } from './library';
import { hasPropPart } from './propMeta';

export interface BodySpec {
  headY: number;
  headR: number;
  torsoTop: number;
  torsoBot: number;
  /** 어깨 반폭 */
  torsoHW: number;
  /** 엉덩이 반폭 */
  hipHW: number;
  /** 다리 위 끝 y (발은 0 — 요정은 떠 있어서 footY가 0보다 위) */
  legTop: number;
  footY: number;
  legW: number;
  /** 두 다리 사이 반 간격 */
  legGap: number;
  handL: readonly [number, number];
  handR: readonly [number, number];
  handRad: number;
}

/** 체형 → 비율. 별(등급)은 모두 y = STAR_Y */
export const BODY_SPECS: Readonly<Record<BodyId, BodySpec>> = {
  normal: { headY: -158, headR: 62, torsoTop: -104, torsoBot: -30, torsoHW: 42, hipHW: 40, legTop: -36, footY: 0, legW: 22, legGap: 6, handL: [-50, -60], handR: [50, -60], handRad: 13 },
  stout: { headY: -150, headR: 62, torsoTop: -98, torsoBot: -26, torsoHW: 52, hipHW: 54, legTop: -30, footY: 0, legW: 27, legGap: 4, handL: [-60, -56], handR: [60, -56], handRad: 15 },
  slim: { headY: -166, headR: 57, torsoTop: -112, torsoBot: -36, torsoHW: 36, hipHW: 32, legTop: -42, footY: 0, legW: 19, legGap: 6, handL: [-44, -66], handR: [44, -66], handRad: 12 },
  small: { headY: -140, headR: 62, torsoTop: -84, torsoBot: -26, torsoHW: 34, hipHW: 36, legTop: -28, footY: 0, legW: 19, legGap: 5, handL: [-42, -52], handR: [42, -52], handRad: 12 },
  bulky: { headY: -170, headR: 57, torsoTop: -118, torsoBot: -30, torsoHW: 58, hipHW: 50, legTop: -34, footY: 0, legW: 27, legGap: 7, handL: [-66, -68], handR: [66, -68], handRad: 16 },
  fairy: { headY: -170, headR: 55, torsoTop: -118, torsoBot: -66, torsoHW: 28, hipHW: 32, legTop: -70, footY: -36, legW: 13, legGap: 4, handL: [-38, -92], handR: [38, -92], handRad: 11 },
  stone: { headY: -156, headR: 54, torsoTop: -112, torsoBot: -22, torsoHW: 58, hipHW: 52, legTop: -26, footY: 0, legW: 30, legGap: 6, handL: [-70, -58], handR: [70, -58], handRad: 21 },
  deity: { headY: -172, headR: 58, torsoTop: -118, torsoBot: -4, torsoHW: 44, hipHW: 66, legTop: -10, footY: 0, legW: 20, legGap: 8, handL: [-56, -74], handR: [56, -74], handRad: 13 },
  spirit: { headY: -164, headR: 56, torsoTop: -110, torsoBot: -46, torsoHW: 42, hipHW: 30, legTop: -46, footY: -10, legW: 0, legGap: 0, handL: [-56, -70], handR: [56, -70], handRad: 13 },
};

/** 등급 별 줄 높이 */
export const STAR_Y = -250;

/** 파츠 상자 (그림 단위, 회전 중심 기준) */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type PartName = 'back' | 'body' | 'prop' | 'pet';
export const PART_ORDER: readonly PartName[] = ['back', 'body', 'prop', 'pet'];

/**
 * body 상자: 위쪽은 기존 CHIBI_BOUNDS 위(−268)와 같다 (크기는 CHIBI_BOUNDS 높이로 정하므로 맵 위 캐릭터 크기·탭 판정·패널 자리 계산이 바뀌지 않는다). 아래는 발밑 마법진이 들어가게 +44까지.
 * 가로만 날개·큰 소품 때문에 넓다.
 */
export const BOXES: Readonly<Record<PartName, Box>> = {
  body: { left: -150, top: -268, width: 300, height: 312 },
  prop: { left: -140, top: -250, width: 280, height: 360 },
  back: { left: -160, top: -232, width: 320, height: 342 },
  pet: { left: -80, top: -140, width: 160, height: 176 },
};

/** 적 텍스처: 128 단위 정사각형 (기존 art/mobs.ts MOB_TEX_SIZE와 같은 좌표 → MobSprite 위치 계산 그대로) */
export const ENEMY_BOX = 128;
/** 인물 초상: 가로 200 × 세로 220 단위 */
export const PORTRAIT_BOX = { width: 200, height: 220 } as const;

/** 동반자 자리 (발밑 기준) */
export const PET_ANCHORS: Readonly<Record<PetId, { x: number; y: number }>> = {
  none: { x: 0, y: 0 },
  dog: { x: -72, y: 2 },
  dogs_armored: { x: -70, y: 2 },
  drone: { x: -86, y: -206 },
  drones2: { x: -84, y: -200 },
  spirit: { x: -78, y: -120 },
  spirits2: { x: -76, y: -118 },
  baby_dragon: { x: -38, y: -112 },
  mud_spirit: { x: -76, y: 0 },
  goblins: { x: -64, y: 4 },
  skeletons: { x: -66, y: 4 },
};

/** 등 뒤 회전 중심 (체형별 어깨 사이) */
export function backPivot(spec: BodySpec): { x: number; y: number } {
  return { x: 0, y: spec.torsoTop + 22 };
}

export interface Rig {
  body: BodyId;
  spec: BodySpec;
  /** 오른손 = prop 파츠 회전 중심 */
  hand: { x: number; y: number };
  back: { x: number; y: number } | null;
  pet: { x: number; y: number } | null;
  /** 렌더할 때 그림 전체를 띄우는 높이 (그림 단위) */
  lift: number;
  parts: readonly PartName[];
}

export interface RigInput {
  body: BodyId;
  prop?: PropId;
  back?: BackId;
  pet?: PetId;
  lift?: number;
}

/** 외형 → 파츠 배치. */
export function rigFor(look: RigInput): Rig {
  const spec = BODY_SPECS[look.body];
  const hasProp = hasPropPart(look.prop);
  const hasBack = look.back !== undefined && look.back !== 'none';
  const hasPet = look.pet !== undefined && look.pet !== 'none';
  const parts: PartName[] = [];
  if (hasBack) parts.push('back');
  parts.push('body');
  if (hasProp) parts.push('prop');
  if (hasPet) parts.push('pet');
  return {
    body: look.body,
    spec,
    hand: { x: spec.handR[0], y: spec.handR[1] },
    back: hasBack ? backPivot(spec) : null,
    pet: hasPet ? PET_ANCHORS[look.pet as PetId] : null,
    lift: look.lift ?? 0,
    parts,
  };
}

export interface AtlasFrame {
  name: PartName;
  /** 캔버스 픽셀 사각형 */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 프레임 안 회전 중심 비율 (Phaser origin) */
  originX: number;
  originY: number;
}

export interface AtlasLayout {
  width: number;
  height: number;
  frames: AtlasFrame[];
}

/** 파츠 사이 여백 (픽셀) — 선형 필터가 이웃 파츠를 번지게 하지 않게 */
export const ATLAS_PAD = 2;

/** 캐릭터 한 명의 파츠를 가로로 늘어놓은 캔버스 배치 (res = 그림 단위당 픽셀). */
export function atlasLayout(parts: readonly PartName[], res: number): AtlasLayout {
  let x = ATLAS_PAD;
  let height = 0;
  const frames: AtlasFrame[] = [];
  for (const name of PART_ORDER) {
    if (!parts.includes(name)) continue;
    const b = BOXES[name];
    const w = Math.ceil(b.width * res);
    const h = Math.ceil(b.height * res);
    frames.push({ name, x, y: ATLAS_PAD, w, h, originX: -b.left / b.width, originY: -b.top / b.height });
    x += w + ATLAS_PAD;
    height = Math.max(height, h);
  }
  return { width: x, height: height + ATLAS_PAD * 2, frames };
}
