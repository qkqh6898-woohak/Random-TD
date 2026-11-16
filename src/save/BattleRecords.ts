import type { Match } from '../sim/match';
import { bossForStage } from '../sim/systems/BossSchedule';
import { TICK_HZ } from '../sim/World';

const SLOT = 'random-td.battle-records';
const VERSION = 2;
const RECENT_LIMIT = 5;

interface BattleTotals {
  bestStage: number;
  /** 단계 보스별 가장 높은 처치 단계. */
  bossClears: Record<string, number>;
  bestChallenge: number;
}

interface RunResult {
  id: string;
  stage: number;
  durationSeconds: number;
  bossIds: string[];
  bestChallenge: number;
}

interface BattleRecord extends BattleTotals {
  version: typeof VERSION;
  recent: RunResult[];
}

type LegacyBattleRecord = BattleTotals & { version: 1 };
type RecordStorage = Pick<Storage, 'getItem' | 'setItem'>;

function nonnegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validRun(run: RunResult): boolean {
  return typeof run?.id === 'string' && run.id.length > 0 &&
    nonnegativeInteger(run.stage) && nonnegativeInteger(run.durationSeconds) &&
    Array.isArray(run.bossIds) && run.bossIds.every((id) => typeof id === 'string') &&
    nonnegativeInteger(run.bestChallenge);
}

/** 일반 무한 모드의 결과. 진행 중인 판 저장과 별도로 보관한다. */
export class BattleRecords {
  constructor(private readonly storage: () => RecordStorage) {}

  read(): BattleRecord {
    try {
      const raw = this.storage().getItem(SLOT);
      const record = raw === null ? null : JSON.parse(raw) as BattleRecord | LegacyBattleRecord | null;
      if ((record?.version === VERSION || record?.version === 1) &&
          nonnegativeInteger(record.bestStage) && nonnegativeInteger(record.bestChallenge) &&
          record.bossClears && typeof record.bossClears === 'object' && !Array.isArray(record.bossClears) &&
          Object.values(record.bossClears).every((stage) => Number.isSafeInteger(stage) && stage > 0 && stage <= record.bestStage)) {
        const recent = record.version === VERSION && Array.isArray(record.recent)
          ? record.recent.filter(validRun).slice(0, RECENT_LIMIT)
          : [];
        return { ...record, version: VERSION, recent };
      }
    } catch {
      // 손상되거나 읽을 수 없는 슬롯은 빈 기록으로 표시한다.
    }
    return { version: VERSION, bestStage: 0, bossClears: {}, bestChallenge: 0, recent: [] };
  }

  complete(match: Match, runId: string): { bestStage: number; newBest: boolean } | null {
    const { rules, state, world } = match;
    if (!match.defeated || state.mode !== 'infinite' || state.debug || state.debugUsed || world.players !== 1) return null;

    const record = this.read();
    if (record.recent.some(({ id }) => id === runId)) return { bestStage: record.bestStage, newBest: false };
    const newBest = state.stage > record.bestStage;
    record.bestStage = Math.max(record.bestStage, state.stage);
    record.bestChallenge = Math.max(record.bestChallenge, state.challengeBest);
    // 일반 판은 보스를 모두 처치해야 다음 단계로 넘어간다. 이어 한 판의 처치도 순환표로 복원한다.
    const lastClearedStage = Math.min(state.stage, state.bossesKilled * rules.bossEvery);
    const clearedBossIds = new Set<string>();
    for (let stage = rules.bossEvery; stage <= lastClearedStage; stage += rules.bossEvery) {
      const boss = bossForStage(rules, state.mode, state.theme, stage);
      if (!boss) continue;
      clearedBossIds.add(boss.id);
      record.bossClears[boss.id] = Math.max(record.bossClears[boss.id] ?? 0, stage);
    }
    const summary: RunResult = {
      id: runId,
      stage: state.stage,
      durationSeconds: Math.floor((state.defeatTick + 1) / TICK_HZ),
      bossIds: [...clearedBossIds],
      bestChallenge: state.challengeBest,
    };
    record.recent = [summary, ...record.recent].slice(0, RECENT_LIMIT);
    try {
      this.storage().setItem(SLOT, JSON.stringify(record));
      return { bestStage: record.bestStage, newBest };
    } catch {
      // 결과 화면은 기기 저장이 실패해도 표시한다.
      return null;
    }
  }
}
