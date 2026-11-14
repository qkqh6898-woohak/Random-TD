/**
 * 몹 걷기 자세 계산 (순수 함수, Phaser 없음 → 단위 테스트).
 *
 * ART.md 2.1 '몹 걷기': 항상 반복, **0.6초 주기, 이동 방향으로 몸 기울기**.
 * - 걷기(walk): 0.6초에 한 번 통통 튀고(땅에 닿을 때 가로로 눌림, 공중에서 세로로 늘어남) 몸이 살짝 좌우로 흔들린다.
 *   주기는 이동 속도와 상관없이 0.6초 (빠른 몹은 같은 박자에 더 멀리 간다).
 * - 날갯짓(flap, 박쥐)·둥실(float, 유령)은 걷지 않으니 따로 박자를 두되, 이동 방향 기울기는 같이 쓴다.
 * - 기울기: 진행 방향의 가로 성분(dx) 쪽으로 머리가 기운다 (오른쪽으로 가면 시계 방향). 세로로만 갈 때는 0.
 *   모서리에서 갑자기 뒤집히지 않게 화면 쪽(MobSprite)에서 부드럽게 따라간다 → `approachLean`.
 * 각도 단위는 라디안(Phaser rotation, 양수 = 시계 방향).
 */

/** 걷기 한 주기 (ms) — ART.md 2.1 */
export const MOB_WALK_PERIOD_MS = 600;
/** 박쥐 날갯짓 한 번 (ms) */
export const MOB_FLAP_PERIOD_MS = 240;
/** 박쥐가 위아래로 오르내리는 한 주기 (ms) */
export const MOB_HOVER_PERIOD_MS = 600;
/** 유령 둥실 한 주기 (ms) */
export const MOB_FLOAT_PERIOD_MS = 1200;
/** 이동 방향 기울기 (rad, 약 8도) */
export const MOB_LEAN_RAD = 0.14;
/** 걷기 좌우 흔들림 (rad, 약 3도) */
export const MOB_SWAY_RAD = 0.05;
/** 걷기 눌림 정도 (가로·세로 크기 ±) */
export const MOB_SQUASH = 0.06;
/** 기울기가 목표 쪽으로 따라가는 시간 상수 (ms) */
export const MOB_LEAN_EASE_MS = 120;

export type MobMotion = 'walk' | 'flap' | 'float';

export interface MobPose {
  /** 위아래 (bobAmp 배수, 음수 = 위) */
  bob: number;
  /** 가로·세로 크기 배수 */
  sx: number;
  sy: number;
  /** 흔들림 각도 (rad) — 이동 방향 기울기는 따로 더한다 (`leanTarget`) */
  angle: number;
}

const TAU = Math.PI * 2;

/**
 * 시각 timeMs의 자세.
 * @param phase 몹마다 다른 시작 위상 (rad) — 무리가 같이 출렁이지 않게
 */
export function mobPose(motion: MobMotion, timeMs: number, phase: number): MobPose {
  if (motion === 'walk') {
    // u: 한 주기에 2π. 튀기는 |sin(u/2)| → 주기마다 한 번 땅에 닿는다 (u = 0, 2π …)
    const u = (TAU * timeMs) / MOB_WALK_PERIOD_MS + phase;
    const bob = -Math.abs(Math.sin(u / 2));
    const squash = Math.cos(u) * MOB_SQUASH; // 땅(u=0)에서 가로로 넓게, 꼭대기(u=π)에서 세로로 길게
    return { bob, sx: 1 + squash, sy: 1 - squash, angle: Math.sin(u) * MOB_SWAY_RAD };
  }
  if (motion === 'flap') {
    const hover = (TAU * timeMs) / MOB_HOVER_PERIOD_MS + phase;
    const flap = (TAU * timeMs) / MOB_FLAP_PERIOD_MS + phase;
    return { bob: -1.4 - Math.sin(hover) * 0.6, sx: 0.82 + 0.18 * Math.abs(Math.cos(flap / 2)), sy: 1, angle: 0 };
  }
  const u = (TAU * timeMs) / MOB_FLOAT_PERIOD_MS + phase;
  return { bob: -1.2 + Math.sin(u) * 0.8, sx: 1, sy: 1, angle: 0 };
}

/** 이동 방향 기울기 목표 (rad): 가로 성분 쪽으로. 박쥐·유령은 반만. */
export function leanTarget(motion: MobMotion, dirDx: number): number {
  const lean = motion === 'walk' ? MOB_LEAN_RAD : MOB_LEAN_RAD / 2;
  return Math.sign(dirDx) * lean;
}

/** 지금 기울기 → 목표 쪽으로 dtMs만큼 따라간 값 (지수 감쇠, dt가 커도 넘치지 않음). */
export function approachLean(current: number, target: number, dtMs: number): number {
  if (!(dtMs > 0)) return current;
  const k = Math.min(1, dtMs / MOB_LEAN_EASE_MS);
  return current + (target - current) * k;
}
