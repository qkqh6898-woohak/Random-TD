/**
 * 맵 로더 (DEV_PLAN M1-2): maps/*.json의 tiles·waypoints → sim이 쓰는 격자·경로.
 *
 * - 좌표: 칸 (x, y) = (열, 행), 왼쪽 위 (0, 0). 1칸 = TILE(1000) 단위. 칸 (x, y)의 중심 = (x·1000 + 500, y·1000 + 500).
 *   몹은 칸 중심을 잇는 웨이포인트 선 위를 걷는다. 타워(M2)도 칸 중심에 선다 → 사거리는 중심 사이 거리.
 * - 경로: 웨이포인트를 잇는 직각 구간들. 몹의 위치는 '진행도'(경로를 따라 걸은 거리, 정수 단위) 하나로 정해진다.
 *   loop 맵(순환의 정원)은 진행도를 경로 길이로 나눈 나머지 지점에 있다 → 진행도는 계속 늘어난다
 *   (무한 모드 선두는 진행도가 아니라 가장 오래 살아 있는 몹, Targeting).
 * - 배치 칸 목록은 (y, x) 순 = 화면 위에서 아래, 왼쪽에서 오른쪽. 반복 순서가 항상 같다.
 * 데이터 모양 검사(줄 길이·글자·직각·경로 칸 = P)는 src/data/load.ts가 이미 했다. 여기서는 정수 구조로 바꾸기만 한다.
 */
import type { MapData, Point } from '../data/load';
import { TILE } from './Fixed';

export type TileKind = 'path' | 'build' | 'decor';

const KIND_OF: Readonly<Record<string, TileKind>> = { P: 'path', B: 'build', X: 'decor' };

/** 경로의 직각 구간 하나. 좌표·길이는 정수 단위. */
export interface PathSegment {
  /** 시작점 (칸 중심, 단위) */
  x: number;
  y: number;
  /** 방향 (-1, 0, 1). 둘 중 하나만 0이 아니다 */
  dx: number;
  dy: number;
  /** 경로 처음부터 이 구간 시작까지의 거리 (단위) */
  start: number;
  /** 구간 길이 (단위) */
  length: number;
}

export interface SimPath {
  readonly segments: readonly PathSegment[];
  /** 전체 길이 (단위). 순환의 정원 28칸 = 28000 */
  readonly length: number;
  readonly loop: boolean;
}

export interface SimMap {
  readonly id: string;
  readonly name: string;
  readonly mode: 'infinite' | 'stage';
  readonly width: number;
  readonly height: number;
  /** 칸 종류, 행 우선 (index = y·width + x) */
  readonly kinds: readonly TileKind[];
  /** 배치 칸 (y, x 순) */
  readonly buildable: readonly Point[];
  readonly path: SimPath;
  /** 경로 길이 (칸). 화면 밖 등장·퇴장 구간 포함 */
  readonly pathLengthTiles: number;
  readonly turns: number;
  readonly spawn: Point;
  /** 스테이지 맵의 출구 (loop 맵은 null) */
  readonly exit: Point | null;
  /** 무한 모드 몹 한도 (스테이지 맵은 null) */
  readonly mobLimit: number | null;
  /** 스테이지 맵 목숨 (무한 맵은 null) */
  readonly lives: number | null;
  readonly crossings: readonly Point[];
}

/** 칸 중심 좌표 (정수 단위). */
export function tileCenter(tx: number, ty: number): { x: number; y: number } {
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
}

/** 웨이포인트 → 경로 구간. 길이 0 구간·대각선은 데이터 검사가 이미 막았지만 여기서도 확인한다. */
export function buildPath(waypoints: readonly Point[], loop: boolean): SimPath {
  if (waypoints.length < 2) throw new Error('웨이포인트가 2개 이상이어야 한다');
  const segments: PathSegment[] = [];
  let start = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const [ax, ay] = waypoints[i - 1] as Point;
    const [bx, by] = waypoints[i] as Point;
    if (ax !== bx && ay !== by) throw new Error(`직각 경로가 아니다: [${ax},${ay}] → [${bx},${by}]`);
    const tilesLong = Math.abs(bx - ax) + Math.abs(by - ay);
    if (tilesLong === 0) throw new Error(`길이 0 구간: [${ax},${ay}]`);
    const c = tileCenter(ax, ay);
    const length = tilesLong * TILE;
    segments.push({ x: c.x, y: c.y, dx: Math.sign(bx - ax), dy: Math.sign(by - ay), start, length });
    start += length;
  }
  return { segments, length: start, loop };
}

/**
 * 진행도(단위) → 위치(단위). 정수를 넣으면 정수가 나온다 (구간이 축에 나란해서 곱셈 하나).
 * - loop 경로: 진행도를 길이로 나눈 나머지 지점.
 * - 아닌 경로: 0 미만은 시작점, 길이 이상은 끝점에 붙인다.
 * 화면은 보간한 소수 진행도를 넣어도 된다 (같은 식).
 */
export function positionAt(path: SimPath, progress: number): { x: number; y: number } {
  let d = progress;
  if (path.loop) {
    d = d % path.length;
    if (d < 0) d += path.length;
  } else if (d < 0) d = 0;
  else if (d > path.length) d = path.length;
  const segs = path.segments;
  // 구간이 많지 않아서(맵당 20개 이하) 앞에서부터 찾는다
  let seg = segs[segs.length - 1] as PathSegment;
  for (const s of segs) {
    if (d < s.start + s.length) {
      seg = s;
      break;
    }
  }
  const along = d - seg.start;
  return { x: seg.x + seg.dx * along, y: seg.y + seg.dy * along };
}

/** 진행도 지점의 이동 방향 (-1, 0, 1). 그리기(좌우 뒤집기)용. */
export function directionAt(path: SimPath, progress: number): { dx: number; dy: number } {
  let d = progress;
  if (path.loop) {
    d = d % path.length;
    if (d < 0) d += path.length;
  }
  for (const s of path.segments) {
    if (d < s.start + s.length) return { dx: s.dx, dy: s.dy };
  }
  const last = path.segments[path.segments.length - 1] as PathSegment;
  return { dx: last.dx, dy: last.dy };
}

/** MapData → SimMap. */
export function buildSimMap(data: MapData): SimMap {
  const kinds: TileKind[] = [];
  const buildable: Point[] = [];
  for (let y = 0; y < data.height; y++) {
    const row = data.tiles[y] ?? '';
    for (let x = 0; x < data.width; x++) {
      const kind = KIND_OF[row[x] ?? 'X'] ?? 'decor';
      kinds.push(kind);
      if (kind === 'build') buildable.push([x, y]);
    }
  }
  const loop = data.loop === true;
  const path = buildPath(data.waypoints, loop);
  return {
    id: data.id,
    name: data.name,
    mode: data.mode,
    width: data.width,
    height: data.height,
    kinds,
    buildable,
    path,
    pathLengthTiles: path.length / TILE,
    turns: data.turns,
    spawn: data.spawn,
    exit: loop ? null : (data.exit ?? (data.waypoints[data.waypoints.length - 1] as Point)),
    mobLimit: data.mobLimit ?? null,
    lives: data.lives ?? null,
    crossings: data.crossings,
  };
}

/** 칸 종류 (맵 밖이면 null). */
export function tileAt(map: SimMap, x: number, y: number): TileKind | null {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return null;
  return map.kinds[y * map.width + x] ?? null;
}

/** 타워를 놓을 수 있는 칸인가. */
export function isBuildable(map: SimMap, x: number, y: number): boolean {
  return tileAt(map, x, y) === 'build';
}

/** 맵 위 경로 칸 목록 (맵 밖 등장·퇴장 칸 제외), (y, x) 순. */
export function pathTiles(map: SimMap): Point[] {
  const out: Point[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) if (map.kinds[y * map.width + x] === 'path') out.push([x, y]);
  }
  return out;
}
