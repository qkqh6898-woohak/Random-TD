/**
 * 몸 파츠 그리기: 다리·옷(16종)·팔·왼손 소품·몸 앞 장식·발밑 장식·옷 무늬·등급 별 + 머리 (Canvas 2D, Phaser 없음).
 * 좌표: 발밑 중심 원점, 그림 단위 (rig.ts BODY_SPECS).
 */
import type { Grade } from '../../data/load';
import { GRADE_COLORS } from '../palette';
import { GRADE_STARS } from '../towerLook';
import {
  OUTLINE,
  P,
  blob,
  bolt,
  circle,
  coin,
  ellipse,
  flame,
  glow,
  line,
  mix,
  paint,
  poly,
  rainbow,
  rrect,
  shade,
  shine,
  skullIcon,
  snowflake,
  sparkle,
  star,
  stroke,
  type Ctx,
  type PathFn,
} from './cv';
import { drawHead, type HeadCtx } from './head';
import type { FrontId, GroundId, OffhandId, OutfitDeco } from './library';
import type { HumanLook } from './looks';
import { PROP_META } from './propMeta';
import { BODY_SPECS, STAR_Y, type BodySpec } from './rig';

export interface BodyCtx {
  c: Ctx;
  look: HumanLook;
  spec: BodySpec;
  /** 등급 색 (옷 테두리) */
  trim: string;
  main: string;
  second: string;
  /** 손 자리 (기도·명상 자세면 가운데로 모은다) */
  handL: readonly [number, number];
  handR: readonly [number, number];
}

/** 손 자리: 기도 = 가슴 앞에 모음, 명상 = 무릎 위, 그 밖 = 체형 기본 */
export function handPositions(look: HumanLook, spec: BodySpec): { handL: readonly [number, number]; handR: readonly [number, number] } {
  const pose = look.prop ? PROP_META[look.prop].pose : undefined;
  if (pose === 'pray') return { handL: [-7, spec.torsoTop + 34], handR: [7, spec.torsoTop + 34] };
  if (pose === 'meditate') return { handL: [-20, spec.torsoBot - 8], handR: [20, spec.torsoBot - 8] };
  return { handL: spec.handL, handR: spec.handR };
}

/** 등급 → 옷 테두리 색. 신은 금색, 히든은 금색 테두리 */
export function trimColor(grade: Grade | undefined): string {
  if (!grade) return '#C9A227';
  if (grade === 'god') return '#F5C518';
  if (grade === 'hidden') return '#F1C40F';
  return GRADE_COLORS[grade];
}

const STEEL = '#C9D3DE';

/** 손 색: 판금 갑옷은 은빛 장갑, 돌 몸은 돌 */
export function handColor(look: HumanLook): string {
  if (look.outfit === 'armor' && (look.head === 'great_helm' || look.head === 'knight_helmet' || look.head === 'winged_helm')) return STEEL;
  return look.skin;
}

function torsoPath(s: BodySpec, bottom = s.torsoBot, hip = s.hipHW, top = s.torsoTop, hw = s.torsoHW): PathFn {
  return (c) => {
    const r = 16;
    c.beginPath();
    c.moveTo(-hw + r, top);
    c.lineTo(hw - r, top);
    c.quadraticCurveTo(hw, top, hw, top + r);
    c.lineTo(hip, bottom - r * 0.6);
    c.quadraticCurveTo(hip, bottom, hip - r * 0.6, bottom);
    c.lineTo(-hip + r * 0.6, bottom);
    c.quadraticCurveTo(-hip, bottom, -hip, bottom - r * 0.6);
    c.lineTo(-hw, top + r);
    c.quadraticCurveTo(-hw, top, -hw + r, top);
    c.closePath();
  };
}

/** 가장자리가 꽃잎 물결인 치마 */
function skirtPath(top: number, bottom: number, topHW: number, botHW: number, waves: number): PathFn {
  return (c) => {
    c.beginPath();
    c.moveTo(-topHW, top);
    c.lineTo(topHW, top);
    c.lineTo(botHW, bottom - 6);
    const n = waves;
    for (let i = 0; i < n; i++) {
      const x0 = botHW - (i / n) * botHW * 2;
      const x1 = botHW - ((i + 1) / n) * botHW * 2;
      c.quadraticCurveTo((x0 + x1) / 2, bottom + 8, x1, bottom - 6);
    }
    c.closePath();
  };
}

function legs(b: BodyCtx, pants: string, boots: string): void {
  const { c, spec } = b;
  if (spec.legW <= 0) return;
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -spec.legGap - spec.legW : spec.legGap;
    rrect(c, x0, spec.legTop, spec.legW, spec.footY - spec.legTop - 6, 7, pants, { lw: 4.5 });
    rrect(c, x0 - (s < 0 ? 4 : 0), spec.footY - 14, spec.legW + 4, 14, 6, boots, { lw: 4.5 });
  }
}

function feetOnly(b: BodyCtx, boots: string): void {
  const { c, spec } = b;
  for (const s of [-1, 1]) ellipse(c, s * (spec.legGap + spec.legW * 0.5), spec.footY - 5, spec.legW * 0.62, 7, boots, { lw: 4 });
}

function belt(b: BodyCtx, y: number, color: string, hw: number): void {
  rrect(b.c, -hw, y, hw * 2, 10, 4, color, { lw: 3.5 });
  rrect(b.c, -7, y - 1, 14, 12, 3, b.trim, { lw: 3 });
}

function hemTrim(b: BodyCtx, y: number, hw: number): void {
  stroke(b.c, [-hw + 4, y, hw - 4, y], b.trim, 5);
}

function sleeve(b: BodyCtx, side: -1 | 1, color: string, w = 17): void {
  const { c, spec } = b;
  const hand = side < 0 ? b.handL : b.handR;
  const sx = side * (spec.torsoHW - 8);
  const sy = spec.torsoTop + 14;
  line(c, [sx, sy, (sx + hand[0]) / 2 + side * 4, (sy + hand[1]) / 2, hand[0], hand[1]], color, w);
}

/** 옷 (다리 + 몸통 + 소매). 팔 끝 손은 따로. */
function outfit(b: BodyCtx): void {
  const { c, spec, main, second, trim, look } = b;
  const dark = shade(main, -0.35);
  const boots = '#5A3A22';
  const s = spec;
  switch (look.outfit) {
    case 'tunic': {
      legs(b, shade(second, -0.25), boots);
      paint(c, torsoPath(s, s.torsoBot + 8, s.hipHW + 6), main, { cel: true });
      poly(c, [-12, s.torsoTop, 0, s.torsoTop + 18, 12, s.torsoTop], look.skin, { lw: 3.5 });
      belt(b, s.torsoBot - 16, shade(second, -0.2), s.hipHW + 2);
      hemTrim(b, s.torsoBot + 4, s.hipHW + 6);
      sleeve(b, -1, main);
      sleeve(b, 1, main);
      break;
    }
    case 'robe': {
      feetOnly(b, boots);
      paint(c, torsoPath(s, s.footY - 6, s.hipHW + 18), main, { cel: true });
      paint(c, P.poly([-9, s.torsoTop + 6, 9, s.torsoTop + 6, 13, s.footY - 7, -13, s.footY - 7]), second, { lw: 3.5 });
      hemTrim(b, s.footY - 9, s.hipHW + 16);
      poly(c, [-14, s.torsoTop, 0, s.torsoTop + 16, 14, s.torsoTop], trim, { lw: 3.5 });
      sleeve(b, -1, main, 22);
      sleeve(b, 1, main, 22);
      break;
    }
    case 'armor': {
      legs(b, shade(STEEL, -0.25), shade(STEEL, -0.4));
      paint(c, torsoPath(s), STEEL, { cel: true });
      paint(c, P.poly([-s.torsoHW * 0.5, s.torsoTop + 10, s.torsoHW * 0.5, s.torsoTop + 10, s.hipHW * 0.55, s.torsoBot + 12, 0, s.torsoBot + 18, -s.hipHW * 0.55, s.torsoBot + 12]), main, { lw: 4, cel: true, celOffset: 4 });
      stroke(c, [-s.torsoHW * 0.5 + 3, s.torsoTop + 12, -s.hipHW * 0.55 + 3, s.torsoBot + 10], trim, 4);
      stroke(c, [s.torsoHW * 0.5 - 3, s.torsoTop + 12, s.hipHW * 0.55 - 3, s.torsoBot + 10], trim, 4);
      belt(b, s.torsoBot - 18, '#5A3A22', s.hipHW + 1);
      sleeve(b, -1, shade(STEEL, -0.1));
      sleeve(b, 1, shade(STEEL, -0.1));
      for (const side of [-1, 1]) ellipse(c, side * (s.torsoHW - 4), s.torsoTop + 10, 18, 14, STEEL, { lw: 4, cel: true, celOffset: 3 });
      shine(c, -s.torsoHW * 0.6, s.torsoTop + 22, 6, 12, 0.6);
      break;
    }
    case 'leather': {
      legs(b, shade(second, 0.1), shade(second, -0.2));
      paint(c, torsoPath(s), main, { cel: true });
      line(c, [-s.torsoHW + 6, s.torsoTop + 6, s.hipHW - 6, s.torsoBot - 6], shade(second, 0.15), 7);
      circle(c, 0, (s.torsoTop + s.torsoBot) / 2, 5, '#B36BFF', { lw: 2.5 });
      belt(b, s.torsoBot - 14, shade(second, 0.1), s.hipHW + 1);
      poly(c, [-s.torsoHW - 2, s.torsoTop + 2, 0, s.torsoTop + 22, s.torsoHW + 2, s.torsoTop + 2, 0, s.torsoTop - 4], shade(main, -0.15), { lw: 3.5 });
      sleeve(b, -1, shade(second, 0.1));
      sleeve(b, 1, shade(second, 0.1));
      break;
    }
    case 'vest': {
      legs(b, shade(main, -0.2), '#3A3A3A');
      paint(c, torsoPath(s), shade(second, 0.25), { cel: true });
      paint(c, torsoPath(s, s.torsoBot, s.hipHW, s.torsoTop + 4, s.torsoHW - 2), main, { cel: true });
      paint(c, P.poly([-6, s.torsoTop + 2, 6, s.torsoTop + 2, 4, s.torsoBot - 4, -4, s.torsoBot - 4]), shade(second, 0.25), { lw: 3 });
      for (const side of [-1, 1]) {
        rrect(c, side * s.torsoHW * 0.55 - 9, s.torsoTop + 26, 18, 14, 3, shade(main, -0.15), { lw: 3 });
        rrect(c, side * s.torsoHW * 0.55 - 9, s.torsoBot - 30, 18, 12, 3, shade(main, -0.15), { lw: 3 });
      }
      belt(b, s.torsoBot - 12, '#2F3338', s.hipHW);
      sleeve(b, -1, shade(second, 0.2));
      sleeve(b, 1, shade(second, 0.2));
      break;
    }
    case 'coat': {
      legs(b, '#3A3A44', '#2A2A2A');
      paint(c, torsoPath(s, s.torsoBot + 22, s.hipHW + 10), main, { cel: true });
      paint(c, P.poly([-10, s.torsoTop, 10, s.torsoTop, 8, s.torsoBot + 20, -8, s.torsoBot + 20]), second, { lw: 3 });
      for (const side of [-1, 1]) poly(c, [side * 10, s.torsoTop, side * (s.torsoHW - 6), s.torsoTop + 4, side * 14, s.torsoTop + 34], shade(main, -0.12), { lw: 3 });
      for (let i = 0; i < 3; i++) circle(c, -14, s.torsoTop + 34 + i * 14, 2.8, trim, { lw: 1.5 });
      hemTrim(b, s.torsoBot + 18, s.hipHW + 10);
      sleeve(b, -1, main);
      sleeve(b, 1, main);
      break;
    }
    case 'suit': {
      legs(b, shade(main, -0.25), '#1E1E1E');
      paint(c, torsoPath(s), main, { cel: true });
      poly(c, [-13, s.torsoTop, 13, s.torsoTop, 0, s.torsoTop + 30], '#F7F3E9', { lw: 3.5 });
      for (const side of [-1, 1]) poly(c, [side * 13, s.torsoTop, side * (s.torsoHW - 6), s.torsoTop + 2, side * 3, s.torsoTop + 40], shade(main, -0.18), { lw: 3 });
      stroke(c, [-s.torsoHW + 10, s.torsoTop + 24, -s.torsoHW + 22, s.torsoTop + 24], trim, 3);
      sleeve(b, -1, main);
      sleeve(b, 1, main);
      break;
    }
    case 'dress': {
      if (s.legW > 0) legs(b, look.skin, shade(main, -0.2));
      paint(c, skirtPath(s.torsoBot - 16, s.torsoBot + (look.body === 'fairy' ? 16 : 22), s.hipHW - 4, s.hipHW + 16, 5), shade(second, 0.1), { cel: true });
      paint(c, skirtPath(s.torsoBot - 18, s.torsoBot + (look.body === 'fairy' ? 8 : 12), s.hipHW - 6, s.hipHW + 10, 4), main, { cel: true });
      paint(c, torsoPath(s, s.torsoBot - 10, s.hipHW - 6), main, { cel: true });
      stroke(c, [-s.torsoHW + 4, s.torsoBot - 14, s.torsoHW - 4, s.torsoBot - 14], trim, 4);
      circle(c, 0, s.torsoTop + 12, 6, second, { lw: 2.5 });
      sleeve(b, -1, shade(main, 0.15), 13);
      sleeve(b, 1, shade(main, 0.15), 13);
      break;
    }
    case 'fur': {
      legs(b, shade(main, -0.35), '#4A3020');
      paint(c, torsoPath(s), look.skin, { cel: true });
      line(c, [s.torsoHW - 6, s.torsoTop + 8, -s.hipHW + 8, s.torsoBot - 8], '#6B4226', 6);
      paint(c, P.poly([-s.hipHW - 4, s.torsoBot - 20, s.hipHW + 4, s.torsoBot - 20, s.hipHW + 8, s.torsoBot + 8, 10, s.torsoBot + 2, 0, s.torsoBot + 12, -10, s.torsoBot + 2, -s.hipHW - 8, s.torsoBot + 8]), main, { lw: 4, cel: true, celOffset: 3 });
      stroke(c, [-s.hipHW, s.torsoBot - 18, s.hipHW, s.torsoBot - 18], trim, 4);
      blob(c, [-s.torsoHW - 10, s.torsoTop + 16, -s.torsoHW + 4, s.torsoTop - 8, 0, s.torsoTop + 2, s.torsoHW - 4, s.torsoTop - 8, s.torsoHW + 10, s.torsoTop + 16, s.torsoHW - 10, s.torsoTop + 22, 0, s.torsoTop + 14, -s.torsoHW + 10, s.torsoTop + 22], second, { cel: true, celOffset: 4 });
      sleeve(b, -1, look.skin, 16);
      sleeve(b, 1, look.skin, 16);
      break;
    }
    case 'apron': {
      legs(b, '#5A4636', '#3A2A1E');
      paint(c, torsoPath(s), main, { cel: true });
      paint(c, P.rrect(-s.torsoHW * 0.62, s.torsoTop + 18, s.torsoHW * 1.24, s.torsoBot - s.torsoTop + 2, 10), second, { lw: 4, cel: true, celOffset: 3 });
      rrect(c, -12, s.torsoBot - 30, 24, 14, 3, shade(second, -0.15), { lw: 3 });
      for (const side of [-1, 1]) stroke(c, [side * s.torsoHW * 0.55, s.torsoTop + 20, side * 10, s.torsoTop + 2], shade(second, -0.2), 4);
      hemTrim(b, s.torsoBot + 16, s.torsoHW * 0.6);
      sleeve(b, -1, main);
      sleeve(b, 1, main);
      break;
    }
    case 'toga': {
      feetOnly(b, '#C9A86A');
      paint(c, torsoPath(s, s.footY - 6, s.hipHW + 10), main, { cel: true });
      for (let i = -2; i <= 2; i++) stroke(c, [i * 12, s.torsoTop + 50, i * 16, s.footY - 10], shade(main, -0.12), 3);
      line(c, [s.torsoHW - 4, s.torsoTop + 2, -s.hipHW + 4, s.torsoBot - 30], second, 12);
      hemTrim(b, s.footY - 9, s.hipHW + 8);
      sleeve(b, -1, main, 20);
      sleeve(b, 1, main, 20);
      break;
    }
    case 'ninja': {
      legs(b, shade(main, -0.1), shade(main, -0.35));
      paint(c, torsoPath(s), main, { cel: true });
      stroke(c, [-s.torsoHW + 6, s.torsoTop + 4, 6, s.torsoTop + 40], shade(main, -0.3), 4);
      stroke(c, [s.torsoHW - 6, s.torsoTop + 4, -6, s.torsoTop + 40], shade(main, -0.3), 4);
      rrect(c, -s.hipHW - 2, s.torsoBot - 20, s.hipHW * 2 + 4, 12, 4, second, { lw: 3.5 });
      blob(c, [s.hipHW - 4, s.torsoBot - 16, s.hipHW + 16, s.torsoBot - 4, s.hipHW + 10, s.torsoBot + 8, s.hipHW, s.torsoBot - 6], second, { lw: 3 });
      sleeve(b, -1, main);
      sleeve(b, 1, main);
      break;
    }
    case 'ghillie': {
      legs(b, shade(main, -0.2), '#3A3A2A');
      paint(c, torsoPath(s, s.torsoBot + 8, s.hipHW + 4), main, { cel: true });
      for (let i = 0; i < 9; i++) {
        const fx = -s.hipHW + (i / 8) * s.hipHW * 2;
        blob(c, [fx - 6, s.torsoBot - 2, fx, s.torsoBot + 18, fx + 6, s.torsoBot - 2], i % 2 ? second : shade(main, 0.2), { lw: 2.5 });
      }
      for (let i = 0; i < 6; i++) ellipse(c, -s.torsoHW * 0.6 + (i % 3) * s.torsoHW * 0.6, s.torsoTop + 16 + Math.floor(i / 3) * 28, 9, 5, i % 2 ? second : shade(main, 0.25), { lw: 2 }, i);
      sleeve(b, -1, main);
      sleeve(b, 1, main);
      break;
    }
    case 'gi': {
      // 넓은 바지(하카마) + 여민 저고리
      paint(c, P.poly([-s.hipHW - 2, s.torsoBot - 16, s.hipHW + 2, s.torsoBot - 16, s.hipHW + 14, s.footY - 6, -s.hipHW - 14, s.footY - 6]), second, { lw: 4, cel: true, celOffset: 4 });
      stroke(c, [0, s.torsoBot - 10, 0, s.footY - 8], shade(second, -0.3), 3);
      paint(c, torsoPath(s, s.torsoBot - 6), main, { cel: true });
      poly(c, [-14, s.torsoTop, 10, s.torsoTop + 36, 16, s.torsoTop + 26, 0, s.torsoTop], shade(main, -0.12), { lw: 3 });
      rrect(c, -s.hipHW - 2, s.torsoBot - 22, s.hipHW * 2 + 4, 12, 4, trim, { lw: 3.5 });
      sleeve(b, -1, main, 22);
      sleeve(b, 1, main, 22);
      break;
    }
    case 'rock': {
      // 돌 골렘: 바위 다리 + 바위 몸통 + 바위 팔
      for (const side of [-1, 1]) blob(c, [side * 6, s.legTop, side * (6 + s.legW), s.legTop + 2, side * (8 + s.legW), -4, side * 4, -2], shade(look.skin, -0.1), { cel: true, celOffset: 4 });
      blob(c, [-s.torsoHW, s.torsoTop + 20, -s.torsoHW + 16, s.torsoTop, s.torsoHW - 12, s.torsoTop - 4, s.torsoHW + 4, s.torsoTop + 26, s.hipHW, s.torsoBot - 4, 0, s.torsoBot + 6, -s.hipHW, s.torsoBot - 8], look.skin, { cel: true, celOffset: 8 });
      stroke(c, [-18, s.torsoTop + 20, -6, s.torsoTop + 40, -14, s.torsoTop + 56], shade(look.skin, -0.35), 3);
      stroke(c, [20, s.torsoTop + 30, 28, s.torsoTop + 48], shade(look.skin, -0.35), 3);
      ellipse(c, -s.torsoHW * 0.45, s.torsoTop + 10, 14, 7, second, { lw: 0, alpha: 0.85 });
      ellipse(c, s.torsoHW * 0.35, s.torsoBot - 14, 12, 6, second, { lw: 0, alpha: 0.85 });
      for (const side of [-1, 1]) {
        const hand = side < 0 ? s.handL : s.handR;
        blob(c, [side * (s.torsoHW - 10), s.torsoTop + 6, side * (s.torsoHW + 16), s.torsoTop + 10, hand[0] + side * 10, hand[1] - 10, hand[0] - side * 12, hand[1] + 4], shade(look.skin, -0.05), { cel: true, celOffset: 4 });
      }
      break;
    }
    case 'storm': {
      // 바람·번개 몸: 소용돌이 꼬리
      glow(c, 0, (s.torsoTop + s.footY) / 2, 64, '#BFE9FF', 0.45);
      blob(c, [-s.torsoHW, s.torsoTop + 8, s.torsoHW, s.torsoTop + 8, s.torsoHW - 4, s.torsoBot, 18, s.torsoBot + 24, 26, -24, 4, -12, -14, -24, 6, s.torsoBot + 18, -s.torsoHW + 6, s.torsoBot], mix(main, '#BFE9FF', 0.55), { cel: true, celOffset: 6, stroke: shade(main, -0.2) });
      for (let i = 0; i < 3; i++) stroke(c, [-26 + i * 22, s.torsoTop + 20 + i * 8, -6 + i * 18, s.torsoTop + 46 + i * 6, -22 + i * 20, s.torsoBot + 4], '#FFFFFF', 3, 0.7);
      bolt(c, 10, s.torsoTop + 14, 46, second, 3.5, Math.PI / 2 + 0.3);
      sleeve(b, -1, mix(main, '#BFE9FF', 0.55), 15);
      sleeve(b, 1, mix(main, '#BFE9FF', 0.55), 15);
      break;
    }
  }
  void dark;
}

function decorate(b: BodyCtx, deco: OutfitDeco): void {
  const { c, spec: s } = b;
  const cy = (s.torsoTop + s.torsoBot) / 2;
  switch (deco) {
    case 'crystals':
      for (const [x, y, r, col] of [
        [-s.torsoHW * 0.55, s.torsoTop + 8, 11, '#9BE7FF'],
        [s.torsoHW * 0.5, cy + 6, 9, '#B36BFF'],
        [-6, s.torsoBot - 10, 8, '#7FFFD4'],
      ] as const) {
        poly(c, [x, y - r * 1.5, x + r * 0.7, y, x, y + r * 0.6, x - r * 0.7, y], col, { lw: 2.5 });
        shine(c, x - r * 0.2, y - r * 0.6, r * 0.2, r * 0.4, 0.8);
      }
      break;
    case 'runes':
      for (const [x, y] of [
        [-s.torsoHW * 0.45, cy - 10],
        [s.torsoHW * 0.4, cy + 8],
        [0, s.torsoTop + 16],
      ] as const) {
        glow(c, x, y, 14, '#FFD24A', 0.5);
        stroke(c, [x - 5, y - 7, x + 4, y, x - 5, y + 7], '#FFD24A', 3);
      }
      break;
    case 'card_suits': {
      const cols = ['#E53935', '#1E1E1E', '#E53935', '#1E1E1E'];
      for (let i = 0; i < 4; i++) {
        const x = -s.torsoHW * 0.55 + (i % 2) * s.torsoHW * 1.1;
        const y = s.torsoTop + 24 + Math.floor(i / 2) * 26;
        if (i % 2 === 0) blob(c, [x, y + 6, x - 6, y - 2, x - 3, y - 6, x, y - 3, x + 3, y - 6, x + 6, y - 2], cols[i] as string, { lw: 1.5 });
        else poly(c, [x, y - 7, x + 5, y, x, y + 7, x - 5, y], cols[i] as string, { lw: 1.5 });
      }
      break;
    }
    case 'stars':
      for (const [x, y, r] of [
        [-s.hipHW * 0.6, s.torsoBot + 2, 6],
        [s.hipHW * 0.5, cy, 5],
        [-s.torsoHW * 0.3, s.torsoTop + 18, 4.5],
        [s.hipHW * 0.7, s.torsoBot - 12, 5],
      ] as const)
        star(c, x, y, r, '#FFE27A', { lw: 1.5 });
      break;
    case 'lightning':
      bolt(c, -s.torsoHW * 0.5, s.torsoTop + 8, 34, '#FFE14A', 3, Math.PI / 2 + 0.25);
      bolt(c, s.torsoHW * 0.4, cy, 30, '#FFE14A', 3, Math.PI / 2 - 0.25);
      break;
    case 'phoenix':
      glow(c, 0, cy - 4, 26, '#FF9A2F', 0.6);
      blob(c, [0, cy - 18, 16, cy - 8, 26, cy - 18, 18, cy + 4, 6, cy + 10, 0, cy + 20, -6, cy + 10, -18, cy + 4, -26, cy - 18, -16, cy - 8], '#FFB13B', { lw: 2.5 });
      break;
    case 'flames':
      for (let i = -2; i <= 2; i++) flame(c, i * s.hipHW * 0.42, s.torsoBot + 2, 7, '#FF7A2F', '#FFE27A');
      break;
    case 'lion':
      circle(c, 0, cy - 2, 15, '#F5C518', { lw: 3 });
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        circle(c, Math.cos(a) * 15, cy - 2 + Math.sin(a) * 15, 5, '#E0A020', { lw: 1.5 });
      }
      circle(c, 0, cy - 2, 10, '#F5C518', { lw: 2.5 });
      circle(c, -3.5, cy - 4, 1.6, OUTLINE, { lw: 0 });
      circle(c, 3.5, cy - 4, 1.6, OUTLINE, { lw: 0 });
      break;
    case 'moss':
      for (const [x, y] of [
        [-s.torsoHW * 0.5, s.torsoTop + 4],
        [s.torsoHW * 0.55, cy + 10],
      ] as const)
        blob(c, [x - 12, y, x - 4, y - 7, x + 8, y - 6, x + 12, y + 2, x, y + 6], '#6FA35A', { lw: 2 });
      break;
    case 'leaves':
      for (let i = 0; i < 4; i++) ellipse(c, -s.torsoHW * 0.6 + i * s.torsoHW * 0.4, s.torsoBot - 4 + (i % 2) * 6, 8, 4, '#7ED957', { lw: 2 }, 0.6 * i);
      break;
    case 'frost':
      snowflake(c, -s.torsoHW * 0.45, cy - 6, 8);
      snowflake(c, s.torsoHW * 0.45, s.torsoBot + 8, 7);
      break;
    case 'skulls':
      skullIcon(c, 0, cy - 2, 9);
      break;
    case 'gold_trim':
      stroke(c, [-s.torsoHW + 4, s.torsoTop + 4, s.torsoHW - 4, s.torsoTop + 4], '#F5C518', 4);
      break;
    case 'cosmic':
      for (let i = 0; i < 9; i++) sparkle(c, -s.hipHW * 0.8 + ((i * 37) % 100) * s.hipHW * 0.016, s.torsoTop + 14 + ((i * 53) % 100) * 1.1, 3 + (i % 3), '#FFFFFF', 0.9);
      break;
  }
}

function drawOffhand(b: BodyCtx, item: OffhandId): void {
  const { c, spec, main, trim } = b;
  const [x, y] = b.handL;
  switch (item) {
    case 'round_shield':
      paint(c, P.circle(x - 6, y + 2, 26), main, { cel: true });
      circle(c, x - 6, y + 2, 26, null, { lw: 5, stroke: shade(STEEL, -0.1) });
      circle(c, x - 6, y + 2, 26, null, { lw: 2 });
      circle(c, x - 6, y + 2, 8, STEEL, { lw: 3 });
      break;
    case 'lion_shield':
      paint(c, P.circle(x - 6, y + 2, 28), '#F5C518', { cel: true });
      circle(c, x - 6, y + 2, 20, main, { lw: 3 });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        circle(c, x - 6 + Math.cos(a) * 11, y + 2 + Math.sin(a) * 11, 4.5, '#E0A020', { lw: 1.5 });
      }
      circle(c, x - 6, y + 2, 8, '#F5C518', { lw: 2 });
      break;
    case 'kite_shield':
      paint(c, P.poly([x - 30, y - 22, x + 16, y - 22, x + 14, y + 6, x - 7, y + 36, x - 28, y + 6]), main, { cel: true });
      stroke(c, [x - 7, y - 18, x - 7, y + 28], STEEL, 5);
      stroke(c, [x - 26, y - 6, x + 12, y - 6], STEEL, 5);
      stroke(c, [x - 30, y - 22, x + 16, y - 22], trim, 4);
      break;
    case 'mud_ball':
      circle(c, x, y - 4, 13, '#8B6A3E', { cel: true, celOffset: 3 });
      circle(c, x - 4, y - 8, 3, '#A8865A', { lw: 0 });
      circle(c, x, y, spec.handRad, b.look.skin, { lw: 4 });
      break;
    case 'hourglass':
      rrect(c, x - 13, y - 30, 26, 6, 2, '#C9A227', { lw: 3 });
      rrect(c, x - 13, y + 6, 26, 6, 2, '#C9A227', { lw: 3 });
      poly(c, [x - 10, y - 24, x + 10, y - 24, x + 2, y - 9, x + 10, y + 6, x - 10, y + 6, x - 2, y - 9], 'rgba(220,240,255,0.7)', { lw: 3 });
      poly(c, [x - 6, y + 5, x + 6, y + 5, x, y - 4], '#F5D76E', { lw: 0 });
      circle(c, x, y, spec.handRad * 0.8, b.look.skin, { lw: 3.5 });
      break;
    case 'radio':
      rrect(c, x - 9, y - 26, 18, 30, 4, '#3A3A3A', { lw: 3.5 });
      stroke(c, [x + 5, y - 26, x + 5, y - 40], '#3A3A3A', 3);
      circle(c, x, y - 18, 3, '#7ED957', { lw: 0 });
      circle(c, x, y, spec.handRad, b.look.skin, { lw: 4 });
      break;
    case 'coin':
      coin(c, x, y - 12, 9);
      circle(c, x, y, spec.handRad, b.look.skin, { lw: 4 });
      break;
    case 'gold_nugget':
      glow(c, x, y - 14, 18, '#FFE27A', 0.6);
      blob(c, [x - 10, y - 10, x - 6, y - 22, x + 6, y - 24, x + 11, y - 12, x + 2, y - 6], '#F5C518', { lw: 3 });
      circle(c, x, y, spec.handRad, b.look.skin, { lw: 4 });
      break;
    case 'none':
      break;
  }
}

function drawFront(b: BodyCtx, item: FrontId): void {
  const { c, spec: s, look } = b;
  const col = look.frontColor ?? '#2BB3A3';
  const neckY = s.torsoTop + 2;
  switch (item) {
    case 'drum':
    case 'drum_flame': {
      const dy = (s.torsoTop + s.torsoBot) / 2 + 8;
      const w = s.torsoHW + 6;
      stroke(c, [-s.torsoHW + 4, s.torsoTop + 2, s.torsoHW - 6, dy - 10], '#6B4226', 5);
      paint(c, P.rrect(-w, dy - 10, w * 2, 36, 8), item === 'drum_flame' ? '#3A1A1A' : '#C0392B', { cel: true });
      for (let i = 0; i < 4; i++) stroke(c, [-w + 6 + i * (w * 2 - 12) / 4, dy - 6, -w + 6 + (i + 0.5) * (w * 2 - 12) / 4, dy + 22, -w + 6 + (i + 1) * (w * 2 - 12) / 4, dy - 6], '#F3EAD3', 2.5);
      ellipse(c, 0, dy - 10, w, 9, '#F3E7C9', { lw: 4 });
      if (item === 'drum_flame') for (let i = -1; i <= 1; i++) flame(c, i * w * 0.6, dy + 16, 6, '#FF7A2F', '#FFE27A');
      break;
    }
    case 'scarf':
      blob(c, [-s.torsoHW + 4, neckY - 6, s.torsoHW - 4, neckY - 6, s.torsoHW - 2, neckY + 8, -s.torsoHW + 2, neckY + 8], col, { lw: 4, cel: true, celOffset: 2 });
      blob(c, [s.torsoHW * 0.3, neckY + 4, s.torsoHW * 0.75, neckY + 34, s.torsoHW * 0.45, neckY + 38, s.torsoHW * 0.1, neckY + 8], shade(col, -0.1), { lw: 3.5 });
      break;
    case 'muffler':
      blob(c, [-s.torsoHW + 2, neckY - 8, s.torsoHW - 2, neckY - 8, s.torsoHW, neckY + 8, -s.torsoHW, neckY + 8], col, { lw: 4 });
      blob(c, [-s.torsoHW * 0.4, neckY + 4, -s.torsoHW - 30, neckY + 10, -s.torsoHW - 46, neckY + 30, -s.torsoHW - 20, neckY + 18, -s.torsoHW * 0.2, neckY + 10], col, { lw: 3.5 });
      glow(c, -s.torsoHW - 30, neckY + 20, 22, '#B36BFF', 0.35);
      break;
    case 'belt_pouch': {
      const y = s.torsoBot - 26;
      rrect(c, s.hipHW * 0.25, y, 22, 20, 6, '#7A4A2A', { lw: 3.5 });
      blob(c, [s.hipHW * 0.25 + 4, y + 2, s.hipHW * 0.25 + 11, y - 9, s.hipHW * 0.25 + 18, y + 2], '#F5C518', { lw: 2.5 });
      break;
    }
    case 'ammo_belt':
      line(c, [-s.torsoHW + 6, s.torsoTop + 4, s.hipHW - 4, s.torsoBot - 6], '#5A4A2A', 9);
      for (let i = 0; i < 6; i++) {
        const t = (i + 0.5) / 6;
        const x = -s.torsoHW + 6 + t * (s.hipHW - 4 + s.torsoHW - 6);
        const y = s.torsoTop + 4 + t * (s.torsoBot - 10 - s.torsoTop);
        rrect(c, x - 3, y - 7, 6, 11, 2, '#D9A93A', { lw: 2 });
      }
      break;
    case 'coin_belt':
      rrect(c, -s.hipHW - 2, s.torsoBot - 22, s.hipHW * 2 + 4, 12, 4, '#3A2A1A', { lw: 3.5 });
      for (let i = -2; i <= 2; i++) coin(c, i * s.hipHW * 0.4, s.torsoBot - 16, 6);
      break;
    case 'bone_necklace':
      for (let i = -3; i <= 3; i++) {
        const x = i * s.torsoHW * 0.22;
        const y = s.torsoTop + 10 + (3 - Math.abs(i)) * 3;
        poly(c, [x - 3, y, x, y + 10, x + 3, y], '#F3EAD3', { lw: 2 });
      }
      stroke(c, [-s.torsoHW * 0.7, s.torsoTop + 6, 0, s.torsoTop + 20, s.torsoHW * 0.7, s.torsoTop + 6], '#6B4226', 2.5);
      break;
    case 'emblem': {
      const y = (s.torsoTop + s.torsoBot) / 2 - 4;
      circle(c, 0, y, 16, '#1E1E2A', { lw: 3.5, stroke: '#F1C40F' });
      const cols = ['#6B7A3A', '#2E5AAC', '#A0522D', '#3A9D5D', '#5B3A8C', '#B23A2E', '#E58FC4'];
      cols.forEach((cc, i) => {
        const a = -Math.PI / 2 + (i / 7) * Math.PI * 2;
        circle(c, Math.cos(a) * 10, y + Math.sin(a) * 10, 3.6, cc, { lw: 1.2 });
      });
      star(c, 0, y, 4.5, '#F1C40F', { lw: 1 });
      break;
    }
    case 'card_vest':
      decorate(b, 'card_suits');
      break;
    case 'sash':
      line(c, [s.torsoHW - 4, s.torsoTop + 4, -s.hipHW + 4, s.torsoBot - 6], col, 8);
      break;
    case 'tie':
      poly(c, [-5, s.torsoTop + 6, 5, s.torsoTop + 6, 3, s.torsoTop + 12, 7, s.torsoTop + 40, 0, s.torsoTop + 48, -7, s.torsoTop + 40, -3, s.torsoTop + 12], b.trim === '#9AA0A6' ? '#C0392B' : b.trim, { lw: 2.5 });
      break;
    case 'none':
      break;
  }
}

/** 발밑 장식: behind = 캐릭터 뒤(먼저) / front = 캐릭터 앞(나중) */
function drawGround(b: BodyCtx, item: GroundId, layer: 'behind' | 'front'): void {
  const { c } = b;
  if (layer === 'front') {
    if (item === 'anvil' || item === 'anvil_flame') {
      const x = 74;
      if (item === 'anvil_flame') glow(c, x, -26, 36, '#FF7A2F', 0.7);
      poly(c, [x - 30, -36, x + 26, -36, x + 34, -30, x + 14, -24, x + 10, -10, x + 18, 0, x - 20, 0, x - 12, -10, x - 16, -24, x - 30, -28], item === 'anvil_flame' ? '#4A3A3A' : '#5A5F68', { cel: true, celOffset: 4 });
      shine(c, x - 12, -33, 10, 2, 0.5);
      if (item === 'anvil_flame') for (let i = -1; i <= 1; i++) flame(c, x + i * 12, -42, 6, '#FF7A2F', '#FFE27A');
    }
    return;
  }
  switch (item) {
    case 'coin_pile':
      for (let row = 0; row < 3; row++)
        for (let i = 0; i < 6 - row * 2; i++) coin(c, -50 + row * 18 + i * 20 + (row % 2) * 4, -10 - row * 14, 11);
      break;
    case 'gold_throne':
      // 금괴 왕좌: 몸보다 넓은 등받이 + 양쪽 팔걸이
      paint(c, P.rrect(-86, -196, 172, 196, 22), '#D4A017', { cel: true });
      for (let i = 0; i < 5; i++) for (const s of [-1, 1]) rrect(c, s > 0 ? 48 : -82, -184 + i * 36, 34, 26, 5, '#F5C518', { lw: 3 });
      for (const s of [-1, 1]) rrect(c, s > 0 ? 60 : -102, -74, 42, 30, 8, '#F5C518', { lw: 3.5, cel: true, celOffset: 2 });
      circle(c, 0, -200, 16, '#FF4D6D', { lw: 3 });
      break;
    case 'coin_throne':
      paint(c, P.rrect(-90, -200, 180, 200, 24), '#5A3A1A', { cel: true });
      for (let row = 0; row < 8; row++) for (const s of [-1, 1]) for (let i = 0; i < 2; i++) coin(c, s * (64 + i * 18) + (row % 2) * 4 * s, -186 + row * 23, 10);
      for (const s of [-1, 1]) {
        rrect(c, s > 0 ? 58 : -104, -78, 46, 32, 10, '#D4A017', { lw: 3.5, cel: true, celOffset: 2 });
        coin(c, s * 82, -84, 9);
      }
      crownTop(c, 0, -208);
      break;
    case 'magic_circle':
    case 'magic_circle_big': {
      const r = item === 'magic_circle_big' ? 100 : 74;
      c.save();
      c.translate(0, -2);
      c.scale(1, 0.36);
      glow(c, 0, 0, r * 1.1, '#B36BFF', 0.55);
      circle(c, 0, 0, r, null, { lw: 6, stroke: '#D9A6FF' });
      circle(c, 0, 0, r * 0.78, null, { lw: 3, stroke: '#D9A6FF' });
      paint(c, P.star(0, 0, r * 0.78, 6, 0.5), null, { lw: 3, stroke: '#E8C9FF' });
      if (item === 'magic_circle_big') for (let i = 0; i < 8; i++) circle(c, Math.cos((i / 8) * Math.PI * 2) * r * 0.9, Math.sin((i / 8) * Math.PI * 2) * r * 0.9, 6, '#FFFFFF', { lw: 0 });
      c.restore();
      break;
    }
    case 'wind_swirl':
      for (let i = 0; i < 3; i++) {
        c.save();
        c.translate(0, -6 - i * 8);
        c.scale(1, 0.3);
        paint(
          c,
          (cc) => {
            cc.beginPath();
            cc.arc(0, 0, 60 - i * 10, 0.2 + i, Math.PI * 1.6 + i);
          },
          null,
          { lw: 5, stroke: i === 1 ? '#FFFFFF' : '#BFE9FF' },
        );
        c.restore();
      }
      break;
    case 'cloud':
      blob(c, [-70, -6, -50, -30, -16, -26, 10, -36, 44, -26, 70, -8, 40, 6, -40, 6], '#FFFFFF', { cel: true });
      break;
    default:
      break;
  }
}

function crownTop(c: Ctx, x: number, y: number): void {
  poly(c, [x - 26, y + 10, x - 26, y - 10, x - 13, y, x, y - 16, x + 13, y, x + 26, y - 10, x + 26, y + 10], '#F5C518', { lw: 3.5 });
}

/** 등급 별 줄 (기존 chibi.ts와 같은 높이·간격). 신 = 무지개 별, 히든 = 검은 별 + 금 테두리 */
export function drawGradeStars(c: Ctx, grade: Grade | undefined): void {
  if (!grade) return;
  const n = Math.max(1, GRADE_STARS[grade]);
  const r = n > 3 ? 12 : 15;
  const gap = n > 3 ? 27 : 34;
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * gap;
    if (grade === 'god') {
      glow(c, x, STAR_Y, 26, '#FFFFFF', 0.6);
      paint(c, P.star(x, STAR_Y, r + 3), rainbow(c, x - r, STAR_Y - r, x + r, STAR_Y + r), { lw: 3 });
    } else if (grade === 'hidden') {
      glow(c, x, STAR_Y, 24, '#F1C40F', 0.5);
      star(c, x, STAR_Y, r + 3, '#1E1E2A', { lw: 3.5, stroke: '#F1C40F' });
    } else star(c, x, STAR_Y, r, '#FFD84A', { lw: 3 });
  }
}

/** 신의 무지개 후광 (머리 뒤 고리) */
function deityHalo(c: Ctx, x: number, y: number, r: number): void {
  glow(c, x, y, r * 1.7, '#FFFFFF', 0.4);
  c.save();
  c.lineWidth = 7;
  c.strokeStyle = rainbow(c, x - r * 1.3, y, x + r * 1.3, y);
  c.beginPath();
  c.arc(x, y, r * 1.28, 0, Math.PI * 2);
  c.stroke();
  c.restore();
}

/** body 파츠 전체 (원점 = 발밑). */
export function drawBodyPart(c: Ctx, look: HumanLook, opts: { stars?: boolean } = {}): void {
  const spec = BODY_SPECS[look.body];
  const trim = trimColor(look.grade);
  const b: BodyCtx = { c, look, spec, trim, main: look.colors[0] ?? '#888888', second: look.colors[1] ?? '#CCCCCC', ...handPositions(look, spec) };
  if (look.ground) drawGround(b, look.ground, 'behind');
  outfit(b);
  for (const d of look.deco ?? []) decorate(b, d);
  if (look.front) drawFront(b, look.front);
  // 손 (오른손은 prop 파츠에도 같은 자리에 다시 그려 소품을 쥔 것처럼 보인다)
  const hc = handColor(look);
  if (look.body !== 'stone') {
    circle(c, b.handL[0], b.handL[1], spec.handRad, hc, { lw: 4, cel: true, celOffset: 2 });
    circle(c, b.handR[0], b.handR[1], spec.handRad, hc, { lw: 4, cel: true, celOffset: 2 });
    if (PROP_META[look.prop ?? 'none'].pose === 'pray') glow(c, 0, b.handL[1] - 8, 26, '#FFF3A8', 0.6);
  }
  if (look.offhand) drawOffhand(b, look.offhand);
  const h: HeadCtx = { c, x: 0, y: spec.headY, r: spec.headR, look, trim };
  if (look.body === 'deity') deityHalo(c, 0, spec.headY, spec.headR);
  drawHead(h);
  if (look.ground) drawGround(b, look.ground, 'front');
  if (opts.stars !== false) drawGradeStars(c, look.grade);
  void sparkle;
}
