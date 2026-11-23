/**
 * 끝난 판 → 판 밖 정산 입력 (G-3). 화면(Game 장면 패배 화면)이 부른다. 판 상태를 읽기만 한다.
 */
import type { Match } from '../sim/match';
import type { MatchResult } from './progress';

export function matchResultOf(match: Match, runId: string): MatchResult {
  const s = match.state;
  return {
    runId,
    seed: match.world.seed,
    mode: s.mode,
    stage: s.stage,
    bossKills: s.bossesKilled,
    summons: s.summons,
    merges: s.merges,
    dev: s.debug || s.debugUsed,
    victory: s.phase === 'victory',
  };
}
