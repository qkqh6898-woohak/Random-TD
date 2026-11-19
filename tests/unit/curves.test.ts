/**
 * M1-1 곡선 미리 계산: src/data/curves.json 이 BALANCE.md 3장 표·ENEMIES.md 2장 공식과 일치하는지.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  CURVES_PATH,
  checkGrowth,
  computeAll,
  computeCurves,
  computeTranscendCost,
  decimalFraction,
  formatCurves,
  readGrowth,
  type GrowthSpec,
} from '../../tools/precompute-curves.mjs';
import { loadGameData } from '../../src/data/load';
import { buildMatchRules, killReward, stageArmor, stageHp } from '../../src/sim/rules';

const data = loadGameData();
const curves = data.curves;
const rules = buildMatchRules(data);

/** BALANCE.md 3장 표: | 단계 | 일반 몹 체력 | 슬라임 방어력 (감소율) | 단계 총 체력 (20마리) | … */
function balanceTable(): { stage: number; hp: number; slimeArmor: number; total: number }[] {
  const md = readFileSync(new URL('../../docs/BALANCE.md', import.meta.url), 'utf8');
  const sec = md.slice(md.indexOf('## 3. 체력 곡선'), md.indexOf('## 4.'));
  const rows: { stage: number; hp: number; slimeArmor: number; total: number }[] = [];
  for (const line of sec.split('\n')) {
    const m = /^\|\s*(\d+)\s*\|\s*([\d,]+)\s*\|\s*(\d+)\s*\([^)]*\)\s*\|\s*([\d,]+)\s*\|/.exec(line);
    if (!m) continue;
    const num = (s: string): number => Number(s.replace(/,/g, ''));
    rows.push({ stage: num(m[1]!), hp: num(m[2]!), slimeArmor: num(m[3]!), total: num(m[4]!) });
  }
  return rows;
}

describe('curves.json 표 (BALANCE.md 3장)', () => {
  const table = balanceTable();

  it('BALANCE.md 3장 표를 읽었다 (19줄: 1~200단계)', () => {
    expect(table.length).toBe(19);
    expect(table[0]).toEqual({ stage: 1, hp: 120, slimeArmor: 0, total: 2400 });
    expect(table.at(-1)?.stage).toBe(200);
  });

  it('일반 몹 체력 열이 표와 정확히 같다', () => {
    for (const row of table) expect([row.stage, curves.hp[row.stage]]).toEqual([row.stage, row.hp]);
  });

  it('단계 총 체력(20마리)은 반올림 전 실수 × 20 이라 정수 표 × 20 과 최대 10 차이', () => {
    for (const row of table) expect(Math.abs((curves.hp[row.stage] as number) * 20 - row.total)).toBeLessThanOrEqual(10);
  });

  it('슬라임 방어력 열 = max(0, s − 100) (기본 0이라 추가값만)', () => {
    for (const row of table) expect(stageArmor(rules, 0, row.stage)).toBe(row.slimeArmor);
  });

  it('구간 경계: 21·51·101단계부터 증가율이 1.08·1.06·1.05로 바뀐다', () => {
    const ratio = (s: number): number => (curves.hp[s] as number) / (curves.hp[s - 1] as number);
    expect(ratio(20)).toBeCloseTo(1.151, 2);
    expect(ratio(21)).toBeCloseTo(1.08, 2);
    expect(ratio(50)).toBeCloseTo(1.08, 3);
    expect(ratio(51)).toBeCloseTo(1.06, 3);
    expect(ratio(101)).toBeCloseTo(1.05, 4);
    expect(ratio(500)).toBeCloseTo(1.05, 6);
  });

  it('모든 값이 안전한 정수, 단계가 오를수록 커진다 (0단계 = 0)', () => {
    expect(curves.hp).toHaveLength(501);
    expect(curves.hp[0]).toBe(0);
    for (let s = 1; s <= 500; s++) {
      expect(Number.isSafeInteger(curves.hp[s])).toBe(true);
      if (s > 1) expect(curves.hp[s]).toBeGreaterThan(curves.hp[s - 1] as number);
    }
  });
});

describe('방어력·마법 저항 성장 (ENEMIES.md 2장·3.1)', () => {
  it('계수 표: armorMulBp = 10000 + 200s, armorFlat = max(0, s − 100)', () => {
    for (let s = 0; s <= 500; s++) {
      expect(curves.armorMulBp[s]).toBe(10000 + 200 * s);
      expect(curves.armorFlat[s]).toBe(Math.max(0, s - 100));
    }
  });

  it('암흑 골렘 방어 60: 15→78, 30→96, 50→120, 100→180, 150→290, 200→400 (3.1 표)', () => {
    const golem = 60;
    expect([15, 30, 50, 100, 150, 200].map((s) => stageArmor(rules, golem, s))).toEqual([78, 96, 120, 180, 290, 400]);
  });

  it('수정 거북 마저 60·방패병 50 등 3.1 표의 정수 칸과 같다', () => {
    expect(stageArmor(rules, 60, 15)).toBe(78);
    expect(stageArmor(rules, 50, 150)).toBe(250);
    expect(stageArmor(rules, 80, 200)).toBe(500); // 보석 골렘
    expect(stageArmor(rules, 40, 100)).toBe(120); // 치유사 마저
  });

  it('곱한 뒤 내림: 박쥐 마저 15 × 1.3 = 19.5 → 19 (문서 표는 반올림 표시 20)', () => {
    expect(stageArmor(rules, 15, 15)).toBe(19);
    expect(stageArmor(rules, 5, 15)).toBe(6); // 고블린 5 × 1.3 = 6.5 → 6
  });
});

describe('처치 보상 (3 + ⌊s/4⌋) × 배율 (V2.0 PR-A, 예전 10 + ⌊s/10⌋)', () => {
  it('10단계 슬라임 = 5원, 1단계 = 3원, 45단계 = 14원', () => {
    expect(killReward(rules, 10, 10000)).toBe(5);
    expect(killReward(rules, 1, 10000)).toBe(3);
    expect(killReward(rules, 45, 10000)).toBe(14);
  });

  it('배율은 곱한 뒤 내림: 40단계 고블린 ×0.4 = 13 × 0.4 = 5.2 → 5, 투명 도둑 ×2 = 26', () => {
    expect(killReward(rules, 40, 4000)).toBe(5);
    expect(killReward(rules, 40, 20000)).toBe(26);
  });
});

describe('stageHp 범위', () => {
  it('표 끝(500)을 넘으면 마지막 값, 0 미만은 0단계 값', () => {
    expect(stageHp(rules, 500)).toBe(curves.hp[500]);
    expect(stageHp(rules, 501)).toBe(curves.hp[500]);
    expect(stageHp(rules, 9999)).toBe(curves.hp[500]);
    expect(stageHp(rules, -3)).toBe(0);
  });
});

describe('tools/precompute-curves.mjs', () => {
  it('저장된 curves.json 이 지금 enemies.json growth·game.json 초월 공식으로 다시 만든 결과와 글자까지 같다 (도구를 안 돌리고 수치만 바꾸면 실패)', () => {
    expect(readFileSync(CURVES_PATH, 'utf8')).toBe(formatCurves(computeAll()));
  });

  it('초월 강화 비용 표 (GDD 7.1: 50,000 × 1.15^Lv 내림) — 부동소수 오차 없이 정확한 분수 계산', () => {
    expect(decimalFraction(1.15)).toEqual([115n, 100n]);
    const t = computeTranscendCost({ costBase: 50000, costGrowth: 1.15 });
    expect(t.slice(0, 5)).toEqual([50000, 57500, 66125, 76043, 87450]);
    // 50000 × 1.15^10 = 202,277.88… → 202,277
    expect(t[10]).toBe(202277);
    // 모두 안전한 정수, 단조 증가, 다음 값은 안전한 정수를 넘는다
    t.forEach((v, i) => {
      expect(Number.isSafeInteger(v)).toBe(true);
      if (i > 0) expect(v).toBeGreaterThan(t[i - 1] as number);
    });
    expect((t[t.length - 1] as number) * 1.15).toBeGreaterThan(Number.MAX_SAFE_INTEGER);
    expect(() => computeTranscendCost({ costBase: 0, costGrowth: 1.15 })).toThrow(/costBase/);
    expect(() => computeTranscendCost({ costBase: 10, costGrowth: 1 })).toThrow(/costGrowth/);
  });

  it('--check 는 최신이면 종료 코드 0', () => {
    const out = execFileSync('node', ['tools/precompute-curves.mjs', '--check'], { encoding: 'utf8' });
    expect(out).toContain('곡선 표 최신');
  });

  it('실수 HP 는 문서 공식 그대로 (구간 기준 값을 반올림하지 않고 이어 감)', () => {
    const g = readGrowth();
    const { exactHp } = computeCurves(g);
    expect(exactHp[5]).toBeCloseTo(120 * Math.pow(1.151, 4), 9);
    const hp20 = 120 * Math.pow(1.151, 19);
    expect(exactHp[30]).toBeCloseTo(hp20 * Math.pow(1.08, 10), 6);
    const hp50 = hp20 * Math.pow(1.08, 30);
    expect(exactHp[60]).toBeCloseTo(hp50 * Math.pow(1.06, 10), 5);
  });

  it('잘못된 growth 는 이유와 함께 거절', () => {
    const good = readGrowth();
    expect(checkGrowth(good)).toEqual([]);
    expect(checkGrowth(null)).toEqual(['growth가 없다']);
    const bad: GrowthSpec = structuredClone(good);
    bad.hp.segments[0]!.from = 2;
    expect(checkGrowth(bad).join()).toContain('첫 구간은 1단계부터');
    const bad2: GrowthSpec = structuredClone(good);
    bad2.hp.segments[2]!.from = 10;
    expect(checkGrowth(bad2).join()).toContain('앞 구간보다 커야');
    expect(() => computeCurves({ ...good, maxStage: 0 })).toThrow(/maxStage/);
  });

  it('안전한 정수를 넘는 표는 만들지 않는다 (maxStage를 너무 크게 잡은 경우)', () => {
    expect(() => computeCurves({ ...readGrowth(), maxStage: 900 })).toThrow(/안전한 정수/);
  });
});
