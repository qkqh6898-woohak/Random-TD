/** PR-E display-only summary. Actual level bonuses and caps stay in meta/progress. */
import type { GameData } from '../../data/load';
import type { ProgressionData } from '../../meta/progressionData';
import { heroAtkBonuses, heroAtkBonusBp, heroEntry, heroLevelSum, type ProgressState } from '../../meta/progress';

const percent = (bp: number): string => (bp / 100).toLocaleString('ko-KR', { maximumFractionDigits: 2 });
export function heroCollectionSummary(state: ProgressState, pd: ProgressionData, data: Pick<GameData, 'towers' | 'game'>): { levelSum: number; bonusRange: string; perLevel: string } {
  const bonuses = heroAtkBonuses(state, pd, data);
  const owned = data.towers.towers.filter(t => heroEntry(state, t.id).level >= 1).map(t => bonuses[t.id] ?? 0);
  const low = owned.length ? Math.min(...owned) : 0;
  const high = owned.length ? Math.max(...owned) : 0;
  return { levelSum: heroLevelSum(state), bonusRange: low === high ? `+${percent(high)}%` : `+${percent(low)}~${percent(high)}%`, perLevel: `+${percent(heroAtkBonusBp(2, data))}%` };
}
