/**
 * 특색 연출의 순수 계산 (Phaser 없음 → 단위 테스트): 진흙 웅덩이의 투명도·크기.
 */
import type { Puddle } from '../../sim/entities/Puddle';

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

