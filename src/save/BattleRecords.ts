/**
 * 전투 기록 · 최근 5판 (A-1, Codex 갈래 M6-6·M6-7에서 옮김).
 *
 * - 일반 1인 무한 모드 판이 끝나면(패배) 최고 도달 단계 · 단계 보스별 최고 처치 단계 · 최고 도전 단계 · 최근 5판
 *   (도달 단계, 게임 시간 = 배속 반영·일시정지 제외, 처치한 단계 보스, 최고 도전 단계)을 기기에 남긴다.
 * - 개발자 모드 판(debug)이나 치트를 쓴 판(debugUsed)은 남기지 않는다 — 기록은 실제로 해 본 결과만.
 * - 판 식별자(runId)로 같은 판을 두 번 세지 않는다 (이어 한 판도 저장에 runId가 실려 한 번만).
 * - 키 `rtd.records`. v0.1.7(Codex 갈래) 기기는 `random-td.battle-records`(형식 v1·v2)에 남아 있으므로 새 키가 없으면 그것을 읽는다.
 * - 진행 중인 판 저장(MatchSaves)과 따로 둔다. 망가진 칸·항목만 버리고(V2 L3), 더 높은 형식(새 앱이 쓴 기록)은 덮어쓰지 않는다.
 */
import type { Match } from '../sim/match';
import type { MatchRules } from '../sim/rules';
import type { AbandonedRun } from './MatchSaves';
import { bossForStage } from '../sim/systems/BossSchedule';
import { TICK_HZ } from '../sim/World';
import type { KeyValueStorage } from './storage';

export const RECORDS_KEY = 'rtd.records';
/** v0.1.7 (Codex 갈래) 키 — 새 키가 없을 때만 읽는다 */
export const LEGACY_RECORDS_KEY = 'random-td.battle-records';
const VERSION = 2;
export const RECENT_LIMIT = 5;

export interface RunResult {
  id: string;
  stage: number;
  durationSeconds: number;
  bossIds: string[];
  bestChallenge: number;
}

export interface BattleRecord {
  version: typeof VERSION;
  bestStage: number;
  /** 단계 보스 id → 가장 높은 처치 단계 */
  bossClears: Record<string, number>;
  bestChallenge: number;
  /** 최근 판 (새것부터, 최대 RECENT_LIMIT) */
  recent: RunResult[];
}

function nonNegInt(v: unknown): v is number {
  return Number.isSafeInteger(v) && (v as number) >= 0;
}

function validRun(run: unknown): run is RunResult {
  const r = run as Partial<RunResult> | null;
  return !!r && typeof r.id === 'string' && r.id.length > 0 && nonNegInt(r.stage) && nonNegInt(r.durationSeconds) &&
    Array.isArray(r.bossIds) && r.bossIds.every((id) => typeof id === 'string') && nonNegInt(r.bestChallenge);
}

export function emptyRecord(): BattleRecord {
  return { version: VERSION, bestStage: 0, bossClears: {}, bestChallenge: 0, recent: [] };
}

/**
 * 저장 글자 → 기록 (순수). 형식 v1(최근 판 없음)·v2를 읽는다. JSON이 아니면 빈 기록.
 * V2 검토 L3: 예전엔 칸 하나만 이상해도 통째로 빈 기록이 되고 다음 패배 때 그 빈 기록을 덮어써 최고 기록이 사라졌다 →
 * 이상한 칸·항목만 버린다 (최고 단계·최고 도전이 이상하면 0, 보스 처치 단계는 1 이상 정수이면서 최고 단계 이하인 것만, 최근 판은 맞는 것만).
 */
export function parseRecord(raw: string | null): BattleRecord {
  return parseRecordInfo(raw).record;
}

/** parseRecord + 지금 모르는 더 높은 형식인가 (future — 그런 기록은 읽기만 하고 덮어쓰지 않는다, V2 L3). */
export function parseRecordInfo(raw: string | null): { record: BattleRecord; future: boolean } {
  if (raw === null) return { record: emptyRecord(), future: false };
  let r: Record<string, unknown>;
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return { record: emptyRecord(), future: false };
    r = v as Record<string, unknown>;
  } catch {
    return { record: emptyRecord(), future: false };
  }
  const future = typeof r.version === 'number' && r.version > VERSION;
  const best = nonNegInt(r.bestStage) ? r.bestStage : 0;
  const bossClears: Record<string, number> = {};
  const clears = r.bossClears;
  if (clears && typeof clears === 'object' && !Array.isArray(clears)) {
    for (const [id, st] of Object.entries(clears as Record<string, unknown>)) {
      if (Number.isSafeInteger(st) && (st as number) > 0 && (st as number) <= best) bossClears[id] = st as number;
    }
  }
  const recent = r.version !== 1 && Array.isArray(r.recent) ? r.recent.filter(validRun).slice(0, RECENT_LIMIT) : [];
  return {
    record: { version: VERSION, bestStage: best, bossClears, bestChallenge: nonNegInt(r.bestChallenge) ? r.bestChallenge : 0, recent },
    future,
  };
}

export class BattleRecords {
  constructor(private readonly storage: KeyValueStorage) {}

  read(): BattleRecord {
    return this.readInfo().record;
  }

  private readInfo(): { record: BattleRecord; future: boolean } {
    try {
      const raw = this.storage.getItem(RECORDS_KEY) ?? this.storage.getItem(LEGACY_RECORDS_KEY);
      return parseRecordInfo(raw);
    } catch {
      return { record: emptyRecord(), future: false };
    }
  }

  /**
   * 끝난 판을 기록한다. 기록하지 않는 판(패배 전·캠페인·개발자·치트·여럿)이면 null.
   * 돌려주는 값: 지금 최고 단계와 이번에 최고를 넘었는지 (같은 판을 다시 부르면 newBest false).
   */
  complete(match: Match, runId: string): { bestStage: number; newBest: boolean } | null {
    const { rules, state, world } = match;
    if (!match.defeated || state.mode !== 'infinite' || state.debug || state.debugUsed || world.players !== 1) return null;
    return this.record(rules, {
      runId,
      mode: state.mode,
      theme: state.theme,
      stage: state.stage,
      bossesKilled: state.bossesKilled,
      challengeBest: state.challengeBest,
      durationSeconds: Math.floor((state.defeatTick + 1) / TICK_HZ),
    });
  }

  /**
   * 업데이트로 버린 진행 중 판을 기록한다 (V2 M2a — MatchSaves.onAbandoned). 패배 판과 같은 조건(일반 1인 무한 모드)만, 게임 시간 = 저장한 틱.
   * rules = 지금 데이터의 규칙 (보스 주기·보스 id — 데이터가 바뀌었으면 근사값).
   */
  completeAbandoned(rules: MatchRules, run: Pick<AbandonedRun, 'runId' | 'mode' | 'theme' | 'players' | 'stage' | 'bossesKilled' | 'challengeBest' | 'tick' | 'dev'>): { bestStage: number; newBest: boolean } | null {
    if (run.mode !== 'infinite' || run.dev || run.players !== 1) return null;
    return this.record(rules, {
      runId: run.runId,
      mode: run.mode,
      theme: run.theme,
      stage: run.stage,
      bossesKilled: run.bossesKilled,
      challengeBest: run.challengeBest,
      durationSeconds: Math.floor(run.tick / TICK_HZ),
    });
  }

  private record(
    rules: MatchRules,
    r: { runId: string; mode: string; theme: number; stage: number; bossesKilled: number; challengeBest: number; durationSeconds: number },
  ): { bestStage: number; newBest: boolean } | null {
    const { record, future } = this.readInfo();
    if (record.recent.some((x) => x.id === r.runId)) return { bestStage: record.bestStage, newBest: false };
    const newBest = r.stage > record.bestStage;
    record.bestStage = Math.max(record.bestStage, r.stage);
    record.bestChallenge = Math.max(record.bestChallenge, r.challengeBest);
    // 보스를 잡아야 다음 보스 단계로 넘어간다 (못 잡으면 제한 시간 패배) → 처치 수 × 주기까지의 보스 단계가 처치한 단계
    const lastCleared = Math.min(r.stage, r.bossesKilled * rules.bossEvery);
    const ids: string[] = [];
    for (let stage = rules.bossEvery; stage <= lastCleared; stage += rules.bossEvery) {
      const boss = bossForStage(rules, r.mode, r.theme, stage);
      if (!boss) continue;
      if (!ids.includes(boss.id)) ids.push(boss.id);
      record.bossClears[boss.id] = Math.max(record.bossClears[boss.id] ?? 0, stage);
    }
    const run: RunResult = {
      id: r.runId,
      stage: r.stage,
      durationSeconds: r.durationSeconds,
      bossIds: ids,
      bestChallenge: r.challengeBest,
    };
    record.recent = [run, ...record.recent].slice(0, RECENT_LIMIT);
    // 더 새 앱이 쓴 기록(모르는 형식)은 덮어쓰지 않는다 (V2 L3 — 이 판은 화면 결과만, 기록은 새 앱이 그대로 갖고 있음)
    if (future) return { bestStage: record.bestStage, newBest };
    try {
      this.storage.setItem(RECORDS_KEY, JSON.stringify(record));
    } catch {
      // 저장이 안 돼도 결과 화면은 보인다
    }
    return { bestStage: record.bestStage, newBest };
  }
}
