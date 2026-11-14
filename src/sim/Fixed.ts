/**
 * 정수 연산 도우미 (CLAUDE.md 2장 3번).
 *
 * - 위치: 1칸 = `TILE`(1000) 단위 정수.
 * - 퍼센트: bp(1/10000) 정수. 100% = `BP_ONE`(10000), 25% = 2500.
 * - 곱셈 결과는 항상 `Math.floor` (음수는 -∞ 방향).
 * - 거리 비교는 제곱 거리(`dist2`)로. 제곱근이 꼭 필요하면 `isqrt`(정수 제곱근).
 *
 * 데이터(JSON)의 소수 값(예: 사거리 1.5칸, 확률 0.25)은 로드할 때 `tiles()`/`bp()`로 정수로 바꿔 둔다.
 * 기본 사칙연산은 IEEE 754에서 결과가 정확히 정해지므로 기기마다 같지만,
 * sim 상태에는 정수만 남기는 것을 원칙으로 한다 (hash.ts가 소수를 거부한다).
 */

/** 1칸 = 1000 단위. */
export const TILE = 1000;
/** 100% = 10000bp. */
export const BP_ONE = 10000;

function assertSafeInt(name: string, v: number): void {
  if (!Number.isSafeInteger(v)) throw new RangeError(`${name}: 안전한 정수가 아님 (${v})`);
}

/** 소수 비율(0.25) → bp(2500). 데이터 로드용, 가장 가까운 정수로 반올림 (0.29 → 2900). */
export function bp(fraction: number): number {
  if (!Number.isFinite(fraction)) throw new RangeError(`bp: 유한한 수가 아님 (${fraction})`);
  return Math.round(fraction * BP_ONE);
}

/** 퍼센트(25) → bp(2500). 데이터 로드용, 반올림. */
export function pct(percent: number): number {
  if (!Number.isFinite(percent)) throw new RangeError(`pct: 유한한 수가 아님 (${percent})`);
  return Math.round(percent * 100);
}

/** 칸 단위 소수(1.5칸) → 정수 단위(1500). 데이터 로드용, 반올림. */
export function tiles(t: number): number {
  if (!Number.isFinite(t)) throw new RangeError(`tiles: 유한한 수가 아님 (${t})`);
  return Math.round(t * TILE);
}

/** 정수 나눗셈 (내림, -∞ 방향). b는 0이 아닌 정수. |a| < 2^53 이면 정확하다. */
export function idiv(a: number, b: number): number {
  if (b === 0) throw new RangeError('idiv: 0으로 나눔');
  return Math.floor(a / b);
}

/**
 * value × bp / 10000 을 내림. value가 커도(2^53 근처) 정확하도록 몫·나머지로 나눠 계산한다.
 * 예: mulBp(100, 2500) = 25, mulBp(7, 15000) = 10 (10.5 내림), mulBp(-7, 15000) = -11.
 */
export function mulBp(value: number, bpValue: number): number {
  assertSafeInt('mulBp value', value);
  assertSafeInt('mulBp bp', bpValue);
  const q = Math.floor(value / BP_ONE);
  const r = value - q * BP_ONE; // 0 ≤ r < 10000
  const result = q * bpValue + Math.floor((r * bpValue) / BP_ONE);
  assertSafeInt('mulBp 결과', result);
  return result;
}

/** value × (10000 + bonusBp) / 10000 내림. "공격력 +25%" 같은 증가에 쓴다. */
export function addBp(value: number, bonusBp: number): number {
  return mulBp(value, BP_ONE + bonusBp);
}

/** a × b / c 내림 (c ≠ 0). 중간값 a×b가 2^53을 넘으면 에러. */
export function mulDiv(a: number, b: number, c: number): number {
  const prod = a * b;
  assertSafeInt('mulDiv a×b', prod);
  return idiv(prod, c);
}

/** 두 점 사이 제곱 거리 (정수). */
export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** 제곱 거리가 사거리(정수 단위) 안인가? 경계 포함 (거리 = 사거리 이면 안). */
export function withinRange(d2: number, range: number): boolean {
  return d2 <= range * range;
}

/** 정수 제곱근 내림. 0 ≤ n ≤ 2^53-1. Math.sqrt 없이 뉴턴 방법. */
export function isqrt(n: number): number {
  assertSafeInt('isqrt', n);
  if (n < 0) throw new RangeError(`isqrt: 음수 (${n})`);
  if (n < 2) return n;
  let x = 1;
  while (x * x <= n) x *= 2; // x는 2의 거듭제곱이라 x*x도 정확하다. 끝나면 x > √n
  let y = Math.floor((x + Math.floor(n / x)) / 2);
  while (y < x) {
    x = y;
    y = Math.floor((x + Math.floor(n / x)) / 2);
  }
  return x;
}

/** min ≤ v ≤ max 로 자르기. */
export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
