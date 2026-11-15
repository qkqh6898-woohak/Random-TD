/**
 * 특색 수치 읽기 (DEV_PLAN M3-8): towers.json params → 타워 레벨에 맞춘 정수.
 *
 * - params 값은 `[Lv1, Lv15]` 배열이거나 레벨과 무관한 상수다 (towers.json notes).
 * - 레벨 보간: `lerp(params[0], params[1], (lv − 1) / 14)` (14 = 최대 레벨 15 − 1, game.json towerLevel.max).
 *   정수로 계산한다: 먼저 끝값 둘을 정수 단위(bp·틱·단위·원)로 바꾸고 a + trunc((b − a) × (lv − 1) ÷ (max − 1)).
 *   → Lv1 = a, Lv15 = b 정확히, 그 사이는 0 쪽으로 자른다 (8초 → 5초: Lv8 = 160 − 30 = 130틱).
 * - 타워 레벨은 지금 모두 1 (계정 성장 M9에서 판을 만들 때 MatchOptions.levels로 넣는다).
 * - 이름이 틀리거나 모양이 다르거나 범위(Range)를 벗어나면 `towers.json {id}.params.{key}` 경로가 든 에러
 *   (createMatch가 checkAllAbilityParams로 모든 모듈을 Lv1·최대 레벨에서 compile해 보므로 판을 만들 때 바로 드러난다).
 *   범위는 정수 단위로 바꾼 **끝값 둘**에 검사한다 (그 사이 레벨은 보간이라 저절로 범위 안).
 *   예: 주기·수명이 0이면 매 틱 발동(성능 급락), 반경·속도가 0이면 아무것도 안 함 → 판을 만들 때 막는다 (검토 반영).
 */
import { BP_ONE, bp, tiles } from '../Fixed';
import { secondsToTicksExact } from '../rules';

/** 정수 단위로 바꾼 값의 허용 범위 (경계 포함). */
export interface Range {
  readonly min?: number;
  readonly max?: number;
}

/** 1 이상 (주기·지속·수명 1틱 이상, 반경·속도 1단위 이상, 횟수·면 1 이상) */
export const POSITIVE: Range = Object.freeze({ min: 1 });
/** 0 이상 (돈·버프 %·배율) */
export const NON_NEG: Range = Object.freeze({ min: 0 });
/** 비율 0 ~ 100% (확률·둔화·현재 체력 %·즉사 체력 %) */
export const RATIO: Range = Object.freeze({ min: 0, max: BP_ONE });

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

  /** 정수 단위로 바꾼 끝값이 범위 안인지 (밖이면 경로가 든 에러). */
  private inRange(key: string, v: number, range: Range | undefined, raw: unknown): number {
    if (!range) return v;
    if ((range.min !== undefined && v < range.min) || (range.max !== undefined && v > range.max)) {
      const want = range.max === undefined ? `${range.min} 이상` : range.min === undefined ? `${range.max} 이하` : `${range.min}~${range.max}`;
      throw new Error(`${this.where(key)}: 정수 단위 값이 ${want}이어야 한다 (받은 값: ${JSON.stringify(raw)} → ${v})`);
    }
    return v;
  }

  /** 값 하나 또는 [Lv1, Lv15]를 정수 단위로 바꿔 (범위 검사 후) 레벨 보간. */
  private read(key: string, conv: (v: number) => number, range?: Range): number {
    const v = this.raw[key];
    if (typeof v === 'number' && Number.isFinite(v)) return this.inRange(key, conv(v), range, v);
    if (Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number' && Number.isFinite(x))) {
      const a = this.inRange(key, conv(v[0] as number), range, v);
      const b = this.inRange(key, conv(v[1] as number), range, v);
      return lerpLevel(a, b, this.level, this.maxLevel);
    }
    throw new Error(`${this.where(key)}: 숫자 또는 [Lv1, Lv15] 숫자 2개가 필요하다 (받은 값: ${JSON.stringify(v)})`);
  }

  /** 비율 → bp (0.25 → 2500). 범위를 주지 않으면 음수도 그대로 (도박꾼 −3%p). */
  bp(key: string, range?: Range): number {
    return this.read(key, bp, range);
  }

  /** 초 → 틱 (0.05초 단위가 아니면 에러). */
  ticks(key: string, range?: Range): number {
    return this.read(
      key,
      (s) => {
        try {
          return secondsToTicksExact(s);
        } catch (e) {
          throw new Error(`${this.where(key)}: ${(e as Error).message}`);
        }
      },
      range,
    );
  }

  /** 정수 (원·횟수). */
  int(key: string, range?: Range): number {
    return this.read(
      key,
      (x) => {
        if (!Number.isSafeInteger(x)) throw new Error(`${this.where(key)}: 정수여야 한다 (받은 값: ${x})`);
        return x;
      },
      range,
    );
  }

  /** 칸 → 단위 (1.5칸 = 1500). */
  units(key: string, range?: Range): number {
    return this.read(key, tiles, range);
  }

  /** 배율 → bp (×2 = 20000). bp와 같지만 뜻을 드러내려고 따로 둔다. */
  mul(key: string, range?: Range): number {
    return this.read(key, (x) => Math.round(x * BP_ONE), range);
  }

  /** 문자열 (오라 범위 'around8' 등). */
  str<T extends string>(key: string, allowed: readonly T[]): T {
    const v = this.raw[key];
    if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
      throw new Error(`${this.where(key)}: ${allowed.join(' / ')} 중 하나여야 한다 (받은 값: ${JSON.stringify(v)})`);
    }
    return v as T;
  }
}
