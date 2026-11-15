/**
 * 캐릭터 카드 글자 (HF-2, 순수 — DOM·Phaser 없음 → 단위 테스트). 정보 패널의 [ℹ]로 연다.
 * 사용자 요청: '타워의 설명으로 그 캐릭터의 설명창이 있으면 좋겠어'.
 *
 *   [큰 초상]  ★★ 이름
 *   등급 · 종족 · 원소
 *   lore (어떤 인물인가) / role (전투에서 하는 일)
 *   능력치 (정보 패널과 같은 지금 값) · 감지 · 대상
 *   특색/능력 · 각성
 */
import type { TowerData } from '../../data/load';
import { GRADE_NAMES, shortFactionName, type StatCell, type TowerPanelModel } from './towerPanelModel';

export interface CharacterCardModel {
  towerId: string;
  name: string;
  stars: string;
  gradeColor: string;
  /** 등급 · 종족 · 원소 (원소가 없으면 빼고) */
  tagline: string;
  lore: string;
  role: string;
  stats: StatCell[][];
  detect: string;
  target: string;
  abilityLabel: string;
  ability: string;
  /** 각성 효과 ('' = 각성 없음) */
  awaken: string;
  /** 각성한 모습으로 보여 주나 (타워 성장 Lv15, M8) */
  awakened: boolean;
}

export interface CharacterCardInput {
  data: Pick<TowerData, 'id' | 'grade' | 'awaken'>;
  /** 같은 타워의 정보 패널 글자 (이름·별·능력치·특색은 그대로 쓴다) */
  panel: TowerPanelModel;
  factionName: string;
  /** 원소 이름 (towers.json elements, 없으면 null) */
  elementName: string | null;
  awakened?: boolean;
}

/** 각성 줄: '—'·빈 값은 각성 없음 */
function awakenText(v: string): string {
  const t = v.trim();
  return t === '' || t === '—' || t === '-' ? '' : t;
}

export function characterCardModel(input: CharacterCardInput): CharacterCardModel {
  const { data, panel } = input;
  const parts = [GRADE_NAMES[data.grade], shortFactionName(input.factionName)];
  if (input.elementName) parts.push(input.elementName);
  return {
    towerId: data.id,
    name: panel.name,
    stars: panel.stars,
    gradeColor: panel.gradeColor,
    tagline: parts.join(' · '),
    lore: panel.lore,
    role: panel.role,
    stats: panel.stats,
    detect: panel.detect,
    target: panel.target,
    abilityLabel: panel.abilityLabel,
    ability: panel.ability,
    awaken: awakenText(data.awaken),
    awakened: input.awakened === true,
  };
}
