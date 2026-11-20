/**
 * 판 밖 성장 규칙 (G-3 로비·영웅 수집·성장, docs/PROGRESSION.md 13장). 순수 함수 — 저장소·화면·Date와 무관 (날짜는 부르는 쪽이 넘긴다).
 *
 * 상태(ProgressState)는 계정 하나의 판 밖 진행: 계정 레벨·경험치, 골드·보석(게임 안에서만 얻음), 🔥 불꽃(V2.0 PR-A — 영웅 레벨업에만 쓴다),
 * 영웅별 레벨·카드(히든은 조각),
 * 무한 모드 최고 웨이브·받은 웨이브 길 보상, 영웅 모집 게이지, 누적·오늘 기록, 받은 퀘스트·업적, 보상을 준 판.
 *
 * 무작위(카드 영웅 고르기·조각 대상): Math.random을 쓰지 않는다.
 *  - 판 보상은 **판 시드 + 결과**로 굴린다 → 같은 판 결과면 같은 보상 (`settleMatch`).
 *  - 상점·웨이브 길·퀘스트·모집 보상은 계정 시드 + 굴림 번호(rolls)로 굴린다 → 저장을 되돌리면 같은 결과 (`accountRng`).
 *
 * 판에 주는 영향 (G-1 전투 쪽이 쓰는 연결 지점):
 *  - `heroMatchLevels(state, pd, data)` → MatchOptions.levels[플레이어] (타워 id → Lv, 2 이상만). sim이 레벨당 공격력
 *    (game.json towerLevel.atkPerLevel = +4%)과 특색 수치 보간(Lv1 → Lv15)을 적용한다. 리플레이·판 저장 입력에 기록된다.
 *  - `lockedHiddenIds(state, data)` → MatchOptions.lockedHidden[플레이어]. sim `isHiddenLocked(ctx, player, id)`로 읽는다.
 *  - `isHiddenUnlocked(state, id)` — 화면(리미티드 도감)용.
 */
import type { GameData, Grade, TowerData } from '../data/load';
import { Rng, deriveSeed } from '../sim/Rng';
import { fnv1a32 } from '../sim/hash';
import type { ProgressionData, QuestData, QuestStat, RewardSpec, ShopItemData } from './progressionData';

/**
 * 저장 형식 버전. 2 = V2.0 PR-A 🔥 불꽃(flame) 추가. 1 → 2 이전: flame이 없으면 progression.json account.legacyFlame을 한 번 준다
 * (예전 계정은 영웅 레벨업에 골드를 썼으므로 막히지 않게 — 다른 재화는 건드리지 않는다). 2 이상인데 flame이 틀리면 0.
 */
export const PROGRESS_VERSION = 2;
/** 불꽃이 처음 생긴 저장 형식 버전 */
export const FLAME_VERSION = 2;
/** 같은 판에 보상을 두 번 주지 않게 남겨 두는 최근 판 수 */
export const REWARDED_RUNS_KEEP = 20;

export interface HeroEntry {
  /** 0 = 보유하지 않음 (히든 = 잠김), 1 ~ maxLevel */
  level: number;
  /** 가진 카드 (히든은 조각) */
  cards: number;
}

/** 판에서 세는 기록 (누적·오늘 공용). bestWave는 합이 아니라 최고 */
export interface StatBlock {
  matches: number;
  summons: number;
  merges: number;
  bossKills: number;
  bestWave: number;
}

export interface DailyState {
  /** 기기 날짜 'YYYY-MM-DD' (이 날의 기록) */
  date: string;
  stats: StatBlock;
  claimed: string[];
  bonusClaimed: boolean;
}

export interface ProgressState {
  v: number;
  /** 계정 굴림 시드 (처음 만들 때 한 번) */
  seed: number;
  /** 계정 굴림 번호 — 굴릴 때마다 1씩 */
  rolls: number;
  level: number;
  /** 지금 레벨에서 모은 경험치 */
  xp: number;
  gold: number;
  gems: number;
  /** 🔥 불꽃 (V2.0 PR-A): 판 결과로 얻고 영웅 레벨업에만 쓴다 */
  flame: number;
  heroes: Record<string, HeroEntry>;
  /** 무한 모드 최고 웨이브 (일반 판) */
  bestWave: number;
  claimedWaves: number[];
  /** 영웅 모집 게이지 칸 · 다음 칸까지 남은 소환 (나머지) */
  recruit: number;
  recruitSummons: number;
  totals: StatBlock;
  daily: DailyState;
  /** 받은 업적 id */
  achievements: string[];
  /** 보상을 준 판 id (최근 REWARDED_RUNS_KEEP개) */
  rewardedRuns: string[];
}

/** 받은 것 (화면 표시용 요약) */
export interface Grant {
  xp: number;
  gold: number;
  gems: number;
  flame: number;
  cards: { id: string; n: number; isNew: boolean }[];
  fragments: { id: string; n: number }[];
  /** 이번에 오른 계정 레벨들 */
  levelUps: number[];
}

export interface MatchResult {
  /** 판 식별자 (이어 한 판도 같은 값) — 두 번 정산하지 않게 */
  runId: string;
  seed: number;
  mode: 'infinite' | 'campaign';
  /** 도달 단계 (= 웨이브) */
  stage: number;
  bossKills: number;
  summons: number;
  merges: number;
  /** 개발자 판·치트 판 — 보상은 주되(개발자 계정 슬롯) 최고 웨이브·웨이브 길은 일반 계정처럼 센다 */
  dev?: boolean;
}

export interface MatchSettlement {
  grant: Grant;
  stage: number;
  bestWave: number;
  newBest: boolean;
  /** 영웅 모집 게이지에 더한 칸 */
  recruitGain: number;
}

export function emptyStats(): StatBlock {
  return { matches: 0, summons: 0, merges: 0, bossKills: 0, bestWave: 0 };
}

function emptyGrant(): Grant {
  return { xp: 0, gold: 0, gems: 0, flame: 0, cards: [], fragments: [], levelUps: [] };
}

/** 영웅 수집에 나오는 타워 (모든 등급, 데이터 순서) */
export function heroTowers(data: Pick<GameData, 'towers'>): readonly TowerData[] {
  return data.towers.towers;
}

/** 새 계정. legacy = 예전 저장에서 옮길 값 (rtd.account 레벨, rtd.records 최고 단계) */
export function newProgress(pd: ProgressionData, data: Pick<GameData, 'decks' | 'towers'>, seed: number, legacy: { level?: number; bestWave?: number } = {}): ProgressState {
  const heroes: Record<string, HeroEntry> = {};
  for (const t of data.towers.towers) heroes[t.id] = { level: 0, cards: 0 };
  const base = data.decks.base;
  for (const id of [...base.normal, ...base.rare, ...base.unique, ...base.hero, ...base.legend]) heroes[id] = { level: 1, cards: 0 };
  const level = Number.isSafeInteger(legacy.level) && (legacy.level as number) >= 1 ? (legacy.level as number) : 1;
  const best = Number.isSafeInteger(legacy.bestWave) && (legacy.bestWave as number) >= 0 ? (legacy.bestWave as number) : 0;
  return {
    v: PROGRESS_VERSION,
    seed: seed >>> 0,
    rolls: 0,
    level,
    xp: 0,
    gold: pd.account.startGold,
    gems: pd.account.startGems,
    flame: pd.account.startFlame,
    heroes,
    bestWave: best,
    claimedWaves: [],
    recruit: 0,
    recruitSummons: 0,
    totals: { ...emptyStats(), bestWave: best },
    daily: { date: '', stats: emptyStats(), claimed: [], bonusClaimed: false },
    achievements: [],
    rewardedRuns: [],
  };
}

// ---------------------------------------------------------------------------
// 저장 읽기 (검사·마이그레이션)
// ---------------------------------------------------------------------------

const nonNegInt = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const intOr = (v: unknown, d: number, min = 0): number => (Number.isSafeInteger(v) && (v as number) >= min ? (v as number) : d);
const strList = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string'))].sort() : []);

function readStats(v: unknown): StatBlock {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<Record<keyof StatBlock, unknown>>;
  return { matches: intOr(o.matches, 0), summons: intOr(o.summons, 0), merges: intOr(o.merges, 0), bossKills: intOr(o.bossKills, 0), bestWave: intOr(o.bestWave, 0) };
}

/**
 * 저장 글자를 읽을 수 없는가 (JSON이 아님·객체가 아님·버전이 없거나 틀림) 또는 이 앱보다 새 형식인가 (검토 M4) —
 * 그렇다면 저장소가 덮어쓰기 전에 원본을 옆 키에 백업한다 (ProgressStore). 키가 없으면(null) false.
 */
export function progressNeedsBackup(raw: string | null): boolean {
  if (raw === null) return false;
  try {
    const o: unknown = JSON.parse(raw);
    if (!o || typeof o !== 'object' || Array.isArray(o)) return true;
    const v = (o as { v?: unknown }).v;
    return !nonNegInt(v) || v < 1 || v > PROGRESS_VERSION;
  } catch {
    return true;
  }
}

/** 이 앱보다 새 형식의 계정 저장인가 (v > PROGRESS_VERSION) — ProgressStore가 읽기 전용으로 연다 (검토 M4) */
export function progressIsNewer(raw: string | null): boolean {
  if (raw === null) return false;
  try {
    const o: unknown = JSON.parse(raw);
    if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
    const v = (o as { v?: unknown }).v;
    return nonNegInt(v) && v > PROGRESS_VERSION;
  } catch {
    return false;
  }
}

/** parseProgress가 아는 최상위 필드 (나머지는 그대로 들고 다닌다 — 새 앱이 더한 필드를 옛 앱이 지우지 않게, 검토 M4) */
const KNOWN_KEYS: ReadonlySet<string> = new Set([
  'v', 'seed', 'rolls', 'level', 'xp', 'gold', 'gems', 'flame', 'heroes', 'bestWave', 'claimedWaves', 'recruit', 'recruitSummons', 'totals', 'daily', 'achievements', 'rewardedRuns',
]);

/**
 * 저장 글자 → 상태. 없으면 새 계정(legacy 값 옮김), 망가졌으면 새 계정, 필드 하나가 틀리면 그 필드만 기본값.
 * 데이터에 없는 타워 id의 영웅 기록과 모르는 최상위 필드는 버리지 않고 그대로 들고 다닌다 (검토 M4 — id가 데이터에 돌아오면 다시 쓰인다).
 * 새 타워는 미보유로 채운다. 버전 1 → 2: 🔥 불꽃이 없으면 account.legacyFlame을 한 번 준다 (FLAME_VERSION).
 */
export function parseProgress(raw: string | null, pd: ProgressionData, data: Pick<GameData, 'decks' | 'towers'>, seed: number, legacy: { level?: number; bestWave?: number } = {}): ProgressState {
  const fresh = newProgress(pd, data, seed, legacy);
  if (raw === null) return fresh;
  let o: Partial<Record<keyof ProgressState, unknown>>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fresh;
    o = parsed as Partial<Record<keyof ProgressState, unknown>>;
  } catch {
    return fresh;
  }
  if (!nonNegInt(o.v) || (o.v as number) < 1) return fresh;
  const heroes: Record<string, HeroEntry> = {};
  const src = (o.heroes && typeof o.heroes === 'object' ? o.heroes : {}) as Record<string, unknown>;
  for (const t of data.towers.towers) {
    const e = src[t.id] as Partial<HeroEntry> | undefined;
    heroes[t.id] = e && typeof e === 'object' ? { level: Math.min(intOr(e.level, 0), pd.heroes.maxLevel), cards: intOr(e.cards, 0) } : (fresh.heroes[t.id] as HeroEntry);
  }
  for (const id of Object.keys(src).sort()) {
    if (Object.hasOwn(heroes, id)) continue;
    const e = src[id] as Partial<HeroEntry> | undefined;
    if (e && typeof e === 'object') heroes[id] = { level: Math.min(intOr(e.level, 0), pd.heroes.maxLevel), cards: intOr(e.cards, 0) };
  }
  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (!KNOWN_KEYS.has(k)) extras[k] = v;
  const savedV = o.v as number;
  const flame = nonNegInt(o.flame) ? o.flame : savedV < FLAME_VERSION ? pd.account.legacyFlame : 0;
  const d = (o.daily && typeof o.daily === 'object' ? o.daily : {}) as Partial<Record<keyof DailyState, unknown>>;
  const totals = readStats(o.totals);
  const bestWave = Math.max(intOr(o.bestWave, 0), totals.bestWave);
  return {
    ...extras,
    v: Math.max(PROGRESS_VERSION, savedV),
    seed: intOr(o.seed, fresh.seed) >>> 0,
    rolls: intOr(o.rolls, 0),
    level: intOr(o.level, 1, 1),
    xp: intOr(o.xp, 0),
    gold: intOr(o.gold, 0),
    gems: intOr(o.gems, 0),
    flame,
    heroes,
    bestWave,
    claimedWaves: Array.isArray(o.claimedWaves) ? [...new Set(o.claimedWaves.filter(nonNegInt))].sort((a, b) => a - b) : [],
    recruit: intOr(o.recruit, 0),
    recruitSummons: intOr(o.recruitSummons, 0),
    totals: { ...totals, bestWave: Math.max(totals.bestWave, bestWave) },
    daily: { date: typeof d.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : '', stats: readStats(d.stats), claimed: strList(d.claimed), bonusClaimed: d.bonusClaimed === true },
    achievements: strList(o.achievements),
    rewardedRuns: Array.isArray(o.rewardedRuns) ? o.rewardedRuns.filter((x): x is string => typeof x === 'string').slice(-REWARDED_RUNS_KEEP) : [],
  };
}

export function serializeProgress(state: ProgressState): string {
  return JSON.stringify(state);
}

// ---------------------------------------------------------------------------
// 계정 레벨
// ---------------------------------------------------------------------------

/** 지금 레벨에서 다음 레벨까지 필요한 경험치 (PROGRESSION 3장: 100 + 50 × (Lv − 1)) */
export function xpToNext(pd: ProgressionData, level: number): number {
  return pd.account.xpBase + pd.account.xpStep * (level - 1);
}

/** 레벨 n이 되었을 때 받는 보석 */
export function levelUpGems(pd: ProgressionData, newLevel: number): number {
  return pd.account.levelUpGems + (newLevel % 10 === 0 ? pd.account.every10Gems : 0);
}

/** 경험치 더하기 (여러 번 레벨업 가능). 레벨업 보석은 grant에 더한다 */
export function addXp(state: ProgressState, pd: ProgressionData, xp: number, grant: Grant = emptyGrant()): Grant {
  if (xp <= 0) return grant;
  state.xp += xp;
  grant.xp += xp;
  for (let need = xpToNext(pd, state.level); state.xp >= need; need = xpToNext(pd, state.level)) {
    state.xp -= need;
    state.level += 1;
    const gems = levelUpGems(pd, state.level);
    state.gems += gems;
    grant.gems += gems;
    grant.levelUps.push(state.level);
  }
  return grant;
}

// ---------------------------------------------------------------------------
// 영웅
// ---------------------------------------------------------------------------

export function heroEntry(state: ProgressState, id: string): HeroEntry {
  return state.heroes[id] ?? { level: 0, cards: 0 };
}

/** Lv level → level+1 비용 (영웅 카드 + 🔥 불꽃, V2.0 PR-A — 예전엔 골드). 최대 레벨이면 null */
export function levelUpCost(pd: ProgressionData, grade: Grade, level: number): { cards: number; flame: number } | null {
  if (level < 1 || level >= pd.heroes.maxLevel) return null;
  const baseCards = pd.heroes.cards[level - 1] as number;
  const baseFlame = pd.heroes.flame[level - 1] as number;
  return {
    cards: Math.max(1, Math.ceil((baseCards * pd.heroes.gradeCardPct[grade]) / 100)),
    flame: Math.floor((baseFlame * pd.heroes.gradeFlamePct[grade]) / 100),
  };
}

export type LevelUpCheck = 'ok' | 'notOwned' | 'max' | 'cards' | 'flame';

export function checkLevelUp(state: ProgressState, pd: ProgressionData, tower: Pick<TowerData, 'id' | 'grade'>): LevelUpCheck {
  const e = heroEntry(state, tower.id);
  if (e.level < 1) return 'notOwned';
  const cost = levelUpCost(pd, tower.grade, e.level);
  if (!cost) return 'max';
  if (e.cards < cost.cards) return 'cards';
  if (state.flame < cost.flame) return 'flame';
  return 'ok';
}

/** 레벨업 (카드 + 🔥 불꽃). 성공하면 새 레벨, 못 하면 이유. 영웅 ▲·탭 배지·[모두 레벨업 N]이 모두 이 규칙(checkLevelUp)을 쓴다 */
export function levelUpHero(state: ProgressState, pd: ProgressionData, tower: Pick<TowerData, 'id' | 'grade'>): number | Exclude<LevelUpCheck, 'ok'> {
  const why = checkLevelUp(state, pd, tower);
  if (why !== 'ok') return why;
  const e = state.heroes[tower.id] as HeroEntry;
  const cost = levelUpCost(pd, tower.grade, e.level) as { cards: number; flame: number };
  e.cards -= cost.cards;
  state.flame -= cost.flame;
  e.level += 1;
  return e.level;
}

export interface LevelUpAllResult {
  /** 오른 영웅 (주어진 순서), 레벨 from → to */
  ups: { id: string; from: number; to: number }[];
  flame: number;
  cards: number;
}

/**
 * 피드백 #31 모두 레벨업: 주어진 순서로 돌아가며 한 레벨씩 올리고, 더 못 올릴 때까지 반복한다
 * (불꽃이 모자라도 앞 영웅이 다 가져가지 않게). 결과는 하나씩 누른 것과 같다.
 */
export function levelUpAllHeroes(state: ProgressState, pd: ProgressionData, towers: readonly Pick<TowerData, 'id' | 'grade'>[]): LevelUpAllResult {
  const flame0 = state.flame;
  const from = new Map<string, { level: number; cards: number }>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of towers) {
      const e = heroEntry(state, t.id);
      const before = { level: e.level, cards: e.cards };
      if (typeof levelUpHero(state, pd, t) !== 'number') continue;
      if (!from.has(t.id)) from.set(t.id, before);
      changed = true;
    }
  }
  const ups: LevelUpAllResult['ups'] = [];
  let cards = 0;
  for (const t of towers) {
    const b = from.get(t.id);
    if (!b) continue;
    const e = heroEntry(state, t.id);
    ups.push({ id: t.id, from: b.level, to: e.level });
    cards += b.cards - e.cards;
  }
  return { ups, flame: flame0 - state.flame, cards };
}

export function heroLevelSum(state: ProgressState): number {
  let sum = 0;
  for (const id of Object.keys(state.heroes).sort()) sum += (state.heroes[id] as HeroEntry).level;
  return sum;
}

/**
 * 판 입력: 보유 영웅 레벨 (2 이상만, 키 정렬) → MatchOptions.levels[플레이어]. sim 최대 레벨을 넘지 않는다.
 * 모든 영웅이 Lv1이면 빈 객체 → 예전 판과 같다.
 */
export function heroMatchLevels(state: ProgressState, pd: ProgressionData, data: Pick<GameData, 'towers' | 'game'>): Record<string, number> {
  const max = Math.min(pd.heroes.maxLevel, data.game.towerLevel.max);
  const out: Record<string, number> = {};
  for (const t of [...data.towers.towers].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const lv = Math.min(heroEntry(state, t.id).level, max);
    if (lv >= 2) out[t.id] = lv;
  }
  return out;
}

/** 영웅 레벨이 주는 전투 공격력 보너스 (bp 정수): (Lv − 1) × game.json towerLevel.atkPerLevel. 미보유·Lv1 = 0 */
export function heroAtkBonusBp(level: number, data: Pick<GameData, 'game'>): number {
  const per = Math.round(data.game.towerLevel.atkPerLevel * 10000);
  return Math.max(0, level - 1) * per;
}

/** 타워별 전투 공격력 보너스 (bp) — 판 밖 표시용 (실제 적용은 heroMatchLevels → sim) */
export function heroAtkBonuses(state: ProgressState, pd: ProgressionData, data: Pick<GameData, 'towers' | 'game'>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, lv] of Object.entries(heroMatchLevels(state, pd, data))) out[id] = heroAtkBonusBp(lv, data);
  return out;
}

// ---------------------------------------------------------------------------
// 히든(리미티드) 영웅 해방
// ---------------------------------------------------------------------------

/** 히든 영웅이 해방됐는가. 히든이 아니면 늘 true */
export function isHiddenUnlocked(state: ProgressState, id: string, data?: Pick<GameData, 'towers'>): boolean {
  if (data) {
    const t = data.towers.towers.find((x) => x.id === id);
    if (!t) return false;
    if (t.grade !== 'hidden') return true;
  }
  return heroEntry(state, id).level >= 1;
}

/** 판 입력: 잠긴 히든 id (정렬) → MatchOptions.lockedHidden[플레이어] */
export function lockedHiddenIds(state: ProgressState, data: Pick<GameData, 'towers'>): string[] {
  return data.towers.towers
    .filter((t) => t.grade === 'hidden' && heroEntry(state, t.id).level < 1)
    .map((t) => t.id)
    .sort();
}

export type UnlockCheck = 'ok' | 'notHidden' | 'unlocked' | 'fragments';

export function checkUnlock(state: ProgressState, pd: ProgressionData, tower: Pick<TowerData, 'id' | 'grade'>): UnlockCheck {
  if (tower.grade !== 'hidden') return 'notHidden';
  const e = heroEntry(state, tower.id);
  if (e.level >= 1) return 'unlocked';
  return e.cards >= pd.hidden.unlockFragments ? 'ok' : 'fragments';
}

/** 조각 unlockFragments개로 해방 → Lv1. 못 하면 이유 */
export function unlockHidden(state: ProgressState, pd: ProgressionData, tower: Pick<TowerData, 'id' | 'grade'>): UnlockCheck {
  const why = checkUnlock(state, pd, tower);
  if (why !== 'ok') return why;
  const e = state.heroes[tower.id] as HeroEntry;
  e.cards -= pd.hidden.unlockFragments;
  e.level = 1;
  return 'ok';
}

// ---------------------------------------------------------------------------
// 굴림 · 받기
// ---------------------------------------------------------------------------

/** 계정 굴림 하나 (rolls를 1 올린다) */
export function accountRng(state: ProgressState, name: string): Rng {
  const r = new Rng(deriveSeed(state.seed, `${name}:${state.rolls}`));
  state.rolls += 1;
  return r;
}

/** 카드 n장: 등급을 가중치로, 그 등급(히든 제외) 타워 중 균등. 결과는 데이터 순서 */
export function rollCards(rng: Rng, data: Pick<GameData, 'towers'>, weights: Partial<Record<Grade, number>>, n: number): { id: string; n: number }[] {
  const byGrade = new Map<Grade, string[]>();
  for (const t of data.towers.towers) {
    if (t.grade === 'hidden') continue;
    const list = byGrade.get(t.grade) ?? [];
    list.push(t.id);
    byGrade.set(t.grade, list);
  }
  const grades = (Object.keys(weights) as Grade[]).filter((g) => (weights[g] ?? 0) > 0 && (byGrade.get(g)?.length ?? 0) > 0).sort();
  const counts = new Map<string, number>();
  if (grades.length === 0) return [];
  const w = grades.map((g) => weights[g] as number);
  for (let i = 0; i < n; i++) {
    const g = grades[rng.weightedIndex(w)] as Grade;
    const id = rng.pick(byGrade.get(g) as string[]);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return data.towers.towers.filter((t) => counts.has(t.id)).map((t) => ({ id: t.id, n: counts.get(t.id) as number }));
}

/** 조각 n개: 잠긴 히든 중 무작위 (모두 해방했으면 모든 히든 중 — 레벨업 재료) */
export function rollFragments(rng: Rng, state: ProgressState, data: Pick<GameData, 'towers'>, n: number): { id: string; n: number }[] {
  const locked = lockedHiddenIds(state, data);
  const pool = locked.length > 0 ? locked : data.towers.towers.filter((t) => t.grade === 'hidden').map((t) => t.id).sort();
  if (pool.length === 0 || n <= 0) return [];
  const counts = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const id = rng.pick(pool);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.keys()].sort().map((id) => ({ id, n: counts.get(id) as number }));
}

/** 카드 넣기: 미보유 영웅이면 첫 장으로 영입(Lv1)하고 나머지를 카드로. 히든은 조각으로 쌓기만 (해방은 따로) */
export function addCards(state: ProgressState, data: Pick<GameData, 'towers'>, list: readonly { id: string; n: number }[], grant: Grant): void {
  for (const { id, n } of list) {
    const t = data.towers.towers.find((x) => x.id === id);
    if (!t || n <= 0) continue;
    const e = (state.heroes[id] ??= { level: 0, cards: 0 });
    if (t.grade === 'hidden') {
      e.cards += n;
      const f = grant.fragments.find((x) => x.id === id);
      if (f) f.n += n;
      else grant.fragments.push({ id, n });
      continue;
    }
    const isNew = e.level < 1;
    if (isNew) {
      e.level = 1;
      e.cards += n - 1;
    } else e.cards += n;
    const c = grant.cards.find((x) => x.id === id);
    if (c) c.n += n;
    else grant.cards.push({ id, n, isNew });
  }
}

/** 보상 하나 받기 (골드·보석·카드·조각). 카드·조각은 rng로 굴린다 */
export function applyReward(
  state: ProgressState,
  pd: ProgressionData,
  data: Pick<GameData, 'towers'>,
  spec: RewardSpec,
  rng: Rng,
  weights: Partial<Record<Grade, number>> = pd.matchRewards.cardGradeWeights,
  grant: Grant = emptyGrant(),
): Grant {
  if (spec.gold) {
    state.gold += spec.gold;
    grant.gold += spec.gold;
  }
  if (spec.gems) {
    state.gems += spec.gems;
    grant.gems += spec.gems;
  }
  if (spec.flame) {
    state.flame += spec.flame;
    grant.flame += spec.flame;
  }
  if (spec.cards) addCards(state, data, rollCards(rng.fork('cards'), data, weights, spec.cards), grant);
  if (spec.fragments) addCards(state, data, rollFragments(rng.fork('fragments'), state, data, spec.fragments), grant);
  return grant;
}

// ---------------------------------------------------------------------------
// 판 정산
// ---------------------------------------------------------------------------

/** 도달 단계 → 영웅 카드 장수 (cardsByStage에서 단계 이하 가장 큰 행) */
export function cardsForStage(pd: ProgressionData, stage: number): number {
  let n = 0;
  for (const [from, cards] of pd.matchRewards.cardsByStage) if (stage >= from) n = cards;
  return n;
}

/** 판 결과 → 보상 미리 계산 (상태를 바꾸지 않는 수치만: 경험치·골드·🔥 불꽃·카드 장수·조각 수) */
export function matchRewardSpec(pd: ProgressionData, stage: number, bossKills: number, newBest: boolean): { xp: number; gold: number; flame: number; cards: number; fragments: number } {
  const r = pd.matchRewards;
  if (stage < r.minStage) return { xp: 0, gold: 0, flame: 0, cards: 0, fragments: 0 };
  return {
    xp: r.xpPerStage * stage + r.xpPerBoss * bossKills + (newBest ? r.xpNewBest : 0),
    gold: r.goldPerStage * stage + r.goldPerBoss * bossKills,
    flame: r.flamePerStage * stage + r.flamePerBoss * bossKills,
    cards: cardsForStage(pd, stage),
    fragments: r.fragmentsPerBoss * bossKills,
  };
}

/** 판 결과의 굴림 시드: 판 시드 + 도달 단계 + 보스 처치 (같은 결과 = 같은 카드) */
export function matchRewardSeed(result: Pick<MatchResult, 'seed' | 'stage' | 'bossKills' | 'mode'>): number {
  return deriveSeed(result.seed >>> 0, `reward:${result.mode}:${result.stage}:${result.bossKills}`);
}

function addStats(block: StatBlock, r: MatchResult): void {
  block.matches += 1;
  block.summons += r.summons;
  block.merges += r.merges;
  block.bossKills += r.bossKills;
  if (r.mode === 'infinite') block.bestWave = Math.max(block.bestWave, r.stage);
}

/**
 * 판 정산 (패배 화면): 경험치·골드·🔥 불꽃(도달 웨이브 × flamePerStage + 보스 × flamePerBoss)·영웅 카드·리미티드 조각, 최고 웨이브, 누적·오늘 기록, 모집 게이지.
 * 같은 runId는 한 번만 (두 번째는 null). today = 기기 날짜 'YYYY-MM-DD' (오늘 기록, 과거로 돌린 시계면 오늘 기록은 세지 않음).
 */
export function settleMatch(state: ProgressState, pd: ProgressionData, data: Pick<GameData, 'towers'>, result: MatchResult, today: string): MatchSettlement | null {
  if (state.rewardedRuns.includes(result.runId)) return null;
  state.rewardedRuns = [...state.rewardedRuns, result.runId].slice(-REWARDED_RUNS_KEEP);
  const stage = Math.max(0, result.stage);
  const newBest = result.mode === 'infinite' && stage > state.bestWave;
  const spec = matchRewardSpec(pd, stage, result.bossKills, newBest);
  const rng = new Rng(matchRewardSeed(result));
  const grant = emptyGrant();
  addXp(state, pd, spec.xp, grant);
  applyReward(state, pd, data, { gold: spec.gold, flame: spec.flame, cards: spec.cards, fragments: spec.fragments }, rng, pd.matchRewards.cardGradeWeights, grant);
  if (result.mode === 'infinite') state.bestWave = Math.max(state.bestWave, stage);
  addStats(state.totals, result);
  if (refreshDaily(state, today)) addStats(state.daily.stats, result);
  const total = state.recruitSummons + Math.max(0, result.summons);
  const recruitGain = Math.floor(total / pd.recruit.summonsPerPoint);
  state.recruit += recruitGain;
  state.recruitSummons = total % pd.recruit.summonsPerPoint;
  return { grant, stage, bestWave: state.bestWave, newBest, recruitGain };
}

// ---------------------------------------------------------------------------
// 웨이브 길 (최고 웨이브 보상)
// ---------------------------------------------------------------------------

export type MilestoneState = 'claimed' | 'ready' | 'locked';

export function milestoneState(state: ProgressState, wave: number): MilestoneState {
  if (state.claimedWaves.includes(wave)) return 'claimed';
  return state.bestWave >= wave ? 'ready' : 'locked';
}

export function claimMilestone(state: ProgressState, pd: ProgressionData, data: Pick<GameData, 'towers'>, wave: number): Grant | null {
  const m = pd.waveRoad.milestones.find((x) => x.wave === wave);
  if (!m || milestoneState(state, wave) !== 'ready') return null;
  state.claimedWaves = [...state.claimedWaves, wave].sort((a, b) => a - b);
  return applyReward(state, pd, data, m.reward, accountRng(state, `wave:${wave}`));
}

/**
 * 웨이브 길 모두 받기 (피드백 #57): [받기] 하나를 누르면 받을 수 있는 이정표를 낮은 웨이브부터 전부 받는다.
 * 아래에서부터 하나씩 받은 것과 같은 순서라 굴림 결과도 같다. 받은 웨이브와 합친 Grant, 받을 것이 없으면 null.
 */
export function claimAllMilestones(state: ProgressState, pd: ProgressionData, data: Pick<GameData, 'towers'>): { waves: number[]; grant: Grant } | null {
  const waves: number[] = [];
  const got: Grant[] = [];
  for (const m of [...pd.waveRoad.milestones].sort((a, b) => a.wave - b.wave)) {
    const g = claimMilestone(state, pd, data, m.wave);
    if (!g) continue;
    waves.push(m.wave);
    got.push(g);
  }
  return got.length === 0 ? null : { waves, grant: mergeGrants(got) };
}

export function readyMilestones(state: ProgressState, pd: ProgressionData): number {
  return pd.waveRoad.milestones.filter((m) => milestoneState(state, m.wave) === 'ready').length;
}

// ---------------------------------------------------------------------------
// 영웅 모집 게이지
// ---------------------------------------------------------------------------

export function claimRecruit(state: ProgressState, pd: ProgressionData, data: Pick<GameData, 'towers'>): Grant | null {
  if (state.recruit < pd.recruit.goal) return null;
  state.recruit -= pd.recruit.goal;
  return applyReward(state, pd, data, pd.recruit.reward, accountRng(state, 'recruit'), pd.recruit.weights);
}

// ---------------------------------------------------------------------------
// 퀘스트 (일일 · 업적)
// ---------------------------------------------------------------------------

/**
 * 오늘 기록 맞추기: 날짜가 바뀌었으면(앞으로) 오늘 기록·받은 일일 퀘스트를 비운다. 시계가 과거로 갔으면 비우지 않고 false
 * (그동안 오늘 기록은 세지 않음 — PROGRESSION 11장 '기기 시간을 과거로 돌리면 멈춤'). 오늘 기록을 쓸 수 있으면 true.
 */
export function refreshDaily(state: ProgressState, today: string): boolean {
  if (state.daily.date === today) return true;
  if (state.daily.date !== '' && today < state.daily.date) return false;
  state.daily = { date: today, stats: emptyStats(), claimed: [], bonusClaimed: false };
  return true;
}

export interface QuestView {
  quest: QuestData;
  progress: number;
  done: boolean;
  claimed: boolean;
}

function statOf(state: ProgressState, stat: QuestStat, block: StatBlock): number {
  return stat === 'heroLevelSum' ? heroLevelSum(state) : block[stat];
}

export function dailyQuests(state: ProgressState, pd: ProgressionData, today: string): QuestView[] {
  const current = state.daily.date === today;
  return pd.quests.daily.map((q) => {
    const v = current ? statOf(state, q.stat, state.daily.stats) : 0;
    return { quest: q, progress: Math.min(v, q.target), done: v >= q.target, claimed: current && state.daily.claimed.includes(q.id) };
  });
}

export function achievementQuests(state: ProgressState, pd: ProgressionData): QuestView[] {
  return pd.quests.achievements.map((q) => {
    const v = statOf(state, q.stat, state.totals);
    return { quest: q, progress: Math.min(v, q.target), done: v >= q.target, claimed: state.achievements.includes(q.id) };
  });
}

/** 일일 퀘스트를 모두 받았고 보너스는 아직 → 받을 수 있음 */
export function dailyBonusReady(state: ProgressState, pd: ProgressionData, today: string): boolean {
  return state.daily.date === today && !state.daily.bonusClaimed && pd.quests.daily.every((q) => state.daily.claimed.includes(q.id));
}

export function claimQuest(state: ProgressState, pd: ProgressionData, data: Pick<GameData, 'towers'>, id: string, today: string): Grant | null {
  const daily = pd.quests.daily.find((q) => q.id === id);
  if (daily) {
    const v = dailyQuests(state, pd, today).find((x) => x.quest.id === id);
    if (!v || !v.done || v.claimed) return null;
    state.daily.claimed = [...state.daily.claimed, id].sort();
    return applyReward(state, pd, data, daily.reward, accountRng(state, `daily:${id}`));
  }
  const ach = achievementQuests(state, pd).find((x) => x.quest.id === id);
  if (!ach || !ach.done || ach.claimed) return null;
  state.achievements = [...state.achievements, id].sort();
  return applyReward(state, pd, data, ach.quest.reward, accountRng(state, `ach:${id}`));
}

export function claimDailyBonus(state: ProgressState, pd: ProgressionData, data: Pick<GameData, 'towers'>, today: string): Grant | null {
  if (!dailyBonusReady(state, pd, today)) return null;
  state.daily.bonusClaimed = true;
  return applyReward(state, pd, data, pd.quests.dailyAllBonus, accountRng(state, 'dailyBonus'));
}

/**
 * 퀘스트 모두 받기 (피드백 #11): 일일(데이터 순) → 오늘 보너스 → 업적(데이터 순).
 * 화면 위에서부터 하나씩 받은 것과 같은 순서라 굴림 결과도 같다. 받은 것들을 한 Grant로 합친다. 받을 것이 없으면 null.
 */
export function claimAllQuests(state: ProgressState, pd: ProgressionData, data: Pick<GameData, 'towers'>, today: string): Grant | null {
  const got: Grant[] = [];
  const add = (g: Grant | null): void => {
    if (g) got.push(g);
  };
  // 카드 보상으로 새 영웅이 생기면 '영웅 레벨 합계' 업적이 새로 끝날 수 있어 받을 것이 없을 때까지 돈다 (받을 때마다 하나씩 줄어 끝난다)
  // 한 바퀴에 아무것도 못 받았으면 멈춘다 (검토 L1 — 셀 수는 있는데 받을 수 없는 퀘스트가 생겨도 끝없이 돌지 않게)
  while (claimableQuests(state, pd, today) > 0) {
    const before = got.length;
    for (const q of dailyQuests(state, pd, today)) if (q.done && !q.claimed) add(claimQuest(state, pd, data, q.quest.id, today));
    add(claimDailyBonus(state, pd, data, today));
    for (const q of achievementQuests(state, pd)) if (q.done && !q.claimed) add(claimQuest(state, pd, data, q.quest.id, today));
    if (got.length === before) break;
  }
  return got.length === 0 ? null : mergeGrants(got);
}

/** 여러 Grant를 하나로 (카드·조각은 같은 id끼리 합침, 처음 나온 순서) */
function mergeGrants(got: Grant[]): Grant {
  const total = emptyGrant();
  for (const g of got) {
    total.xp += g.xp;
    total.gold += g.gold;
    total.gems += g.gems;
    total.flame += g.flame;
    total.levelUps.push(...g.levelUps);
    for (const c of g.cards) {
      const t = total.cards.find((x) => x.id === c.id);
      if (t) t.n += c.n;
      else total.cards.push({ ...c });
    }
    for (const f of g.fragments) {
      const t = total.fragments.find((x) => x.id === f.id);
      if (t) t.n += f.n;
      else total.fragments.push({ ...f });
    }
  }
  return total;
}

/** 받을 수 있는 퀘스트 수 (빨간 점) */
export function claimableQuests(state: ProgressState, pd: ProgressionData, today: string): number {
  const d = dailyQuests(state, pd, today).filter((q) => q.done && !q.claimed).length;
  const a = achievementQuests(state, pd).filter((q) => q.done && !q.claimed).length;
  return d + a + (dailyBonusReady(state, pd, today) ? 1 : 0);
}

// ---------------------------------------------------------------------------
// 상점 (게임 안 화폐만)
// ---------------------------------------------------------------------------

export type BuyCheck = 'ok' | 'gold' | 'gems' | 'unknown';

export function checkBuy(state: ProgressState, item: ShopItemData | undefined): BuyCheck {
  if (!item) return 'unknown';
  if (item.price.gold !== undefined && state.gold < item.price.gold) return 'gold';
  if (item.price.gems !== undefined && state.gems < item.price.gems) return 'gems';
  return 'ok';
}

export function buyShopItem(state: ProgressState, pd: ProgressionData, data: Pick<GameData, 'towers'>, itemId: string): Grant | Exclude<BuyCheck, 'ok'> {
  const item = pd.shop.find((x) => x.id === itemId);
  const why = checkBuy(state, item);
  if (why !== 'ok' || !item) return why === 'ok' ? 'unknown' : why;
  if (item.price.gold !== undefined) state.gold -= item.price.gold;
  if (item.price.gems !== undefined) state.gems -= item.price.gems;
  const spec: RewardSpec = { ...(item.cards ? { cards: item.cards } : {}), ...(item.fragments ? { fragments: item.fragments } : {}), ...(item.gold ? { gold: item.gold } : {}) };
  return applyReward(state, pd, data, spec, accountRng(state, `shop:${item.id}`), item.weights ?? pd.matchRewards.cardGradeWeights);
}

// ---------------------------------------------------------------------------
// 기타
// ---------------------------------------------------------------------------

/** 새 계정 시드 (부르는 쪽이 Date·Math.random 등으로 만든 값을 섞는다) */
export function accountSeedFrom(text: string): number {
  return fnv1a32(text) >>> 0;
}

/** 모드 탭이 열렸는가 (계정 레벨) */
export function modeUnlocked(state: ProgressState, mode: { unlockLevel: number }): boolean {
  return state.level >= mode.unlockLevel;
}
