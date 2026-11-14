/**
 * 판 상태(MatchState)와 시스템이 함께 쓰는 문맥(MatchContext).
 *
 * MatchState는 World.state에 들어가 해시된다 → 정수·문자열·불리언과 그 배열만 쓴다.
 * 규칙 수치(MatchRules)·맵(SimMap)은 데이터에서 만든 고정 값이라 해시에 넣지 않는다.
 */
import type { SimMap } from './map';
import type { Deck, MatchRules, ThemeMods } from './rules';
import type { PlayerMods } from './stats';

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
  /** 지금까지 소환한 횟수 */
  summons: number;
  /** 지금까지 처치한 몹 수 */
  kills: number;
  /** 지금까지 승급한 횟수 (모두 승급은 승급마다 1) */
  merges: number;
  /** 지금까지 이동·교환한 횟수 */
  moves: number;
  /** 플레이어별 판 내 능력치 보정 (공격력%·공속%·관통·치명타 …, stats.ts). 판 내 강화·카드가 더한다 */
  mods: PlayerMods[];
  /** 지금까지 번 돈 (처치 보상 등, 시작 자금 제외) */
  goldEarned: number;
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
  /** 개발용 치트를 들어 주는 판인가 (?debug=1) */
  debug: boolean;
  /** 치트를 한 번이라도 썼는가 (저장·기록에 표시) */
  debugUsed: boolean;
}

/** 시스템이 함께 쓰는 문맥. */
export interface MatchContext {
  readonly rules: MatchRules;
  readonly map: SimMap;
  readonly theme: ThemeMods;
  readonly state: MatchState;
  /** 플레이어별 덱 (판 시작 때 정해져 바뀌지 않는다 → 해시 밖. 리플레이는 시드와 함께 덱을 기록한다) */
  readonly decks: readonly Deck[];
}
