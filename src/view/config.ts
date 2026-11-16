/**
 * 화면 기준값 (CLAUDE.md 1장: 세로 9:16, 기준 1080×1920).
 * T-3 '화면 꽉 차게': 가로는 1080 고정, 세로는 화면 비율대로 GAME_MIN_HEIGHT~GAME_MAX_HEIGHT (viewport.ts `fitStage`).
 * GAME_HEIGHT(1920)는 기준·최소 높이다 — 지금 높이는 장면의 `this.scale.height`로 읽는다.
 */
export const GAME_WIDTH = 1080;
export const GAME_HEIGHT = 1920;
/** 가변 높이 하한 (9:16) */
export const GAME_MIN_HEIGHT = 1920;
/** 가변 높이 상한 (약 1:2.4 — 이보다 길쭉한 화면은 위아래에 배경 띠) */
export const GAME_MAX_HEIGHT = 2600;

export const SCENE_BOOT = 'Boot';
export const SCENE_GAME = 'Game';

/** Phaser 글자용 글꼴 (웹 글꼴 다운로드 없음). */
export const FONT_FAMILY = '-apple-system, "Noto Sans KR", "Malgun Gothic", sans-serif';
