/**
 * 타워 겉모습 규칙 (Phaser 없음 → 단위 테스트). 그리기는 art/towers.ts.
 * 색·모양은 화면 표현 상수라 코드에 둔다 (종족 색은 towers.json factions에서 읽는다).
 */
import type { Grade } from '../data/load';

/** 소품 종류 (chibi.ts ChibiProp과 같은 값) */
export type TowerProp = 'sword' | 'bow' | 'pickaxe' | 'staff' | 'dagger' | 'none';

/** 타워 id → 소품 */
export const TOWER_PROPS: Readonly<Record<string, TowerProp>> = {
  miner: 'pickaxe',
  goblin: 'dagger',
  archer: 'bow',
  apprentice: 'staff',
  warrior: 'sword',
  duelist: 'dagger',
  merchant: 'none',
  sniper: 'bow',
  blacksmith: 'pickaxe',
  assassin: 'dagger',
};

/** 모자 색: 광부 헬멧(노랑 + 이마 등), 마법 타워 두건(보라 쪽으로 섞음) — 같은 종족 색끼리도 직업이 구별되게 */
export const HELMET_COLOR = 0xf2c230;
export const MAGIC_HOOD = 0x6a3fc8;

/** 신·히든처럼 towers.json factions에 없는 종족의 몸 색 */
export const SPECIAL_FACTION_COLORS: Readonly<Record<string, string>> = {
  ancient: '#E9DFFF',
  alliance: '#2A2A3A',
};

/** 등급 → 머리 위 별 수 (신·히든은 1개) */
export const GRADE_STARS: Readonly<Record<Grade, number>> = { normal: 1, rare: 2, unique: 3, hero: 4, legend: 5, god: 1, hidden: 1 };

export interface TowerLookInput {
  id: string;
  grade: Grade;
  faction: string;
  damageType: string;
  shape: string;
}

/** 표에 없으면 피해·공격 형태로 소품을 고른다. */
export function propFor(t: Pick<TowerLookInput, 'id' | 'damageType' | 'shape'>): TowerProp {
  const mapped = TOWER_PROPS[t.id];
  if (mapped) return mapped;
  if (t.damageType === 'magic') return 'staff';
  if (t.shape === 'melee' || t.shape === 'melee_aoe') return 'sword';
  return 'bow';
}

