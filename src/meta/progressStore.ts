/**
 * 판 밖 성장 저장소 (G-3): ProgressState를 KeyValueStorage에 두고, 화면이 부르는 동작(레벨업·받기·사기·해방·판 정산)을 묶는다.
 *
 * - 키 `rtd.progress` = JSON { v: 1, … } (src/meta/progress.ts). **개발자 모드는 `rtd.progress.dev`** — 치트(⏭·💰+)로 얻은 보상이
 *   일반 계정에 섞이지 않게 (판 저장 `rtd.match` / `rtd.match.dev`와 같은 방식).
 * - 처음(키가 없을 때): 예전 키에서 옮긴다 — `rtd.account`의 레벨(v1), `rtd.records`의 무한 최고 단계 → 최고 웨이브.
 *   예전 키는 지우거나 바꾸지 않는다 (전투 기록·효과음·화면 흔들림·설정·판 저장 그대로).
 * - 날짜(일일 퀘스트)는 기기 시계의 지역 날짜 'YYYY-MM-DD' — sim 밖이라 Date를 쓸 수 있다 (테스트는 now를 넣는다).
 * - 바뀔 때마다 바로 쓴다. 쓰기 실패는 삼킨다 (메모리 사본으로 이어 감 — BrowserStorage).
 */
import type { GameData, TowerData } from '../data/load';
import { ACCOUNT_KEY } from './account';
import { RECORDS_KEY, parseRecord } from '../save/BattleRecords';
import type { KeyValueStorage } from '../save/storage';
import type { ProgressionData } from './progressionData';
import {
  accountSeedFrom,
  buyShopItem,
  claimDailyBonus,
  claimMilestone,
  claimQuest,
  claimRecruit,
  heroMatchLevels,
  levelUpHero,
  lockedHiddenIds,
  parseProgress,
  refreshDaily,
  serializeProgress,
  settleMatch,
  unlockHidden,
  type Grant,
  type MatchResult,
  type MatchSettlement,
  type ProgressState,
} from './progress';

export const PROGRESS_KEY = 'rtd.progress';
export const PROGRESS_KEY_DEV = 'rtd.progress.dev';

/** 기기 지역 날짜 'YYYY-MM-DD' */
export function localDateKey(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 예전 저장에서 옮길 값 (rtd.account 레벨, rtd.records 최고 단계) */
export function readLegacy(storage: KeyValueStorage): { level?: number; bestWave?: number } {
  const out: { level?: number; bestWave?: number } = {};
  try {
    const raw = storage.getItem(ACCOUNT_KEY);
    if (raw) {
      const o = JSON.parse(raw) as { level?: unknown };
      if (Number.isSafeInteger(o.level) && (o.level as number) >= 1) out.level = o.level as number;
    }
  } catch {
    // 망가진 계정 저장: 옮기지 않음
  }
  try {
    const best = parseRecord(storage.getItem(RECORDS_KEY)).bestStage;
    if (best > 0) out.bestWave = best;
  } catch {
    // 옮기지 않음
  }
  return out;
}

export interface ProgressStoreOptions {
  dev?: boolean;
  /** 지금 시각 (테스트용) */
  now?: () => Date;
  /** 새 계정 시드 (테스트용). 없으면 시각 + Math.random (sim 밖) */
  seed?: number;
}

export class ProgressStore {
  readonly key: string;
  readonly state: ProgressState;
  /** 처음 만든 계정인가 (저장 키가 없었음) */
  readonly created: boolean;
  private readonly listeners = new Set<() => void>();
  private readonly now: () => Date;

  constructor(
    private readonly storage: KeyValueStorage,
    readonly pd: ProgressionData,
    readonly data: GameData,
    opts: ProgressStoreOptions = {},
  ) {
    this.key = opts.dev ? PROGRESS_KEY_DEV : PROGRESS_KEY;
    this.now = opts.now ?? (() => new Date());
    let raw: string | null = null;
    try {
      raw = storage.getItem(this.key);
    } catch {
      raw = null;
    }
    this.created = raw === null;
    const seed = opts.seed ?? accountSeedFrom(`${this.now().getTime()}:${Math.random()}`);
    // 개발자 계정은 일반 계정 기록을 옮기지 않는다 (따로 시작)
    this.state = parseProgress(raw, pd, data, seed, opts.dev ? {} : readLegacy(storage));
    refreshDaily(this.state, this.today());
    this.save();
  }

  today(): string {
    return localDateKey(this.now());
  }

  /** 계정 레벨 (도박 테이블·배속 해금 — 판 시작 때 sim 입력) */
  level(): number {
    return this.state.level;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private save(): void {
    try {
      this.storage.setItem(this.key, serializeProgress(this.state));
    } catch {
      // 저장 실패는 게임을 막지 않는다
    }
  }

  private changed(): void {
    this.save();
    for (const fn of [...this.listeners]) fn();
  }

  private tower(id: string): TowerData | undefined {
    return this.data.towers.towers.find((t) => t.id === id);
  }

  /** 날짜가 바뀌었으면 오늘 기록을 비운다 (로비를 열 때) */
  refresh(): void {
    const before = this.state.daily.date;
    refreshDaily(this.state, this.today());
    if (before !== this.state.daily.date) this.changed();
  }

  /**
   * 판 입력 (G-1·전투가 createMatch에 펼쳐 넣는다): 영웅 레벨 → levels, 잠긴 히든 → lockedHidden.
   * 개발자 판은 히든을 잠그지 않는다 (개발 도구로 히든 조합을 확인할 수 있게).
   */
  matchOptions(dev: boolean): { levels: Record<string, number>[]; lockedHidden?: string[][] } {
    const levels = [heroMatchLevels(this.state, this.pd, this.data)];
    if (dev) return { levels };
    const locked = lockedHiddenIds(this.state, this.data);
    return locked.length > 0 ? { levels, lockedHidden: [locked] } : { levels };
  }

  settle(result: MatchResult): MatchSettlement | null {
    const r = settleMatch(this.state, this.pd, this.data, result, this.today());
    if (r) this.changed();
    return r;
  }

  levelUp(id: string): ReturnType<typeof levelUpHero> {
    const t = this.tower(id);
    if (!t) return 'notOwned';
    const r = levelUpHero(this.state, this.pd, t);
    if (typeof r === 'number') this.changed();
    return r;
  }

  unlock(id: string): ReturnType<typeof unlockHidden> {
    const t = this.tower(id);
    if (!t) return 'notHidden';
    const r = unlockHidden(this.state, this.pd, t);
    if (r === 'ok') this.changed();
    return r;
  }

  claimMilestone(wave: number): Grant | null {
    return this.after(claimMilestone(this.state, this.pd, this.data, wave));
  }

  claimRecruit(): Grant | null {
    return this.after(claimRecruit(this.state, this.pd, this.data));
  }

  claimQuest(id: string): Grant | null {
    return this.after(claimQuest(this.state, this.pd, this.data, id, this.today()));
  }

  claimDailyBonus(): Grant | null {
    return this.after(claimDailyBonus(this.state, this.pd, this.data, this.today()));
  }

  buy(itemId: string): ReturnType<typeof buyShopItem> {
    const r = buyShopItem(this.state, this.pd, this.data, itemId);
    if (typeof r !== 'string') this.changed();
    return r;
  }

  /** 개발자 모드 로비 [🛠 +재화]: 골드·보석·카드·조각 (개발자 계정 슬롯에만) */
  devGrant(): void {
    this.state.gold += 10000;
    this.state.gems += 1000;
    for (const t of this.data.towers.towers) {
      const e = (this.state.heroes[t.id] ??= { level: 0, cards: 0 });
      e.cards += t.grade === 'hidden' ? this.pd.hidden.unlockFragments : 20;
      if (t.grade !== 'hidden' && e.level < 1) e.level = 1;
    }
    this.changed();
  }

  private after(g: Grant | null): Grant | null {
    if (g) this.changed();
    return g;
  }
}
