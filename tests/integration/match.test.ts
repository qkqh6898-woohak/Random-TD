/**
 * 헤드리스 판 통합 테스트 (M1): 타워 없이 무한·캠페인 한 판을 끝까지 돌려 패배 시점과 결정성을 본다.
 */
import { describe, expect, it } from 'vitest';
import { STREAM_WORLD } from '../../src/sim/World';
import { campaign, infinite } from '../helpers/match';

function runUntilDefeat(match: ReturnType<typeof infinite>, maxTicks = 200_000): void {
  for (let i = 0; i < maxTicks && !match.defeated; i++) match.step();
}

describe('무한 모드 한 판 (타워 없음)', () => {
  it('7단계까지 140마리, 8단계 11번째 칸에서 151마리 → 틱 10100에 패배', () => {
    const match = infinite(42);
    runUntilDefeat(match);
    expect(match.defeated).toBe(true);
    expect(match.state.defeatReason).toBe('mobLimit');
    expect(match.state.stage).toBe(8);
    // 8단계 시작 1200 + 7×1200 = 9600, 11번째 칸 = +10×50
    expect(match.state.defeatTick).toBe(10100);
    expect(match.mobCount()).toBe(151);
  });

  it('150마리일 때(틱 10050)는 아직 진행 중', () => {
    const match = infinite(42);
    match.stepN(10100); // 틱 0 ~ 10099
    expect(match.mobCount()).toBe(150);
    expect(match.defeated).toBe(false);
    match.step();
    expect(match.defeated).toBe(true);
  });
});

describe('캠페인 테마 1 한 판 (타워 없음)', () => {
  it('슬라임 20마리가 차례로 출구에 닿아 목숨 20 → 0, 틱 3189에 패배 (마지막 슬라임은 틱 2150에 나와 그 틱에 첫 걸음 → 1040걸음째 = 2150 + 1039)', () => {
    const match = campaign(1, 7);
    runUntilDefeat(match);
    expect(match.state.defeatReason).toBe('lives');
    expect(match.state.leaked).toBe(20);
    expect(match.state.lives).toBe(0);
    expect(match.state.defeatTick).toBe(3189);
    expect(match.state.stage).toBe(2);
  });
});

describe('결정성', () => {
  function trace(seed: number): { hashes: number[]; queue: string[] } {
    const match = infinite(seed);
    const hashes: number[] = [];
    let queue: string[] = [];
    for (let t = 0; t < 9000; t++) {
      match.step();
      if (t % 200 === 0) hashes.push(match.hash());
      if (match.state.stage === 6 && queue.length === 0) queue = [...match.state.spawnQueue];
    }
    return { hashes, queue };
  }

  it('같은 시드 → 같은 해시 흐름, 다른 시드 → 6단계(박쥐 섞임) 등장 순서가 다르다', () => {
    const a = trace(1234);
    const b = trace(1234);
    const c = trace(4321);
    expect(a.hashes).toEqual(b.hashes);
    expect(a.queue).toEqual(b.queue);
    expect(a.queue).toHaveLength(20);
    expect(a.queue).not.toEqual(c.queue);
    expect(a.hashes.at(-1)).not.toBe(c.hashes.at(-1));
  });

  it('판 상태는 해시에 들어간다: 돈만 달라도 해시가 다르다', () => {
    const a = infinite(5);
    const b = infinite(5);
    expect(a.hash()).toBe(b.hash());
    b.state.gold += 1;
    expect(a.hash()).not.toBe(b.hash());
  });

  it('상태에는 정수·문자열·불리언만 (소수가 섞이면 해시가 거부)', () => {
    const match = infinite(6);
    match.stepN(3000);
    expect(() => match.hash()).not.toThrow();
    (match.state as unknown as { gold: number }).gold = 1.5;
    expect(() => match.hash()).toThrow(/state\.gold: sim 상태에는 안전한 정수만/);
  });

  it('1~5단계는 슬라임만이라 세계 난수의 섞기 결과가 같아도 순서는 같다 (섞기는 매 단계 난수를 쓴다)', () => {
    const match = infinite(9);
    const before = match.world.rng(STREAM_WORLD).snapshot();
    match.stepN(1201);
    expect(match.world.rng(STREAM_WORLD).snapshot()).not.toEqual(before);
  });
});

describe('시작 상태', () => {
  it('무한: 순환의 정원, 시작 자금 1000원, 몹 한도 150, 0단계', () => {
    const m = infinite(1);
    expect(m.state).toMatchObject({ mode: 'infinite', mapId: 'circle', theme: 0, gold: 1000, mobLimit: 150, lives: 0, stage: 0, phase: 'playing' });
  });

  it('캠페인 1: 사거리 미로, 목숨 20, 마지막 단계 50', () => {
    const m = campaign(1);
    expect(m.state).toMatchObject({ mode: 'campaign', mapId: 'crossroads', theme: 1, gold: 1000, lives: 20, maxLives: 20, mobLimit: 0, lastStage: 50 });
  });

  it('맵 파일이 아직 없는 테마(2: 나선 갱도, M6)는 알기 쉬운 에러', () => {
    expect(() => campaign(2)).toThrow(/맵 파일이 아직 없다: spiral/);
    expect(() => campaign(99)).toThrow(/없는 캠페인 테마/);
  });
});
