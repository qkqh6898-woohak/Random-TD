/**
 * M1-3 경로 이동: 정수 진행도, 직선 웨이포인트, loop, 1.5칸/초 = 순환 한 바퀴 374틱(18.7초).
 * + 캠페인 출구 도달 시 목숨 감소 (암흑 골렘 2).
 */
import { describe, expect, it } from 'vitest';
import { TICK_HZ } from '../../src/sim/World';
import { positionAt, tileCenter } from '../../src/sim/map';
import { advanceMob } from '../../src/sim/systems/Movement';
import { emptyMobStatus, emptyMobTraits, type Mob } from '../../src/sim/entities/Mob';
import { addMob, campaign, infinite } from '../helpers/match';

function fakeMob(speed: number): Mob {
  return { id: 1, kind: 'mob', mob: 'x', stage: 1, hp: 1, maxHp: 1, armor: 0, magicRes: 0, speed, ccResistBp: 0, lifeDamage: 1, reward: 0, progress: 0, moveRem: 0, swarmIndex: 0, invisible: false, legion: 'plague', boss: false, vulnBp: 0, markBp: 0, ...emptyMobStatus(), ...emptyMobTraits() };
}

describe('정수 이동 (나머지 누적)', () => {
  it('1.5칸/초 = 1500단위/초 = 틱마다 75', () => {
    const m = fakeMob(1500);
    advanceMob(m);
    expect([m.progress, m.moveRem]).toEqual([75, 0]);
  });

  it('20으로 나누어떨어지지 않는 속도도 1초(20틱)에 정확히 속도만큼 (1.25칸/초 = 1250)', () => {
    const m = fakeMob(1250);
    for (let i = 0; i < TICK_HZ; i++) advanceMob(m);
    expect(m.progress).toBe(1250);
    expect(m.moveRem).toBe(0);
    for (let i = 0; i < TICK_HZ * 7; i++) advanceMob(m);
    expect(m.progress).toBe(1250 * 8);
  });

  it('아주 느린 속도(7단위/초)도 멈추지 않고 나머지가 쌓여 움직인다', () => {
    const m = fakeMob(7);
    for (let i = 0; i < 60; i++) advanceMob(m);
    expect(m.progress).toBe(21);
    expect(Number.isInteger(m.progress)).toBe(true);
  });
});

describe('순환의 정원 한 바퀴 (DEV_PLAN M1-3 완료 조건)', () => {
  it('1.5칸/초 슬라임: 28칸 = 374틱 ±1 (18.7초)에 시작점으로 돌아온다', () => {
    const match = infinite(1);
    const mob = addMob(match, 'slime');
    const L = match.map.path.length;
    let lapTick = -1;
    for (let t = 1; t <= 400; t++) {
      match.step();
      if (lapTick < 0 && mob.progress >= L) lapTick = t;
    }
    expect(lapTick).toBeGreaterThanOrEqual(373);
    expect(lapTick).toBeLessThanOrEqual(375);
    expect(lapTick).toBe(374); // 28000 / 75 = 373.3 → 374번째 틱에 넘음
    expect(lapTick / TICK_HZ).toBeCloseTo(18.7, 1);
  });

  it('loop 맵에서는 사라지지 않고 계속 돈다 (3바퀴 후에도 맵 위)', () => {
    const match = infinite(2);
    const mob = addMob(match, 'slime');
    match.stepN(374 * 3 + 10);
    expect(match.world.entities.has(mob.id)).toBe(true);
    expect(mob.progress).toBeGreaterThan(3 * match.map.path.length);
    expect(match.state.leaked).toBe(0);
  });

  it('위치는 경로 위 칸 중심선을 벗어나지 않는다 (x는 1.5 또는 7.5칸, 아니면 y가 1.5 또는 9.5칸)', () => {
    const match = infinite(3);
    const mob = addMob(match, 'bat'); // 2.4칸/초
    for (let t = 0; t < 600; t++) {
      match.step();
      const { x, y } = positionAt(match.map.path, mob.progress);
      const onVertical = x === 1500 || x === 7500;
      const onHorizontal = y === 1500 || y === 9500;
      expect(onVertical || onHorizontal).toBe(true);
    }
  });

  it('몹마다 데이터 속도대로: 박쥐 2.4 = 틱당 120, 보석 골렘 0.8 = 틱당 40', () => {
    const match = infinite(4);
    const bat = addMob(match, 'bat');
    const gem = addMob(match, 'gemgolem');
    match.stepN(10);
    expect(bat.progress).toBe(1200);
    expect(gem.progress).toBe(400);
  });
});

describe('캠페인 출구 도달 (CAMPAIGN 목숨)', () => {
  it('사거리 미로 59칸(T-3 2×2 블록 맵)을 슬라임은 39.4초(787틱)에 지나 목숨 1을 잃는다', () => {
    const match = campaign(1);
    expect(match.state.lives).toBe(20);
    const mob = addMob(match, 'slime');
    match.stepN(786); // 59000 / 75 = 786.7 → 787번째 틱에 출구
    expect(match.world.entities.has(mob.id)).toBe(true);
    match.step();
    expect(match.world.entities.has(mob.id)).toBe(false);
    expect(match.state.lives).toBe(19);
    expect(match.state.leaked).toBe(1);
    const leak = match.world.drainEvents().find((e) => e.type === 'leak');
    expect(leak).toMatchObject({ mob: 'slime', lifeDamage: 1, lives: 19 });
  });

  it('암흑 골렘(목숨 피해 2)이 출구에 닿으면 목숨 20 → 18', () => {
    const match = campaign(1);
    const golem = addMob(match, 'golem'); // 1.2칸/초 → 59000 / 60 = 983.3 → 984틱
    match.stepN(983);
    expect(match.state.lives).toBe(20);
    match.step();
    expect(match.world.entities.has(golem.id)).toBe(false);
    expect(match.state.lives).toBe(18);
  });

  it('투명 도둑 2, 보석 골렘 3 (ENEMIES.md 3장 목숨 피해), 목숨은 0 아래로 내려가지 않는다', () => {
    const match = campaign(1);
    match.state.lives = 4;
    addMob(match, 'thief');
    addMob(match, 'gemgolem');
    match.stepN(5000);
    expect(match.state.lives).toBe(0);
    // 도둑(656틱) → 목숨 2, 보석 골렘(1475틱) → 0 = 패배. 패배 뒤에는 1단계 슬라임(1987틱~)이 와도 더 세지 않는다
    expect(match.state.leaked).toBe(2);
    expect(match.state.phase).toBe('defeat');
  });

  it('출구 직전 위치는 (3,-1) 칸 중심 쪽 위로 올라가는 중', () => {
    const match = campaign(1);
    const mob = addMob(match, 'slime');
    match.stepN(777);
    const pos = positionAt(match.map.path, mob.progress);
    expect(pos.x).toBe(tileCenter(3, -1).x);
    expect(pos.y).toBeGreaterThan(tileCenter(3, -1).y);
  });
});
