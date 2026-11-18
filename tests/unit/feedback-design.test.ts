import { describe, expect, it } from 'vitest';
import { APPEAR_MS, breathPose, towerPose } from '../../src/view/render/towerPose';

describe('FB-17 등장 squash/stretch', () => {
  const ratio = (t: number) => {
    const p = towerPose({ timeMs: t, seed: 0.2, attackAtMs: null, attackMs: 250, appearAtMs: 0, gesture: 'still' });
    const b = breathPose(t, 0.2);
    return { x: p.sx / b.sx, y: p.sy / b.sy };
  };
  it('늘어남과 눌림이 둘 다 있고 짧은 시간 뒤 대기 크기로 돌아온다', () => {
    expect(APPEAR_MS).toBeLessThanOrEqual(600);
    const up = ratio(APPEAR_MS * 0.55);
    expect(up.y).toBeGreaterThan(up.x);
    expect(up.y).toBeGreaterThan(1.1);
    const down = ratio(APPEAR_MS * 0.8);
    expect(down.x).toBeGreaterThan(1);
    expect(down.y).toBeLessThan(1);
    expect(ratio(APPEAR_MS)).toEqual({ x: 1, y: 1 });
  });
  it('모든 프레임의 배율이 유한하고 박자 경계에서 튀지 않는다', () => {
    for (let t = 0; t <= APPEAR_MS; t++) {
      const p = ratio(t);
      expect(p.x).toBeGreaterThan(0);
      expect(p.y).toBeGreaterThan(0);
      expect(p.x).toBeLessThanOrEqual(1.2);
      expect(p.y).toBeLessThanOrEqual(1.2);
      if (t > 0) {
        const prev = ratio(t - 1);
        expect(Math.abs(p.x - prev.x)).toBeLessThan(0.02);
        expect(Math.abs(p.y - prev.y)).toBeLessThan(0.02);
      }
    }
  });
});
