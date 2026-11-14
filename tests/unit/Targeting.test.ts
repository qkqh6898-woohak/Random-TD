/**
 * M2-3 대상 선택: 선두(진행도 최대), 사거리 = 제곱 거리 비교(경계 포함), 사거리 밖 무시, 투명 몹 제외.
 */
import { describe, expect, it } from 'vitest';
import { positionAt } from '../../src/sim/map';
import { pickLeader, targetCandidates, type TargetCandidate } from '../../src/sim/systems/Targeting';
import { addMob, infinite } from '../helpers/match';

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
