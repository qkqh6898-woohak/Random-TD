import { describe, expect, it } from 'vitest';
import { formatGameTime } from '../../src/ui/hud/Hud';
import { availableSpeeds, nextSpeed } from '../../src/ui/hud/speed';
import { readUrlOptions } from '../../src/view/context';
import { loadGameData } from '../../src/data/load';

describe('배속 버튼 규칙 (UI.md 4.2)', () => {
  const speeds = loadGameData().game.speeds;

  it('계정 Lv1부터 모든 일반 배속', () => {
    expect(availableSpeeds(speeds, 1)).toEqual([1, 2, 4, 8, 16]);
    expect(availableSpeeds(speeds, 11)).toEqual([1, 2, 4, 8, 16]);
    expect(availableSpeeds(speeds, 12)).toEqual([1, 2, 4, 8, 16]);
  });

  it('debug면 레벨과 상관없이 전부', () => {
    expect(availableSpeeds(speeds, 1, true)).toEqual([1, 2, 4, 8, 16]);
  });

  it('누를 때마다 순환, 목록에 없는 값이면 첫 값', () => {
    expect(nextSpeed(1, [1, 2])).toBe(2);
    expect(nextSpeed(2, [1, 2])).toBe(1);
    expect(nextSpeed(2, [1, 2, 3])).toBe(3);
    expect(nextSpeed(3, [1, 2, 3])).toBe(1);
    expect(nextSpeed(3, [1, 2])).toBe(1); // 레벨이 내려간 경우 등
    expect(nextSpeed(1, [])).toBe(1);
  });
});

describe('HUD 시간 표시', () => {
  it('분:초.1/10초', () => {
    expect(formatGameTime(0)).toBe('0:00.0');
    expect(formatGameTime(50)).toBe('0:00.0');
    expect(formatGameTime(1250)).toBe('0:01.2');
    expect(formatGameTime(61_000)).toBe('1:01.0');
    expect(formatGameTime(3_599_950)).toBe('59:59.9');
  });
});

describe('URL 옵션', () => {
  it('?debug=1, ?seed=123', () => {
    expect(readUrlOptions('?debug=1&seed=123')).toEqual({ debug: true, seed: 123 });
    expect(readUrlOptions('')).toEqual({ debug: false, seed: null });
  });

  it('잘못된 시드는 무시 (음수·소수·32비트 초과·글자)', () => {
    for (const bad of ['-1', '1.5', '4294967296', 'abc', '']) {
      expect(readUrlOptions(`?seed=${bad}`).seed).toBeNull();
    }
    expect(readUrlOptions('?seed=4294967295').seed).toBe(4294967295);
    expect(readUrlOptions('?debug=true').debug).toBe(false);
  });
});
