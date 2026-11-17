/**
 * G 통합 (G-1 신화 조합 × G-3 히든 해방): 계정(ProgressStore)의 잠긴 히든이 판 입력(MatchOptions.lockedHidden)을 거쳐
 * sim ctx → Craft.craftPlan / [신화] 도감 줄까지 실제로 흐르는지, 조각 수가 도감 문구에 들어가는지.
 */
import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../../src/save/storage';
import { loadProgression } from '../../src/meta/progressionData';
import { ProgressStore } from '../../src/meta/progressStore';
import { placeTower } from '../../src/sim/systems/Summon';
import { craftPlan } from '../../src/sim/systems/Craft';
import { isHiddenLocked } from '../../src/sim/unlocks';
import { codexSheetModel } from '../../src/ui/sheets/g1Models';
import { arena, command, data, eventsOf } from '../helpers/match';

const pd = loadProgression(data);

describe('G 통합: 계정 잠긴 신화 → 판 조합 잠김 · 도감 조각 표시', () => {
  it('새 계정은 히든이 모두 잠겨 판 입력으로 들어가고, 재료가 모여도 craft가 locked · 도감 줄 "🔒 해방 필요 (조각 n/20)"', () => {
    const store = new ProgressStore(new MemoryStorage(), pd, data, { seed: 3, now: () => new Date(2026, 10, 17, 9) });
    store.state.heroes.goldking = { level: 0, cards: 7 };
    const opts = store.matchOptions(false);
    expect(opts.lockedHidden?.[0]).toContain('goldking');
    const m = arena(51, opts);
    expect(isHiddenLocked(m.ctx, 0, 'goldking')).toBe(true);
    const r = m.ctx.rules.recipes.findIndex((x) => x.id === 'goldking');
    const p = m.map.buildable;
    placeTower(m.world, 'miner', 0, p[0]![0], p[0]![1]);
    placeTower(m.world, 'merchant', 0, p[1]![0], p[1]![1]);
    placeTower(m.world, 'alchemist', 0, p[2]![0], p[2]![1]);
    expect(craftPlan(m.ctx, m.world, 0, r)).toEqual({ ok: false, reason: 'locked' });
    command(m, { type: 'craft', r });
    expect(eventsOf(m, 'craftFail')[0]).toMatchObject({ reason: 'locked' });
    expect(store.fragmentsOf('goldking')).toEqual({ have: 7, need: pd.hidden.unlockFragments });
    const row = codexSheetModel(m.ctx, m.world, 0, data.towers.towers, new Set(['goldking']), (id) => store.fragmentsOf(id)).rows.find((x) => x.id === 'goldking')!;
    expect(row).toMatchObject({ locked: true, craftable: false, note: `🔒 해방 필요 (조각 7/${pd.hidden.unlockFragments})` });
    // 문구는 모두 한글 (G-1 요약의 '필要' 오타가 화면에 없게)
    expect(row.note).not.toMatch(/[一-鿿]/);
  });

  it('해방한 신화는 판에서 조합할 수 있고 조각 표시가 없다 · 개발자 판은 잠그지 않는다', () => {
    const store = new ProgressStore(new MemoryStorage(), pd, data, { seed: 4, now: () => new Date(2026, 10, 17, 9) });
    store.state.heroes.goldking = { level: 0, cards: pd.hidden.unlockFragments };
    expect(store.unlock('goldking')).toBe('ok');
    expect(store.fragmentsOf('goldking')).toBeNull();
    expect(store.fragmentsOf('miner')).toBeNull(); // 히든이 아님
    const m = arena(52, store.matchOptions(false));
    expect(isHiddenLocked(m.ctx, 0, 'goldking')).toBe(false);
    const r = m.ctx.rules.recipes.findIndex((x) => x.id === 'goldking');
    const p = m.map.buildable;
    placeTower(m.world, 'miner', 0, p[0]![0], p[0]![1]);
    placeTower(m.world, 'merchant', 0, p[1]![0], p[1]![1]);
    placeTower(m.world, 'alchemist', 0, p[2]![0], p[2]![1]);
    expect(craftPlan(m.ctx, m.world, 0, r).ok).toBe(true);
    expect(store.matchOptions(true).lockedHidden).toBeUndefined();
  });
});
