/**
 * 소환 (DEV_PLAN M2-1, GDD 4.3).
 *
 * - `summon` 명령: 빈 배치 칸 (x, y) + 소환 비용(100원) → 그 칸에 타워 하나.
 *   명령은 화면이 미리 검사해서 보내지만, 실행 틱에 **다시 검사**한다 (같은 틱에 같은 칸 명령이 둘 와도 하나만 된다).
 *   실패하면 상태를 바꾸지 않고 난수도 쓰지 않으며 `summonFail` 사건 { reason }을 낸다.
 * - 판정 순서 (GDD 4.3): ① 신 타워 0.01% (덱과 무관, 신 3종 중 균등) → ② 레어 직행 (행운의 여신 3% → 10%, M3-9 + 소환 확률 강화, 피드백 #27. 특성·카드는 뒤에서 더함)
 *   → ③ 덱 노말 5종 균등. 레어 직행이면 덱 레어 5종 균등. 레어 직행 확률이 0이면 ②는 난수를 쓰지 않는다.
 *   난수는 **플레이어별 소환 흐름**(`p{n}.summon`)만 쓴다 → 한 사람의 소환이 다른 사람·몹 등장 순서에 영향을 주지 않는다.
 *   신 판정은 확률과 상관없이 매번 난수 1개를 쓴다 (난수 사용 횟수가 데이터 확률에 따라 달라지지 않게).
 * - 신 타워는 지금 일반 타워처럼 공격만 한다 (전용 능력·강림 연출은 뒤 마일스톤).
 * - 카드 (M4-7): 소환 비용 = 100 − '소환 할인' 합 (최소 50원) · '신의 눈길' = 신 확률 ×3 · '행운의 소환' = 남은 횟수만큼 ②에서 무조건 레어
 *   (난수는 같은 순서: 신 1개 → 레어 고르기 1개) · '쌍둥이 소환' = 시간 안에 소환하면 같은 타워를 가장 가까운 빈 배치 칸에 하나 더
 *   (빈 칸이 있을 때만, 돈은 한 번, 소환 횟수도 한 번).
 */
import type { Rng } from '../Rng';
import type { World } from '../World';
import { streamSummon } from '../World';
import { BP_ONE, mulBp } from '../Fixed';
import { ATTACK_COST, TOWER_KIND, isTower, type Tower } from '../entities/Tower';
import { isBuildable, tileAt, tileCenter, type SimMap } from '../map';
import type { Deck, MatchRules } from '../rules';
import type { MatchContext } from '../state';
import { canAfford, spendGold } from './Economy';
import { rollChanceBp } from './Damage';
import { ownerBonus } from '../abilities';
import { chanceBonus, chanceValue } from '../chances';
import { summonUpgradeBp } from './Upgrade';

/** 소환 실패 이유: 판이 끝남 / 배치 칸이 아님 / 이미 타워가 있음 / 배치 칸이 가득 참 / 돈 부족 */
export type SummonFail = 'phase' | 'notBuildable' | 'occupied' | 'full' | 'gold' | 'cap';

/** 판 위 타워 수. */
export function towerCount(world: World): number {
  let n = 0;
  for (const e of world.entities.list()) if (isTower(e)) n++;
  return n;
}

/**
 * 칸 (x, y)에 소환할 수 있는지 (화면의 미리 검사와 명령 실행이 같이 쓴다). 되면 null.
 * 순서: 판 진행 중 → 배치 칸 → 비어 있음(모든 칸이 차 있으면 'full') → 돈.
 */
export function summonCheck(ctx: MatchContext, world: World, x: number, y: number): SummonFail | null {
  if (ctx.state.phase !== 'playing') return 'phase';
  if (!isBuildable(ctx.map, x, y)) return 'notBuildable';
  let count = 0;
  let occupied = false;
  for (const e of world.entities.list()) {
    if (!isTower(e)) continue;
    count++;
    if (e.tx === x && e.ty === y) occupied = true;
  }
  if (occupied) return count >= ctx.map.buildable.length ? 'full' : 'occupied';
  if (!canAfford(ctx.state, summonCost(ctx))) return 'gold';
  return null;
}

/** 지금 소환 비용 (원): 기본 100 − 카드 '소환 할인' 합, 카드의 최소 비용(50) 아래로는 내려가지 않는다 (기본이 더 싸면 기본). */
export function summonCost(ctx: Pick<MatchContext, 'rules' | 'state'>): number {
  const base = ctx.rules.summonCost;
  if (ctx.state.summonDiscount <= 0) return base;
  const min = ctx.rules.summonCostMin < base ? ctx.rules.summonCostMin : base;
  const v = base - ctx.state.summonDiscount;
  return v < min ? min : v;
}

/** 그 플레이어의 신 타워 확률 (bp): 기본(개발자 확률 조정 'god'이 있으면 그 값) × 카드 '신의 눈길' 배율. */
export function godChanceFor(ctx: Pick<MatchContext, 'rules' | 'state'>, player: number): number {
  const mul = ctx.state.perks[player]?.godMulBp ?? BP_ONE;
  const base = chanceValue(ctx.rules, ctx.state, 'god');
  return mul === BP_ONE ? base : mulBp(base, mul);
}

/** 소환 판정 결과. */
export interface SummonRoll {
  tower: string;
  god: boolean;
  /** 레어 직행이었는가 (행운의 여신) */
  rare: boolean;
}

/**
 * 소환할 타워 고르기 (판정 순서는 파일 머리말). 덱 노말이 비어 있으면 에러.
 * @param rareBp 레어 직행 확률 (bp, 행운의 여신 등 — 0이면 ②에서 난수를 쓰지 않음)
 * @param opts.forceRare 카드 '행운의 소환': ②에서 확률 판정 없이 레어 / opts.godChanceBp 신 확률 (기본 데이터 값)
 */
export function rollSummon(rng: Rng, rules: MatchRules, deck: Deck, rareBp = 0, opts: { forceRare?: boolean; godChanceBp?: number } = {}): SummonRoll {
  // ① 신 타워: 매번 난수 1개 (확률이 0이어도 같은 수를 쓴다)
  const god = rng.chanceBp(opts.godChanceBp ?? rules.godChanceBp);
  if (god && rules.godTowers.length > 0) return { tower: rng.pick(rules.godTowers), god: true, rare: false };
  // ② 레어 직행: 덱 레어 5종 균등 (카드 '행운의 소환'이면 확률 판정 없이)
  if (opts.forceRare && deck.rare.length > 0) return { tower: rng.pick(deck.rare), god: false, rare: true };
  if (rareBp > 0 && deck.rare.length > 0 && rollChanceBp(rng, rareBp)) return { tower: rng.pick(deck.rare), god: false, rare: true };
  // ③ 덱 노말 5종 균등
  return { tower: rng.pick(deck.normal), god: false, rare: false };
}

/**
 * 그 플레이어의 레어 직행 확률 (bp): 판 위 특색(행운의 여신)의 합 — 같은 타워는 한 번만. + 개발자 확률 조정 'summonRare'
 * + 소환 확률 강화 (피드백 #27).
 */
export function summonRareChance(ctx: MatchContext, world: World, player: number): number {
  return ownerBonus(ctx, world, player, (def, p) => def.summonRareBp?.(p)) + chanceBonus(ctx.state, 'summonRare') + summonUpgradeBp(ctx, player);
}

/** 칸에 타워를 놓는다 (검사 없이, 소환·테스트용). */
export function placeTower(world: World, towerId: string, owner: number, tx: number, ty: number): Tower {
  const c = tileCenter(tx, ty);
  return world.entities.add({
    kind: TOWER_KIND,
    tower: towerId,
    owner,
    tx,
    ty,
    x: c.x,
    y: c.y,
    atkAcc: ATTACK_COST,
    remDmg: 0,
    bornTick: world.tick,
    attacks: 0,
    pauseUntil: 0,
    held: false,
    abilityAt: -1,
    stacks: 0,
    stackTarget: 0,
    stunUntil: 0,
  } satisfies Omit<Tower, 'id'>) as Tower;
}

/** (x, y)에서 가장 가까운 빈 배치 칸 (제곱 거리, 같으면 배치 칸 순서 = 위에서 아래·왼쪽에서 오른쪽). 없으면 null. */
export function nearestFreeTile(ctx: MatchContext, world: World, x: number, y: number): readonly [number, number] | null {
  const taken = new Set<string>();
  for (const e of world.entities.list()) if (isTower(e)) taken.add(`${e.tx},${e.ty}`);
  let best: readonly [number, number] | null = null;
  let bestD = 0;
  for (const t of ctx.map.buildable) {
    if (taken.has(`${t[0]},${t[1]}`)) continue;
    const d = (t[0] - x) * (t[0] - x) + (t[1] - y) * (t[1] - y);
    if (best === null || d < bestD) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

/**
 * 배치 칸 (x, y) 둘레(체비쇼프 거리 radius 안, 자기 칸 제외)의 경로 칸 수 — 자동 소환 칸 고르기의 점수 (T-2).
 */
export function pathTilesAround(map: SimMap, x: number, y: number, radius: number): number {
  let n = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if ((dx !== 0 || dy !== 0) && tileAt(map, x + dx, y + dy) === 'path') n++;
    }
  }
  return n;
}

/**
 * 소환 추천 칸 순위 (순수 함수, F10 '첫 소환 전 추천 칸'·T-2 자동 소환이 같이 쓴다): 빈 배치 칸을 점수 순으로 n개.
 * 점수 = 둘레(game.json summon.autoRadius = 2, 체비쇼프) 경로 칸 수, 같으면 y가 작은 칸, 그다음 x가 작은 칸.
 * @param taken 이미 찬 칸 'x,y' (생략하면 판 위 타워 칸만). 화면이 아직 실행되지 않은 소환 칸을 더해 넘길 수 있다
 */
export function rankSummonTiles(
  ctx: Pick<MatchContext, 'map' | 'rules'>,
  world: World,
  n: number,
  taken?: ReadonlySet<string>,
): (readonly [number, number])[] {
  const used = new Set<string>(taken ?? []);
  for (const e of world.entities.list()) if (isTower(e)) used.add(`${e.tx},${e.ty}`);
  const scored: { t: readonly [number, number]; score: number }[] = [];
  for (const t of ctx.map.buildable) {
    if (used.has(`${t[0]},${t[1]}`)) continue;
    scored.push({ t, score: pathTilesAround(ctx.map, t[0], t[1], ctx.rules.autoSummonRadius) });
  }
  scored.sort((a, b) => b.score - a.score || a.t[1] - b.t[1] || a.t[0] - b.t[0]);
  return scored.slice(0, n > 0 ? n : 0).map((s) => s.t);
}

/**
 * 자동 소환 칸 (T-2: 꾹 눌러 연속 소환·[🎲 소환] 버튼). 순수 함수 — 화면이 이 칸으로 평소 summon 명령을 보낸다 (리플레이 그대로).
 * = 추천 칸 순위(rankSummonTiles)의 1등: 빈 배치 칸 중 둘레 경로 칸이 가장 많은 칸, 같으면 y가 작은 칸, 그다음 x가 작은 칸.
 * @param taken 이미 찬 칸 'x,y' (생략하면 판 위 타워 칸). 화면이 아직 실행되지 않은 소환 칸을 더해 넘길 수 있다
 * @returns 빈 칸이 없으면 null
 */
export function autoSummonTile(
  ctx: Pick<MatchContext, 'map' | 'rules'>,
  world: World,
  taken?: ReadonlySet<string>,
): readonly [number, number] | null {
  return rankSummonTiles(ctx, world, 1, taken)[0] ?? null;
}

/** summon 명령 실행. 성공하면 놓인 타워, 실패하면 null (summonFail 사건). */
export function summon(ctx: MatchContext, world: World, player: number, x: number, y: number): Tower | null {
  const fail = summonCheck(ctx, world, x, y);
  if (fail) {
    world.emit('summonFail', { player, x, y, reason: fail });
    return null;
  }
  const deck = ctx.decks[player] ?? ctx.rules.baseDeck;
  spendGold(ctx.state, summonCost(ctx));
  const perks = ctx.state.perks[player];
  const forceRare = (perks?.rareSummons ?? 0) > 0;
  const roll = rollSummon(world.rng(streamSummon(player)), ctx.rules, deck, summonRareChance(ctx, world, player), {
    forceRare,
    godChanceBp: godChanceFor(ctx, player),
  });
  if (forceRare && perks && roll.rare) perks.rareSummons -= 1;
  const tower = placeTower(world, roll.tower, player, x, y);
  ctx.state.summons += 1;
  const stats = ctx.rules.towers.get(roll.tower);
  world.emit('summon', { id: tower.id, tower: roll.tower, grade: stats?.grade ?? '', god: roll.god, rare: roll.rare && !forceRare, lucky: forceRare && roll.rare, player, x, y });
  // 카드 '쌍둥이 소환': 같은 타워를 가장 가까운 빈 칸에 하나 더
  if (perks && world.tick < perks.twinUntil) {
    const free = nearestFreeTile(ctx, world, x, y);
    if (free) {
      const twin = placeTower(world, roll.tower, player, free[0], free[1]);
      world.emit('summon', { id: twin.id, tower: roll.tower, grade: stats?.grade ?? '', god: roll.god, rare: false, twin: true, player, x: free[0], y: free[1] });
    }
  }
  return tower;
}
