/**
 * G-3 판 밖 성장 규칙: 계정 레벨, 판 보상 표, 영웅 레벨업 비용, 히든 해방, 웨이브 길, 모집, 퀘스트(날짜 초기화), 상점,
 * 저장 마이그레이션, 판 입력(영웅 레벨 → MatchOptions.levels, 잠긴 히든 → lockedHidden)과 리플레이 호환.
 */
import { describe, expect, it } from 'vitest';
import { loadGameData } from '../../src/data/load';
import { createMatch } from '../../src/sim/match';
import { placeTower } from '../../src/sim/systems/Summon';
import { towerBonus } from '../../src/sim/systems/Aura';
import { matchInputs, replayMatchOptions, validateReplay, recordReplay } from '../../src/sim/replay';
import { isHiddenLocked } from '../../src/sim/unlocks';
import { MemoryStorage } from '../../src/save/storage';
import { loadProgression, parseProgression, type ProgressionData } from '../../src/meta/progressionData';
import {
  achievementQuests,
  addXp,
  claimAllQuests,
  claimableQuests,
  buyShopItem,
  cardsForStage,
  checkLevelUp,
  claimDailyBonus,
  claimAllMilestones,
  claimMilestone,
  claimQuest,
  claimRecruit,
  dailyQuests,
  heroAtkBonusBp,
  heroLevelSum,
  heroMatchLevels,
  isHiddenUnlocked,
  levelUpCost,
  levelUpHero,
  lockedHiddenIds,
  matchRewardSpec,
  milestoneState,
  readyMilestones,
  newProgress,
  parseProgress,
  refreshDaily,
  rollCards,
  serializeProgress,
  settleMatch,
  unlockHidden,
  xpToNext,
  type MatchResult,
  type ProgressState,
} from '../../src/meta/progress';
import { ProgressStore, PROGRESS_KEY, PROGRESS_KEY_DEV, localDateKey, readLegacy } from '../../src/meta/progressStore';
import { Rng } from '../../src/sim/Rng';

const data = loadGameData();
const pd: ProgressionData = loadProgression(data);
const tower = (id: string) => data.towers.towers.find((t) => t.id === id)!;
const fresh = (): ProgressState => newProgress(pd, data, 12345);
const result = (o: Partial<MatchResult> = {}): MatchResult => ({ runId: 'r1', seed: 77, mode: 'infinite', stage: 20, bossKills: 2, summons: 60, merges: 12, ...o });
const TODAY = '2026-11-17';

describe('데이터 (progression.json)', () => {
  it('번들 데이터가 검사를 통과하고, 영웅 최대 레벨은 sim 타워 레벨 최대 이하', () => {
    expect(pd.heroes.maxLevel).toBeLessThanOrEqual(data.game.towerLevel.max);
    expect(pd.heroes.cards).toHaveLength(pd.heroes.maxLevel - 1);
  });
  it('틀린 값은 파일 + 필드 경로로 거절', () => {
    const bad = structuredClone(pd) as unknown as Record<string, unknown>;
    (bad.heroes as { maxLevel: number }).maxLevel = 99;
    expect(() => parseProgression(bad, data)).toThrow(/progression\.json.*heroes\.maxLevel/s);
    const bad2 = structuredClone(pd);
    bad2.shop[0]!.price = { gold: 1, gems: 1 };
    expect(() => parseProgression(bad2, data)).toThrow(/shop\[0\]\.price/);
    const bad3 = structuredClone(pd);
    bad3.matchRewards.cardsByStage = [[10, 5], [5, 6]];
    expect(() => parseProgression(bad3, data)).toThrow(/오름차순/);
  });
});

describe('계정 레벨', () => {
  it('다음 레벨까지 100 + 50 × (Lv − 1), 여러 번 오르고 레벨마다 보석 +10 (10레벨 +50 추가)', () => {
    expect(xpToNext(pd, 1)).toBe(100);
    expect(xpToNext(pd, 10)).toBe(550);
    const s = fresh();
    const gems = s.gems;
    const g = addXp(s, pd, 100 + 150 + 30);
    expect(s.level).toBe(3);
    expect(s.xp).toBe(30);
    expect(g.levelUps).toEqual([2, 3]);
    expect(s.gems).toBe(gems + 20);
    const s2 = fresh();
    s2.level = 9;
    addXp(s2, pd, xpToNext(pd, 9));
    expect(s2.level).toBe(10);
    expect(s2.gems).toBe(pd.account.startGems + 60);
  });
});

describe('판 보상 표', () => {
  it('단계·보스·최고 기록 → 경험치·골드·카드·조각 (0단계 패배는 없음)', () => {
    expect(matchRewardSpec(pd, 0, 0, false)).toEqual({ xp: 0, gold: 0, cards: 0, fragments: 0 });
    expect(matchRewardSpec(pd, 20, 2, true)).toEqual({ xp: 200 + 100 + 100, gold: 400 + 200, cards: 8, fragments: 2 });
    expect(cardsForStage(pd, 1)).toBe(2);
    expect(cardsForStage(pd, 9)).toBe(3);
    expect(cardsForStage(pd, 49)).toBe(14);
    expect(cardsForStage(pd, 150)).toBe(30);
  });
  it('정산: 같은 판 결과면 같은 카드, runId는 한 번만, 최고 웨이브·누적·오늘 기록·모집 게이지', () => {
    const a = fresh();
    const b = fresh();
    const ra = settleMatch(a, pd, data, result(), TODAY)!;
    const rb = settleMatch(b, pd, data, result({ runId: 'other' }), TODAY)!;
    expect(ra.grant.cards).toEqual(rb.grant.cards);
    expect(ra.grant.cards.reduce((s, c) => s + c.n, 0)).toBe(8);
    expect(ra.grant.fragments.reduce((s, c) => s + c.n, 0)).toBe(2);
    expect(ra.grant.gold).toBe(600);
    expect(ra.newBest).toBe(true);
    expect(a.bestWave).toBe(20);
    expect(a.totals).toMatchObject({ matches: 1, summons: 60, merges: 12, bossKills: 2, bestWave: 20 });
    expect(a.daily.stats.matches).toBe(1);
    expect(ra.recruitGain).toBe(12);
    expect(a.recruit).toBe(12);
    expect(settleMatch(a, pd, data, result(), TODAY)).toBeNull();
    // 다른 시드면 (아마) 다른 카드 — 굴림은 판 시드에서
    const c = fresh();
    const rc = settleMatch(c, pd, data, result({ seed: 99999 }), TODAY)!;
    expect(rc.grant.cards).not.toEqual(ra.grant.cards);
    // 더 낮은 단계: 최고 기록 그대로, 경험치 보너스 없음
    const r2 = settleMatch(a, pd, data, result({ runId: 'r2', stage: 5, bossKills: 0 }), TODAY)!;
    expect(r2.newBest).toBe(false);
    expect(r2.grant.xp).toBe(50);
    expect(a.bestWave).toBe(20);
    // 캠페인은 최고 웨이브를 바꾸지 않는다
    settleMatch(a, pd, data, result({ runId: 'r3', mode: 'campaign', stage: 30 }), TODAY);
    expect(a.bestWave).toBe(20);
  });
  it('모집 게이지: 소환 나머지는 다음 판으로, 30칸이면 받기 (넘친 칸은 이어짐)', () => {
    const s = fresh();
    settleMatch(s, pd, data, result({ summons: 7 }), TODAY);
    expect([s.recruit, s.recruitSummons]).toEqual([1, 2]);
    settleMatch(s, pd, data, result({ runId: 'x', summons: 3 }), TODAY);
    expect([s.recruit, s.recruitSummons]).toEqual([2, 0]);
    expect(claimRecruit(s, pd, data)).toBeNull();
    s.recruit = 33;
    const g = claimRecruit(s, pd, data)!;
    expect(s.recruit).toBe(3);
    expect(g.cards.reduce((a, c) => a + c.n, 0)).toBe(5);
    expect(g.gems).toBe(10);
  });
  it('카드 굴림: 가중치 등급의 타워만, 히든은 나오지 않음', () => {
    const list = rollCards(new Rng(5), data, { legend: 1 }, 50);
    expect(list.every((c) => tower(c.id).grade === 'legend')).toBe(true);
    expect(list.reduce((a, c) => a + c.n, 0)).toBe(50);
    const mixed = rollCards(new Rng(6), data, pd.matchRewards.cardGradeWeights, 500);
    expect(mixed.some((c) => tower(c.id).grade === 'hidden' || tower(c.id).grade === 'god')).toBe(false);
  });
});

describe('영웅 레벨업', () => {
  it('비용 표: 등급별 카드 %(올림, 최소 1)·골드 %(내림), 최대 레벨이면 없음', () => {
    expect(levelUpCost(pd, 'normal', 1)).toEqual({ cards: 2, gold: 100 });
    expect(levelUpCost(pd, 'rare', 2)).toEqual({ cards: 3, gold: 225 });
    expect(levelUpCost(pd, 'legend', 1)).toEqual({ cards: 1, gold: 400 });
    expect(levelUpCost(pd, 'hero', 14)).toEqual({ cards: 30, gold: 9900 });
    expect(levelUpCost(pd, 'hidden', 3)).toEqual({ cards: 2, gold: 1000 });
    expect(levelUpCost(pd, 'normal', 15)).toBeNull();
    expect(levelUpCost(pd, 'normal', 0)).toBeNull();
  });
  it('카드 + 골드를 쓰고 레벨이 오른다 / 부족·미보유·최대면 그대로', () => {
    const s = fresh();
    const miner = tower('miner');
    expect(checkLevelUp(s, pd, miner)).toBe('cards');
    s.heroes.miner!.cards = 5;
    s.gold = 50;
    expect(levelUpHero(s, pd, miner)).toBe('gold');
    s.gold = 1000;
    expect(levelUpHero(s, pd, miner)).toBe(2);
    expect(s.heroes.miner).toEqual({ level: 2, cards: 3 });
    expect(s.gold).toBe(900);
    expect(levelUpHero(s, pd, tower('drummer'))).toBe('notOwned');
    s.heroes.miner = { level: 15, cards: 999 };
    expect(levelUpHero(s, pd, miner)).toBe('max');
  });
  it('카드가 처음 들어온 영웅은 첫 장으로 영입(Lv1), 나머지는 카드', () => {
    const s = fresh();
    expect(s.heroes.drummer!.level).toBe(0);
    s.gems = 10000;
    const bought = buyShopItem(s, pd, data, 'pack-basic');
    if (typeof bought === 'string') throw new Error(bought);
    const got = bought.cards;
    for (const c of got) {
      const e = s.heroes[c.id]!;
      expect(e.level).toBeGreaterThanOrEqual(1);
      if (c.isNew) expect(e.cards).toBe(c.n - 1);
    }
  });
  it('판 입력: Lv2 이상만, 키 정렬, sim이 레벨당 공격력 +4%를 준다 (Lv1뿐이면 빈 객체 = 예전과 같음)', () => {
    const s = fresh();
    expect(heroMatchLevels(s, pd, data)).toEqual({});
    s.heroes.miner!.level = 3;
    s.heroes.archer!.level = 2;
    const lv = heroMatchLevels(s, pd, data);
    expect(Object.keys(lv)).toEqual(['archer', 'miner']);
    expect(heroAtkBonusBp(3, data)).toBe(800);
    expect(heroAtkBonusBp(1, data)).toBe(0);
    const m = createMatch(data, { seed: 1, mode: 'infinite', levels: [lv] });
    const [x, y] = m.map.buildable[0]!;
    const t = placeTower(m.world, 'miner', 0, x, y);
    expect(towerBonus(m.ctx, t, new Map()).atkPctBp).toBe(800);
    expect(matchInputs(m).levels).toEqual([{ archer: 2, miner: 3 }]);
    expect(heroLevelSum(s)).toBe(25 + 2 + 1);
  });
});

describe('히든(리미티드) 영웅 해방', () => {
  const hidden = data.towers.towers.filter((t) => t.grade === 'hidden');
  it('처음엔 히든 12종 모두 잠김, 조각 unlockFragments개(피드백 #59: 5개)로 해방(조각 소비) → 잠긴 목록에서 빠짐', () => {
    const s = fresh();
    expect(lockedHiddenIds(s, data)).toHaveLength(hidden.length);
    const h = hidden[0]!;
    expect(isHiddenUnlocked(s, h.id, data)).toBe(false);
    expect(isHiddenUnlocked(s, 'miner', data)).toBe(true);
    expect(pd.hidden.unlockFragments).toBe(5);
    s.heroes[h.id]!.cards = 4;
    expect(unlockHidden(s, pd, h)).toBe('fragments');
    s.heroes[h.id]!.cards = 8;
    expect(unlockHidden(s, pd, h)).toBe('ok');
    expect(s.heroes[h.id]).toEqual({ level: 1, cards: 3 });
    expect(isHiddenUnlocked(s, h.id, data)).toBe(true);
    expect(lockedHiddenIds(s, data)).not.toContain(h.id);
    expect(unlockHidden(s, pd, h)).toBe('unlocked');
    expect(unlockHidden(s, pd, tower('miner'))).toBe('notHidden');
  });
  it('조각은 잠긴 히든에게만 간다 (보스 처치 보상)', () => {
    const s = fresh();
    const keep = hidden[1]!.id;
    for (const h of hidden) if (h.id !== keep) s.heroes[h.id]!.level = 1;
    const r = settleMatch(s, pd, data, result({ bossKills: 4 }), TODAY)!;
    expect(r.grant.fragments).toEqual([{ id: keep, n: 4 }]);
  });
  it('판 입력 lockedHidden: sim에 얼려 들어가고 리플레이 입력에 기록 (아무도 안 잠기면 필드 없음 = 예전 파일 모양)', () => {
    const s = fresh();
    const locked = lockedHiddenIds(s, data);
    const m = createMatch(data, { seed: 3, mode: 'infinite', lockedHidden: [locked] });
    expect(isHiddenLocked(m.ctx, 0, locked[0]!)).toBe(true);
    expect(isHiddenLocked(m.ctx, 0, 'miner')).toBe(false);
    expect(matchInputs(m).lockedHidden).toEqual([locked]);
    const again = createMatch(data, replayMatchOptions(matchInputs(m)));
    expect(isHiddenLocked(again.ctx, 0, locked[0]!)).toBe(true);
    const plain = createMatch(data, { seed: 3, mode: 'infinite' });
    expect('lockedHidden' in matchInputs(plain)).toBe(false);
    expect(isHiddenLocked(plain.ctx, 0, locked[0]!)).toBe(false);
    // 같은 시드 = 같은 해시 (잠금은 해시 밖)
    m.stepN(200);
    plain.stepN(200);
    expect(m.hash()).toBe(plain.hash());
    expect(() => createMatch(data, { seed: 3, mode: 'infinite', lockedHidden: [['miner']] })).toThrow(/히든 타워가 아니다/);
    const rep = recordReplay(data, m, { name: 'x' });
    expect(validateReplay(rep)).toBeNull();
    expect(validateReplay({ ...rep, lockedHidden: [[1]] })).toMatch(/lockedHidden/);
  });
});

describe('웨이브 길', () => {
  it('최고 웨이브 이하 = 받기, 한 번만, 넘지 못한 곳 = 잠김', () => {
    const s = fresh();
    s.bestWave = 25;
    expect(milestoneState(s, 10)).toBe('ready');
    expect(milestoneState(s, 30)).toBe('locked');
    const g = claimMilestone(s, pd, data, 10)!;
    expect(g.gold).toBe(300);
    expect(g.cards.reduce((a, c) => a + c.n, 0)).toBe(3);
    expect(milestoneState(s, 10)).toBe('claimed');
    expect(claimMilestone(s, pd, data, 10)).toBeNull();
    expect(claimMilestone(s, pd, data, 30)).toBeNull();
    const f = claimMilestone(s, pd, data, 20)!;
    expect(f.fragments.reduce((a, c) => a + c.n, 0)).toBe(3);
  });
  it('모두 받기 (피드백 #57): 받을 수 있는 이정표를 낮은 웨이브부터 한 번에, 하나씩 받은 것과 같은 결과', () => {
    const setup = (): ProgressState => {
      const s = fresh();
      s.bestWave = 45;
      claimMilestone(s, pd, data, 20);
      return s;
    };
    const one = setup();
    const ready = pd.waveRoad.milestones.filter((m) => milestoneState(one, m.wave) === 'ready').map((m) => m.wave);
    expect(ready).toEqual([10, 30, 40]);
    expect(readyMilestones(one, pd)).toBe(3);
    let gold = 0;
    let gems = 0;
    let cards = 0;
    let frags = 0;
    for (const w of ready) {
      const g = claimMilestone(one, pd, data, w)!;
      gold += g.gold;
      gems += g.gems;
      cards += g.cards.reduce((a, c) => a + c.n, 0);
      frags += g.fragments.reduce((a, c) => a + c.n, 0);
    }
    const all = setup();
    const r = claimAllMilestones(all, pd, data)!;
    expect(r.waves).toEqual([10, 30, 40]);
    expect(all).toEqual(one);
    expect(r.grant.gold).toBe(gold);
    expect(r.grant.gems).toBe(gems);
    expect(r.grant.cards.reduce((a, c) => a + c.n, 0)).toBe(cards);
    expect(r.grant.fragments.reduce((a, c) => a + c.n, 0)).toBe(frags);
    expect(readyMilestones(all, pd)).toBe(0);
    expect(milestoneState(all, 50)).toBe('locked');
    // 더 받을 것이 없으면 null (상태 그대로)
    const before = structuredClone(all);
    expect(claimAllMilestones(all, pd, data)).toBeNull();
    expect(all).toEqual(before);
  });
});

describe('퀘스트', () => {
  it('일일: 날짜가 바뀌면 초기화, 시계를 과거로 돌리면 오늘 기록을 세지 않음, 모두 받으면 보너스', () => {
    const s = fresh();
    refreshDaily(s, TODAY);
    settleMatch(s, pd, data, result({ stage: 15, summons: 50, merges: 10 }), TODAY);
    const qs = dailyQuests(s, pd, TODAY);
    expect(qs.every((q) => q.done && !q.claimed)).toBe(true);
    for (const q of qs) expect(claimQuest(s, pd, data, q.quest.id, TODAY)).not.toBeNull();
    expect(claimQuest(s, pd, data, 'd-play', TODAY)).toBeNull();
    const bonus = claimDailyBonus(s, pd, data, TODAY)!;
    expect(bonus.gems).toBe(20);
    expect(claimDailyBonus(s, pd, data, TODAY)).toBeNull();
    // 다음 날: 초기화
    expect(refreshDaily(s, '2026-11-18')).toBe(true);
    expect(dailyQuests(s, pd, '2026-11-18').some((q) => q.done)).toBe(false);
    // 과거로: 비우지 않고 세지 않음
    expect(refreshDaily(s, '2026-11-10')).toBe(false);
    settleMatch(s, pd, data, result({ runId: 'past' }), '2026-11-10');
    expect(s.daily.date).toBe('2026-11-18');
    expect(s.daily.stats.matches).toBe(0);
    // 다음 날 기록은 보이지 않는 날짜면 0
    expect(dailyQuests(s, pd, '2026-11-19').every((q) => q.progress === 0)).toBe(true);
  });
  it('업적: 누적 기록, 한 번만, 영웅 레벨 합계', () => {
    const s = fresh();
    for (let i = 0; i < 3; i++) settleMatch(s, pd, data, result({ runId: `m${i}` }), TODAY);
    const a = achievementQuests(s, pd);
    expect(a.find((q) => q.quest.id === 'a-play-3')!.done).toBe(true);
    expect(a.find((q) => q.quest.id === 'a-play-10')!.progress).toBe(3);
    expect(claimQuest(s, pd, data, 'a-play-3', TODAY)!.gems).toBe(20);
    expect(claimQuest(s, pd, data, 'a-play-3', TODAY)).toBeNull();
    expect(achievementQuests(s, pd).find((q) => q.quest.id === 'a-hero-120')!.progress).toBe(heroLevelSum(s));
    expect(heroLevelSum(fresh())).toBe(25);
  });
  it('모두 받기 (피드백 #11): 받을 수 있는 일일·보너스·업적을 한 번에, 하나씩 받은 것과 같은 결과', () => {
    const setup = (): ProgressState => {
      const s = fresh();
      refreshDaily(s, TODAY);
      for (let i = 0; i < 3; i++) settleMatch(s, pd, data, result({ runId: `m${i}`, stage: 15, summons: 50, merges: 10 }), TODAY);
      return s;
    };
    const one = setup();
    const n = claimableQuests(one, pd, TODAY);
    expect(n).toBeGreaterThan(pd.quests.daily.length + 1);
    // 하나씩: 일일(데이터 순) → 오늘 보너스 → 업적(데이터 순), 카드로 새 영웅이 생겨 끝난 '영웅 레벨 합계' 업적까지
    let gold = 0;
    let gems = 0;
    let rounds = 0;
    while (claimableQuests(one, pd, TODAY) > 0) {
      rounds++;
      const gs = [
        ...dailyQuests(one, pd, TODAY).filter((x) => x.done && !x.claimed).map((q) => claimQuest(one, pd, data, q.quest.id, TODAY)),
        claimDailyBonus(one, pd, data, TODAY),
      ];
      for (const q of achievementQuests(one, pd).filter((x) => x.done && !x.claimed)) gs.push(claimQuest(one, pd, data, q.quest.id, TODAY));
      for (const g of gs) {
        gold += g?.gold ?? 0;
        gems += g?.gems ?? 0;
      }
    }
    expect(rounds).toBeGreaterThan(1);
    const all = setup();
    const g = claimAllQuests(all, pd, data, TODAY)!;
    expect(all).toEqual(one);
    expect(g.gold).toBe(gold);
    expect(g.gems).toBe(gems);
    expect(claimableQuests(all, pd, TODAY)).toBe(0);
    expect(all.daily.bonusClaimed).toBe(true);
    // 더 받을 것이 없으면 null (상태 그대로)
    const before = structuredClone(all);
    expect(claimAllQuests(all, pd, data, TODAY)).toBeNull();
    expect(all).toEqual(before);
  });
  it('모두 받기: 일일 일부만 끝났으면 보너스는 받지 않는다', () => {
    const s = fresh();
    refreshDaily(s, TODAY);
    settleMatch(s, pd, data, result({ stage: 1, summons: 0, merges: 0, bossKills: 0 }), TODAY);
    const ready = dailyQuests(s, pd, TODAY).filter((q) => q.done).map((q) => q.quest.id);
    expect(ready.length).toBeGreaterThan(0);
    expect(ready.length).toBeLessThan(pd.quests.daily.length);
    expect(claimAllQuests(s, pd, data, TODAY)).not.toBeNull();
    expect(s.daily.claimed).toEqual([...ready].sort());
    expect(s.daily.bonusClaimed).toBe(false);
  });
});

describe('상점 (게임 안 화폐만)', () => {
  it('골드·보석이 모자라면 못 사고, 사면 값만큼 줄고 내용이 들어온다', () => {
    const s = fresh();
    s.gold = 799;
    expect(buyShopItem(s, pd, data, 'pack-basic')).toBe('gold');
    s.gold = 800;
    const g = buyShopItem(s, pd, data, 'pack-basic');
    expect(typeof g).toBe('object');
    expect(s.gold).toBe(0);
    s.gems = 40;
    const bag = buyShopItem(s, pd, data, 'gold-bag');
    expect(s.gold).toBe(2000);
    expect(s.gems).toBe(0);
    expect(typeof bag).toBe('object');
    expect(buyShopItem(s, pd, data, 'fragments')).toBe('gems');
    expect(buyShopItem(s, pd, data, 'nope')).toBe('unknown');
    // 계정 굴림 번호로 굴린다 → 같은 저장이면 같은 결과
    const a = fresh();
    const b = fresh();
    a.gems = b.gems = 1000;
    expect(buyShopItem(a, pd, data, 'pack-fine')).toEqual(buyShopItem(b, pd, data, 'pack-fine'));
  });
  it('가격은 gold·gems 하나, 실제 돈 상품은 없다', () => {
    for (const it of pd.shop) {
      expect(Object.keys(it.price)).toHaveLength(1);
      expect(['gold', 'gems']).toContain(Object.keys(it.price)[0]);
    }
  });
});

describe('저장 · 마이그레이션', () => {
  it('키가 없으면 rtd.account 레벨·rtd.records 최고 단계를 옮기고, 예전 키는 그대로', () => {
    const st = new MemoryStorage();
    const acc = JSON.stringify({ v: 1, level: 4, hidden: ['h1'], guides: ['firstMerge'] });
    const rec = JSON.stringify({ version: 2, bestStage: 33, bossClears: {}, bestChallenge: 0, recent: [] });
    st.setItem('rtd.account', acc);
    st.setItem('rtd.records', rec);
    st.setItem('rtd.settings', '{"v":1,"tapMerge":false}');
    expect(readLegacy(st)).toEqual({ level: 4, bestWave: 33 });
    const store = new ProgressStore(st, pd, data, { seed: 1, now: () => new Date(2026, 10, 17, 9) });
    expect(store.created).toBe(true);
    expect(store.level()).toBe(4);
    expect(store.state.bestWave).toBe(33);
    expect(st.getItem('rtd.account')).toBe(acc);
    expect(st.getItem('rtd.records')).toBe(rec);
    expect(st.getItem('rtd.settings')).toBe('{"v":1,"tapMerge":false}');
    expect(JSON.parse(st.getItem(PROGRESS_KEY)!).v).toBe(1);
    // 다시 열면 저장된 값 (옮기지 않음)
    st.setItem('rtd.account', JSON.stringify({ v: 1, level: 9 }));
    const again = new ProgressStore(st, pd, data, { seed: 2 });
    expect(again.created).toBe(false);
    expect(again.level()).toBe(4);
    expect(again.state.seed).toBe(store.state.seed);
  });
  it('개발자 계정은 따로 (rtd.progress.dev), 예전 기록을 옮기지 않는다', () => {
    const st = new MemoryStorage();
    st.setItem('rtd.account', JSON.stringify({ v: 1, level: 5 }));
    const dev = new ProgressStore(st, pd, data, { dev: true, seed: 1 });
    expect(dev.key).toBe(PROGRESS_KEY_DEV);
    expect(dev.level()).toBe(1);
    expect(st.getItem(PROGRESS_KEY)).toBeNull();
    dev.devGrant();
    expect(dev.state.gold).toBeGreaterThan(10000);
    expect(dev.matchOptions(true).lockedHidden).toBeUndefined();
  });
  it('망가진 값은 새 계정, 틀린 필드만 기본값, 모르는 타워는 버리고 새 타워는 미보유', () => {
    expect(parseProgress('{', pd, data, 1).level).toBe(1);
    expect(parseProgress('[]', pd, data, 1).gold).toBe(pd.account.startGold);
    const s = fresh();
    s.gold = 4321;
    s.heroes.ghost = { level: 3, cards: 1 };
    delete s.heroes.drummer;
    const raw = JSON.parse(serializeProgress(s)) as Record<string, unknown>;
    raw.gems = -5;
    raw.claimedWaves = [10, 'x', 10, 20];
    const back = parseProgress(JSON.stringify(raw), pd, data, 1);
    expect(back.gold).toBe(4321);
    expect(back.gems).toBe(0);
    expect(back.claimedWaves).toEqual([10, 20]);
    expect(back.heroes.ghost).toBeUndefined();
    expect(back.heroes.drummer).toEqual({ level: 0, cards: 0 });
    expect(back.heroes.miner).toEqual({ level: 1, cards: 0 });
  });
  it('저장소: 동작마다 저장하고 구독자에게 알림, 판 입력', () => {
    const st = new MemoryStorage();
    const store = new ProgressStore(st, pd, data, { seed: 9, now: () => new Date(2026, 10, 17) });
    expect(store.today()).toBe('2026-11-17');
    expect(localDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    let calls = 0;
    store.subscribe(() => calls++);
    const r = store.settle(result())!;
    expect(r.grant.xp).toBeGreaterThan(0);
    expect(calls).toBe(1);
    expect(store.settle(result())).toBeNull();
    expect(calls).toBe(1);
    expect(JSON.parse(st.getItem(PROGRESS_KEY)!).bestWave).toBe(20);
    const opts = store.matchOptions(false);
    expect(opts.lockedHidden![0]).toHaveLength(12);
    expect(opts.levels).toEqual([{}]);
  });
  it('저장소 웨이브 길 모두 받기 (피드백 #57): 한 번 저장·알림, 받을 것이 없으면 알림 없음', () => {
    const st = new MemoryStorage();
    const store = new ProgressStore(st, pd, data, { seed: 9, now: () => new Date(2026, 10, 17) });
    store.settle(result({ stage: 25 }));
    let calls = 0;
    store.subscribe(() => calls++);
    expect(store.claimAllMilestones()!.waves).toEqual([10, 20]);
    expect(calls).toBe(1);
    expect(JSON.parse(st.getItem(PROGRESS_KEY)!).claimedWaves).toEqual([10, 20]);
    expect(store.claimAllMilestones()).toBeNull();
    expect(calls).toBe(1);
  });
  it('저장소 모두 받기: 받으면 한 번 저장·알림, 받을 것이 없으면 알림 없음', () => {
    const st = new MemoryStorage();
    const store = new ProgressStore(st, pd, data, { seed: 9, now: () => new Date(2026, 10, 17) });
    store.settle(result({ stage: 15, summons: 50, merges: 10 }));
    let calls = 0;
    store.subscribe(() => calls++);
    expect(store.claimAllQuests()).not.toBeNull();
    expect(calls).toBe(1);
    expect(JSON.parse(st.getItem(PROGRESS_KEY)!).daily.bonusClaimed).toBe(true);
    expect(store.claimAllQuests()).toBeNull();
    expect(calls).toBe(1);
  });
});
