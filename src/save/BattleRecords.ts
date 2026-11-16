/**
 * 전투 기록 · 최근 5판 (A-1, Codex 갈래 M6-6·M6-7에서 옮김).
 *
 * - 일반 1인 무한 모드 판이 끝나면(패배) 최고 도달 단계 · 단계 보스별 최고 처치 단계 · 최고 도전 단계 · 최근 5판
 *   (도달 단계, 게임 시간 = 배속 반영·일시정지 제외, 처치한 단계 보스, 최고 도전 단계)을 기기에 남긴다.
 * - 개발자 모드 판(debug)이나 치트를 쓴 판(debugUsed)은 남기지 않는다 — 기록은 실제로 해 본 결과만.
 * - 판 식별자(runId)로 같은 판을 두 번 세지 않는다 (이어 한 판도 저장에 runId가 실려 한 번만).
 * - 키 `rtd.records`. v0.1.7(Codex 갈래) 기기는 `random-td.battle-records`(형식 v1·v2)에 남아 있으므로 새 키가 없으면 그것을 읽는다.
 * - 진행 중인 판 저장(MatchSaves)과 따로 둔다. 망가진 값은 빈 기록으로.
 */
import type { Match } from '../sim/match';
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

/** 저장 글자 → 기록 (순수). 형식 v1(최근 판 없음)·v2를 읽고, 망가졌으면 빈 기록. */
export function parseRecord(raw: string | null): BattleRecord {
  if (raw === null) return emptyRecord();
  try {
    const r = JSON.parse(raw) as Omit<Partial<BattleRecord>, 'version'> & { version?: number };
    if ((r.version !== 1 && r.version !== VERSION) || !nonNegInt(r.bestStage) || !nonNegInt(r.bestChallenge)) return emptyRecord();
    const clears = r.bossClears;
    if (!clears || typeof clears !== 'object' || Array.isArray(clears)) return emptyRecord();
    const best = r.bestStage;
    if (!Object.values(clears).every((s) => Number.isSafeInteger(s) && s > 0 && s <= best)) return emptyRecord();
    const recent = r.version === VERSION && Array.isArray(r.recent) ? r.recent.filter(validRun).slice(0, RECENT_LIMIT) : [];
    return { version: VERSION, bestStage: best, bossClears: { ...clears }, bestChallenge: r.bestChallenge, recent };
  } catch {
    return emptyRecord();
  }
}

export class BattleRecords {
  constructor(private readonly storage: KeyValueStorage) {}

  read(): BattleRecord {
    try {
      const raw = this.storage.getItem(RECORDS_KEY) ?? this.storage.getItem(LEGACY_RECORDS_KEY);
      return parseRecord(raw);
    } catch {
      return emptyRecord();
    }
  }

  /**
   * 끝난 판을 기록한다. 기록하지 않는 판(패배 전·캠페인·개발자·치트·여럿)이면 null.
   * 돌려주는 값: 지금 최고 단계와 이번에 최고를 넘었는지 (같은 판을 다시 부르면 newBest false).
   */
  complete(match: Match, runId: string): { bestStage: number; newBest: boolean } | null {
    const { rules, state, world } = match;
    if (!match.defeated || state.mode !== 'infinite' || state.debug || state.debugUsed || world.players !== 1) return null;
    const record = this.read();
    if (record.recent.some((r) => r.id === runId)) return { bestStage: record.bestStage, newBest: false };
    const newBest = state.stage > record.bestStage;
    record.bestStage = Math.max(record.bestStage, state.stage);
    record.bestChallenge = Math.max(record.bestChallenge, state.challengeBest);
    // 보스를 잡아야 다음 보스 단계로 넘어간다 (못 잡으면 제한 시간 패배) → 처치 수 × 주기까지의 보스 단계가 처치한 단계
    const lastCleared = Math.min(state.stage, state.bossesKilled * rules.bossEvery);
    const ids: string[] = [];
    for (let stage = rules.bossEvery; stage <= lastCleared; stage += rules.bossEvery) {
      const boss = bossForStage(rules, state.mode, state.theme, stage);
      if (!boss) continue;
      if (!ids.includes(boss.id)) ids.push(boss.id);
      record.bossClears[boss.id] = Math.max(record.bossClears[boss.id] ?? 0, stage);
    }
    const run: RunResult = {
      id: runId,
      stage: state.stage,
      durationSeconds: Math.floor((state.defeatTick + 1) / TICK_HZ),
      bossIds: ids,
      bestChallenge: state.challengeBest,
    };
    record.recent = [run, ...record.recent].slice(0, RECENT_LIMIT);
    try {
      this.storage.setItem(RECORDS_KEY, JSON.stringify(record));
    } catch {
      // 저장이 안 돼도 결과 화면은 보인다
    }
    return { bestStage: record.bestStage, newBest };
  }
}
