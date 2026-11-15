/**
 * 리플레이 생성용 결정적 봇 (테스트 전용). 같은 판·같은 옵션이면 늘 같은 명령을 낸다.
 * - 1초(20틱)마다: 승급할 수 있는 묶음이 있으면 가장 먼저 소환된 것을 승급 (allMerge면 모두 승급), 아니면 돈이 되면 빈 칸에 소환.
 *   빈 칸은 경로에 가까운 칸부터 (체비쇼프 거리 → 위에서 아래 → 왼쪽에서 오른쪽).
 * - moveEvery틱마다: 가장 나중에 놓인 타워를 들어 올렸다가(hold on/off) 빈 칸으로 옮기거나 다른 타워와 교환.
 * - 처음에 debugTowers를 debug 명령으로 놓는다 (debug 판만).
 * - M4: workers까지는 돈이 되면 일꾼을 먼저 고용, pickCard가 있으면 보스 카드를 그 번호로 고른다 (1초마다 한 가지 행동).
 * - M5 (옵션이 있을 때만 — 예전 리플레이는 그대로): 받을 미션이 있으면 모두 받기, 도전이 비어 있으면 시작할 수 있는 가장 높은
 *   단계 시작, upgrades 순서대로 목표 레벨까지 강화, gamble.every틱마다 그 테이블 도박. debugGold면 처음에 돈을 더한다 (debug 판).
 */
import type { Match } from '../../src/sim/match';
import { towerAt } from '../../src/sim/entities/Tower';
import { pathTiles } from '../../src/sim/map';
import { mergeableGroups } from '../../src/sim/systems/Merge';
import { summonCheck } from '../../src/sim/systems/Summon';
import { hireCheck } from '../../src/sim/systems/Economy';
import { challengeCheck } from '../../src/sim/systems/Challenge';
import { gambleCheck } from '../../src/sim/systems/Gamble';
import { missionsClaimable } from '../../src/sim/systems/Mission';
import { upgradeCheck, upgradeLevel } from '../../src/sim/systems/Upgrade';

export interface BotOptions {
  /** 이 틱까지 (패배하면 그 전에 멈춤) */
  endTick: number;
  /** 모두 승급을 쓸지 */
  allMerge?: boolean;
  /** 이동·교환 주기 (틱, 0 = 안 함) */
  moveEvery?: number;
  /** 처음에 놓을 타워 [x, y, towers.json 순서 번호] (debug 판) */
  debugTowers?: [number, number, number][];
  /** 일꾼을 이 수까지 먼저 고용 (돈이 되면 소환보다 먼저, M4-1). 0 = 안 함 */
  workers?: number;
  /** 보스 카드를 받으면 고를 카드 번호 (생략하면 고르지 않음) */
  pickCard?: number;
  /** 처음에 debug 단계 건너뛰기를 이만큼 (1틱에 하나씩, debug 판) */
  skipStages?: number;
  /** M5: 처음에 debug로 더할 돈 (debug 판) */
  debugGold?: number;
  /** M5: 받을 미션이 있으면 [모두 받기] */
  claimMissions?: boolean;
  /** M5: 진행 중 도전이 없으면 시작할 수 있는 가장 높은 단계를 시작 */
  challenges?: boolean;
  /** M5: 강화 [k, 목표 레벨] — 앞에서부터 목표에 닿을 때까지 (돈이 되면) */
  upgrades?: [number, number][];
  /** M5: every틱마다 테이블 t에 도박 (돈이 되면) */
  gamble?: { t: number; every: number };
}

/** M5 행동 하나 (없으면 null): 미션 받기 → 도전 → 강화 → 도박. */
function menuAction(match: Match, opts: BotOptions, t: number): Parameters<Match['world']['enqueue']>[0] | null {
  const ctx = match.ctx;
  if (opts.claimMissions && missionsClaimable(match.state) > 0) return { type: 'claimAllMissions' };
  if (opts.challenges && match.state.challengeLevel === 0) {
    for (let lv = ctx.rules.challenges.length; lv >= 1; lv--) if (challengeCheck(ctx, lv, t) === null) return { type: 'startChallenge', lv };
  }
  for (const [k, target] of opts.upgrades ?? []) {
    if (upgradeLevel(match.state, 0, k) >= target) continue;
    if (upgradeCheck(ctx, 0, k) === null) return { type: 'upgrade', k };
    break; // 앞 강화를 살 돈이 모일 때까지 기다린다
  }
  if (opts.gamble && t % opts.gamble.every === 0 && gambleCheck(ctx, 0, opts.gamble.t) === null) return { type: 'gamble', t: opts.gamble.t };
  return null;
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
  for (let i = 0; i < (opts.skipStages ?? 0); i++) w.enqueue({ type: 'debugSkipStage', tick: match.tick + i });
  if (opts.debugGold) w.enqueue({ type: 'debugAddGold', amount: opts.debugGold });
  let flip = 0;
  while (match.tick < opts.endTick && !match.defeated) {
    const t = match.tick;
    if (t % 20 === 0) {
      const groups = mergeableGroups(match.ctx, w, 0);
      const g = groups[0];
      const menu = menuAction(match, opts, t);
      if (opts.pickCard !== undefined && match.state.cardOffers.some((o) => o.player === 0)) {
        w.enqueue({ type: 'pickCard', i: opts.pickCard });
      } else if (menu) {
        w.enqueue(menu);
      } else if (opts.workers && match.state.workers < opts.workers && hireCheck(match.ctx) === null) {
        w.enqueue({ type: 'hireWorker' });
      } else if (g) {
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
