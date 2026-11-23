/**
 * V3 P2 유물 봇 비교 (docs/v3/p0-spec.md 6장): 같은 시드·같은 봇(첫 보스 봇 B 운영 — 소환·승급·일반 강화·미션·일꾼)으로
 * 유물 없음 / 전투형 / 경제형 / 혼합형을 끝까지(패배 또는 MAX_STAGE) 돌려 도달 웨이브·보스 처치 시간·소환·번 돈·남은 돈을 잰다.
 *
 * - 평소 `npm test`: 1시드 짧게 — 유물 없는 판 = 유물 입력 없는 판(같은 결과), 전투형이 유물 없음보다 약해지지 않음.
 * - 전체: `V3_BOTS=1 npx vitest run tests/integration/v3-relic-bots.test.ts` → 표 출력, V3_BOTS_WRITE=1이면 docs/v3/relic-bots.md.
 * 봇은 유물마다 운영을 바꾸지 않는다(경제형도 같은 운영) — '같은 행동에서 유물이 주는 차이'를 잰다. 사람의 최적 운영 측정이 아니다.
 */
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createMatch } from '../../src/sim/match';
import { isMob } from '../../src/sim/entities/Mob';
import { data } from '../helpers/match';
import { ACT_EVERY, decide } from '../bots/firstBoss';

const MAX_STAGE = 45;
export const LOADOUTS: Record<string, Record<string, number>> = {
  none: {},
  combat: { 'relic-whetstone': 10, 'relic-pinwheel': 10, 'relic-hunter-mark': 10 },
  economy: { 'relic-acorn-bank': 10, 'relic-coin-hammer': 10, 'relic-travel-wallet': 10, 'relic-work-gloves': 5 },
  mixed: { 'relic-whetstone': 10, 'relic-acorn-bank': 10, 'relic-coin-hammer': 10 },
  starter: { 'relic-whetstone': 1, 'relic-acorn-bank': 1 },
};
const NAMES: Record<string, string> = { none: '유물 없음', combat: '전투형 Lv10 ×3 (숫돌·바람개비·표식)', economy: '경제형 Lv10 ×3 + 장갑 Lv5 (저금통·망치·지갑·장갑)', mixed: '혼합 Lv10 ×3 (숫돌·저금통·망치)', starter: '초반 Lv1 ×2 (숫돌·저금통)' };

interface RunResult {
  stage: number;
  bossSeconds: number[];
  summons: number;
  goldEarned: number;
  goldEnd: number;
  upgrades: number;
  workers: number;
  hash: number;
}

function run(seed: number, relics: Record<string, number> | null): RunResult {
  const m = createMatch(data, { seed, mode: 'infinite', legacyCommands: true, ...(relics ? { relics: [relics] } : {}) });
  const w = m.world;
  let summons = 0;
  const bossSeconds: number[] = [];
  let bossAt = -1;
  let killed = 0;
  while (!m.defeated && m.state.stage <= MAX_STAGE) {
    if (w.tick % ACT_EVERY === 0) {
      const cmd = decide(m, 'B', summons, {});
      if (cmd) {
        w.enqueue(cmd);
        if (cmd.type === 'summon' || cmd.type === 'summonAuto') summons++;
      }
    }
    m.step();
    if (bossAt < 0 && m.state.bossId !== '' && m.state.bossStage) bossAt = w.tick;
    if (m.state.bossesKilled > killed) {
      killed = m.state.bossesKilled;
      if (bossAt >= 0) bossSeconds.push(Math.round((w.tick - bossAt) / 2) / 10);
      bossAt = -1;
    }
    if (m.state.bossId === '' && !m.state.bossStage) bossAt = -1;
  }
  void isMob;
  return { stage: m.state.stage, bossSeconds, summons, goldEarned: m.state.goldEarned, goldEnd: m.state.gold, upgrades: m.state.upgradesBought, workers: m.state.workers, hash: w.hash() };
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s[Math.floor((s.length - 1) / 2)] as number) : 0;
};
const mean = (xs: number[]): number => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);

describe('V3 P2 유물 봇 비교', () => {
  it('1시드: 유물 없음 = 유물 입력 없는 판 (해시 같음), 전투형 도달 웨이브 ≥ 유물 없음', () => {
    const a = run(7001, null);
    const b = run(7001, {});
    expect(b.hash).toBe(a.hash);
    expect(b.stage).toBe(a.stage);
    const c = run(7001, LOADOUTS.combat!);
    expect(c.stage).toBeGreaterThanOrEqual(a.stage);
  });

  it.runIf(process.env.V3_BOTS === '1')('전체 표: 10시드 × 5묶음', () => {
    const seeds = Array.from({ length: 10 }, (_, i) => 7001 + i);
    const rows: string[] = [];
    const summary: Record<string, { stage: number; boss10: number; goldEarned: number }> = {};
    for (const [k, relics] of Object.entries(LOADOUTS)) {
      const rs = seeds.map((s) => run(s, relics));
      const b = (i: number) => rs.map((r) => r.bossSeconds[i]).filter((x): x is number => x !== undefined);
      summary[k] = { stage: median(rs.map((r) => r.stage)), boss10: mean(b(0)), goldEarned: median(rs.map((r) => r.goldEarned)) };
      rows.push(`| ${NAMES[k]} | ${median(rs.map((r) => r.stage))} (${Math.min(...rs.map((r) => r.stage))}~${Math.max(...rs.map((r) => r.stage))}) | ${mean(b(0))} (${b(0).length}/10) | ${mean(b(1))} (${b(1).length}/10) | ${mean(b(2))} (${b(2).length}/10) | ${median(rs.map((r) => r.summons))} | ${median(rs.map((r) => r.goldEarned)).toLocaleString('en-US')} | ${median(rs.map((r) => r.goldEnd)).toLocaleString('en-US')} | ${median(rs.map((r) => r.upgrades))} |`);
    }
    const md = `# V3 P2 유물 봇 비교 (자동 생성)

> \`V3_BOTS=1 V3_BOTS_WRITE=1 npx vitest run tests/integration/v3-relic-bots.test.ts\`. 첫 보스 봇 B 운영(소환·승급·일반 강화·미션·일꾼 3명)을 그대로,
> 무한 모드 시드 7001~7010, 패배하거나 ${MAX_STAGE}웨이브를 넘을 때까지. 유물마다 운영을 바꾸지 않는다 — 같은 행동에서 유물이 주는 차이를 잰 것이고 사람의 최적 운영 측정이 아니다.
> 영웅 레벨은 모두 Lv1(마일스톤 없음).

| 묶음 | 도달 웨이브 가운데 (최소~최대) | 10웨이브 보스 처치 초 (처치 판) | 20웨이브 | 30웨이브 | 소환 수 | 번 돈 | 끝 보유금 | 강화 수 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
${rows.join('\n')}

판정 기준(P0 사양 6장): 경제형이 전투형을 **도달 웨이브·보스 처치 시간 모두에서 일관되게** 압도하면 신규 유물 후보값만 조정한다.
`;
    console.info(md);
    if (process.env.V3_BOTS_WRITE === '1') writeFileSync('docs/v3/relic-bots.md', md);
    expect(summary.combat!.stage).toBeGreaterThanOrEqual(summary.none!.stage);
  }, 600_000);
});
