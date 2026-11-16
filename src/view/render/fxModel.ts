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
  /** 치유사·망령 군주 회복 숫자 (M4, ENEMIES.md 6장 '회복량 숫자 초록색') */
  heal: '#7EE08A',
  /** 유령 회피 '빗나감' (M4) */
  evade: '#C9C3B4',
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

/**
 * 배속별 연출 한도 (T-1, 화면 전용 — sim과 무관). 한 프레임에 만드는 피해 숫자·맞음 불꽃·광역 연출·동전 수와 동시에 떠 있는 숫자 수.
 * - ×3까지(일반 모드가 쓸 수 있는 배속)는 예전 값 그대로: 숫자 16개/프레임(치명타는 늘), 불꽃 12, 광역 8, 동전 제한 없음.
 * - ×4부터(개발자 배속)는 줄이고, 피해 숫자는 이번 프레임의 큰 피해부터 고른다(작은 숫자는 건너뜀, 치명타도 크기로만).
 *   한도를 넘은 처치·특색 돈은 동전·'+n원' 없이 HUD 돈에 바로 더한다 (돈 표시는 sim 값이라 그대로 맞다).
 */
export interface FxBudget {
  /** 한 프레임에 띄우는 피해 숫자 */
  damageTexts: number;
  /** true = 치명타는 한도와 상관없이 (예전 방식), false = 큰 피해부터 한도만큼 */
  forceCrit: boolean;
  /** 동시에 떠 있는 숫자 최대 */
  activeTexts: number;
  sparks: number;
  areaFx: number;
  /** 한 프레임에 날리는 동전(+ '+n원') 최대 */
  coins: number;
}

export const FX_BUDGET_NORMAL: FxBudget = Object.freeze({ damageTexts: 16, forceCrit: true, activeTexts: 48, sparks: 12, areaFx: 8, coins: Number.POSITIVE_INFINITY });

export function fxBudget(speed: number): FxBudget {
  if (speed <= 3) return FX_BUDGET_NORMAL;
  if (speed < 8) return { damageTexts: 4, forceCrit: false, activeTexts: 24, sparks: 6, areaFx: 4, coins: 4 };
  if (speed < 16) return { damageTexts: 3, forceCrit: false, activeTexts: 16, sparks: 4, areaFx: 3, coins: 3 };
  return { damageTexts: 2, forceCrit: false, activeTexts: 12, sparks: 3, areaFx: 2, coins: 2 };
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

/**
 * 큰 글자(돈 +n원·즉사!·치명타)를 놓을 칸 — stackSlot으로 빈 칸을 못 찾았을 때 (검토 반영: 예전엔 0칸에 강제로 놓아
 * 피해 숫자·처치 돈 밑에 '즉사!'가 묻혔다). 다른 **큰 글자**와 겹치지 않는 가장 낮은 칸을 고르고, 그 자리를 가리는
 * 작은 피해 숫자는 지운다 (drop = others 번호). 큰 글자로 maxSlots 칸이 다 차 있으면 0칸 (작은 숫자만 지움).
 */
export function bigTextSlot(box: TextBox, others: readonly { box: TextBox; big: boolean }[], maxSlots: number): { slot: number; drop: number[] } {
  let slot = stackSlot(
    box,
    others.filter((o) => o.big).map((o) => o.box),
    maxSlots,
  );
  if (slot < 0) slot = 0;
  const cand: TextBox = { ...box, bottom: box.bottom - slot * box.h };
  const drop: number[] = [];
  others.forEach((o, i) => {
    if (!o.big && boxesOverlap(cand, o.box)) drop.push(i);
  });
  return { slot, drop };
}

/** 소환·승급 주사위가 굴러가는 동안 나눠 보이는 눈 수 (마지막 칸은 결과 눈) */
export const DIE_ROLL_STEPS = 8;

/**
 * 굴러가는 주사위 눈 (B-1): 트윈 진행도 0~1 → 1~6. 처음 7칸은 결과 눈 다음부터 한 칸씩 돌고, 마지막 칸(과 끝)은 결과 눈.
 * 화면 전용 (sim과 무관, 난수 없음).
 */
export function rollingDieFace(progress: number, revealed: number): number {
  const turn = Math.floor(Math.min(1, Math.max(0, progress)) * DIE_ROLL_STEPS);
  return turn < DIE_ROLL_STEPS - 1 ? 1 + ((revealed + turn) % 6) : revealed;
}
