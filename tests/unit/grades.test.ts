/**
 * V2.0 PR-A '등급 이름·순서 통일': 등급 순서·이름의 정답은 src/data/grades.ts 한 곳.
 * 순서 = 노말 < 레어 < 유니크 < 히어로 < 레전드 < 신 < 리미티드(내부 id `hidden`, 예전 화면 이름 '신화').
 * 예전에는 4곳이 서로 달랐다 (등급 설명·baseDps: 신화 < 신 / 로비 정렬·그림 크기: 신 < 신화 / 소환 도박 순위: 신화 = 레전드).
 */
import { describe, expect, it } from 'vitest';
import { GRADES, GRADE_NAMES, GRADE_RANK, compareGrades, gradeName, type Grade } from '../../src/data/grades';
import { loadGameData, type TowerData } from '../../src/data/load';
import { GACHA_RANK, gradeRank } from '../../src/sim/rules';
import { gradeGuideModel } from '../../src/ui/screens/gradeGuideModel';
import { heroGrid } from '../../src/ui/lobby/lobbyModel';
import { loadProgression } from '../../src/meta/progressionData';
import { newProgress } from '../../src/meta/progress';
import { allLooks, type HumanLook } from '../../src/art/characters/looks';

const data = loadGameData();

/** tools/gen_tables.py power()와 같은 전투력 지수 (BALANCE.md 2.1). */
function power(t: TowerData): number {
  const v = t.shapeValue;
  const shape =
    t.shape === 'aoe' || t.shape === 'melee_aoe'
      ? Math.min(4, 1 + 1.5 * v)
      : t.shape === 'pierce'
        ? 1 + (v - 1) * 0.5
        : t.shape === 'multi'
          ? 1 + (v - 1) * 0.6
          : t.shape === 'chain'
            ? 1 + 0.7 * Array.from({ length: Math.max(0, Math.floor(v) - 1) }, (_, k) => 0.8 ** (k + 1)).reduce((a, b) => a + b, 0)
            : t.shape === 'global'
              ? 5
              : 1;
  const d = t.dot;
  const dot = !d ? 1 : d.stacks > 1 ? 1 + (d.perSec * Math.min(d.stacks, Math.max(1, t.aps * d.dur))) / t.aps : 1 + d.perSec * d.dur * 0.6;
  const crit = 1 + t.crit * (t.critMul - 1);
  return (t.atk + t.matk + (t.tatk ?? 0)) * t.aps * crit * dot * shape;
}

describe('V2.0 PR-A 등급 순서·이름 (src/data/grades.ts)', () => {
  it('7등급, 낮음 → 높음 = 노말 … 신 < 리미티드, 화면 이름 리미티드', () => {
    expect([...GRADES]).toEqual(['normal', 'rare', 'unique', 'hero', 'legend', 'god', 'hidden']);
    expect(GRADES.map((g) => GRADE_NAMES[g])).toEqual(['노말', '레어', '유니크', '히어로', '레전드', '신', '리미티드']);
    expect(GRADES.map((g) => GRADE_RANK[g])).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(gradeName('hidden')).toBe('리미티드');
    expect(gradeName('nope')).toBe('');
    expect(compareGrades('god', 'hidden')).toBeLessThan(0);
  });

  it('sim 등급 번호도 같은 순서 (리미티드 7 > 신 6, 꽝 0) — 소환 도박 순위와 일치', () => {
    for (const g of GRADES) expect(gradeRank(g)).toBe(GRADE_RANK[g]);
    expect(gradeRank('none')).toBe(0);
    for (const [g, r] of Object.entries(GACHA_RANK)) if (g !== 'none') expect(r).toBe(GRADE_RANK[g as Grade]);
  });

  it('등급 기준 DPS(baseDps)가 등급 순서대로 오른다 — 리미티드가 가장 높다', () => {
    const b = data.towers.baseDps;
    for (let i = 1; i < GRADES.length; i++) expect(b[GRADES[i]!]).toBeGreaterThan(b[GRADES[i - 1]!]);
  });

  it('리미티드 타워는 가장 약한 것도 가장 강한 신 타워보다 전투력 지수가 높다', () => {
    const of = (g: Grade): number[] => data.towers.towers.filter((t) => t.grade === g).map(power);
    const gods = of('god');
    const limited = of('hidden');
    expect(gods.length).toBe(3);
    expect(limited.length).toBe(12);
    expect(Math.min(...limited)).toBeGreaterThan(Math.max(...gods));
    // 레전드 < 신도 그대로 (가장 강한 레전드 < 가장 약한 신)
    expect(Math.max(...of('legend'))).toBeLessThan(Math.min(...gods));
  });

  it('등급 설명 창 = 같은 순서, 로비 [등급 순] 정렬 = 높은 등급(리미티드) 먼저', () => {
    const m = gradeGuideModel({ baseDps: data.towers.baseDps, mergeCount: 3, godChanceBp: 1 });
    expect(m.rows.map((r) => r.grade)).toEqual([...GRADES]);
    const pd = loadProgression(data);
    const state = newProgress(pd, data, 1);
    for (const t of data.towers.towers) state.heroes[t.id] = { level: 1, cards: 0 };
    const mythic = heroGrid(state, pd, data, 'mythic', 'grade');
    const grades = mythic.owned.map((c) => c.grade);
    expect(grades.indexOf('god')).toBeGreaterThan(grades.lastIndexOf('hidden'));
  });

  it('전투 그림 크기(characterLooks scale)의 등급 평균이 등급 순서대로 커진다', () => {
    const looks = allLooks().filter((l): l is HumanLook => l.kind === 'tower');
    const avg = (g: Grade): number => {
      const xs = looks.filter((l) => l.grade === g).map((l) => l.scale ?? 1);
      return xs.reduce((a: number, b: number) => a + b, 0) / xs.length;
    };
    for (let i = 1; i < GRADES.length; i++) expect(avg(GRADES[i]!)).toBeGreaterThan(avg(GRADES[i - 1]!));
  });
});
