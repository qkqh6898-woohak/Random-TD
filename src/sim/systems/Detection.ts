/**
 * 투명·감지 (DEV_PLAN M4-4, GDD 5.7, ENEMIES.md 5장, TOWERS.md 9장).
 *
 * | 항목 | 규칙 |
 * |------|------|
 * | 감지 오라 | 반경 안의 투명 몹을 '드러남'으로 → **모든 타워**(두 사람 모두)가 공격할 수 있다. 오라를 벗어나면 0.5초 뒤 다시 투명 |
 * | 감지(자신) | 그 타워만 사거리 안의 투명 몹을 공격할 수 있다 (다른 타워에게는 여전히 투명) — Combat이 후보 목록을 고른다 |
 * | 드러나지 않은 투명 몹 | 대상 지정 불가 + 광역·연쇄·전체 공격·상태 이상·지속 피해·능력(운석·시간 정지·웅덩이·병사)·카드 대지진 모두 무효 |
 *
 * - 시스템 (틱마다, 이동 다음·특색 능력과 전투 앞): 판 위 감지 오라 타워(ID 순) 반경 안(경계 포함)에 있는 투명 몹의
 *   revealedUntil = 지금 + 1 + 유지 시간(0.5초 = 10틱, game.json detection). 오라 안에 있는 틱 T에는 드러나 있고,
 *   마지막으로 오라 안에 있던 틱 T 뒤 T+1 ~ T+10틱도 드러나 있다가 T+11틱에 다시 투명.
 * - 감지 오라 타워: 정찰병 r3 · 점성술사 r3.5 · 예언자 r4 · 그림자 암살자 r3 · 천상의 궁수(맵 전체) · 운명의 예언자 r5.
 *   감지(자신): 바람 궁수 · 저격수 · 차원술사 · 운명의 신 (TowerStats.detect).
 * - 끄는 중(hold)·기절한 감지 타워도 원래 칸에서 계속 드러낸다 (오라는 지원 효과처럼 늘 켜져 있음).
 */
import type { System, World } from '../World';
import { dist2 } from '../Fixed';
import { isMob } from '../entities/Mob';
import { isTower } from '../entities/Tower';
import { positionAt } from '../map';
import type { MatchContext } from '../state';

export interface DetectAura {
  /** 타워 엔티티 id */
  tower: number;
  owner: number;
  x: number;
  y: number;
  /** 반경 (단위) */
  r: number;
}

/** 판 위 감지 오라 (타워 ID 순). */
export function detectAuras(ctx: MatchContext, world: World): DetectAura[] {
  const out: DetectAura[] = [];
  for (const e of world.entities.list()) {
    if (!isTower(e)) continue;
    const s = ctx.rules.towers.get(e.tower);
    if (s && s.detect === 'aura' && s.detectRange > 0) out.push({ tower: e.id, owner: e.owner, x: e.x, y: e.y, r: s.detectRange });
  }
  return out;
}

/** 감지(자신) 타워인가 — 그 타워만 투명 몹을 칠 수 있다. */
export function selfDetects(ctx: MatchContext, towerId: string): boolean {
  return ctx.rules.towers.get(towerId)?.detect === 'self';
}

/** (x, y)가 감지 오라 중 하나의 반경 안인가 (경계 포함). */
export function insideAnyAura(auras: readonly DetectAura[], x: number, y: number): boolean {
  for (const a of auras) if (dist2(a.x, a.y, x, y) <= a.r * a.r) return true;
  return false;
}

export function createDetectionSystem(ctx: MatchContext): System {
  return (world) => {
    if (ctx.state.phase !== 'playing') return;
    const auras = detectAuras(ctx, world);
    if (auras.length === 0) return;
    const until = world.tick + 1 + ctx.rules.revealHoldTicks;
    for (const e of world.entities.list()) {
      if (!isMob(e) || !e.invisible) continue;
      const p = positionAt(ctx.map.path, e.progress);
      if (insideAnyAura(auras, p.x, p.y)) e.revealedUntil = until;
    }
  };
}
