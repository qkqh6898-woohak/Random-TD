/**
 * G-1 바텀 시트 내용 (순수 함수, DOM 없음 → 단위 테스트): [소환] 시트 (일반 소환 + 소환 도박 4종 + 천장) · [신화] 도감 시트.
 * 값은 sim 상태를 읽기만 한다 (명령은 Game 장면이 보낸다).
 */
import type { GachaGrade, TowerData } from '../../data/load';
import type { World } from '../../sim/World';
import { BP_ONE } from '../../sim/Fixed';
import { GACHA_RANK, type MatchRules } from '../../sim/rules';
import type { MatchContext } from '../../sim/state';
import { pityLeft, summonStackCheck } from '../../sim/systems/Board';
import { gachaCheck, gachaOdds } from '../../sim/systems/Gacha';
import { craftPlan, ownedCounts, recipeReady } from '../../sim/systems/Craft';
import { summonCost } from '../../sim/systems/Summon';
import { pityText } from '../messages';
import { pctText } from './sheetModels';
import { withCommas } from '../hud/hudModel';

/** 소환 도박 결과 등급 → 한국어 (꽝 포함). 히든은 '신화' (G-1 화면 이름). */
export const GACHA_GRADE_NAMES: Readonly<Record<GachaGrade | 'hidden', string>> = {
  none: '꽝',
  normal: '노말',
  rare: '레어',
  unique: '유니크',
  hero: '히어로',
  legend: '레전드',
  god: '신',
  hidden: '신화',
};

/** 순위 → 등급 이름 (천장 글자 '레어 확정'). */
export function rankName(rank: number): string {
  const e = (Object.entries(GACHA_RANK) as [GachaGrade, number][]).find(([, r]) => r === rank);
  return e ? GACHA_GRADE_NAMES[e[0]] : '';
}

export type SummonRowState = 'ok' | 'gold' | 'full';

export interface GachaRowModel {
  k: number;
  id: string;
  name: string;
  icon: string;
  desc: string;
  cost: number;
  costText: string;
  /** '노말 55% · 레어 35% · 유니크 10%' (천장이면 그 등급 이상만) */
  odds: string;
  /** '천장까지 12회 (유니크)' · '다음 1회 유니크 확정!' */
  pity: string;
  pityLeft: number;
  state: SummonRowState;
  faction: boolean;
}

export interface SummonSheetModel {
  normal: { costText: string; pity: string; pityLeft: number; state: SummonRowState };
  rows: GachaRowModel[];
  factions: { id: string; name: string; color: string }[];
  /** 고른 종족 번호 (종족 소환) */
  faction: number;
}

/** 확률 줄 글자: 0%는 빼고 '노말 55% · 레어 35%'. */
export function oddsLine(odds: readonly { grade: GachaGrade; bp: number }[]): string {
  return odds
    .filter((o) => o.bp > 0)
    .map((o) => `${GACHA_GRADE_NAMES[o.grade]} ${pctText(o.bp)}%`)
    .join(' · ');
}

/** [소환] 시트 모델. */
export function summonSheetModel(
  ctx: MatchContext,
  world: World,
  player: number,
  factions: readonly { id: string; name: string; color: string }[],
  faction: number,
  /** 종류별 그림 글자·설명 (game.json summonGamble.kinds — rules에는 수치만) */
  display: readonly { icon: string; desc: string }[],
): SummonSheetModel {
  const { rules } = ctx;
  const cost = summonCost(ctx);
  const nFail = summonStackCheck(ctx, world, player);
  const nLeft = pityLeft(ctx, player, 0, rules.summonPityN);
  const rows = rules.gachaKinds.map((k, i): GachaRowModel => {
    const data = display[i] ?? { icon: '🎁', desc: '' };
    const left = pityLeft(ctx, player, 1 + i, k.pityN);
    const fail = gachaCheck(ctx, world, player, i, k.faction ? faction : 0);
    return {
      k: i,
      id: k.id,
      name: k.name,
      icon: data.icon,
      desc: data.desc,
      cost: k.cost,
      costText: `${withCommas(k.cost)}원`,
      odds: oddsLine(gachaOdds(k, left <= 0)),
      pity: `${pityText(left, rankName(k.pityRank))}${left > 0 ? ` (${rankName(k.pityRank)})` : ''}`,
      pityLeft: left,
      state: fail === 'gold' ? 'gold' : fail === 'full' ? 'full' : 'ok',
      faction: k.faction,
    };
  });
  return {
    normal: {
      costText: `${withCommas(cost)}원`,
      pity: `${pityText(nLeft, rankName(rules.summonPityRank))}${nLeft > 0 ? ` (${rankName(rules.summonPityRank)})` : ''}`,
      pityLeft: nLeft,
      state: nFail === 'gold' ? 'gold' : nFail === 'full' ? 'full' : 'ok',
    },
    rows,
    factions: [...factions],
    faction,
  };
}

// ---------------------------------------------------------------- 💠 신화 도감

export interface CodexMaterial {
  id: string;
  /** 보이는 이름 (모르면 '???') */
  name: string;
  /** 판 위에 내 타워로 있다 (발견한 조합만 표시) */
  onBoard: boolean;
  /** 이름이 보이는가 (발견했거나 힌트 재료) */
  known: boolean;
}

export interface CodexRowModel {
  r: number;
  id: string;
  /** 발견 전 '???' */
  name: string;
  found: boolean;
  materials: CodexMaterial[];
  /** [제작] 버튼: 재료가 모두 판 위 + 놓을 칸이 있음 */
  craftable: boolean;
  /** 재료는 모였지만 칸이 없음 등 — 버튼 아래 짧은 글자 */
  note: string;
}

export interface CodexSheetModel {
  rows: CodexRowModel[];
  /** '발견 3/12' */
  summary: string;
  /** 지금 만들 수 있는 조합 수 (메뉴 배지) */
  ready: number;
}

/** 힌트 재료 번호: 등급이 가장 높은 재료 (같으면 앞의 것) — 발견 전에도 이것 하나는 이름을 보인다. */
export function hintMaterial(materials: readonly string[], gradeOf: (id: string) => number): number {
  let best = 0;
  for (let i = 1; i < materials.length; i++) if (gradeOf(materials[i] as string) > gradeOf(materials[best] as string)) best = i;
  return best;
}

/** 이번 판에서 새로 '발견'할 조합 id: 아직 발견 안 했고 재료가 지금 모두 판 위에 있다 (사용자 규칙: 만들었거나 재료를 한꺼번에 가졌을 때). */
export function newlyDiscovered(rules: Pick<MatchRules, 'recipes'>, owned: ReadonlyMap<string, number>, found: ReadonlySet<string>): string[] {
  return rules.recipes.filter((r) => !found.has(r.id) && recipeReady(r.materials, owned)).map((r) => r.id);
}

/** [신화] 도감 시트 모델. */
export function codexSheetModel(ctx: MatchContext, world: World, player: number, towers: readonly TowerData[], found: ReadonlySet<string>): CodexSheetModel {
  const names = new Map(towers.map((t) => [t.id, t.name]));
  const rank = new Map(towers.map((t) => [t.id, t.grade === 'hidden' ? 7 : GACHA_RANK[t.grade]]));
  const owned = ownedCounts(world, player);
  let ready = 0;
  const rows = ctx.rules.recipes.map((rc, r): CodexRowModel => {
    const isFound = found.has(rc.id);
    const hint = hintMaterial(rc.materials, (id) => rank.get(id) ?? 0);
    const left = new Map(owned);
    const materials = rc.materials.map((id, i): CodexMaterial => {
      const n = left.get(id) ?? 0;
      if (n > 0) left.set(id, n - 1);
      const known = isFound || i === hint;
      return { id, name: known ? (names.get(id) ?? id) : '???', onBoard: known && n > 0, known };
    });
    const plan = craftPlan(ctx, world, player, r);
    const craftable = isFound && plan.ok;
    if (craftable) ready++;
    const note = isFound && !plan.ok && plan.reason === 'full' ? '놓을 칸이 없어요' : '';
    return { r, id: rc.id, name: isFound ? (names.get(rc.id) ?? rc.id) : '???', found: isFound, materials, craftable, note };
  });
  const n = rows.filter((x) => x.found).length;
  return { rows, summary: `발견 ${n}/${rows.length}`, ready };
}

/** 확률 bp → '0.4%' 같은 글자 (테스트·화면 공용). */
export function bpPct(bp: number): string {
  return `${pctText(bp)}%`;
}

export const BP = BP_ONE;
