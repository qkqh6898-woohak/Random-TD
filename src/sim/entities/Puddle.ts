/**
 * 진흙 웅덩이 (진흙 주술사 특색, M3-9): 경로 위 한 점 둘레(반경 r)에 잠깐 생기고, 그 안을 지나는 몹을 둔화시킨다.
 * World.entities에 kind = 'puddle'로 들어간다 (ID 순, 해시에 포함). 모든 값은 정수.
 * 능력 시스템(Abilities)이 틱마다 안에 있는 몹에게 둔화(1틱짜리, 안에 있는 동안 계속 갱신)를 걸고, 시간이 다 되면 지운다.
 */
import type { Entity, World } from '../World';

export const PUDDLE_KIND = 'puddle';

export interface Puddle extends Entity {
  kind: typeof PUDDLE_KIND;
  /** 만든 타워 엔티티 id·데이터 id·주인 */
  source: number;
  tower: string;
  owner: number;
  /** 가운데 (단위) */
  x: number;
  y: number;
  /** 반경 (단위) */
  r: number;
  /** 지나가는 몹 둔화 (bp) */
  slowBp: number;
  /** 생긴 틱·사라지는 틱 (tick < until 동안 있음) */
  bornTick: number;
  until: number;
}

export function isPuddle(e: Entity): e is Puddle {
  return e.kind === PUDDLE_KIND;
}

export function listPuddles(world: World): Puddle[] {
  const out: Puddle[] = [];
  for (const e of world.entities.list()) if (isPuddle(e)) out.push(e);
  return out;
}
