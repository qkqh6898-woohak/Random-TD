/**
 * 피드백 #7 '유닛 꾹 누르고 드래그해서 이동': 이미 있는 기능(M3-10 길게 눌러 끌기 → moveStack)이라 동작은 그대로,
 * 판정 규칙을 고정하고 [↔ 이동] 안내에 끌기 방법을 알려 준다.
 */
import { describe, expect, it } from 'vitest';
import { LONG_PRESS_MS, pressPhase, releaseAction } from '../../src/view/input/press';
import { MOVE_PICK_HINT } from '../../src/ui/messages';

describe('피드백 #7 꾹 눌러 끌어 옮기기', () => {
  const tile = 100;
  it('0.3초 꾹 누르면 끌기, 끄는 중에는 멀리 움직여도 이어지고 빈 칸·교환 칸에 놓으면 옮긴다', () => {
    expect(LONG_PRESS_MS).toBe(300);
    expect(pressPhase(LONG_PRESS_MS, 0, tile, false)).toBe('drag');
    expect(pressPhase(LONG_PRESS_MS + 500, 800, tile, true)).toBe('drag');
    expect(releaseAction('move', 300, tile)).toBe('move');
    expect(releaseAction('swap', 300, tile)).toBe('move');
    expect(releaseAction('invalid', 300, tile)).toBe('none');
  });
  it('[↔ 이동] 안내가 꾹 눌러 끌기도 알려 준다 (기존 문구는 그대로 앞에, 한 줄)', () => {
    expect(MOVE_PICK_HINT.startsWith('옮길 칸을 누르세요')).toBe(true);
    expect(MOVE_PICK_HINT).toContain('꾹 눌러 끌어');
  });
});
