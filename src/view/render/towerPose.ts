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
 * 등장: 0.4초 동안 작게 시작해 살짝 넘쳤다가 제 크기로 (소환 직후).
 */

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
export const APPEAR_MS = 400;

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

  const sinceAttack = input.attackAtMs === null ? Infinity : timeMs - input.attackAtMs;
  if (sinceAttack >= 0 && sinceAttack < input.attackMs && input.attackMs > 0) {
    // 공격: 앞으로 내밀었다 돌아옴 (sin 반 주기), 내밀 때 살짝 눌림
    const k = Math.sin((Math.PI * sinceAttack) / input.attackMs);
    lunge = 0.12 * k;
    sx *= 1 + 0.06 * k;
    sy *= 1 - 0.05 * k;
  } else if (!(sinceAttack >= 0 && sinceAttack < ATTACK_CALM_MS)) {
    // 고유 동작 자리: 주기마다 0~1초 늦게 시작해 0.6초 동안 작게 뛰며 갸웃
    const t = timeMs + seed * GESTURE_PERIOD_MS;
    const cycle = Math.floor(t / GESTURE_PERIOD_MS);
    const start = hash01(Math.floor(seed * 1e6), cycle) * GESTURE_JITTER_MS;
    const g = t - cycle * GESTURE_PERIOD_MS - start;
    if (g >= 0 && g < GESTURE_MS) {
      const k = Math.sin((Math.PI * g) / GESTURE_MS);
      bob -= 0.06 * k;
      angle = 0.1 * Math.sin((TAU * g) / GESTURE_MS) * (hash01(cycle, 7) < 0.5 ? -1 : 1);
    }
  }

  // 등장: 0.3 → 1.12 → 1 (0.4초)
  if (input.appearAtMs !== null) {
    const a = timeMs - input.appearAtMs;
    if (a >= 0 && a < APPEAR_MS) {
      const p = a / APPEAR_MS;
      const s = p < 0.7 ? 0.3 + (1.12 - 0.3) * (p / 0.7) : 1.12 - 0.12 * ((p - 0.7) / 0.3);
      sx *= s;
      sy *= s;
    }
  }
  return { bob, sx, sy, angle, lunge };
}
