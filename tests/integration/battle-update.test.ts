import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import baseline from '../../docs/balance/battle-update-baseline.json';
import type { GameData } from '../../src/data/load';
import { createMatch } from '../../src/sim/match';
import { killMob } from '../../src/sim/systems/Kill';
import { firstBossTable } from '../bots/firstBoss';
import { data, jumpToStage } from '../helpers/match';

const oldData: GameData = {
  ...data,
  game: { ...data.game, boss: { ...data.game.boss, timeLimitSeconds: baseline.bossSeconds } },
  towers: { ...data.towers, towers: data.towers.towers.map((t) => ({ ...t, ...baseline.attacks[t.id as keyof typeof baseline.attacks] })) },
};

describe('일반 플레이 전투 업데이트', () => {
  it('일반 단계는 60초, 보스는 90초 동안 같은 단계 유지, 처치 뒤 다음 단계는 예정대로', () => {
    const m = createMatch(data, { seed: 37, mode: 'infinite' });
    jumpToStage(m, 9);
    expect(m.state.nextStageTick - m.state.stageStartTick).toBe(1200);
    for (const mob of m.mobs()) m.world.entities.remove(mob.id);
    jumpToStage(m, 10);
    const start = m.state.stageStartTick;
    expect(m.state.nextStageTick).toBe(start + 1800);
    const boss = m.mobs().find((b) => b.boss)!;
    boss.speed = 0;
    m.stepN(1250);
    expect(m.state.stage).toBe(10);
    expect(m.defeated).toBe(false);
    killMob(m.ctx, m.world, boss, 0, 0);
    while (m.tick <= start + 1800) m.step();
    expect(m.state.stage).toBe(11);
    expect(m.state.nextStageTick - m.state.stageStartTick).toBe(1200);
  });

  it('기본 공격력은 65종의 물리·마법·고정 피해 모두 정확히 +50% (0 유지) · 리미티드는 그 위에 ×4.5 (V2.0 PR-A 가장 강한 등급)', () => {
    for (const t of data.towers.towers) {
      const old = baseline.attacks[t.id as keyof typeof baseline.attacks];
      const mul = t.grade === 'hidden' ? 1.5 * 4.5 : 1.5;
      for (const key of ['atk', 'matk', 'tatk'] as const) expect(t[key]).toBeCloseTo(old[key] * mul, 6);
    }
  });

  it.runIf(process.env.BATTLE_BALANCE === '1')('최신 main 대비 첫 10단계: 같은 두 운영 × 20시드', () => {
    const seeds = Array.from({ length: 20 }, (_, i) => 7001 + i);
    const stageRows: string[] = [];
    const tables = [oldData, data].map((d, i) => {
      const peaks = Array(11).fill(0) as number[];
      const reached = Array.from({ length: 11 }, () => new Set<number>());
      const r = firstBossTable(i === 0 ? '변경 전 (main ee40acb)' : '변경 후', d, seeds, '', {
        onTick(m) {
          const s = m.state.stage;
          if (s >= 1 && s <= 10) {
            peaks[s] = Math.max(peaks[s]!, m.mobCount());
            reached[s]!.add(m.world.seed);
          }
        },
      });
      stageRows.push(...Array.from({ length: 10 }, (_, k) => `| ${i === 0 ? '전' : '후'} | ${k + 1} | ${reached[k + 1]!.size}/20 | ${peaks[k + 1]} |`));
      return r;
    });
    const [before, after] = tables;
    expect(after!.clears.A).toBeGreaterThanOrEqual(before!.clears.A);
    expect(after!.clears.B).toBeGreaterThanOrEqual(before!.clears.B);
    const attackRows = data.towers.towers.map((t) => {
      const old = baseline.attacks[t.id as keyof typeof baseline.attacks];
      return `| ${t.name} (${t.id}) | ${old.atk} → ${t.atk} | ${old.matk} → ${t.matk} | ${old.tatk} → ${t.tatk} |`;
    });
    const report = `# 전투 업데이트 수치·첫 10단계 비교\n\n기준 main: ${baseline.base}\n\n보스 제한: **60 → 90초**. 일반 단계 60초 유지, 보스 단계만 90초. 10단계 체력 배율 0.1 유지. 모든 타워 기본 공격력 +50%.\n\n${before!.md}\n${after!.md}\n## 1~10단계 점검\n\n두 운영 합산, 동일 20시드. 도달 시드 수와 동시 전투 몹 수 최고치(보스 포함, 도전 제외).\n\n| 구분 | 단계 | 도달 | 최고 몹 수 |\n|---|---|---|---|\n${stageRows.join('\n')}\n\n## 65종 공격력 (Lv1, 강화 전)\n\n| 타워 | 물리 전 → 후 | 마법 전 → 후 | 고정 전 → 후 |\n|---|---|---|---|\n${attackRows.join('\n')}\n`;
    writeFileSync('docs/balance/battle-update.md', report);
    console.log(`main A ${before!.clears.A}/20 B ${before!.clears.B}/20 → 변경 후 A ${after!.clears.A}/20 B ${after!.clears.B}/20`);
  }, 900_000);
});
