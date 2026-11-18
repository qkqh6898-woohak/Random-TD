/**
 * 피드백 #21 — 캐릭터 테두리 색을 등급별로 (흰색·빨간색·보라색 등).
 * v0.1.14 통합: 구현은 디자인 PR #54(FB-D1 #21, `src/art/characters/gradeOutline.ts`)를 쓴다 — 피드백 PR #34의
 * presentation.gradeBorderColor(받침대 윗면 색)는 같은 일을 겹쳐 해서 뺐고, 요청 예시·등급 구별 검사만 #54 색으로 옮겼다.
 * 판 기록 JSON이 없는 제안이라 리플레이 테스트 대신 순수 함수 테스트.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gradeOutlineColor } from '../../src/art/characters/gradeOutline';
import { COLORS, GRADE_COLORS } from '../../src/art/palette';
import { towerLook } from '../../src/art/characters/looks';

const GRADES = ['normal', 'rare', 'unique', 'hero', 'legend', 'god', 'hidden'] as const;

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

describe('피드백 #21 등급별 캐릭터 테두리 색', () => {
  it('받침대·별 배지와 같은 등급 색 (신화는 금테)', () => {
    for (const g of GRADES) expect(gradeOutlineColor(g), g).toBe(g === 'hidden' ? COLORS.hiddenRim : GRADE_COLORS[g]);
  });

  it('일곱 등급이 모두 다르다', () => {
    expect(new Set(GRADES.map((g) => gradeOutlineColor(g).toLowerCase())).size).toBe(GRADES.length);
  });

  it('요청 예시: 신 = 흰색, 레전드 = 빨간색, 유니크 = 보라색', () => {
    expect(gradeOutlineColor('god').toLowerCase()).toBe('#ffffff');
    const [lr, lg, lb] = rgb(gradeOutlineColor('legend'));
    expect(lr).toBeGreaterThan(lg + 100);
    expect(lr).toBeGreaterThan(lb + 100);
    const [ur, ug, ub] = rgb(gradeOutlineColor('unique'));
    expect(ub).toBeGreaterThan(ug + 60);
    expect(ur).toBeGreaterThan(ug + 30);
  });

  it('맵 캐릭터 그림 등급(characterLooks) = towers.json 등급 → 테두리와 받침대가 같은 등급 색', () => {
    const towers = (JSON.parse(readFileSync('src/data/towers.json', 'utf8')) as { towers: { id: string; grade: string }[] }).towers;
    expect(towers.length).toBeGreaterThan(0);
    for (const t of towers) expect(towerLook(t.id)?.grade, t.id).toBe(t.grade);
  });
});
