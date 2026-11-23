/**
 * V3 진행도 규칙 (P0 사양 — docs/v3/p0-spec.md). 순수 함수: 저장소·화면·Date와 무관하다.
 *
 * - **완료 웨이브**: 끝난 웨이브 수. 승리(캠페인 마지막 단계를 버팀)면 도달 단계, 아니면 도달 단계 − 1
 *   (도달한 웨이브는 끝나지 않았다 — 9웨이브 보스에게 졌으면 완료 8, 10웨이브 보스에게 졌으면 완료 9).
 *   업데이트로 버린 진행 중 판도 같은 규칙(도달 − 1)으로 센다.
 * - **유효 전투**: 치트 없는 판(dev = false)이고 완료 웨이브 ≥ explore.minCompletedWaves.
 * - **보급**: 유효 전투의 완료 웨이브를 누적해 wavesPerSupply마다 1개, 나머지는 보존(다음 유효 전투에 더함).
 *   유효 전투가 아닌 판은 나머지에도 더하지 않는다 (9웨이브 판 = 기존 정산만).
 * - **성장 선택**: 보급 supplyPerChoice개마다 1회 (나머지 보존).
 * - **탐험 도장**: 유효 전투 1판 = 1칸 (하루 제한·연속 출석·기한 없음). 칸은 회차를 넘어 누적, 받기는 순서대로.
 * - **진행도 패스**: 유효 전투의 완료 웨이브 wavesPerCell마다 1칸, 시즌당 cells칸. 넘친 웨이브는 다음 시즌으로 이월.
 *
 * 날짜·시계는 어떤 값에도 들어가지 않는다 → 시계를 바꿔도 결과가 같다 (테스트로 확인).
 * 같은 판을 두 번 정산하지 않는 것은 부르는 쪽(settleMatch의 runId 장부 rewardedRuns)이 맡는다 — 이 함수는 한 번 부르면 한 번 더한다.
 */
import type { V3Data } from '../progressionData';

/** 정산 입력 중 V3가 읽는 값 */
export interface ExploreInput {
  /** 도달 단계 (= 웨이브) */
  stage: number;
  /** 캠페인 마지막 단계를 버텼는가 */
  victory?: boolean;
  /** 이미 센 완료 웨이브 (있으면 그대로) */
  completedWaves?: number;
  dev?: boolean;
}

/** V3 탐험 진행 (계정 저장 rtd.progress의 v3.explore) */
export interface ExploreState {
  /** 유효 전투 누적 */
  battles: number;
  /** 유효 전투 완료 웨이브 누적 */
  waves: number;
  /** 보급 진행 나머지 (0 ~ wavesPerSupply − 1) */
  supplyRest: number;
  /** 만든 보급 누적 */
  supplyTotal: number;
  /** 성장 선택 진행 나머지 (0 ~ supplyPerChoice − 1) */
  choiceRest: number;
  /** 아직 고르지 않은 성장 선택 */
  choicesReady: number;
  /** 고른 성장 선택 누적 */
  choicesTaken: number;
}

export function newExploreState(): ExploreState {
  return { battles: 0, waves: 0, supplyRest: 0, supplyTotal: 0, choiceRest: 0, choicesReady: 0, choicesTaken: 0 };
}

const nn = (v: unknown): number => (Number.isSafeInteger(v) && (v as number) >= 0 ? (v as number) : 0);

/** 저장 값 → 상태 (모르는·틀린 필드는 0). 나머지는 지금 데이터의 범위로 자른다 */
export function parseExploreState(raw: unknown, data: V3Data): ExploreState {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof ExploreState, unknown>>;
  return {
    battles: nn(o.battles),
    waves: nn(o.waves),
    supplyRest: Math.min(nn(o.supplyRest), data.explore.wavesPerSupply - 1),
    supplyTotal: nn(o.supplyTotal),
    choiceRest: Math.min(nn(o.choiceRest), data.explore.supplyPerChoice - 1),
    choicesReady: nn(o.choicesReady),
    choicesTaken: nn(o.choicesTaken),
  };
}

/** 완료 웨이브 (위 규칙). completedWaves가 이미 있으면 그 값 */
export function completedWaves(r: ExploreInput): number {
  if (Number.isSafeInteger(r.completedWaves) && (r.completedWaves as number) >= 0) return r.completedWaves as number;
  const stage = Math.max(0, Math.trunc(r.stage));
  return r.victory ? stage : Math.max(0, stage - 1);
}

/** 유효 전투인가 */
export function isEffectiveBattle(r: ExploreInput, data: V3Data): boolean {
  return r.dev !== true && completedWaves(r) >= data.explore.minCompletedWaves;
}

/** 한 판이 더한 것 (정산 화면 요약) */
export interface ExploreGain {
  effective: boolean;
  completed: number;
  /** 이번 판에 만든 보급 */
  supplies: number;
  /** 정산 뒤 보급 나머지 */
  supplyRest: number;
  /** 이번 판에 생긴 성장 선택 */
  choices: number;
  /** 다음 보급까지 남은 완료 웨이브 */
  toNextSupply: number;
  /** 다음 성장 선택까지 남은 보급 */
  toNextChoice: number;
}

/** 보급 나머지 + 완료 웨이브 → (보급 수, 새 나머지). 순수 산술 (경계 테스트용) */
export function supplyFromWaves(rest: number, completed: number, wavesPerSupply: number): { supplies: number; rest: number } {
  const total = rest + Math.max(0, completed);
  return { supplies: Math.floor(total / wavesPerSupply), rest: total % wavesPerSupply };
}

/**
 * 유효 전투 한 판을 탐험 진행에 더한다 (상태를 바꾼다). 유효 전투가 아니면 아무것도 바꾸지 않고 effective false.
 * 보급의 실제 지급(열쇠·목표 조각 — P2 정산 / P3 보급 상자)은 부르는 쪽이 gain.supplies로 한 번만 한다.
 */
export function addExplore(state: ExploreState, r: ExploreInput, data: V3Data): ExploreGain {
  const completed = completedWaves(r);
  const e = data.explore;
  if (!isEffectiveBattle(r, data)) {
    return { effective: false, completed, supplies: 0, supplyRest: state.supplyRest, choices: 0, toNextSupply: e.wavesPerSupply - state.supplyRest, toNextChoice: e.supplyPerChoice - state.choiceRest };
  }
  state.battles += 1;
  state.waves += completed;
  const s = supplyFromWaves(state.supplyRest, completed, e.wavesPerSupply);
  state.supplyRest = s.rest;
  state.supplyTotal += s.supplies;
  const c = supplyFromWaves(state.choiceRest, s.supplies, e.supplyPerChoice);
  state.choiceRest = c.rest;
  state.choicesReady += c.supplies;
  return {
    effective: true,
    completed,
    supplies: s.supplies,
    supplyRest: s.rest,
    choices: c.supplies,
    toNextSupply: e.wavesPerSupply - s.rest,
    toNextChoice: e.supplyPerChoice - c.rest,
  };
}

// ---------------------------------------------------------------------------
// 탐험 도장 (칸 = 유효 전투 1판, 회차를 넘어 누적, 받기는 순서대로)
// ---------------------------------------------------------------------------

export interface StampState {
  /** 채운 칸 누적 (모든 회차) */
  filled: number;
  /** 받은 칸 누적 (≤ filled, 앞에서부터) */
  claimed: number;
}

export interface StampView {
  /** 지금 보여 줄 회차 (1부터) — 받지 않은 칸이 남은 가장 이른 회차 */
  round: number;
  /** 이번 회차에서 채운 칸 (0 ~ cells) */
  filled: number;
  /** 이번 회차에서 받은 칸 */
  claimed: number;
  /** 받을 수 있는 칸 (모든 회차) */
  ready: number;
}

export function stampView(st: StampState, cells: number): StampView {
  const round = Math.floor(st.claimed / cells) + 1;
  const start = (round - 1) * cells;
  return { round, filled: Math.min(cells, Math.max(0, st.filled - start)), claimed: st.claimed - start, ready: Math.max(0, st.filled - st.claimed) };
}

/** 칸 k(0부터, 모든 회차 누적)의 보상 번호 (rewards 순번) */
export function stampRewardIndex(k: number, cells: number): number {
  return k % cells;
}

// ---------------------------------------------------------------------------
// 진행도 패스 (칸 = 유효 전투 완료 웨이브 wavesPerCell, 시즌당 cells칸)
// ---------------------------------------------------------------------------

export interface PassState {
  /** 시즌 번호 (1부터) */
  season: number;
  /** 이번 시즌에 쌓인 완료 웨이브 (넘친 값은 다음 시즌으로 이월) */
  waves: number;
  /** 받은 무료 칸 수 (앞에서부터) */
  freeClaimed: number;
  /** 이번 시즌 황금 트랙을 열었는가 */
  golden: boolean;
  /** 받은 황금 칸 수 */
  goldenClaimed: number;
  /** 끝낸 시즌 기록 (번호 — 지난 시즌 장부) */
  history: number[];
}

export function passCells(st: Pick<PassState, 'waves'>, data: V3Data): number {
  return Math.min(data.pass.cells, Math.floor(st.waves / data.pass.wavesPerCell));
}

/** 이번 시즌을 모두 채웠는가 (다음 시즌으로 넘길 수 있음 — 미수령은 넘기기 전에 받는다) */
export function passComplete(st: Pick<PassState, 'waves'>, data: V3Data): boolean {
  return passCells(st, data) >= data.pass.cells;
}
