/**
 * 타워 겉모습 규칙 (Phaser 없음 → 단위 테스트). 그리기는 art/towers.ts.
 * 색·모양은 화면 표현 상수라 코드에 둔다 (종족 색은 towers.json factions에서 읽는다).
 */
import type { Grade } from '../data/load';

export type TowerProp = 'sword' | 'bow' | 'pickaxe' | 'staff' | 'dagger' | 'spear' | 'rifle' | 'bomb' | 'book' | 'dice' | 'drum' | 'purse' | 'none';

/** 타워 id → 소품 */
export const TOWER_PROPS: Readonly<Record<string, TowerProp>> = {
  miner: 'pickaxe',
  goblin: 'dagger',
  archer: 'bow',
  apprentice: 'staff',
  warrior: 'sword',
  drummer: 'drum',
  spearman: 'spear',
  stonegolem: 'none',
  ninja: 'dagger',
  k9: 'rifle',
  duelist: 'dagger',
  merchant: 'purse',
  scout: 'rifle',
  gunner: 'rifle',
  dwarfbomber: 'bomb',
  gambler: 'dice',
  banker: 'purse',
  sniper: 'rifle',
  blacksmith: 'pickaxe',
  scholar: 'book',
  chronomancer: 'book',
  alchemist: 'bomb',
  artillery: 'rifle',
  assassin: 'dagger',
  fortuna: 'dice',
  spearsgod: 'spear',
  tycoon: 'purse',
  fate: 'dice',
  goldking: 'purse',
  timelord: 'book',
  goldbattery: 'rifle',
  fateseer: 'book',
  festival: 'drum',
};

/** 마법 계열은 지팡이의 수정 색으로 구분한다. */
export const STAFF_GEMS: Readonly<Record<string, number>> = {
  mudshaman: 0xe6a261,
  flamemage: 0xff9162,
  windarcher: 0xa9ffad,
  icemage: 0x8fecff,
  astrologer: 0xd9a6ff,
  lightning: 0xffe072,
  summoner: 0xb983ff,
  necromancer: 0x76e3ad,
  prophet: 0xffd978,
  archmage: 0xff7464,
  stormlord: 0x79a4ff,
  saint: 0xfff08a,
  dimensionist: 0xe986ff,
  elemental: 0x71ffcc,
  deathlord: 0xf083d0,
  stormavatar: 0x8ed1ff,
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

