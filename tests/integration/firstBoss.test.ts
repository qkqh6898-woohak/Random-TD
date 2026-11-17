/**
 * F10-2 첫 보스 밸런스 봇 (tests/bots/firstBoss.ts) — 두 운영 × 20시드.
 *
 * - 평소 `npm test`: 1시드 짧게 (같은 시드면 같은 결과, 봇이 소환·승급·강화·미션을 실제로 한다).
 * - 전체: `npm run bot:first-boss` (FIRST_BOSS=1) — 기준(10단계 배율 ×1) 표 · 조정 단계(배율만 바꿈) · 지금 데이터 표 · 보스 체력 비교를 출력.
 *   FIRST_BOSS_WRITE=1이면 docs/balance/first-boss-baseline.md · first-boss-tuned.md 를 다시 쓴다.
 */
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { GameData } from '../../src/data/load';
import { NO_THEME, buildMatchRules } from '../../src/sim/rules';
import { bossForStage, stageBossHpMulBp } from '../../src/sim/systems/BossSchedule';
import { bossSpawnStats } from '../../src/sim/systems/Spawn';
import { data } from '../helpers/match';
import { firstBossTable, runFirstBoss } from '../bots/firstBoss';

/** 사전 시험(문서의 10판·30판)과 겹치지 않는 고정 시드 20개 */
export const FIRST_BOSS_SEEDS: readonly number[] = Array.from({ length: 20 }, (_, i) => 7001 + i);
/** 조정 단계 (한 번에 한 변수 = 10단계 보스 체력 배율만) */
const STEPS = [1, 0.5, 0.38, 0.3, 0.25, 0.2, 0.18, 0.15, 0.1];

function withMul(d: GameData, mul: number): GameData {
  return { ...d, enemies: { ...d.enemies, bossCycle: { ...d.enemies.bossCycle, stageHpMul: { ...d.enemies.bossCycle.stageHpMul, '10': mul } } } };
}

/** 보스 등장 체력 비교 표 (기준 = 배율 ×1, 지금 = 데이터). */
function bossHpCompare(d: GameData): string {
  const now = buildMatchRules(d);
  const base = buildMatchRules(withMul(d, 1));
  const rows = [10, 20, 30, 70, 80, 130].map((s) => {
    const b = bossForStage(now, 'infinite', 0, s)!;
    const before = bossSpawnStats({ rules: base, theme: NO_THEME }, b, s, stageBossHpMulBp(base, 'infinite', s)).hp;
    const after = bossSpawnStats({ rules: now, theme: NO_THEME }, b, s, stageBossHpMulBp(now, 'infinite', s)).hp;
    return `| ${s} | ${b.name} | ${before.toLocaleString('en-US')} | ${after.toLocaleString('en-US')} | ×${(after / before).toFixed(2)} |`;
  });
  return ['| 단계 | 보스 | 기준 빌드 체력 | 지금 체력 | 비율 |', '|---|---|---|---|---|', ...rows].join('\n');
}

describe('F10-2 첫 보스 봇', () => {
  it('1시드: 같은 시드면 결과가 같고, B 운영은 강화·미션을 실제로 쓴다', () => {
    const a = runFirstBoss(data, 7001, 'B');
    const b = runFirstBoss(data, 7001, 'B');
    expect(a).toEqual(b);
    expect(a.summons).toBeGreaterThan(20);
    expect(a.merges).toBeGreaterThan(3);
    expect(a.normalUpgrade).toBeGreaterThan(0);
    expect(a.missionsClaimed).toBeGreaterThan(0);
    expect(a.bossHp).toBeGreaterThan(0);
    expect(a.cleared || a.bossHpLeftPct > 0).toBe(true);
  }, 60_000);

  it.runIf(process.env.FIRST_BOSS === '1')(
    `두 운영 × ${FIRST_BOSS_SEEDS.length}시드: 기준 · 조정 단계 · 지금`,
    () => {
      const base = firstBossTable(
        '기준 (10단계 보스 체력 배율 ×1 = 조정 전)',
        withMul(data, 1),
        FIRST_BOSS_SEEDS,
        '> `npm run bot:first-boss` (tests/integration/firstBoss.test.ts · tests/bots/firstBoss.ts). 시드 7001~7020 (사전 시험과 겹치지 않음).',
      );
      const steps: string[] = ['| 단계 | 10단계 배율 | 박쥐 여왕 체력 | A 클리어 | B 클리어 | B 처치 평균 | B 시간 초과 남은 체력 평균 |', '|---|---|---|---|---|---|---|'];
      STEPS.forEach((mul, i) => {
        const r = firstBossTable('', withMul(data, mul), FIRST_BOSS_SEEDS);
        const kills = r.results.B.filter((x) => x.cleared).map((x) => x.killSeconds as number);
        const lefts = r.results.B.filter((x) => !x.cleared).map((x) => x.bossHpLeftPct);
        const avg = (xs: number[]): string => (xs.length ? `${(xs.reduce((p, q) => p + q, 0) / xs.length).toFixed(1)}` : '-');
        steps.push(
          `| ${i + 1} | ×${mul} | ${r.results.A[0]!.bossHp.toLocaleString('en-US')} | ${r.clears.A}/20 | **${r.clears.B}/20** | ${avg(kills)}초 | ${avg(lefts)}% |`,
        );
      });
      const mul = data.enemies.bossCycle.stageHpMul?.['10'] ?? 1;
      const tuned = firstBossTable(`지금 데이터 (10단계 보스 체력 배율 ×${mul})`, data, FIRST_BOSS_SEEDS);
      const out = [
        base.md,
        '## 조정 단계 (변수 하나 = enemies.json bossCycle.stageHpMul["10"])',
        '',
        steps.join('\n'),
        '',
        tuned.md,
        '## 보스 등장 체력: 기준 빌드 vs 지금',
        '',
        bossHpCompare(data),
        '',
      ].join('\n');
      console.log(out);
      if (process.env.FIRST_BOSS_WRITE === '1') {
        writeFileSync('docs/balance/first-boss-baseline.md', `# 첫 보스 기준값 (F10-2)\n\n${base.md}`);
        writeFileSync(
          'docs/balance/first-boss-tuned.md',
          `# 첫 보스 조정 결과 (F10-2 → G-1 마당 맵·무더기)\n\n> 해석·결정은 docs/BALANCE.md 7.2·'G-1' 절 · docs/PROGRESS.md 'F10 첫 보스 밸런스'·'G-1 게임 시스템'. 다시 만들기: \`FIRST_BOSS_WRITE=1 npm run bot:first-boss\`.\n\n${tuned.md}\n## 조정 단계 (변수 하나 = enemies.json bossCycle.stageHpMul["10"])\n\n${steps.join('\n')}\n\n## 보스 등장 체력: 기준 빌드 vs 지금\n\n${bossHpCompare(data)}\n`,
        );
      }
      expect(base.clears.B).toBeLessThanOrEqual(tuned.clears.B);
    },
    900_000,
  );
});
