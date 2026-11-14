/**
 * M1-2 맵 로더: crossroads 96칸·경로 78, circle 71칸·경로 28 + 위치 계산.
 */
import { describe, expect, it } from 'vitest';
import { loadGameData } from '../../src/data/load';
import { TILE } from '../../src/sim/Fixed';
import { buildPath, buildSimMap, directionAt, isBuildable, pathTiles, positionAt, tileAt, tileCenter } from '../../src/sim/map';

const data = loadGameData();
const circle = buildSimMap(data.maps.circle!);
const crossroads = buildSimMap(data.maps.crossroads!);

describe('맵 칸 수와 경로 길이 (MAPS.md 1.1·2.1)', () => {
  it('사거리 미로: 13×13, 배치 96칸, 경로 78칸(화면 밖 등장·퇴장 포함), 회전 10, 목숨 20', () => {
    expect([crossroads.width, crossroads.height]).toEqual([13, 13]);
    expect(crossroads.buildable).toHaveLength(96);
    expect(crossroads.pathLengthTiles).toBe(78);
    expect(crossroads.path.length).toBe(78 * TILE);
    expect(crossroads.turns).toBe(10);
    expect(crossroads.lives).toBe(20);
    expect(crossroads.mobLimit).toBeNull();
    expect(crossroads.path.loop).toBe(false);
    expect(crossroads.exit).toEqual([4, -1]);
    expect(crossroads.crossings).toHaveLength(4);
  });

  it('순환의 정원: 9×11, 배치 71칸(안쪽 35 + 테두리 36), 고리 28칸, 몹 한도 150', () => {
    expect([circle.width, circle.height]).toEqual([9, 11]);
    expect(circle.buildable).toHaveLength(71);
    expect(circle.pathLengthTiles).toBe(28);
    expect(circle.path.loop).toBe(true);
    expect(circle.mobLimit).toBe(150);
    expect(circle.lives).toBeNull();
    expect(circle.exit).toBeNull();
    const inner = circle.buildable.filter(([x, y]) => x >= 2 && x <= 6 && y >= 2 && y <= 8);
    expect(inner).toHaveLength(35);
  });

  it('칸 종류: 배치 칸 + 경로 칸 = 전체 (장식 칸 없음), 경로 칸 수 = 맵 안 경로 길이', () => {
    expect(circle.buildable.length + pathTiles(circle).length).toBe(99);
    expect(pathTiles(circle)).toHaveLength(28);
    // 사거리 미로: 경로 78걸음 = 지나는 칸 79개 (화면 밖 등장·퇴장 2칸 + 맵 안 77칸, 교차점 4곳은 두 번) → 맵 안 P 칸 = 77 − 4 = 73
    expect(crossroads.buildable.length + pathTiles(crossroads).length).toBe(169);
    expect(pathTiles(crossroads)).toHaveLength(73);
  });

  it('배치 칸 목록은 (y, x) 순서', () => {
    const sorted = [...circle.buildable].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    expect(circle.buildable).toEqual(sorted);
    expect(circle.buildable[0]).toEqual([0, 0]);
    expect(circle.buildable[9]).toEqual([0, 1]);
  });

  it('tileAt·isBuildable: 맵 밖은 null/false', () => {
    expect(tileAt(circle, 1, 1)).toBe('path');
    expect(tileAt(circle, 4, 5)).toBe('build');
    expect(tileAt(circle, -1, 0)).toBeNull();
    expect(tileAt(circle, 9, 0)).toBeNull();
    expect(isBuildable(circle, 4, 5)).toBe(true);
    expect(isBuildable(circle, 1, 1)).toBe(false);
    expect(isBuildable(crossroads, 0, -1)).toBe(false);
    // 가장자리 땅 15칸도 배치 칸 (MAPS.md 1.1 v0.5)
    for (const [x, y] of [[1, 0], [6, 0], [0, 6], [12, 6], [6, 12]] as const) expect(isBuildable(crossroads, x, y)).toBe(true);
  });
});

describe('경로 위치 (진행도 → 좌표)', () => {
  it('칸 중심 = 칸 × 1000 + 500', () => {
    expect(tileCenter(0, 0)).toEqual({ x: 500, y: 500 });
    expect(tileCenter(1, -1)).toEqual({ x: 1500, y: -500 });
  });

  it('순환의 정원: (1,1)에서 시작해 시계 방향 → 오른쪽 6칸, 아래 8칸, 왼쪽 6칸, 위 8칸', () => {
    const p = circle.path;
    expect(positionAt(p, 0)).toEqual(tileCenter(1, 1));
    expect(positionAt(p, 6000)).toEqual(tileCenter(7, 1));
    expect(positionAt(p, 14000)).toEqual(tileCenter(7, 9));
    expect(positionAt(p, 20000)).toEqual(tileCenter(1, 9));
    expect(positionAt(p, 27999)).toEqual({ x: 1500, y: 1501 });
    expect(directionAt(p, 0)).toEqual({ dx: 1, dy: 0 });
    expect(directionAt(p, 7000)).toEqual({ dx: 0, dy: 1 });
    expect(directionAt(p, 15000)).toEqual({ dx: -1, dy: 0 });
    expect(directionAt(p, 21000)).toEqual({ dx: 0, dy: -1 });
  });

  it('loop: 한 바퀴(28000)를 넘으면 처음부터, 음수도 감아서', () => {
    const p = circle.path;
    expect(positionAt(p, 28000)).toEqual(positionAt(p, 0));
    expect(positionAt(p, 28000 * 3 + 6500)).toEqual(positionAt(p, 6500));
    expect(positionAt(p, -1000)).toEqual(positionAt(p, 27000));
    expect(directionAt(p, 28000 + 7000)).toEqual({ dx: 0, dy: 1 });
  });

  it('사거리 미로: 화면 밖 (0,-1)에서 등장 → (0,4) → … → 출구 (4,-1), 끝은 붙잡는다', () => {
    const p = crossroads.path;
    expect(positionAt(p, 0)).toEqual(tileCenter(0, -1));
    expect(positionAt(p, 5000)).toEqual(tileCenter(0, 4));
    expect(positionAt(p, 17000)).toEqual(tileCenter(12, 4));
    expect(positionAt(p, 78000)).toEqual(tileCenter(4, -1));
    expect(positionAt(p, 99999)).toEqual(tileCenter(4, -1));
    expect(positionAt(p, -50)).toEqual(tileCenter(0, -1));
  });

  it('사거리 미로: 교차점 (4,4)를 두 번 지난다 (① 가로 구간과 ⑩ 세로 구간)', () => {
    const p = crossroads.path;
    const target = tileCenter(4, 4);
    const hits: number[] = [];
    for (let d = 0; d <= p.length; d += 1000) {
      const pos = positionAt(p, d);
      if (pos.x === target.x && pos.y === target.y) hits.push(d);
    }
    expect(hits).toEqual([9000, 73000]);
  });

  it('정수 진행도 → 정수 좌표, 경로를 따라 1단위씩 움직이면 맨해튼 거리도 1씩', () => {
    const p = crossroads.path;
    let prev = positionAt(p, 0);
    for (let d = 1; d <= p.length; d += 7) {
      const pos = positionAt(p, d);
      expect(Number.isInteger(pos.x) && Number.isInteger(pos.y)).toBe(true);
      const prevD = Math.max(0, d - 7);
      const back = positionAt(p, prevD);
      expect(Math.abs(pos.x - back.x) + Math.abs(pos.y - back.y)).toBeLessThanOrEqual(7);
      prev = pos;
    }
    expect(prev).toBeDefined();
  });

  it('buildPath: 대각선·길이 0·점 1개는 에러', () => {
    expect(() => buildPath([[0, 0], [1, 1]], false)).toThrow(/직각/);
    expect(() => buildPath([[0, 0], [0, 0]], false)).toThrow(/길이 0/);
    expect(() => buildPath([[0, 0]], false)).toThrow(/2개 이상/);
    const p = buildPath([[0, 0], [3, 0], [3, 2]], false);
    expect(p.length).toBe(5000);
    expect(p.segments.map((s) => [s.start, s.length])).toEqual([[0, 3000], [3000, 2000]]);
  });
});
