/**
 * 맵 화면 배치 (순수 계산, Phaser 없음 → 단위 테스트 가능).
 *
 * - MAPS.md 0장: 맵은 HUD와 아래 띠 사이 영역에 들어가는 가장 큰 크기로 확대 (가로·세로 모두 여백 없이 꽉, 남는 축 가운데 — 맵 B안 + A-1).
 * - T-3: 논리 높이는 화면 비율대로 1920~2600 (viewport.ts) → 맵 영역 아래 끝은 잰 아래 띠 위치(없으면 지금 높이 − BOTTOM_UI_PX).
 * - 위는 DOM HUD(2줄 + 보스 막대 자리), 아래는 DOM 아래 띠(M2: 타워 수·소환 안내, M4·M5에서 버튼·하단 메뉴가 늘어남).
 *   둘 다 실제 높이를 재서 그 사이 영역에 맵 전체(화면 밖 등장·퇴장 칸 포함)가 들어가게 → HUD가 맵 칸을 덮지 않는다.
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
/** 아래 띠를 아직 재지 못했을 때 비워 두는 높이 (기준 px). 실제로는 아래 띠 위쪽 끝을 잰다 → `mapAreaBelowHud`. */
export const BOTTOM_UI_PX = 330;
/** 맵과 아래 띠 사이 여백 (기준 px) */
export const MAP_BOTTOM_GAP_PX = 12;
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
 * DOM HUD가 실제로 차지하는 높이(기준 px)를 받아 맵 영역을 정한다 (UI.md 4.1: HUD 2줄 → 보스 막대 줄 → 맵 → 아래 띠).
 * Game 장면은 hudBottomPx에 알림 한 줄 자리(간격 + 실제 알림 높이)를 더해 넘긴다 → 알림이 맵 첫 줄을 가리지 않는다.
 * HUD 아래 끝 + 여백부터 아래 띠 위쪽 끝 − 여백까지. 아래 띠를 재지 못하면(생략·0) `BOTTOM_UI_PX`를 비워 둔다.
 * HUD가 작게 재져도(측정 전 0 등) `HUD_TOP_PX`보다 위로 올리지 않고, 맵 영역이 `MIN_MAP_AREA_PX`보다 작아지게 내리지도 않는다.
 * gameH = 지금 논리 높이 (T-3 가변 높이 1920~2600, 장면의 `this.scale.height`).
 */
export function mapAreaBelowHud(hudBottomPx: number, bottomTopPx?: number, gameH: number = GAME_HEIGHT): Rect {
  const measured = Number.isFinite(hudBottomPx) && hudBottomPx > 0 ? Math.ceil(hudBottomPx) + MAP_TOP_GAP_PX : 0;
  const measuredBottom =
    bottomTopPx !== undefined && Number.isFinite(bottomTopPx) && bottomTopPx > 0 ? Math.floor(bottomTopPx) - MAP_BOTTOM_GAP_PX : 0;
  // 아래 끝: 잰 값 (단, HUD 최소 높이 + 맵 최소 높이보다 위로는 올리지 않음)
  const bottom = measuredBottom > 0 ? Math.min(gameH, Math.max(HUD_TOP_PX + MIN_MAP_AREA_PX, measuredBottom)) : gameH - BOTTOM_UI_PX;
  const maxTop = bottom - MIN_MAP_AREA_PX;
  const y = Math.min(maxTop, Math.max(HUD_TOP_PX, measured));
  return { x: 0, y, w: GAME_WIDTH, h: bottom - y };
}

/** 무대의 CSS px → 기준 px (캔버스가 무대 너비에 맞춰 FIT 되므로 비율 = 1080 / 무대 너비). 무대가 아직 0이면 0. */
export function cssToGamePx(cssPx: number, stageCssWidth: number): number {
  return stageCssWidth > 0 ? (cssPx * GAME_WIDTH) / stageCssWidth : 0;
}

/** 기준 px → 무대의 CSS px. */
export function gameToCssPx(gamePx: number, stageCssWidth: number): number {
  return (gamePx * stageCssWidth) / GAME_WIDTH;
}

/**
 * 맵(격자 + 웨이포인트)이 영역 안에 꽉 차게 들어가는 배치 (가능한 가장 큰 정수 칸, 가운데).
 * 가로·세로 모두 여백 없이 영역을 꽉 채운다 — 시험판 4 맵 B안('칸을 더 키워서 가로를 꽉 채워줘')에서 가로 반 칸 여백을,
 * A-1('원형 맵은 A로: 위아래 여백도 없애줘')에서 세로 반 칸 여백을 없앴다. 알림·아래 띠와의 틈은 영역 쪽(MAP_TOP_GAP_PX·MAP_BOTTOM_GAP_PX)이 둔다.
 * 먼저 차는 축 기준 크기, 남는 축은 가운데 (세로가 먼저 차는 순환의 정원 7×11은 가로 가운데, 가로가 먼저 차는 사거리 미로는 세로 가운데).
 * T-3: 화면이 길쭉해 영역이 커지면 칸도 커진다 — 칸 ↔ 화면 변환은 모두 이 결과(MapLayout)와 아래 함수
 * (`tileCenterPx`·`unitsToPx`·`pxToTile`)로 한다. 1920 같은 높이를 코드에 박지 말 것.
 */
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
  const tile = Math.floor(Math.min(area.w / cols, area.h / rows));
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
