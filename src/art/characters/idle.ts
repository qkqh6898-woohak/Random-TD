/**
 * 캐릭터별 대기 동작 프리셋 (순수 계산, Phaser·DOM 없음 → 단위 테스트). TOWERS.md 11장의 동작을 프리셋으로 옮겼다.
 *
 * 몸 전체 자세(숨쉬기·흔들림·공격·등장)는 view/render/towerPose.ts가 계산하고, 여기서는
 *  - 고유 동작 창(3초마다, 0~1초 무작위 지연) 동안의 몸 동작 종류(gesture)와 길이
 *  - 파츠별 움직임: 소품(캐기·두드리기·돌리기·던지기·흔들기…), 등(날갯짓·펄럭임), 동반자(깡총·맴돌기), 입자
 * 를 정한다. 같은 프리셋이라도 시작 위상(seed)이 달라 여러 마리가 똑같이 움직이지 않는다.
 * 숫자는 화면 표현 상수라 코드에 둔다 (게임 규칙 수치가 아님).
 */
import type { BackId, BodyId, FxId, IdleId, PetId, PropId } from './library';
import { PROP_META } from './propMeta';

/** 고유 동작 창 동안 몸 전체 움직임 (towerPose가 해석) */
export type BodyGesture = 'hopTilt' | 'hop' | 'hop2' | 'tilt' | 'lean' | 'shake' | 'puff' | 'stretch' | 'nod' | 'crouch' | 'stomp' | 'still' | 'fade';

export type PropMotion = 'none' | 'swingDown' | 'slash' | 'tap' | 'spin' | 'spin2' | 'toss' | 'shake' | 'raise' | 'pull' | 'flip' | 'thrust' | 'dip' | 'circle' | 'wave' | 'pulse' | 'lift' | 'tilt' | 'rub' | 'thump' | 'fanwave' | 'pop';
export type PropLoop = 'none' | 'spin' | 'wobble' | 'bob' | 'pulse';
export type BackMotion = 'none' | 'flap' | 'flutter' | 'spread' | 'rotate' | 'pulse';
export type PetMotion = 'none' | 'hop' | 'hover' | 'orbit' | 'wag' | 'rise' | 'bob';
export type FxMotion = 'none' | 'rise' | 'fall' | 'orbit' | 'burst' | 'drift';
export type BodyLoop = 'none' | 'float' | 'sway';

export interface IdlePreset {
  /** 한국어 설명 (갤러리·문서) */
  label: string;
  gestureMs: number;
  gesture: BodyGesture;
  loop?: BodyLoop;
  prop?: PropMotion;
  propLoop?: PropLoop;
  back?: BackMotion;
  pet?: PetMotion;
  fx?: FxMotion;
}

export const IDLE_PRESETS: Readonly<Record<IdleId, IdlePreset>> = {
  dig: { label: '곡괭이로 바닥 캐기', gestureMs: 900, gesture: 'lean', prop: 'swingDown', fx: 'burst' },
  drum: { label: '북 두드리며 발 구르기', gestureMs: 1000, gesture: 'stomp', prop: 'tap', fx: 'rise' },
  hop: { label: '제자리 깡총', gestureMs: 800, gesture: 'hop2', prop: 'tilt' },
  draw_bow: { label: '활시위 당겨 보기', gestureMs: 1000, gesture: 'lean', prop: 'pull' },
  wand_blink: { label: '지팡이 끝 불빛 깜빡, 고개 갸웃', gestureMs: 900, gesture: 'tilt', prop: 'pulse' },
  swing: { label: '검 휘두르기 연습', gestureMs: 800, gesture: 'lean', prop: 'slash' },
  spin_prop: { label: '소품 빙글 돌리기', gestureMs: 900, gesture: 'still', prop: 'spin' },
  dust_off: { label: '몸에서 돌가루 털기', gestureMs: 700, gesture: 'shake', fx: 'fall' },
  pet_dog: { label: '군견 쓰다듬기 → 무전기 확인', gestureMs: 1000, gesture: 'nod', prop: 'raise', pet: 'wag' },
  count_coins: { label: '돈주머니 흔들기', gestureMs: 800, gesture: 'nod', prop: 'shake', fx: 'rise' },
  shake_totem: { label: '진흙 토템 흔들기', gestureMs: 900, gesture: 'stomp', prop: 'shake' },
  strum: { label: '류트 연주, 몸 좌우로', gestureMs: 900, gesture: 'still', loop: 'sway', prop: 'tilt', fx: 'rise' },
  drone_launch: { label: '드론 띄웠다 받기', gestureMs: 1200, gesture: 'tilt', prop: 'raise', pet: 'rise' },
  palm_roll: { label: '손바닥 위 불꽃 굴리기', gestureMs: 900, gesture: 'tilt', prop: 'circle', fx: 'rise' },
  stretch: { label: '대검 메고 기지개', gestureMs: 1000, gesture: 'stretch', prop: 'lift' },
  twirl: { label: '단검 손에서 돌리기', gestureMs: 700, gesture: 'still', prop: 'spin2' },
  polish: { label: '탄띠 정리 → 총열 닦기', gestureMs: 900, gesture: 'nod', prop: 'rub' },
  juggle: { label: '저글링', gestureMs: 1100, gesture: 'still', prop: 'toss' },
  windblown: { label: '머리카락·망토 바람에 휘날림', gestureMs: 900, gesture: 'tilt', loop: 'sway', back: 'flutter', fx: 'drift' },
  breath_frost: { label: '입김 불기, 눈송이', gestureMs: 900, gesture: 'lean', fx: 'burst' },
  toss: { label: '주사위 던졌다 받기', gestureMs: 1000, gesture: 'nod', prop: 'toss' },
  hammer: { label: '망치로 모루 두드리기', gestureMs: 800, gesture: 'lean', prop: 'swingDown', fx: 'burst' },
  staff_thump: { label: '지팡이 쿵', gestureMs: 800, gesture: 'hop', prop: 'thump' },
  gaze: { label: '수정구 들여다보기', gestureMs: 1100, gesture: 'lean', propLoop: 'pulse', fx: 'orbit' },
  write: { label: '장부에 적기 → 안경 반짝', gestureMs: 1000, gesture: 'nod', prop: 'rub' },
  aim: { label: '스코프 조정', gestureMs: 1000, gesture: 'crouch', prop: 'tilt' },
  fume: { label: '주먹 쥐고 씩씩거리기 (콧김)', gestureMs: 800, gesture: 'puff', fx: 'rise' },
  static: { label: '정전기로 찌릿', gestureMs: 600, gesture: 'shake', fx: 'burst' },
  dip: { label: '화살촉에 독 바르기', gestureMs: 1000, gesture: 'lean', prop: 'dip', fx: 'rise' },
  draw_circle: { label: '마법진 그리기, 정령이 맴돎', gestureMs: 1100, gesture: 'tilt', prop: 'circle', pet: 'orbit' },
  read: { label: '책장 넘기기', gestureMs: 900, gesture: 'nod', prop: 'flip' },
  watch: { label: '회중시계 열었다 닫기', gestureMs: 900, gesture: 'tilt', prop: 'flip' },
  shake_flask: { label: '플라스크 흔들기 (거품 퐁퐁)', gestureMs: 800, gesture: 'still', prop: 'shake', fx: 'rise' },
  guard: { label: '방패 세우고 경계, 망토 펄럭', gestureMs: 1000, gesture: 'still', prop: 'raise', back: 'flutter' },
  pet_skull: { label: '해골 쓰다듬기, 녹색 불꽃', gestureMs: 1000, gesture: 'nod', prop: 'tilt', fx: 'rise' },
  scout_look: { label: '쌍안경으로 관측', gestureMs: 1200, gesture: 'lean', prop: 'raise' },
  meditate: { label: '눈 감고 명상, 떠오르기', gestureMs: 1200, gesture: 'still', loop: 'float', fx: 'orbit' },
  iai: { label: '칼집에 손, 발도 자세', gestureMs: 700, gesture: 'crouch', prop: 'thrust' },
  arrange: { label: '화살 정리, 바람 소용돌이', gestureMs: 1000, gesture: 'nod', prop: 'tilt', fx: 'orbit' },
  play_pet: { label: '어깨 위 아기 용과 놀기', gestureMs: 1000, gesture: 'tilt', prop: 'tilt', pet: 'hop' },
  wave_banner: { label: '깃발 흔들기', gestureMs: 1100, gesture: 'stomp', prop: 'wave' },
  float_read: { label: '공중에 떠서 마법서 읽기', gestureMs: 1000, gesture: 'still', loop: 'float', prop: 'flip' },
  fade: { label: '그림자 속으로 반쯤 사라졌다 나타남', gestureMs: 1200, gesture: 'fade' },
  toss_clover: { label: '네잎클로버 날리기', gestureMs: 1000, gesture: 'hop', prop: 'toss', fx: 'rise' },
  hold_upright: { label: '거대한 창을 세우고 바람에 휘날림', gestureMs: 1000, gesture: 'still', prop: 'tilt', back: 'flutter', fx: 'drift' },
  storm: { label: '먹구름·번개 번쩍', gestureMs: 700, gesture: 'still', back: 'pulse', fx: 'burst' },
  fan: { label: '금화 더미 위에서 부채질', gestureMs: 900, gesture: 'nod', prop: 'fanwave', fx: 'rise' },
  pray: { label: '두 손 모아 기도, 후광', gestureMs: 1200, gesture: 'nod', loop: 'float', fx: 'orbit' },
  portal: { label: '손안의 포털 열었다 닫기', gestureMs: 1200, gesture: 'still', prop: 'pop' },
  wheel: { label: '운명의 수레바퀴 회전', gestureMs: 1000, gesture: 'still', propLoop: 'spin', fx: 'orbit' },
  pour: { label: '풍요의 뿔에서 쏟아짐', gestureMs: 1000, gesture: 'tilt', prop: 'tilt', fx: 'fall' },
  wings_spread: { label: '검은 날개 펼쳤다 접기', gestureMs: 1300, gesture: 'puff', back: 'spread' },
  orbit: { label: '주위를 도는 소품', gestureMs: 900, gesture: 'still', propLoop: 'spin', back: 'rotate', fx: 'orbit' },
  command: { label: '군기 들어 지휘', gestureMs: 1000, gesture: 'stomp', prop: 'raise' },
  cheer: { label: '하수인들과 환호', gestureMs: 900, gesture: 'hop2', prop: 'raise', pet: 'hop' },
  sway: { label: '느릿하게 흔들림', gestureMs: 1000, gesture: 'still', loop: 'sway', pet: 'bob' },
  dance: { label: '북·류트로 춤', gestureMs: 900, gesture: 'hop2', loop: 'sway', prop: 'tilt', fx: 'burst' },
  hover: { label: '떠서 맴돌기', gestureMs: 1000, gesture: 'still', loop: 'float', propLoop: 'wobble', back: 'rotate' },
  walk: { label: '걷기 (적)', gestureMs: 600, gesture: 'still' },
  flap: { label: '날갯짓 (적)', gestureMs: 600, gesture: 'still' },
  float: { label: '둥실 (적)', gestureMs: 600, gesture: 'still' },
  slither: { label: '꿈틀 (적)', gestureMs: 600, gesture: 'still' },
};

export interface PartXf {
  /** 쉬는 자리에서 옮긴 거리 (그림 단위) */
  x: number;
  y: number;
  rot: number;
  sx: number;
  sy: number;
  alpha: number;
}

export interface FxPoint {
  /** 발밑 기준 (그림 단위) */
  x: number;
  y: number;
  alpha: number;
  scale: number;
}

export interface IdleParts {
  /** 몸 전체 추가 이동 (떠오르기·흔들기, 그림 단위) */
  body: PartXf;
  prop: PartXf;
  back: PartXf;
  pet: PartXf;
  fx: FxPoint[];
}

export const REST: PartXf = Object.freeze({ x: 0, y: 0, rot: 0, sx: 1, sy: 1, alpha: 1 });

const TAU = Math.PI * 2;

function xf(p: Partial<PartXf>): PartXf {
  return { x: p.x ?? 0, y: p.y ?? 0, rot: p.rot ?? 0, sx: p.sx ?? 1, sy: p.sy ?? 1, alpha: p.alpha ?? 1 };
}

const WINGS = new Set<BackId>(['wings_butterfly', 'wings_note', 'wings_ice', 'wings_star', 'wings_clock', 'wings_clover', 'wings_feather', 'wings_bat', 'wings_storm', 'wings_void', 'wings_blade', 'gold_wings', 'cathedral_halo', 'dragons']);
const CAPES = new Set<BackId>(['cape', 'cape_emblem', 'cape_cards', 'cape_storm', 'cape_gold', 'cape_stars']);
const SPINNERS = new Set<BackId>(['floating_blades', 'ring_device', 'meteors', 'clock_halo', 'constellation_wheel', 'fruit_rain']);

/** 등 파츠 기본 움직임: 날개 = 날갯짓, 망토 = 펄럭임, 떠 있는 고리·칼 = 천천히 회전 */
export function defaultBackMotion(back: BackId | undefined): BackMotion {
  if (!back || back === 'none') return 'none';
  if (WINGS.has(back)) return 'flap';
  if (CAPES.has(back)) return 'flutter';
  if (SPINNERS.has(back)) return 'pulse';
  return 'none';
}

export function defaultPetMotion(pet: PetId | undefined): PetMotion {
  switch (pet) {
    case 'dog':
    case 'dogs_armored':
      return 'wag';
    case 'drone':
    case 'drones2':
      return 'hover';
    case 'spirit':
    case 'spirits2':
      return 'orbit';
    case 'baby_dragon':
    case 'goblins':
    case 'mud_spirit':
      return 'hop';
    case 'skeletons':
      return 'bob';
    default:
      return 'none';
  }
}

/** 등급별 입자 수 (레전드 이상 오라 입자 — ART.md 1장) */
export function fxCount(grade: string | undefined, fx: FxId | undefined): number {
  if (!fx || fx === 'none') return 0;
  switch (grade) {
    case 'normal':
    case 'rare':
      return 1;
    case 'unique':
    case 'hero':
      return 2;
    default:
      return 3;
  }
}

/** 0~1 결정적 의사 난수 (같은 seed·n → 같은 값) */
function h01(seed: number, n: number): number {
  let x = Math.imul((seed * 2654435761) ^ (n * 40503), 0x45d9f3b) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) >>> 0;
  return ((x ^ (x >>> 13)) >>> 0) / 4294967296;
}

function propMotion(m: PropMotion, g: number): Partial<PartXf> {
  if (g < 0) return {};
  const k = Math.sin(Math.PI * g);
  switch (m) {
    case 'swingDown': {
      // 들어 올렸다(0~60%) 내려찍기(60~80%) 제자리
      if (g < 0.6) return { rot: -1.0 * Math.sin((Math.PI / 2) * (g / 0.6)) };
      if (g < 0.8) return { rot: -1.0 + 1.35 * ((g - 0.6) / 0.2) };
      return { rot: 0.35 * (1 - (g - 0.8) / 0.2) };
    }
    case 'slash':
      return { rot: 0.9 * Math.sin(TAU * g) * k };
    case 'tap':
      return { rot: -0.45 * Math.abs(Math.sin(3 * TAU * g)) };
    case 'spin':
      return { rot: TAU * (g < 0.5 ? 2 * g * g : 1 - 2 * (1 - g) * (1 - g)) };
    case 'spin2':
      return { rot: 2 * TAU * g };
    case 'toss':
      return { y: -58 * k, rot: TAU * g };
    case 'shake':
      return { rot: 0.28 * Math.sin(4 * TAU * g) * k };
    case 'raise':
      return { y: -14 * k, rot: -0.3 * k };
    case 'pull':
      return { x: -12 * k, rot: -0.06 * k };
    case 'flip':
      return { sx: Math.cos(TAU * g) };
    case 'thrust':
      return { x: 16 * Math.sin(Math.PI * Math.min(1, g * 2)), rot: -0.15 * k };
    case 'dip':
      return { y: 16 * k, rot: 0.45 * k };
    case 'circle':
      return { x: 10 * Math.cos(TAU * g) - 10, y: 10 * Math.sin(TAU * g) };
    case 'wave':
      return { rot: 0.38 * Math.sin(2 * TAU * g) * k };
    case 'pulse':
      return { sx: 1 + 0.25 * k, sy: 1 + 0.25 * k };
    case 'lift':
      return { y: -12 * k, rot: -0.4 * k };
    case 'tilt':
      return { rot: 0.22 * Math.sin(TAU * g) };
    case 'rub':
      return { x: 7 * Math.sin(3 * TAU * g) * k };
    case 'thump':
      return { y: g < 0.6 ? -18 * Math.sin((Math.PI / 2) * (g / 0.6)) : -18 * (1 - (g - 0.6) / 0.4) * (1 - (g - 0.6) / 0.4) };
    case 'fanwave':
      return { rot: 0.35 * Math.sin(3 * TAU * g) };
    case 'pop':
      return { sx: 0.45 + 0.7 * k, sy: 0.45 + 0.7 * k };
    case 'none':
      return {};
  }
}

/** 돌리는 소품은 소품 중심을 축으로: 손 기준 회전을 소품 중심 기준으로 바꾸는 이동 */
function aroundCenter(rot: number, cx: number, cy: number): { x: number; y: number } {
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  // 손(원점) 기준으로 rot 돌린 뒤 중심이 제자리에 오도록 옮긴다: c - R·c
  return { x: cx - (cos * cx - sin * cy), y: cy - (sin * cx + cos * cy) };
}

export interface IdleInput {
  preset: IdlePreset;
  /** 고유 동작 진행 (0~1, 창 밖이면 −1) — towerPose 결과 */
  gesture: number;
  /** 공격 진행 (0~1 sin, 공격 중이 아니면 0) */
  attack: number;
  timeMs: number;
  seed: number;
  body: BodyId;
  prop?: PropId;
  back?: BackId;
  pet?: PetId;
  fx?: FxId;
  grade?: string;
  /** 갤러리에서 대기 동작을 멈출 때 false */
  play?: boolean;
}

/** 시각 timeMs의 파츠 자세. */
export function idleParts(input: IdleInput): IdleParts {
  const { preset, timeMs: t, seed } = input;
  const play = input.play !== false;
  const g = play ? input.gesture : -1;
  const ph = seed * TAU;
  // 몸 전체 반복 (떠오르기·좌우 흔들기). 요정은 늘 떠 있다
  const loop: BodyLoop = preset.loop ?? 'none';
  const floats = loop === 'float' || input.body === 'fairy' || input.body === 'spirit';
  const body: Partial<PartXf> = {};
  if (play && floats) body.y = -5 - 5 * Math.sin(t * 0.0032 + ph);
  if (play && loop === 'sway') body.rot = 0.06 * Math.sin(t * 0.0045 + ph);

  // 소품
  const prop: Partial<PartXf> = propMotion(preset.prop ?? 'none', g);
  const meta = input.prop ? PROP_META[input.prop] : undefined;
  if (play) {
    switch (preset.propLoop) {
      case 'spin':
        prop.rot = (prop.rot ?? 0) + ((t * 0.0022 + ph) % TAU);
        break;
      case 'wobble':
        prop.rot = (prop.rot ?? 0) + 0.08 * Math.sin(t * 0.004 + ph);
        break;
      case 'bob':
        prop.y = (prop.y ?? 0) + 3 * Math.sin(t * 0.004 + ph);
        break;
      case 'pulse': {
        const s = 1 + 0.07 * Math.sin(t * 0.006 + ph);
        prop.sx = (prop.sx ?? 1) * s;
        prop.sy = (prop.sy ?? 1) * s;
        break;
      }
      default:
        break;
    }
  }
  // 공격: 소품을 앞으로 휘두른다
  if (input.attack > 0) prop.rot = (prop.rot ?? 0) + 0.55 * input.attack;
  if (meta?.spin && prop.rot) {
    const off = aroundCenter(prop.rot, meta.spin[0], meta.spin[1]);
    prop.x = (prop.x ?? 0) + off.x;
    prop.y = (prop.y ?? 0) + off.y;
  }

  // 등
  const back: Partial<PartXf> = {};
  const bm = preset.back ?? defaultBackMotion(input.back);
  if (play) {
    switch (bm) {
      case 'flap': {
        const f = 0.5 + 0.5 * Math.sin(t * 0.011 + ph);
        back.sx = 1 - 0.22 * f;
        back.y = 2 * f;
        break;
      }
      case 'flutter':
        back.rot = 0.035 * Math.sin(t * 0.006 + ph);
        back.sx = 1 + 0.05 * Math.sin(t * 0.009 + ph);
        break;
      case 'spread': {
        const k = g >= 0 ? Math.sin(Math.PI * g) : 0;
        back.sx = 0.72 + 0.4 * k;
        back.sy = 0.92 + 0.1 * k;
        break;
      }
      case 'rotate':
        back.rot = 0.12 * Math.sin(t * 0.0012 + ph);
        break;
      case 'pulse':
        back.alpha = 0.82 + 0.18 * Math.sin(t * 0.005 + ph);
        back.sx = back.sy = 1 + 0.03 * Math.sin(t * 0.005 + ph);
        break;
      default:
        break;
    }
  }

  // 동반자
  const pet: Partial<PartXf> = {};
  const pm = preset.pet ?? defaultPetMotion(input.pet);
  if (play) {
    switch (pm) {
      case 'hop':
        pet.y = -9 * Math.abs(Math.sin(t * 0.0055 + ph));
        break;
      case 'hover':
        pet.y = 5 * Math.sin(t * 0.004 + ph);
        pet.rot = 0.06 * Math.sin(t * 0.003 + ph);
        break;
      case 'orbit': {
        const a = t * 0.0021 + ph;
        pet.x = 16 * Math.cos(a) - 8;
        pet.y = 7 * Math.sin(a);
        break;
      }
      case 'wag':
        pet.rot = 0.05 * Math.sin(t * 0.012 + ph);
        pet.y = g >= 0 ? -6 * Math.sin(Math.PI * g) : 0;
        break;
      case 'rise': {
        const k = g >= 0 ? Math.sin(Math.PI * g) : 0;
        pet.y = -38 * k + 4 * Math.sin(t * 0.004 + ph);
        break;
      }
      case 'bob':
        pet.y = 3 * Math.sin(t * 0.005 + ph);
        break;
      default:
        break;
    }
  }

  // 그림자 암살자: 반쯤 사라졌다 나타남
  if (preset.gesture === 'fade' && g >= 0) body.alpha = 1 - 0.65 * Math.sin(Math.PI * g);

  return { body: xf(body), prop: xf(prop), back: xf(back), pet: xf(pet), fx: play ? fxPoints(preset.fx ?? 'rise', input, g) : [] };
}

/** 입자 자리 (발밑 기준 그림 단위) */
function fxPoints(mode: FxMotion, input: IdleInput, g: number): FxPoint[] {
  const n = fxCount(input.grade, input.fx);
  if (n === 0) return [];
  const t = input.timeMs;
  const out: FxPoint[] = [];
  const seed = Math.floor(input.seed * 1e6);
  for (let i = 0; i < n; i++) {
    const r0 = h01(seed, i);
    const period = 1800 + r0 * 900;
    const u = ((t + r0 * period + i * 600) % period) / period; // 0~1 반복
    switch (mode) {
      case 'rise':
        out.push({ x: -40 + r0 * 80 + 8 * Math.sin(u * TAU), y: -120 - u * 110, alpha: Math.sin(Math.PI * u), scale: 0.8 + 0.4 * u });
        break;
      case 'fall':
        out.push({ x: -50 + r0 * 100, y: -200 + u * 190, alpha: Math.sin(Math.PI * u), scale: 0.9 });
        break;
      case 'orbit': {
        const a = u * TAU + i * (TAU / n);
        out.push({ x: Math.cos(a) * 78, y: -120 + Math.sin(a) * 34, alpha: 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(a)), scale: 0.75 + 0.25 * Math.sin(a) });
        break;
      }
      case 'burst': {
        if (g < 0) break;
        const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.9 + (r0 - 0.5) * 0.4;
        const d = 20 + 70 * g;
        out.push({ x: 50 + Math.cos(a) * d, y: -70 + Math.sin(a) * d, alpha: 1 - g, scale: 0.7 + 0.5 * g });
        break;
      }
      case 'drift':
        out.push({ x: -90 + u * 180, y: -180 + r0 * 120 + 10 * Math.sin(u * TAU * 2), alpha: Math.sin(Math.PI * u), scale: 0.9 });
        break;
      case 'none':
        break;
    }
  }
  return out;
}
