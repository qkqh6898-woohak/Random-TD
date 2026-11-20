/**
 * 승급 (DEV_PLAN M3-1·M3-2, GDD 4.4).
 *
 * - `merge {x, y}`: 칸 (x, y)의 타워(= 터치한 타워)와 **같은 종류**(같은 id → 같은 등급) 타워가 3개 이상이면 승급.
 *   - 결과는 **터치한 타워 자리**에 새 타워로 생긴다 (새 엔티티 → 판 내 스택·공격 타이머·피해 나머지 초기화, GDD 4.4 마지막 줄).
 *   - 함께 사라지는 2개 = 터치한 타워를 뺀 같은 종류 중 **가장 나중에 소환된 2개** (엔티티 ID가 가장 큰 2개. ID는 단조 증가 = 생긴 순서).
 *   - 결과 = 덱의 다음 등급 5종 균등 (Deck.rollMerge), 승급마다 신 타워 0.01% 판정. 난수는 플레이어별 소환·승급 흐름.
 *   - 레전드·신·히든은 승급할 수 없다 (레전드는 히든 재료).
 *   - 내 타워끼리만 (2인 판에서 남의 타워는 고르지도 세지도 않는다).
 * - `mergeAll {x, y}`: 같은 종류를 가능한 만큼 연속 승급 (7개 → 2회, 1개 남음). 첫 승급은 터치한 자리,
 *   그다음부터는 남은 같은 종류 중 **가장 먼저 소환된 타워**(ID가 가장 작은 타워) 자리에 결과가 생기고 가장 나중의 2개가 사라진다.
 *   결과가 또 3개가 되어도 이어서 승급하지 않는다 (터치한 종류만).
 * - 실패하면 상태·난수를 바꾸지 않고 `mergeFail` 사건 { player, x, y, reason }.
 * - 성공하면 승급마다 `merge` 사건 { player, id(새 타워), from(터치한 타워), fromTower, tower, grade, god, double(2등급 상승), x, y, removed("x,y;x,y") }.
 * - 행운의 여신(M3-9)이 판 위에 있으면 2등급 상승 판정 (Deck.rollMerge ②). 확률은 승급하기 전 판 위 타워로 정한다.
 * - 카드 (M4-7): '신의 눈길' = 신 확률 ×3. '승급의 축복' = 남은 횟수만큼 승급마다 결과 2개 중 선택 — 결과 타워는 바로 놓이고
 *   같은 등급의 다른 타워 하나(alt, 같은 흐름에서 결과를 뺀 덱 등급 중 균등)를 고를 수 있는 선택(state.mergePicks)이 생긴다
 *   ('mergeChoice' 사건). `pickMerge {id, pick}` 명령: pick 1 = 그 타워를 alt로 바꿈(새 판 내 스택 — 무더기 안이면 alt 무더기·빈 칸으로 옮기고, 자리가 없으면 거절, V2 H1), 0 = 그대로. 신 결과면 선택이 없다
 *   (축복도 쓰지 않음). 결과 타워가 다시 승급 재료로 사라지면 그 선택도 사라진다.
 * 승급 개수(3)는 game.json merge.count.
 */
import type { World } from '../World';
import { streamSummon } from '../World';
import { ATTACK_COST, isTower, isUniformStack, towerStacks, towersAt, type Tower } from '../entities/Tower';
import { tileCenter } from '../map';
import { canMergeGrade, isDeckGrade, rollMerge } from '../Deck';
import type { MatchContext } from '../state';
import { godChanceFor, placeTower } from './Summon';
import { freePad, joinableStack } from './Board';
import { ownerBonus } from '../abilities';
import { chanceBonus } from '../chances';
import { gradeRank } from '../rules';

/** 승급 실패 이유: 판이 끝남 / 그 칸에 타워가 없음 / 남의 타워 / 승급할 수 없는 등급(레전드·신·히든) / 같은 종류가 모자람 */
export type MergeFail = 'phase' | 'noTower' | 'notOwner' | 'maxGrade' | 'count';

/** 그 플레이어의 같은 종류 타워 (ID 순 = 소환 순). */
export function sameKindTowers(world: World, towerId: string, owner: number): Tower[] {
  const out: Tower[] = [];
  for (const e of world.entities.list()) if (isTower(e) && e.tower === towerId && e.owner === owner) out.push(e);
  return out;
}

/** 승급할 수 있는 묶음 하나: 타워 종류, 판 위 수, 가장 먼저 소환된 타워. */
export interface MergeGroup {
  tower: string;
  count: number;
  first: Tower;
}

/**
 * 그 플레이어가 지금 승급할 수 있는 묶음 (같은 종류 3개 이상 + 승급할 수 있는 등급). 가장 먼저 소환된 타워 순.
 * 화면의 '⬆ 승급 가능 n' 버튼·알림이 읽는다 (상태를 바꾸지 않음).
 */
export function mergeableGroups(ctx: MatchContext, world: World, player: number): MergeGroup[] {
  const byKind = new Map<string, MergeGroup>();
  for (const e of world.entities.list()) {
    if (!isTower(e) || e.owner !== player) continue;
    const g = byKind.get(e.tower);
    if (g) g.count += 1;
    else byKind.set(e.tower, { tower: e.tower, count: 1, first: e });
  }
  const out: MergeGroup[] = [];
  for (const g of byKind.values()) {
    const grade = ctx.rules.towers.get(g.tower)?.grade;
    if (grade && canMergeGrade(grade) && g.count >= ctx.rules.mergeCount) out.push(g);
  }
  return out.sort((a, b) => a.first.id - b.first.id);
}

/** 칸의 타워 (없으면 undefined). */
function towerOn(world: World, x: number, y: number): Tower | undefined {
  for (const e of world.entities.list()) if (isTower(e) && e.tx === x && e.ty === y) return e;
  return undefined;
}

export type MergeCheck = { ok: true; anchor: Tower; group: Tower[] } | { ok: false; reason: MergeFail };

/**
 * 칸 (x, y)의 타워를 승급할 수 있는지 (정보 패널 버튼과 명령 실행이 같이 쓴다).
 * 순서: 판 진행 중 → 타워 있음 → 내 타워 → 승급할 수 있는 등급 → 같은 종류 3개 이상.
 */
export function mergeCheck(ctx: MatchContext, world: World, player: number, x: number, y: number): MergeCheck {
  if (ctx.state.phase !== 'playing') return { ok: false, reason: 'phase' };
  const anchor = towerOn(world, x, y);
  if (!anchor) return { ok: false, reason: 'noTower' };
  if (anchor.owner !== player) return { ok: false, reason: 'notOwner' };
  const stats = ctx.rules.towers.get(anchor.tower);
  if (!stats) throw new Error(`없는 타워: ${anchor.tower}`);
  if (!canMergeGrade(stats.grade)) return { ok: false, reason: 'maxGrade' };
  const group = sameKindTowers(world, anchor.tower, player);
  if (group.length < ctx.rules.mergeCount) return { ok: false, reason: 'count' };
  return { ok: true, anchor, group };
}

/** 함께 사라질 타워: anchor를 뺀 group 중 가장 나중에 소환된(ID가 큰) n개 (ID 내림차순). */
export function pickConsumed(group: readonly Tower[], anchor: Tower, n: number): Tower[] {
  const others = group.filter((t) => t.id !== anchor.id);
  others.sort((a, b) => b.id - a.id);
  return others.slice(0, n);
}

/** 승급 한 번 (검사는 끝났다고 본다): anchor + 가장 나중 2개를 지우고 anchor 자리에 결과를 놓는다. */
function mergeOnce(ctx: MatchContext, world: World, player: number, anchor: Tower, group: readonly Tower[]): Tower {
  return mergeCore(ctx, world, player, anchor, pickConsumed(group, anchor, ctx.rules.mergeCount - 1), null);
}

/**
 * 승급 핵심 (예전 merge·mergeAll과 G-1 칸 무더기 승급이 같이 쓴다): anchor와 consumed를 지우고 결과 하나를 놓는다.
 * @param place 결과를 놓을 칸을 고르는 함수 (지운 뒤에 불린다, 결과 타워 id를 받는다). null이면 anchor 칸
 */
function mergeCore(
  ctx: MatchContext,
  world: World,
  player: number,
  anchor: Tower,
  consumed: readonly Tower[],
  place: ((towerId: string) => readonly [number, number]) | null,
): Tower {
  const stats = ctx.rules.towers.get(anchor.tower);
  if (!stats) throw new Error(`없는 타워: ${anchor.tower}`);
  const deck = ctx.decks[player] ?? ctx.rules.baseDeck;
  // 2등급 상승: 행운의 여신 + 개발자 확률 조정 'mergeDouble' (T-2)
  const doubleBp = ownerBonus(ctx, world, player, (def, p) => def.mergeDoubleBp?.(p)) + chanceBonus(ctx.state, 'mergeDouble');
  const rng = world.rng(streamSummon(player));
  const roll = rollMerge(rng, ctx.rules, deck, stats.grade, doubleBp, godChanceFor(ctx, player));
  world.entities.remove(anchor.id);
  for (const t of consumed) world.entities.remove(t.id);
  // 재료로 사라진 타워에 걸려 있던 '결과 2개 중 선택'은 지운다
  const gone = new Set<number>([anchor.id, ...consumed.map((t) => t.id)]);
  if (ctx.state.mergePicks.length > 0) ctx.state.mergePicks = ctx.state.mergePicks.filter((m) => !gone.has(m.id));
  const at = place ? place(roll.tower) : ([anchor.tx, anchor.ty] as const);
  const result = placeTower(world, roll.tower, player, at[0], at[1]);
  ctx.state.merges += 1;
  // 카드 '승급의 축복': 같은 등급의 다른 결과 하나를 고를 수 있게
  const perks = ctx.state.perks[player];
  const resultGrade = ctx.rules.towers.get(roll.tower)?.grade;
  if (perks && perks.mergeChoices > 0 && !roll.god && resultGrade && isDeckGrade(resultGrade)) {
    const pool = deck[resultGrade].filter((id) => id !== roll.tower);
    if (pool.length > 0) {
      const alt = rng.pick(pool);
      perks.mergeChoices -= 1;
      ctx.state.mergePicks.push({ player, id: result.id, alt });
      world.emit('mergeChoice', { player, id: result.id, tower: roll.tower, alt, x: at[0], y: at[1] });
    }
  }
  const grade = ctx.rules.towers.get(roll.tower)?.grade ?? '';
  world.emit('merge', {
    player,
    id: result.id,
    from: anchor.id,
    fromTower: anchor.tower,
    tower: roll.tower,
    grade,
    god: roll.god,
    double: roll.double,
    x: at[0],
    y: at[1],
    // 함께 사라진 칸 (예전 승급과 같은 값). 결과가 다른 칸으로 가면(G-1 무더기 합류) anchor 칸도 앞에 넣는다
    removed: [...(at[0] !== anchor.tx || at[1] !== anchor.ty ? [anchor] : []), ...consumed].map((t) => `${t.tx},${t.ty}`).join(';'),
  });
  return result;
}

/** merge 명령 실행. 성공하면 결과 타워, 실패하면 null (mergeFail 사건). */
export function merge(ctx: MatchContext, world: World, player: number, x: number, y: number): Tower | null {
  const check = mergeCheck(ctx, world, player, x, y);
  if (!check.ok) {
    world.emit('mergeFail', { player, x, y, reason: check.reason });
    return null;
  }
  return mergeOnce(ctx, world, player, check.anchor, check.group);
}

/** 모두 승급하면 몇 번 승급하는가: 승급마다 같은 종류가 3개씩 빠지므로(결과는 다음 등급) ⌊n ÷ 3⌋번. 7개 → 2회, 1개 남음. */
export function mergeAllCount(groupSize: number, mergeCount: number): number {
  return groupSize >= mergeCount ? Math.floor(groupSize / mergeCount) : 0;
}

/** mergeAll 명령 실행. 결과 타워 목록 (실패하면 빈 배열 + mergeFail 사건). */
export function mergeAll(ctx: MatchContext, world: World, player: number, x: number, y: number): Tower[] {
  const check = mergeCheck(ctx, world, player, x, y);
  if (!check.ok) {
    world.emit('mergeFail', { player, x, y, reason: check.reason });
    return [];
  }
  const kind = check.anchor.tower;
  const out: Tower[] = [mergeOnce(ctx, world, player, check.anchor, check.group)];
  for (;;) {
    const group = sameKindTowers(world, kind, player);
    if (group.length < ctx.rules.mergeCount) break;
    // 다음 결과 자리 = 남은 같은 종류 중 가장 먼저 소환된 타워
    out.push(mergeOnce(ctx, world, player, group[0] as Tower, group));
  }
  return out;
}

/** 승급의 축복 고르기 실패 이유: 판이 끝남 / 그 선택이 없음 / 타워가 없음 / 바꾼 타워를 놓을 자리가 없음 (V2 H1) */
export type MergePickFail = 'phase' | 'none' | 'gone' | 'full';

/**
 * pickMerge 명령 (카드 '승급의 축복'): 결과 타워 id의 선택을 정한다. pick 1 = alt로 바꿈 (같은 엔티티, 판 내 스택·타이머 새로),
 * pick 0 = 처음 결과 그대로. 성공하면 true ('mergePicked' 사건 {…, changed, moved}), 실패하면 false ('mergePickFail').
 *
 * V2 검토 H1 (한 칸 = 한 타워): 결과 타워가 혼자인 칸이면 그 자리에서 바꾼다 (예전과 같음). 무더기(2개 이상) 안이면 바꾼 타워를
 * ① alt 타워의 덜 찬 내 무더기(바닥 ID 순 첫째) → ② 빈 배치 칸(자동 소환 칸)으로 옮긴다 (moved = true).
 * 둘 다 없으면 바꾸지 않고 'mergePickFail' { reason: 'full' } — 선택은 사라지고(창이 닫힘) 축복 1회는 돌려준다 (perks.mergeChoices + 1).
 */
export function pickMerge(ctx: MatchContext, world: World, player: number, id: number, pick: number): boolean {
  const { state } = ctx;
  const fail = (reason: MergePickFail): false => {
    world.emit('mergePickFail', { player, id, reason });
    return false;
  };
  if (state.phase !== 'playing') return fail('phase');
  const i = state.mergePicks.findIndex((m) => m.player === player && m.id === id);
  if (i < 0) return fail('none');
  const choice = state.mergePicks[i] as (typeof state.mergePicks)[number];
  state.mergePicks.splice(i, 1);
  const e = world.entities.get(id);
  if (!e || !isTower(e) || e.owner !== player) return fail('gone');
  let moved = false;
  if (pick === 1) {
    if (towersAt(world, e.tx, e.ty).length > 1) {
      const to = joinableStack(ctx, world, player, choice.alt) ?? freePad(ctx, world, null);
      if (!to) {
        const perks = state.perks[player];
        if (perks) perks.mergeChoices += 1;
        return fail('full');
      }
      const c = tileCenter(to[0], to[1]);
      e.tx = to[0];
      e.ty = to[1];
      e.x = c.x;
      e.y = c.y;
      moved = true;
    }
    e.tower = choice.alt;
    e.atkAcc = ATTACK_COST;
    e.remDmg = 0;
    e.abilityAt = -1;
    e.stacks = 0;
    e.stackTarget = 0;
  }
  world.emit('mergePicked', { player, id, tower: e.tower, x: e.tx, y: e.ty, changed: pick === 1, moved });
  return true;
}

// ---------------------------------------------------------------- G-1 칸 무더기 승급 · 연쇄 승급

/** 무더기 승급 실패 이유: 예전 이유 + 칸이 아직 가득 차지 않음('stack') */
export type StackMergeFail = MergeFail | 'stack';

/** 그 칸의 무더기 (ID 순). */
export function stackOn(world: World, x: number, y: number): Tower[] {
  return towersAt(world, x, y);
}

/**
 * 칸 (x, y)의 무더기를 승급할 수 있는지 (G-1: 같은 타워가 merge.count(= board.stackMax)개 쌓인 칸만 승급한다).
 * 순서: 판 진행 중 → 타워 있음 → 내 타워 → 승급할 수 있는 등급 → 칸이 가득 참 + 모두 같은 타워.
 */
export function stackMergeCheck(ctx: MatchContext, world: World, player: number, x: number, y: number): { ok: true; stack: Tower[] } | { ok: false; reason: StackMergeFail } {
  if (ctx.state.phase !== 'playing') return { ok: false, reason: 'phase' };
  const stack = stackOn(world, x, y);
  const anchor = stack[0];
  if (!anchor) return { ok: false, reason: 'noTower' };
  if (anchor.owner !== player) return { ok: false, reason: 'notOwner' };
  const stats = ctx.rules.towers.get(anchor.tower);
  if (!stats) throw new Error(`없는 타워: ${anchor.tower}`);
  if (!canMergeGrade(stats.grade)) return { ok: false, reason: 'maxGrade' };
  // 칸이 덜 찼거나, 다른 타워가 섞였으면 무더기가 아니다 (V2 H1 — 섞인 칸이 다른 타워를 재료로 먹지 않게)
  if (stack.length < ctx.rules.mergeCount || !isUniformStack(stack)) return { ok: false, reason: 'stack' };
  return { ok: true, stack };
}

/** 승급할 수 있는 가득 찬 무더기 (내 것, 바닥 타워 ID 순) — kind를 주면 그 타워만. */
export function fullStacks(ctx: MatchContext, world: World, player: number, kind?: string): Tower[][] {
  const out: Tower[][] = [];
  for (const list of towerStacks(world).values()) {
    const first = list[0] as Tower;
    if (first.owner !== player || list.length < ctx.rules.mergeCount || !isUniformStack(list)) continue;
    if (kind !== undefined && first.tower !== kind) continue;
    const g = ctx.rules.towers.get(first.tower)?.grade;
    if (!g || !canMergeGrade(g)) continue;
    out.push(list);
  }
  return out.sort((a, b) => (a[0] as Tower).id - (b[0] as Tower).id);
}

/** 무더기 하나 승급: 칸의 타워를 모두 지우고 결과는 같은 타워의 덜 찬 무더기로, 없으면 그 칸에 (G-1 사용자 결정). */
function mergeStackOnce(ctx: MatchContext, world: World, player: number, stack: readonly Tower[]): Tower {
  const anchor = stack[0] as Tower;
  const consumed = stack.slice(1, ctx.rules.mergeCount);
  return mergeCore(ctx, world, player, anchor, consumed, (towerId) => joinableStack(ctx, world, player, towerId) ?? [anchor.tx, anchor.ty]);
}

/** 연쇄 승급 본체 (mergeStack·mergeAllStacks가 같이 쓴다): stack부터 같은 타워 → 이번 결과 타워 순으로 최대 merge.chainMax번. */
function chainFrom(ctx: MatchContext, world: World, player: number, first: Tower[]): Tower[] {
  const out: Tower[] = [];
  let kind = (first[0] as Tower).tower;
  let next: Tower[] | null = first;
  while (next && out.length < ctx.rules.mergeChainMax) {
    const result = mergeStackOnce(ctx, world, player, next);
    out.push(result);
    if (ctx.state.phase !== 'playing') break;
    next = fullStacks(ctx, world, player, kind)[0] ?? null;
    if (!next) {
      // 같은 타워가 끝나면: 이번 연쇄에서 나온 결과 타워들의 가득 찬 무더기 (바닥 ID 순 첫째) → 그 타워로 이어 간다
      const made = new Set(out.map((t) => t.tower));
      next = fullStacks(ctx, world, player).find((st) => made.has((st[0] as Tower).tower)) ?? null;
      if (next) kind = (next[0] as Tower).tower;
    }
  }
  return out;
}

/**
 * 연쇄 승급 (G-1 mergeStack 명령): 칸 (x, y)의 가득 찬 무더기를 승급하고, 같은 타워의 가득 찬 무더기가 남아 있으면 이어서(바닥 ID 순),
 * 없으면 이번 연쇄에서 나온 결과 타워의 가득 찬 무더기(바닥 ID 순 첫째)로 이어 간다. 한 번에 최대 merge.chainMax번.
 * 승급마다 평소 'merge' 사건 (미션·연출·소리가 한 번씩 센다), 두 번 이상이면 끝에 'mergeChain' { player, steps }.
 * 실패하면 상태·난수를 바꾸지 않고 'mergeFail' { reason } (칸이 덜 찼으면 'stack').
 * @returns 결과 타워들 (승급 순)
 */
export function mergeStack(ctx: MatchContext, world: World, player: number, x: number, y: number): Tower[] {
  const check = stackMergeCheck(ctx, world, player, x, y);
  if (!check.ok) {
    world.emit('mergeFail', { player, x, y, reason: check.reason });
    return [];
  }
  const out = chainFrom(ctx, world, player, check.stack);
  if (out.length > 1) world.emit('mergeChain', { player, steps: out.length, x, y });
  return out;
}

/**
 * 모두 승급 (피드백 #26 mergeAllStacks 명령, 맵 오른쪽 위 [⏫ 모두 승급]): 승급할 수 있는 내 가득 찬 무더기(바닥 ID 순 첫째)부터
 * mergeStack과 같은 연쇄 규칙으로 승급하고, 가득 찬 무더기가 남지 않을 때까지 되풀이한다 (승급마다 타워가 2개씩 줄어 반드시 끝난다).
 * 승급마다 평소 'merge' 사건, 끝에 'mergeAllStacks' { player, steps } 하나 (연쇄마다 'mergeChain'을 내지 않는다 — 알림이 쌓이지 않게).
 * 승급할 무더기가 없거나 판이 끝났으면 상태·난수를 바꾸지 않고 'mergeFail' { reason: 'none' | 'phase', x: -1, y: -1 }.
 * @returns 결과 타워들 (승급 순)
 */
export function mergeAllStacks(ctx: MatchContext, world: World, player: number): Tower[] {
  const fail = (reason: 'phase' | 'none'): Tower[] => {
    world.emit('mergeFail', { player, x: -1, y: -1, reason });
    return [];
  };
  if (ctx.state.phase !== 'playing') return fail('phase');
  let next = fullStacks(ctx, world, player)[0];
  if (!next) return fail('none');
  const out: Tower[] = [];
  while (next && ctx.state.phase === 'playing') {
    out.push(...chainFrom(ctx, world, player, next));
    next = fullStacks(ctx, world, player)[0];
  }
  world.emit('mergeAllStacks', { player, steps: out.length });
  return out;
}

/**
 * 자동 승급할 무더기 (피드백 #63, 화면 설정 '자동 승급'이 읽는다 — 상태를 바꾸지 않음): 승급할 수 있는 내 가득 찬 무더기 중
 * 등급 번호(rules.gradeRank: 노말 1 · 레어 2 · 유니크 3 · 히어로 4)가 maxRank 이하인 것, 바닥 ID 순. 판이 끝났으면 빈 목록.
 * 화면은 첫째 칸에 평소 mergeStack 명령을 보낸다 (리플레이에 그대로 남는다 — 새 명령 종류 없음).
 */
export function autoMergeStacks(ctx: MatchContext, world: World, player: number, maxRank: number): Tower[][] {
  if (ctx.state.phase !== 'playing' || maxRank <= 0) return [];
  return fullStacks(ctx, world, player).filter((st) => {
    const g = ctx.rules.towers.get((st[0] as Tower).tower)?.grade;
    return g !== undefined && gradeRank(g) <= maxRank;
  });
}

/**
 * 승급할 수 있는 무더기 묶음 (G-1 화면용 — 예전 mergeableGroups 자리): 가득 찬 내 무더기마다 하나, 바닥 ID 순.
 * first = 무더기 바닥 타워 (그 칸을 누르면 mergeStack), count = 그 칸 타워 수.
 */
export function mergeableStackGroups(ctx: MatchContext, world: World, player: number): MergeGroup[] {
  return fullStacks(ctx, world, player).map((st) => ({ tower: (st[0] as Tower).tower, count: st.length, first: st[0] as Tower }));
}
