/**
 * 맵 위 타워 그림의 크기·위치 (순수 계산, Phaser 없음 → 단위 테스트). TowerSprite와 탭 판정(input/tap.ts)이 같이 쓴다.
 *
 * 기존 1.1칸 그림을 전투에서 확대한다. 머리·헬멧·별이 위 칸으로 올라가도 소환 칸 가운데는 터치할 수 있다.
 */
import { CHIBI_BOUNDS, PEDESTAL_BOUNDS } from '../../art/chibiBounds';

/** 캐릭터 높이 (칸 배수) */
export const FIGURE_TILES = 1.1;
/**
 * 전투 화면 확대 배율 (v0.1.17, 사용자 '혼자 있는 신·리미티드도 최대 크기' · 피드백 #36·#66 '주변 유닛 유무에 따라 크기가 변하는 것 없애기'):
 * 예전엔 혼자 ×2 · 이웃이 있으면 ×1.4라 이웃이 생기거나 팔릴 때마다 크기가 바뀌었고, 혼자 있는 리미티드(등급 배율 1.5)는 ×3 = 칸 약 2.8개 너비였다.
 * 이제 이웃과 무관하게 등급 배율(characterLooks scale, 노말 0.7 ~ 리미티드 1.5)로만 정한다:
 *   배율 ≤ 1 (노말·레어·유니크) → ×BATTLE_FIGURE_SCALE(1.4), 1을 넘는 부분(히어로 이상)은 FIGURE_TOP_SLOPE(0.7)배로만 커진다
 *   → 노말 ≈0.98 · 레어 ≈1.15 · 유니크 ≈1.32 · 히어로 ≈1.44 · 레전드 ≈1.53 · 신 ≈1.64 · 리미티드 ≈1.75 (등급 순서 그대로, 리미티드 반폭 ≈0.8칸).
 */
export const BATTLE_FIGURE_SCALE = 1.4;
export const FIGURE_TOP_SLOPE = 0.7;
/** 등급 배율(looks scale) → 전투 그림 배율 (이웃·무더기·HUD 여백 전) */
export function figureArtScale(lookScale: number): number {
  return lookScale <= 1 ? lookScale * BATTLE_FIGURE_SCALE : BATTLE_FIGURE_SCALE + (lookScale - 1) * FIGURE_TOP_SLOPE;
}
/** 발밑 위치: 칸 중심에서 아래로 (칸 배수) */
export const FOOT_OFFSET_TILES = 0.3;

/** 캐릭터 맨 위 (별 포함): 칸 중심 기준 칸 배수 (음수 = 위). ≈ −0.776 */
export const FIGURE_TOP_TILES = FOOT_OFFSET_TILES + (FIGURE_TILES * CHIBI_BOUNDS.top) / (CHIBI_BOUNDS.bottom - CHIBI_BOUNDS.top);

/** 받침대 너비 (칸 배수) */
export const PEDESTAL_WIDTH_TILES = 0.78;

/**
 * 별 배지 (발밑 기준 칸 배수): 가운데 높이 · 너비. 피드백 #22 '별을 조금 더 크게' → 디자인 PR #54(FB-D1 #22) 값 너비 0.56 → 0.72칸(약 29%),
 * 가운데 높이 0.15 그대로 (v0.1.14 통합: 피드백 PR #32의 0.64·0.14는 같은 일을 겹쳐 하므로 디자인 값을 쓴다).
 */
export const STAR_BADGE_Y_TILES = 0.15;
export const STAR_BADGE_W_TILES = 0.72;

/** 받침대 맨 아래: 칸 중심 기준 칸 배수 (발밑 + 받침대 아래 두께). ≈ +0.475 */
export const FIGURE_BOTTOM_TILES = FOOT_OFFSET_TILES + (PEDESTAL_WIDTH_TILES * PEDESTAL_BOUNDS.bottom) / (PEDESTAL_BOUNDS.right - PEDESTAL_BOUNDS.left);

/**
 * G-2 받침대 너비 배수: 2배 캐릭터 발밑에 가려 등급 받침대가 안 보이던 것 → 그림 크기를 조금 따라 키운다 (붙어 있으면 작게).
 * 0.85~1.22배 × 0.78칸 — 2배 그림이면 약 0.94칸(칸 안), 1.4배(붙음)면 약 0.66칸.
 * 받침대 아래 끝은 1.22배여도 칸 중심 +0.51칸(칸 아래 경계 +0.5에서 0.01칸) — 탭 판정은 칸 그대로라 영향 없음.
 */
export function pedestalScaleFor(artScale: number): number {
  return Math.min(1.22, Math.max(0.85, artScale * 0.6));
}

/** 대기 동작(위아래 흔들림·숨쉬기·고유 동작 뜀·등장 넘침)으로 더 올라가는 여유 (칸 배수) */
export const FIGURE_MOTION_MARGIN_TILES = 0.06;
const HEAD_ABOVE_FOOT_TILES = FOOT_OFFSET_TILES - FIGURE_TOP_TILES + FIGURE_MOTION_MARGIN_TILES;

/** 위 칸으로 삐져나온 머리 부분의 가로 반폭 (칸 배수): 머리(반지름 62)·별·두건 ≈ 0.28칸 + 여유 */
export const HEAD_HALF_WIDTH_TILES = 0.34;

/**
 * 전투 그림 배율: 등급 배율로 정한 크기(figureArtScale)를 HUD 앞에서만 줄인다. headroom = 발밑에서 HUD 아래까지의 거리 (칸).
 * 이웃 유무(_crowded)는 v0.1.17부터 크기에 쓰지 않는다 (피드백 #36·#66) — 호출 쪽 호환을 위해 인자만 남긴다.
 */
export function battleFigureScale(lookScale: number, _crowded: boolean, headroom: number): number {
  return Math.min(figureArtScale(lookScale), Math.max(lookScale, headroom / HEAD_ABOVE_FOOT_TILES));
}

/**
 * 타워 그림 전체(머리·별 + 대기 동작 여유 ~ 받침대 아래)의 세로 범위: 칸 중심 기준 칸 배수 — 정보 패널이 가리지 않게.
 * @param scale 캐릭터별 크기 배수 (HF-2, looks scale): 발밑에서 위로 그만큼 커진다
 */
export function towerFigureSpanTiles(scale = 1): { top: number; bottom: number } {
  return { top: FOOT_OFFSET_TILES - HEAD_ABOVE_FOOT_TILES * scale, bottom: FIGURE_BOTTOM_TILES };
}

/**
 * 이웃 붙음 판정 (B-1, 검토 반영 — TowerLayer.sync·expectedScale이 같이 쓴다): 위·아래·왼쪽·오른쪽 칸에 다른 타워가 있으면 붙음 (대각선은 아님).
 * 열 수 + 2를 한 줄 간격으로 써서 한 줄 끝(tx = cols−1)과 다음 줄 시작(tx = 0)이 이웃으로 잡히지 않게 한다.
 */
export function occupancyKey(tx: number, ty: number, cols: number): number {
  return ty * (cols + 2) + tx;
}

/** 타워 칸 목록을 out에 채운다 (매 프레임 같은 Set을 다시 쓴다). */
export function fillOccupancy(out: Set<number>, towers: readonly { tx: number; ty: number }[], cols: number): Set<number> {
  out.clear();
  for (const t of towers) out.add(occupancyKey(t.tx, t.ty, cols));
  return out;
}

export function isCrowded(occupied: ReadonlySet<number>, tx: number, ty: number, cols: number): boolean {
  const key = occupancyKey(tx, ty, cols);
  const stride = cols + 2;
  return occupied.has(key - 1) || occupied.has(key + 1) || occupied.has(key - stride) || occupied.has(key + stride);
}

/** 소환·승급 초상 카드 가운데가 머리 끝보다 더 올라가 멈추는 높이 (칸 배수, G-2 — 소환 카드 절반 높이 ≈ 0.52칸이라 아래 끝이 머리 끝에 살짝 걸친다) */
export const CARD_ABOVE_HEAD_TILES = 0.42;

/**
 * 소환·승급 초상 카드가 떠올라 멈추는 자리: 칸 중심 기준 칸 배수 (음수 = 위).
 * B-1: 캐릭터가 2배로 커져 예전 높이(−0.94칸)에서는 머리 위 연출이 얼굴을 가렸다 → 지금 그림 크기의 머리 끝 위로 (G-2: 주사위 → 카드).
 */
export function cardApexTiles(scale = 1): number {
  return towerFigureSpanTiles(scale).top - CARD_ABOVE_HEAD_TILES;
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
