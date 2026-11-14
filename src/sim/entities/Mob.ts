/**
 * 몹 엔티티. World.entities에 kind = 'mob'으로 들어간다 (ID 순 반복, 해시에 포함).
 * 모든 값은 정수·문자열·불리언 (hash.ts가 소수를 거부한다).
 */
import type { Entity, World } from '../World';

export const MOB_KIND = 'mob';

export interface Mob extends Entity {
  kind: typeof MOB_KIND;
  /** 데이터 id (enemies.json mobs[].id) */
  mob: string;
  /** 나온 단계 */
  stage: number;
  hp: number;
  maxHp: number;
  armor: number;
  magicRes: number;
  /** 기본 이동 속도 (단위/초) */
  speed: number;
  ccResistBp: number;
  /** 캠페인에서 출구에 닿으면 잃는 목숨 */
  lifeDamage: number;
  /** 처치 보상 (원) */
  reward: number;
  /** 경로를 따라 걸은 거리 (단위). loop 맵에서는 계속 늘어난다 */
  progress: number;
  /** 이동 나머지 (0 ~ TICK_HZ-1): 속도/20이 정수가 아니어도 오차 없이 걷게 */
  moveRem: number;
  /** 떼 안에서 몇 번째인가 (0부터, 화면이 살짝 옆으로 벌려 그린다) */
  swarmIndex: number;
  invisible: boolean;
  legion: string;
  /** 보스·도전 보스인가 (보스 피해 배율·보스 우선 대상, M4에서 보스가 나온다) */
  boss: boolean;
  /**
   * 받는 피해 증가 합 (bp, 약화·빙결 등, GDD 5.4·5.5). 피해 계산 때 game.json combat.vulnMax(+100%)로 자른다.
   * 걸고 푸는 것(지속 시간)은 상태 이상 시스템(M3-6)이 맡는다.
   */
  vulnBp: number;
  /** 표식: 방어력·마법 저항 감소 (bp, 가장 강한 것만). 타워의 방어·마법 관통 합에 더해진다 (최대 90%). M3-6이 건다 */
  markBp: number;
}

export function isMob(e: Entity): e is Mob {
  return e.kind === MOB_KIND;
}

/** 살아 있는 몹 (ID 순). */
export function listMobs(world: World): Mob[] {
  const out: Mob[] = [];
  for (const e of world.entities.list()) if (isMob(e)) out.push(e);
  return out;
}

/** 맵 위 몹 수 (떼는 마리마다 1). */
export function countMobs(world: World): number {
  let n = 0;
  for (const e of world.entities.list()) if (e.kind === MOB_KIND) n++;
  return n;
}
