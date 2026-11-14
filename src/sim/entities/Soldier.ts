/**
 * 소환 병사 (소환사 특색, GDD 5.2 '소환', M3-9): 경로를 **거슬러** 걸어가며(진행도가 줄어든다) 닿은 몹을 한 번씩 공격한다.
 * 몹 n마리를 공격하거나 수명이 다하면 사라진다. 스테이지 맵에서 출발점(진행도 0) 뒤로 넘어가도 사라진다.
 * World.entities에 kind = 'soldier'로 들어간다 (ID 순, 해시에 포함). 모든 값은 정수.
 * 피해(1회 공격, × ATK_SCALE)는 소환할 때 소환사 공격력 × 0.8 × 공격력%로 정해 싣는다 (소환사가 승급으로 사라져도 그대로).
 */
import type { Entity, World } from '../World';

export const SOLDIER_KIND = 'soldier';

export interface Soldier extends Entity {
  kind: typeof SOLDIER_KIND;
  /** 만든 타워 엔티티 id·데이터 id·주인 */
  source: number;
  tower: string;
  owner: number;
  /** 경로 진행도 (단위). 줄어드는 쪽으로 걷는다 (loop 맵은 음수도 그대로 — 위치는 길이로 나눈 나머지) */
  progress: number;
  /** 이동 나머지 (0 ~ TICK_HZ − 1) */
  moveRem: number;
  /** 걷는 속도 (단위/초) */
  speed: number;
  /** 닿았다고 보는 거리 (단위) */
  reach: number;
  /** 남은 공격 수 */
  hitsLeft: number;
  /** 이미 공격한 몹 id (같은 몹은 한 번만) */
  hitIds: number[];
  /** 1회 공격 (× ATK_SCALE, 방어 적용 전) */
  dmgP: number;
  dmgM: number;
  dmgT: number;
  armorPenBp: number;
  magicPenBp: number;
  /** 생긴 틱·사라지는 틱 (tick < until 동안 있음) */
  bornTick: number;
  until: number;
}

export function isSoldier(e: Entity): e is Soldier {
  return e.kind === SOLDIER_KIND;
}

export function listSoldiers(world: World): Soldier[] {
  const out: Soldier[] = [];
  for (const e of world.entities.list()) if (isSoldier(e)) out.push(e);
  return out;
}
