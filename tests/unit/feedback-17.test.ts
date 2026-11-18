/**
 * 피드백 #17 — '글자 크기 변화를 다양하게 · 영웅 등장할 때 커졌다 작아졌다 하는 말랑말랑한 애니메이션'.
 * 이슈 본문·판 기록 JSON이 없어 리플레이 재현 테스트는 없다 (화면 연출만 바뀜, sim 그대로).
 * v0.1.14 통합: 등장 동작 = 디자인 PR #54(FB-D1 #17), 떠오르는 글자 크기 단계·튀어오름 = 피드백 PR #39.
 */
import { describe, expect, it } from 'vitest';
import { APPEAR_MS, breathPose, towerPose } from '../../src/view/render/towerPose';
import { FLOAT_TEXT_SIZE_MUL, floatingTextFrame } from '../../src/view/render/fxModel';

describe('피드백 #17 영웅 등장: 커졌다 작아졌다 말랑하게', () => {
  // v0.1.14 통합: 등장 동작은 디자인 PR #54(FB-D1 #17, 0.52초 부풀기 → 눌림 → 복원)를 쓴다 — PR #39의 appearJelly(0.6초)는 같은 일이라 뺐다.
  const pose = (t: number) => towerPose({ timeMs: t, seed: 0, attackAtMs: null, attackMs: 250, appearAtMs: 0, gesture: 'still' });
  const ratio = (t: number) => {
    const p = pose(t);
    const b = breathPose(t, 0);
    return { sx: p.sx / b.sx, sy: p.sy / b.sy };
  };

  it('작게 시작 → 크게 넘침 → 제 크기보다 눌림 → 제 크기로 끝', () => {
    const s = Array.from({ length: 201 }, (_, i) => ratio((APPEAR_MS * i) / 200 - 0.001));
    expect(s[1]!.sy).toBeLessThan(0.4);
    const peakI = s.reduce((bi, v, i) => (v.sy > s[bi]!.sy ? i : bi), 0);
    expect(s[peakI]!.sy).toBeGreaterThan(1.1);
    expect(Math.min(...s.slice(peakI).map((v) => v.sy))).toBeLessThan(0.97);
    // 눌릴 때 가로는 넓어진다 (젤리처럼 찌그러짐)
    expect(Math.max(...s.map((v) => v.sx - v.sy))).toBeGreaterThan(0.08);
  });

  it('등장 동작은 예전(0.4초)보다 길게 보이고, 끝나면 숨쉬기 자세 그대로', () => {
    expect(APPEAR_MS).toBeGreaterThan(400);
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
