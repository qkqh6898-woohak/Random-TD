/**
 * 대상 선택 (DEV_PLAN M2-3, GDD 5.3).
 *
 * - 선두 = 경로 진행도가 가장 큰 몹. 진행도가 같으면 먼저 나온 몹(ID가 작은 쪽).
 *   loop 맵(무한 모드)은 진행도가 계속 늘어나므로 '가장 많이 걸은 몹' = 오래 살아 있는 몹에 가깝다 (속도가 다르면 다를 수 있음).
 * - 사거리: 타워 칸 중심 ↔ 몹 중심 직선거리. 제곱 거리로 비교하고 경계는 포함 (거리 = 사거리이면 공격 가능).
 * - 드러나지 않은 투명 몹은 대상이 될 수 없다 (GDD 5.7). 감지·드러남은 M4.
 * - 최대 체력·보스 우선·최저 체력 같은 다른 우선순위는 M3 (지금은 모든 타워가 선두).
 * 몹 위치는 틱마다 한 번 계산해(진행도 → 좌표) 모든 타워가 같이 쓴다.
 */
import type { World } from '../World';
import { dist2 } from '../Fixed';
import { isMob } from '../entities/Mob';
import { positionAt, type SimPath } from '../map';

/** 대상 후보 하나 (이번 틱의 몹 위치). 처치되면 alive = false. */
export interface TargetCandidate {
  id: number;
  x: number;
  y: number;
  progress: number;
  alive: boolean;
}

/** 이번 틱 대상 후보 (ID 순). 드러나지 않은 투명 몹은 뺀다. */
export function targetCandidates(world: World, path: SimPath): TargetCandidate[] {
  const out: TargetCandidate[] = [];
  for (const e of world.entities.list()) {
    if (!isMob(e) || e.invisible) continue;
    const p = positionAt(path, e.progress);
    out.push({ id: e.id, x: p.x, y: p.y, progress: e.progress, alive: true });
  }
  return out;
}

/** (x, y)에서 사거리(단위) 안의 선두. 없으면 null. 후보는 ID 순이어야 한다 (같은 진행도면 앞의 것). */
export function pickLeader(cands: readonly TargetCandidate[], x: number, y: number, range: number): TargetCandidate | null {
  const r2 = range * range;
  let best: TargetCandidate | null = null;
  for (const c of cands) {
    if (!c.alive) continue;
    if (dist2(x, y, c.x, c.y) > r2) continue;
    if (best === null || c.progress > best.progress) best = c;
  }
  return best;
}
