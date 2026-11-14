/**
 * 판 상태(MatchState)와 시스템이 함께 쓰는 문맥(MatchContext).
 *
 * MatchState는 World.state에 들어가 해시된다 → 정수·문자열·불리언과 그 배열만 쓴다.
 * 규칙 수치(MatchRules)·맵(SimMap)은 데이터에서 만든 고정 값이라 해시에 넣지 않는다.
 */
import type { SimMap } from './map';
import type { MatchRules, ThemeMods } from './rules';

export type MatchMode = 'infinite' | 'campaign';
export type MatchPhase = 'playing' | 'defeat';
/** 패배 이유: 무한 = 몹 수 초과, 캠페인 = 목숨 0 */
export type DefeatReason = '' | 'mobLimit' | 'lives';

export interface MatchState {
  mode: MatchMode;
  /** 캠페인 테마 번호 (무한 모드 0) */
  theme: number;
  mapId: string;
  /** 지금 단계 (0 = 준비) */
  stage: number;
  /** 지금 단계가 시작된 틱 */
  stageStartTick: number;
  /** 다음 단계가 시작될 틱 */
  nextStageTick: number;
  /** 마지막 단계 (캠페인 50, 무한 0 = 끝없음). 마지막 단계 다음으로는 넘어가지 않는다 */
  lastStage: number;
  /** 지금 단계가 보스 단계인가 (보스 등장은 M4, 지금은 표시만) */
  bossStage: boolean;
  gold: number;
  /** 캠페인 목숨 (무한 모드 0) */
  lives: number;
  maxLives: number;
  /** 무한 모드 몹 한도 (캠페인 0). 이 수를 넘으면 패배 (150 = 생존, 151 = 패배) */
  mobLimit: number;
  /** 출구에 닿은 몹 수 (캠페인) */
  leaked: number;
  /** 지금까지 나온 몹 수 (떼는 마리 수로) */
  spawned: number;
  phase: MatchPhase;
  defeatReason: DefeatReason;
  /** 패배한 틱 (-1 = 아직) */
  defeatTick: number;
  /** 등장 대기열: 이번 단계에 아직 안 나온 칸 (몹 id). spawnNext부터 나온다 */
  spawnQueue: string[];
  spawnNext: number;
  /** 다음 칸이 나올 틱 */
  spawnNextTick: number;
  /** 대기열을 만든 단계 (단계가 바뀌면 새로 만든다) */
  spawnStage: number;
}

/** 시스템이 함께 쓰는 문맥. */
export interface MatchContext {
  readonly rules: MatchRules;
  readonly map: SimMap;
  readonly theme: ThemeMods;
  readonly state: MatchState;
}
