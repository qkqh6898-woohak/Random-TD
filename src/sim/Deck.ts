/**
 * 덱 모델 (DEV_PLAN M3-3, GDD 4.2·4.4).
 *
 * - 덱 = 등급별 5종(노말·레어·유니크·히어로·레전드), 총 25종. 판 시작 때 정해져 바뀌지 않는다 (MatchContext.decks, 해시 밖).
 * - 기본 덱 = towers.json에서 처음부터 해금된(unlock = 'base') 25종 = decks.json base (데이터 검사가 두 방향 모두 확인).
 * - 소환: 덱의 노말 5종 중 균등 (Summon). 승급: **덱의 다음 등급** 5종 중 균등.
 * - 신 타워: 덱과 무관하게 소환·승급마다 0.01% (신 3종 중 균등). 판정은 확률과 상관없이 매번 난수 1개를 쓴다
 *   → 확률 데이터가 바뀌어도 소환·승급 흐름의 난수 사용 횟수가 같다 (Summon과 같은 규칙).
 * - 레전드·신·히든은 승급할 수 없다 (레전드는 히든 재료, GDD 4.4).
 * - 행운의 여신 '2등급 상승'(M3-9): 승급 결과가 다음 등급 대신 그다음 등급 (노말 → 유니크 …, 레전드를 넘지 않음).
 *   예언자 '결과 2개 중 선택'은 해금 타워(M7-2).
 * 난수는 플레이어별 소환·승급 흐름(`p{n}.summon`)만 쓴다 (MULTIPLAYER.md 4.2 'P1 소환·승급').
 */
import { DECK_GRADES, type DeckGrade } from '../data/deck';
import type { Grade } from '../data/load';
import type { Rng } from './Rng';
import type { Deck, MatchRules } from './rules';
import { rollChanceBp } from './systems/Damage';

export { DECK_GRADES, type DeckGrade };

/** 덱 등급인가 (노말~레어~유니크~히어로~레전드). 신·히든은 아니다. */
export function isDeckGrade(grade: string): grade is DeckGrade {
  return (DECK_GRADES as readonly string[]).includes(grade);
}

/** 승급 결과 등급: 노말 → 레어 → 유니크 → 히어로 → 레전드. 레전드·신·히든은 null (승급 불가). */
export function nextGrade(grade: Grade): DeckGrade | null {
  if (!isDeckGrade(grade)) return null;
  const i = DECK_GRADES.indexOf(grade);
  return i >= 0 && i < DECK_GRADES.length - 1 ? (DECK_GRADES[i + 1] as DeckGrade) : null;
}

/** 이 등급의 타워를 승급할 수 있는가 (레전드·신·히든 불가). */
export function canMergeGrade(grade: Grade): boolean {
  return nextGrade(grade) !== null;
}

/** 덱의 그 등급 타워 목록. */
export function deckTowers(deck: Deck, grade: DeckGrade): readonly string[] {
  return deck[grade];
}

/** 승급하면 나올 수 있는 타워 (덱의 다음 등급 5종). 승급할 수 없으면 빈 배열. 정보 패널 미리 보기용. */
export function mergeOutcomes(deck: Deck, grade: Grade): readonly string[] {
  const g = nextGrade(grade);
  return g ? deck[g] : [];
}

/** 승급 판정 결과. */
export interface MergeRoll {
  tower: string;
  god: boolean;
  /** 2등급 상승이었는가 (행운의 여신) */
  double: boolean;
}

/**
 * 승급 결과 고르기: ① 신 타워 0.01% (난수 1개, 확률이 0이어도 쓴다) → ② 2등급 상승 (행운의 여신, 그다음 등급이 덱에 있을 때만.
 * 확률이 0이거나 해당 없으면 난수를 쓰지 않음) → ③ 덱의 다음 등급 5종 균등.
 * 승급할 수 없는 등급이거나 덱의 다음 등급이 비어 있으면 에러 (명령 실행 전에 검사한다).
 * @param doubleBp 2등급 상승 확률 (bp)
 */
export function rollMerge(rng: Rng, rules: MatchRules, deck: Deck, grade: Grade, doubleBp = 0): MergeRoll {
  const g = nextGrade(grade);
  if (!g) throw new Error(`승급할 수 없는 등급: ${grade}`);
  const pool = deck[g];
  if (pool.length === 0) throw new Error(`덱의 ${g} 등급이 비어 있다`);
  const god = rng.chanceBp(rules.godChanceBp);
  if (god && rules.godTowers.length > 0) return { tower: rng.pick(rules.godTowers), god: true, double: false };
  const g2 = nextGrade(g);
  if (doubleBp > 0 && g2 && deck[g2].length > 0 && rollChanceBp(rng, doubleBp)) return { tower: rng.pick(deck[g2]), god: false, double: true };
  return { tower: rng.pick(pool), god: false, double: false };
}
