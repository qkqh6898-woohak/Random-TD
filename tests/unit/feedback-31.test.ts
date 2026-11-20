/**
 * 피드백 #31 '영웅 레벨업도 한번에 할수있고 정렬 기능도 넣어줘' (본문·판 기록 없음 → 리플레이 재현 대상 없음).
 * - 로비 [영웅] 탭 [⬆ 모두 레벨업]: 지금 탭의 보유 영웅을 보이는 순서대로 한 레벨씩 돌아가며, 더 못 올릴 때까지.
 * - 정렬: 기존 [등급 순]/[레벨 순]에 [레벨업 가능] (카드가 모인 영웅 먼저) 추가.
 */
import { describe, expect, it } from 'vitest';
import { loadGameData } from '../../src/data/load';
import { loadProgression } from '../../src/meta/progressionData';
import { checkLevelUp, levelUpAllHeroes, levelUpHero, newProgress } from '../../src/meta/progress';
import { ProgressStore } from '../../src/meta/progressStore';
import { MemoryStorage } from '../../src/save/storage';
import { heroGrid } from '../../src/ui/lobby/lobbyModel';

const data = loadGameData();
const pd = loadProgression(data);
const fresh = () => newProgress(pd, data, 7);
const tower = (id: string) => data.towers.towers.find((t) => t.id === id)!;

describe('피드백 #31: 영웅 모두 레벨업', () => {
  it('하나씩 누른 것과 같은 결과 (돌아가며 한 레벨씩), 🔥 불꽃·카드 합계를 돌려준다 (V2.0 PR-A: 골드 → 불꽃)', () => {
    const a = fresh();
    a.flame = 100;
    a.heroes.miner = { level: 1, cards: 20 }; // Lv1→2 카드 2·불꽃 10, 2→3 3·15, 3→4 4·20 …
    a.heroes.archer = { level: 1, cards: 2 };
    const b = structuredClone(a);
    const order = [tower('miner'), tower('archer')];
    const r = levelUpAllHeroes(a, pd, order);
    // 손으로: miner, archer, miner, (archer 카드 없음), miner …
    let changed = true;
    while (changed) {
      changed = false;
      for (const t of order) if (typeof levelUpHero(b, pd, t) === 'number') changed = true;
    }
    expect(a).toEqual(b);
    expect(a.heroes.archer!.level).toBe(2);
    expect(r.ups).toEqual([
      { id: 'miner', from: 1, to: a.heroes.miner!.level },
      { id: 'archer', from: 1, to: 2 },
    ]);
    expect(r.flame).toBe(100 - a.flame);
    expect(r.cards).toBe(20 - a.heroes.miner!.cards + 2);
    expect(checkLevelUp(a, pd, tower('miner'))).not.toBe('ok');
  });

  it('불꽃이 모자라면 앞 영웅이 다 가져가지 않고 돌아가며 한 레벨씩', () => {
    const s = fresh();
    s.flame = 20;
    s.heroes.miner = { level: 1, cards: 50 };
    s.heroes.archer = { level: 1, cards: 50 };
    const r = levelUpAllHeroes(s, pd, [tower('miner'), tower('archer')]);
    expect(s.heroes.miner!.level).toBe(2);
    expect(s.heroes.archer!.level).toBe(2);
    expect(s.flame).toBe(0);
    expect(r.ups).toHaveLength(2);
  });

  it('올릴 영웅이 없으면 아무것도 바꾸지 않는다 (보유하지 않음·최고 레벨 포함)', () => {
    const s = fresh();
    s.flame = 99999;
    s.heroes.miner = { level: pd.heroes.maxLevel, cards: 999 };
    const before = structuredClone(s);
    const r = levelUpAllHeroes(s, pd, [tower('miner'), tower('drummer')]);
    expect(r).toEqual({ ups: [], flame: 0, cards: 0 });
    expect(s).toEqual(before);
  });

  it('저장소: 지금 탭에 보이는 순서(id 목록)대로 올리고 한 번 저장·알림, 다른 탭은 그대로', () => {
    const store = new ProgressStore(new MemoryStorage(), pd, data, { seed: 7, now: () => new Date(2026, 10, 17) });
    store.state.flame = 100000;
    store.state.heroes.miner = { level: 1, cards: 4 };
    const hidden = data.towers.towers.find((t) => t.grade === 'hidden')!;
    store.state.heroes[hidden.id] = { level: 1, cards: 10 };
    let calls = 0;
    store.subscribe(() => calls++);
    const ids = () => heroGrid(store.state, pd, data, 'heroes', 'grade').owned.map((c) => c.id);
    const r = store.levelUpAll(ids());
    expect(calls).toBe(1);
    expect(r.ups.map((u) => u.id)).toContain('miner');
    expect(store.state.heroes.miner!.level).toBe(2);
    expect(store.state.heroes[hidden.id]!.level).toBe(1);
    expect(store.levelUpAll(ids()).ups).toEqual([]);
    expect(calls).toBe(1);
  });

  it('탭 버튼 수 = 지금 바로 올릴 수 있는 영웅 수 (카드 + 🔥 불꽃) · ▲·탭 배지도 같은 규칙 (V2.0 PR-A)', () => {
    const s = fresh();
    s.flame = 10;
    s.heroes.miner = { level: 1, cards: 2 };
    s.heroes.archer = { level: 1, cards: 2 };
    const g = heroGrid(s, pd, data, 'heroes', 'grade');
    expect(g.ready).toBe(2);
    expect(g.canLevel).toBe(2);
    s.flame = 0;
    expect(heroGrid(s, pd, data, 'heroes', 'grade').canLevel).toBe(0);
    expect(heroGrid(s, pd, data, 'heroes', 'grade').ready).toBe(0); // 예전엔 카드만 보고 ▲가 떠 버튼과 어긋났다
  });
});

describe('피드백 #31: 정렬 [레벨업 가능]', () => {
  it('카드가 모인 영웅이 먼저, 그 안·밖은 등급 순', () => {
    const s = fresh();
    s.heroes.miner = { level: 1, cards: 2 };
    s.heroes.archer = { level: 1, cards: 2 };
    const owned = heroGrid(s, pd, data, 'heroes', 'ready').owned;
    expect(owned.slice(0, 2).map((c) => c.id).sort()).toEqual(['archer', 'miner']);
    expect(owned.slice(2).every((c) => !c.ready)).toBe(true);
    const byGrade = heroGrid(s, pd, data, 'heroes', 'grade').owned.filter((c) => !c.ready).map((c) => c.id);
    expect(owned.slice(2).map((c) => c.id)).toEqual(byGrade);
  });
});
