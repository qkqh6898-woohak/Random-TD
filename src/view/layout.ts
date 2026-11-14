/**
 * 맵 화면 배치 (순수 계산, Phaser 없음 → 단위 테스트 가능).
 *
 * - MAPS.md 0장: 맵은 화면 가로폭에 맞춰 확대 (13칸 기준 1칸 ≈ 화면 폭의 1/13.5).
 * - 위는 DOM HUD(2줄 + 보스 막대 자리, 실제 높이를 잼), 아래는 M2부터 들어갈 버튼·하단 메뉴 자리
 *   → 그 사이 영역에 맵 전체(화면 밖 등장·퇴장 칸 포함)가 들어가게. HUD가 맵 칸을 덮지 않는다.
 * - 좌표 변환: sim 단위(1칸 = 1000) → 화면 픽셀. sim 칸 중심 (x·1000 + 500)이 화면 칸 중심에 온다.
 */
import { TILE } from '../sim/Fixed';
import type { SimMap } from '../sim/map';
import { GAME_HEIGHT, GAME_WIDTH } from './config';

/**
 * 위 HUD가 덮는 높이의 최소값 (기준 해상도 px). DOM HUD 2줄 ≈ 무대 높이의 16%.
 * 실제 맵 위쪽 끝은 DOM HUD(2줄 + 보스 막대 자리)를 재서 정한다 → `mapAreaBelowHud`.
 * (버튼 최소 44px 때문에 좁은 화면일수록 HUD가 기준 px로 더 커진다.)
 */
export const HUD_TOP_PX = 330;
/** 아래 버튼·하단 메뉴 자리 (M2~). */
export const BOTTOM_UI_PX = 330;
/** HUD 아래 끝과 맵 사이 여백 (기준 px) */
export const MAP_TOP_GAP_PX = 12;
/** 맵 영역 최소 높이 (기준 px): 아주 납작한 화면에서 HUD가 커져도 맵이 사라지지 않게 */
export const MIN_MAP_AREA_PX = 640;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MAP_AREA: Rect = { x: 0, y: HUD_TOP_PX, w: GAME_WIDTH, h: GAME_HEIGHT - HUD_TOP_PX - BOTTOM_UI_PX };

export interface MapBoundsInput {
  width: number;
  height: number;
  waypoints: readonly (readonly [number, number])[];
}

export interface MapLayout {
  /** 1칸 픽셀 (정수) */
  tile: number;
  /** 칸 (0, 0)의 왼쪽 위 픽셀 */
  originX: number;
  originY: number;
  /** 그릴 칸 범위 (화면 밖 웨이포인트 포함) */
  minCol: number;
  minRow: number;
  cols: number;
  rows: number;
}

/**
 * DOM HUD가 실제로 차지하는 높이(기준 px)를 받아 맵 영역을 정한다 (UI.md 4.1: HUD 2줄 → 보스 막대 줄 → 맵).
 * HUD 아래 끝 + 여백부터 아래 메뉴 자리 위까지. HUD가 작게 재져도(측정 전 0 등) `HUD_TOP_PX`보다 위로 올리지 않고,
 * 맵 영역이 `MIN_MAP_AREA_PX`보다 작아지게 내리지도 않는다.
 */
export function mapAreaBelowHud(hudBottomPx: number): Rect {
  const measured = Number.isFinite(hudBottomPx) && hudBottomPx > 0 ? Math.ceil(hudBottomPx) + MAP_TOP_GAP_PX : 0;
  const maxTop = GAME_HEIGHT - BOTTOM_UI_PX - MIN_MAP_AREA_PX;
  const y = Math.min(maxTop, Math.max(HUD_TOP_PX, measured));
  return { x: 0, y, w: GAME_WIDTH, h: GAME_HEIGHT - y - BOTTOM_UI_PX };
}

/** 무대의 CSS px → 기준 px (캔버스가 무대 너비에 맞춰 FIT 되므로 비율 = 1080 / 무대 너비). 무대가 아직 0이면 0. */
export function cssToGamePx(cssPx: number, stageCssWidth: number): number {
  return stageCssWidth > 0 ? (cssPx * GAME_WIDTH) / stageCssWidth : 0;
}

/** 기준 px → 무대의 CSS px. */
export function gameToCssPx(gamePx: number, stageCssWidth: number): number {
  return (gamePx * stageCssWidth) / GAME_WIDTH;
}

/** 맵(격자 + 웨이포인트)이 영역 안에 꽉 차게 들어가는 배치. 가로·세로 반 칸씩 여백. */
export function computeMapLayout(map: MapBoundsInput, area: Rect = MAP_AREA): MapLayout {
  let minCol = 0;
  let minRow = 0;
  let maxCol = map.width - 1;
  let maxRow = map.height - 1;
  for (const [x, y] of map.waypoints) {
    if (x < minCol) minCol = x;
    if (y < minRow) minRow = y;
    if (x > maxCol) maxCol = x;
    if (y > maxRow) maxRow = y;
  }
  const cols = maxCol - minCol + 1;
  const rows = maxRow - minRow + 1;
  const tile = Math.floor(Math.min(area.w / (cols + 0.5), area.h / (rows + 0.5)));
  const usedW = cols * tile;
  const usedH = rows * tile;
  const left = area.x + Math.round((area.w - usedW) / 2);
  const top = area.y + Math.round((area.h - usedH) / 2);
  return { tile, originX: left - minCol * tile, originY: top - minRow * tile, minCol, minRow, cols, rows };
}

/** 칸 (tx, ty) 중심 픽셀. */
export function tileCenterPx(layout: MapLayout, tx: number, ty: number): { x: number; y: number } {
  return { x: layout.originX + (tx + 0.5) * layout.tile, y: layout.originY + (ty + 0.5) * layout.tile };
}

/** sim 좌표(단위) → 픽셀. */
export function unitsToPx(layout: MapLayout, ux: number, uy: number): { x: number; y: number } {
  return { x: layout.originX + (ux / TILE) * layout.tile, y: layout.originY + (uy / TILE) * layout.tile };
}

/** 픽셀 → 칸 (M2 탭 입력용). 맵 밖이어도 칸 번호를 돌려준다. */
export function pxToTile(layout: MapLayout, px: number, py: number): { tx: number; ty: number } {
  return { tx: Math.floor((px - layout.originX) / layout.tile), ty: Math.floor((py - layout.originY) / layout.tile) };
}

/** 경로가 지나는 칸 (맵 밖 등장·퇴장 칸 포함, 중복 없음, 지나는 순서). */
export function pathCells(map: SimMap): { x: number; y: number; dx: number; dy: number }[] {
  const out: { x: number; y: number; dx: number; dy: number }[] = [];
  const seen = new Set<string>();
  for (const seg of map.path.segments) {
    const steps = seg.length / TILE;
    for (let i = 0; i <= steps; i++) {
      const x = Math.floor((seg.x + seg.dx * i * TILE) / TILE);
      const y = Math.floor((seg.y + seg.dy * i * TILE) / TILE);
      const key = `${x},${y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ x, y, dx: seg.dx, dy: seg.dy });
    }
  }
  return out;
}
