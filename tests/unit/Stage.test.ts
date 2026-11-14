/**
 * M1-5 단계 타이머: 0단계 60초 준비, 이후 60초마다 다음 단계, 단계 전환 사건, 보스 단계 표시.
 */
import { describe, expect, it } from 'vitest';
import { stageStartTick } from '../../src/sim/systems/Stage';
import { campaign, infinite, jumpToStage } from '../helpers/match';

describe('단계 타이머 (GDD 2.2)', () => {
  it('0단계 준비 60초(1200틱): 틱 1199까지 0단계, 틱 1200에 1단계', () => {
    const match = infinite(1);
    expect(match.state.stage).toBe(0);
    expect(match.ticksToNextStage()).toBe(1200);
    match.stepN(1200); // 틱 0~1199
    expect(match.state.stage).toBe(0);
    expect(match.ticksToNextStage()).toBe(0);
    match.step(); // 틱 1200
    expect(match.state.stage).toBe(1);
    expect(match.state.stageStartTick).toBe(1200);
    expect(match.state.nextStageTick).toBe(2400);
    expect(match.ticksToNextStage()).toBe(1199);
  });

  it('이후 60초마다: n단계 시작 틱 = 1200 + (n−1) × 1200', () => {
    expect(stageStartTick(1200, 1200, 1)).toBe(1200);
    expect(stageStartTick(1200, 1200, 5)).toBe(6000);
    const match = infinite(2);
    const starts: number[] = [];
    for (let t = 0; t < 6100; t++) {
      match.step();
      for (const e of match.world.drainEvents()) if (e.type === 'stageStart') starts.push(e.tick);
    }
    expect(starts).toEqual([1200, 2400, 3600, 4800, 6000]);
  });

  it("단계 전환 사건 'stageStart' { stage, boss }", () => {
    const match = infinite(3);
    match.stepN(1201);
    const ev = match.world.drainEvents().filter((e) => e.type === 'stageStart');
    expect(ev).toEqual([{ type: 'stageStart', tick: 1200, stage: 1, boss: false }]);
  });

  it('10의 배수는 보스 단계 표시 (보스 등장은 M4), 11단계에서 풀림', () => {
    const match = infinite(4);
    jumpToStage(match, 9);
    expect(match.state.bossStage).toBe(false);
    jumpToStage(match, 10);
    expect(match.state.bossStage).toBe(true);
    expect(match.world.drainEvents().filter((e) => e.type === 'stageStart').at(-1)).toMatchObject({ stage: 10, boss: true });
    jumpToStage(match, 11);
    expect(match.state.bossStage).toBe(false);
  });

  it('몹이 남아 있어도 단계는 예정대로 넘어간다', () => {
    const match = infinite(5);
    match.stepN(2401);
    expect(match.mobCount()).toBe(21); // 1단계 20 + 2단계 첫 칸
    expect(match.state.stage).toBe(2);
  });

  it('캠페인은 마지막 단계(50) 다음으로 넘어가지 않는다', () => {
    const match = campaign(1);
    expect(match.state.lastStage).toBe(50);
    jumpToStage(match, 50);
    match.state.lives = 999; // 몹이 새어도 지지 않게
    match.stepN(5000);
    expect(match.state.stage).toBe(50);
    expect(match.ticksToNextStage()).toBe(0);
  });

  it('무한 모드는 끝이 없다 (lastStage 0)', () => {
    const match = infinite(6);
    expect(match.state.lastStage).toBe(0);
    jumpToStage(match, 600);
    expect(match.state.stage).toBe(600);
  });
});
