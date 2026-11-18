/**
 * 피드백 #21 — 캐릭터 테두리 색을 등급별로 (흰색·빨간색·보라색 등).
 * 전투 맵 캐릭터(바깥 그림) 진한 외곽선 바깥의 빛 테두리를 등급 색으로 굽는다. 색은 이미 있는 등급 받침대 윗면 색과 같다
 * (신화 = 받침대 금테). 판 기록 JSON이 없는 제안이라 리플레이 테스트 대신 순수 함수 테스트.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GRADE_STYLE, gradeBorderColor, gradeBorderRgba } from '../../src/art/presentation';
import { towerLook } from '../../src/art/characters/looks';

const GRADES = ['normal', 'rare', 'unique', 'hero', 'legend', 'god', 'hidden'] as const;

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

describe('피드백 #21 등급별 캐릭터 테두리 색', () => {
  it('받침대 색과 같다 (신화는 받침대 금테)', () => {
    for (const g of GRADES) {
      const want = g === 'hidden' ? GRADE_STYLE.hidden.rim : GRADE_STYLE[g].top;
      expect(gradeBorderColor(g), g).toBe(want);
    }
  });

  it('일곱 등급이 모두 다르다', () => {
    expect(new Set(GRADES.map(gradeBorderColor)).size).toBe(GRADES.length);
  });

  it('요청 예시: 신 = 흰색, 레전드 = 빨간색, 유니크 = 보라색', () => {
    expect(gradeBorderColor('god')).toBe('#ffffff');
    const [lr, lg, lb] = rgb(gradeBorderColor('legend'));
    expect(lr).toBeGreaterThan(lg + 100);
    expect(lr).toBeGreaterThan(lb + 100);
    const [ur, ug, ub] = rgb(gradeBorderColor('unique'));
    expect(ub).toBeGreaterThan(ug + 60);
    expect(ur).toBeGreaterThan(ug + 30);
  });

  it('캔버스 색 문자열: 같은 색 + 진한 알파', () => {
    expect(gradeBorderRgba('legend')).toBe(`rgba(${rgb(GRADE_STYLE.legend.top).join(', ')}, 0.95)`);
    for (const g of GRADES) expect(gradeBorderRgba(g)).toMatch(/^rgba\(\d+, \d+, \d+, 0\.95\)$/);
  });

  it('맵 캐릭터 그림 등급(characterLooks) = towers.json 등급 → 테두리와 받침대가 같은 등급 색', () => {
    const towers = (JSON.parse(readFileSync('src/data/towers.json', 'utf8')) as { towers: { id: string; grade: string }[] }).towers;
    expect(towers.length).toBeGreaterThan(0);
    for (const t of towers) expect(towerLook(t.id)?.grade, t.id).toBe(t.grade);
  });
});
