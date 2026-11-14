/**
 * 그림용 색 (docs/ART.md 1.1). 종족 색은 데이터(towers.json factions.color)에서 읽는다.
 * 게임 규칙 수치가 아니라 화면 표현용 상수라 코드에 둔다.
 */
import type { Grade } from '../data/load';

export const GRADE_COLORS: Record<Grade, string> = {
  normal: '#9AA0A6',
  rare: '#3D8BFD',
  unique: '#9B59D0',
  hero: '#F39C12',
  legend: '#E74C3C',
  god: '#FFFFFF', // 신: 무지개 그라데이션 (그릴 때 따로 처리)
  hidden: '#1E1E2A', // 히든: 금색 테두리 #F1C40F
};

export const COLORS = {
  gold: '#F5B700',
  danger: '#E53935',
  outline: '#3B2416', // 진한 갈색 외곽선
  hiddenRim: '#F1C40F',
  bg: '#0D1220',
} as const;

/** '#RRGGBB' → 0xRRGGBB (Phaser 색 값). */
export function hexToInt(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`색 형식이 아님: ${hex}`);
  return Number.parseInt(m[1] as string, 16);
}

/** 두 색을 t(0~1) 비율로 섞기. */
export function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

/** 밝기 조절 (amount > 0 밝게, < 0 어둡게, -1~1). */
export function shade(color: number, amount: number): number {
  return amount >= 0 ? lerpColor(color, 0xffffff, amount) : lerpColor(color, 0x000000, -amount);
}
