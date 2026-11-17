/**
 * 타워 이동·교환 (DEV_PLAN M3-10, GDD 4.5).
 *
 * - `move {fx, fy, tx, ty}`: 칸 (fx, fy)의 내 타워를
 *   - 빈 배치 칸 (tx, ty)으로 옮긴다 (이동), 또는
 *   - (tx, ty)에 내 타워가 있으면 두 타워의 자리를 바꾼다 (교환).
 *   무료, 쿨타임 없음. 경로·장식 칸·남의 타워 칸으로는 못 간다.
 * - 옮긴 타워(교환이면 둘 다)는 0.5초(game.json combat.movePauseSeconds = 10틱) 동안 공격하지 않는다:
 *   명령이 실행된 틱 T부터 T+9틱까지 쉬고 T+10틱부터 다시 공격 (Tower.pauseUntil). 쉬는 동안 공격 타이머는 1회분까지만 모은다.
 * - 날아가는 투사체는 그대로 날아간다 (쏠 때 피해·출발점을 실어 보냈으므로).
 * - 실패하면 상태를 바꾸지 않고 `moveFail` 사건 { player, reason }. 성공하면 `move` 사건 { player, id, fx, fy, tx, ty, swap(교환한 타워 id, 이동이면 0) }.
 * - `hold {x, y, on}`: 길게 눌러 끄는 동안(on = 1) 그 타워는 공격하지 않는다 (GDD 4.5 '이동 중인 타워는 공격하지 않음').
 *   화면은 끌기를 시작할 때 on = 1, 놓을 때 on = 0을 보내고, 옮겼으면 이어서 move를 보낸다 (move도 들어 올림을 푼다).
 *   남의 타워·빈 칸·판이 끝난 뒤는 아무 일 없음. 들어 올림이 바뀌면 `hold` 사건 { player, id, on }.
 *   해석: GDD '이동 중' = 끄는 동안 + 놓은 뒤 0.5초 (DEV_PLAN M3-10 '이동 후 0.5초 공격 정지'는 놓은 뒤 부분).
 */
import type { World } from '../World';
import { isTower, towersAt, type Tower } from '../entities/Tower';
import { isBuildable, tileCenter } from '../map';
import type { MatchContext } from '../state';

/** 이동 실패 이유: 판이 끝남 / 출발 칸에 타워가 없음 / 남의 타워 / 같은 칸 / 배치 칸이 아님 / 도착 칸에 남의 타워 */
export type MoveFail = 'phase' | 'noTower' | 'notOwner' | 'same' | 'notBuildable' | 'otherOwner';

function towerOn(world: World, x: number, y: number): Tower | undefined {
  for (const e of world.entities.list()) if (isTower(e) && e.tx === x && e.ty === y) return e;
  return undefined;
}

export type MoveCheck = { ok: true; tower: Tower; other: Tower | null } | { ok: false; reason: MoveFail };

/** 옮길 수 있는지 (화면의 끌기 미리 보기와 명령 실행이 같이 쓴다). */
export function moveCheck(ctx: MatchContext, world: World, player: number, fx: number, fy: number, tx: number, ty: number): MoveCheck {
  if (ctx.state.phase !== 'playing') return { ok: false, reason: 'phase' };
  const tower = towerOn(world, fx, fy);
  if (!tower) return { ok: false, reason: 'noTower' };
  if (tower.owner !== player) return { ok: false, reason: 'notOwner' };
  if (fx === tx && fy === ty) return { ok: false, reason: 'same' };
  if (!isBuildable(ctx.map, tx, ty)) return { ok: false, reason: 'notBuildable' };
  const other = towerOn(world, tx, ty) ?? null;
  if (other && other.owner !== player) return { ok: false, reason: 'otherOwner' };
  return { ok: true, tower, other };
}

/** 타워를 칸에 놓고 공격을 잠깐 멈춘다. */
function relocate(world: World, tower: Tower, tx: number, ty: number, pauseTicks: number): void {
  const c = tileCenter(tx, ty);
  tower.tx = tx;
  tower.ty = ty;
  tower.x = c.x;
  tower.y = c.y;
  tower.pauseUntil = world.tick + pauseTicks;
  tower.held = false;
}

/** move 명령 실행. 성공하면 true (move 사건), 실패하면 false (moveFail 사건). */
export function moveTower(ctx: MatchContext, world: World, player: number, fx: number, fy: number, tx: number, ty: number): boolean {
  const check = moveCheck(ctx, world, player, fx, fy, tx, ty);
  if (!check.ok) {
    world.emit('moveFail', { player, fx, fy, tx, ty, reason: check.reason });
    return false;
  }
  const pause = ctx.rules.movePauseTicks;
  relocate(world, check.tower, tx, ty, pause);
  if (check.other) relocate(world, check.other, fx, fy, pause);
  ctx.state.moves += 1;
  world.emit('move', { player, id: check.tower.id, fx, fy, tx, ty, swap: check.other ? check.other.id : 0 });
  return true;
}

/** hold 명령 실행: 칸 (x, y)의 내 타워를 들어 올리거나(on = 1) 내려놓는다(on = 0). 바뀌었으면 true. */
export function holdTower(ctx: MatchContext, world: World, player: number, x: number, y: number, on: boolean): boolean {
  if (ctx.state.phase !== 'playing') return false;
  const tower = towerOn(world, x, y);
  if (!tower || tower.owner !== player || tower.held === on) return false;
  tower.held = on;
  world.emit('hold', { player, id: tower.id, on });
  // G-1 칸 무더기: 같은 칸의 나머지 타워도 함께 (무더기 하나를 통째로 끈다). 타워가 하나면 예전과 같다
  for (const t of towersAt(world, x, y)) if (t.id !== tower.id && t.owner === player) t.held = on;
  return true;
}

/**
 * 무더기 이동 (G-1 moveStack 명령): 칸 (fx, fy)의 내 타워 무더기를 통째로 옮긴다.
 * - 빈 배치 칸이면 이동, 내 무더기가 있으면: 같은 타워이고 합쳐서 board.stackMax 이하면 **합치기**, 아니면 **교환**.
 * - 이동한 타워는 모두 0.5초 공격 정지. 'move' 사건 {player, id(맨 위), fx, fy, tx, ty, swap(교환된 맨 위 id 또는 0), merged(합침), n}.
 * - 실패 이유는 move와 같다 ('moveFail').
 */
export function moveStack(ctx: MatchContext, world: World, player: number, fx: number, fy: number, tx: number, ty: number): boolean {
  const check = moveCheck(ctx, world, player, fx, fy, tx, ty);
  if (!check.ok) {
    world.emit('moveFail', { player, fx, fy, tx, ty, reason: check.reason });
    return false;
  }
  const pause = ctx.rules.movePauseTicks;
  const from = towersAt(world, fx, fy);
  const to = towersAt(world, tx, ty);
  const top = from[from.length - 1] as Tower;
  const merged = to.length > 0 && (to[0] as Tower).tower === top.tower && from.length + to.length <= ctx.rules.stackMax;
  for (const t of from) relocate(world, t, tx, ty, pause);
  if (!merged) for (const t of to) relocate(world, t, fx, fy, pause);
  ctx.state.moves += 1;
  const swap = !merged && to.length > 0 ? (to[to.length - 1] as Tower).id : 0;
  world.emit('move', { player, id: top.id, fx, fy, tx, ty, swap, merged, n: from.length });
  return true;
}

/** 지금 공격을 쉬는 중인가 (끄는 중, 또는 이동·교환 직후). */
export function isPaused(tower: Pick<Tower, 'pauseUntil' | 'held'> & Partial<Pick<Tower, 'stunUntil'>>, tick: number): boolean {
  return tower.held || tick < tower.pauseUntil || tick < (tower.stunUntil ?? 0);
}
