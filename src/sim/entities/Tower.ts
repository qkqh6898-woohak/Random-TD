/**
 * 타워 엔티티 (DEV_PLAN M2-1·M2-4). World.entities에 kind = 'tower'로 들어간다 (ID 순 반복, 해시에 포함).
 *
 * - 고정 스탯(사거리·공속·공격력)은 데이터에서 만든 MatchRules.towers에서 id로 찾는다 → 엔티티에는 바뀌는 값만.
 * - 위치: 칸 (tx, ty)과 칸 중심 단위 좌표 (x, y). 1칸에 타워 1개 (GDD 4.3). 이동·교환(M3-10)하면 바뀐다.
 * - 소환 순서 = 엔티티 ID (단조 증가). 승급 때 '가장 나중에 소환된 2개'는 ID가 가장 큰 2개다 (M3-1). 승급 결과는 새 엔티티(새 ID).
 * - 공격 타이머 (M2-4, 누적 방식): 틱마다 공속 × 1000을 atkAcc에 더하고, ATTACK_COST(= 1000 × 20)가 찰 때마다 1회 공격.
 *   → 공속 1회/초 = 20틱마다 1회, 12.5회/초 = 1초에 12~13회. 공속이 20회/초를 넘으면 한 틱에 여러 번 공격한다.
 *   대상이 없을 때는 1회분(ATTACK_COST)까지만 모아 둔다 (준비 상태 유지, 여러 발을 쌓아 두지 않음).
 *   소환 직후에는 준비 상태(1회분)로 시작해 사거리에 몹이 있으면 그 틱에 바로 쏜다.
 * 모든 값은 정수·문자열 (hash.ts가 소수를 거부한다).
 */
import type { Entity, World } from '../World';
import { TICK_HZ } from '../World';
import { APS_SCALE } from '../rules';

export const TOWER_KIND = 'tower';

/** 1회 공격에 드는 타이머 값: 공속(× APS_SCALE)을 틱마다 더하므로 APS_SCALE × 틱/초 */
export const ATTACK_COST = APS_SCALE * TICK_HZ;

export interface Tower extends Entity {
  kind: typeof TOWER_KIND;
  /** 데이터 id (towers.json towers[].id) */
  tower: string;
  /** 소환한 플레이어 (0부터) */
  owner: number;
  /** 칸 */
  tx: number;
  ty: number;
  /** 칸 중심 (단위) */
  x: number;
  y: number;
  /** 공격 타이머 누적값 (0 이상). ATTACK_COST 이상이면 공격할 수 있다 */
  atkAcc: number;
  /**
   * 피해 나머지 0~99 (× ATK_SCALE). 1회 피해(방어 적용 후 물리 + 마법 + 고정, × 100)를 정수로 자를 때 남은 몫을 이어 간다
   * → 소수 공격력·방어로 깎인 소수 피해도 평균이 정확하다 (Combat.applyHit).
   */
  remDmg: number;
  /** 놓인 틱 (소환·승급으로 생긴 틱) */
  bornTick: number;
  /** 지금까지 공격한 횟수 */
  attacks: number;
  /**
   * 이 틱부터 다시 공격할 수 있다 (M3-10 이동·교환 뒤 0.5초 정지, GDD 4.5). world.tick < pauseUntil이면 공격하지 않고
   * 공격 타이머는 대상이 없을 때처럼 1회분까지만 모은다.
   */
  pauseUntil: number;
  /**
   * 길게 눌러 끄는 중 (M3-10 hold 명령, GDD 4.5 '이동 중인 타워는 공격하지 않음'). true인 동안 공격하지 않고
   * 타이머는 1회분까지만 모은다. 놓으면(hold off) 또는 옮겨지면(move) false.
   */
  held: boolean;
  /**
   * 주기 특색 능력(진흙 웅덩이·시간 정지·연금·운석·병사 소환, M3-9)이 다음에 발동하는 틱. -1 = 아직 시작 안 함
   * (능력 시스템이 처음 볼 때 '지금 + 주기'로 정한다 → 놓인 뒤 주기만큼 지나야 첫 발동).
   */
  abilityAt: number;
  /** 판 내 스택 (광전사: 같은 대상 연속 공격 수). 승급하면 새 엔티티라 0부터 (GDD 4.4) */
  stacks: number;
  /** 스택을 쌓는 대상 몹 id (광전사, 0 = 없음) */
  stackTarget: number;
  /** 기절 (M4-5 혼돈의 용): tick < stunUntil 동안 공격·주기 능력을 쓰지 않는다 (타이머는 1회분까지만 모음) */
  stunUntil: number;
  /** 필살기 게이지 (G-1, bp — 10000이면 가득). 필살기가 있는 등급만, 처음 공격할 때 생긴다 */
  ult?: number;
}

export function isTower(e: Entity): e is Tower {
  return e.kind === TOWER_KIND;
}

/** 판 위 타워 (ID 순). */
export function listTowers(world: World): Tower[] {
  const out: Tower[] = [];
  for (const e of world.entities.list()) if (isTower(e)) out.push(e);
  return out;
}

/** 그 칸의 타워 (없으면 undefined). */
export function towerAt(world: World, tx: number, ty: number): Tower | undefined {
  for (const e of world.entities.list()) if (isTower(e) && e.tx === tx && e.ty === ty) return e;
  return undefined;
}

/**
 * 공격 타이머 1틱 (상태는 돌려준 누적값으로 바꾼다).
 * ① 누적값이 1회분(ATTACK_COST) 이상이면 찰 때마다 1회 공격 (공속이 20회/초를 넘으면 한 틱에 여러 번)
 * ② 공속만큼 충전
 * ③ 대상이 없어 멈췄으면 1회분까지만 들고 있는다 (쌓아 두지 않음 → 몹이 오면 1발 쏘고 그다음은 정상 간격)
 * 공격을 충전보다 먼저 보므로 간격이 정확히 ATTACK_COST ÷ 공속 틱이다 (1회/초 = 0, 20, 40 … 틱).
 * @param acc 지금 누적값
 * @param apsMilli 공속 × APS_SCALE
 * @param attackOnce 1회분이 찰 때마다 부른다: 대상을 골라 공격하고 true, 대상이 없으면 false
 * @returns 공격 횟수와 새 누적값
 */
export function chargeAttacks(acc: number, apsMilli: number, attackOnce: () => boolean): { shots: number; acc: number } {
  let a = acc;
  let shots = 0;
  let idle = false;
  while (a >= ATTACK_COST) {
    if (!attackOnce()) {
      idle = true;
      break;
    }
    shots++;
    a -= ATTACK_COST;
  }
  a += apsMilli;
  if (idle && a > ATTACK_COST) a = ATTACK_COST;
  return { shots, acc: a };
}

/** 그 칸의 타워 무더기 (G-1 '한 칸에 같은 캐릭터 최대 3개', ID 순 = 쌓인 순). 비었으면 빈 배열. */
export function towersAt(world: World, tx: number, ty: number): Tower[] {
  const out: Tower[] = [];
  for (const e of world.entities.list()) if (isTower(e) && e.tx === tx && e.ty === ty) out.push(e);
  return out;
}

/** 그 칸 무더기의 맨 위 타워 (가장 나중에 쌓인 것 = ID가 가장 큰 것, 없으면 undefined) — 판매·패널이 고르는 타워. */
export function topTowerAt(world: World, tx: number, ty: number): Tower | undefined {
  let top: Tower | undefined;
  for (const e of world.entities.list()) if (isTower(e) && e.tx === tx && e.ty === ty) top = e;
  return top;
}

/** 칸 'x,y' → 그 칸 타워 무더기 (ID 순). 한 틱에 여러 번 찾을 때 한 번 만들어 쓴다. */
export function towerStacks(world: World): Map<string, Tower[]> {
  const out = new Map<string, Tower[]>();
  for (const e of world.entities.list()) {
    if (!isTower(e)) continue;
    const k = `${e.tx},${e.ty}`;
    const list = out.get(k);
    if (list) list.push(e);
    else out.set(k, [e]);
  }
  return out;
}
