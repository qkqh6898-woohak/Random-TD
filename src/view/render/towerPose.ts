/**
 * 타워 자세 계산 (순수 함수, Phaser 없음 → 단위 테스트). DEV_PLAN M2-8, ART.md 2.1·2.2.
 *
 * 대기 동작 = 항상 반복 (공격하지 않을 때도 계속 움직인다):
 *  - 숨쉬기: 1.5초 주기로 몸이 위아래로 2% 늘었다 줄었다 (가로는 살짝 줄어 부피 유지).
 *  - 위아래 흔들림: 같은 주기로 살짝 떴다 내려온다.
 *  - 고유 동작 자리: 3초마다 한 번 0.6초 동안 작게 뛰며 갸웃 (타워별 동작은 M11 animations.json).
 *    3초 주기 안에서 시작 시점을 0~1초 무작위로 늦춰 기계적인 느낌을 줄인다 (ART.md 2.2 '0~1초 무작위 쉼').
 *  - 시작 위상(seed)은 타워마다 무작위 → 같은 타워 여러 개가 똑같이 움직이지 않는다.
 * 공격: 0.25초(공격 간격의 60% 이하) 동안 대상 쪽으로 몸을 내밀었다 돌아온다. 공격 직후 0.3초는 고유 동작 대신 숨쉬기만.
 * 등장: 0.52초 동안 부풀었다 눌리며 제 크기로 (소환 직후).
 *
 * 캐릭터 다양화: 고유 동작 창의 몸 움직임을 캐릭터별 프리셋(art/characters/idle.ts)이 고를 수 있다 (`gesture`·`gestureMs`).
 * 넘기지 않으면 예전과 똑같이 '작게 뛰며 갸웃'(hopTilt). 결과의 `gesture`(창 진행 0~1, 창 밖 −1)와 `attackK`로 소품·날개 등 파츠가 같은 박자에 움직인다.
 */
import type { BodyGesture } from '../../art/characters/idle';

/** 숨쉬기 한 주기 (ms) — ART.md 2.2 */
export const BREATH_PERIOD_MS = 1500;
/** 숨쉬기 세로 늘어남 (2%) */
export const BREATH_STRETCH = 0.02;
/** 위아래 흔들림 (칸 대비) */
export const IDLE_BOB_TILES = 0.035;
/** 고유 동작 주기 (ms) — 2~4초 */
export const GESTURE_PERIOD_MS = 3000;
/** 고유 동작 길이 (ms) */
export const GESTURE_MS = 600;
/** 고유 동작 시작 무작위 지연 최대 (ms) */
export const GESTURE_JITTER_MS = 1000;
/** 공격 동작 길이 최대 (ms) */
export const ATTACK_ANIM_MS = 250;
/** 공격 직후 고유 동작을 쉬는 시간 (ms) */
export const ATTACK_CALM_MS = 300;
/** 등장 동작 길이 (ms) */
export const APPEAR_MS = 520;
/** G-2 몸 흔들림(살랑) 주기 (ms)·크기 (rad, 0.02 아래 — '갸웃'과 구별되는 아주 작은 흔들림) */
export const SWAY_PERIOD_MS = 3400;
export const SWAY_RAD = 0.016;
/** G-2 공격: 처음 이만큼(공격 동작 비율) 뒤로 당겼다가(준비) 앞으로 찌른다 */
export const ATTACK_WINDUP = 0.18;
/** G-2 반짝임(무기·장신구 빛) 주기 (ms)·길이 (ms) — 타워마다 위상이 다르다 */
export const GLINT_PERIOD_MS = 5200;
export const GLINT_MS = 420;

const TAU = Math.PI * 2;

export interface TowerPose {
  /** 위아래 (칸 배수, 음수 = 위) */
  bob: number;
  sx: number;
  sy: number;
  /** 기울기 (rad) */
  angle: number;
  /** 공격으로 내민 정도 (칸 배수, 대상 방향 단위 벡터에 곱한다) */
  lunge: number;
  /** 가로 흔들림 (칸 배수) */
  dx: number;
  /** 고유 동작 창 진행 (0~1), 창 밖이면 −1 */
  gesture: number;
  /** 공격 진행 (0~1~0, sin 반 주기), 공격 중이 아니면 0 */
  attackK: number;
  /** G-2 살랑 흔들림 (rad, |값| < SWAY_RAD) — angle과 따로 더한다 (공격 직후 angle = 0 규칙은 그대로) */
  sway: number;
  /** G-2 공격 타격 빛 (0~1): 찌르는 순간 가장 밝다 */
  punch: number;
  /** G-2 반짝임 (0~1, 창 밖 0)과 자리 (그림 너비·높이 비율, 발밑 기준) */
  glint: number;
  glintX: number;
  glintY: number;
}

/** 0~1 의사 난수 (seed, n) → 같은 입력이면 같은 값. 화면 연출용 (sim 난수 아님). */
export function hash01(seed: number, n: number): number {
  let h = Math.imul((seed * 1000003) ^ (n * 2654435761), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/** 공격 동작 길이 (ms): 기본 250ms, 공격 간격의 60%를 넘지 않게 (ART.md 2.1). */
export function attackAnimMs(attackIntervalMs: number): number {
  const cap = attackIntervalMs * 0.6;
  return cap < ATTACK_ANIM_MS ? cap : ATTACK_ANIM_MS;
}

export interface PoseInput {
  timeMs: number;
  /** 타워마다 다른 무작위 값 (0~1) */
  seed: number;
  /** 마지막 공격 시각 (ms), 없으면 null */
  attackAtMs: number | null;
  /** 공격 동작 길이 (ms) */
  attackMs: number;
  /** 등장 시작 시각 (ms), 없으면 null */
  appearAtMs: number | null;
  /** 고유 동작 창의 몸 움직임 (기본 hopTilt = 작게 뛰며 갸웃) */
  gesture?: BodyGesture;
  /** 고유 동작 길이 (ms, 기본 GESTURE_MS) — 주기(3초)의 절반을 넘지 않게 자른다 */
  gestureMs?: number;
}

/** 숨쉬기 + 위아래 흔들림만 (1.5초 주기, 시작 위상 = seed). */
export function breathPose(timeMs: number, seed: number): { sx: number; sy: number; bob: number } {
  const u = (TAU * timeMs) / BREATH_PERIOD_MS + seed * TAU;
  const breath = 0.5 - 0.5 * Math.cos(u); // 0 → 1 → 0
  return {
    sy: 1 + BREATH_STRETCH * breath,
    sx: 1 - BREATH_STRETCH * 0.4 * breath,
    bob: -IDLE_BOB_TILES * (0.5 - 0.5 * Math.cos(u + Math.PI / 3)),
  };
}

/** 시각 timeMs의 자세. */
export function towerPose(input: PoseInput): TowerPose {
  const { timeMs, seed } = input;
  const base = breathPose(timeMs, seed);
  let { sy, sx, bob } = base;
  let angle = 0;
  let lunge = 0;
  let dx = 0;
  let gesture = -1;
  let attackK = 0;
  let punch = 0;
  const sway = SWAY_RAD * Math.sin((TAU * timeMs) / SWAY_PERIOD_MS + seed * 11.3);

  const sinceAttack = input.attackAtMs === null ? Infinity : timeMs - input.attackAtMs;
  if (sinceAttack >= 0 && sinceAttack < input.attackMs && input.attackMs > 0) {
    // 공격 (G-2 펀치): 처음 18%는 살짝 뒤로 당기며 웅크리고(준비), 그다음 앞으로 세게 찔렀다 돌아온다. 찌를 때 늘어나고 빛난다
    const p = sinceAttack / input.attackMs;
    attackK = Math.sin(Math.PI * p);
    if (p < ATTACK_WINDUP) {
      const w = p / ATTACK_WINDUP;
      lunge = -0.035 * w;
      sx *= 1 + 0.05 * w;
      sy *= 1 - 0.06 * w;
    } else {
      const q = (p - ATTACK_WINDUP) / (1 - ATTACK_WINDUP);
      const k = Math.sin(Math.PI * q);
      lunge = 0.16 * k;
      sx *= 1 - 0.04 * k;
      sy *= 1 + 0.06 * k;
      punch = q < 0.5 ? 1 - q * 2 : 0;
    }
  } else if (!(sinceAttack >= 0 && sinceAttack < ATTACK_CALM_MS)) {
    // 고유 동작 자리: 주기마다 0~1초 늦게 시작해 (기본 0.6초) 동안 프리셋 몸 동작
    const len = Math.min(input.gestureMs ?? GESTURE_MS, GESTURE_PERIOD_MS - GESTURE_JITTER_MS);
    const t = timeMs + seed * GESTURE_PERIOD_MS;
    const cycle = Math.floor(t / GESTURE_PERIOD_MS);
    const start = hash01(Math.floor(seed * 1e6), cycle) * GESTURE_JITTER_MS;
    const g = t - cycle * GESTURE_PERIOD_MS - start;
    if (g >= 0 && g < len) {
      const p = g / len;
      gesture = p;
      const k = Math.sin(Math.PI * p);
      const side = hash01(cycle, 7) < 0.5 ? -1 : 1;
      switch (input.gesture ?? 'hopTilt') {
        case 'hopTilt':
          bob -= 0.06 * k;
          angle = 0.1 * Math.sin(2 * Math.PI * p) * side;
          break;
        case 'hop':
          bob -= 0.09 * k;
          break;
        case 'hop2':
          bob -= 0.07 * Math.abs(Math.sin(2 * Math.PI * p));
          break;
        case 'tilt':
          angle = 0.12 * k * side;
          break;
        case 'lean':
          angle = 0.09 * k;
          bob += 0.01 * k;
          break;
        case 'shake':
          dx = 0.03 * Math.sin(6 * 2 * Math.PI * p) * k;
          break;
        case 'puff':
          sx *= 1 + 0.06 * k;
          sy *= 1 + 0.03 * k;
          break;
        case 'stretch':
          sy *= 1 + 0.07 * k;
          sx *= 1 - 0.03 * k;
          bob -= 0.02 * k;
          break;
        case 'nod':
          angle = 0.05 * Math.sin(2 * Math.PI * p);
          bob += 0.012 * k;
          break;
        case 'crouch':
          sy *= 1 - 0.05 * k;
          sx *= 1 + 0.03 * k;
          break;
        case 'stomp':
          bob -= 0.04 * Math.abs(Math.sin(2 * Math.PI * p));
          angle = 0.05 * Math.sin(2 * Math.PI * p);
          break;
        case 'still':
        case 'fade':
          break;
      }
    }
  }

  // FB-17: 부풀기 → 눌리기 → 제자리. 단순 확대보다 부피감이 읽히는 짧은 squash/stretch.
  if (input.appearAtMs !== null) {
    const a = timeMs - input.appearAtMs;
    if (a >= 0 && a < APPEAR_MS) {
      const p = a / APPEAR_MS;
      if (p < 0.55) {
        const q = 1 - (1 - p / 0.55) ** 3;
        sx *= 0.35 + 0.71 * q;
        sy *= 0.22 + 0.96 * q;
      } else if (p < 0.8) {
        const q = (p - 0.55) / 0.25;
        sx *= 1.06 + 0.03 * q;
        sy *= 1.18 - 0.25 * q;
      } else {
        const q = (p - 0.8) / 0.2;
        sx *= 1.09 - 0.09 * q;
        sy *= 0.93 + 0.07 * q;
      }
    }
  }
  // 반짝임: 주기마다 한 번, 타워마다 다른 때·자리 (무기·장신구 쪽: 몸 위 절반의 좌우 끝)
  const gt = timeMs + seed * GLINT_PERIOD_MS * 3.7;
  const gc = Math.floor(gt / GLINT_PERIOD_MS);
  const gStart = hash01(Math.floor(seed * 1e6) + 17, gc) * (GLINT_PERIOD_MS - GLINT_MS);
  const gp = (gt - gc * GLINT_PERIOD_MS - gStart) / GLINT_MS;
  const glint = gp >= 0 && gp < 1 ? Math.sin(Math.PI * gp) : 0;
  const glintX = (hash01(gc, 31) < 0.5 ? -1 : 1) * (0.22 + 0.12 * hash01(gc, 37));
  const glintY = 0.5 + 0.25 * hash01(gc, 41);
  return { bob, sx, sy, angle, lunge, dx, gesture, attackK, sway, punch, glint, glintX, glintY };
}
