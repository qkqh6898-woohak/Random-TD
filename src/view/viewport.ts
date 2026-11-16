/**
 * 화면 꽉 차게 (T-3, 순수 계산 — Phaser·DOM 없음 → 단위 테스트).
 *
 * - 논리 가로는 1080 고정, 논리 세로 = clamp(round(1080 × 화면 높이 / 화면 너비), 1920, 2600).
 *   → 휴대폰(9:16보다 길쭉)에서는 캔버스·DOM 무대가 화면을 빈 띠 없이 꽉 채운다 (412×915 → 1080×2399).
 * - 9:16보다 넓은 화면(태블릿·PC): 1080×1920을 가운데에 두고 양옆 띠는 흐린 배경 그림으로 채운다 (CSS #app::before).
 * - 2600보다 더 길쭉한 화면: 1080×2600을 가운데에 두고 위아래 띠를 같은 배경으로 채운다.
 * DOM 무대(#stage)는 이 CSS 크기, Phaser 게임 크기는 (gameW, gameH). 둘의 비율이 같아 Scale.FIT 캔버스가 무대를 정확히 덮는다.
 */
import { GAME_HEIGHT, GAME_MAX_HEIGHT, GAME_MIN_HEIGHT, GAME_WIDTH } from './config';

export interface StageFit {
  /** 논리(기준 px) 크기 = Phaser 게임 크기 */
  gameW: number;
  gameH: number;
  /** 무대 CSS px 크기 */
  cssW: number;
  cssH: number;
  /** 화면 안 무대 왼쪽 위 (CSS px, 가운데 정렬) */
  left: number;
  top: number;
  /** 무대가 화면 전체를 덮는가 (빈 띠 없음) */
  full: boolean;
}

/** 화면 (CSS px) → 논리 높이. 크기를 모르면(0) 기준 1920. */
export function logicalHeight(vw: number, vh: number): number {
  if (!(vw > 0) || !(vh > 0)) return GAME_HEIGHT;
  const raw = Math.round((GAME_WIDTH * vh) / vw);
  return Math.min(GAME_MAX_HEIGHT, Math.max(GAME_MIN_HEIGHT, raw));
}

/**
 * 화면 (CSS px) → 무대 배치. 비율을 지켜 가운데에 맞추되, 남는 띠가 1px 미만이면(보통 휴대폰) 무대 = 화면 그대로
 * (반올림 몫 0.1px도 띠로 남기지 않음).
 */
export function fitStage(vw: number, vh: number): StageFit {
  const gameH = logicalHeight(vw, vh);
  if (!(vw > 0) || !(vh > 0)) return { gameW: GAME_WIDTH, gameH, cssW: 0, cssH: 0, left: 0, top: 0, full: false };
  const s = Math.min(vw / GAME_WIDTH, vh / gameH);
  const cssW = GAME_WIDTH * s;
  const cssH = gameH * s;
  // 1px도 안 되는 띠(반올림·자르기 몫, 예: 412×732 → 1919를 1920으로)는 남기지 않는다
  if (vw - cssW < 1 && vh - cssH < 1) return { gameW: GAME_WIDTH, gameH, cssW: vw, cssH: vh, left: 0, top: 0, full: true };
  return { gameW: GAME_WIDTH, gameH, cssW, cssH, left: (vw - cssW) / 2, top: (vh - cssH) / 2, full: false };
}
