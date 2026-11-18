/**
 * 피드백 #45 '돈 +1890 이러는 거는 누적이 아니라 개별로 표기':
 * HUD 돈 옆 '+n원'은 들어온 돈 하나하나를 따로 보여 준다 (짧은 시간 안에 들어온 돈을 합치지 않는다).
 */
import { describe, expect, it } from 'vitest';
import { goldGainLabels } from '../../src/ui/hud/hudModel';

describe('피드백 #45 돈 +n원 개별 표기', () => {
  it('들어온 돈마다 글자 하나 (합치지 않는다)', () => {
    expect(goldGainLabels([30, 30, 100], 4)).toEqual(['+30원', '+30원', '+100원']);
  });

  it('큰 돈은 쉼표', () => {
    expect(goldGainLabels([1890], 4)).toEqual(['+1,890원']);
  });

  it('0·음수·숫자 아님은 뺀다', () => {
    expect(goldGainLabels([0, -5, Number.NaN, 7], 4)).toEqual(['+7원']);
  });

  it('한 번에 너무 많으면 가장 최근 max개만 (합친 숫자를 만들지 않는다)', () => {
    const labels = goldGainLabels([1, 2, 3, 4, 5, 6], 4);
    expect(labels).toEqual(['+3원', '+4원', '+5원', '+6원']);
    expect(labels).not.toContain('+21원');
  });
});
