/**
 * 맵 위 타워 그림의 크기·위치 (순수 계산, Phaser 없음 → 단위 테스트). TowerSprite와 탭 판정(input/tap.ts)이 같이 쓴다.
 *
 * 기존 1.1칸 그림을 전투에서 확대한다. 머리·헬멧·별이 위 칸으로 올라가도 소환 칸 가운데는 터치할 수 있다.
 */
import { CHIBI_BOUNDS, PEDESTAL_BOUNDS } from '../../art/chibiBounds';

/** 캐릭터 높이 (칸 배수) */
export const FIGURE_TILES = 1.1;
/** 전투 화면의 기본 확대 배율과 붙어 있는 캐릭터의 배율 */
export const BATTLE_FIGURE_SCALE = 2;
const CROWDED_FIGURE_SCALE = 1.4;
/** 발밑 위치: 칸 중심에서 아래로 (칸 배수) */
export const FOOT_OFFSET_TILES = 0.3;

/** 캐릭터 맨 위 (별 포함): 칸 중심 기준 칸 배수 (음수 = 위). ≈ −0.776 */
export const FIGURE_TOP_TILES = FOOT_OFFSET_TILES + (FIGURE_TILES * CHIBI_BOUNDS.top) / (CHIBI_BOUNDS.bottom - CHIBI_BOUNDS.top);

/** 받침대 너비 (칸 배수) */
export const PEDESTAL_WIDTH_TILES = 0.78;

/** 받침대 맨 아래: 칸 중심 기준 칸 배수 (발밑 + 받침대 아래 두께). ≈ +0.475 */
export const FIGURE_BOTTOM_TILES = FOOT_OFFSET_TILES + (PEDESTAL_WIDTH_TILES * PEDESTAL_BOUNDS.bottom) / (PEDESTAL_BOUNDS.right - PEDESTAL_BOUNDS.left);

/** 대기 동작(위아래 흔들림·숨쉬기·고유 동작 뜀·등장 넘침)으로 더 올라가는 여유 (칸 배수) */
export const FIGURE_MOTION_MARGIN_TILES = 0.06;
const HEAD_ABOVE_FOOT_TILES = FOOT_OFFSET_TILES - FIGURE_TOP_TILES + FIGURE_MOTION_MARGIN_TILES;

/** 위 칸으로 삐져나온 머리 부분의 가로 반폭 (칸 배수): 머리(반지름 62)·별·두건 ≈ 0.28칸 + 여유 */
export const HEAD_HALF_WIDTH_TILES = 0.34;

/** 주변 칸과 HUD 앞에서 실루엣이 겹치지 않게 확대 폭을 줄인다. headroom = 발밑에서 HUD 아래까지의 거리 (칸). */
export function battleFigureScale(lookScale: number, crowded: boolean, headroom: number): number {
  const desired = lookScale * (crowded ? CROWDED_FIGURE_SCALE : BATTLE_FIGURE_SCALE);
  return Math.min(desired, Math.max(lookScale, headroom / HEAD_ABOVE_FOOT_TILES));
}

/**
 * 타워 그림 전체(머리·별 + 대기 동작 여유 ~ 받침대 아래)의 세로 범위: 칸 중심 기준 칸 배수 — 정보 패널이 가리지 않게.
 * @param scale 캐릭터별 크기 배수 (HF-2, looks scale): 발밑에서 위로 그만큼 커진다
 */
export function towerFigureSpanTiles(scale = 1): { top: number; bottom: number } {
  return { top: FOOT_OFFSET_TILES - HEAD_ABOVE_FOOT_TILES * scale, bottom: FIGURE_BOTTOM_TILES };
}

/**
 * 타워 칸 (tx, ty)의 그림 중 위 칸으로 삐져나온 머리 영역 (칸 좌표, 칸 (0,0) 왼쪽 위 = (0,0), 1칸 = 1).
 * top < ty 이고 bottom = ty (칸 위쪽 경계)까지.
 * F10 (캐릭터별 크기, looks scale): 큰 캐릭터는 머리가 더 높이·넓게 올라오므로 영역도 크기만큼 넓힌다. 작은 캐릭터는 좁아진다.
 * 단 위 칸에 다른 타워가 있거나 위 칸이 비어 있는 배치 칸이면(capToBase) 영역 위쪽 끝을 크기 1 기준(위 칸 아래 약 1/3)보다
 * 높이 올리지 않는다 — 위 타워를 누르기·길게 눌러 옮기기, 그리고 빈 위 칸에 소환하기가 먼저
 * (큰 캐릭터(돌 골렘 ×1.25 등) 머리가 위 칸의 아래 62%를 덮어, 칸 테두리가 숨은 빈 위 칸 가운데를 눌러도 소환되지 않던 것, F10-4 검토).
 * 위 칸이 길·장식처럼 소환할 수 없는 칸이면 머리 영역을 크기만큼 그대로 쓴다.
 */
export function towerHeadZone(tx: number, ty: number, scale = 1, capToBase = false): { left: number; right: number; top: number; bottom: number } {
  const cx = tx + 0.5;
  const cy = ty + 0.5;
  const s = scale > 0 ? scale : 1;
  const base = cy + FIGURE_TOP_TILES - FIGURE_MOTION_MARGIN_TILES;
  let top = cy + towerFigureSpanTiles(s).top;
  if (capToBase && top < base) top = base;
  const half = HEAD_HALF_WIDTH_TILES * (capToBase ? Math.min(1, s) : s);
  return { left: cx - half, right: cx + half, top, bottom: ty };
}
