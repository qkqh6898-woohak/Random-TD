/**
 * V3 무료 트랙 수급표 모델 (P0 — docs/v3/supply-table.md를 만든다). 순수 계산 + 고정 시드 몬테카를로.
 *
 * 무엇을 재는가: 표준 전투(10웨이브 완료 = 11웨이브 도달 후 패배, 보스 1처치)를 반복할 때
 *  - 성장 선택이 몇 판마다 생기는가 (목표 3~5판)
 *  - 주력 유물(최대 Lv10)을 몇 번의 유효 전투로 완성하는가 (목표 50~70) — 조각·골드 두 병목을 함께
 *  - 목표 영웅(등급별)을 Lv15까지 올리는 데 몇 판 — 카드·불꽃 병목, 성장 선택 영웅 꾸러미 유무 비교
 *
 * 무료 트랙만 쓴다: 기존 판 보상(matchRewardSpec) + 보급(열쇠·목표 조각) + 탐험 도장 + 패스 무료 칸 + 성장 선택.
 * 날짜 기반 보상(일일 퀘스트)·1회성 보상(웨이브 길·업적·비밀 코드·꾸러미)·황금 트랙은 **넣지 않는다** (보수적 — 더 빨라질 수만 있다).
 * 실제 지급 함수(P2·P3)가 들어오면 같은 표를 실제 정산 코드로 다시 재는 테스트가 따라온다.
 */
import type { Grade } from '../../data/load';
import { Rng } from '../../sim/Rng';
import { matchRewardSpec } from '../progress';
import type { ProgressionData, RewardSpec } from '../progressionData';

/** 표준 전투: 11웨이브 도달 후 패배 (완료 10), 보스 1 처치 */
export const STANDARD_BATTLE = Object.freeze({ stage: 11, bossKills: 1, completed: 10 });

export type ChoicePolicy = 'hero' | 'relic' | 'alternate';
export type ExchangePolicy = 'none' | 'all';

export interface PerBattle {
  xp: number;
  gold: number;
  flame: number;
  cards: number;
  gems: number;
  keys: number;
  targetFragments: number;
  limitedFragments: number;
}

const add = (a: PerBattle, r: RewardSpec, k = 1): void => {
  a.gold += (r.gold ?? 0) * k;
  a.flame += (r.flame ?? 0) * k;
  a.cards += (r.cards ?? 0) * k;
  a.gems += (r.gems ?? 0) * k;
  a.keys += (r.keys ?? 0) * k;
  a.limitedFragments += (r.fragments ?? 0) * k;
};

/** 표준 전투 1판의 평균 수급 (출처별). 도장·패스는 한 회차·시즌 평균 */
export function perBattleSources(pd: ProgressionData): Record<'match' | 'supply' | 'stamp' | 'pass', PerBattle> {
  const z = (): PerBattle => ({ xp: 0, gold: 0, flame: 0, cards: 0, gems: 0, keys: 0, targetFragments: 0, limitedFragments: 0 });
  const v3 = pd.v3;
  const m = matchRewardSpec(pd, STANDARD_BATTLE.stage, STANDARD_BATTLE.bossKills, false);
  const match = z();
  match.xp = m.xp;
  match.gold = m.gold;
  match.flame = m.flame;
  match.cards = m.cards;
  match.limitedFragments = m.fragments;
  const supply = z();
  const supplies = STANDARD_BATTLE.completed / v3.explore.wavesPerSupply;
  supply.keys = v3.explore.supplyReward.keys * supplies;
  supply.targetFragments = v3.explore.supplyReward.targetFragments * supplies;
  const stamp = z();
  for (const r of v3.stamp.rewards) add(stamp, r, 1 / v3.stamp.cells);
  const pass = z();
  const cellsPerBattle = STANDARD_BATTLE.completed / v3.pass.wavesPerCell;
  for (const r of v3.pass.free) add(pass, r, cellsPerBattle / v3.pass.cells);
  return { match, supply, stamp, pass };
}

/** 성장 선택 간격 (표준 전투 판 수) */
export function battlesPerChoice(pd: ProgressionData): number {
  return (pd.v3.explore.supplyPerChoice * pd.v3.explore.wavesPerSupply) / STANDARD_BATTLE.completed;
}

/** 유물 Lv n → n+1 비용 (최대 Lv max) */
export function relicCost(pd: ProgressionData, level: number, max: number): { fragments: number; gold: number } | null {
  if (level < 1 || level >= max) return null;
  return { fragments: pd.v3.relics.fragmentCost[level - 1] as number, gold: pd.v3.relics.goldCost[level - 1] as number };
}

export interface RelicRun {
  /** 주력 유물 최대 레벨까지 걸린 유효 전투 (못 하면 limit) */
  battles: number;
  /** 그 시점 보유 유물 수 (공개 풀 중) */
  owned: number;
  /** 주력 유물에 쓴 골드 / 그때까지 번 골드 */
  goldSpent: number;
  goldEarned: number;
  /** 조각·골드 중 마지막에 기다린 것 */
  bottleneck: 'fragments' | 'gold';
}

/**
 * 주력 유물 경로 몬테카를로 (한 시드). 주력 = 첫 유물 선택권으로 해금(Lv1)한 유물, 목표로 지정.
 * 열쇠 1개 = 공개 풀 조각 1개 (pityEvery번째는 미보유 → 없으면 최저 레벨·만렙 제외, 시드 고정). exchange 'all'이면
 * 주력이 아닌 조각을 exchangeRate개마다 주력 조각 1개로 바꾼다 (미보유 해금 1개는 남김).
 */
export function simulateRelic(pd: ProgressionData, seed: number, choice: ChoicePolicy, exchange: ExchangePolicy, maxLevel = 10, limit = 400): RelicRun {
  const v3 = pd.v3;
  const pool = v3.relics.pool;
  const rng = new Rng(seed >>> 0);
  const level = new Map<string, number>();
  const frag = new Map<string, number>();
  const main = pool[0] as string;
  level.set(main, 1);
  let pulls = 0;
  let gold = 0;
  let goldEarned = 0;
  let goldSpent = 0;
  let stampFilled = 0;
  let passWaves = 0;
  let passCellsSeen = 0;
  let supplyRest = 0;
  let choiceRest = 0;
  let choiceNo = 0;
  let bottleneck: 'fragments' | 'gold' = 'fragments';
  const m = matchRewardSpec(pd, STANDARD_BATTLE.stage, STANDARD_BATTLE.bossKills, false);
  const pull = (): void => {
    pulls += 1;
    let id: string;
    if (pulls % v3.relics.pityEvery === 0) {
      const unowned = pool.filter((x) => (level.get(x) ?? 0) < 1 && (frag.get(x) ?? 0) < v3.relics.unlockFragments);
      if (unowned.length > 0) id = rng.pick(unowned);
      else {
        const open = pool.filter((x) => (level.get(x) ?? 0) < maxLevel);
        const low = Math.min(...open.map((x) => level.get(x) ?? 0));
        id = rng.pick(open.filter((x) => (level.get(x) ?? 0) === low));
      }
    } else id = rng.pick(pool);
    frag.set(id, (frag.get(id) ?? 0) + 1);
  };
  const keys = (n: number): void => {
    for (let i = 0; i < n; i++) pull();
  };
  for (let b = 1; b <= limit; b++) {
    gold += m.gold;
    goldEarned += m.gold;
    // 보급
    const s = supplyRest + STANDARD_BATTLE.completed;
    const supplies = Math.floor(s / v3.explore.wavesPerSupply);
    supplyRest = s % v3.explore.wavesPerSupply;
    keys(supplies * v3.explore.supplyReward.keys);
    frag.set(main, (frag.get(main) ?? 0) + supplies * v3.explore.supplyReward.targetFragments);
    // 성장 선택
    const c = choiceRest + supplies;
    const choices = Math.floor(c / v3.explore.supplyPerChoice);
    choiceRest = c % v3.explore.supplyPerChoice;
    for (let i = 0; i < choices; i++) {
      choiceNo += 1;
      const relicPick = choice === 'relic' || (choice === 'alternate' && choiceNo % 2 === 0);
      if (relicPick) keys(v3.growthChoice.relicKeys);
    }
    // 도장
    const r = v3.stamp.rewards[stampFilled % v3.stamp.cells] as RewardSpec;
    stampFilled += 1;
    keys(r.keys ?? 0);
    gold += r.gold ?? 0;
    goldEarned += r.gold ?? 0;
    // 패스 무료 (시즌을 다 채우면 다음 시즌으로)
    passWaves += STANDARD_BATTLE.completed;
    const cells = Math.floor(passWaves / v3.pass.wavesPerCell);
    for (; passCellsSeen < cells; passCellsSeen++) {
      const pr = v3.pass.free[passCellsSeen % v3.pass.cells] as RewardSpec;
      keys(pr.keys ?? 0);
      gold += pr.gold ?? 0;
      goldEarned += pr.gold ?? 0;
    }
    // 해금 (미보유 조각이 모이면)
    for (const id of pool) {
      if ((level.get(id) ?? 0) < 1 && (frag.get(id) ?? 0) >= v3.relics.unlockFragments) {
        frag.set(id, (frag.get(id) as number) - v3.relics.unlockFragments);
        level.set(id, 1);
      }
    }
    if (exchange === 'all') {
      let spare = 0;
      for (const id of pool) {
        if (id === main) continue;
        spare += frag.get(id) ?? 0;
        frag.set(id, 0);
      }
      const got = Math.floor(spare / v3.relics.exchangeRate);
      frag.set(main, (frag.get(main) ?? 0) + got);
      // 바꾸고 남은 조각은 아무 비주력 칸에 돌려 둔다 (다음 판에 이어서)
      frag.set(pool[1] as string, spare - got * v3.relics.exchangeRate);
    }
    // 주력 강화
    for (;;) {
      const lv = level.get(main) as number;
      const cost = relicCost(pd, lv, maxLevel);
      if (!cost) break;
      const f = frag.get(main) ?? 0;
      if (f < cost.fragments) {
        bottleneck = 'fragments';
        break;
      }
      if (gold < cost.gold) {
        bottleneck = 'gold';
        break;
      }
      frag.set(main, f - cost.fragments);
      gold -= cost.gold;
      goldSpent += cost.gold;
      level.set(main, lv + 1);
    }
    if ((level.get(main) as number) >= maxLevel) {
      return { battles: b, owned: pool.filter((x) => (level.get(x) ?? 0) >= 1).length, goldSpent, goldEarned, bottleneck };
    }
  }
  return { battles: limit, owned: pool.filter((x) => (level.get(x) ?? 0) >= 1).length, goldSpent, goldEarned, bottleneck };
}

/** 첫 12종을 모두 해금하는 데 걸린 유효 전투 (열쇠·천장만, 성장 선택은 policy대로) */
export function simulateCollection(pd: ProgressionData, seed: number, choice: ChoicePolicy, limit = 400): number {
  const v3 = pd.v3;
  const pool = v3.relics.pool;
  const rng = new Rng(seed >>> 0);
  const owned = new Set<string>([pool[0] as string]);
  let pulls = 0;
  let stampFilled = 0;
  let passCellsSeen = 0;
  let choiceNo = 0;
  const pull = (): void => {
    pulls += 1;
    const unowned = pool.filter((x) => !owned.has(x));
    owned.add(pulls % v3.relics.pityEvery === 0 && unowned.length > 0 ? rng.pick(unowned) : rng.pick(pool));
  };
  for (let b = 1; b <= limit; b++) {
    for (let i = 0; i < v3.explore.supplyReward.keys; i++) pull();
    if (b % battlesPerChoice(pd) === 0) {
      choiceNo += 1;
      if (choice === 'relic' || (choice === 'alternate' && choiceNo % 2 === 0)) for (let i = 0; i < v3.growthChoice.relicKeys; i++) pull();
    }
    const r = v3.stamp.rewards[stampFilled % v3.stamp.cells] as RewardSpec;
    stampFilled += 1;
    for (let i = 0; i < (r.keys ?? 0); i++) pull();
    const cells = Math.floor((b * STANDARD_BATTLE.completed) / v3.pass.wavesPerCell);
    for (; passCellsSeen < cells; passCellsSeen++) for (let i = 0; i < ((v3.pass.free[passCellsSeen % v3.pass.cells] as RewardSpec).keys ?? 0); i++) pull();
    if (owned.size >= pool.length) return b;
  }
  return limit;
}

export interface HeroRun {
  /** Lv10·Lv15 도달 판 수 (못 하면 limit) */
  lv10: number;
  lv15: number;
  /** Lv15까지 가장 오래 기다린 재료 */
  bottleneck: 'cards' | 'flame';
}

/**
 * 목표 영웅 한 명 (grade, Lv1·카드 0에서 시작) 성장. 판 카드는 matchRewards 가중치로 굴려 그 영웅이 나온 장수만 센다.
 * 불꽃은 판·도장·패스 무료 불꽃을 **모두 이 영웅에** 쓴다고 가정(상한 쪽). withChoice면 성장 선택마다 영웅 꾸러미
 * (다음 레벨 비용의 cardsPct%·flamePct%, 올림)를 이 영웅에.
 */
export function simulateHero(pd: ProgressionData, gradeCount: Record<Grade, number>, grade: Grade, seed: number, withChoice: boolean, limit = 2000): HeroRun {
  const v3 = pd.v3;
  const rng = new Rng(seed >>> 0);
  const w = pd.matchRewards.cardGradeWeights;
  const grades = (Object.keys(w) as Grade[]).filter((g) => (w[g] ?? 0) > 0).sort();
  const weights = grades.map((g) => w[g] as number);
  const m = matchRewardSpec(pd, STANDARD_BATTLE.stage, STANDARD_BATTLE.bossKills, false);
  let level = 1;
  let cards = 0;
  let flame = 0;
  let stampFilled = 0;
  let passCellsSeen = 0;
  let lv10 = limit;
  let waitCards = 0;
  let waitFlame = 0;
  const cost = (lv: number): { cards: number; flame: number } | null => {
    if (lv >= pd.heroes.maxLevel) return null;
    return {
      cards: Math.max(1, Math.ceil(((pd.heroes.cards[lv - 1] as number) * pd.heroes.gradeCardPct[grade]) / 100)),
      flame: Math.floor(((pd.heroes.flame[lv - 1] as number) * pd.heroes.gradeFlamePct[grade]) / 100),
    };
  };
  for (let b = 1; b <= limit; b++) {
    flame += m.flame;
    for (let i = 0; i < m.cards; i++) {
      const g = grades[rng.weightedIndex(weights)] as Grade;
      if (g === grade && rng.int(gradeCount[grade]) === 0) cards += 1;
    }
    const r = v3.stamp.rewards[stampFilled % v3.stamp.cells] as RewardSpec;
    stampFilled += 1;
    flame += r.flame ?? 0;
    const cells = Math.floor((b * STANDARD_BATTLE.completed) / v3.pass.wavesPerCell);
    for (; passCellsSeen < cells; passCellsSeen++) flame += (v3.pass.free[passCellsSeen % v3.pass.cells] as RewardSpec).flame ?? 0;
    if (withChoice && b % battlesPerChoice(pd) === 0) {
      const c = cost(level);
      if (c) {
        cards += Math.ceil((c.cards * v3.growthChoice.cardsPct) / 100);
        flame += Math.ceil((c.flame * v3.growthChoice.flamePct) / 100);
      }
    }
    for (;;) {
      const c = cost(level);
      if (!c) break;
      if (cards < c.cards || flame < c.flame) {
        if (cards < c.cards) waitCards += 1;
        if (flame < c.flame) waitFlame += 1;
        break;
      }
      cards -= c.cards;
      flame -= c.flame;
      level += 1;
    }
    if (level >= 10 && lv10 === limit) lv10 = b;
    if (level >= pd.heroes.maxLevel) return { lv10, lv15: b, bottleneck: waitCards >= waitFlame ? 'cards' : 'flame' };
  }
  return { lv10, lv15: limit, bottleneck: waitCards >= waitFlame ? 'cards' : 'flame' };
}

/** 정렬한 값의 분위수 (p 0~100, 가장 가까운 순위) */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[i] as number;
}
