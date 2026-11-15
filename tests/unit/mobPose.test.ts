/**
 * 몹 걷기 자세 (ART.md 2.1 '몹 걷기': 0.6초 주기, 이동 방향으로 몸 기울기) — M1 검토 반영 회귀 테스트.
 * 이전에는 주기가 속도에 비례해 슬라임 약 0.21초·고블린 약 0.12초에 한 번 튀었고, 기울기가 없었다.
 */
import { describe, expect, it } from 'vitest';
import {
  MOB_LEAN_RAD,
  MOB_SWAY_RAD,
  MOB_WALK_PERIOD_MS,
  approachLean,
  leanTarget,
  mobPose,
  type MobMotion,
} from '../../src/view/render/mobPose';

const close = (a: number, b: number, eps = 1e-9): boolean => Math.abs(a - b) < eps;

describe('몹 걷기 주기', () => {
  it('걷기 주기 = 0.6초 (ART.md 2.1)', () => {
    expect(MOB_WALK_PERIOD_MS).toBe(600);
  });

  it('걷기 자세는 600ms마다 똑같이 되풀이된다 (튀기·눌림·흔들림 모두)', () => {
    for (const phase of [0, 1.3, 4.2]) {
      for (const t of [0, 37, 150, 299, 512]) {
        const a = mobPose('walk', t, phase);
        const b = mobPose('walk', t + MOB_WALK_PERIOD_MS, phase);
        const c = mobPose('walk', t + MOB_WALK_PERIOD_MS * 7, phase);
        for (const k of ['bob', 'sx', 'sy', 'angle'] as const) {
          expect(close(a[k], b[k], 1e-6)).toBe(true);
          expect(close(a[k], c[k], 1e-6)).toBe(true);
        }
      }
    }
  });

  it('한 주기(0.6초)에 땅에 한 번 닿는다: 0ms 땅 → 300ms 꼭대기 → 600ms 땅', () => {
    expect(close(mobPose('walk', 0, 0).bob, 0)).toBe(true);
    expect(close(mobPose('walk', 300, 0).bob, -1)).toBe(true);
    expect(close(mobPose('walk', 600, 0).bob, 0, 1e-9)).toBe(true);
    // 0~600ms를 1ms 간격으로 훑어 땅(0)에 닿는 순간을 센다 (끝점 600은 다음 주기)
    let contacts = 0;
    let prev = mobPose('walk', -1, 0).bob;
    for (let t = 0; t < 600; t++) {
      const cur = mobPose('walk', t, 0).bob;
      const next = mobPose('walk', t + 1, 0).bob;
      if (cur >= prev && cur >= next) contacts++; // bob은 0 이하 → 극대 = 땅
      prev = cur;
    }
    expect(contacts).toBe(1);
  });

  it('땅에 닿을 때 가로로 눌리고, 꼭대기에서 세로로 늘어난다', () => {
    const ground = mobPose('walk', 0, 0);
    const top = mobPose('walk', 300, 0);
    expect(ground.sx).toBeGreaterThan(1);
    expect(ground.sy).toBeLessThan(1);
    expect(top.sx).toBeLessThan(1);
    expect(top.sy).toBeGreaterThan(1);
  });

  it('위상이 다르면 같은 시각에 다른 자세 (무리가 같이 출렁이지 않음)', () => {
    expect(mobPose('walk', 100, 0).bob).not.toBeCloseTo(mobPose('walk', 100, 2.4).bob, 3);
  });

  it('벌레(slither)는 튀지 않고 땅에 붙어 가로로 늘었다 줄며 좌우로 흔든다 — 걷기(깡총)와 다르다', () => {
    const xs: number[] = [];
    let minBob = 0;
    let maxAngle = 0;
    for (let t = 0; t < 900; t += 15) {
      const p = mobPose('slither', t, 0.3);
      xs.push(p.sx);
      minBob = Math.min(minBob, p.bob);
      maxAngle = Math.max(maxAngle, Math.abs(p.angle));
      expect(p.sx > 1).toBe(p.sy < 1); // 늘어나면 납작
    }
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.15);
    expect(minBob).toBeGreaterThan(-0.2); // 걷기는 −1까지 튄다
    expect(maxAngle).toBeGreaterThan(0.03);
    expect(mobPose('slither', 100, 0)).not.toEqual(mobPose('walk', 100, 0));
    expect(Math.abs(leanTarget('slither', 1))).toBeCloseTo(MOB_LEAN_RAD);
  });

  it('박쥐·유령도 주기적이고 값이 유한하다', () => {
    for (const m of ['flap', 'float'] as MobMotion[]) {
      for (const t of [0, 123, 777]) {
        const p = mobPose(m, t, 0.5);
        expect(Number.isFinite(p.bob) && Number.isFinite(p.sx) && Number.isFinite(p.sy)).toBe(true);
        expect(p.bob).toBeLessThan(0); // 늘 떠 있음
      }
    }
  });
});

describe('이동 방향 기울기', () => {
  it('오른쪽으로 가면 시계 방향(+), 왼쪽이면 반시계(−), 세로로만 가면 0', () => {
    expect(leanTarget('walk', 1)).toBe(MOB_LEAN_RAD);
    expect(leanTarget('walk', -1)).toBe(-MOB_LEAN_RAD);
    expect(leanTarget('walk', 0)).toBe(0);
    // 박쥐·유령은 반만
    expect(leanTarget('flap', 1)).toBe(MOB_LEAN_RAD / 2);
    expect(leanTarget('float', -1)).toBe(-MOB_LEAN_RAD / 2);
  });

  it('기울기(약 8도)는 흔들림(약 3도)보다 커서 흔들려도 진행 방향 쪽으로 기운 채다', () => {
    expect(MOB_LEAN_RAD).toBeGreaterThan(MOB_SWAY_RAD);
    for (let t = 0; t < 600; t += 25) {
      expect(leanTarget('walk', 1) + mobPose('walk', t, 0).angle).toBeGreaterThan(0);
      expect(leanTarget('walk', -1) + mobPose('walk', t, 0).angle).toBeLessThan(0);
    }
  });

  it('모서리에서 기울기는 목표 쪽으로 부드럽게 따라가고 넘치지 않는다', () => {
    let lean = MOB_LEAN_RAD;
    const target = -MOB_LEAN_RAD;
    lean = approachLean(lean, target, 16);
    expect(lean).toBeLessThan(MOB_LEAN_RAD);
    expect(lean).toBeGreaterThan(target);
    // 아주 긴 프레임이어도 목표를 지나치지 않는다
    expect(approachLean(MOB_LEAN_RAD, target, 10_000)).toBe(target);
    // 시간이 거꾸로 가거나 0이면 그대로
    expect(approachLean(0.1, target, 0)).toBe(0.1);
    expect(approachLean(0.1, target, -5)).toBe(0.1);
    // 여러 프레임 뒤 목표에 가까워진다
    let l = MOB_LEAN_RAD;
    for (let i = 0; i < 30; i++) l = approachLean(l, target, 16);
    expect(Math.abs(l - target)).toBeLessThan(0.01);
  });
});
