/**
 * 신화 조합 (G-1 도감, GDD 4.7 히든 조합 — 화면 이름 '신화'). towers.json 히든 타워의 recipe가 조합식이다.
 *
 * - 명령 `craft {r}`: r번째 조합 (rules.recipes = towers.json의 히든 타워 순서). 재료 타워가 **모두 내 판 위에** 있어야 한다
 *   (같은 재료가 여럿이면 그 수만큼 — 고블린 대왕은 고블린 3개).
 * - 재료 고르기: 재료 순서대로, 그 종류의 내 타워 중 가장 나중에 소환된 것(ID가 큰 것)부터. 고른 재료는 모두 사라진다.
 * - 결과 칸: 재료를 지워 **비게 되는 칸** 중 재료 순서가 가장 앞인 칸 → 같은 신화의 덜 찬 무더기 → 자동 빈 칸. 셋 다 없으면 실패 'full'
 *   (상태·난수를 바꾸지 않는다). 난수는 쓰지 않는다.
 * - 성공: 'craft' 사건 {player, r, id, tower, x, y, removed: "x,y;…"} — 화면이 도감에 '발견'을 남긴다 (계정 저장, src/meta/account.ts).
 *   state.crafts += 1. 실패: 'craftFail' {player, r, reason}.
 * - G-3 히든 해방: 잠긴 신화는 재료가 모여도 'locked' (src/sim/unlocks.ts isHiddenLocked — 이 갈래에서는 늘 열림).
 */
import type { World } from '../World';
import { isTower, type Tower } from '../entities/Tower';
import type { MatchContext } from '../state';
import { freePad, joinableStack } from './Board';
import { placeTower } from './Summon';
import { isHiddenLocked } from '../unlocks';

/** 조합 실패 이유: 판이 끝남 / 없는 조합 / 아직 해방하지 않은 신화 (G-3) / 재료가 모자람 / 결과를 놓을 칸이 없음 */
export type CraftFail = 'phase' | 'unknown' | 'locked' | 'material' | 'full';

export type CraftPlan = { ok: true; materials: Tower[]; at: readonly [number, number] } | { ok: false; reason: CraftFail };

/** 재료별 내 타워 수가 조합식을 채우는가 (판 위 타워 종류 → 수). 화면 도감의 '모두 모였어요'도 이것. */
export function recipeReady(materials: readonly string[], owned: ReadonlyMap<string, number>): boolean {
  const need = new Map<string, number>();
  for (const id of materials) need.set(id, (need.get(id) ?? 0) + 1);
  for (const [id, n] of need) if ((owned.get(id) ?? 0) < n) return false;
  return true;
}

/** 그 플레이어의 판 위 타워 종류 → 수. */
export function ownedCounts(world: World, player: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of world.entities.list()) if (isTower(e) && e.owner === player) out.set(e.tower, (out.get(e.tower) ?? 0) + 1);
  return out;
}

/** 조합 계획 (검사 + 고를 재료 + 결과 칸). 상태를 바꾸지 않는다 — 화면 [제작] 버튼과 명령이 같이 쓴다. */
export function craftPlan(ctx: MatchContext, world: World, player: number, r: number): CraftPlan {
  if (ctx.state.phase !== 'playing') return { ok: false, reason: 'phase' };
  const recipe = ctx.rules.recipes[r];
  if (!recipe) return { ok: false, reason: 'unknown' };
  if (isHiddenLocked(ctx, player, recipe.id)) return { ok: false, reason: 'locked' };
  const mine: Tower[] = [];
  for (const e of world.entities.list()) if (isTower(e) && e.owner === player) mine.push(e);
  const chosen: Tower[] = [];
  const used = new Set<number>();
  for (const id of recipe.materials) {
    let pick: Tower | null = null;
    for (const t of mine) if (t.tower === id && !used.has(t.id) && (pick === null || t.id > pick.id)) pick = t;
    if (!pick) return { ok: false, reason: 'material' };
    used.add(pick.id);
    chosen.push(pick);
  }
  // 비게 되는 칸 (그 칸 타워가 모두 재료)
  const left = new Map<string, number>();
  for (const e of world.entities.list()) if (isTower(e)) left.set(`${e.tx},${e.ty}`, (left.get(`${e.tx},${e.ty}`) ?? 0) + 1);
  for (const t of chosen) left.set(`${t.tx},${t.ty}`, (left.get(`${t.tx},${t.ty}`) ?? 0) - 1);
  let at: readonly [number, number] | null = null;
  for (const t of chosen) {
    if (left.get(`${t.tx},${t.ty}`) === 0) {
      at = [t.tx, t.ty];
      break;
    }
  }
  at ??= joinableStack(ctx, world, player, recipe.id, used) ?? freePad(ctx, world, null);
  if (!at) return { ok: false, reason: 'full' };
  return { ok: true, materials: chosen, at };
}

/** craft 명령 실행. 성공하면 만든 신화 타워, 실패하면 null ('craftFail'). */
export function craft(ctx: MatchContext, world: World, player: number, r: number): Tower | null {
  const plan = craftPlan(ctx, world, player, r);
  if (!plan.ok) {
    world.emit('craftFail', { player, r, reason: plan.reason });
    return null;
  }
  const recipe = ctx.rules.recipes[r] as MatchContext['rules']['recipes'][number];
  const gone = new Set<number>();
  for (const t of plan.materials) {
    world.entities.remove(t.id);
    gone.add(t.id);
  }
  if (ctx.state.mergePicks.length > 0) ctx.state.mergePicks = ctx.state.mergePicks.filter((m) => !gone.has(m.id));
  const result = placeTower(world, recipe.id, player, plan.at[0], plan.at[1]);
  ctx.state.crafts += 1;
  world.emit('craft', {
    player,
    r,
    id: result.id,
    tower: recipe.id,
    x: plan.at[0],
    y: plan.at[1],
    removed: plan.materials.map((t) => `${t.tx},${t.ty}`).join(';'),
  });
  return result;
}
