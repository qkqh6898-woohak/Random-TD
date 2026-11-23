/**
 * V3 P0 무료 트랙 수급표 (docs/v3/supply-table.md). `V3_TABLE=1 npx vitest run tests/unit/v3-p0-supply-table.test.ts`로 다시 만든다.
 * 평소에는 문서가 지금 데이터로 만든 표와 같은지(최신인지)와 검증 목표를 확인한다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GRADES, loadGameData, type Grade } from '../../src/data/load';
import { loadProgression } from '../../src/meta/progressionData';
import { levelUpCost } from '../../src/meta/progress';
import {
  STANDARD_BATTLE,
  battlesPerChoice,
  percentile,
  perBattleSources,
  simulateCollection,
  simulateHero,
  simulateRelic,
  type ChoicePolicy,
  type ExchangePolicy,
} from '../../src/meta/v3/supplyModel';

const data = loadGameData();
const pd = loadProgression(data);
const SEEDS = Array.from({ length: 200 }, (_, i) => 1000 + i * 7919);
const DOC = 'docs/v3/supply-table.md';

const gradeCount = Object.fromEntries(GRADES.map((g) => [g, data.towers.towers.filter((t) => t.grade === g).length])) as Record<Grade, number>;
const fmt = (n: number, d = 1): string => (Number.isInteger(n) ? String(n) : n.toFixed(d));
const stats = (xs: number[]): { p10: number; p50: number; p90: number } => {
  const s = [...xs].sort((a, b) => a - b);
  return { p10: percentile(s, 10), p50: percentile(s, 50), p90: percentile(s, 90) };
};

function relicRow(choice: ChoicePolicy, exchange: ExchangePolicy) {
  const runs = SEEDS.map((s) => simulateRelic(pd, s, choice, exchange));
  const b = stats(runs.map((r) => r.battles));
  const goldShare = runs.map((r) => r.goldSpent / r.goldEarned).sort((a, b2) => a - b2);
  const goldBound = runs.filter((r) => r.bottleneck === 'gold').length;
  return { ...b, goldShare: percentile(goldShare, 50), goldBound, owned: percentile(runs.map((r) => r.owned).sort((a, c) => a - c), 50) };
}

function build(): { md: string; relic: Record<string, ReturnType<typeof relicRow>>; collect: number; hero: Record<string, { base: number; choice: number; choice10: number; bottleneck: string; baseBottleneck: string }> } {
  const src = perBattleSources(pd);
  const rows = (['match', 'supply', 'stamp', 'pass'] as const).map((k) => {
    const v = src[k];
    return `| ${{ match: '기존 판 정산', supply: '보급 (P2·P3)', stamp: '탐험 도장 평균 (P3)', pass: '패스 무료 평균 (P3)' }[k]} | ${fmt(v.gold)} | ${fmt(v.flame)} | ${fmt(v.cards, 2)} | ${fmt(v.gems, 2)} | ${fmt(v.keys, 3)} | ${fmt(v.targetFragments)} | ${fmt(v.limitedFragments)} |`;
  });
  const relic: Record<string, ReturnType<typeof relicRow>> = {};
  const policies: [string, ChoicePolicy, ExchangePolicy, string][] = [
    ['direct', 'hero', 'none', '직접 경로 — 성장 선택은 모두 영웅, 교환 안 함'],
    ['alternate', 'alternate', 'none', '균형 — 성장 선택 영웅/유물 번갈아, 교환 안 함'],
    ['focus', 'relic', 'none', '유물 집중 — 성장 선택 모두 유물(열쇠), 교환 안 함'],
    ['directEx', 'hero', 'all', '직접 경로 + 비주력 조각 모두 5:1 교환'],
    ['focusEx', 'relic', 'all', '최대 가속 — 유물 집중 + 모두 교환'],
  ];
  const relicLines = policies.map(([k, c, e, label]) => {
    const r = (relic[k] = relicRow(c, e));
    return `| ${label} | ${r.p10} | **${r.p50}** | ${r.p90} | ${Math.round(r.goldShare * 100)}% | ${r.goldBound}/${SEEDS.length} | ${r.owned}/12 |`;
  });
  const collect = stats(SEEDS.map((s) => simulateCollection(pd, s, 'hero')));
  const collectAlt = stats(SEEDS.map((s) => simulateCollection(pd, s, 'alternate')));
  const hero: Record<string, { base: number; choice: number; choice10: number; bottleneck: string; baseBottleneck: string }> = {};
  const heroLines = (['normal', 'rare', 'unique', 'hero', 'legend'] as Grade[]).map((g) => {
    const base = SEEDS.slice(0, 60).map((s) => simulateHero(pd, gradeCount, g, s, false));
    const ch = SEEDS.slice(0, 60).map((s) => simulateHero(pd, gradeCount, g, s, true));
    const b15 = stats(base.map((r) => r.lv15)).p50;
    const c15 = stats(ch.map((r) => r.lv15)).p50;
    const c10 = stats(ch.map((r) => r.lv10)).p50;
    const bb = base.filter((r) => r.bottleneck === 'cards').length >= base.length / 2 ? '카드' : '불꽃';
    const cb = ch.filter((r) => r.bottleneck === 'cards').length >= ch.length / 2 ? '카드' : '불꽃';
    hero[g] = { base: b15, choice: c15, choice10: c10, bottleneck: cb, baseBottleneck: bb };
    let cards = 0;
    let flame = 0;
    for (let lv = 1; lv < pd.heroes.maxLevel; lv++) {
      const c = levelUpCost(pd, g, lv) as { cards: number; flame: number };
      cards += c.cards;
      flame += c.flame;
    }
    const name = { normal: '노말', rare: '레어', unique: '유니크', hero: '히어로', legend: '레전드' }[g as 'normal'];
    return `| ${name} (${gradeCount[g]}종) | ${cards} / ${flame} | ${b15 >= 2000 ? '2000+' : b15} (${bb}) | **${c10}** | **${c15}** (${cb}) |`;
  });
  const m = perBattleSources(pd).match;
  const goldTotal = pd.v3.relics.goldCost.reduce((a, b) => a + b, 0);
  const md = `# V3 무료 트랙 수급표 (P0 산출 — 자동 생성)

> 이 파일은 \`tests/unit/v3-p0-supply-table.test.ts\`가 \`src/data/progression.json\`·\`towers.json\`과 \`src/meta/v3/supplyModel.ts\`로 만든다.
> 다시 만들기: \`V3_TABLE=1 npx vitest run tests/unit/v3-p0-supply-table.test.ts\`. 평소 \`npm test\`는 이 파일이 최신인지 검사한다.
> **모델 산출값이다.** 실제 정산 코드로 다시 재는 검증은 P2(유물·보급)·P3(도장·패스·성장 선택) 테스트가 맡는다. 실기기·플레이 측정이 아니다.

## 가정

- 표준 전투 = **완료 ${STANDARD_BATTLE.completed}웨이브**(${STANDARD_BATTLE.stage}웨이브 도달 후 패배), 보스 ${STANDARD_BATTLE.bossKills}처치, 치트 없음 → 유효 전투 1판.
- 무료 트랙만: 기존 판 정산 + 보급 + 탐험 도장 + 패스 무료 칸 + 성장 선택. **일일 퀘스트(날짜)·웨이브 길·업적·비밀 코드·성장 꾸러미·황금 트랙은 넣지 않음** (넣으면 더 빨라질 뿐).
- 무작위 값은 고정 시드 ${SEEDS.length}개(영웅은 60개)의 몬테카를로. p10/p50/p90 = 빠른 10% / 가운데 / 느린 10%.
- 주력 유물 = 첫 유물 선택권으로 해금(Lv1)한 최대 Lv10 유물, 목표 지정. 강화 = 조각 ${pd.v3.relics.fragmentCost.join('/')}(합 ${pd.v3.relics.fragmentCost.reduce((a, b) => a + b, 0)}) + 골드 ${pd.v3.relics.goldCost.join('/')}(합 ${goldTotal.toLocaleString('en-US')}). 판 골드는 유물에만 쓴다고 가정(상점 등 다른 사용처가 있으면 골드가 병목이 될 수 있어 '골드 병목' 열로 표시).
- 열쇠 1개 = 공개 12종 조각 1개(균등), ${pd.v3.relics.pityEvery}번째마다 미보유 보장(모두 보유면 최저 레벨). 교환 = 아무 조각 ${pd.v3.relics.exchangeRate}개 → 지정 1개.
- 영웅: 판 카드 ${m.cards}장을 기존 가중치로 굴려 목표 영웅이 나온 장수만 센다. 판·도장·패스 불꽃은 **모두 목표 영웅에** 쓴다고 가정(상한 쪽). 영웅 꾸러미 = 다음 레벨 비용의 카드 ${pd.v3.growthChoice.cardsPct}%·불꽃 ${pd.v3.growthChoice.flamePct}%.

## 1. 표준 전투 1판당 평균 수급 (출처별)

| 출처 | 골드 | 🔥 불꽃 | 카드(무작위) | 보석 | 🗝️ 열쇠 | 목표 유물 조각 | 리미티드 조각 |
|---|---:|---:|---:|---:|---:|---:|---:|
${rows.join('\n')}

- 성장 선택: 보급 ${pd.v3.explore.supplyPerChoice}개마다 = **표준 전투 ${battlesPerChoice(pd)}판마다 1회** (목표 3~5판 ✅). 완료 27웨이브 판이면 보급 2 + 잔여 7, 80웨이브 판이면 보급 8·성장 선택 2.
- 성장 선택 내용: 영웅 꾸러미(목표 영웅 다음 레벨 비용 전부 → **1회 = 1레벨 확정**, 만렙 영웅은 고를 수 없음) 또는 🗝️ 열쇠 ${pd.v3.growthChoice.relicKeys}개.

## 2. 주력 유물 Lv1 → Lv10 (유효 전투 수)

| 정책 | p10 | p50 | p90 | 번 골드 중 유물에 쓴 비율 | 골드가 마지막 병목 | 완성 때 보유 유물 |
|---|---:|---:|---:|---:|---:|---:|
${relicLines.join('\n')}

- 목표 **50~70유효 전투**: 직접 경로·균형·유물 집중(교환 없음)의 가운데 값이 범위 안이어야 한다(테스트가 확인). 비주력 조각을 모두 5:1로 바꾸는 최대 가속은 더 빠를 수 있다 — 대신 다른 유물 수집이 늦어진다.
- 첫 12종 모두 해금(열쇠·천장만): 성장 선택 영웅만 p50 **${collect.p50}판**(p90 ${collect.p90}), 번갈아 p50 **${collectAlt.p50}판** — 목표 '1~2개월 안'보다 빠르다.

## 3. 목표 영웅 Lv1 → Lv15 (유효 전투 수)

| 등급 | 전체 비용 카드 / 불꽃 | V3 없이 (기존 판 보상만, 병목) | V3 영웅 꾸러미 Lv10 | V3 영웅 꾸러미 Lv15 (병목) |
|---|---:|---:|---:|---:|
${heroLines.join('\n')}

- 기존 판 보상만으로는 높은 등급의 **특정 영웅 카드**가 병목(무작위 5장 중 그 영웅이 나올 확률이 낮음)이다. 영웅 꾸러미는 카드·불꽃을 함께 주어 '카드만 받고 불꽃에 막히는' 일이 없다.
- 꾸러미를 받은 영웅도 나머지 레벨은 판 카드·불꽃으로 오른다. 불꽃을 한 영웅에 몰아준다는 가정이 빠지면 더 느려진다.

## 4. 판정 (P0)

- 성장 선택 3판마다: ✅ (표준 10웨이브 완료 기준, 긴 판은 더 빨리).
- 주력 유물 50~70유효 전투: 위 2장 p50으로 판정 — 테스트 \`v3-p0-supply-table\`이 범위를 확인한다.
- 무료 트랙만으로 달성: 위 계산에 황금 트랙·날짜 보상은 하나도 넣지 않았다.
- 이 표의 수치는 **후보값**이다. P2·P3 구현 뒤 실제 정산 코드로 같은 정책을 다시 재서 PROGRESS에 적는다.
`;
  return { md, relic, collect: collect.p50, hero };
}

describe('V3 P0 수급표', () => {
  const t = build();

  it('성장 선택은 표준 전투 3~5판마다', () => {
    expect(battlesPerChoice(pd)).toBeGreaterThanOrEqual(3);
    expect(battlesPerChoice(pd)).toBeLessThanOrEqual(5);
  });

  it('주력 유물: 직접·균형·집중(교환 없음) 가운데 값이 50~70유효 전투, 최대 가속도 너무 빠르지 않다(≥ 35)', () => {
    for (const k of ['direct', 'alternate', 'focus']) {
      const r = t.relic[k] as { p50: number };
      expect(r.p50, k).toBeGreaterThanOrEqual(50);
      expect(r.p50, k).toBeLessThanOrEqual(70);
    }
    expect((t.relic.focusEx as { p50: number }).p50).toBeGreaterThanOrEqual(35);
  });

  it('영웅 꾸러미가 있으면 모든 등급에서 Lv15가 더 빠르다 (기존 판 보상을 줄이지 않고 더하기만)', () => {
    for (const g of ['normal', 'rare', 'unique', 'hero', 'legend']) {
      const h = t.hero[g] as { base: number; choice: number };
      expect(h.choice, g).toBeLessThan(h.base);
    }
  });

  it('문서가 최신 (V3_TABLE=1이면 다시 쓴다)', () => {
    if (process.env.V3_TABLE === '1') writeFileSync(DOC, t.md);
    expect(readFileSync(DOC, 'utf8')).toBe(t.md);
  });
});
