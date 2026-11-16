/**
 * M1-2 맵 로더 + 위치 계산. T-3: 2×2 블록 맵 — crossroads v3 10×10·배치 36칸·경로 59, circle v2 7×11·배치 32칸·고리 24.
 */
import { describe, expect, it } from 'vitest';
import { checkMapBlocks, loadGameData, MAP_BLOCK_SIZE, type MapData } from '../../src/data/load';
import type { Issue } from '../../src/data/schema';
import { TILE } from '../../src/sim/Fixed';
import { buildPath, buildSimMap, directionAt, isBuildable, pathTiles, positionAt, tileAt, tileCenter } from '../../src/sim/map';
import circleV1 from '../fixtures/maps/circle-v1.json';
import crossroadsV2 from '../fixtures/maps/crossroads-v2.json';

const data = loadGameData();
const circle = buildSimMap(data.maps.circle!);
const crossroads = buildSimMap(data.maps.crossroads!);

describe('맵 칸 수와 경로 길이 (MAPS.md 1.1·2.1, T-3 2×2 블록)', () => {
  it('사거리 미로: 10×10, 2×2 블록 9개 = 배치 36칸 (예전 96칸의 38%), 경로 59칸(화면 밖 등장·퇴장 포함), 회전 10, 교차 4, 목숨 20', () => {
    expect([crossroads.width, crossroads.height]).toEqual([10, 10]);
    expect(crossroads.buildable).toHaveLength(36);
    expect(Object.keys(data.maps.crossroads!.blocks)).toHaveLength(9);
    expect(crossroads.pathLengthTiles).toBe(59);
    expect(crossroads.path.length).toBe(59 * TILE);
    expect(crossroads.turns).toBe(10);
    expect(crossroads.lives).toBe(20);
    expect(crossroads.mobLimit).toBeNull();
    expect(crossroads.path.loop).toBe(false);
    expect(crossroads.exit).toEqual([3, -1]);
    expect(crossroads.crossings).toEqual([[3, 3], [6, 3], [6, 6], [3, 6]]);
  });

  it('순환의 정원: 7×11, 2×2 블록 8개 = 배치 32칸 (안쪽 16 + 고리 위·아래 바깥 16, 예전 71칸의 45%), 고리 24칸, 몹 한도 150', () => {
    expect([circle.width, circle.height]).toEqual([7, 11]);
    expect(circle.buildable).toHaveLength(32);
    expect(Object.keys(data.maps.circle!.blocks)).toHaveLength(8);
    expect(circle.pathLengthTiles).toBe(24);
    expect(circle.path.loop).toBe(true);
    expect(circle.mobLimit).toBe(150);
    expect(circle.lives).toBeNull();
    expect(circle.exit).toBeNull();
    const inner = circle.buildable.filter(([x, y]) => x >= 1 && x <= 5 && y >= 3 && y <= 7);
    expect(inner).toHaveLength(16);
  });

  it('칸 종류: 배치 + 경로 + 빈 땅 = 전체, 경로 칸 수 = 맵 안 경로 길이 (교차점은 한 번)', () => {
    expect(pathTiles(circle)).toHaveLength(24);
    expect(circle.kinds.filter((k) => k === 'decor')).toHaveLength(77 - 32 - 24);
    // 사거리 미로: 경로 59걸음 = 지나는 칸 60개 (화면 밖 등장·퇴장 2칸 + 맵 안 58칸, 교차점 4곳은 두 번) → 맵 안 P 칸 = 58 − 4 = 54
    expect(pathTiles(crossroads)).toHaveLength(54);
    expect(crossroads.buildable.length + pathTiles(crossroads).length + crossroads.kinds.filter((k) => k === 'decor').length).toBe(100);
  });

  it('배치 칸 목록은 (y, x) 순서', () => {
    const sorted = [...circle.buildable].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    expect(circle.buildable).toEqual(sorted);
    expect(circle.buildable[0]).toEqual([1, 0]);
    expect(circle.buildable[4]).toEqual([1, 1]);
  });

  it('tileAt·isBuildable: 맵 밖은 null/false, 빈 땅(블록 사이 틈)은 배치 불가', () => {
    expect(tileAt(circle, 0, 2)).toBe('path');
    expect(tileAt(circle, 1, 3)).toBe('build');
    expect(tileAt(circle, 3, 5)).toBe('decor');
    expect(tileAt(circle, -1, 0)).toBeNull();
    expect(tileAt(circle, 7, 0)).toBeNull();
    expect(isBuildable(circle, 5, 7)).toBe(true);
    expect(isBuildable(circle, 3, 3)).toBe(false);
    expect(isBuildable(circle, 0, 2)).toBe(false);
    expect(isBuildable(crossroads, 0, -1)).toBe(false);
    // 예전 가장자리 땅은 이제 빈 땅 (2×2 블록 밖 배치 칸 없음)
    for (const [x, y] of [[1, 0], [4, 0], [0, 4], [9, 5], [4, 9]] as const) expect(isBuildable(crossroads, x, y)).toBe(false);
    for (const [x, y] of [[1, 1], [5, 5], [8, 8]] as const) expect(isBuildable(crossroads, x, y)).toBe(true);
  });
});

describe('2×2 블록 문법 검사 (T-3, checkMapBlocks)', () => {
  const check = (m: Pick<MapData, 'tiles' | 'blocks'>): string[] => {
    const issues: Issue[] = [];
    checkMapBlocks(m, '', issues);
    return issues.map((i) => i.message);
  };

  it('게임 맵 두 개는 통과 (블록 = 2×2, 배치 칸은 모두 블록 안)', () => {
    expect(MAP_BLOCK_SIZE).toBe(2);
    expect(check(data.maps.circle!)).toEqual([]);
    expect(check(data.maps.crossroads!)).toEqual([]);
  });

  it('예전 3×3 블록 맵·가장자리 땅·블록 없는 테두리는 걸린다', () => {
    const cross = check(crossroadsV2 as unknown as MapData);
    expect(cross.filter((m) => m.includes('2×2이어야'))).toHaveLength(9);
    expect(cross.some((m) => m.includes('블록 밖 배치 칸'))).toBe(true);
    expect(check(circleV1 as unknown as MapData).some((m) => m.includes('2×2이어야'))).toBe(true);
  });

  it('맞닿은 블록·B가 아닌 블록 칸·겹친 블록을 알려 준다', () => {
    const touching = check({ tiles: ['BBBB', 'BBBB'], blocks: { a: { x: 0, y: 0, w: 2, h: 2 }, b: { x: 2, y: 0, w: 2, h: 2 } } });
    expect(touching).toEqual([expect.stringContaining('a·b가 맞닿아')]);
    const notB = check({ tiles: ['BP', 'BB'], blocks: { a: { x: 0, y: 0, w: 2, h: 2 } } });
    expect(notB).toEqual([expect.stringContaining('[1,0]이 B가 아니다')]);
    const overlap = check({ tiles: ['BBB', 'BBB'], blocks: { a: { x: 0, y: 0, w: 2, h: 2 }, b: { x: 1, y: 0, w: 2, h: 2 } } });
    expect(overlap.some((m) => m.includes('겹친다'))).toBe(true);
  });
});

describe('경로 위치 (진행도 → 좌표)', () => {
  it('칸 중심 = 칸 × 1000 + 500', () => {
    expect(tileCenter(0, 0)).toEqual({ x: 500, y: 500 });
    expect(tileCenter(1, -1)).toEqual({ x: 1500, y: -500 });
  });

  it('순환의 정원: (0,2)에서 시작해 시계 방향 → 오른쪽 6칸, 아래 6칸, 왼쪽 6칸, 위 6칸', () => {
    const p = circle.path;
    expect(positionAt(p, 0)).toEqual(tileCenter(0, 2));
    expect(positionAt(p, 6000)).toEqual(tileCenter(6, 2));
    expect(positionAt(p, 12000)).toEqual(tileCenter(6, 8));
    expect(positionAt(p, 18000)).toEqual(tileCenter(0, 8));
    expect(positionAt(p, 23999)).toEqual({ x: 500, y: 2501 });
    expect(directionAt(p, 0)).toEqual({ dx: 1, dy: 0 });
    expect(directionAt(p, 7000)).toEqual({ dx: 0, dy: 1 });
    expect(directionAt(p, 13000)).toEqual({ dx: -1, dy: 0 });
    expect(directionAt(p, 19000)).toEqual({ dx: 0, dy: -1 });
  });

  it('loop: 한 바퀴(24000)를 넘으면 처음부터, 음수도 감아서', () => {
    const p = circle.path;
    expect(positionAt(p, 24000)).toEqual(positionAt(p, 0));
    expect(positionAt(p, 24000 * 3 + 6500)).toEqual(positionAt(p, 6500));
    expect(positionAt(p, -1000)).toEqual(positionAt(p, 23000));
    expect(directionAt(p, 24000 + 7000)).toEqual({ dx: 0, dy: 1 });
  });

  it('사거리 미로: 화면 밖 (0,-1)에서 등장 → (0,3) → … → 출구 (3,-1), 끝은 붙잡는다', () => {
    const p = crossroads.path;
    expect(positionAt(p, 0)).toEqual(tileCenter(0, -1));
    expect(positionAt(p, 4000)).toEqual(tileCenter(0, 3));
    expect(positionAt(p, 13000)).toEqual(tileCenter(9, 3));
    expect(positionAt(p, 59000)).toEqual(tileCenter(3, -1));
    expect(positionAt(p, 99999)).toEqual(tileCenter(3, -1));
    expect(positionAt(p, -50)).toEqual(tileCenter(0, -1));
  });

  it('사거리 미로: 교차점 (3,3)을 두 번 지난다 (① 가로 구간과 ⑩ 세로 구간)', () => {
    const p = crossroads.path;
    const target = tileCenter(3, 3);
    const hits: number[] = [];
    for (let d = 0; d <= p.length; d += 1000) {
      const pos = positionAt(p, d);
      if (pos.x === target.x && pos.y === target.y) hits.push(d);
    }
    expect(hits).toEqual([7000, 55000]);
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
