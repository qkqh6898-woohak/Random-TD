import { describe, expect, it } from 'vitest';
import { loadGameData } from '../../src/data/load';
import { loadProgression } from '../../src/meta/progressionData';
import { newProgress } from '../../src/meta/progress';
import { heroCollectionSummary } from '../../src/ui/lobby/heroCollectionModel';

const data = loadGameData(), pd = loadProgression(data);
describe('collection summary describes existing per-hero bonuses', () => {
  it('starts with 25 levels and no attack bonus', () => {
    expect(heroCollectionSummary(newProgress(pd, data, 1), pd, data)).toEqual({ levelSum: 25, bonusRange: '+0%', perLevel: '+4%' });
  });
  it('shows the range of individual bonuses rather than adding them as a global buff', () => {
    const state = newProgress(pd, data, 1);
    state.heroes.miner!.level = 3; state.heroes.archer!.level = 6;
    expect(heroCollectionSummary(state, pd, data)).toMatchObject({ levelSum: 32, bonusRange: '+0~20%' });
  });
  it('uses the same cap as actual match inputs for a newer stored level', () => {
    const state = newProgress(pd, data, 1); state.heroes.miner!.level = 99;
    expect(heroCollectionSummary(state, pd, data)).toMatchObject({ levelSum: 123, bonusRange: '+0~56%' });
    const smallerCap = { ...pd, heroes: { ...pd.heroes, maxLevel: 10 } };
    expect(heroCollectionSummary(state, smallerCap, data).bonusRange).toBe('+0~36%');
  });
  it('handles an empty collection and reads fractional per-level bonuses from game data', () => {
    const state = newProgress(pd, data, 1);
    for (const entry of Object.values(state.heroes)) entry.level = 0;
    expect(heroCollectionSummary(state, pd, data).bonusRange).toBe('+0%');
    state.heroes.miner!.level = 3;
    const custom = { ...data, game: { ...data.game, towerLevel: { ...data.game.towerLevel, atkPerLevel: .075 } } };
    expect(heroCollectionSummary(state, pd, custom)).toEqual({ levelSum: 3, bonusRange: '+15%', perLevel: '+7.5%' });
  });
});
