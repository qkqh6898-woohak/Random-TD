/**
 * 고르기 창 내용 (순수 함수, DOM 없음 → 단위 테스트): 보스 카드 묶음·승급의 축복 선택 → 제목·선택지 글자.
 */
import type { CardOffer, MergePick } from '../../sim/state';
import type { MatchRules } from '../../sim/rules';
import { CARD_PICK_TITLE, MERGE_PICK_TITLE } from '../messages';

export interface ChoiceOption {
  title: string;
  desc: string;
  /** 위쪽 작은 표시 ('희귀' · '지금') */
  badge: string;
  icon: string;
  rare: boolean;
  /** 승급의 축복: 지금 놓인 결과 */
  current: boolean;
}

export interface ChoiceModel {
  kind: 'card' | 'merge';
  /** 같은 선택인지 (바뀌면 창을 새로 띄운다) */
  key: string;
  title: string;
  sub: string;
  options: ChoiceOption[];
}

/** 카드 효과 종류 → 그림 글자 */
const CARD_ICONS: Readonly<Record<string, string>> = {
  atkPct: '⚔',
  goldPerBoss: '💰',
  rareSummons: '🍀',
  workerMul: '👷',
  quake: '🌋',
  summonDiscount: '🏷',
  mobSlow: '🕸',
  freeWorkers: '🧑‍🔧',
  mergeChoice: '✨',
  twinSummon: '👯',
  godMul: '👑',
  goldPct: '🪙',
};

/** 보스 카드 묶음 → 고르기 창 (카드 순서 그대로, 희귀는 표시). */
export function cardChoiceModel(rules: Pick<MatchRules, 'cardById'>, offer: CardOffer): ChoiceModel {
  return {
    kind: 'card',
    key: `card:${offer.boss}:${offer.cards.join(',')}`,
    title: CARD_PICK_TITLE,
    sub: `${offer.boss * 10}단계 보스 보상 · 고르는 동안에도 시간이 흘러요`,
    options: offer.cards.map((id) => {
      const c = rules.cardById.get(id);
      return {
        title: c?.name ?? id,
        desc: c?.desc ?? '',
        badge: c?.rare ? '희귀' : '일반',
        icon: CARD_ICONS[c?.type ?? ''] ?? '🃏',
        rare: c?.rare === true,
        current: false,
      };
    }),
  };
}

/** 등급 → 한국어 */
const GRADE_NAMES: Readonly<Record<string, string>> = { normal: '노말', rare: '레어', unique: '유니크', hero: '히어로', legend: '레전드', god: '신', hidden: '히든' };

/** 승급의 축복 선택 → 고르기 창 (0 = 지금 결과 그대로, 1 = 다른 결과). */
export function mergeChoiceModel(rules: Pick<MatchRules, 'towers'>, pick: MergePick, currentTower: string): ChoiceModel {
  const cur = rules.towers.get(currentTower);
  const alt = rules.towers.get(pick.alt);
  return {
    kind: 'merge',
    key: `merge:${pick.id}:${pick.alt}`,
    title: MERGE_PICK_TITLE,
    sub: `${GRADE_NAMES[cur?.grade ?? ''] ?? ''} 승급 결과 2개 중 하나`,
    options: [
      { title: cur?.name ?? currentTower, desc: '지금 결과 그대로', badge: '지금', icon: '✅', rare: false, current: true },
      { title: alt?.name ?? pick.alt, desc: '이 타워로 바꾸기', badge: '바꾸기', icon: '🔄', rare: false, current: false },
    ],
  };
}
