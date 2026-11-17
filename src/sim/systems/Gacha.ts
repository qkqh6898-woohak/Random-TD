/**
 * 소환 도박 4종 (G-1, game.json summonGamble.kinds — 돈 도박(Gamble.ts)과 따로).
 *
 * - 명령 `gacha {k, f}`: k번째 종류 (0 행운 소환 · 1 종족 소환 · 2 등급 도전 · 3 신화 도박), f = 종족 번호(towers.json factions 순서,
 *   종족 소환에서만 쓰고 나머지는 0).
 * - 판정: ① 결과 등급 하나 (데이터 확률, 'none' = 꽝 — 돈은 돌려주지 않음) ② 그 등급 타워 하나:
 *   신 = 신 3종 균등 · 종족 소환 = 덱에서 그 종족·그 등급 → 없으면 타워 전체에서 그 종족·그 등급 → 없으면 한 등급 위로 (요정은 노말이 없다)
 *   · 나머지 = 덱의 그 등급 5종 균등. 난수는 플레이어별 소환 흐름.
 * - 천장 (G-1): 종류마다 카운터 state.pity[플레이어][1 + k]. 천장 등급 이상 없이 n번(카드 '행운 부적'만큼 줄어듦, 최소 1)이면
 *   다음 한 번은 천장 등급 이상만 (그 등급들의 데이터 확률 비율로). 좋은 결과면 0, 아니면 +1 (꽝도 +1).
 * - 놓을 칸 = 무더기 소환과 같다 (Board.placementFor: 같은 타워의 덜 찬 칸 → 자동 빈 칸). 자리가 없으면 굴리기 전에 실패,
 *   굴린 타워가 들어갈 칸이 없으면 돈을 내지 않고 실패 ('gachaFail' {reason: 'full'}). 꽝은 자리가 없어도 된다(자리 검사 뒤라 드묾).
 * - 성공: 돈을 내고 평소 'summon' 사건(gacha = k) + 'gacha' 사건 {player, k, grade, tower, x, y, pity, cost}. 꽝은 'gacha' (grade 'none')만.
 *   소환 횟수(state.summons)에도 센다 — 미션 '소환 n회'는 어떤 소환이든.
 */
import type { World } from '../World';
import { streamSummon } from '../World';
import { BP_ONE } from '../Fixed';
import { placeTower } from './Summon';
import { DECK_GRADES } from '../Deck';
import type { GachaGrade, Grade } from '../../data/load';
import { GACHA_RANK, type GachaKindStats, type MatchRules } from '../rules';
import type { MatchContext } from '../state';
import { canAfford, spendGold } from './Economy';
import { hasRoom, notePity, pityCount, pityLimit, placementFor, stackSize, unitCap, unitCount } from './Board';

/** 소환 도박 실패 이유: 판이 끝남 / 없는 종류·종족 / 자리 없음 / 돈 부족 */
export type GachaFail = 'phase' | 'unknown' | 'cap' | 'full' | 'gold';

/** 소환 도박 검사 (굴리기 전, 화면 버튼과 명령이 같이 쓴다). 되면 null. */
export function gachaCheck(ctx: MatchContext, world: World, player: number, k: number, f = 0): GachaFail | null {
  const { rules, state } = ctx;
  if (state.phase !== 'playing') return 'phase';
  const kind = rules.gachaKinds[k];
  if (!kind) return 'unknown';
  if (kind.faction && rules.factionOrder[f] === undefined) return 'unknown';
  if (unitCount(world, player) >= unitCap(ctx, player)) return 'cap';
  if (!hasRoom(ctx, world, player)) return 'full';
  if (!canAfford(state, kind.cost)) return 'gold';
  return null;
}

/** 결과 등급 가중치 (bp): 천장이면 천장 등급 미만은 0. */
export function gachaWeights(kind: GachaKindStats, pity: boolean): number[] {
  return kind.outcomes.map((o) => (pity && GACHA_RANK[o.grade] < kind.pityRank ? 0 : o.bp));
}

/**
 * 결과 등급의 실제 확률 (bp, 천장 아닐 때) — 화면 확률 표.
 * 천장이면 천장 등급 이상만 비율대로 (합 10000이 되게 마지막 칸이 나머지).
 */
export function gachaOdds(kind: GachaKindStats, pity: boolean): { grade: GachaGrade; bp: number }[] {
  const w = gachaWeights(kind, pity);
  const sum = w.reduce((a, b) => a + b, 0);
  let left = BP_ONE;
  return kind.outcomes.map((o, i) => {
    const last = i === w.length - 1;
    const v = sum <= 0 ? 0 : last ? left : Math.floor(((w[i] as number) * BP_ONE) / sum);
    left -= v;
    return { grade: o.grade, bp: v };
  });
}

/** 종족 소환 후보: 덱의 그 종족·그 등급 → 타워 전체의 그 종족·그 등급 → 한 등급 위 (노말~레전드). 그래도 없으면 덱의 그 등급. */
export function factionPool(rules: Pick<MatchRules, 'towers' | 'towerOrder'>, deck: MatchContext['decks'][number], faction: string, grade: Grade): string[] {
  const start = DECK_GRADES.indexOf(grade as (typeof DECK_GRADES)[number]);
  for (let i = start < 0 ? 0 : start; i < DECK_GRADES.length; i++) {
    const g = DECK_GRADES[i] as (typeof DECK_GRADES)[number];
    const inDeck = deck[g].filter((id) => rules.towers.get(id)?.faction === faction);
    if (inDeck.length > 0) return inDeck;
    const all = rules.towerOrder.filter((id) => {
      const t = rules.towers.get(id);
      return t !== undefined && t.grade === g && t.faction === faction;
    });
    if (all.length > 0) return all;
  }
  return start >= 0 ? [...deck[grade as (typeof DECK_GRADES)[number]]] : [];
}

/** 소환 도박 결과 (화면 E2E·테스트용). */
export interface GachaResult {
  grade: GachaGrade;
  tower: string | null;
  pity: boolean;
}

/** gacha 명령 실행. 성공하면 결과(꽝 포함), 실패하면 null ('gachaFail'). */
export function gacha(ctx: MatchContext, world: World, player: number, k: number, f: number): GachaResult | null {
  const fail = gachaCheck(ctx, world, player, k, f);
  if (fail) {
    world.emit('gachaFail', { player, k, reason: fail });
    return null;
  }
  const { rules, state } = ctx;
  const kind = rules.gachaKinds[k] as GachaKindStats;
  const slot = 1 + k;
  const pity = pityCount(ctx, player, slot) >= pityLimit(ctx, player, kind.pityN);
  const rng = world.rng(streamSummon(player));
  const outcome = kind.outcomes[rng.weightedIndex(gachaWeights(kind, pity))] as GachaKindStats['outcomes'][number];
  const good = GACHA_RANK[outcome.grade] >= kind.pityRank;
  if (outcome.grade === 'none') {
    spendGold(state, kind.cost);
    state.gachas += 1;
    notePity(ctx, player, slot, false);
    world.emit('gacha', { player, k, grade: 'none', tower: '', x: -1, y: -1, pity: false, cost: kind.cost });
    return { grade: 'none', tower: null, pity: false };
  }
  const deck = ctx.decks[player] ?? rules.baseDeck;
  let pool: readonly string[];
  if (outcome.grade === 'god') pool = rules.godTowers;
  else if (kind.faction) pool = factionPool(rules, deck, rules.factionOrder[f] as string, outcome.grade);
  else pool = deck[outcome.grade];
  if (pool.length === 0) pool = deck.normal;
  const towerId = rng.pick(pool);
  const at = placementFor(ctx, world, player, towerId, null);
  if (!at) {
    world.emit('gachaFail', { player, k, reason: 'full' });
    return null;
  }
  spendGold(state, kind.cost);
  state.gachas += 1;
  state.summons += 1;
  notePity(ctx, player, slot, good);
  const t = placeTower(world, towerId, player, at[0], at[1]);
  const grade = rules.towers.get(towerId)?.grade ?? outcome.grade;
  world.emit('summon', { id: t.id, tower: towerId, grade, god: outcome.grade === 'god', rare: false, gacha: k, player, x: at[0], y: at[1], stack: stackSize(world, at[0], at[1]) });
  world.emit('gacha', { player, k, grade, tower: towerId, x: at[0], y: at[1], pity: pity && good, cost: kind.cost });
  return { grade: outcome.grade, tower: towerId, pity: pity && good };
}
