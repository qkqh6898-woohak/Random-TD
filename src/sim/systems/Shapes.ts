/**
 * 공격 형태 (DEV_PLAN M3-5, GDD 5.2): 한 번의 공격이 어느 몹들을 맞히는가. 순수 함수 (후보 목록 → 맞는 후보 목록).
 *
 * | 형태 | 맞는 몹 | 피해 시점 |
 * |------|--------|----------|
 * | single 단일 | 대상 1마리 | 투사체 도착 |
 * | melee 근접 | 대상 1마리 | 즉시 |
 * | aoe 광역 r | 투사체가 도착한 **대상 지점** 중심 반경 r 안의 모든 몹 (대상 포함) | 투사체 도착 |
 * | melee_aoe 근접 광역 r | **타워 중심** 반경 r 안의 모든 몹 + 대상 (사거리 1.5 > 반경 1.2인 타워도 고른 대상은 맞는다) | 즉시 |
 * | pierce 관통 n | 타워 → 대상 방향 직선 위(폭 1칸)의 몹을 타워에서 가까운 순서로 n마리. 직선 길이 = max(사거리, 대상까지 거리) | 투사체 도착 |
 * | chain 연쇄 n | 대상 → 아직 안 맞은 가장 가까운 몹(반경 2칸 안)으로 튕기며 모두 n마리. k번째 튕김은 피해 × 0.8^k | 투사체 도착 |
 * | multi 다중 n | 우선순위대로 서로 다른 대상 n마리 (각각 투사체) | 투사체 도착 |
 * | global 전체 | 맵 위 모든 (드러난) 몹 | 즉시 |
 *
 * - 드러나지 않은 투명 몹은 후보에 없으므로 광역·연쇄·전체에도 맞지 않는다 (GDD 5.7).
 * - 결과 순서: 광역·근접 광역·전체 = ID 순, 관통 = 직선을 따라 가까운 순(같으면 ID), 연쇄 = 튕긴 순서.
 * - 거리 비교는 제곱 거리, 관통 직선은 정수 단위 벡터(isqrt)로 계산한다 (Math.sqrt·소수 없음).
 * 반경·마리 수는 towers.json shapeValue, 연쇄 반경·관통 폭은 game.json combat (MatchRules).
 */
import { dist2, isqrt } from '../Fixed';
import type { TargetCandidate } from './Targeting';

/** (cx, cy) 중심 반경 radius 안의 살아 있는 후보 (경계 포함, ID 순). */
export function aoeTargets(cands: readonly TargetCandidate[], cx: number, cy: number, radius: number): TargetCandidate[] {
  const r2 = radius * radius;
  const out: TargetCandidate[] = [];
  for (const c of cands) if (c.alive && dist2(cx, cy, c.x, c.y) <= r2) out.push(c);
  return out;
}

/** 근접 광역: 타워 중심 반경 radius 안 + 고른 대상 (ID 순). */
export function meleeAoeTargets(
  cands: readonly TargetCandidate[],
  tx: number,
  ty: number,
  radius: number,
  primary: TargetCandidate,
): TargetCandidate[] {
  const r2 = radius * radius;
  const out: TargetCandidate[] = [];
  for (const c of cands) if (c.alive && (c.id === primary.id || dist2(tx, ty, c.x, c.y) <= r2)) out.push(c);
  return out;
}

/** 전체: 살아 있는 모든 후보 (ID 순). */
export function globalTargets(cands: readonly TargetCandidate[]): TargetCandidate[] {
  return cands.filter((c) => c.alive);
}

/** 관통 직선 계산에 쓰는 단위 벡터의 길이 (정수 스케일) */
const DIR_SCALE = 4096;

/**
 * 관통: (ox, oy)에서 (ax, ay) 방향 직선 위의 몹을 가까운 순서로 n마리.
 * 직선 위 = 직선 방향 거리 0 ~ length, 직선에서 떨어진 거리 ≤ halfWidth (경계 포함). 같은 거리면 ID가 작은 쪽.
 * 방향은 정수 단위 벡터(길이 4096, 0 쪽으로 자름)로 만들어 곱셈만으로 계산한다.
 * 대상 지점이 출발점과 같으면(거리 0) 그 자리의 몹만 거리 순으로 본다.
 */
export function pierceTargets(
  cands: readonly TargetCandidate[],
  ox: number,
  oy: number,
  ax: number,
  ay: number,
  length: number,
  halfWidth: number,
  n: number,
): TargetCandidate[] {
  const dx = ax - ox;
  const dy = ay - oy;
  const d = isqrt(dx * dx + dy * dy);
  const hits: { c: TargetCandidate; along: number }[] = [];
  if (d === 0) {
    for (const c of cands) {
      if (!c.alive) continue;
      const r = isqrt(dist2(ox, oy, c.x, c.y));
      if (r <= halfWidth) hits.push({ c, along: r });
    }
  } else {
    const ux = Math.trunc((dx * DIR_SCALE) / d);
    const uy = Math.trunc((dy * DIR_SCALE) / d);
    for (const c of cands) {
      if (!c.alive) continue;
      const vx = c.x - ox;
      const vy = c.y - oy;
      const along = Math.trunc((vx * ux + vy * uy) / DIR_SCALE);
      if (along < 0 || along > length) continue;
      const side = Math.trunc((vx * uy - vy * ux) / DIR_SCALE);
      if (side > halfWidth || side < -halfWidth) continue;
      hits.push({ c, along });
    }
  }
  hits.sort((a, b) => a.along - b.along || a.c.id - b.c.id);
  return hits.slice(0, n).map((h) => h.c);
}

/**
 * 연쇄: first부터 시작해 아직 안 맞은 가장 가까운 살아 있는 몹(지금 몹에서 반경 range 안)으로 튕기며 모두 n마리 (튕긴 순서).
 * 같은 거리면 ID가 작은 쪽 (후보는 ID 순이어야 한다). 더 튕길 몹이 없으면 거기서 멈춘다.
 */
export function chainTargets(cands: readonly TargetCandidate[], first: TargetCandidate, n: number, range: number): TargetCandidate[] {
  const out: TargetCandidate[] = [first];
  const hit = new Set<number>([first.id]);
  const r2 = range * range;
  let cur = first;
  while (out.length < n) {
    let next: TargetCandidate | null = null;
    let best = 0;
    for (const c of cands) {
      if (!c.alive || hit.has(c.id)) continue;
      const d2 = dist2(cur.x, cur.y, c.x, c.y);
      if (d2 > r2) continue;
      if (next === null || d2 < best) {
        next = c;
        best = d2;
      }
    }
    if (!next) break;
    out.push(next);
    hit.add(next.id);
    cur = next;
  }
  return out;
}
