/**
 * 도박 슬롯 연출 (GDD 7.2 '슬롯 연출 1초', 화면 전용 — 결과는 sim이 이미 정했다).
 * 누르면 릴이 배율을 빠르게 돌다가 1초 뒤(결과 사건이 늦으면 그때) 결과에서 멈춘다. 순수 계산이라 단위 테스트한다.
 */

/** 슬롯이 도는 시간 (ms) */
export const SLOT_SPIN_MS = 1000;
/** 릴 글자가 바뀌는 간격 (ms) */
export const SLOT_STEP_MS = 70;

export interface SlotResult {
  /** 배율 글자 '×2' */
  mul: string;
  mulBp: number;
  win: number;
  /** 테이블 비용 (결과 글자의 손익) */
  cost: number;
  jackpot: boolean;
}

export interface SlotState {
  startMs: number;
  /** 결과 (명령이 실행되어 사건이 오면) */
  result: SlotResult | null;
  /** 결과를 보여 준 시각 (한 번만 알림·동전을 내려고) */
  revealedMs: number | null;
}

export interface SlotFrame {
  /** 릴에 보일 글자 */
  reel: string;
  spinning: boolean;
  /** 이번 프레임에 처음 멈췄다 (알림·동전·'+n원'을 낼 때) */
  justRevealed: boolean;
}

/** 지금 릴 글자: 도는 동안은 배율 목록을 차례로, 1초가 지나고 결과가 있으면 결과. 결과가 아직 없으면 계속 돈다. */
export function slotFrame(s: SlotState, nowMs: number, symbols: readonly string[]): SlotFrame {
  const elapsed = nowMs - s.startMs;
  if (s.result && elapsed >= SLOT_SPIN_MS) {
    return { reel: s.result.mul, spinning: false, justRevealed: s.revealedMs === null };
  }
  const n = symbols.length;
  const i = n > 0 ? Math.floor(Math.max(0, elapsed) / SLOT_STEP_MS) % n : 0;
  return { reel: symbols[i] ?? '?', spinning: true, justRevealed: false };
}
