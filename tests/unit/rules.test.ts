/**
 * 판 규칙 수치 변환 (JSON 소수 → sim 정수) 과 데이터 조합 검사.
 */
import { describe, expect, it } from 'vitest';
import { buildMatchRules, buildMobStats, isBossStage, secondsToTicksExact, themeMods } from '../../src/sim/rules';
import type { GameData } from '../../src/data/load';
import { data } from '../helpers/match';

describe('JSON → 정수 규칙', () => {
  const rules = buildMatchRules(data);

  it('시간: 준비 60초 = 1200틱, 단계 60초 = 1200틱, 등장 간격 2.5초 = 50틱, 시작 자금 1000원', () => {
    expect([rules.prepTicks, rules.stageTicks, rules.spawnIntervalTicks, rules.slotsPerStage, rules.startGold, rules.bossEvery]).toEqual([1200, 1200, 50, 20, 1000, 10]);
  });

  it('몹 스탯: 배율·저항은 bp, 속도는 단위/초 (모든 값 정수)', () => {
    expect(buildMobStats(data.enemies.mobs.find((m) => m.id === 'goblin')!)).toMatchObject({ hpMulBp: 3500, speed: 2600, rewardMulBp: 4000, swarm: 3, invisible: false });
    expect(rules.mobs.get('golem')).toMatchObject({ hpMulBp: 20000, armor: 60, speed: 1200, ccResistBp: 2000, lifeDamage: 2 });
    for (const m of rules.mobs.values()) {
      for (const v of [m.hpMulBp, m.armor, m.magicRes, m.speed, m.ccResistBp, m.lifeDamage, m.rewardMulBp, m.swarm]) expect(Number.isSafeInteger(v)).toBe(true);
    }
  });

  it('등장 순서 규칙은 0부터 센 칸 번호 (8~12번째 → 7~11, 15~20번째 → 14~19)', () => {
    expect(rules.spawnOrder).toMatchObject({ middleFrom: 7, middleTo: 11, backFrom: 14, backTo: 19 });
    expect([...rules.spawnOrder.middleMobs]).toEqual(['healer']);
  });

  it('테마 보정: 테마 1 ×1 +0, 테마 10 ×15 +72 (BALANCE.md 5.4)', () => {
    expect(themeMods(data.campaign.themes[0]!)).toMatchObject({ theme: 1, hpMulBp: 10000, armorOffset: 0 });
    expect(themeMods(data.campaign.themes[9]!)).toMatchObject({ theme: 10, hpMulBp: 150000, armorOffset: 72 });
  });

  it('보스 단계 = 10의 배수 (0단계 제외)', () => {
    expect([0, 1, 9, 10, 11, 20, 50, 100].map((s) => isBossStage(rules, s))).toEqual([false, false, false, true, false, true, true, true]);
  });

  it('같은 데이터 객체면 규칙을 다시 만들지 않는다 (캐시)', () => {
    expect(buildMatchRules(data)).toBe(rules);
  });

  it('1틱 단위가 아닌 초는 에러', () => {
    expect(secondsToTicksExact(2.5)).toBe(50);
    expect(secondsToTicksExact(0.05)).toBe(1);
    expect(() => secondsToTicksExact(0.07)).toThrow(/1틱/);
  });

  it('한 단계 등장이 단계 길이 안에 끝나지 않는 설정은 거절 (20칸 × 3.2초 > 60초)', () => {
    const bad = { ...data, game: { ...data.game, match: { ...data.game.match, spawnIntervalSeconds: 3.2 } } } as GameData;
    expect(() => buildMatchRules(bad)).toThrow(/단계 길이 60초 안에 끝나지 않는다/);
    const ok = { ...data, game: { ...data.game, match: { ...data.game.match, spawnIntervalSeconds: 3.15 } } } as GameData;
    expect(buildMatchRules(ok).spawnIntervalTicks).toBe(63); // 19 × 63 = 1197 < 1200
  });
});
