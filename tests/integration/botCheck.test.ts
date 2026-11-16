/**
 * T-3 밸런스 확인: 작아진 맵(2×2 블록, 칸 수 40~50%)에서 같은 봇이 몇 단계까지 가는가.
 *
 * 헤드리스 봇 (sim만, 시드 고정): 0.2초(4틱)마다 승급할 수 있는 묶음이 있으면 승급, 없으면 돈이 되는 대로 빈 칸에 소환
 * (경로에 가까운 칸부터 — tests/replays/bot.ts preferredTiles). 패배하거나 maxStage를 넘기면 멈춘다.
 * - 기본 봇: 소환·승급만 (일꾼·강화·카드·도박 없음).
 * - 살림 봇(eco): 보스 카드는 첫 장, 일꾼 4명까지 먼저 고용, 칸이 다 차면 남는 돈으로 강화(일반·영웅·전설 등급·공속을 돌아가며)
 *   → 칸 수가 실제로 걸리는 후반까지 가서 맵 크기 차이가 드러난다.
 *
 * - 평소 `npm test`: 새 맵 1시드 짧게 (봇이 돌고, 판이 끝까지 결정적인지).
 * - 전체 비교: `npm run bot` (BOT_CHECK=1) — 예전 순환의 정원 v1(71칸) vs 새 v2(32칸), 시드 5개, 도달 단계 표를 출력.
 *   결과는 docs/BALANCE.md 'T-3 작은 맵' · PROGRESS.md에 적는다.
 */
import { describe, expect, it } from 'vitest';
import type { GameData } from '../../src/data/load';
import { createMatch, type Match } from '../../src/sim/match';
import { hireCheck } from '../../src/sim/systems/Economy';
import { mergeableGroups } from '../../src/sim/systems/Merge';
import { summonCheck } from '../../src/sim/systems/Summon';
import { upgradeCheck } from '../../src/sim/systems/Upgrade';
import { arenaData, data } from '../helpers/match';
import { preferredTiles } from '../replays/bot';

export interface BotResult {
  seed: number;
  /** 패배한 단계 (maxStage까지 버티면 maxStage) */
  stage: number;
  reason: string;
  towers: number;
  summons: number;
  merges: number;
  /** 진 단계의 보스 (없으면 '') */
  boss: string;
  /** 판 끝에 감지 타워(감지 오라·감지 공격) 수 — 40단계 망령 군주는 늘 투명이라 감지가 없으면 못 잡는다 */
  detectors: number;
}

/** 살림 봇이 칸이 다 찼을 때 돌아가며 사는 강화 (game.json upgrade: 0 일반·1 영웅·2 전설 등급, 3 공속) */
const ECO_UPGRADES = [0, 1, 2, 3];
const ECO_WORKERS = 4;

/** 탐욕 봇 한 판. */
export interface BotOptions {
  /** 살림 봇 (카드·일꾼·칸이 차면 강화) */
  eco?: boolean;
  /** 기본 덱 타워 레벨 (계정 성장 흉내) */
  level?: number;
  /** 단계마다 더하는 돈 (debug 판 — 후반 살림 흉내: 칸이 다 차는 상황을 만든다) */
  stageGold?: number;
}

export function greedyBot(d: GameData, seed: number, maxStage: number, opts: BotOptions = {}): BotResult {
  const levels = opts.level ? [Object.fromEntries(Object.values(d.decks.base).flat().map((id) => [id, opts.level as number]))] : undefined;
  const m: Match = createMatch(d, { seed, mode: 'infinite', ...(levels ? { levels } : {}), ...(opts.stageGold ? { debug: true } : {}) });
  let goldStage = 0;
  const tiles = preferredTiles(m);
  const w = m.world;
  let summons = 0;
  let merges = 0;
  let nextUp = 0;
  while (!m.defeated && m.state.stage <= maxStage) {
    if (opts.stageGold && m.state.stage > goldStage) {
      goldStage = m.state.stage;
      w.enqueue({ type: 'debugAddGold', amount: opts.stageGold });
    }
    if (m.tick % 4 === 0) {
      const g = mergeableGroups(m.ctx, w, 0)[0];
      const free = g ? undefined : tiles.find(([x, y]) => summonCheck(m.ctx, w, x, y) === null);
      if (opts.eco && m.state.cardOffers.some((o) => o.player === 0)) {
        w.enqueue({ type: 'pickCard', i: 0 });
      } else if (g) {
        w.enqueue({ type: 'merge', x: g.first.tx, y: g.first.ty });
        merges++;
      } else if (opts.eco && m.state.workers < ECO_WORKERS && hireCheck(m.ctx) === null) {
        w.enqueue({ type: 'hireWorker' });
      } else if (free) {
        w.enqueue({ type: 'summon', x: free[0], y: free[1] });
        summons++;
      } else if (opts.eco && m.towers().length >= m.map.buildable.length) {
        // 칸이 다 참 → 강화를 돌아가며 (살 수 있는 것만)
        for (let i = 0; i < ECO_UPGRADES.length; i++) {
          const k = ECO_UPGRADES[(nextUp + i) % ECO_UPGRADES.length]!;
          if (upgradeCheck(m.ctx, 0, k) === null) {
            w.enqueue({ type: 'upgrade', k });
            nextUp = (nextUp + i + 1) % ECO_UPGRADES.length;
            break;
          }
        }
      }
    }
    m.step();
  }
  return {
    seed,
    stage: m.defeated ? m.state.stage : maxStage,
    reason: m.defeated ? (m.state.defeatReason ?? '') : `${maxStage}단계 버팀`,
    towers: m.towers().length,
    summons,
    merges,
    boss: m.defeated ? (m.state.bossId ?? '') : '',
    detectors: m.towers().filter((t) => m.rules.towers.get(t.tower)?.detect !== 'none').length,
  };
}

const SEEDS = [1, 2, 3, 4, 5];
const MAX_STAGE = 120;

/** 예전 기준 = 예전 맵(v1 71칸) + 보정 없음 (towerAtkPct 0) */
const before: GameData = { ...arenaData, game: { ...arenaData.game, combat: { ...arenaData.game.combat, towerAtkPct: 0 } } };
/** 새 판 = 새 맵(v2 32칸) + game.json 보정 (BOT_ATK로 다른 값을 시험해 볼 수 있다) */
const after: GameData = process.env.BOT_ATK
  ? { ...data, game: { ...data.game, combat: { ...data.game.combat, towerAtkPct: Number(process.env.BOT_ATK) } } }
  : data;

describe('T-3 밸런스 봇 (작은 맵)', () => {
  it('새 순환의 정원(32칸)에서 봇이 소환·승급하며 판을 진행하고, 같은 시드면 결과가 같다', () => {
    const a = greedyBot(data, 1, 12);
    const b = greedyBot(data, 1, 12);
    expect(a).toEqual(b);
    expect(a.summons).toBeGreaterThan(10);
    expect(a.merges).toBeGreaterThan(0);
    expect(a.towers).toBeLessThanOrEqual(data.maps.circle!.buildableCount);
  });

  it.runIf(process.env.BOT_CHECK === '1')(
    `예전(71칸) vs 새(32칸) 순환의 정원: 시드 ${SEEDS.length}개 도달 단계`,
    () => {
      const avg = (rs: BotResult[]): number => rs.reduce((a, r) => a + r.stage, 0) / rs.length;
      const runs: { title: string; opts: BotOptions }[] = [
        { title: '기본 봇 (소환·승급만)', opts: {} },
        { title: '살림 봇 (카드·일꾼 4·칸이 차면 강화)', opts: { eco: true } },
        { title: '살림 봇 + 강한 계정 (기본 덱 타워 Lv 15)', opts: { eco: true, level: 15 } },
        { title: '부자 봇 (살림 봇 + Lv 15 + 단계마다 3,000원 — 칸이 다 차는 후반 흉내)', opts: { eco: true, level: 15, stageGold: 3000 } },
      ];
      for (const { title, opts } of runs) {
        const oldMap = SEEDS.map((s) => greedyBot(before, s, MAX_STAGE, opts));
        const newMap = SEEDS.map((s) => greedyBot(after, s, MAX_STAGE, opts));
        const cell = (r: BotResult): string => `${r.stage} (${r.boss || r.reason}, 타워 ${r.towers}, 감지 ${r.detectors})`;
        const rows = SEEDS.map((s, i) => `| ${s} | ${cell(oldMap[i]!)} | ${cell(newMap[i]!)} |`);
        const change = ((avg(newMap) - avg(oldMap)) / avg(oldMap)) * 100;
        console.log(
          [
            title,
            `| 시드 | 예전 v1 71칸 (보정 없음) | 새 v2 32칸 (공격력 +${Math.round(after.game.combat.towerAtkPct * 100)}%) |`,
            '|---|---|---|',
            ...rows,
            `| 평균 | ${avg(oldMap).toFixed(1)} | ${avg(newMap).toFixed(1)} (${change >= 0 ? '+' : ''}${change.toFixed(1)}%) |`,
          ].join('\n'),
        );
        expect(oldMap.every((r) => r.stage > 0)).toBe(true);
      }
    },
    600_000,
  );
});
