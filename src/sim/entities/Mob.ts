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
  /** 보스·도전 보스인가 (보스 피해 배율·보스 우선 대상·보스 상태 이상 규칙, M4-5) */
  boss: boolean;
  /**
   * 받는 피해 증가 합 (bp, 약화·빙결 등, GDD 5.4·5.5). 피해 계산 때 game.json combat.vulnMax(+100%)로 자른다.
   * 걸고 푸는 것(지속 시간)은 상태 이상 시스템(M3-6)이 맡는다.
   */
  vulnBp: number;
  /** 표식: 방어력·마법 저항 감소 (bp, 가장 강한 것만). 타워의 방어·마법 관통 합에 더해진다 (최대 90%). M3-6이 건다 */
  markBp: number;
  /**
   * 지금 둔화 (bp, 이동속도 −x%): 걸린 둔화 중 가장 강한 것 → 최대 70% → 보스면 절반 / 아니면 ccResist만큼 약해짐.
   * 상태 이상 시스템(Status.ts)이 아래 목록에서 다시 계산한다. 이동(Movement)이 읽는다.
   */
  slowBp: number;
  /** 걸린 둔화 (출처마다 하나, 같은 출처는 갱신). 지금 둔화 = 가장 강한 것 */
  slows: StatusEntry[];
  /** 걸린 약화 (받는 피해 +x%, 출처마다 하나). vulnBp = 합 (+ 빙결 중이면 빙결 약화) */
  vulns: StatusEntry[];
  /** 걸린 표식 (방어·마법 저항 −x%, 출처마다 하나). markBp = 가장 강한 것 */
  marks: StatusEntry[];
  /** 지속 피해 중첩 (화상·독·출혈). 중첩마다 하나 */
  dots: DotEntry[];
  /** 지속 피해 누적 (× ATK_SCALE × TICK_HZ): 틱마다 중첩별 초당 피해를 더하고 간격마다 피해로 바꾼다 */
  dotAcc: number;
  /** 지속 피해 나머지 (0 ~ ATK_SCALE − 1, 정수 피해로 자르고 남은 몫) */
  dotRem: number;
  /** 기절·정지·빙결: 이 틱부터 풀린다 (tick < until 이면 걸려 있음) */
  stunUntil: number;
  stopUntil: number;
  freezeUntil: number;
  /** 행동 불가(기절·정지·빙결)가 마지막으로 끝나는 틱. 그 뒤 면역 시간 동안 새 행동 불가는 무시 (0 = 걸린 적 없음) */
  ccEnd: number;
  /** 빙결 중 받는 피해 증가 (bp, 빙결을 건 쪽이 정한다 — 기본 +10%) */
  freezeVulnBp: number;
  /** 몹별 재사용 대기 (얼음 마법사 '같은 몹은 3초에 1번' 등). 출처마다 하나 */
  cds: StatusEntry[];
  // ---- M4 몹 특성·보스·투명 ----
  /**
   * 드러남 (M4-4): 투명 몹은 tick < revealedUntil 동안 '드러남' → 모든 타워가 공격할 수 있다.
   * 감지 오라 안에 있는 틱마다 Detection이 '지금 + 1 + 유지 시간(0.5초)'으로 늘린다 → 오라를 벗어나면 0.5초 뒤 다시 투명.
   */
  revealedUntil: number;
  /** 정예 몹 (51단계부터, 체력 ×5·보상 ×10·크기 1.3배) */
  elite: boolean;
  /** 보호막 (방패병): 남은 양과 처음 양. 피해가 먼저 보호막을 깎고, 광역 피해는 보호막에 2배 */
  shield: number;
  maxShield: number;
  /** 이동속도 증가 (bp): 그림자 늑대 가속 +30%·고대 골렘 분노 +100%. 이동 = 속도 × (1 + 이 값) × (1 − 둔화) */
  speedBonusBp: number;
  /** 주기 특성 다음 틱 (치유사 치유·보스 패턴 A). -1 = 없음 */
  traitAt: number;
  /** 보스 패턴 B 다음 틱 (박쥐 여왕 날기). -1 = 없음 */
  traitAt2: number;
  /** 한 번만 일어나는 일 (비트): 킹 슬라임 분열·고대 골렘 분노·혼돈의 용 66%·33% */
  phaseFlags: number;
  /** 날아오름 (박쥐 여왕): tick < flyUntil 동안 사거리가 flyBlock(단위) 이하인 타워의 공격을 받지 않는다 */
  flyUntil: number;
  flyBlock: number;
  /** 받는 피해 감소 (bp, 혼돈의 용 −50%) — 보스 시스템이 guardUntil이 지나면 0으로 */
  dmgCutBp: number;
  guardUntil: number;
  /** 작게 그림 (분열 슬라임 조각 — 화면용) */
  small: boolean;
  /** 보스 분열 조각 (킹 슬라임: 다시 분열하지 않음) */
  part: boolean;
  // ---- M5 도전 보스 ----
  /** 도전 보스 단계 (0 = 도전 보스 아님). 몹 수 한도에 넣지 않고, 출구에 닿으면 목숨 감소 없이 도전 실패 */
  challenge: number;
  /** 체력을 함께 쓰는 무리 (쌍둥이 박쥐): 무리 첫 엔티티 id (0 = 혼자). 한 마리가 맞으면 무리 모두 같은 체력이 된다 */
  link: number;
  /** 면역 비트: IMMUNE_SLOW 둔화 · IMMUNE_BURN 화상 */
  immune: number;
}

/** 면역 비트 (Mob.immune) */
export const IMMUNE_SLOW = 1;
export const IMMUNE_BURN = 2;

/** 새 몹의 M4 특성 필드 (모두 없음). spawnMob·테스트가 쓴다. */
export function emptyMobTraits(): Pick<
  Mob,
  | 'revealedUntil'
  | 'elite'
  | 'shield'
  | 'maxShield'
  | 'speedBonusBp'
  | 'traitAt'
  | 'traitAt2'
  | 'phaseFlags'
  | 'flyUntil'
  | 'flyBlock'
  | 'dmgCutBp'
  | 'guardUntil'
  | 'small'
  | 'part'
  | 'challenge'
  | 'link'
  | 'immune'
> {
  return {
    revealedUntil: 0,
    elite: false,
    shield: 0,
    maxShield: 0,
    speedBonusBp: 0,
    traitAt: -1,
    traitAt2: -1,
    phaseFlags: 0,
    flyUntil: 0,
    flyBlock: 0,
    dmgCutBp: 0,
    guardUntil: 0,
    small: false,
    part: false,
    challenge: 0,
    link: 0,
    immune: 0,
  };
}

/** 출처가 있는 상태 이상 하나: 출처(src), 세기(bp), 풀리는 틱(until, tick < until 이면 걸려 있음). */
export interface StatusEntry {
  src: string;
  bp: number;
  until: number;
}

/** 지속 피해 중첩 하나: 출처 타워 종류(src)·종류(kind)·초당 피해(× ATK_SCALE)·풀리는 틱. */
export interface DotEntry {
  src: string;
  kind: string;
  dps: number;
  until: number;
}

/** 새 몹의 상태 이상 필드 (모두 비어 있음). spawnMob·테스트가 쓴다. */
export function emptyMobStatus(): Pick<
  Mob,
  'slowBp' | 'slows' | 'vulns' | 'marks' | 'dots' | 'dotAcc' | 'dotRem' | 'stunUntil' | 'stopUntil' | 'freezeUntil' | 'ccEnd' | 'freezeVulnBp' | 'cds'
> {
  return {
    slowBp: 0,
    slows: [],
    vulns: [],
    marks: [],
    dots: [],
    dotAcc: 0,
    dotRem: 0,
    stunUntil: 0,
    stopUntil: 0,
    freezeUntil: 0,
    ccEnd: 0,
    freezeVulnBp: 0,
    cds: [],
  };
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

/** 지금 드러나 있는가 (투명이 아니거나 드러남 시간 안) — GDD 5.7. */
export function isRevealedAt(mob: Pick<Mob, 'invisible' | 'revealedUntil'>, tick: number): boolean {
  return !mob.invisible || tick < mob.revealedUntil;
}

/** 맵 위 몹 수 (떼는 마리마다 1). 도전 보스는 몹 수 한도에 넣지 않으므로 세지 않는다 (GDD 6장). */
export function countMobs(world: World): number {
  let n = 0;
  for (const e of world.entities.list()) if (e.kind === MOB_KIND && !(e as Mob).challenge) n++;
  return n;
}
