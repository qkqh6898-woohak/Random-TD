/**
 * 🛠 개발자 도구 시트의 표시값 (T-2, 순수 함수 → 단위 테스트). 개발자 모드에서만 쓰인다.
 *
 * - 확률 조정 줄: game.json devChances 순서. 지금 값(sim chanceValue — 덮어쓴 값이 있으면 그것)·기본값·바뀌었는가·
 *   [−0.1%p]·[+0.1%p]를 누를 수 있는가 (0 ~ chanceMaxBp: 도박은 ×0이 0%가 될 때까지). 도박 줄 아래 '×0 n%' 와 기대값.
 * - 히든 조합: towers.json 히든 12종의 결과·재료 3개 (판 위에 있으면 ✓, 지금 덱에 있으면 '덱').
 */
import type { TowerData } from '../../data/load';
import { chanceBase, chanceMaxBp, chanceMode, chanceOverride, chanceValue, effectiveGambleOutcomes } from '../../sim/chances';
import type { Deck } from '../../sim/rules';
import type { MatchContext } from '../../sim/state';
import { gambleExpectationBp, gambleRulesOf } from '../../sim/systems/Gamble';
import { pctText } from './sheetModels';

export type DevTab = 'fx' | 'chance' | 'recipes';

export interface DevChanceRow {
  key: string;
  name: string;
  note: string;
  /** 지금 값 (bp) */
  bp: number;
  /** '0.01%' · add key는 '+2.5%' */
  value: string;
  /** 기본값 글자 '기본 0.01%' */
  base: string;
  changed: boolean;
  canDown: boolean;
  canUp: boolean;
}

export interface DevChanceModel {
  rows: DevChanceRow[];
  /** '×0 39.9% · 기대값 92% (잭팟 포함)' — 도박 줄 아래 */
  gambleLine: string;
  /** 하나라도 바뀌었는가 ([초기화] 켜짐) */
  anyChanged: boolean;
}

/** 확률 글자: set = '0.01%', add = '+2.5%' (0이면 '+0%'). */
export function chanceText(key: string, bp: number): string {
  return `${chanceMode(key) === 'add' ? '+' : ''}${pctText(bp)}%`;
}

export function devChanceModel(ctx: Pick<MatchContext, 'rules' | 'state'>, list: readonly { key: string; name: string; note?: string }[]): DevChanceModel {
  const { rules, state } = ctx;
  const rows = list.map((c): DevChanceRow => {
    const bp = chanceValue(rules, state, c.key);
    const max = chanceMaxBp(rules, state, c.key);
    return {
      key: c.key,
      name: c.name,
      note: c.note ?? '',
      bp,
      value: chanceText(c.key, bp),
      base: `기본 ${chanceText(c.key, chanceBase(rules, c.key))}`,
      changed: chanceOverride(state, c.key) !== null,
      canDown: bp > 0,
      canUp: bp < max,
    };
  });
  const eff = effectiveGambleOutcomes(rules, state);
  const zero = eff[rules.gambleZeroIndex]?.chanceBp ?? 0;
  const ev = gambleExpectationBp(gambleRulesOf(ctx));
  return {
    rows,
    gambleLine: `×0 ${pctText(zero)}% (나머지) · 기대값 ${pctText(Math.floor(ev / 10) * 10)}% (잭팟 포함)`,
    anyChanged: state.chanceOv !== undefined,
  };
}

/** 한 번 누른 뒤 보낼 값 (bp): 지금 값 ± 단위, 0 ~ 최대로 자름. 바뀌지 않으면 null (끝에 닿음). */
export function nextChanceBp(ctx: Pick<MatchContext, 'rules' | 'state'>, key: string, dir: 1 | -1): number | null {
  const { rules, state } = ctx;
  const cur = chanceValue(rules, state, key);
  const max = chanceMaxBp(rules, state, key);
  // 단위에 맞춘다 (기본값이 단위의 배수가 아니면 — 신 0.01% — 첫 누름은 가까운 배수로)
  const step = rules.devChanceStepBp;
  let next = dir > 0 ? (Math.floor(cur / step) + 1) * step : (Math.ceil(cur / step) - 1) * step;
  if (next < 0) next = 0;
  if (next > max) next = max - (max % step);
  return next === cur || next < 0 ? null : next;
}

export interface RecipeMaterial {
  id: string;
  name: string;
  /** 판 위에 내 타워로 있다 (✓) */
  onBoard: boolean;
  /** 지금 덱에 있다 */
  inDeck: boolean;
}

export interface HiddenRecipeRow {
  id: string;
  name: string;
  materials: RecipeMaterial[];
  /** 재료가 모두 판 위에 있다 */
  ready: boolean;
}

/** 히든 조합 12종 (towers.json 순서). 조합 자체는 M6 — 여기서는 보기만. */
export function hiddenRecipeRows(towers: readonly TowerData[], owned: ReadonlySet<string>, deck: Deck): HiddenRecipeRow[] {
  const names = new Map(towers.map((t) => [t.id, t.name]));
  const inDeck = new Set<string>([...deck.normal, ...deck.rare, ...deck.unique, ...deck.hero, ...deck.legend]);
  return towers
    .filter((t) => t.grade === 'hidden')
    .map((t) => {
      const materials = (t.recipe ?? []).map((id) => ({ id, name: names.get(id) ?? id, onBoard: owned.has(id), inDeck: inDeck.has(id) }));
      return { id: t.id, name: t.name, materials, ready: materials.length > 0 && materials.every((m) => m.onBoard) };
    });
}
