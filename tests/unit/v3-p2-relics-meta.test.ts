/**
 * V3 P2 유물 계정 규칙 + 정산 보급(단일 장부).
 * 기존 저장 보존 · 첫 유물 선택권 1회 · 발견 천장(미보유 → 최저 레벨, 만렙 제외) · 강화(조각+골드) · 목표·보관 · 5:1 교환 ·
 * 정산 경계(완료 9/10/27/80, 잔여 7+13) · 같은 runId 두 번 · 날짜 무관 · 치트 판 제외 · 버린 판 정산 같은 장부 ·
 * 실제 정산 코드로 주력 유물 Lv10까지 판 수 재측정(P2 단독: 도장·패스·성장 선택 없음).
 */
import { describe, expect, it } from 'vitest';
import { loadGameData } from '../../src/data/load';
import { loadProgression } from '../../src/meta/progressionData';
import { newProgress, parseProgress, serializeProgress, settleMatch, type MatchResult, type ProgressState } from '../../src/meta/progress';
import { ProgressStore, PROGRESS_KEY } from '../../src/meta/progressStore';
import { MemoryStorage } from '../../src/save/storage';
import { Rng } from '../../src/sim/Rng';
import {
  checkExchange,
  discoverRelics,
  exchangeRelicFragments,
  firstRelicAvailable,
  matchRelics,
  pickFirstRelic,
  pityCandidates,
  pityRemaining,
  relicUpgradeCost,
  setRelicTarget,
} from '../../src/meta/v3/relics';
import { settleAbandonedRun } from '../../src/save/settleAbandoned';

const data = loadGameData();
const pd = loadProgression(data);
const pool = pd.v3.relics.pool;
const fresh = (): ProgressState => newProgress(pd, data, 4242);
const result = (o: Partial<MatchResult> = {}): MatchResult => ({ runId: 'r1', seed: 9, mode: 'infinite', stage: 11, bossKills: 1, summons: 40, merges: 8, ...o });

describe('저장 호환 (형식 v2 유지)', () => {
  it('v3가 없는 예전 저장: 잔고·카드·레벨·기록 그대로, v3는 기본값 (열쇠 0·유물 미보유·첫 유물 선택권 있음)', () => {
    const old = fresh() as Partial<ProgressState>;
    delete old.v3;
    Object.assign(old, { gold: 12345, gems: 678, flame: 901, level: 17, bestWave: 44, rewardedRuns: ['a', 'b'] });
    old.heroes!.archer = { level: 9, cards: 33 };
    const raw = JSON.stringify(old);
    const s = parseProgress(raw, pd, data, 1);
    expect([s.gold, s.gems, s.flame, s.level, s.bestWave, s.rewardedRuns]).toEqual([12345, 678, 901, 17, 44, ['a', 'b']]);
    expect(s.heroes.archer).toEqual({ level: 9, cards: 33 });
    expect(s.v3.keys).toBe(0);
    expect(Object.keys(s.v3.relics)).toEqual(pool);
    expect(firstRelicAvailable(s.v3, pd)).toBe(true);
    expect(s.v).toBe(2);
    // 읽고 쓴 뒤 다시 읽어도 같은 값
    expect(parseProgress(serializeProgress(s), pd, data, 1)).toEqual(s);
  });
  it('틀린 v3 필드는 그 필드만 기본값, 모르는 하위 필드·풀 밖 유물은 들고 다닌다', () => {
    const s = fresh();
    const raw = JSON.parse(serializeProgress(s));
    raw.v3 = { keys: -3, target: 'relic-unknown', relics: { 'relic-whetstone': { level: 99, fragments: 4 }, 'relic-future': { level: 2, fragments: 1 } }, futureBox: 7 };
    const p = parseProgress(JSON.stringify(raw), pd, data, 1);
    expect(p.v3.keys).toBe(0);
    expect(p.v3.target).toBe('');
    expect(p.v3.relics['relic-whetstone']).toEqual({ level: 10, fragments: 4 });
    expect(p.v3.relics['relic-future']).toEqual({ level: 2, fragments: 1 });
    expect((p.v3 as unknown as { futureBox: number }).futureBox).toBe(7);
  });
});

describe('첫 유물 선택권 · 목표', () => {
  it('한 번만 (기존 계정 포함), 고른 유물 해금 + 목표 지정, 판 입력에 들어감', () => {
    const s = fresh();
    expect(pickFirstRelic(s.v3, pd, 'relic-frost-crystal')).toBe(true);
    expect(s.v3.relics['relic-frost-crystal']).toEqual({ level: 1, fragments: 0 });
    expect(s.v3.target).toBe('relic-frost-crystal');
    expect(s.v3.granted).toEqual(['first-relic']);
    expect(pickFirstRelic(s.v3, pd, 'relic-whetstone')).toBe(false);
    expect(matchRelics(s.v3, data)).toEqual({ 'relic-frost-crystal': 1 });
  });
  it('목표가 없을 때 받은 목표 조각은 보관했다가 목표를 정하면 옮긴다 (첫 조각 = 자동 해금)', () => {
    const s = fresh();
    settleMatch(s, pd, data, result({ stage: 31 }), '2026-01-01');
    expect(s.v3.targetBank).toBe(3);
    setRelicTarget(s.v3, pd, 'relic-pinwheel');
    expect(s.v3.targetBank).toBe(0);
    expect(s.v3.relics['relic-pinwheel']).toEqual({ level: 1, fragments: 2 });
  });
});

describe('발견 · 천장', () => {
  it('열쇠가 모자라면 거절하고 아무것도 바뀌지 않음', () => {
    const s = fresh();
    expect(discoverRelics(s.v3, pd, data, new Rng(1), 1)).toBe('keys');
    expect(s.v3.pulls).toBe(0);
  });
  it('10번째 발견은 미보유 보장 (9번까지 운이 나빠도), 카운터는 계정에 남는다', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = fresh();
      s.v3.keys = 10;
      const got = discoverRelics(s.v3, pd, data, new Rng(seed), 9) as { id: string }[];
      const ownedBefore = new Set(got.map((g) => g.id));
      expect(pityRemaining(s.v3, pd)).toBe(1);
      const tenth = (discoverRelics(s.v3, pd, data, new Rng(seed + 100), 1) as { id: string; pity: boolean }[])[0]!;
      expect(tenth.pity).toBe(true);
      expect(ownedBefore.has(tenth.id), `seed ${seed}`).toBe(false);
      expect(pityRemaining(s.v3, pd)).toBe(10);
    }
  });
  it('모두 보유면 만렙이 아닌 최저 레벨 중에서, 모두 만렙이면 보장 없음 (조각은 교환 재료로 받음)', () => {
    const s = fresh();
    for (const id of pool) s.v3.relics[id] = { level: 3, fragments: 0 };
    s.v3.relics['relic-pinwheel'] = { level: 2, fragments: 0 };
    s.v3.relics['relic-sturdy-fence'] = { level: 1, fragments: 0 };
    s.v3.relics['relic-work-gloves'] = { level: 5, fragments: 0 }; // 만렙(5)
    expect(pityCandidates(s.v3, pd, data, 10)).toEqual(['relic-sturdy-fence']);
    s.v3.relics['relic-sturdy-fence'] = { level: 5, fragments: 0 }; // 만렙(5)
    expect(pityCandidates(s.v3, pd, data, 10)).toEqual(['relic-pinwheel']);
    for (const id of pool) s.v3.relics[id] = { level: data.game.relics.find((r) => r.id === id)!.maxLevel, fragments: 0 };
    expect(pityCandidates(s.v3, pd, data, 10)).toBeNull();
    expect(pityCandidates(s.v3, pd, data, 9)).toBeNull();
  });
  it('같은 저장 + 같은 시드 = 같은 결과, 분포는 12종에 고르게 (경계·천장 검사와 별개로 본 통계)', () => {
    const run = () => {
      const s = fresh();
      s.v3.keys = 1200;
      return discoverRelics(s.v3, pd, data, new Rng(77), 1200) as { id: string }[];
    };
    expect(run()).toEqual(run());
    const counts = new Map<string, number>();
    for (const g of run()) counts.set(g.id, (counts.get(g.id) ?? 0) + 1);
    expect([...counts.keys()].sort()).toEqual([...pool].sort());
    for (const n of counts.values()) expect(n).toBeGreaterThan(60); // 기대 100
  });
});

describe('강화 · 교환', () => {
  it('비용 = 조각 1/2/3/4/6/8/10/13/16 + 골드, Lv5 한도 유물은 앞 4칸만, 만렙은 null', () => {
    expect(relicUpgradeCost(pd, 1, 10)).toEqual({ fragments: 1, gold: 200 });
    expect(relicUpgradeCost(pd, 9, 10)).toEqual({ fragments: 16, gold: 2000 });
    expect(relicUpgradeCost(pd, 4, 5)).toEqual({ fragments: 4, gold: 600 });
    expect(relicUpgradeCost(pd, 5, 5)).toBeNull();
    expect(relicUpgradeCost(pd, 10, 10)).toBeNull();
  });
  it('조각·골드 부족·미보유·만렙 이유, 성공하면 조각을 쓰고 골드는 저장소가 뺀다', () => {
    const st = new ProgressStore(new MemoryStorage(), pd, data, { seed: 1 });
    expect(st.upgradeRelic('relic-whetstone')).toBe('notOwned');
    st.pickFirstRelic('relic-whetstone');
    expect(st.upgradeRelic('relic-whetstone')).toBe('fragments');
    st.state.v3.relics['relic-whetstone']!.fragments = 1;
    st.state.gold = 199;
    expect(st.upgradeRelic('relic-whetstone')).toBe('gold');
    st.state.gold = 1000;
    expect(st.upgradeRelic('relic-whetstone')).toEqual({ level: 2, gold: 200 });
    expect(st.state.gold).toBe(800);
    expect(st.state.v3.relics['relic-whetstone']).toEqual({ level: 2, fragments: 0 });
    st.state.v3.relics['relic-whetstone'] = { level: 10, fragments: 50 };
    expect(st.upgradeRelic('relic-whetstone')).toBe('max');
    expect(st.matchOptions(false).relics).toEqual([{ 'relic-whetstone': 10 }]);
  });
  it('5:1 교환: 목표 필요, 고른 조각만, 목표 조각은 못 냄, 5의 배수, 섞어 내기 가능', () => {
    const s = fresh();
    s.v3.relics['relic-pinwheel'] = { level: 1, fragments: 3 };
    s.v3.relics['relic-acorn-bank'] = { level: 1, fragments: 4 };
    expect(checkExchange(s.v3, pd, { 'relic-pinwheel': 3, 'relic-acorn-bank': 2 })).toBe('noTarget');
    setRelicTarget(s.v3, pd, 'relic-whetstone');
    expect(checkExchange(s.v3, pd, { 'relic-pinwheel': 3 })).toBe('notMultiple');
    expect(checkExchange(s.v3, pd, { 'relic-pinwheel': 4, 'relic-acorn-bank': 1 })).toBe('notEnough');
    expect(checkExchange(s.v3, pd, { 'relic-whetstone': 5 })).toBe('target');
    expect(checkExchange(s.v3, pd, {})).toBe('empty');
    expect(exchangeRelicFragments(s.v3, pd, { 'relic-pinwheel': 3, 'relic-acorn-bank': 2 })).toBe(1);
    expect(s.v3.relics['relic-pinwheel']!.fragments).toBe(0);
    expect(s.v3.relics['relic-acorn-bank']!.fragments).toBe(2); // 고르지 않은 조각은 그대로
    expect(s.v3.relics['relic-whetstone']).toEqual({ level: 1, fragments: 0 }); // 첫 조각 = 해금
  });
});

describe('정산 보급 (같은 runId 장부, 날짜 무관)', () => {
  const settle = (s: ProgressState, o: Partial<MatchResult>, today = '2026-01-01') => settleMatch(s, pd, data, result(o), today);
  it('완료 9 → 기존 정산만, 보급 없음', () => {
    const s = fresh();
    const r = settle(s, { stage: 10 })!;
    expect(r.grant.gold).toBeGreaterThan(0);
    expect(r.explore).toMatchObject({ effective: false, completed: 9, supplies: 0, keys: 0, targetFragments: 0 });
    expect(s.v3.keys).toBe(0);
  });
  it('완료 10 → 열쇠 1·목표 조각 1, 완료 27 → 2 + 잔여 7, 이어서 13 → 2 + 잔여 0, 80 → 8', () => {
    const s = fresh();
    pickFirstRelic(s.v3, pd, 'relic-whetstone');
    expect(settle(s, { runId: 'a', stage: 11 })!.explore).toMatchObject({ supplies: 1, keys: 1, targetFragments: 1, target: 'relic-whetstone' });
    expect(settle(s, { runId: 'b', stage: 28 })!.explore).toMatchObject({ supplies: 2, supplyRest: 7, keys: 2 });
    expect(settle(s, { runId: 'c', stage: 14 })!.explore).toMatchObject({ supplies: 2, supplyRest: 0 });
    expect(settle(s, { runId: 'd', stage: 81 })!.explore).toMatchObject({ supplies: 8, keys: 8, targetFragments: 8 });
    expect(s.v3.keys).toBe(13);
    expect(s.v3.relics['relic-whetstone']!.fragments).toBe(13);
  });
  it('같은 runId를 두 번 정산하면 두 번째는 null — 열쇠·조각·보급 나머지도 그대로', () => {
    const s = fresh();
    settle(s, { runId: 'same', stage: 28 });
    const snap = JSON.stringify(s.v3);
    expect(settle(s, { runId: 'same', stage: 28 })).toBeNull();
    expect(JSON.stringify(s.v3)).toBe(snap);
  });
  it('업데이트로 버린 판 정산(settleAbandonedRun)도 같은 장부: 먼저 정산된 runId면 다시 주지 않음', () => {
    const st = new ProgressStore(new MemoryStorage(), pd, data, { seed: 1 });
    const run = { runId: 'ab', seed: 3, mode: 'infinite' as const, stage: 25, bossesKilled: 2, summons: 10, merges: 2, dev: false };
    expect(settleAbandonedRun(run as never, { progress: st })).toBe(true);
    expect(st.state.v3.keys).toBe(2); // 완료 24 → 보급 2
    expect(settleAbandonedRun(run as never, { progress: st })).toBe(false);
    expect(st.state.v3.keys).toBe(2);
  });
  it('날짜를 과거·미래로 바꿔도 V3 결과는 같다 (일일 기록만 날짜를 쓴다)', () => {
    const a = fresh();
    const b = fresh();
    for (const [i, day] of ['2026-01-01', '1999-12-31', '2099-06-30', '2026-01-01'].entries()) {
      settle(a, { runId: `x${i}`, stage: 17 + i * 6 }, '2026-01-01');
      settle(b, { runId: `x${i}`, stage: 17 + i * 6 }, day);
    }
    expect(b.v3).toEqual(a.v3);
  });
  it('치트 판(dev)은 유효 전투가 아니다', () => {
    const s = fresh();
    expect(settle(s, { stage: 81, dev: true })!.explore.supplies).toBe(0);
    expect(s.v3.explore.battles).toBe(0);
  });
  it('저장소: 정산 → 기기에 v3 저장, 다시 열어도 같은 열쇠', () => {
    const mem = new MemoryStorage();
    const st = new ProgressStore(mem, pd, data, { seed: 1 });
    st.settle(result({ runId: 'k', stage: 31 }));
    expect(JSON.parse(mem.getItem(PROGRESS_KEY)!).v3.keys).toBe(3);
    expect(new ProgressStore(mem, pd, data, { seed: 2 }).state.v3.keys).toBe(3);
  });
});

describe('실제 정산 코드 재측정: 주력 유물 Lv1 → Lv10 (P2 단독 — 도장·패스·성장 선택 없음)', () => {
  it('표준 10웨이브 판 반복, 열쇠는 바로 발견, 교환 없음 → p50이 50~70판 (골드는 판 골드로 충분)', () => {
    const battles: number[] = [];
    let goldShort = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const st = new ProgressStore(new MemoryStorage(), pd, data, { seed: seed * 101 });
      st.state.gold = 0; // 시작 골드 없이 판 골드만으로
      st.pickFirstRelic('relic-whetstone');
      let n = 0;
      while (st.state.v3.relics['relic-whetstone']!.level < 10 && n < 200) {
        n += 1;
        st.settle(result({ runId: `s${seed}-${n}`, seed: seed * 1000 + n, stage: 11 }));
        if (st.state.v3.keys > 0) st.discoverRelics(st.state.v3.keys);
        for (;;) {
          const r = st.upgradeRelic('relic-whetstone');
          if (r === 'gold') goldShort += 1;
          if (typeof r === 'string') break;
        }
      }
      battles.push(n);
    }
    battles.sort((a, b) => a - b);
    const p50 = battles[Math.floor(battles.length / 2)]!;
    expect(p50).toBeGreaterThanOrEqual(50);
    expect(p50).toBeLessThanOrEqual(70);
    expect(goldShort).toBe(0);
    // 기록용 (PROGRESS): 최소·가운데·최대
    console.info(`[V3-P2 실측] 주력 유물 Lv10 판 수 min ${battles[0]} · p50 ${p50} · max ${battles[battles.length - 1]}`);
  });
});
