/**
 * M1-6 패배 판정: 무한 150 = 생존, 151 = 패배 / 캠페인 목숨 0.
 */
import { describe, expect, it } from 'vitest';
import { defeatReason } from '../../src/sim/systems/Defeat';
import { addMob, campaign, infinite } from '../helpers/match';

describe('무한 모드: 몹 150마리 초과 (경계)', () => {
  it('150마리 = 생존, 151마리 = 패배', () => {
    const match = infinite(1);
    for (let i = 0; i < 150; i++) addMob(match, 'slime');
    match.step();
    expect(match.mobCount()).toBe(150);
    expect(match.state.phase).toBe('playing');
    addMob(match, 'slime');
    match.step();
    expect(match.mobCount()).toBe(151);
    expect(match.state.phase).toBe('defeat');
    expect(match.state.defeatReason).toBe('mobLimit');
    expect(match.state.defeatTick).toBe(1);
    expect(match.world.drainEvents().find((e) => e.type === 'defeat')).toMatchObject({ reason: 'mobLimit', stage: 0 });
  });

  it('defeatReason 순수 함수 경계', () => {
    const match = infinite(2);
    expect(defeatReason(match.ctx, 150)).toBe('');
    expect(defeatReason(match.ctx, 151)).toBe('mobLimit');
  });

  it('한도는 맵 데이터(mobLimit)에서 (상점 +30은 M8에서 더한다)', () => {
    const match = infinite(3);
    expect(match.state.mobLimit).toBe(150);
    match.state.mobLimit = 180;
    expect(defeatReason(match.ctx, 180)).toBe('');
    expect(defeatReason(match.ctx, 181)).toBe('mobLimit');
  });

  it('고블린 떼는 마리마다 셈: 149마리 + 떼 1칸(3) = 152 → 패배', () => {
    const match = infinite(4);
    for (let i = 0; i < 149; i++) addMob(match, 'slime');
    match.state.stage = 40;
    match.ctx.state.spawnQueue = ['goblin'];
    match.ctx.state.spawnStage = 40;
    match.ctx.state.spawnNext = 0;
    match.ctx.state.spawnNextTick = match.tick;
    match.step();
    expect(match.mobCount()).toBe(152);
    expect(match.state.phase).toBe('defeat');
  });

  it('무한 모드는 목숨이 없다 (몹이 출구에 닿지 않으니 목숨 0이어도 진행)', () => {
    const match = infinite(5);
    expect(match.state.lives).toBe(0);
    match.stepN(100);
    expect(match.state.phase).toBe('playing');
  });
});

describe('캠페인: 목숨 0', () => {
  it('목숨 20, 몹 한도 없음 (151마리여도 진행)', () => {
    const match = campaign(1);
    expect(match.state.lives).toBe(20);
    expect(match.state.mobLimit).toBe(0);
    for (let i = 0; i < 200; i++) addMob(match, 'slime');
    match.step();
    expect(match.state.phase).toBe('playing');
  });

  it('목숨 1에서 슬라임이 새면 0 → 같은 틱에 패배', () => {
    const match = campaign(1);
    match.state.lives = 1;
    addMob(match, 'slime');
    match.stepN(1039);
    expect(match.state.phase).toBe('playing');
    match.step();
    expect(match.state.lives).toBe(0);
    expect(match.state.phase).toBe('defeat');
    expect(match.state.defeatReason).toBe('lives');
  });

  it('목숨 2에서 슬라임(1)이 새면 1 → 생존', () => {
    const match = campaign(1);
    match.state.lives = 2;
    addMob(match, 'slime');
    match.stepN(1040);
    expect(match.state.lives).toBe(1);
    expect(match.state.phase).toBe('playing');
  });
});

describe('패배 뒤에는 멈춘다', () => {
  it('단계·등장·이동이 더 진행되지 않는다 (틱만 흐름)', () => {
    const match = infinite(6);
    for (let i = 0; i < 151; i++) addMob(match, 'slime');
    match.step();
    expect(match.defeated).toBe(true);
    const progress = match.mobs()[0]!.progress;
    const stage = match.state.stage;
    match.stepN(3000);
    expect(match.mobs()[0]!.progress).toBe(progress);
    expect(match.state.stage).toBe(stage);
    expect(match.state.spawned).toBe(151);
  });
});
