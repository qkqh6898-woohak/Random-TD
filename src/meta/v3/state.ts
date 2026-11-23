/**
 * V3 계정 상태 (rtd.progress의 `v3` 필드 — docs/v3/p0-spec.md 3.3). 없거나 틀린 필드는 기본값으로 읽는다 (저장 형식 v2 유지).
 * 판 장부는 기존 rewardedRuns(runId), 1회 지급 장부는 granted(지급ID)다.
 */
import type { GameData } from '../../data/load';
import type { ProgressionData } from '../progressionData';
import { newExploreState, parseExploreState, type ExploreState } from './explore';

export interface RelicEntry {
  /** 0 = 미보유, 1 ~ 최대 Lv */
  level: number;
  /** 가진 조각 (강화·교환 재료) */
  fragments: number;
}

export interface V3State {
  /** 🗝️ 탐험 열쇠 */
  keys: number;
  /** 공개 풀 유물 (id → 레벨·조각) */
  relics: Record<string, RelicEntry>;
  /** 목표 유물 id ('' = 없음) */
  target: string;
  /** 목표가 없을 때 받은 목표 조각 (목표를 정하면 옮긴다) */
  targetBank: number;
  /** 유물 발견 누적 (천장 카운터 — 앱 종료·열쇠 출처와 무관, 풀이 늘어도 그대로) */
  pulls: number;
  explore: ExploreState;
  /** 1회 지급 장부 (지급ID, 정렬) */
  granted: string[];
}

export function newV3State(pd: ProgressionData): V3State {
  const relics: Record<string, RelicEntry> = {};
  for (const id of pd.v3.relics.pool) relics[id] = { level: 0, fragments: 0 };
  return { keys: 0, relics, target: '', targetBank: 0, pulls: 0, explore: newExploreState(), granted: [] };
}

const nn = (v: unknown): number => (Number.isSafeInteger(v) && (v as number) >= 0 ? (v as number) : 0);

/**
 * 저장 값 → 상태. 공개 풀에 없는 유물 기록은 버리지 않고 들고 다닌다(풀이 바뀌어도 잃지 않게). 레벨은 데이터 최대 Lv로 자른다.
 * 모르는 하위 필드(P3가 더하는 상자·도장·패스 등)도 그대로 들고 다닌다.
 */
export function parseV3State(raw: unknown, pd: ProgressionData, data: Pick<GameData, 'game'>): V3State {
  const fresh = newV3State(pd);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fresh;
  const o = raw as Record<string, unknown>;
  const maxOf = new Map(data.game.relics.map((r) => [r.id, r.maxLevel]));
  const relics: Record<string, RelicEntry> = { ...fresh.relics };
  const src = (o.relics && typeof o.relics === 'object' ? o.relics : {}) as Record<string, unknown>;
  for (const id of Object.keys(src).sort()) {
    const e = src[id] as Partial<RelicEntry> | undefined;
    if (!e || typeof e !== 'object') continue;
    relics[id] = { level: Math.min(nn(e.level), maxOf.get(id) ?? 99), fragments: nn(e.fragments) };
  }
  const target = typeof o.target === 'string' && pd.v3.relics.pool.includes(o.target) ? o.target : '';
  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (!['keys', 'relics', 'target', 'targetBank', 'pulls', 'explore', 'granted'].includes(k)) extras[k] = v;
  return {
    ...extras,
    keys: nn(o.keys),
    relics,
    target,
    targetBank: nn(o.targetBank),
    pulls: nn(o.pulls),
    explore: o.explore === undefined ? newExploreState() : parseExploreState(o.explore, pd.v3),
    granted: Array.isArray(o.granted) ? [...new Set(o.granted.filter((x): x is string => typeof x === 'string'))].sort() : [],
  };
}

/** 지급ID를 장부에 적는다. 이미 있으면 false (주지 않는다) */
export function markGranted(v3: V3State, id: string): boolean {
  if (v3.granted.includes(id)) return false;
  v3.granted = [...v3.granted, id].sort();
  return true;
}
