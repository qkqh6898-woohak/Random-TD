/**
 * 타워 누르기 → 탭(정보 패널) / 길게 눌러 끌기(이동·교환) 판정 (DEV_PLAN M3-10·M3-11, UI.md 4.3). 순수 함수 (Phaser 없음 → 단위 테스트).
 *
 * - 타워 칸을 눌렀다 0.3초 안에 떼면 '탭' → 정보 패널 (UI.md 4.3 '타워 터치').
 * - 0.3초 동안 누르고 있으면 '끌기' 시작 → 손가락을 따라 타워가 들리고 놓을 칸을 미리 보여준다
 *   (놓을 수 있는 빈 칸 = 초록, 교환 = 파랑, 못 놓는 칸 = 빨강). 손을 떼면 그 칸으로 move 명령.
 * - 0.3초가 되기 전에 손가락이 0.3칸보다 많이 움직이면 탭도 끌기도 아니다 (취소).
 * - 승급 직후 0.3초는 맵 입력을 받지 않는다 (UI.md 9장 '승급 연출 중 다시 터치').
 * 빈 배치 칸은 M2처럼 누르는 즉시 소환한다 (누르기 판정과 무관).
 *
 * 놓을 칸 (검토 반영): 처음 누른 자리가 칸의 어디든(캐릭터 얼굴·머리 포함) 손가락이 움직인 만큼만 타워가 움직인다
 *   → 놓을 칸 = 원래 칸 중심 + (지금 손가락 − 처음 누른 자리). 0.45칸 들어 올림은 그려지는 그림에만 준다.
 *   그래서 길게 누른 뒤 움직이지 않고 떼면 제자리('none')이고, 그때는 느린 탭으로 보고 정보 패널을 연다.
 */
import type { MoveCheck } from '../../sim/systems/Move';
import { FOOT_OFFSET_TILES } from '../render/towerGeom';

/** 길게 누르기 시간 (ms) — UI.md 4.3 '타워 길게 누르기 (0.3초)' */
export const LONG_PRESS_MS = 300;
/** 길게 누르기 전에 이만큼(칸) 넘게 움직이면 취소 */
export const PRESS_SLOP_TILES = 0.3;
/** 승급 뒤 입력을 무시하는 시간 (ms) — UI.md 9장 '승급 연출 0.3초' */
export const MERGE_INPUT_LOCK_MS = 300;
/** 끌 때 타워 그림을 손가락보다 얼마나 위에 띄우는가 (칸) — 손가락에 가려지지 않게 */
export const DRAG_LIFT_TILES = 0.45;

export type PressPhase = 'pending' | 'drag' | 'cancel';

/**
 * 누르고 있는 동안의 단계.
 * @param heldMs 누른 뒤 흐른 시간
 * @param movedPx 처음 누른 자리에서 움직인 거리 (화면 px)
 * @param tilePx 칸 크기 (화면 px)
 * @param dragging 이미 끌기 중인가 (끌기가 시작되면 움직여도 취소되지 않는다)
 */
export function pressPhase(heldMs: number, movedPx: number, tilePx: number, dragging: boolean): PressPhase {
  if (dragging) return 'drag';
  if (movedPx > tilePx * PRESS_SLOP_TILES) return 'cancel';
  return heldMs >= LONG_PRESS_MS ? 'drag' : 'pending';
}

/** 손을 뗐을 때: 끌기 중이 아니고 취소되지 않았으면 탭. */
export function isTap(heldMs: number, movedPx: number, tilePx: number): boolean {
  return pressPhase(heldMs, movedPx, tilePx, false) === 'pending';
}

interface Pt {
  x: number;
  y: number;
}

/** 끄는 중 노리는 점 (놓을 칸을 정한다) = 원래 칸 중심 + 손가락이 움직인 만큼. */
export function dragAim(tileCenter: Pt, down: Pt, finger: Pt): Pt {
  return { x: tileCenter.x + (finger.x - down.x), y: tileCenter.y + (finger.y - down.y) };
}

/** 끄는 중 타워 그림의 발밑 = 노리는 점에서 0.45칸 들어 올린 자리 (손가락에 가려지지 않게). */
export function dragFootPx(aim: Pt, tilePx: number): Pt {
  return { x: aim.x, y: aim.y + tilePx * (FOOT_OFFSET_TILES - DRAG_LIFT_TILES) };
}

/** 끌기를 놓았을 때: 옮김(move·swap) / 느린 탭(제자리에서 거의 안 움직임 → 정보 패널) / 아무것도 안 함. */
export function releaseAction(preview: DropPreview | null, movedPx: number, tilePx: number): 'move' | 'tap' | 'none' {
  if (preview === 'move' || preview === 'swap') return 'move';
  if (preview === 'none' && movedPx <= tilePx * PRESS_SLOP_TILES) return 'tap';
  return 'none';
}

/** 끄는 중 놓을 칸 미리 보기: move = 빈 칸으로 이동(초록), swap = 교환(파랑), invalid = 못 놓음(빨강), none = 제자리(표시 없음). */
export type DropPreview = 'move' | 'swap' | 'invalid' | 'none';

/** moveCheck 결과 → 미리 보기 색. */
export function dropPreview(check: MoveCheck): DropPreview {
  if (check.ok) return check.other ? 'swap' : 'move';
  return check.reason === 'same' ? 'none' : 'invalid';
}

/** 미리 보기 색 (0xRRGGBB). */
export const DROP_COLORS: Readonly<Record<Exclude<DropPreview, 'none'>, number>> = Object.freeze({
  move: 0x43d17a,
  swap: 0x4aa3ff,
  invalid: 0xe53935,
});

/** 입력 잠금 중인가 (승급 직후). */
export function inputLocked(lockUntilMs: number | null, nowMs: number): boolean {
  return lockUntilMs !== null && nowMs < lockUntilMs;
}
