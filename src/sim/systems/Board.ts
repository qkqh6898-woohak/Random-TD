/**
 * 칸 무더기 (G-1 사용자 결정 '한 칸에 같은 캐릭터 최대 3개') — 새 타워를 놓을 칸 고르기와 무더기 소환.
 *
 * - 한 칸에는 **같은 타워(= 같은 종류·같은 등급)만** game.json board.stackMax(3)개까지 쌓인다. 무더기의 순서 = 엔티티 ID 순.
 * - 새 타워를 놓을 칸 (`placementFor`): ① 같은 타워가 쌓여 있고 덜 찬 내 칸 (바닥 타워 ID가 가장 작은 칸) → ② 고른 빈 칸(누른 칸)
 *   → ③ 자동 소환 칸 (`autoSummonTile`: 둘레 경로 칸이 가장 많은 빈 배치 칸). 셋 다 없으면 null.
 * - 무더기 소환 (`summonStack`, 명령 summonPad {x, y}·summonAuto): 돈·자리(빈 칸 또는 덜 찬 내 무더기)를 먼저 보고, 타워를 굴린 뒤
 *   놓을 칸을 정한다. 굴린 타워가 들어갈 칸이 없으면(빈 칸 없음 + 그 타워 무더기도 없음) 돈을 내지 않고 'summonFail' {reason: 'full'}
 *   (난수는 이미 썼다 — 결정적이라 리플레이는 같다). 성공하면 평소 'summon' 사건 + stack(그 칸 타워 수).
 * - 일반 소환 천장 (G-1 천장): game.json summon.pity — 레어 이상 없이 n번(카드 '행운 부적'만큼 줄어듦, 최소 1) 이어지면 다음 소환은
 *   레어 직행 확정 (판정 순서는 예전과 같다: 신 → 레어 → 노말). 신·레어가 나오면 0, 노말이면 +1. 카운터 = state.pity[플레이어][0].
 * - 인원 한도 (G-1, game.json board.unitCap + 카드 '부대 확장' + 인원 한도 강화 — 피드백 #28): 내 타워가 한도만큼이면 소환·소환 도박이 'cap'으로 실패 (승급하면 줄어든다).
 *   쌍둥이 소환의 덤 하나는 한도를 넘을 수 있다. 개발자 놓기·예전 summon 명령은 한도를 보지 않는다.
 * - 예전 명령 summon {x, y}는 그대로 (빈 칸에만, 천장 없음) — 예전 리플레이가 같은 결과를 내게.
 */
import type { World } from '../World';
import { streamSummon } from '../World';
import { isTower, towerStacks, type Tower } from '../entities/Tower';
import { isBuildable } from '../map';
import { gradeRank } from '../rules';
import type { MatchContext } from '../state';
import { canAfford, spendGold } from './Economy';
import { autoSummonTile, godChanceFor, placeTower, rollSummon, summonCost, summonRareChance, type SummonFail } from './Summon';

/**
 * 새 타워 towerId가 들어갈 수 있는 내 무더기 칸: 같은 타워가 쌓여 있고 board.stackMax보다 적은 칸 중 바닥 타워 ID가 가장 작은 칸.
 * @param except 셈에서 뺄 타워 id (곧 사라질 재료)
 */
export function joinableStack(ctx: Pick<MatchContext, 'rules'>, world: World, player: number, towerId: string, except?: ReadonlySet<number>): readonly [number, number] | null {
  let best: Tower[] | null = null;
  for (const list of towerStacks(world).values()) {
    const first = list[0] as Tower;
    if (first.owner !== player || first.tower !== towerId) continue;
    const n = except ? list.filter((t) => !except.has(t.id)).length : list.length;
    if (n === 0 || n >= ctx.rules.stackMax) continue;
    if (!best || first.id < (best[0] as Tower).id) best = list;
  }
  return best ? [(best[0] as Tower).tx, (best[0] as Tower).ty] : null;
}

/** 빈 배치 칸인가 (타워 없음). */
export function isFreePad(ctx: Pick<MatchContext, 'map'>, world: World, x: number, y: number): boolean {
  if (!isBuildable(ctx.map, x, y)) return false;
  for (const e of world.entities.list()) if (isTower(e) && e.tx === x && e.ty === y) return false;
  return true;
}

/** 새 무더기를 시작할 빈 칸: 고른 칸(prefer)이 빈 배치 칸이면 그 칸, 아니면 자동 소환 칸. 없으면 null. */
export function freePad(ctx: Pick<MatchContext, 'map' | 'rules'>, world: World, prefer: readonly [number, number] | null): readonly [number, number] | null {
  if (prefer && isFreePad(ctx, world, prefer[0], prefer[1])) return prefer;
  return autoSummonTile(ctx, world);
}

/** 새 타워를 놓을 칸 (파일 머리말 ①②③). */
export function placementFor(
  ctx: Pick<MatchContext, 'map' | 'rules'>,
  world: World,
  player: number,
  towerId: string,
  prefer: readonly [number, number] | null,
): readonly [number, number] | null {
  return joinableStack(ctx, world, player, towerId) ?? freePad(ctx, world, prefer);
}

/** 새 타워가 들어갈 자리가 있을 수 있는가: 빈 배치 칸이 있거나, 덜 찬 내 무더기가 있다 (굴리기 전 검사). */
export function hasRoom(ctx: Pick<MatchContext, 'map' | 'rules'>, world: World, player: number): boolean {
  const stacks = towerStacks(world);
  if (stacks.size < ctx.map.buildable.length) return true;
  for (const list of stacks.values()) if ((list[0] as Tower).owner === player && list.length < ctx.rules.stackMax) return true;
  return false;
}

/** 내 타워 인원 한도 (G-1): game.json board.unitCap + 카드 '부대 확장' + [⬆ 강화] 인원 한도 강화 (피드백 #28, Lv × perLevel). */
export function unitCap(ctx: Pick<MatchContext, 'rules' | 'state'>, player: number): number {
  const { rules, state } = ctx;
  const bought = (state.upgrades[player]?.[rules.unitCapK] ?? 0) * (rules.upgrades[rules.unitCapK]?.perLevelBp ?? 0);
  return rules.unitCap + (state.unitCapBonus[player] ?? 0) + bought;
}

/** 내 타워 수 (인원). */
export function unitCount(world: World, player: number): number {
  let n = 0;
  for (const e of world.entities.list()) if (isTower(e) && e.owner === player) n++;
  return n;
}

/** 천장 수 (데이터 − 카드 '행운 부적', 최소 1). */
export function pityLimit(ctx: Pick<MatchContext, 'state'>, player: number, n: number): number {
  const v = n - (ctx.state.pityCut[player] ?? 0);
  return v < 1 ? 1 : v;
}

/** 천장 카운터 (slot 0 = 일반 소환, 1 + k = 소환 도박 k). */
export function pityCount(ctx: Pick<MatchContext, 'state'>, player: number, slot: number): number {
  return ctx.state.pity[player]?.[slot] ?? 0;
}

/** 천장까지 남은 횟수 (0 = 다음 한 번이 확정). 화면 '천장까지 7회'. */
export function pityLeft(ctx: Pick<MatchContext, 'state'>, player: number, slot: number, n: number): number {
  const left = pityLimit(ctx, player, n) - pityCount(ctx, player, slot);
  return left < 0 ? 0 : left;
}

/** 천장 카운터 갱신: 좋은 결과면 0, 아니면 +1. */
export function notePity(ctx: Pick<MatchContext, 'state'>, player: number, slot: number, good: boolean): void {
  const row = ctx.state.pity[player];
  if (!row) return;
  row[slot] = good ? 0 : (row[slot] ?? 0) + 1;
}

/** 무더기 소환 검사 (굴리기 전): 판 진행 중 → 인원 한도 → 자리 → 돈. 되면 null. */
export function summonStackCheck(ctx: MatchContext, world: World, player: number): SummonFail | null {
  if (ctx.state.phase !== 'playing') return 'phase';
  if (unitCount(world, player) >= unitCap(ctx, player)) return 'cap';
  if (!hasRoom(ctx, world, player)) return 'full';
  if (!canAfford(ctx.state, summonCost(ctx))) return 'gold';
  return null;
}

/**
 * 무더기 소환 (명령 summonPad {x, y} — 누른 빈 칸 우선 · summonAuto — 자동 칸). 성공하면 놓인 타워, 실패하면 null ('summonFail').
 * 카드 '행운의 소환'·'쌍둥이 소환'·신 확률·레어 직행은 예전 소환과 같다. 쌍둥이는 같은 칸 무더기에 먼저, 없으면 빈 칸.
 */
export function summonStack(ctx: MatchContext, world: World, player: number, prefer: readonly [number, number] | null): Tower | null {
  const fx = prefer?.[0] ?? -1;
  const fy = prefer?.[1] ?? -1;
  const fail = summonStackCheck(ctx, world, player);
  if (fail) {
    world.emit('summonFail', { player, x: fx, y: fy, reason: fail });
    return null;
  }
  const { rules, state } = ctx;
  const deck = ctx.decks[player] ?? rules.baseDeck;
  const perks = state.perks[player];
  const lucky = (perks?.rareSummons ?? 0) > 0;
  const pityHit = pityCount(ctx, player, 0) >= pityLimit(ctx, player, rules.summonPityN);
  const roll = rollSummon(world.rng(streamSummon(player)), rules, deck, summonRareChance(ctx, world, player), {
    forceRare: lucky || pityHit,
    godChanceBp: godChanceFor(ctx, player),
  });
  const at = placementFor(ctx, world, player, roll.tower, prefer);
  if (!at) {
    world.emit('summonFail', { player, x: fx, y: fy, reason: 'full', rolled: true });
    return null;
  }
  spendGold(state, summonCost(ctx));
  if (lucky && perks && roll.rare) perks.rareSummons -= 1;
  const tower = placeTower(world, roll.tower, player, at[0], at[1]);
  state.summons += 1;
  const stats = rules.towers.get(roll.tower);
  const grade = stats?.grade ?? 'normal';
  notePity(ctx, player, 0, gradeRank(grade) >= rules.summonPityRank);
  const pity = pityHit && !lucky && roll.rare;
  world.emit('summon', {
    id: tower.id,
    tower: roll.tower,
    grade,
    god: roll.god,
    rare: roll.rare && !lucky && !pityHit,
    lucky: lucky && roll.rare,
    pity,
    player,
    x: at[0],
    y: at[1],
    stack: stackSize(world, at[0], at[1]),
  });
  // 카드 '쌍둥이 소환': 같은 타워 하나 더 (그 무더기에 자리가 있으면 거기, 없으면 빈 칸)
  if (perks && world.tick < perks.twinUntil) {
    const free = placementFor(ctx, world, player, roll.tower, null);
    if (free) {
      const twin = placeTower(world, roll.tower, player, free[0], free[1]);
      world.emit('summon', { id: twin.id, tower: roll.tower, grade, god: roll.god, rare: false, twin: true, player, x: free[0], y: free[1], stack: stackSize(world, free[0], free[1]) });
    }
  }
  return tower;
}

/** 그 칸 타워 수. */
export function stackSize(world: World, x: number, y: number): number {
  let n = 0;
  for (const e of world.entities.list()) if (isTower(e) && e.tx === x && e.ty === y) n++;
  return n;
}
