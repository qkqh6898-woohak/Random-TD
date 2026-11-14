/**
 * 투사체 엔티티 (DEV_PLAN M2-5, GDD 5.2). World.entities에 kind = 'projectile'로 들어간다.
 *
 * - 원거리 타워가 쏘면 타워 칸 중심에서 출발해 대상 몹의 지금 위치로 틱마다 일정 거리(초속 12칸 = 600단위/틱)씩 날아간다 (따라감).
 * - 남은 거리가 한 틱 거리 이하이면 도착 → 피해. 날아가는 중 대상이 죽거나 사라지면 그 자리에서 사라진다 (헛발).
 * - 1회 공격력(방어 적용 전, 공격력 × ATK_SCALE 정수)은 쏠 때 정해 싣는다. 방어·마법 저항은 도착할 때 대상 값으로 깎고,
 *   쏜 타워의 피해 나머지를 더해 정수 피해로 자른다 (Combat.applyHit).
 * 모든 값은 정수 (위치는 단위, 1칸 = 1000).
 */
import type { Entity, World } from '../World';
import { isqrt } from '../Fixed';

export const PROJECTILE_KIND = 'projectile';

export interface Projectile extends Entity {
  kind: typeof PROJECTILE_KIND;
  /** 쏜 타워 엔티티 id */
  source: number;
  /** 쏜 타워의 데이터 id (그림용) */
  tower: string;
  /** 대상 몹 엔티티 id */
  target: number;
  x: number;
  y: number;
  /** 도착 때 줄 1회 공격력 (방어 적용 전, × ATK_SCALE 정수): 물리·마법·고정 */
  dmgP: number;
  dmgM: number;
  dmgT: number;
  /** 한 틱에 움직이는 거리 (단위) */
  speed: number;
}

export function isProjectile(e: Entity): e is Projectile {
  return e.kind === PROJECTILE_KIND;
}

export function listProjectiles(world: World): Projectile[] {
  const out: Projectile[] = [];
  for (const e of world.entities.list()) if (isProjectile(e)) out.push(e);
  return out;
}

/**
 * (x, y)에서 (tx, ty) 쪽으로 step만큼 움직인 점. 남은 거리가 step 이하이면 도착 (arrived = true, 점 = 목표).
 * 정수만 쓴다: 거리 = 정수 제곱근(내림), 성분 = 0 쪽으로 자름 → 기기와 상관없이 같은 값.
 */
export function stepToward(x: number, y: number, tx: number, ty: number, step: number): { x: number; y: number; arrived: boolean } {
  const dx = tx - x;
  const dy = ty - y;
  const d2 = dx * dx + dy * dy;
  if (d2 <= step * step) return { x: tx, y: ty, arrived: true };
  const d = isqrt(d2); // d > step ≥ 1
  return { x: x + Math.trunc((dx * step) / d), y: y + Math.trunc((dy * step) / d), arrived: false };
}
