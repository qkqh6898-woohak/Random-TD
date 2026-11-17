/**
 * M4-7 보스 카드 12장: 3장 묶음(서로 다름, 희귀 15%), 고르기 명령, 효과 12종, 난수 흐름 독립.
 */
import { describe, expect, it } from 'vitest';
import { listMobs } from '../../src/sim/entities/Mob';
import { listTowers } from '../../src/sim/entities/Tower';
import { buildMatchRules } from '../../src/sim/rules';
import { applyCard, offerCards, rollOffer } from '../../src/sim/systems/Cards';
import { godChanceFor, summonCost } from '../../src/sim/systems/Summon';
import { advanceMob } from '../../src/sim/systems/Movement';
import { arena, command, data, eventsOf, mobAt, summonAt } from '../helpers/match';

const rules = buildMatchRules(data);
const card = (id: string) => {
  const c = rules.cardById.get(id);
  if (!c) throw new Error(id);
  return c;
};

describe('카드 데이터 (GDD 3.1)', () => {
  it('12장 = 일반 8 + 희귀 4, 3장 묶음, 희귀 15%', () => {
    // G-1: 보스 묶음은 예전 12장 그대로, 강화 선택(pick) 전용 5장이 더해졌다
    expect(rules.cards.filter((c) => c.pools.includes('boss'))).toHaveLength(12);
    expect(rules.cards).toHaveLength(18);
    expect(rules.cards.filter((c) => c.rare).map((c) => c.name)).toEqual(['승급의 축복', '쌍둥이 소환', '신의 눈길', '황금 손']);
    expect(rules.cardOfferSize).toBe(3);
    expect(rules.cardRareBp).toBe(1500);
  });
});

describe('카드 묶음 (M4-7)', () => {
  it('묶음 3장은 서로 다르고, 많이 뽑으면 희귀 비율 ≈ 15%', () => {
    const m = arena(5);
    let rare = 0;
    let total = 0;
    for (let i = 0; i < 4000; i++) {
      const offer = rollOffer(m.ctx, m.world, 0);
      expect(offer).toHaveLength(3);
      expect(new Set(offer).size).toBe(3);
      for (const id of offer) {
        total++;
        if (card(id).rare) rare++;
      }
    }
    expect(rare / total).toBeGreaterThan(0.13);
    expect(rare / total).toBeLessThan(0.17);
  });

  it('카드 흐름은 플레이어별: 묶음을 뽑아도 세계·소환 흐름은 그대로', () => {
    const a = arena(9);
    const b = arena(9);
    offerCards(a.ctx, a.world, 1);
    expect(a.world.rng('world').snapshot()).toEqual(b.world.rng('world').snapshot());
    expect(a.world.rng('p0.summon').snapshot()).toEqual(b.world.rng('p0.summon').snapshot());
    expect(a.state.cardOffers).toHaveLength(1);
  });

  it('pickCard: 가장 먼저 받은 묶음의 i번째, 고르면 묶음이 사라진다 / 없는 번호·묶음 없음은 실패', () => {
    const m = arena(3);
    m.state.cardOffers.push({ player: 0, boss: 2, cards: ['fund', 'sticky', 'quake'] });
    m.state.cardOffers.push({ player: 0, boss: 3, cards: ['atkAll', 'sticky', 'quake'] });
    command(m, { type: 'pickCard', i: 7 });
    expect(eventsOf(m, 'cardFail')[0]?.reason).toBe('index');
    const g0 = m.state.gold;
    command(m, { type: 'pickCard', i: 0 });
    expect(m.state.gold - g0).toBe(1000); // 긴급 자금 500 × 보스 번호 2
    expect(m.state.cardOffers).toHaveLength(1);
    expect(m.state.cardsPicked).toEqual(['fund']);
    command(m, { type: 'pickCard', i: 0 });
    expect(m.state.mods[0]?.atkPctBp).toBe(2000);
    command(m, { type: 'pickCard', i: 0 });
    expect(eventsOf(m, 'cardFail').map((e) => e.reason)).toEqual(['none']);
  });
});

describe('카드 효과 12종', () => {
  it('전군 강화: 공격력 +20%, 두 번이면 +40%', () => {
    const m = arena(1);
    applyCard(m.ctx, m.world, 0, card('atkAll'), 1);
    applyCard(m.ctx, m.world, 0, card('atkAll'), 1);
    expect(m.state.mods[0]?.atkPctBp).toBe(4000);
  });

  it('긴급 자금: 500원 × 보스 번호 (50단계 = 2,500원)', () => {
    const m = arena(1);
    const g0 = m.state.gold;
    applyCard(m.ctx, m.world, 0, card('fund'), 5);
    expect(m.state.gold - g0).toBe(2500);
  });

  it('행운의 소환: 다음 소환 5회는 덱 레어, 6번째부터 노말', () => {
    const m = arena(2);
    m.state.gold = 10_000;
    applyCard(m.ctx, m.world, 0, card('luckySummon'), 1);
    const grades: string[] = [];
    const tiles: [number, number][] = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0]];
    for (const [x, y] of tiles) grades.push(rules.towers.get(summonAt(m, x, y)!.tower)!.grade);
    expect(grades.slice(0, 5)).toEqual(['rare', 'rare', 'rare', 'rare', 'rare']);
    expect(grades.slice(5)).toEqual(['normal', 'normal']);
    expect(m.state.perks[0]?.rareSummons).toBe(0);
  });

  it('일꾼 열정: 수입 ×2 → ×3 → ×4', () => {
    const m = arena(1);
    for (let i = 0; i < 3; i++) applyCard(m.ctx, m.world, 0, card('workerPassion'), 1);
    expect(m.state.workerMul).toBe(4);
  });

  it('대지진: 맵 위 몹(드러난 몹·보스 제외) 지금 체력 −30% (내림)', () => {
    const m = arena(1);
    const a = mobAt(m, 'slime', 1000);
    a.hp = 1000;
    const thief = mobAt(m, 'thief', 2000); // 투명 (드러나지 않음)
    const hp0 = thief.hp;
    const boss = mobAt(m, 'slime', 3000);
    boss.boss = true;
    boss.hp = 5000;
    applyCard(m.ctx, m.world, 0, card('quake'), 1);
    expect(a.hp).toBe(700);
    expect(thief.hp).toBe(hp0);
    expect(boss.hp).toBe(5000);
  });

  it('소환 할인: 100 → 80 → 60 → 50 (최소 50원)', () => {
    const m = arena(1);
    const costs: number[] = [summonCost(m.ctx)];
    for (let i = 0; i < 3; i++) {
      applyCard(m.ctx, m.world, 0, card('summonDiscount'), 1);
      costs.push(summonCost(m.ctx));
    }
    expect(costs).toEqual([100, 80, 60, 50]);
    const g0 = m.state.gold;
    summonAt(m, 0, 0);
    expect(g0 - m.state.gold).toBe(50);
  });

  it('끈끈이: 몹 이동속도 −15%씩, 최대 −45%, 보스에게는 없음', () => {
    const m = arena(1);
    for (let i = 0; i < 4; i++) applyCard(m.ctx, m.world, 0, card('sticky'), 1);
    expect(m.state.mobSlowBp).toBe(4500);
    const slime = mobAt(m, 'slime', 0, 1500);
    for (let i = 0; i < 20; i++) advanceMob(slime, 0, m.state.mobSlowBp);
    expect(slime.progress).toBe(825); // 1.5칸/초 × 0.55
    const boss = mobAt(m, 'slime', 0, 1500);
    boss.boss = true;
    for (let i = 0; i < 20; i++) advanceMob(boss, 0, m.state.mobSlowBp);
    expect(boss.progress).toBe(1500);
  });

  it('무료 일꾼: +2명, 최대 10명을 넘을 수 있다 (그 뒤 고용은 최대라 실패)', () => {
    const m = arena(1);
    m.state.workers = 10;
    applyCard(m.ctx, m.world, 0, card('freeWorkers'), 1);
    expect(m.state.workers).toBe(12);
    command(m, { type: 'hireWorker' });
    expect(m.state.workers).toBe(12);
  });

  it('승급의 축복: 다음 승급 3회는 다른 결과 하나를 고를 수 있다 (pickMerge 1 = 바꿈, 0 = 그대로)', () => {
    const m = arena(4);
    applyCard(m.ctx, m.world, 0, card('mergeBless'), 1);
    expect(m.state.perks[0]?.mergeChoices).toBe(3);
    m.state.gold = 1_000_000;
    // 고블린 3개 → 승급
    for (const x of [0, 1, 2]) m.world.enqueue({ type: 'debugTower', x, y: 0, t: rules.towerOrder.indexOf('goblin') });
    m.state.debug = true;
    m.step();
    command(m, { type: 'merge', x: 0, y: 0 });
    expect(m.state.mergePicks).toHaveLength(1);
    const pick = m.state.mergePicks[0]!;
    const res = listTowers(m.world).find((t) => t.id === pick.id)!;
    expect(rules.towers.get(res.tower)?.grade).toBe('rare');
    expect(rules.towers.get(pick.alt)?.grade).toBe('rare');
    expect(pick.alt).not.toBe(res.tower);
    expect(data.decks.base.rare).toContain(pick.alt);
    command(m, { type: 'pickMerge', id: pick.id, pick: 1 });
    expect(res.tower).toBe(pick.alt);
    expect(m.state.mergePicks).toHaveLength(0);
    expect(m.state.perks[0]?.mergeChoices).toBe(2);
    expect(eventsOf(m, 'mergePicked')[0]).toMatchObject({ changed: true });
    // 없는 선택은 실패
    command(m, { type: 'pickMerge', id: pick.id, pick: 1 });
    expect(eventsOf(m, 'mergePickFail')[0]?.reason).toBe('none');
  });

  it('쌍둥이 소환: 30초 동안 소환하면 같은 타워가 가장 가까운 빈 칸에 하나 더 (돈은 한 번)', () => {
    const m = arena(6);
    applyCard(m.ctx, m.world, 0, card('twinSummon'), 1);
    expect(m.state.perks[0]?.twinUntil).toBe(m.tick + 600);
    const g0 = m.state.gold;
    summonAt(m, 4, 0);
    const towers = listTowers(m.world);
    expect(towers).toHaveLength(2);
    expect(towers[0]!.tower).toBe(towers[1]!.tower);
    expect(g0 - m.state.gold).toBe(100);
    expect(m.state.summons).toBe(1);
    // 가장 가까운 빈 칸: (3,0)·(5,0) 중 배치 칸 순서가 앞인 (3,0)
    expect([towers[1]!.tx, towers[1]!.ty]).toEqual([3, 0]);
    m.stepN(600);
    summonAt(m, 8, 10);
    expect(listTowers(m.world)).toHaveLength(3);
  });

  it('신의 눈길: 신 확률 ×3, 다시 고르면 ×5', () => {
    const m = arena(1);
    expect(godChanceFor(m.ctx, 0)).toBe(rules.godChanceBp);
    applyCard(m.ctx, m.world, 0, card('godGaze'), 1);
    expect(godChanceFor(m.ctx, 0)).toBe(rules.godChanceBp * 3);
    applyCard(m.ctx, m.world, 0, card('godGaze'), 1);
    expect(godChanceFor(m.ctx, 0)).toBe(rules.godChanceBp * 5);
  });

  it('황금 손: 모든 돈 획득 +25% (처치 보상 10원 → 12원)', () => {
    const m = arena(1);
    applyCard(m.ctx, m.world, 0, card('goldHand'), 1);
    expect(m.state.goldPctBp).toBe(2500);
    const mob = mobAt(m, 'slime', 3000);
    mob.hp = 1;
    const g0 = m.state.gold;
    summonAt(m, 4, 2);
    m.stepN(3);
    expect(listMobs(m.world)).toHaveLength(0);
    // 소환 −100 + 처치 10 × 1.25 = 12 (광부면 특색 돈도 곱해지므로 처치 보상 사건으로 확인)
    const kill = eventsOf(m, 'kill')[0];
    expect(kill?.reward).toBe(12);
    expect(m.state.gold).toBeGreaterThanOrEqual(g0 - 100 + 12);
  });
});

describe('개발용 debugCard 명령 (debug 판에서만)', () => {
  it('debug 판: cards.json 순서 번호의 카드 효과를 바로 적용하고 debugUsed 표시 / 일반 판은 무시', () => {
    const m = arena(1, { debug: true });
    command(m, { type: 'debugCard', c: rules.cards.findIndex((c) => c.id === 'atkAll') });
    expect(m.state.mods[0]?.atkPctBp).toBe(2000);
    expect(m.state.debugUsed).toBe(true);
    const n = arena(1);
    command(n, { type: 'debugCard', c: 0 });
    expect(n.state.mods[0]?.atkPctBp).toBe(0);
    expect(n.state.debugUsed).toBe(false);
  });
});
