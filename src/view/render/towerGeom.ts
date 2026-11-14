/**
 * 맵 위 타워 그림의 크기·위치 (순수 계산, Phaser 없음 → 단위 테스트). TowerSprite와 탭 판정(input/tap.ts)이 같이 쓴다.
 *
 * 캐릭터는 1.1칸 높이이고 발이 칸 중심보다 0.3칸 아래라서, 머리·헬멧·별(위쪽 약 0.28칸 + 대기 동작)이 위 칸으로 삐져나와 그려진다.
 * 그 부분을 탭하면 위 칸이 아니라 그 타워를 누른 것으로 본다 (`towerTapZone`).
 */
import { CHIBI_BOUNDS } from '../../art/chibiBounds';

/** 캐릭터 높이 (칸 배수) */
export const FIGURE_TILES = 1.1;
/** 발밑 위치: 칸 중심에서 아래로 (칸 배수) */
export const FOOT_OFFSET_TILES = 0.3;

/** 캐릭터 맨 위 (별 포함): 칸 중심 기준 칸 배수 (음수 = 위). ≈ −0.776 */
export const FIGURE_TOP_TILES = FOOT_OFFSET_TILES + (FIGURE_TILES * CHIBI_BOUNDS.top) / (CHIBI_BOUNDS.bottom - CHIBI_BOUNDS.top);

/** 대기 동작(위아래 흔들림·숨쉬기·고유 동작 뜀·등장 넘침)으로 더 올라가는 여유 (칸 배수) */
export const FIGURE_MOTION_MARGIN_TILES = 0.06;

/** 위 칸으로 삐져나온 머리 부분의 가로 반폭 (칸 배수): 머리(반지름 62)·별·두건 ≈ 0.28칸 + 여유 */
export const HEAD_HALF_WIDTH_TILES = 0.34;

/**
 * 타워 칸 (tx, ty)의 그림 중 위 칸으로 삐져나온 머리 영역 (칸 좌표, 칸 (0,0) 왼쪽 위 = (0,0), 1칸 = 1).
 * top < ty 이고 bottom = ty (칸 위쪽 경계)까지.
 */
export function towerHeadZone(tx: number, ty: number): { left: number; right: number; top: number; bottom: number } {
  const cx = tx + 0.5;
  const cy = ty + 0.5;
  return {
    left: cx - HEAD_HALF_WIDTH_TILES,
    right: cx + HEAD_HALF_WIDTH_TILES,
    top: cy + FIGURE_TOP_TILES - FIGURE_MOTION_MARGIN_TILES,
    bottom: ty,
  };
}
