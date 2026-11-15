/**
 * 대상 선택 (DEV_PLAN M2-3, GDD 5.3).
 *
 * - 캠페인 선두 = 경로 진행도가 가장 큰 몹. 진행도가 같으면 먼저 나온 몹(ID가 작은 쪽).
 * - 무한 모드 선두 = 가장 오래 살아 있는 몹 (GDD 5.3 표). 순환 맵이라 진행도는 '많이 걸은 정도'일 뿐이고,
 *   진행도로 고르면 늦게 나온 빠른 몹(박쥐 2.4칸/초)이 먼저 나온 느린 몹(골렘 1.2)을 앞질러 대상이 바뀐다.
 *   엔티티 ID는 단조 증가라 ID가 가장 작은 몹 = 가장 먼저 나와 아직 살아 있는 몹.
 * - 사거리: 타워 칸 중심 ↔ 몹 중심 직선거리. 제곱 거리로 비교하고 경계는 포함 (거리 = 사거리이면 공격 가능).
 * - 드러나지 않은 투명 몹은 대상이 될 수 없다 (GDD 5.7). 광역·연쇄·전체에도 맞지 않는다. 후보 목록에는 hidden = true로 들어가고,
 *   Combat이 감지(자신) 타워에게만 그 후보를 준다 (M4-4). 드러남은 Detection.
 * - 날아오른 박쥐 여왕(M4-5)은 fly = 막는 사거리(단위). 사거리가 그 이하인 타워는 그 후보를 쓰지 않는다 (Combat).
 * - 타워별 우선순위 (M3, towers.json target):
 *   - first    선두 (대부분)
 *   - maxhp    현재 체력이 가장 높은 몹 (저격수). 같으면 선두 순서
 *   - lowest   현재 체력이 가장 낮은 몹 (상인). 같으면 선두 순서
 *   - boss     보스·도전 보스가 사거리 안에 있으면 그중 선두, 없으면 선두 (그림자 암살자·독 궁수)
 *   - unmarked 표식이 없는 몹 중 선두, 모두 표식이면 선두 (정찰병)
 * 몹 위치는 틱마다 한 번 계산해(진행도 → 좌표) 모든 타워가 같이 쓴다. 체력은 맞을 때마다 후보에도 적는다 (Combat).
 */
import type { TargetRule } from '../../data/load';
import type { World } from '../World';
import { dist2 } from '../Fixed';
import { isMob, isRevealedAt, type Mob } from '../entities/Mob';
import { positionAt, type SimPath } from '../map';

/** 대상 후보 하나 (이번 틱의 몹 위치). 처치되면 alive = false. */
export interface TargetCandidate {
  id: number;
  x: number;
  y: number;
  progress: number;
  alive: boolean;
  /** 지금 체력 (최대·최저 체력 우선순위용, 맞으면 Combat이 고친다). 없으면 0으로 본다 */
  hp?: number;
  /** 보스인가 (보스 우선) */
  boss?: boolean;
  /** 표식이 있는가 (무표식 우선) */
  marked?: boolean;
  /** 드러나지 않은 투명 몹 (감지(자신) 타워만 쓸 수 있다) */
  hidden?: boolean;
  /** 날아오름: 사거리가 이 값(단위) 이하인 타워의 공격을 받지 않는다 (0 = 아님) */
  fly?: number;
}

/**
 * 타워·능력이 건드릴 수 있는 몹인가: 드러나지 않은 투명 몹은 대상·광역·전체 효과·상태 이상·지속 피해 모두 무효 (GDD 5.7).
 * 드러남 = 투명이 아니거나 감지 오라가 늘려 둔 시간 안 (Detection, M4-4).
 */
export function isRevealed(mob: Pick<Mob, 'invisible' | 'revealedUntil'>, tick: number): boolean {
  return isRevealedAt(mob, tick);
}

/**
 * 이번 틱 대상 후보 (ID 순). 드러나지 않은 투명 몹도 hidden = true로 넣는다 (감지(자신) 타워용).
 * includeHidden = false면 드러난 몹만 (소환 병사·진흙 주술사 등).
 */
export function targetCandidates(world: World, path: SimPath, includeHidden = false): TargetCandidate[] {
  const out: TargetCandidate[] = [];
  const tick = world.tick;
  for (const e of world.entities.list()) {
    if (!isMob(e)) continue;
    const hidden = !isRevealedAt(e, tick);
    if (hidden && !includeHidden) continue;
    const p = positionAt(path, e.progress);
    const c: TargetCandidate = { id: e.id, x: p.x, y: p.y, progress: e.progress, alive: true, hp: e.hp, boss: e.boss, marked: e.markBp > 0 };
    if (hidden) c.hidden = true;
    if (e.flyUntil > tick && e.flyBlock > 0) c.fly = e.flyBlock;
    out.push(c);
  }
  return out;
}

/**
 * 사거리 range인 타워가 쓸 수 있는 후보: 감지(자신)이 아니면 드러난 몹만, 날아오른 몹은 사거리가 막는 값보다 클 때만.
 * 거를 것이 없으면 같은 배열을 그대로 돌려준다 (후보 객체는 공유 → 체력·생존 갱신이 서로 보인다).
 */
export function candidatesFor(all: readonly TargetCandidate[], visible: readonly TargetCandidate[], selfDetect: boolean, range: number, anyFly: boolean): readonly TargetCandidate[] {
  const base = selfDetect ? all : visible;
  if (!anyFly) return base;
  return base.filter((c) => !(c.fly !== undefined && c.fly > 0 && range <= c.fly));
}

/** 선두를 정하는 기준: 진행도 최대(캠페인) / 가장 오래 살아 있는 몹(무한 모드). */
export type LeaderRule = 'progress' | 'oldest';

/** 판 모드 → 선두 기준 (GDD 5.3: 무한 모드는 가장 오래 살아 있는 몹). */
export function leaderRuleFor(mode: string): LeaderRule {
  return mode === 'infinite' ? 'oldest' : 'progress';
}

/** a가 b보다 앞선 선두인가. 후보는 ID 순으로 돌므로 같으면 먼저 본 쪽(ID가 작은 쪽)이 남는다. */
function aheadOf(a: TargetCandidate, b: TargetCandidate, rule: LeaderRule): boolean {
  return rule === 'oldest' ? a.id < b.id : a.progress > b.progress;
}

/**
 * (x, y)에서 사거리(단위) 안의 선두. 없으면 null. 후보는 ID 순이어야 한다.
 * - 'progress': 진행도가 가장 큰 몹, 같으면 ID가 작은 쪽 (앞의 것).
 * - 'oldest': ID가 가장 작은 몹 = 사거리 안에서 처음 만나는 후보.
 */
export function pickLeader(
  cands: readonly TargetCandidate[],
  x: number,
  y: number,
  range: number,
  rule: LeaderRule = 'progress',
): TargetCandidate | null {
  return pickTarget(cands, x, y, range, 'first', rule);
}

/**
 * 우선순위대로 사거리 안의 대상 하나 (없으면 null). exclude에 든 id는 건너뛴다 (다중 공격이 서로 다른 대상을 고를 때).
 * 우선순위 규칙은 파일 머리말. 같은 값이면 선두 순서, 그것도 같으면 ID가 작은 쪽. 후보는 ID 순이어야 한다.
 */
export function pickTarget(
  cands: readonly TargetCandidate[],
  x: number,
  y: number,
  range: number,
  target: TargetRule,
  rule: LeaderRule,
  exclude?: ReadonlySet<number>,
): TargetCandidate | null {
  const r2 = range * range;
  let best: TargetCandidate | null = null;
  // boss·unmarked: '우선 집단'(보스 / 표식 없음) 안의 선두가 있으면 그것, 없으면 전체 선두
  let bestPreferred: TargetCandidate | null = null;
  for (const c of cands) {
    if (!c.alive) continue;
    if (exclude?.has(c.id)) continue;
    if (dist2(x, y, c.x, c.y) > r2) continue;
    switch (target) {
      case 'maxhp':
      case 'lowest': {
        const hp = c.hp ?? 0;
        const bh = best?.hp ?? 0;
        const better = target === 'maxhp' ? hp > bh : hp < bh;
        if (best === null || better || (hp === bh && aheadOf(c, best, rule))) best = c;
        break;
      }
      case 'boss':
      case 'unmarked': {
        const preferred = target === 'boss' ? c.boss === true : c.marked !== true;
        if (preferred && (bestPreferred === null || aheadOf(c, bestPreferred, rule))) bestPreferred = c;
        if (best === null || aheadOf(c, best, rule)) best = c;
        break;
      }
      default:
        if (best === null || aheadOf(c, best, rule)) best = c;
    }
  }
  return bestPreferred ?? best;
}
