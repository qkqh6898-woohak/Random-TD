/**
 * 특색 연출의 순수 계산 (Phaser 없음 → 단위 테스트): 진흙 웅덩이의 투명도·크기, 지원(오라) 타워의 평소 빛 자리.
 */
import type { Puddle } from '../../sim/entities/Puddle';
import type { AuraArea } from '../../sim/abilities/types';

/** 웅덩이가 생길 때 커지는 시간 (틱) */
const PUDDLE_GROW_TICKS = 4;
/** 사라지기 전 옅어지는 시간 (틱) */
const PUDDLE_FADE_TICKS = 10;

/** 웅덩이 그림 투명도·크기 비율 (순수 계산). */
export function puddleLook(p: Pick<Puddle, 'bornTick' | 'until'>, tick: number, alpha = 0): { alpha: number; scale: number } {
  const t = tick + alpha;
  const age = t - p.bornTick;
  const left = p.until - t;
  const grow = age >= PUDDLE_GROW_TICKS ? 1 : Math.max(0.2, age / PUDDLE_GROW_TICKS);
  const fade = left >= PUDDLE_FADE_TICKS ? 1 : Math.max(0, left / PUDDLE_FADE_TICKS);
  return { alpha: 0.85 * fade, scale: grow };
}


/** 평소 오라 빛 하나: 타워 칸과 칸 거리 (주변 8칸 1, 24칸 2, 전체 오라 0 = 자기 칸만) */
export interface AuraGlow {
  tx: number;
  ty: number;
  radius: number;
}

/**
 * 평소(고르지 않아도) 은은하게 빛낼 지원 타워 자리 (ART.md 2.4 '오라: 지원 타워 주변 8칸에 은은한 빛, 선택 시 진하게').
 * 내 타워 중 오라가 있는 것만, 고른 타워는 뺀다 (고른 타워는 SelectionLayer가 진하게 그린다). 타워 ID 순.
 * @param auraOf 타워의 오라 범위 (없으면 null)
 * @param radiusOf 범위 → 칸 거리 (전체 = 0)
 */
export function passiveAuraGlows<T extends { id: number; tx: number; ty: number; owner: number }>(
  towers: readonly T[],
  owner: number,
  selectedId: number | null,
  auraOf: (t: T) => AuraArea | null,
  radiusOf: (area: AuraArea) => number,
): AuraGlow[] {
  const out: AuraGlow[] = [];
  for (const t of towers) {
    if (t.owner !== owner || t.id === selectedId) continue;
    const area = auraOf(t);
    if (area) out.push({ tx: t.tx, ty: t.ty, radius: radiusOf(area) });
  }
  return out;
}
