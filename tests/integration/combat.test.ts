/**
 * M2 통합: 소환한 타워가 실제 판에서 몹을 잡고 돈을 번다. 같은 시드 + 같은 명령 → 같은 해시 (리플레이 재료).
 */
import { summonCost } from '../../src/sim/systems/Summon';
import { describe, expect, it } from 'vitest';
import type { Command } from '../../src/sim/Commands';
import type { Point } from '../../src/data/load';
import { createMatch, type Match } from '../../src/sim/match';
import { arenaData, campaign, infinite, runToStage } from '../helpers/match';

/** 순환의 정원 안쪽 고리(경로 바로 안쪽) 칸: 몹이 지나가는 길에 가깝다. */
function ringTiles(match: Match): Point[] {
  return match.map.buildable.filter(([x, y]) => x >= 2 && x <= 6 && y >= 2 && y <= 8 && (x === 2 || x === 6 || y === 2 || y === 8));
}

/** 준비 단계에 n번 소환 + 단계마다 돈이 되는 만큼 더 소환하는 간단한 봇. */
function playGreedy(match: Match, untilStage: number, tiles: Point[]): void {
  let next = 0;
  while (match.state.stage < untilStage && !match.defeated) {
    while (next < tiles.length && match.state.gold >= summonCost(match.ctx, 0)) {
      const [x, y] = tiles[next++]!;
      match.world.enqueue({ type: 'summon', x, y });
      match.step();
    }
    match.step();
  }
}

describe('타워가 있는 무한 모드', () => {
  it('준비 단계에 10번 소환 → 1~5단계 몹을 잡아 돈을 벌고, 타워 없는 판보다 몹이 적다', () => {
    const withTowers = infinite(42);
    const tiles = ringTiles(withTowers);
    for (const [x, y] of tiles.slice(0, 10)) {
      withTowers.world.enqueue({ type: 'summon', x, y });
      withTowers.step();
    }
    expect(withTowers.towers()).toHaveLength(10);
    expect(withTowers.state.gold).toBe(1000 - 310); // V2.0 PR-A: 22 + 24 + … + 40원
    runToStage(withTowers, 6);
    const bare = infinite(42);
    runToStage(bare, 6);
    expect(withTowers.state.kills).toBeGreaterThan(30);
    expect(withTowers.state.gold).toBe(690 + withTowers.state.goldEarned); // 남은 돈 + 처치 보상 + 특색 돈 + 이자
    // 1~5단계 슬라임 = 3·4원(V2.0 PR-A 3 + ⌊s/4⌋) + 광부 특색(공격마다 1% 확률 +5원, M3-9)이 번 돈 + 단계 이자 (피드백 #10)
    const events = withTowers.world.drainEvents();
    const sum = (type: string): number => events.filter((e) => e.type === type).reduce((a, e) => a + Number(e.amount), 0);
    const killGold = events.filter((e) => e.type === 'kill').reduce((a, e) => a + Number(e.reward), 0);
    expect(withTowers.state.goldEarned).toBe(killGold + sum('abilityGold') + sum('stageInterest'));
    expect(withTowers.mobCount()).toBeLessThan(bare.mobCount() - 30);
    expect(withTowers.mobCount() + withTowers.state.kills).toBe(bare.mobCount()); // 나온 수는 같다 (등장은 세계 난수)
  });

  it('번 돈으로 계속 소환하면 10단계까지 몹이 거의 쌓이지 않는다 (플레이 가능한 최소 버전)', () => {
    const m = infinite(7);
    playGreedy(m, 10, m.map.buildable.filter(([x, y]) => !(x === 0 || y === 0 || x === 8 || y === 10)));
    expect(m.defeated).toBe(false);
    expect(m.state.stage).toBe(10);
    expect(m.mobCount()).toBeLessThan(20);
    expect(m.towers().length).toBeGreaterThan(20);
  });
});

describe('캠페인 1 (사거리 미로)', () => {
  it('타워가 길목을 지키면 1단계 슬라임이 출구에 닿지 않는다', () => {
    const m = campaign(1, 3);
    // 경로 칸에 이웃한 배치 칸 앞쪽 12개
    const near = m.map.buildable.filter(([x, y]) =>
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => m.map.kinds[(y + dy!) * m.map.width + (x + dx!)] === 'path'),
    );
    playGreedy(m, 2, near.slice(0, 20));
    m.stepN(1100); // 1단계 몹이 모두 지나갈 시간
    expect(m.state.leaked).toBe(0);
    expect(m.state.lives).toBe(20);
  });
});

describe('결정성', () => {
  function trace(seed: number): { hashes: number[]; commands: Command[]; final: number } {
    const m = infinite(seed);
    const tiles = m.map.buildable;
    const hashes: number[] = [];
    let k = 0;
    for (let t = 0; t < 6000; t++) {
      // 일정한 틱에 소환 (빈 칸·돈 부족이면 sim이 거절 → 그것도 같은 결과)
      if (t % 37 === 0 && k < tiles.length) {
        const [x, y] = tiles[k++]!;
        m.world.enqueue({ type: 'summon', x, y });
      }
      m.step();
      if (t % 300 === 0) hashes.push(m.hash());
    }
    return { hashes, commands: [...m.world.executed], final: m.hash() };
  }

  it('같은 시드 + 같은 명령 → 같은 해시 흐름', () => {
    const a = trace(2024);
    const b = trace(2024);
    expect(b.hashes).toEqual(a.hashes);
    expect(a.commands.length).toBe(71); // 배치 칸마다 한 번 (돈이 모자라 거절된 것도 기록에 남는다)
  });

  it('실행된 명령 기록을 새 판에 그대로 넣으면 끝 해시가 같다 (리플레이 재료)', () => {
    const a = trace(31337);
    const m = createMatch(arenaData, { seed: 31337, mode: 'infinite' }); // trace()와 같은 시험장 맵
    for (const c of a.commands) expect(m.world.enqueue(c).ok).toBe(true);
    m.stepN(6000);
    expect(m.hash()).toBe(a.final);
  });
});
