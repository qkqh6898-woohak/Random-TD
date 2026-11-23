/**
 * V3 P2 유물 계정 규칙 (docs/v3/p0-spec.md, progression.json v3.relics · game.json relics). 순수 함수 — 무작위는 계정 굴림(accountRng).
 *
 * - 조각을 처음 받으면(해금 조각 unlockFragments개) **자동 해금** → Lv1. 화면에 그렇게 적는다.
 * - 발견: 열쇠 1개 = 공개 풀 조각 1개(균등). 발견 누적(pulls)의 pityEvery번째는 **미보유 보장**, 미보유가 없으면 만렙이 아닌 유물 중 최저 레벨
 *   (같으면 굴림), 모두 만렙이면 균등. 만렙 유물 조각도 받는다(교환 재료) — 버리지 않는다.
 * - 강화: Lv n → n+1 = 조각 fragmentCost[n−1] + 골드 goldCost[n−1] (최대 Lv m 유물은 앞 m−1칸).
 * - 목표: 보급의 목표 조각이 가는 유물. 목표가 없으면 targetBank에 모았다가 목표를 정할 때 옮긴다.
 * - 교환: 고른 조각(유물별 수, 목표 유물 조각 제외) 합이 exchangeRate의 배수 → 목표 조각 (합 ÷ rate)개. 자동으로 고르지 않는다.
 * - 첫 유물 선택권: 지급ID 'first-relic' 한 번 — 고른 유물 조각 1개(해금) + 목표가 없으면 목표로.
 */
import type { GameData, RelicConfig } from '../../data/load';
import type { Rng } from '../../sim/Rng';
import type { ProgressionData } from '../progressionData';
import { markGranted, type RelicEntry, type V3State } from './state';

export const FIRST_RELIC_ID = 'first-relic';

export function relicConfig(data: Pick<GameData, 'game'>, id: string): RelicConfig | undefined {
  return data.game.relics.find((r) => r.id === id);
}

export function relicEntry(v3: V3State, id: string): RelicEntry {
  return v3.relics[id] ?? { level: 0, fragments: 0 };
}

/** Lv level → level+1 비용 (최대면 null) */
export function relicUpgradeCost(pd: ProgressionData, level: number, maxLevel: number): { fragments: number; gold: number } | null {
  if (level < 1 || level >= maxLevel) return null;
  const f = pd.v3.relics.fragmentCost[level - 1];
  const g = pd.v3.relics.goldCost[level - 1];
  if (f === undefined || g === undefined) return null;
  return { fragments: f, gold: g };
}

/** 조각 넣기 + 자동 해금 */
export function addRelicFragments(v3: V3State, pd: ProgressionData, id: string, n: number): void {
  if (n <= 0) return;
  const e = (v3.relics[id] ??= { level: 0, fragments: 0 });
  e.fragments += n;
  if (e.level < 1 && e.fragments >= pd.v3.relics.unlockFragments) {
    e.fragments -= pd.v3.relics.unlockFragments;
    e.level = 1;
  }
}

/** 목표 조각 n개 (목표가 없으면 보관) */
export function addTargetFragments(v3: V3State, pd: ProgressionData, n: number): void {
  if (n <= 0) return;
  if (v3.target) addRelicFragments(v3, pd, v3.target, n);
  else v3.targetBank += n;
}

/** 다음 천장까지 남은 발견 수 (1 = 다음 발견이 보장) */
export function pityRemaining(v3: V3State, pd: ProgressionData): number {
  const k = pd.v3.relics.pityEvery;
  return k - (v3.pulls % k);
}

/** 이번 발견이 보장(천장)인가 → 고를 후보 (pool 순서). 보장이 아니면 null */
export function pityCandidates(v3: V3State, pd: ProgressionData, data: Pick<GameData, 'game'>, pullNo: number): string[] | null {
  if (pullNo % pd.v3.relics.pityEvery !== 0) return null;
  const pool = pd.v3.relics.pool;
  const unowned = pool.filter((id) => relicEntry(v3, id).level < 1);
  if (unowned.length > 0) return unowned;
  const open = pool.filter((id) => relicEntry(v3, id).level < (relicConfig(data, id)?.maxLevel ?? 1));
  if (open.length === 0) return null;
  const low = Math.min(...open.map((id) => relicEntry(v3, id).level));
  return open.filter((id) => relicEntry(v3, id).level === low);
}

export type DiscoverCheck = 'ok' | 'keys';

/** 열쇠 n개로 발견. 받은 유물 id(순서대로)와 보장 여부. 열쇠가 모자라면 이유 */
export function discoverRelics(v3: V3State, pd: ProgressionData, data: Pick<GameData, 'game'>, rng: Rng, n = 1): { id: string; pity: boolean }[] | 'keys' {
  if (n < 1 || v3.keys < n) return 'keys';
  v3.keys -= n;
  const out: { id: string; pity: boolean }[] = [];
  for (let i = 0; i < n; i++) {
    v3.pulls += 1;
    const cand = pityCandidates(v3, pd, data, v3.pulls);
    const id = cand ? rng.pick(cand) : rng.pick(pd.v3.relics.pool);
    addRelicFragments(v3, pd, id, 1);
    out.push({ id, pity: cand !== null });
  }
  return out;
}

export type UpgradeCheck = 'ok' | 'notOwned' | 'max' | 'fragments' | 'gold' | 'unknown';

export function checkRelicUpgrade(v3: V3State, pd: ProgressionData, data: Pick<GameData, 'game'>, gold: number, id: string): UpgradeCheck {
  const cfg = relicConfig(data, id);
  if (!cfg) return 'unknown';
  const e = relicEntry(v3, id);
  if (e.level < 1) return 'notOwned';
  const cost = relicUpgradeCost(pd, e.level, cfg.maxLevel);
  if (!cost) return 'max';
  if (e.fragments < cost.fragments) return 'fragments';
  if (gold < cost.gold) return 'gold';
  return 'ok';
}

/** 강화: 성공하면 쓴 골드 (부르는 쪽이 계정 골드에서 뺀다), 못 하면 이유 */
export function upgradeRelic(v3: V3State, pd: ProgressionData, data: Pick<GameData, 'game'>, gold: number, id: string): { level: number; gold: number } | Exclude<UpgradeCheck, 'ok'> {
  const why = checkRelicUpgrade(v3, pd, data, gold, id);
  if (why !== 'ok') return why;
  const e = v3.relics[id] as RelicEntry;
  const cost = relicUpgradeCost(pd, e.level, (relicConfig(data, id) as RelicConfig).maxLevel) as { fragments: number; gold: number };
  e.fragments -= cost.fragments;
  e.level += 1;
  return { level: e.level, gold: cost.gold };
}

/** 목표 지정 (공개 풀만). 보관한 목표 조각을 옮긴다 */
export function setRelicTarget(v3: V3State, pd: ProgressionData, id: string): boolean {
  if (!pd.v3.relics.pool.includes(id)) return false;
  v3.target = id;
  if (v3.targetBank > 0) {
    const n = v3.targetBank;
    v3.targetBank = 0;
    addRelicFragments(v3, pd, id, n);
  }
  return true;
}

export type ExchangeCheck = 'ok' | 'noTarget' | 'notMultiple' | 'notEnough' | 'target' | 'empty';

/** 교환 확인: spend = 유물 id → 낼 조각 수 */
export function checkExchange(v3: V3State, pd: ProgressionData, spend: Readonly<Record<string, number>>): ExchangeCheck {
  if (!v3.target) return 'noTarget';
  let total = 0;
  for (const [id, n] of Object.entries(spend)) {
    if (!Number.isSafeInteger(n) || n < 0) return 'notEnough';
    if (n === 0) continue;
    if (id === v3.target) return 'target';
    if (relicEntry(v3, id).fragments < n) return 'notEnough';
    total += n;
  }
  if (total === 0) return 'empty';
  if (total % pd.v3.relics.exchangeRate !== 0) return 'notMultiple';
  return 'ok';
}

/** 교환: 성공하면 받은 목표 조각 수 */
export function exchangeRelicFragments(v3: V3State, pd: ProgressionData, spend: Readonly<Record<string, number>>): number | Exclude<ExchangeCheck, 'ok'> {
  const why = checkExchange(v3, pd, spend);
  if (why !== 'ok') return why;
  let total = 0;
  for (const id of Object.keys(spend).sort()) {
    const n = spend[id] as number;
    if (n <= 0) continue;
    (v3.relics[id] as RelicEntry).fragments -= n;
    total += n;
  }
  const got = total / pd.v3.relics.exchangeRate;
  addRelicFragments(v3, pd, v3.target, got);
  return got;
}

/** 첫 유물 선택권이 남았는가 */
export function firstRelicAvailable(v3: V3State, pd: ProgressionData): boolean {
  return pd.v3.relics.firstPick > 0 && !v3.granted.includes(FIRST_RELIC_ID);
}

/** 첫 유물 고르기 (한 번). 이미 쓴 선택권·공개 풀 밖이면 false */
export function pickFirstRelic(v3: V3State, pd: ProgressionData, id: string): boolean {
  if (!pd.v3.relics.pool.includes(id) || !firstRelicAvailable(v3, pd)) return false;
  markGranted(v3, FIRST_RELIC_ID);
  addRelicFragments(v3, pd, id, pd.v3.relics.unlockFragments);
  if (!v3.target) setRelicTarget(v3, pd, id);
  return true;
}

/** 판 입력: 보유 유물 (Lv1 이상, 데이터에 있는 것만, 키 정렬) → MatchOptions.relics[플레이어] */
export function matchRelics(v3: V3State, data: Pick<GameData, 'game'>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of Object.keys(v3.relics).sort()) {
    const cfg = relicConfig(data, id);
    const lv = (v3.relics[id] as RelicEntry).level;
    if (cfg && lv >= 1) out[id] = Math.min(lv, cfg.maxLevel);
  }
  return out;
}

/** 강화할 수 있는 유물 수 (배지 — 실제로 지금 강화 가능할 때만) */
export function relicsUpgradeReady(v3: V3State, pd: ProgressionData, data: Pick<GameData, 'game'>, gold: number): number {
  return pd.v3.relics.pool.filter((id) => checkRelicUpgrade(v3, pd, data, gold, id) === 'ok').length;
}
