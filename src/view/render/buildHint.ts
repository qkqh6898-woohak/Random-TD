/**
 * 전투 칸 표시 (순수 계산, Phaser 없음 → 단위 테스트). docs/design/field-context/README.md '표시 계약'.
 *
 * 평소(시작 직후·전투 중)에는 칸을 그리지 않는다. 조작 중에만 관련 칸을 보여 준다.
 * - 타워를 끄는 동안 · 패널 [↔ 이동] 모드: 배치 가능한 전체 칸 (alpha 1).
 * - 타워 선택(판매·승급)·강화 창: 호출한 쪽이 고른 관련 칸 (alpha 1).
 * - 잘못 누르기 안내 (#79 검토): 놓을 수 없는 곳(길·막힌 X 칸·맵 밖 땅)을 짧게 누르면 BUILD_HINT_MS 동안 배치 가능한 전체 칸을
 *   보여 주고, 끝 BUILD_HINT_FADE_MS 동안 서서히 사라진다. 연출 끄기(noFade)면 서서히 사라지지 않고 BUILD_HINT_MS가 지나면 바로 꺼진다.
 *   시각은 화면 시계(scene time, 실제 시간)라 배속과 무관하다. 일시정지·게임 종료·새 판이면 지운다.
 */
import type { SummonFail } from '../../sim/systems/Summon';

/** 잘못 누른 뒤 배치 칸을 보여 주는 전체 시간 (ms, 화면 시계) */
export const BUILD_HINT_MS = 1200;
/** 그중 끝에서 서서히 사라지는 시간 (ms) */
export const BUILD_HINT_FADE_MS = 400;

export type FieldCell = readonly [number, number];

/** 이 탭(소환 검사 결과)이 잘못 누르기 안내를 시작하는가: 배치 칸이 아닌 곳만 (빈 칸 소환·돈 부족·가득 참·타워 칸은 아님). */
export function startsBuildHint(fail: SummonFail | null): boolean {
  return fail === 'notBuildable';
}

/** 잘못 누르기 안내의 진하기 (0~1). hintAtMs = 마지막으로 잘못 누른 때 (없으면 null). noFade = 연출 끄기. */
export function buildHintAlpha(nowMs: number, hintAtMs: number | null, noFade = false): number {
  if (hintAtMs === null) return 0;
  const age = nowMs - hintAtMs;
  if (age < 0 || age >= BUILD_HINT_MS) return 0;
  const fadeFrom = BUILD_HINT_MS - BUILD_HINT_FADE_MS;
  if (noFade || age <= fadeFrom) return 1;
  return (BUILD_HINT_MS - age) / BUILD_HINT_FADE_MS;
}

export interface FieldContextInput {
  /** 일시정지 또는 게임 종료 — 아무것도 그리지 않는다 */
  blocked: boolean;
  /** 타워를 끄는 중이거나 [↔ 이동] 모드 */
  moving: boolean;
  /** 선택·강화 상태에서 칠할 칸 (없으면 빈 배열) */
  relevant: readonly FieldCell[];
  /** 맵의 배치 가능한 전체 칸 */
  buildable: readonly FieldCell[];
  nowMs: number;
  hintAtMs: number | null;
  noFade?: boolean;
}

/** 지금 칠할 칸과 진하기. 칸이 없으면 alpha 0. */
export function fieldContext(c: FieldContextInput): { tiles: readonly FieldCell[]; alpha: number } {
  if (c.blocked) return { tiles: [], alpha: 0 };
  if (c.moving) return { tiles: c.buildable, alpha: 1 };
  if (c.relevant.length) return { tiles: c.relevant, alpha: 1 };
  const a = buildHintAlpha(c.nowMs, c.hintAtMs, c.noFade);
  return a > 0 ? { tiles: c.buildable, alpha: a } : { tiles: [], alpha: 0 };
}
