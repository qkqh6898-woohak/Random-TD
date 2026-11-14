/**
 * 특색 수치 읽기 (DEV_PLAN M3-8): towers.json params → 타워 레벨에 맞춘 정수.
 *
 * - params 값은 `[Lv1, Lv15]` 배열이거나 레벨과 무관한 상수다 (towers.json notes).
 * - 레벨 보간: `lerp(params[0], params[1], (lv − 1) / 14)` (14 = 최대 레벨 15 − 1, game.json towerLevel.max).
 *   정수로 계산한다: 먼저 끝값 둘을 정수 단위(bp·틱·단위·원)로 바꾸고 a + trunc((b − a) × (lv − 1) ÷ (max − 1)).
 *   → Lv1 = a, Lv15 = b 정확히, 그 사이는 0 쪽으로 자른다 (8초 → 5초: Lv8 = 160 − 30 = 130틱).
 * - 타워 레벨은 지금 모두 1 (계정 성장 M9에서 판을 만들 때 MatchOptions.levels로 넣는다).
 * - 이름이 틀리거나 모양이 다르면 `towers.json {id}.params.{key}` 경로가 든 에러 (판을 만들 때 바로 드러난다).
 */
import { BP_ONE, bp, tiles } from '../Fixed';
import { secondsToTicksExact } from '../rules';

/** 레벨 보간 (정수): a + trunc((b − a) × (level − 1) ÷ (max − 1)). level은 1 ~ max. */
export function lerpLevel(a: number, b: number, level: number, max: number): number {
  if (max <= 1 || level <= 1) return a;
  if (level >= max) return b;
  return a + Math.trunc(((b - a) * (level - 1)) / (max - 1));
}

/** 한 타워의 params를 레벨에 맞춰 정수로 읽는다. */
export class ParamReader {
  constructor(
    readonly towerId: string,
    private readonly raw: Readonly<Record<string, unknown>>,
    readonly level: number,
    readonly maxLevel: number,
  ) {
    if (!Number.isSafeInteger(level) || level < 1 || level > maxLevel) {
      throw new Error(`${towerId}: 타워 레벨은 1~${maxLevel} 정수 (받은 값: ${level})`);
    }
  }

  private where(key: string): string {
    return `towers.json ${this.towerId}.params.${key}`;
  }

  /** 값 하나 또는 [Lv1, Lv15]를 정수 단위로 바꿔 레벨 보간. */
  private read(key: string, conv: (v: number) => number): number {
    const v = this.raw[key];
    if (typeof v === 'number' && Number.isFinite(v)) return conv(v);
    if (Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number' && Number.isFinite(x))) {
      return lerpLevel(conv(v[0] as number), conv(v[1] as number), this.level, this.maxLevel);
    }
    throw new Error(`${this.where(key)}: 숫자 또는 [Lv1, Lv15] 숫자 2개가 필요하다 (받은 값: ${JSON.stringify(v)})`);
  }

  /** 비율 → bp (0.25 → 2500). 음수도 그대로 (도박꾼 −3%p). */
  bp(key: string): number {
    return this.read(key, bp);
  }

  /** 초 → 틱 (0.05초 단위가 아니면 에러). */
  ticks(key: string): number {
    return this.read(key, (s) => {
      try {
        return secondsToTicksExact(s);
      } catch (e) {
        throw new Error(`${this.where(key)}: ${(e as Error).message}`);
      }
    });
  }

  /** 정수 (원·횟수). */
  int(key: string): number {
    return this.read(key, (x) => {
      if (!Number.isSafeInteger(x)) throw new Error(`${this.where(key)}: 정수여야 한다 (받은 값: ${x})`);
      return x;
    });
  }

  /** 칸 → 단위 (1.5칸 = 1500). */
  units(key: string): number {
    return this.read(key, tiles);
  }

  /** 배율 → bp (×2 = 20000). bp와 같지만 뜻을 드러내려고 따로 둔다. */
  mul(key: string): number {
    return this.read(key, (x) => Math.round(x * BP_ONE));
  }

  /** 문자열 (오라 범위 'around8' 등). */
  str<T extends string>(key: string, allowed: readonly T[]): T {
    const v = this.raw[key];
    if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
      throw new Error(`${this.where(key)}: ${allowed.join(' / ')} 중 하나여야 한다 (받은 값: ${JSON.stringify(v)})`);
    }
    return v as T;
  }

  /** 0 이상인지 확인하고 돌려준다. */
  static nonNeg(towerId: string, key: string, v: number): number {
    if (v < 0) throw new Error(`towers.json ${towerId}.params.${key}: 0 이상이어야 한다 (받은 값: ${v})`);
    return v;
  }
}
