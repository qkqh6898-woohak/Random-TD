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
/** 패배 이유: 무한 = 몹 수 초과, 캠페인 = 목숨 0, 공통 = 보스 제한 시간 초과(M4-6), 캠페인 = 보스 출구 도달 */
export type DefeatReason = '' | 'mobLimit' | 'lives' | 'bossTime' | 'bossLeak';

/** 보스 처치로 받은 카드 묶음 (M4-7): 고를 플레이어·보스 번호(단계 ÷ 10)·보여주는 카드 id. 고를 때까지 남아 있다 */
export interface CardOffer {
  player: number;
  boss: number;
  cards: string[];
}

/** 승급의 축복 (카드 M4-7): 승급 결과 타워(id)를 다른 결과(alt)로 바꿀 수 있는 선택 하나 */
export interface MergePick {
  player: number;
  /** 승급 결과 타워 엔티티 id */
  id: number;
  /** 고를 수 있는 다른 결과 (타워 데이터 id) */
  alt: string;
}

/** 플레이어별 카드 효과 (M4-7). */
export interface PlayerPerks {
  /** '행운의 소환': 남은 레어 소환 수 */
  rareSummons: number;
  /** '승급의 축복': 남은 '결과 2개 중 선택' 승급 수 */
  mergeChoices: number;
  /** '쌍둥이 소환': 이 틱 전까지 소환하면 같은 타워 하나 더 */
  twinUntil: number;
  /** '신의 눈길': 신 타워 확률 배율 (bp, ×1 = 10000) */
  godMulBp: number;
}

export function newPlayerPerks(): PlayerPerks {
  return { rareSummons: 0, mergeChoices: 0, twinUntil: 0, godMulBp: 10000 };
}

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
  /** 지금 단계가 보스 단계인가 (보스는 단계 시작 틱에 나온다, M4-5) */
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
  // ---- M4 ----
  /** 일꾼 수 (GDD 3장: 300원, 최대 10명 — 카드 '무료 일꾼'은 넘길 수 있다) */
  workers: number;
  /** 일꾼 수입 배율 (1 = 기본, 카드 '일꾼 열정'마다 +1) */
  workerMul: number;
  /** 지금 보스 (데이터 id, '' = 없음). 보스 조각을 모두 잡으면 '' */
  bossId: string;
  /** 지금 보스 번호 = 보스 단계 ÷ 보스 주기 (카드 '긴급 자금') */
  bossNum: number;
  /** 보스가 나왔을 때 체력 (보스 체력 막대의 100%) */
  bossMaxHp: number;
  /** 이 틱에 보스가 살아 있으면 패배 (보스 단계 시작 + 제한 시간). 0 = 보스 없음 */
  bossDeadline: number;
  /** 지금까지 처치한 보스 수 */
  bossesKilled: number;
  /** 편대 단계 (예고했거나 진행 중인 편대 단계, 0 = 없음)와 그 편대 id */
  formationStage: number;
  formation: string;
  /** '투명 몹 출현! 감지 타워가 필요해요' 경고를 이미 냈는가 (판당 한 번) */
  invisibleWarned: boolean;
  /** 아직 고르지 않은 카드 묶음 (먼저 받은 것부터) */
  cardOffers: CardOffer[];
  /** 지금까지 고른 카드 id (고른 순) */
  cardsPicked: string[];
  /** 카드 '소환 할인' 합 (원) */
  summonDiscount: number;
  /** 카드 '끈끈이' 몹 이동속도 감소 합 (bp, 최대 45%) */
  mobSlowBp: number;
  /** 카드 '황금 손' 돈 획득 증가 합 (bp) */
  goldPctBp: number;
  /** 플레이어별 카드 효과 */
  perks: PlayerPerks[];
  /** 승급의 축복: 아직 고르지 않은 '결과 2개 중 선택' */
  mergePicks: MergePick[];
}

/** 시스템이 함께 쓰는 문맥. */
export interface MatchContext {
  readonly rules: MatchRules;
  readonly map: SimMap;
  readonly theme: ThemeMods;
  readonly state: MatchState;
  /** 플레이어별 덱 (판 시작 때 정해져 바뀌지 않는다 → 해시 밖. 리플레이는 시드와 함께 덱을 기록한다) */
  readonly decks: readonly Deck[];
  /**
   * 플레이어별 타워 레벨 (타워 id → 1~15, 없으면 1). 판 시작 때 정해져 바뀌지 않는다 (해시 밖, 리플레이에 기록).
   * 특색 수치 보간(M3-8)과 레벨당 공격력 +4%에 쓴다. 계정 성장(M9)이 넣는다.
   */
  readonly levels: readonly Readonly<Record<string, number>>[];
  /** compile한 특색 수치 캐시 (주인:타워 id → 값). 데이터 + 레벨에서 정해지는 값이라 해시 밖 */
  readonly cache: Map<string, unknown>;
}
