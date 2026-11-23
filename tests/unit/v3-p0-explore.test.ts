/**
 * V3 P0 진행도 규칙: 완료 웨이브·유효 전투·보급 나머지·성장 선택·도장 회차·패스 칸, progression.json v3 스키마.
 * 경계: 완료 9/10/27/80, 잔여 7+13, 도장 27→28(→29 = 다음 회차), 패스 49→50, 날짜 무관.
 */
import { describe, expect, it } from 'vitest';
import { loadGameData } from '../../src/data/load';
import { loadProgression, parseProgression } from '../../src/meta/progressionData';
import {
  addExplore,
  completedWaves,
  isEffectiveBattle,
  newExploreState,
  parseExploreState,
  passCells,
  passComplete,
  stampRewardIndex,
  stampView,
  supplyFromWaves,
} from '../../src/meta/v3/explore';
import progressionJson from '../../src/data/progression.json';

const data = loadGameData();
const pd = loadProgression(data);
const v3 = pd.v3;

describe('progression.json v3 데이터', () => {
  it('검사를 통과하고 신규 재화 키는 keys 하나', () => {
    expect(v3.relics.pool).toHaveLength(12);
    expect(v3.relics.pool).toContain('relic-whetstone');
    expect(v3.relics.pool).not.toContain('relic-smith-whetstone');
    expect(v3.relics.fragmentCost.reduce((a, b) => a + b, 0)).toBe(63);
    expect(v3.stamp.rewards).toHaveLength(28);
    expect(v3.pass.free).toHaveLength(50);
    expect(v3.pass.golden).toHaveLength(50);
    const keys = new Set<string>();
    const walk = (o: unknown): void => {
      if (!o || typeof o !== 'object') return;
      for (const [k, v] of Object.entries(o)) {
        if (['gold', 'gems', 'flame', 'cards', 'fragments', 'keys'].includes(k) && typeof v === 'number') keys.add(k);
        walk(v);
      }
    };
    walk([v3.stamp, v3.pass, v3.packages, v3.secretCodes]);
    expect([...keys].filter((k) => !['gold', 'gems', 'flame', 'cards', 'fragments'].includes(k))).toEqual(['keys']);
  });

  it('도장 보상 수 ≠ 칸 수, 비용 표 길이 다름, 빈 보상은 경로가 든 오류', () => {
    const bad = structuredClone(progressionJson) as typeof progressionJson;
    bad.v3.stamp.rewards.pop();
    expect(() => parseProgression(bad, data)).toThrow(/v3\.stamp\.rewards/);
    const bad2 = structuredClone(progressionJson) as typeof progressionJson;
    bad2.v3.relics.goldCost.pop();
    expect(() => parseProgression(bad2, data)).toThrow(/v3\.relics\.goldCost/);
    const bad3 = structuredClone(progressionJson) as { v3: { packages: { reward: Record<string, number> }[] } };
    (bad3.v3.packages[0] as { reward: Record<string, number> }).reward = {};
    expect(() => parseProgression(bad3, data)).toThrow(/보상이 비어 있다/);
  });
});

describe('완료 웨이브 · 유효 전투', () => {
  it('도달 단계 − 1 (진 웨이브는 끝나지 않음), 캠페인 승리는 도달 단계', () => {
    expect(completedWaves({ stage: 10 })).toBe(9);
    expect(completedWaves({ stage: 11 })).toBe(10);
    expect(completedWaves({ stage: 0 })).toBe(0);
    expect(completedWaves({ stage: 1 })).toBe(0);
    expect(completedWaves({ stage: 50, victory: true })).toBe(50);
    expect(completedWaves({ stage: 50, completedWaves: 12 })).toBe(12);
  });
  it('9완료는 유효 아님, 10완료부터 유효, 치트 판은 아님', () => {
    expect(isEffectiveBattle({ stage: 10 }, v3)).toBe(false);
    expect(isEffectiveBattle({ stage: 11 }, v3)).toBe(true);
    expect(isEffectiveBattle({ stage: 81, dev: true }, v3)).toBe(false);
  });
});

describe('보급 · 성장 선택', () => {
  it('완료 9 → 아무것도 없음 (나머지에도 안 더함)', () => {
    const st = newExploreState();
    const g = addExplore(st, { stage: 10 }, v3);
    expect(g).toMatchObject({ effective: false, completed: 9, supplies: 0 });
    expect(st).toEqual(newExploreState());
  });
  it('완료 10 → 보급 1 · 나머지 0', () => {
    const st = newExploreState();
    expect(addExplore(st, { stage: 11 }, v3)).toMatchObject({ effective: true, supplies: 1, supplyRest: 0, choices: 0, toNextChoice: 2 });
  });
  it('완료 27 → 보급 2 · 잔여 7, 다음 완료 13 → 7+13 = 20 → 보급 2 · 잔여 0', () => {
    const st = newExploreState();
    expect(addExplore(st, { stage: 28 }, v3)).toMatchObject({ completed: 27, supplies: 2, supplyRest: 7, toNextSupply: 3 });
    expect(addExplore(st, { stage: 14 }, v3)).toMatchObject({ completed: 13, supplies: 2, supplyRest: 0 });
    expect(st).toMatchObject({ battles: 2, waves: 40, supplyTotal: 4, choicesReady: 1, choiceRest: 1 });
  });
  it('완료 80 긴 판 → 보급 8 · 성장 선택 2 (나머지 2)', () => {
    const st = newExploreState();
    expect(addExplore(st, { stage: 81 }, v3)).toMatchObject({ supplies: 8, choices: 2 });
    expect(st.choiceRest).toBe(2);
  });
  it('표준 10웨이브 판 3번 = 성장 선택 1회 (목표 3~5판)', () => {
    const st = newExploreState();
    for (let i = 0; i < 3; i++) addExplore(st, { stage: 11 }, v3);
    expect(st.choicesReady).toBe(1);
  });
  it('supplyFromWaves 순수 산술', () => {
    expect(supplyFromWaves(7, 13, 10)).toEqual({ supplies: 2, rest: 0 });
    expect(supplyFromWaves(9, 0, 10)).toEqual({ supplies: 0, rest: 9 });
  });
  it('저장 값 읽기: 틀린 필드 0, 나머지는 범위로 자름', () => {
    expect(parseExploreState({ supplyRest: 99, battles: -1, choicesReady: 3 }, v3)).toMatchObject({ supplyRest: 9, battles: 0, choicesReady: 3 });
    expect(parseExploreState(null, v3)).toEqual(newExploreState());
  });
});

describe('탐험 도장 (유효 전투 1판 = 1칸, 기한 없음)', () => {
  it('27 → 28칸: 회차 1이 다 참, 29칸째는 다음 회차에 쌓이고 1회차 미수령은 남는다', () => {
    expect(stampView({ filled: 27, claimed: 0 }, 28)).toEqual({ round: 1, filled: 27, claimed: 0, ready: 27 });
    expect(stampView({ filled: 28, claimed: 0 }, 28)).toEqual({ round: 1, filled: 28, claimed: 0, ready: 28 });
    expect(stampView({ filled: 29, claimed: 0 }, 28)).toEqual({ round: 1, filled: 28, claimed: 0, ready: 29 });
    expect(stampView({ filled: 29, claimed: 28 }, 28)).toEqual({ round: 2, filled: 1, claimed: 0, ready: 1 });
    expect(stampRewardIndex(28, 28)).toBe(0);
    expect(stampRewardIndex(27, 28)).toBe(27);
  });
});

describe('진행도 패스', () => {
  it('49칸 → 50칸에서 시즌 완료, 넘친 웨이브는 칸이 50을 넘지 않음', () => {
    const w = v3.pass.wavesPerCell;
    expect(passCells({ waves: 49 * w }, v3)).toBe(49);
    expect(passComplete({ waves: 49 * w + w - 1 }, v3)).toBe(false);
    expect(passCells({ waves: 50 * w }, v3)).toBe(50);
    expect(passComplete({ waves: 50 * w }, v3)).toBe(true);
    expect(passCells({ waves: 60 * w }, v3)).toBe(50);
  });
});
