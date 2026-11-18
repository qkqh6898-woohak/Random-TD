/**
 * 피드백 #17 — '글자 크기 변화를 다양하게 · 영웅 등장할 때 커졌다 작아졌다 하는 말랑말랑한 애니메이션'.
 * 이슈 본문·판 기록 JSON이 없어 리플레이 재현 테스트는 없다 (화면 연출만 바뀜, sim 그대로).
 */
import { describe, expect, it } from 'vitest';
import { APPEAR_MS, appearJelly, breathPose, towerPose } from '../../src/view/render/towerPose';
import { FLOAT_TEXT_SIZE_MUL, floatingTextFrame } from '../../src/view/render/fxModel';

describe('피드백 #17 영웅 등장: 커졌다 작아졌다 말랑하게', () => {
  const samples = (n: number) => Array.from({ length: n + 1 }, (_, i) => appearJelly(i / n));

  it('작게 시작 → 크게 넘침 → 제 크기보다 작아짐 → 다시 살짝 커짐 → 제 크기로 끝', () => {
    const s = samples(200);
    expect(s[0]!.sy).toBeLessThan(0.4);
    const peakI = s.reduce((bi, v, i) => (v.sy > s[bi]!.sy ? i : bi), 0);
    expect(s[peakI]!.sy).toBeGreaterThan(1.15);
    const after = s.slice(peakI);
    const dipI = after.reduce((bi, v, i) => (v.sy < after[bi]!.sy ? i : bi), 0);
    expect(after[dipI]!.sy).toBeLessThan(0.95);
    expect(Math.max(...after.slice(dipI).map((v) => v.sy))).toBeGreaterThan(1.02);
    expect(appearJelly(1)).toEqual({ sx: 1, sy: 1 });
  });

  it('가로가 세로보다 늦게 따라와 젤리처럼 찌그러진다 (부드럽게 이어짐)', () => {
    const s = samples(200);
    expect(Math.max(...s.map((v) => Math.abs(v.sx - v.sy)))).toBeGreaterThan(0.08);
    for (let i = 1; i < s.length; i++) {
      expect(Math.abs(s[i]!.sy - s[i - 1]!.sy)).toBeLessThan(0.05);
      expect(Math.abs(s[i]!.sx - s[i - 1]!.sx)).toBeLessThan(0.05);
    }
  });

  it('등장 동작은 예전(0.4초)보다 길게 보이고, 끝나면 숨쉬기 자세 그대로', () => {
    expect(APPEAR_MS).toBeGreaterThanOrEqual(550);
    const pose = (t: number) => towerPose({ timeMs: t, seed: 0, attackAtMs: null, attackMs: 250, appearAtMs: 0 });
    const done = pose(APPEAR_MS + 1);
    const b = breathPose(APPEAR_MS + 1, 0);
    expect(done.sx).toBeCloseTo(b.sx, 9);
    expect(done.sy).toBeCloseTo(b.sy, 9);
  });
});

describe('피드백 #17 떠오르는 글자: 크기 다양 + 말랑한 튀어오름', () => {
  it('글자 크기 단계가 5개 이상이고 서로 다르다 (작은 글자 < 보통 < 돈 < 즉사 < 치명타)', () => {
    const m = FLOAT_TEXT_SIZE_MUL;
    expect(new Set(Object.values(m)).size).toBeGreaterThanOrEqual(5);
    expect(m.small).toBeLessThan(m.normal);
    expect(m.normal).toBeLessThan(m.big);
    expect(m.big).toBeLessThan(m.huge);
    expect(m.huge).toBeLessThan(m.critical);
  });

  it('튀어 올라 넘쳤다가 작아졌다 제 크기로, 가로·세로가 따로 움직인다', () => {
    const f = Array.from({ length: 101 }, (_, i) => floatingTextFrame(i / 100));
    expect(f[0]!.scaleY).toBeLessThan(0.8);
    const peakI = f.reduce((bi, v, i) => (v.scaleY > f[bi]!.scaleY ? i : bi), 0);
    expect(f[peakI]!.scaleY).toBeGreaterThan(1.1);
    // 겹침 판정 상자(글자 크기 × 1.15) 안에 들어간다
    expect(f[peakI]!.scaleY).toBeLessThanOrEqual(1.15);
    expect(Math.min(...f.slice(peakI).map((v) => v.scaleY))).toBeLessThan(0.97);
    expect(f[100]!.scaleY).toBeCloseTo(1, 2);
    expect(Math.max(...f.map((v) => Math.abs(v.scaleX - v.scaleY)))).toBeGreaterThan(0.05);
  });
});
