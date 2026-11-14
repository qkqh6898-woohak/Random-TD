/**
 * 감지 (GDD 5.7, TOWERS.md 9장) — M3b에서는 '감지 오라 필드'만: 판 위 감지 오라 타워의 위치·반경을 모은다.
 * 투명 몹을 '드러남'으로 바꾸고 0.5초 뒤 다시 투명으로 되돌리는 규칙은 M4-4가 이 목록을 읽어 만든다.
 * 감지 오라 타워: 정찰병 r3 · 점성술사 r3.5 · 예언자 r4 · 그림자 암살자 r3 (+ 히든). 감지(자신)는 TowerStats.detect = 'self'.
 */
import type { World } from '../World';
import { isTower } from '../entities/Tower';
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

/** 감지(자신) 타워인가 — 그 타워만 투명 몹을 칠 수 있다 (M4). */
export function selfDetects(ctx: MatchContext, towerId: string): boolean {
  return ctx.rules.towers.get(towerId)?.detect === 'self';
}
