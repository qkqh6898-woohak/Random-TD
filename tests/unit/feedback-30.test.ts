/**
 * 피드백 #30 '유닛 판매 버튼을 상단에 작게': 정보 패널의 판매 버튼을 머리 줄(초상·이름 옆, [ℹ][✕] 왼쪽)에 작은 두 줄 칩으로 둔다.
 * 히어로 이상은 두 번 눌러야 팔리는 규칙(game.json sell.confirmGrades)은 그대로.
 */
import { describe, expect, it } from 'vitest';
import { sellChipLines, sellLabel, sellNeedsConfirm } from '../../src/ui/panels/towerPanelModel';

describe('피드백 #30 머리 줄 작은 판매 칩', () => {
  it('보통: 두 줄 [💰 판매 / +n원] — 이어 읽으면 예전 버튼 글자와 같다', () => {
    expect(sellChipLines(1350, false)).toEqual(['💰 판매', '+1,350원']);
    expect(sellChipLines(50, false).join(' ')).toBe(sellLabel(50, false));
  });
  it('확인 중: 두 줄 [한 번 더 / 누르면 판매] — 이어 읽으면 예전 확인 글자와 같다', () => {
    expect(sellChipLines(1350, true)).toEqual(['한 번 더', '누르면 판매']);
    expect(sellChipLines(1350, true).join(' ')).toBe(sellLabel(1350, true));
  });
  it('두 줄 모두 짧다 (작은 칩 폭 안, 줄마다 8자 이하)', () => {
    for (const line of [...sellChipLines(99_999, false), ...sellChipLines(0, true)]) expect(line.length).toBeLessThanOrEqual(8);
  });
  it('높은 등급 두 번 누르기 규칙은 그대로', () => {
    const grades = ['hero', 'legend', 'god', 'hidden'] as const;
    expect(sellNeedsConfirm('hero', grades)).toBe(true);
    expect(sellNeedsConfirm('normal', grades)).toBe(false);
  });
});
