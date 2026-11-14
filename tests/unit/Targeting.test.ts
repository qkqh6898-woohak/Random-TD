/**
 * M2-3 대상 선택: 선두(캠페인 = 진행도 최대, 무한 모드 = 가장 오래 살아 있는 몹), 사거리 = 제곱 거리 비교(경계 포함),
 * 사거리 밖 무시, 투명 몹 제외.
 */
import { describe, expect, it } from 'vitest';
import { positionAt } from '../../src/sim/map';
import { placeTower } from '../../src/sim/systems/Summon';
import { leaderRuleFor, pickLeader, targetCandidates, type TargetCandidate } from '../../src/sim/systems/Targeting';
import { addMob, campaign, infinite } from '../helpers/match';

const cand = (id: number, x: number, y: number, progress: number, alive = true): TargetCandidate => ({ id, x, y, progress, alive });

describe('pickLeader', () => {
  it('사거리 안에서 진행도가 가장 큰 몹', () => {
    const list = [cand(1, 1000, 0, 100), cand(2, 0, 1000, 900), cand(3, 500, 500, 400)];
    expect(pickLeader(list, 0, 0, 1500)?.id).toBe(2);
  });

  it('사거리 밖은 진행도가 커도 무시', () => {
    const list = [cand(1, 1000, 0, 100), cand(2, 5000, 0, 99_999)];
    expect(pickLeader(list, 0, 0, 2000)?.id).toBe(1);
    expect(pickLeader([cand(2, 5000, 0, 1)], 0, 0, 2000)).toBeNull();
  });

  it('경계: 거리 = 사거리이면 안, 1단위라도 넘으면 밖 (3-4-5 삼각형)', () => {
    const list = [cand(1, 3000, 4000, 10)];
    expect(pickLeader(list, 0, 0, 5000)?.id).toBe(1);
    expect(pickLeader(list, 0, 0, 4999)).toBeNull();
    // 대각선 근처도 제곱 거리로 정확히: (3001, 4000)은 5000.6 → 사거리 5000 밖
    expect(pickLeader([cand(1, 3001, 4000, 10)], 0, 0, 5000)).toBeNull();
  });

  it('진행도가 같으면 먼저 나온 몹(ID가 작은 쪽), 죽은 후보는 건너뜀', () => {
    const list = [cand(4, 100, 0, 700), cand(7, 0, 100, 700)];
    expect(pickLeader(list, 0, 0, 1000)?.id).toBe(4);
    list[0]!.alive = false;
    expect(pickLeader(list, 0, 0, 1000)?.id).toBe(7);
  });
});

describe('무한 모드 선두 = 가장 오래 살아 있는 몹 (GDD 5.3)', () => {
  it('leaderRuleFor: 무한 → oldest, 캠페인 → progress', () => {
    expect(leaderRuleFor('infinite')).toBe('oldest');
    expect(leaderRuleFor('campaign')).toBe('progress');
  });

  it("'oldest': 진행도가 더 커도 ID가 작은(먼저 나온) 몹, 사거리 밖·죽은 후보는 건너뜀", () => {
    const list = [cand(2, 5000, 0, 1), cand(3, 100, 0, 5000), cand(9, 0, 100, 33_000)];
    expect(pickLeader(list, 0, 0, 1000, 'oldest')?.id).toBe(3); // 2는 사거리 밖
    expect(pickLeader(list, 0, 0, 1000, 'progress')?.id).toBe(9);
    list[1]!.alive = false;
    expect(pickLeader(list, 0, 0, 1000, 'oldest')?.id).toBe(9);
    expect(pickLeader([], 0, 0, 1000, 'oldest')).toBeNull();
  });

  it('회귀: 무한 판에서 먼저 나온 슬라임(진행도 5000)과 늦게 나온 박쥐(진행도 33000)가 같은 자리면 슬라임을 친다', () => {
    const m = infinite(1);
    m.state.stage = 6;
    m.state.nextStageTick = 1_000_000;
    m.state.spawnStage = 6;
    const slime = addMob(m, 'slime');
    const bat = addMob(m, 'bat');
    // 순환의 정원 경로 길이 28칸 → 33000 = 5000 + 28000 (같은 자리, 박쥐가 한 바퀴 더 돎)
    expect(m.map.path.length).toBe(28_000);
    slime.progress = 5000;
    bat.progress = 33_000;
    slime.speed = 0;
    bat.speed = 0;
    expect(positionAt(m.map.path, 5000)).toEqual(positionAt(m.map.path, 33_000));
    const hp = { slime: slime.hp, bat: bat.hp };
    placeTower(m.world, 'goblin', 0, 6, 0); // 진행도 5000 = (6500, 1500) 바로 위 칸
    m.step();
    expect(slime.hp).toBeLessThan(hp.slime);
    expect(bat.hp).toBe(hp.bat);
  });

  it('캠페인은 진행도 최대: 늦게 나왔어도 더 앞선 몹을 친다', () => {
    const m = campaign(1);
    m.state.stage = 1;
    m.state.nextStageTick = 1_000_000;
    m.state.spawnStage = 1;
    const back = addMob(m, 'slime');
    const front = addMob(m, 'slime');
    back.speed = 0;
    front.speed = 0;
    // 경로 위 한 지점 옆의 배치 칸을 찾는다
    let placed = false;
    for (let prog = 3000; prog < m.map.path.length && !placed; prog += 1000) {
      const p = positionAt(m.map.path, prog);
      const tx = Math.floor(p.x / 1000);
      const ty = Math.floor(p.y / 1000);
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
        if (!m.map.buildable.some(([bx, by]) => bx === tx + dx && by === ty + dy)) continue;
        back.progress = prog;
        front.progress = prog + 300;
        placeTower(m.world, 'goblin', 0, tx + dx, ty + dy);
        placed = true;
        break;
      }
    }
    expect(placed).toBe(true);
    const hp = { back: back.hp, front: front.hp };
    m.step();
    expect(front.hp).toBeLessThan(hp.front);
    expect(back.hp).toBe(hp.back);
  });
});

describe('targetCandidates', () => {
  it('몹 위치 = 진행도 → 경로 위 좌표 (ID 순), 드러나지 않은 투명 몹은 빠진다', () => {
    const m = infinite(1);
    m.state.stage = 35;
    const a = addMob(m, 'slime');
    const thief = addMob(m, 'thief');
    const b = addMob(m, 'bat');
    a.progress = 2500;
    b.progress = 7000;
    const list = targetCandidates(m.world, m.map.path);
    expect(list.map((c) => c.id)).toEqual([a.id, b.id]);
    expect(list.map((c) => c.id)).not.toContain(thief.id);
    expect({ x: list[1]!.x, y: list[1]!.y }).toEqual(positionAt(m.map.path, 7000));
  });
});
