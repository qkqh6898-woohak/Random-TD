/**
 * V3 P3 진행도 보상: 보급 상자 · 탐험 도장(27→28, 회차 넘김) · 패스(49→50, 다음 시즌 = 미수령 먼저, 웨이브 이월, 황금 소급·시즌당 1회) ·
 * 성장 선택(영웅 꾸러미 = 1레벨 확정, 만렙·미보유 불가, 열쇠) · 성장 꾸러미(기존 계정 레벨 인정, 1회) · 첫 영웅 선택권 · 비밀 코드 ·
 * 날짜 무관 · 실제 정산 코드로 무료 트랙 성장 속도 재측정(수급표와 비교).
 */
import { describe, expect, it } from 'vitest';
import { loadGameData } from '../../src/data/load';
import { loadProgression } from '../../src/meta/progressionData';
import { levelUpHero, newProgress, settleMatch, type MatchResult, type ProgressState } from '../../src/meta/progress';
import { ProgressStore } from '../../src/meta/progressStore';
import { MemoryStorage } from '../../src/save/storage';
import { Rng, deriveSeed } from '../../src/sim/Rng';
import {
  buyGolden,
  buyPackage,
  checkHeroChoice,
  claimPass,
  claimStamps,
  codeHash,
  exploreReady,
  firstHeroAvailable,
  heroPackage,
  nextPassSeason,
  openSupplyBoxes,
  passView,
  pickFirstHero,
  redeemCode,
  stampView,
  takeGrowthChoice,
} from '../../src/meta/v3/progression';
import { pickFirstRelic } from '../../src/meta/v3/relics';

const data = loadGameData();
const pd = loadProgression(data);
const v3 = pd.v3;
const fresh = (): ProgressState => newProgress(pd, data, 777);
const result = (o: Partial<MatchResult> = {}): MatchResult => ({ runId: 'r', seed: 3, mode: 'infinite', stage: 11, bossKills: 1, summons: 30, merges: 5, ...o });
let runNo = 0;
const settle = (s: ProgressState, stage: number, today = '2026-03-01') => settleMatch(s, pd, data, result({ runId: `run-${++runNo}`, seed: runNo, stage }), today);
const rng = (s: ProgressState) => (name: string) => new Rng(deriveSeed(s.seed, `${name}:${s.rolls++}`));
const tower = (id: string) => data.towers.towers.find((t) => t.id === id)!;

describe('보급 상자 (정산은 상자만 쌓고, 열 때 지급)', () => {
  it('완료 27 → 상자 2 · 도장 1 · 패스 27웨이브, 9웨이브 판은 아무것도', () => {
    const s = fresh();
    expect(settle(s, 10)!.explore).toMatchObject({ boxes: 0, stamps: 0, passWaves: 0 });
    expect(settle(s, 28)!.explore).toMatchObject({ boxes: 2, stamps: 1, passWaves: 27, supplyRest: 7 });
    expect([s.v3.boxes, s.v3.stamp.filled, s.v3.pass.waves]).toEqual([2, 1, 27]);
    expect(openSupplyBoxes(s, pd, 1)).toMatchObject({ boxes: 1, keys: 1 });
    expect(s.v3.boxes).toBe(1);
  });
});

describe('탐험 도장 (유효 전투 = 1칸, 기한 없음)', () => {
  it('27 → 28칸: 7/14/21/28칸 큰 보상(열쇠) 포함 28칸 순서대로 받기, 29칸째는 2회차 1칸', () => {
    const s = fresh();
    for (let i = 0; i < 27; i++) settle(s, 11);
    expect(stampView(s.v3.stamp, v3.stamp.cells)).toMatchObject({ round: 1, filled: 27, ready: 27 });
    settle(s, 11);
    expect(stampView(s.v3.stamp, v3.stamp.cells)).toMatchObject({ round: 1, filled: 28, ready: 28 });
    settle(s, 11); // 29번째 → 2회차에 쌓임, 1회차 미수령은 그대로
    expect(stampView(s.v3.stamp, v3.stamp.cells)).toMatchObject({ round: 1, filled: 28, claimed: 0, ready: 29 });
    const keys0 = s.v3.keys;
    const got = claimStamps(s, pd, data, rng(s))!;
    expect(got.cells).toEqual(Array.from({ length: 29 }, (_, i) => i + 1));
    expect(s.v3.keys - keys0).toBe(1 + 2 + 1 + 3); // 7·14·21·28칸
    expect(stampView(s.v3.stamp, v3.stamp.cells)).toMatchObject({ round: 2, filled: 1, claimed: 1, ready: 0 });
    expect(claimStamps(s, pd, data, rng(s))).toBeNull();
  });
});

describe('진행도 패스', () => {
  const w = v3.pass.wavesPerCell;
  it('49칸 → 50칸 시즌 완료, 무료 칸 받기, 다음 시즌은 50칸 전엔 못 넘김', () => {
    const s = fresh();
    s.v3.pass.waves = 49 * w;
    expect(passView(s, pd)).toMatchObject({ reached: 49, complete: false, ready: 49, toNext: w });
    expect(nextPassSeason(s, pd, data, rng(s))).toBeNull();
    s.v3.pass.waves = 50 * w + 7;
    expect(passView(s, pd)).toMatchObject({ reached: 50, complete: true, ready: 50, toNext: 0 });
  });
  it('다음 시즌: 미수령을 먼저 모두 받고(없애지 않음) 넘친 웨이브 이월, 지난 시즌 장부 기록', () => {
    const s = fresh();
    s.v3.pass.waves = 50 * w + 7;
    claimPass(s, pd, data, rng(s)); // 일부러 일부만? → 전부 받음
    s.v3.pass.freeClaimed = 30; // 20칸 미수령으로 만든다
    const gems0 = s.gems;
    const r = nextPassSeason(s, pd, data, rng(s))!;
    expect(r.season).toBe(2);
    expect(r.grant).not.toBeNull();
    expect(s.gems).toBeGreaterThan(gems0); // 40·50칸 보석이 미수령분에 있었다
    expect(s.v3.pass).toMatchObject({ season: 2, waves: 7, freeClaimed: 0, golden: false, goldenClaimed: 0, history: [1] });
  });
  it('황금 트랙: 보석 300(후보) 1회, 구매 전 지난 칸 소급, 같은 시즌 두 번 못 삼, 모자라면 이유', () => {
    const s = fresh();
    s.gems = 299;
    s.v3.pass.waves = 12 * w;
    expect(buyGolden(s, pd)).toBe('gems');
    s.gems = 1000;
    claimPass(s, pd, data, rng(s));
    expect(passView(s, pd).ready).toBe(0);
    const before = s.gems;
    expect(buyGolden(s, pd)).toBe('ok');
    expect(s.gems).toBe(before - 300);
    expect(passView(s, pd).ready).toBe(12); // 소급
    const keys0 = s.v3.keys;
    claimPass(s, pd, data, rng(s));
    expect(s.v3.keys - keys0).toBe(1 + 2); // 황금 5칸 열쇠 1 · 10칸 열쇠 2
    expect(buyGolden(s, pd)).toBe('owned');
    expect(s.v3.granted).toContain('pass:1:golden');
  });
  it('황금 트랙 보석 총량 < 가격 (보석 무한 이익 루프 없음), 무료 트랙에도 열쇠·불꽃·카드가 있다 (황금이 유일한 공급처 아님)', () => {
    const gemsBack = v3.pass.golden.reduce((a, r) => a + (r.gems ?? 0), 0);
    expect(gemsBack).toBeLessThan(v3.pass.goldenPriceGems);
    const free = { keys: 0, flame: 0, cards: 0 };
    for (const r of v3.pass.free) {
      free.keys += r.keys ?? 0;
      free.flame += r.flame ?? 0;
      free.cards += r.cards ?? 0;
    }
    expect(free.keys).toBeGreaterThan(0);
    expect(free.flame).toBeGreaterThan(0);
    expect(free.cards).toBeGreaterThan(0);
  });
});

describe('성장 선택', () => {
  it('표준 전투 3판 = 1회. 영웅 꾸러미 = 다음 레벨 비용 카드·불꽃 → 바로 1레벨 오를 수 있다', () => {
    const s = fresh();
    for (let i = 0; i < 3; i++) settle(s, 11);
    expect(s.v3.explore.choicesReady).toBe(1);
    s.heroes.archer = { level: 7, cards: 0 };
    s.flame = 0;
    const pkg = heroPackage(s, pd, tower('archer'))!;
    expect(pkg).toEqual({ cards: 13, flame: 70 }); // Lv7 → 8 비용 (노말 100%)
    takeGrowthChoice(s, pd, data, { hero: 'archer' });
    expect(levelUpHero(s, pd, tower('archer'))).toBe(8);
    expect(s.v3.explore).toMatchObject({ choicesReady: 0, choicesTaken: 1 });
    expect(takeGrowthChoice(s, pd, data, 'relic')).toBe('none');
  });
  it('만렙·미보유 영웅은 고를 수 없고(이유) 선택권은 그대로, 열쇠 선택은 열쇠 2', () => {
    const s = fresh();
    s.v3.explore.choicesReady = 1;
    s.heroes.archer = { level: 15, cards: 0 };
    expect(checkHeroChoice(s, pd, data, 'archer')).toBe('max');
    expect(takeGrowthChoice(s, pd, data, { hero: 'archer' })).toBe('max');
    const unowned = data.towers.towers.find((t) => t.grade === 'legend' && s.heroes[t.id]!.level === 0)!;
    expect(takeGrowthChoice(s, pd, data, { hero: unowned.id })).toBe('notOwned');
    expect(s.v3.explore.choicesReady).toBe(1);
    expect((takeGrowthChoice(s, pd, data, 'relic') as { keys: number }).keys).toBe(2);
  });
});

describe('성장 꾸러미 · 첫 영웅 선택권 · 비밀 코드 (1회 지급 장부)', () => {
  it('계정 Lv10/20/30에 열림 — 이미 Lv25인 기존 계정은 I·II 바로 열림, 한 번만', () => {
    const s = fresh();
    s.level = 25;
    s.gold = 100_000;
    expect(buyPackage(s, pd, data, 'pkg-lv30', rng(s))).toBe('locked');
    const g = buyPackage(s, pd, data, 'pkg-lv10', rng(s));
    expect(typeof g).toBe('object');
    expect(s.gold).toBe(97_000);
    expect(buyPackage(s, pd, data, 'pkg-lv10', rng(s))).toBe('bought');
    expect(typeof buyPackage(s, pd, data, 'pkg-lv20', rng(s))).toBe('object');
  });
  it('첫 영웅 선택권: 히어로 등급 하나 — 미보유 영입 + 5장, (다른 계정) 보유면 10장, 한 번만', () => {
    const s = fresh();
    expect(firstHeroAvailable(s)).toBe(true);
    const hero = data.towers.towers.find((t) => t.grade === 'hero' && s.heroes[t.id]!.level === 0)!;
    expect(pickFirstHero(s, pd, data, hero.id)).toEqual({ id: hero.id, isNew: true, cards: 5 });
    expect(s.heroes[hero.id]).toEqual({ level: 1, cards: 5 });
    expect(pickFirstHero(s, pd, data, hero.id)).toBeNull();
    const t = fresh();
    t.heroes[hero.id] = { level: 4, cards: 2 };
    expect(pickFirstHero(t, pd, data, hero.id)).toEqual({ id: hero.id, isNew: false, cards: 10 });
    expect(t.heroes[hero.id]).toEqual({ level: 4, cards: 12 });
    expect(pickFirstHero(fresh(), pd, data, 'archer')).toBeNull(); // 노말은 후보가 아님
  });
  it('비밀 코드: 대소문자·공백 무관, 코드당 1회, 모르는 코드', () => {
    const s = fresh();
    expect(codeHash('v3 start')).toBe(codeHash('V3START'));
    const g = redeemCode(s, pd, data, ' v3-start ', rng(s));
    expect(typeof g).toBe('object');
    expect((g as { keys: number }).keys).toBe(3);
    expect(redeemCode(s, pd, data, 'V3START', rng(s))).toBe('used');
    expect(redeemCode(s, pd, data, 'NOPE', rng(s))).toBe('invalid');
    expect(s.v3.granted).toContain('code:code-v3-start');
  });
});

describe('날짜 무관 · 빨간 점', () => {
  it('정산 날짜를 과거·미래로 바꿔도 도장·패스·상자·성장 선택이 같다', () => {
    const a = fresh();
    const b = fresh();
    ['2026-01-01', '1990-01-01', '2100-12-31', '2026-01-02'].forEach((day, i) => {
      settleMatch(a, pd, data, result({ runId: `d${i}`, stage: 15 + i * 9 }), '2026-01-01');
      settleMatch(b, pd, data, result({ runId: `d${i}`, stage: 15 + i * 9 }), day);
    });
    expect(b.v3).toEqual(a.v3);
  });
  it('빨간 점 = 실제로 받을 수 있는 것만 (새 계정은 첫 영웅 선택권 1)', () => {
    const s = fresh();
    expect(exploreReady(s, pd)).toBe(1);
    settle(s, 11);
    expect(exploreReady(s, pd)).toBe(1 + 1 + 1); // 상자 1 + 도장 1 + 첫 영웅
  });
});

describe('실제 정산 코드로 무료 트랙 재측정 (도장·패스 무료·성장 선택 포함, 황금·날짜·1회성 제외)', () => {
  const runPolicy = (seed: number, policy: 'hero' | 'relic') => {
    const st = new ProgressStore(new MemoryStorage(), pd, data, { seed: seed * 31 });
    st.state.gold = 0;
    st.pickFirstRelic('relic-whetstone');
    let n = 0;
    let relicDone = 0;
    while (n < 120) {
      n += 1;
      st.settle(result({ runId: `p${seed}-${n}`, seed: seed * 997 + n, stage: 11 }));
      st.openBoxes();
      st.claimStamps();
      st.claimPass();
      if (st.state.v3.pass && passView(st.state, pd).complete) st.nextPassSeason();
      while (st.state.v3.explore.choicesReady > 0) {
        if (policy === 'relic') st.takeGrowthChoice('relic');
        else if (st.takeGrowthChoice({ hero: 'scholar' }) === 'max') st.takeGrowthChoice('relic');
        st.levelUp('scholar');
      }
      while (typeof st.levelUp('scholar') === 'number');
      if (st.state.v3.keys > 0) st.discoverRelics(st.state.v3.keys);
      while (typeof st.upgradeRelic('relic-whetstone') !== 'string');
      if (!relicDone && st.state.v3.relics['relic-whetstone']!.level >= 10) relicDone = n;
      if (relicDone && st.state.heroes.scholar!.level >= 15) break;
    }
    return { relic: relicDone || 999, heroLevelAtRelic: 0, scholar15: st.state.heroes.scholar!.level >= 15 ? n : 999 };
  };
  it('직접 경로(성장 선택 = 영웅): 주력 유물 p50 50~70판 · 히어로 등급 학자 Lv15도 같은 기간 안 / 유물 집중도 ≥ 40판', () => {
    const hero = Array.from({ length: 16 }, (_, i) => runPolicy(i + 1, 'hero'));
    const relic = Array.from({ length: 16 }, (_, i) => runPolicy(i + 1, 'relic'));
    const p50 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
    const hr = p50(hero.map((r) => r.relic));
    const hs = p50(hero.map((r) => r.scholar15));
    const rr = p50(relic.map((r) => r.relic));
    console.info(`[V3-P3 실측] 직접 경로: 주력 유물 Lv10 p50 ${hr}판 · 학자 Lv15 p50 ${hs}판 / 유물 집중: 주력 유물 p50 ${rr}판`);
    expect(hr).toBeGreaterThanOrEqual(50);
    expect(hr).toBeLessThanOrEqual(70);
    expect(rr).toBeGreaterThanOrEqual(40);
    expect(hs).toBeLessThanOrEqual(70);
    // 기존 계정 새 보상이 생기는 빈도: 성장 선택은 표준 전투 3판마다 (3~5판 목표)
    const s = fresh();
    for (let i = 0; i < 9; i++) settle(s, 11);
    expect(s.v3.explore.choicesReady).toBe(3);
  });
  void pickFirstRelic;
});
