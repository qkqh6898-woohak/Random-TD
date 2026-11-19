/**
 * V2.0 PR-A 🔥 불꽃 (flame): 판 밖 재화, 영웅 레벨업에만 쓴다 (예전 골드 자리). 판 결과(도달 웨이브·보스)·웨이브 길·오늘 보너스로 얻는다.
 * 저장 형식 v1 → v2: 불꽃이 없던 예전 계정은 account.legacyFlame을 한 번 받는다 (다른 재화는 그대로).
 * + 검토 M4: 모르는 최상위 필드·데이터에 없는 타워 기록은 들고 다니고, 읽을 수 없거나 새 형식인 저장은 덮어쓰기 전에 백업한다.
 */
import { describe, expect, it } from 'vitest';
import { loadGameData } from '../../src/data/load';
import { loadProgression } from '../../src/meta/progressionData';
import {
  FLAME_VERSION,
  PROGRESS_VERSION,
  buyShopItem,
  checkLevelUp,
  claimDailyBonus,
  claimMilestone,
  levelUpCost,
  levelUpHero,
  newProgress,
  parseProgress,
  progressNeedsBackup,
  refreshDaily,
  serializeProgress,
  settleMatch,
  unlockHidden,
} from '../../src/meta/progress';
import { PROGRESS_KEY, ProgressStore } from '../../src/meta/progressStore';
import { MemoryStorage } from '../../src/save/storage';
import { heroGrid, topBar } from '../../src/ui/lobby/lobbyModel';

const data = loadGameData();
const pd = loadProgression(data);
const fresh = () => newProgress(pd, data, 7);
const tower = (id: string) => data.towers.towers.find((t) => t.id === id)!;
const NOW = () => new Date(2026, 10, 19, 10);

/** 불꽃이 생기기 전(v0.1.19) 저장 글자: 형식 v1, flame 없음 */
function v1Save(): string {
  const s = fresh() as unknown as Record<string, unknown>;
  delete s.flame;
  s.v = 1;
  s.gold = 4321;
  s.gems = 77;
  (s.heroes as Record<string, { level: number; cards: number }>).miner = { level: 5, cards: 9 };
  return JSON.stringify(s);
}

describe('V2.0 PR-A 🔥 불꽃 — 데이터·새 계정', () => {
  it('새 계정은 account.startFlame, 저장 형식 2, 로비 위 띠에 불꽃', () => {
    expect(PROGRESS_VERSION).toBe(2);
    expect(FLAME_VERSION).toBe(2);
    const s = fresh();
    expect(s.flame).toBe(pd.account.startFlame);
    expect(pd.account.startFlame).toBe(100);
    expect(topBar(s, pd).flame).toBe(100);
  });
});

describe('저장 이전 (v1 → v2)', () => {
  it('불꽃이 없는 예전 저장은 legacyFlame(300)을 한 번 받는다 — 골드·보석·영웅은 그대로', () => {
    const back = parseProgress(v1Save(), pd, data, 1);
    expect(pd.account.legacyFlame).toBe(300);
    expect(back.flame).toBe(300);
    expect(back.gold).toBe(4321);
    expect(back.gems).toBe(77);
    expect(back.heroes.miner).toEqual({ level: 5, cards: 9 });
    expect(back.v).toBe(2);
  });

  it('한 번만: 이전한 계정을 저장했다 다시 열면 더 주지 않는다 · v2인데 불꽃이 틀리면 0 (다시 주지 않음)', () => {
    const st = new MemoryStorage();
    st.setItem(PROGRESS_KEY, v1Save());
    const a = new ProgressStore(st, pd, data, { seed: 1, now: NOW });
    expect(a.state.flame).toBe(300);
    const b = new ProgressStore(st, pd, data, { seed: 1, now: NOW });
    expect(b.state.flame).toBe(300);
    const raw = JSON.parse(st.getItem(PROGRESS_KEY)!) as Record<string, unknown>;
    raw.flame = 'x';
    expect(parseProgress(JSON.stringify(raw), pd, data, 1).flame).toBe(0);
    delete raw.flame;
    expect(parseProgress(JSON.stringify(raw), pd, data, 1).flame).toBe(0);
  });

  it('왕복: 불꽃을 저장 → 다시 열기 → 그대로 (parseProgress·serialize·저장소)', () => {
    const st = new MemoryStorage();
    const a = new ProgressStore(st, pd, data, { seed: 3, now: NOW });
    a.state.flame = 777;
    a.devGrant(); // 아무 동작이나 저장 (개발자 지급 = 불꽃 +1000)
    const b = new ProgressStore(st, pd, data, { seed: 3, now: NOW });
    expect(b.state.flame).toBe(1777);
    expect(parseProgress(serializeProgress(b.state), pd, data, 9).flame).toBe(1777);
  });
});

describe('얻기', () => {
  it('판 정산: 도달 웨이브 × 2 + 보스 × 10 (같은 판은 한 번), 0단계는 없음', () => {
    const s = fresh();
    const f0 = s.flame;
    const r = settleMatch(s, pd, data, { runId: 'a', seed: 5, mode: 'infinite', stage: 23, bossKills: 2, summons: 40, merges: 9 }, '2026-11-19')!;
    expect(r.grant.flame).toBe(23 * 2 + 2 * 10);
    expect(s.flame).toBe(f0 + 66);
    expect(settleMatch(s, pd, data, { runId: 'a', seed: 5, mode: 'infinite', stage: 23, bossKills: 2, summons: 40, merges: 9 }, '2026-11-19')).toBeNull();
    expect(s.flame).toBe(f0 + 66);
    const z = settleMatch(s, pd, data, { runId: 'b', seed: 6, mode: 'infinite', stage: 0, bossKills: 0, summons: 0, merges: 0 }, '2026-11-19')!;
    expect(z.grant.flame).toBe(0);
  });

  it('웨이브 길(골드 보상의 1/20)·오늘 모두 완료 보너스(20)로 조금', () => {
    const s = fresh();
    s.bestWave = 10;
    const f0 = s.flame;
    expect(claimMilestone(s, pd, data, 10)!.flame).toBe(15);
    expect(s.flame).toBe(f0 + 15);
    refreshDaily(s, '2026-11-19');
    s.daily.claimed = pd.quests.daily.map((q) => q.id);
    expect(claimDailyBonus(s, pd, data, '2026-11-19')!.flame).toBe(20);
  });
});

describe('쓰기 — 영웅 레벨업에만', () => {
  it('레벨업 = 카드 + 불꽃 (골드·보석 그대로), 상점·해방은 불꽃을 쓰지도 주지도 않는다', () => {
    const s = fresh();
    s.heroes.miner = { level: 1, cards: 10 };
    const gold = s.gold;
    const gems = s.gems;
    const cost = levelUpCost(pd, 'normal', 1)!;
    expect(cost).toEqual({ cards: 2, flame: 10 });
    expect(levelUpHero(s, pd, tower('miner'))).toBe(2);
    expect(s.flame).toBe(pd.account.startFlame - 10);
    expect([s.gold, s.gems]).toEqual([gold, gems]);
    s.gold = 100_000;
    s.gems = 100_000;
    const f = s.flame;
    for (const it of pd.shop) buyShopItem(s, pd, data, it.id);
    expect(s.flame).toBe(f);
    const hidden = data.towers.towers.find((t) => t.grade === 'hidden')!;
    s.heroes[hidden.id] = { level: 0, cards: pd.hidden.unlockFragments };
    expect(unlockHidden(s, pd, hidden)).toBe('ok');
    expect(s.flame).toBe(f);
  });

  it('▲·탭 배지·[모두 레벨업 N]이 같은 규칙: 카드가 모여도 불꽃이 모자라면 셋 다 안 뜬다', () => {
    const s = fresh();
    s.heroes.miner = { level: 1, cards: 2 };
    s.flame = 9;
    let g = heroGrid(s, pd, data, 'heroes', 'grade');
    const miner = g.owned.find((c) => c.id === 'miner')!;
    expect(checkLevelUp(s, pd, tower('miner'))).toBe('flame');
    expect(miner.ready).toBe(false);
    expect(g.ready).toBe(0);
    expect(g.canLevel).toBe(0);
    s.flame = 10;
    g = heroGrid(s, pd, data, 'heroes', 'grade');
    expect(g.owned.find((c) => c.id === 'miner')!.ready).toBe(true);
    expect(g.ready).toBe(1);
    expect(g.canLevel).toBe(1);
  });
});

describe('검토 M4: 저장을 잃지 않는다', () => {
  it('모르는 최상위 필드·데이터에 없는 타워 기록은 왕복해도 남는다', () => {
    const s = fresh() as unknown as Record<string, unknown>;
    s.futureThing = { a: 1 };
    (s.heroes as Record<string, unknown>).retiredTower = { level: 4, cards: 2 };
    const back = parseProgress(JSON.stringify(s), pd, data, 1) as unknown as Record<string, unknown>;
    expect(back.futureThing).toEqual({ a: 1 });
    expect((back.heroes as Record<string, unknown>).retiredTower).toEqual({ level: 4, cards: 2 });
    const again = JSON.parse(serializeProgress(back as never)) as Record<string, unknown>;
    expect(again.futureThing).toEqual({ a: 1 });
  });

  it('읽을 수 없는 저장·새 형식 저장은 덮어쓰기 전에 <키>.bak.<시각>에 백업 · 정상 저장은 백업 안 함', () => {
    expect(progressNeedsBackup(null)).toBe(false);
    expect(progressNeedsBackup('{')).toBe(true);
    expect(progressNeedsBackup('[]')).toBe(true);
    expect(progressNeedsBackup('{"v":"2"}')).toBe(true);
    expect(progressNeedsBackup('{"v":99}')).toBe(true);
    expect(progressNeedsBackup(serializeProgress(fresh()))).toBe(false);
    expect(progressNeedsBackup(v1Save())).toBe(false);
    const st = new MemoryStorage();
    st.setItem(PROGRESS_KEY, '{"v":1,"gold":12');
    const store = new ProgressStore(st, pd, data, { seed: 4, now: NOW });
    expect(store.state.gold).toBe(pd.account.startGold); // 새 계정으로 이어 가되
    expect(st.getItem(`${PROGRESS_KEY}.bak.${NOW().getTime()}`)).toBe('{"v":1,"gold":12'); // 원본은 남는다
    const st2 = new MemoryStorage();
    st2.setItem(PROGRESS_KEY, serializeProgress(fresh()));
    new ProgressStore(st2, pd, data, { seed: 4, now: NOW });
    expect(st2.getItem(`${PROGRESS_KEY}.bak.${NOW().getTime()}`)).toBeNull();
  });

  it('이 앱보다 새 형식(v 99)도 백업하고, 아는 필드는 읽고 모르는 필드·높은 v는 그대로 둔다', () => {
    const s = { ...(fresh() as unknown as Record<string, unknown>), v: 99, flame: 55, newCurrency: 3 };
    const st = new MemoryStorage();
    st.setItem(PROGRESS_KEY, JSON.stringify(s));
    const store = new ProgressStore(st, pd, data, { seed: 4, now: NOW });
    expect(store.state.flame).toBe(55);
    const saved = JSON.parse(st.getItem(PROGRESS_KEY)!) as Record<string, unknown>;
    expect(saved.v).toBe(99);
    expect(saved.newCurrency).toBe(3);
    expect(st.getItem(`${PROGRESS_KEY}.bak.${NOW().getTime()}`)).not.toBeNull();
  });
});
