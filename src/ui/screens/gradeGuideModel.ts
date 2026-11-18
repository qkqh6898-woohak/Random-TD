/**
 * 📘 등급·조합 설명 창 모델 (피드백 #24 '설명 버튼을 눌러 성급(등급) 표기나 조합식을 볼 수 있으면'). 순수 함수 (DOM 없음 → 단위 테스트).
 *
 * - 등급 줄: 낮음 → 높음. 순서는 towers.json baseDps(등급 기준 DPS)로 정한다 → 노말 < 레어 < 유니크 < 히어로 < 레전드 < 신화 < 신.
 *   색 = GRADE_COLORS, 별 = gradeStars(★ × n · 신 👑 · 신화 💠), 얻는 법 = 승급 규칙(game.json merge.count)·신 확률(summon.godChance).
 * - 신화 조합식: [신화] 도감 모델(codexSheetModel)을 그대로 쓴다 → 발견 전 조합은 '???' + 힌트 재료 하나 (도감과 같은 공개 규칙).
 */
import { GRADE_COLORS } from '../../art/palette';
import type { Grade } from '../../data/load';
import { BP_ONE } from '../../sim/Fixed';
import { nextGrade } from '../../sim/Deck';
import { GRADE_NAMES, gradeStars } from '../panels/towerPanelModel';
import type { CodexSheetModel } from '../sheets/g1Models';

export interface GradeGuideRow {
  grade: Grade;
  name: string;
  color: string;
  stars: string;
  /** 얻는 법 한 줄 */
  how: string;
}

export interface GradeGuideRecipe {
  id: string;
  /** '💠 원소 지배자' / '💠 ???' */
  name: string;
  /** '화염 마법사 + 얼음 마법사 + 대마법사' (모르는 재료는 ???) */
  formula: string;
  found: boolean;
}

export interface GradeGuideModel {
  rows: GradeGuideRow[];
  /** 승급 방법 줄들 */
  rules: string[];
  recipes: GradeGuideRecipe[];
  /** '발견 3/12' */
  recipeSummary: string;
}

export interface GradeGuideInput {
  /** towers.json baseDps (등급 순서) */
  baseDps: Readonly<Record<Grade, number>>;
  /** game.json merge.count */
  mergeCount: number;
  /** 신 확률 bp (rules.godChanceBp) */
  godChanceBp: number;
  /** [신화] 도감 모델 — 없으면 조합식 목록 없음 */
  codex?: CodexSheetModel;
}

/** bp → '0.01%' (뒤의 0은 뺀다) */
function pct(bp: number): string {
  return `${String(Number(((bp * 100) / BP_ONE).toFixed(4)))}%`;
}

export function gradeGuideModel(input: GradeGuideInput): GradeGuideModel {
  const n = input.mergeCount;
  const grades = (Object.keys(GRADE_NAMES) as Grade[]).slice().sort((a, b) => input.baseDps[a] - input.baseDps[b]);
  const prevOf = new Map<Grade, Grade>();
  for (const g of grades) {
    const next = nextGrade(g);
    if (next) prevOf.set(next, g);
  }
  const howOf = (g: Grade): string => {
    if (g === 'god') return `소환·승급할 때 ${pct(input.godChanceBp)} · 신화 도박`;
    if (g === 'hidden') return '정해진 재료 3종으로 제작';
    const prev = prevOf.get(g);
    const tail = nextGrade(g) ? '' : ' · 더 승급 안 돼요';
    return prev ? `${GRADE_NAMES[prev]} ${n}개 승급${tail}` : `소환${tail}`;
  };
  const rows = grades.map((g): GradeGuideRow => ({ grade: g, name: GRADE_NAMES[g], color: GRADE_COLORS[g], stars: gradeStars(g), how: howOf(g) }));
  const rules = [
    `승급: 같은 캐릭터·같은 등급 ${n}개 → 다음 등급 1개 (덱의 다음 등급 중 무작위)`,
    `레전드·신·신화는 승급할 수 없어요 · 승급할 때 ${pct(input.godChanceBp)} 확률로 신`,
    '신화: 재료 3종이 모두 판 위에 있으면 [💠 신화]에서 [제작] · 만들거나 재료를 한꺼번에 모으면 조합식이 공개돼요',
  ];
  const recipes = (input.codex?.rows ?? []).map(
    (r): GradeGuideRecipe => ({ id: r.id, name: `💠 ${r.found ? r.name : '???'}`, formula: r.materials.map((m) => m.name).join(' + '), found: r.found }),
  );
  return { rows, rules, recipes, recipeSummary: input.codex?.summary ?? '' };
}
