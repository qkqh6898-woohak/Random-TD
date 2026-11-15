/** 장면들이 함께 쓰는 값. */
import type { GameData } from '../data/load';
import type { UiRoot } from '../ui/root';
import type { AccountStore } from '../meta/account';

export interface GameContext {
  data: GameData;
  ui: UiRoot;
  /** URL ?debug=1 — 개발용 치트·×3 배속 (CLAUDE.md 4장) */
  debug: boolean;
  /** URL ?seed=123 — 같은 판 재현용. 없으면 무작위 */
  seed: number | null;
  /** 계정 레벨 (M8 전까지 저장값이 없으면 1) — 도박 테이블·×3 배속 해금. 판 시작 때 sim에 입력으로 넘긴다 */
  accountLevel: number;
  /** 계정 저장소 (히든 미션 영구 기록, M5-6) */
  account: AccountStore;
  version: string;
}

/** URL 쿼리에서 설정 읽기. */
export function readUrlOptions(search: string): { debug: boolean; seed: number | null } {
  const p = new URLSearchParams(search);
  const seedRaw = p.get('seed');
  const seedNum = seedRaw !== null && /^\d{1,10}$/.test(seedRaw) ? Number(seedRaw) : null;
  return {
    debug: p.get('debug') === '1',
    seed: seedNum !== null && seedNum <= 0xffffffff ? seedNum : null,
  };
}
