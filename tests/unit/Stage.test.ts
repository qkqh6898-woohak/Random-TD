/**
 * M1-5 단계 타이머: 0단계 60초 준비, 이후 60초마다 다음 단계, 단계 전환 사건, 보스 단계 표시.
 */
import { describe, expect, it } from 'vitest';
import { stageStartTick } from '../../src/sim/systems/Stage';
import { createMatch } from '../../src/sim/match';
import { campaign, data, infinite, jumpToStage } from '../helpers/match';

describe('단계 타이머 (GDD 2.2)', () => {
  it('준비 완료는 일반 무한 모드에서 첫 소환 뒤 한 번만 1단계를 시작한다', () => {
    const match = infinite(1);
    match.world.enqueue({ type: 'finishPrep' });
    match.step();
    expect(match.state.stage).toBe(0);
    const [x, y] = match.map.buildable[0]!;
    match.world.enqueue({ type: 'summon', x, y });
    match.step();
    match.world.enqueue({ type: 'finishPrep' });
    match.world.enqueue({ type: 'finishPrep' });
    match.step();
    expect(match.state.stage).toBe(1);
    expect(match.state.debugUsed).toBe(false);
    const deadline = match.state.nextStageTick;
    match.world.enqueue({ type: 'finishPrep' });
    match.step();
    expect(match.state.nextStageTick).toBe(deadline);
    expect(match.world.drainEvents().filter((event) => event.type === 'stageStart')).toHaveLength(1);
  });

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

describe('개발용 단계 건너뛰기 (debugSkipStage 명령)', () => {
  it('debug 판: 명령을 넣은 틱에 다음 단계가 시작되고 60초 타이머가 새로 잡힌다, 기록에 표시', () => {
    const match = createMatch(data, { seed: 1, mode: 'infinite', debug: true });
    match.stepN(100);
    expect(match.world.enqueue({ type: 'debugSkipStage' }).ok).toBe(true);
    match.step(); // 틱 100
    expect(match.state.stage).toBe(1);
    expect(match.state.stageStartTick).toBe(100);
    expect(match.state.nextStageTick).toBe(1300);
    expect(match.state.debugUsed).toBe(true);
    expect(match.state.spawned).toBe(1); // 1단계 첫 칸이 바로 나옴
  });

  it('여러 번 건너뛰면 남은 대기열은 새 단계 것으로 바뀐다 (6단계부터 박쥐)', () => {
    const match = createMatch(data, { seed: 2, mode: 'infinite', debug: true });
    for (let i = 0; i < 6; i++) {
      match.world.enqueue({ type: 'debugSkipStage' });
      match.step();
    }
    expect(match.state.stage).toBe(6);
    expect(match.state.spawned).toBe(6); // 단계마다 첫 칸 하나씩
    expect(match.state.spawnQueue.filter((id) => id === 'bat')).toHaveLength(4);
  });

  it('debug가 아닌 판은 명령을 무시한다 (멀티·일반 판에서 치트 불가)', () => {
    const match = infinite(3);
    match.world.enqueue({ type: 'debugSkipStage' });
    match.step();
    expect(match.state.stage).toBe(0);
    expect(match.state.debugUsed).toBe(false);
    expect(match.world.executed.map((c) => c.type)).toEqual(['debugSkipStage']); // 기록은 남는다
  });

  it('캠페인 마지막 단계에서는 더 넘어가지 않는다', () => {
    const match = createMatch(data, { seed: 4, mode: 'campaign', theme: 1, debug: true });
    jumpToStage(match, 50);
    match.world.enqueue({ type: 'debugSkipStage' });
    match.step();
    expect(match.state.stage).toBe(50);
  });
});
