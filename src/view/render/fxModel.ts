/**
 * 연출 계산 (순수 함수, Phaser 없음 → 단위 테스트). DEV_PLAN M2-9, GDD 5.4 '피해 숫자', ART.md 2.4.
 *  - 피해 숫자 색: 물리 흰색, 마법 하늘색, 고정 노란색 (섞이면 가장 큰 쪽 색).
 *  - 돈: 금색 '+n원'.
 *  - 피해 숫자는 0.65초 동안 일정한 속도로 떠오르며 마지막 40%에 사라진다. 동전은 처치 자리에서 살짝 튀어 오른 뒤 HUD 돈 쪽으로 곡선을 그리며 날아간다.
 *  - 같은 자리에 숫자가 몰리면(여러 타워가 한 몹을 동시에 때림) 겹치지 않게 위로 쌓는다 (`stackSlot`). 떠오르는 속도가
 *    모두 같아서(일정 속도) 놓을 때 겹치지 않으면 끝까지 겹치지 않는다. 쌓을 자리가 없으면 그 숫자는 띄우지 않는다.
 */

export const DAMAGE_COLORS = {
  physical: '#FFFFFF',
  magic: '#8FD8FF',
  true: '#FFD84A',
  gold: '#F5B700',
  /** 그림자 암살자 즉사 글자 (M3b) */
  execute: '#FF5A6E',
} as const;

/** 연출을 만드는 대량 사건(공격·피해·처치·헛발)의 범위: 지금 틱에서 이만큼 안쪽 */
export const FX_RECENT_TICKS = 3;

/**
 * 사건 연출 종류 (Game 장면 handleEvents).
 * - 'bulk' (공격·피해·처치·헛발): 지금 틱에서 FX_RECENT_TICKS 안쪽만 → 높은 배속·빨리 감기로 수천 개가 쌓여도 화면이 멈추지 않는다.
 * - 'action' (소환·소환 실패): 사람이 한 행동에 대한 응답 → 이번 프레임에 돈 틱의 사건은 모두 (느린 프레임에 한 번에 4틱 넘게 돌아도).
 *   빨리 감기로 프레임 밖에서 돈 틱의 사건은 최근 것만.
 * - 'rare' (신 강림 알림): 언제나 (0.01%짜리 사건을 연출 없이 버리지 않는다).
 */
export type EventFxKind = 'bulk' | 'action' | 'rare';

/**
 * 사건을 연출할지.
 * @param evTick 사건이 난 틱
 * @param nowTick 지금 틱 (다음에 돌 틱 번호)
 * @param frameStartTick 이번 프레임에 틱을 돌리기 전의 틱 번호 (이 틱부터가 이번 프레임에 돈 틱)
 */
export function eventFxVisible(kind: EventFxKind, evTick: number, nowTick: number, frameStartTick: number): boolean {
  if (kind === 'rare') return true;
  const recent = evTick >= nowTick - FX_RECENT_TICKS;
  if (kind === 'bulk') return recent;
  return recent || evTick >= frameStartTick;
}

/** 피해 숫자 한 개가 떠 있는 시간 (ms) */
export const DAMAGE_TEXT_MS = 650;
/** 동전이 HUD까지 날아가는 시간 (ms) */
export const COIN_FLY_MS = 620;

/** 피해 종류별 값 → 숫자 색 (가장 큰 쪽, 같으면 물리 → 마법 → 고정 순). */
export function damageColor(p: number, m: number, t: number): string {
  if (t > p && t > m) return DAMAGE_COLORS.true;
  if (m > p) return DAMAGE_COLORS.magic;
  return DAMAGE_COLORS.physical;
}

/** 떠오르는 높이 (칸 배수, 끝까지) */
export const FLOAT_RISE_TILES = 0.7;

/**
 * 떠오르는 숫자: 경과 비율 k(0~1) → 위로 이동(칸 배수)·투명도·크기.
 * 이동은 일정 속도: 감속(ease-out)이면 나중에 뜬 숫자가 먼저 뜬 숫자를 따라잡아 겹친다.
 */
export function floatingTextFrame(k: number): { rise: number; alpha: number; scale: number } {
  const c = k < 0 ? 0 : k > 1 ? 1 : k;
  const rise = FLOAT_RISE_TILES * c;
  const alpha = c < 0.6 ? 1 : 1 - (c - 0.6) / 0.4;
  const scale = c < 0.15 ? 0.7 + (0.45 * c) / 0.15 : 1.15 - Math.min(0.15, (c - 0.15) * 0.5);
  return { rise, alpha, scale };
}

/** 동전 위치: 처치 자리 a → HUD 돈 b, 경과 비율 k. 처음에 위로 튀었다가 곡선으로 날아간다 (2차 베지어). */
export function coinPath(a: { x: number; y: number }, b: { x: number; y: number }, k: number, hop: number): { x: number; y: number } {
  const c = k < 0 ? 0 : k > 1 ? 1 : k;
  const e = c * c * (3 - 2 * c); // smoothstep
  const cx = a.x + (b.x - a.x) * 0.15;
  const cy = Math.min(a.y, b.y) - hop;
  const u = 1 - e;
  return { x: u * u * a.x + 2 * u * e * cx + e * e * b.x, y: u * u * a.y + 2 * u * e * cy + e * e * b.y };
}

/** 떠 있는 숫자 상자 (화면 px): 가운데 x, 아래 끝 y, 너비, 높이. */
export interface TextBox {
  cx: number;
  bottom: number;
  w: number;
  h: number;
}

/** 두 상자가 겹치는가 (모서리만 닿으면 겹치지 않음). */
export function boxesOverlap(a: TextBox, b: TextBox): boolean {
  if (Math.abs(a.cx - b.cx) * 2 >= a.w + b.w) return false;
  return a.bottom - a.h < b.bottom && b.bottom - b.h < a.bottom;
}

/**
 * 새 숫자를 놓을 세로 칸: 0 = 원래 자리, k = 상자 높이 k개만큼 위. 지금 떠 있는 숫자들과 겹치지 않는 가장 낮은 칸.
 * maxSlots 칸 안에 빈 곳이 없으면 −1.
 */
export function stackSlot(box: TextBox, others: readonly TextBox[], maxSlots: number): number {
  for (let k = 0; k < maxSlots; k++) {
    const cand: TextBox = { ...box, bottom: box.bottom - k * box.h };
    if (!others.some((o) => boxesOverlap(cand, o))) return k;
  }
  return -1;
}
