/**
 * 업데이트로 버린 진행 중 판 정산 (V2 검토 M2a). MatchSaves가 저장을 버리기 직전 `onAbandoned`로 부르고, main.ts가 이 함수로 잇는다.
 *
 * - 계정 보상: 패배 화면과 같은 progress.settle(MatchResult) — 경험치·골드·영웅 카드·신화 조각·최고 웨이브·누적/오늘 기록·모집 게이지.
 *   같은 runId는 progress가 한 번만 정산한다 (이미 받은 판이면 null → credited false).
 * - 전투 기록: BattleRecords.completeAbandoned (일반 1인 무한 모드만, runId로 한 번만).
 * - 판을 되살리지 않는다 (규칙·데이터가 바뀌어 되살릴 수 없을 수 있으므로) — 저장 JSON의 값만 쓴다.
 */
import type { MatchResult, MatchSettlement } from '../meta/progress';
import type { MatchRules } from '../sim/rules';
import type { BattleRecords } from './BattleRecords';
import type { AbandonedRun } from './MatchSaves';

/** 버린 판 → 정산 입력 (matchResultOf와 같은 값, 순수). */
export function abandonedMatchResult(run: AbandonedRun): MatchResult {
  return {
    runId: run.runId,
    seed: run.seed,
    mode: run.mode,
    stage: run.stage,
    bossKills: run.bossesKilled,
    summons: run.summons,
    merges: run.merges,
    dev: run.dev,
  };
}

export interface AbandonedSettleDeps {
  progress?: { settle(result: MatchResult): MatchSettlement | null } | null;
  records?: Pick<BattleRecords, 'completeAbandoned'> | null;
  /** 지금 데이터의 규칙 (전투 기록의 보스 단계 계산 — 필요할 때만 만든다) */
  rules?: () => MatchRules;
}

/** 버린 판 정산. 계정 보상을 새로 줬으면 true. 한쪽이 실패해도 다른 쪽은 한다. */
export function settleAbandonedRun(run: AbandonedRun, deps: AbandonedSettleDeps): boolean {
  let credited = false;
  try {
    credited = (deps.progress?.settle(abandonedMatchResult(run)) ?? null) !== null;
  } catch {
    credited = false;
  }
  try {
    if (deps.records && deps.rules) deps.records.completeAbandoned(deps.rules(), run);
  } catch {
    // 기록을 못 남겨도 보상은 그대로
  }
  return credited;
}
