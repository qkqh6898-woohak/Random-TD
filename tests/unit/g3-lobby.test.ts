/**
 * G-3 로비 화면 모델 (순수): 영웅 격자·정렬·탭, 상세(비용·보너스), 웨이브 길, 리미티드 조각, 정산 요약.
 */
import { describe, expect, it } from 'vitest';
import { loadGameData } from '../../src/data/load';
import { loadProgression } from '../../src/meta/progressionData';
import { newProgress, settleMatch } from '../../src/meta/progress';
import { codexReady, fragmentRows, grantLine, heroDetail, heroGrid, heroesReady, settlementView, tabOf, topBar, waveRoad } from '../../src/ui/lobby/lobbyModel';

const data = loadGameData();
const pd = loadProgression(data);
const fresh = () => newProgress(pd, data, 7);

describe('영웅 격자', () => {
  it('[영웅] 탭 = 노말~레전드 50종, [리미티드] 탭 = 히든 12 + 신 3, 모든 타워가 어느 한 탭에', () => {
    const s = fresh();
    const a = heroGrid(s, pd, data, 'heroes', 'grade');
    const b = heroGrid(s, pd, data, 'mythic', 'grade');
    expect(a.owned.length + a.unowned.length).toBe(50);
    expect(b.owned.length + b.unowned.length).toBe(15);
    expect(a.owned.length + a.unowned.length + b.owned.length + b.unowned.length).toBe(data.towers.towers.length);
    expect(a.owned).toHaveLength(25);
    expect(b.owned).toHaveLength(0);
    expect(b.unowned.filter((c) => c.locked)).toHaveLength(12);
    expect(tabOf('hidden')).toBe('mythic');
    expect(tabOf('rare')).toBe('heroes');
  });
  it('등급 순 = 높은 등급 먼저(같으면 데이터 순서), 레벨 순 = 높은 레벨 먼저', () => {
    const s = fresh();
    s.heroes.miner!.level = 5;
    s.heroes.archer!.level = 3;
    const byGrade = heroGrid(s, pd, data, 'heroes', 'grade').owned;
    expect(byGrade[0]!.grade).toBe('legend');
    expect(byGrade[byGrade.length - 1]!.grade).toBe('normal');
    const byLevel = heroGrid(s, pd, data, 'heroes', 'level').owned;
    expect(byLevel.slice(0, 2).map((c) => c.id)).toEqual(['miner', 'archer']);
  });
  it('카드가 모이면 ready (위쪽 화살표), 레벨업 카드 수 = 다음 레벨 필요 수', () => {
    const s = fresh();
    s.heroes.miner!.cards = 2;
    const card = heroGrid(s, pd, data, 'heroes', 'grade').owned.find((c) => c.id === 'miner')!;
    expect(card).toMatchObject({ need: 2, cards: 2, ready: true });
    expect(heroesReady(s, pd, data)).toBe(1);
  });
  it('V2 L7: 배지 규칙 하나 — 영웅 점 = 지금 레벨업(카드 + 🔥 불꽃) 가능한 보유 영웅, 도감 점 = 해방 가능한 잠긴 리미티드 (두 번 세지 않음)', () => {
    const s = fresh();
    s.heroes.miner!.cards = 2;
    s.flame = 0; // 카드는 모였지만 불꽃이 없다
    expect(heroesReady(s, pd, data)).toBe(0);
    expect(heroGrid(s, pd, data, 'heroes', 'grade').canLevel).toBe(0);
    s.flame = 1_000;
    expect(heroesReady(s, pd, data)).toBe(1);
    // 잠긴 리미티드 하나에 조각이 모임 → 도감 점 1, 영웅 점은 그대로 (리미티드 목록의 ▲는 뜬다)
    const hidden = data.towers.towers.find((t) => t.grade === 'hidden')!;
    s.heroes[hidden.id] = { level: 0, cards: pd.hidden.unlockFragments };
    expect(codexReady(s, pd, data)).toBe(1);
    expect(fragmentRows(s, pd, data).filter((r) => r.canUnlock).length).toBe(1);
    expect(heroesReady(s, pd, data)).toBe(1);
    expect(heroGrid(s, pd, data, 'mythic', 'grade').unowned.find((c) => c.id === hidden.id)!.ready).toBe(true);
    // 해방한 리미티드는 레벨업 규칙으로 센다
    s.heroes[hidden.id] = { level: 1, cards: 0 };
    expect(codexReady(s, pd, data)).toBe(0);
  });
});

describe('영웅 상세', () => {
  it('능력치·특색·비용·전투 공격력 보너스(+4%/Lv)', () => {
    const s = fresh();
    s.heroes.miner = { level: 3, cards: 10 };
    const d = heroDetail(s, pd, data, 'miner')!;
    expect(d.cost).toEqual({ cards: 4, flame: 20 }); // V2.0 PR-A: 골드 → 🔥 불꽃
    expect(d.bonus).toBe('+8%');
    expect(d.nextBonus).toBe('+12%');
    expect(d.check).toBe('ok');
    expect(d.ability).toContain('%');
    expect(d.stats.map((x) => x.label)).toEqual(['공격력', '공격 속도', '사거리', '공격']);
    const hidden = data.towers.towers.find((t) => t.grade === 'hidden')!;
    const h = heroDetail(s, pd, data, hidden.id)!;
    expect(h.locked).toBe(true);
    expect(h.recipe.length).toBeGreaterThan(0);
    expect(heroDetail(s, pd, data, 'nope')).toBeNull();
  });
});

describe('위 띠 · 웨이브 길 · 조각', () => {
  it('경험치 바 · 웨이브 길 상태 · 다음 이정표', () => {
    const s = fresh();
    s.xp = 50;
    expect(topBar(s, pd)).toMatchObject({ level: 1, xpNeed: 100, xpRatio: 0.5 });
    s.bestWave = 23;
    const r = waveRoad(s, pd);
    expect(r.best).toBe(23);
    expect(r.next).toBe(30);
    expect(r.ready).toBe(2);
    expect(r.nodes[0]).toMatchObject({ wave: 10, state: 'ready', reward: '💰 300 · 🔥 15 · 🃏 3' });
    expect(r.nodes[2]!.state).toBe('locked');
  });
  it('리미티드 조각 줄: 12종, 해방 가능 표시', () => {
    const s = fresh();
    const rows = fragmentRows(s, pd, data);
    expect(rows).toHaveLength(12);
    s.heroes[rows[0]!.id]!.cards = 5; // 피드백 #59: 해방 조각 20 → 5
    expect(fragmentRows(s, pd, data)[0]).toMatchObject({ have: 5, need: 5, canUnlock: true, unlocked: false });
  });
  it('정산 요약: 이름·등급 색·NEW, 한 줄 글자', () => {
    const s = fresh();
    const r = settleMatch(s, pd, data, { runId: 'a', seed: 1, mode: 'infinite', stage: 12, bossKills: 1, summons: 40, merges: 5 }, '2026-11-17')!;
    const v = settlementView(r, data, s, pd);
    expect(v.best).toBe(12);
    expect(v.newBest).toBe(true);
    expect(v.cards.reduce((a, c) => a + c.n, 0)).toBe(5);
    expect(v.cards.every((c) => c.name.length > 0 && c.color.startsWith('#'))).toBe(true);
    expect(grantLine(v)).toContain('🃏 5장');
  });
});
