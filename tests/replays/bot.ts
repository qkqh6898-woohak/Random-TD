/**
 * 리플레이 생성용 결정적 봇 (테스트 전용). 같은 판·같은 옵션이면 늘 같은 명령을 낸다.
 * - 1초(20틱)마다: 승급할 수 있는 묶음이 있으면 가장 먼저 소환된 것을 승급 (allMerge면 모두 승급), 아니면 돈이 되면 빈 칸에 소환.
 *   빈 칸은 경로에 가까운 칸부터 (체비쇼프 거리 → 위에서 아래 → 왼쪽에서 오른쪽).
 * - moveEvery틱마다: 가장 나중에 놓인 타워를 들어 올렸다가(hold on/off) 빈 칸으로 옮기거나 다른 타워와 교환.
 * - 처음에 debugTowers를 debug 명령으로 놓는다 (debug 판만).
 */
import type { Match } from '../../src/sim/match';
import { towerAt } from '../../src/sim/entities/Tower';
import { pathTiles } from '../../src/sim/map';
import { mergeableGroups } from '../../src/sim/systems/Merge';
import { summonCheck } from '../../src/sim/systems/Summon';

export interface BotOptions {
  /** 이 틱까지 (패배하면 그 전에 멈춤) */
  endTick: number;
  /** 모두 승급을 쓸지 */
  allMerge?: boolean;
  /** 이동·교환 주기 (틱, 0 = 안 함) */
  moveEvery?: number;
  /** 처음에 놓을 타워 [x, y, towers.json 순서 번호] (debug 판) */
  debugTowers?: [number, number, number][];
}

/** 경로에 가까운 배치 칸부터. */
export function preferredTiles(match: Match): [number, number][] {
  const path = pathTiles(match.map);
  const dist = ([x, y]: readonly [number, number]): number => {
    let best = 1e9;
    for (const [px, py] of path) best = Math.min(best, Math.max(Math.abs(px - x), Math.abs(py - y)));
    return best;
  };
  return [...match.map.buildable].map((p) => [p[0], p[1]] as [number, number]).sort((a, b) => dist(a) - dist(b) || a[1] - b[1] || a[0] - b[0]);
}

export function runBot(match: Match, opts: BotOptions): void {
  const tiles = preferredTiles(match);
  const w = match.world;
  for (const [x, y, t] of opts.debugTowers ?? []) w.enqueue({ type: 'debugTower', x, y, t });
  let flip = 0;
  while (match.tick < opts.endTick && !match.defeated) {
    const t = match.tick;
    if (t % 20 === 0) {
      const groups = mergeableGroups(match.ctx, w, 0);
      const g = groups[0];
      if (g) {
        w.enqueue({ type: opts.allMerge ? 'mergeAll' : 'merge', x: g.first.tx, y: g.first.ty });
      } else {
        const free = tiles.find(([x, y]) => summonCheck(match.ctx, w, x, y) === null);
        if (free) w.enqueue({ type: 'summon', x: free[0], y: free[1] });
      }
    }
    if (opts.moveEvery && t > 0 && t % opts.moveEvery === 0) {
      const towers = match.towers();
      const last = towers[towers.length - 1];
      if (last) {
        flip++;
        // 짝수 번째는 빈 칸으로 이동, 홀수 번째는 첫 타워와 교환
        const dest = flip % 2 === 0 ? tiles.slice().reverse().find(([x, y]) => !towerAt(w, x, y)) : [towers[0]!.tx, towers[0]!.ty];
        if (dest && (dest[0] !== last.tx || dest[1] !== last.ty)) {
          w.enqueue({ type: 'hold', x: last.tx, y: last.ty, on: 1 });
          match.step();
          w.enqueue({ type: 'hold', x: last.tx, y: last.ty, on: 0 });
          w.enqueue({ type: 'move', fx: last.tx, fy: last.ty, tx: dest[0] as number, ty: dest[1] as number });
        }
      }
    }
    match.step();
  }
}
