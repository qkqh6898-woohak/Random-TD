/**
 * 피드백 #24 '설명 버튼을 눌러 성급(등급) 표기나 조합식을 볼 수 있으면': 📘 등급·조합 설명 창 모델.
 * 이슈에 판 기록 JSON이 없어 리플레이 재현 테스트는 없다 (화면 설명 기능).
 */
import { describe, expect, it } from 'vitest';
import { GRADE_COLORS } from '../../src/art/palette';
import { buildMatchRules } from '../../src/sim/rules';
import { gradeGuideModel } from '../../src/ui/screens/gradeGuideModel';
import { codexSheetModel } from '../../src/ui/sheets/g1Models';
import { arena, data } from '../helpers/match';

const rules = buildMatchRules(data);
const base = { baseDps: data.towers.baseDps, mergeCount: rules.mergeCount, godChanceBp: rules.godChanceBp };

describe('피드백 #24 등급·조합 설명', () => {
  it('등급 순서 낮음 → 높음 (V2.0 PR-A: 신 < 리미티드, src/data/grades.ts) · 색·별·얻는 법', () => {
    const m = gradeGuideModel(base);
    expect(m.rows.map((r) => r.name)).toEqual(['노말', '레어', '유니크', '히어로', '레전드', '신', '리미티드']);
    expect(m.rows.map((r) => r.stars)).toEqual(['★', '★★', '★★★', '★★★★', '★★★★★', '👑', '💠']);
    for (const r of m.rows) expect(r.color).toBe(GRADE_COLORS[r.grade]);
    const how = Object.fromEntries(m.rows.map((r) => [r.grade, r.how]));
    expect(how.normal).toBe('소환');
    expect(how.rare).toBe('노말 3개 승급');
    expect(how.legend).toBe('히어로 3개 승급 · 더 승급 안 돼요');
    expect(how.god).toBe('소환·승급할 때 0.01% · 레전드 도박');
    expect(how.hidden).toBe('정해진 재료 3종으로 제작');
  });

  it('승급 개수·신 확률은 데이터에서 읽는다', () => {
    const m = gradeGuideModel({ ...base, mergeCount: 4, godChanceBp: 25 });
    expect(m.rows.find((r) => r.grade === 'unique')!.how).toBe('레어 4개 승급');
    expect(m.rules[0]).toContain('4개 → 다음 등급');
    expect(m.rows.find((r) => r.grade === 'god')!.how).toContain('0.25%');
  });

  it('리미티드 조합식: 도감과 같은 공개 규칙 (발견 전 ??? + 힌트 재료 하나, 발견하면 전체)', () => {
    const m = arena(24);
    const towers = data.towers.towers;
    const none = gradeGuideModel({ ...base, codex: codexSheetModel(m.ctx, m.world, 0, towers, new Set()) });
    expect(none.recipes).toHaveLength(rules.recipes.length);
    expect(none.recipeSummary).toBe(`발견 0/${rules.recipes.length}`);
    const gk = none.recipes.find((r) => r.id === 'goldking')!;
    expect(gk).toMatchObject({ name: '💠 ???', formula: '??? + ??? + 연금술사', found: false });
    const found = gradeGuideModel({ ...base, codex: codexSheetModel(m.ctx, m.world, 0, towers, new Set(['elemental'])) });
    expect(found.recipes.find((r) => r.id === 'elemental')).toMatchObject({ name: '💠 원소 지배자', formula: '화염 마법사 + 얼음 마법사 + 대마법사', found: true });
    expect(found.recipeSummary).toBe(`발견 1/${rules.recipes.length}`);
  });

  it('도감 모델이 없으면 조합식 목록 없음', () => {
    expect(gradeGuideModel(base).recipes).toEqual([]);
  });
});
