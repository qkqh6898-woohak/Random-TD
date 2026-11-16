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
 *   ('mergeChoice' 사건). `pickMerge {id, pick}` 명령: pick 1 = 그 자리 타워를 alt로 바꿈(새 판 내 스택), 0 = 그대로. 신 결과면 선택이 없다
 *   (축복도 쓰지 않음). 결과 타워가 다시 승급 재료로 사라지면 그 선택도 사라진다.
 * 승급 개수(3)는 game.json merge.count.
 */
import type { World } from '../World';
import { streamSummon } from '../World';
import { ATTACK_COST, isTower, type Tower } from '../entities/Tower';
import { canMergeGrade, isDeckGrade, rollMerge } from '../Deck';
import type { MatchContext } from '../state';
import { godChanceFor, placeTower } from './Summon';
import { ownerBonus } from '../abilities';
import { chanceBonus } from '../chances';

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
  const stats = ctx.rules.towers.get(anchor.tower);
  if (!stats) throw new Error(`없는 타워: ${anchor.tower}`);
  const consumed = pickConsumed(group, anchor, ctx.rules.mergeCount - 1);
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
  const result = placeTower(world, roll.tower, player, anchor.tx, anchor.ty);
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
      world.emit('mergeChoice', { player, id: result.id, tower: roll.tower, alt, x: anchor.tx, y: anchor.ty });
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
    x: anchor.tx,
    y: anchor.ty,
    removed: consumed.map((t) => `${t.tx},${t.ty}`).join(';'),
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

/** 승급의 축복 고르기 실패 이유: 판이 끝남 / 그 선택이 없음 / 타워가 없음 */
export type MergePickFail = 'phase' | 'none' | 'gone';

/**
 * pickMerge 명령 (카드 '승급의 축복'): 결과 타워 id의 선택을 정한다. pick 1 = alt로 바꿈 (같은 엔티티·같은 칸, 판 내 스택·타이머 새로),
 * pick 0 = 처음 결과 그대로. 성공하면 true ('mergePicked' 사건), 실패하면 false ('mergePickFail').
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
  if (pick === 1) {
    e.tower = choice.alt;
    e.atkAcc = ATTACK_COST;
    e.remDmg = 0;
    e.abilityAt = -1;
    e.stacks = 0;
    e.stackTarget = 0;
  }
  world.emit('mergePicked', { player, id, tower: e.tower, x: e.tx, y: e.ty, changed: pick === 1 });
  return true;
}
