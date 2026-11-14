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
 * - 성공하면 승급마다 `merge` 사건 { player, id(새 타워), from(터치한 타워), fromTower, tower, grade, god, x, y, removed("x,y;x,y") }.
 * 승급 개수(3)는 game.json merge.count.
 */
import type { World } from '../World';
import { streamSummon } from '../World';
import { isTower, type Tower } from '../entities/Tower';
import { canMergeGrade, rollMerge } from '../Deck';
import type { MatchContext } from '../state';
import { placeTower } from './Summon';

/** 승급 실패 이유: 판이 끝남 / 그 칸에 타워가 없음 / 남의 타워 / 승급할 수 없는 등급(레전드·신·히든) / 같은 종류가 모자람 */
export type MergeFail = 'phase' | 'noTower' | 'notOwner' | 'maxGrade' | 'count';

/** 그 플레이어의 같은 종류 타워 (ID 순 = 소환 순). */
export function sameKindTowers(world: World, towerId: string, owner: number): Tower[] {
  const out: Tower[] = [];
  for (const e of world.entities.list()) if (isTower(e) && e.tower === towerId && e.owner === owner) out.push(e);
  return out;
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
  const roll = rollMerge(world.rng(streamSummon(player)), ctx.rules, deck, stats.grade);
  world.entities.remove(anchor.id);
  for (const t of consumed) world.entities.remove(t.id);
  const result = placeTower(world, roll.tower, player, anchor.tx, anchor.ty);
  ctx.state.merges += 1;
  const grade = ctx.rules.towers.get(roll.tower)?.grade ?? '';
  world.emit('merge', {
    player,
    id: result.id,
    from: anchor.id,
    fromTower: anchor.tower,
    tower: roll.tower,
    grade,
    god: roll.god,
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
