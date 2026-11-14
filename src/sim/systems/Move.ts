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
 */
import type { World } from '../World';
import { isTower, type Tower } from '../entities/Tower';
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

/** 지금 공격을 쉬는 중인가 (이동·교환 직후). */
export function isPaused(tower: Pick<Tower, 'pauseUntil'>, tick: number): boolean {
  return tick < tower.pauseUntil;
}
