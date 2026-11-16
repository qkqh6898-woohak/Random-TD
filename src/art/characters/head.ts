/**
 * 머리 그리기: 머리카락·귀·얼굴 표정·안경·수염·머리 장식 라이브러리 (Canvas 2D, Phaser 없음).
 * 모든 함수의 좌표: (x, y) = 머리 중심, r = 머리 반지름.
 */
import { OUTLINE, P, blob, bolt, circle, clover, ellipse, flame, glow, paint, poly, rrect, shade, shine, skullIcon, sparkle, star, stroke, type Ctx } from './cv';
import type { BeardId, EarId, EyewearId, FaceId, HairStyle, HeadDeco, HeadgearId } from './library';
import type { HumanLook } from './looks';

export interface HeadCtx {
  c: Ctx;
  x: number;
  y: number;
  r: number;
  look: HumanLook;
  /** 등급 색 (테두리·장식) */
  trim: string;
}

// ---------------------------------------------------------------------------
// 귀
// ---------------------------------------------------------------------------

export function drawEars(h: HeadCtx, ears: EarId): void {
  const { c, x, y, r } = h;
  const skin = h.look.skin;
  const both = (draw: (s: 1 | -1) => void): void => {
    draw(-1);
    draw(1);
  };
  switch (ears) {
    case 'human':
      both((s) => ellipse(c, x + s * r * 0.95, y + r * 0.12, r * 0.18, r * 0.24, skin, { lw: 4 }));
      break;
    case 'elf':
      both((s) => poly(c, [x + s * r * 0.8, y - r * 0.05, x + s * r * 1.55, y - r * 0.55, x + s * r * 0.86, y + r * 0.32], skin, { lw: 4, cel: true, celOffset: 3 }));
      break;
    case 'darkelf':
      both((s) => poly(c, [x + s * r * 0.8, y - r * 0.08, x + s * r * 1.6, y - r * 0.2, x + s * r * 0.86, y + r * 0.32], skin, { lw: 4, cel: true, celOffset: 3 }));
      break;
    case 'goblin':
      both((s) => {
        poly(c, [x + s * r * 0.78, y - r * 0.2, x + s * r * 1.75, y - r * 0.42, x + s * r * 0.85, y + r * 0.35], skin, { lw: 4, cel: true, celOffset: 4 });
        poly(c, [x + s * r * 0.95, y - r * 0.1, x + s * r * 1.45, y - r * 0.3, x + s * r * 0.95, y + r * 0.18], shade(skin, -0.18), { lw: 0 });
      });
      break;
    case 'orc':
      both((s) => poly(c, [x + s * r * 0.82, y - r * 0.1, x + s * r * 1.3, y - r * 0.32, x + s * r * 0.88, y + r * 0.3], skin, { lw: 4 }));
      break;
    case 'fairy':
      both((s) => poly(c, [x + s * r * 0.82, y - r * 0.02, x + s * r * 1.28, y - r * 0.38, x + s * r * 0.88, y + r * 0.28], skin, { lw: 4 }));
      break;
    case 'none':
      break;
  }
}

// ---------------------------------------------------------------------------
// 머리카락 (뒤 / 앞)
// ---------------------------------------------------------------------------

/** 머리 뒤쪽 (머리 원보다 먼저 그린다). */
export function drawHairBack(h: HeadCtx, style: HairStyle, covered: boolean): void {
  const { c, x, y, r } = h;
  const col = h.look.hair;
  const dark = shade(col, -0.12);
  switch (style) {
    case 'long':
      blob(c, [x - r * 1.0, y - r * 0.3, x - r * 0.9, y + r * 1.25, x - r * 0.3, y + r * 1.15, x + r * 0.3, y + r * 1.15, x + r * 0.9, y + r * 1.25, x + r * 1.0, y - r * 0.3, x, y - r * 1.05], dark, { cel: true });
      break;
    case 'flowing':
      blob(c, [x - r * 1.0, y - r * 0.4, x - r * 1.15, y + r * 0.9, x - r * 0.6, y + r * 1.45, x + r * 0.3, y + r * 1.2, x + r * 1.25, y + r * 1.5, x + r * 1.4, y + r * 0.6, x + r * 1.0, y - r * 0.5, x, y - r * 1.05], dark, { cel: true });
      break;
    case 'ponytail':
      blob(c, [x + r * 0.7, y - r * 0.5, x + r * 1.35, y - r * 0.2, x + r * 1.4, y + r * 0.7, x + r * 1.05, y + r * 1.3, x + r * 0.95, y + r * 0.4], dark, { cel: true });
      circle(c, x + r * 0.9, y - r * 0.42, r * 0.14, h.trim, { lw: 3 });
      break;
    case 'twintail':
      for (const s of [-1, 1]) {
        blob(c, [x + s * r * 0.75, y - r * 0.55, x + s * r * 1.45, y - r * 0.3, x + s * r * 1.5, y + r * 0.7, x + s * r * 1.15, y + r * 1.2, x + s * r * 0.95, y + r * 0.2], dark, { cel: true });
        circle(c, x + s * r * 0.92, y - r * 0.5, r * 0.15, h.trim, { lw: 3 });
      }
      break;
    case 'bun':
      circle(c, x, y - r * 1.02, r * 0.36, col, { cel: true });
      break;
    case 'bob':
      blob(c, [x - r * 1.05, y - r * 0.2, x - r * 1.0, y + r * 0.75, x - r * 0.5, y + r * 0.85, x + r * 0.5, y + r * 0.85, x + r * 1.0, y + r * 0.75, x + r * 1.05, y - r * 0.2, x, y - r * 1.08], dark, { cel: true });
      break;
    case 'wild':
      blob(c, [x - r * 1.15, y - r * 0.1, x - r * 1.25, y + r * 0.6, x - r * 0.9, y + r * 0.95, x, y + r * 0.6, x + r * 0.9, y + r * 0.95, x + r * 1.25, y + r * 0.6, x + r * 1.15, y - r * 0.2, x + r * 0.8, y - r * 1.15, x, y - r * 1.25, x - r * 0.8, y - r * 1.15], dark, { cel: true });
      break;
    case 'topknot':
      circle(c, x, y - r * 1.05, r * 0.24, col, { cel: true });
      rrect(c, x - r * 0.2, y - r * 0.92, r * 0.4, r * 0.12, 3, h.trim, { lw: 3 });
      break;
    default:
      break;
  }
  if (covered && (style === 'long' || style === 'flowing')) {
    // 두건 아래로 내려온 머리카락은 위에서 다시 그리지 않는다
  }
}

/** 앞머리 (머리 원과 얼굴 다음, 머리 장식 전에). cover = 머리 장식이 덮는 정도 */
export function drawHairFront(h: HeadCtx, style: HairStyle, cover: Cover): void {
  const { c, x, y, r } = h;
  if (cover === 'full' || style === 'none') return;
  const col = h.look.hair;
  const top = cover === 'top';
  // 기본 앞머리 덮개: 머리 위 절반 + 아래 가장자리 물결
  const cap = (depth: number, waves: number): void => {
    const pts: number[] = [];
    const n = 18;
    for (let i = 0; i <= n; i++) {
      const a = Math.PI + (i / n) * Math.PI;
      pts.push(x + Math.cos(a) * r * 1.04, y + Math.sin(a) * r * 1.04);
    }
    // 아래 가장자리 (오른쪽 → 왼쪽, 물결)
    for (let i = 0; i <= waves * 2; i++) {
      const t = 1 - i / (waves * 2);
      const px = x - r * 1.0 + t * r * 2.0;
      const py = y - r * depth + (i % 2 === 0 ? r * 0.22 : 0) * (Math.abs(t - 0.5) < 0.45 ? 1 : 0.4);
      pts.push(px, py);
    }
    paint(c, P.poly(pts), col, { lw: 4, cel: true, celOffset: 5 });
    shine(c, x - r * 0.45, y - r * 0.72, r * 0.22, r * 0.09, 0.45);
  };
  if (top) {
    // 모자·투구 아래: 옆머리만 살짝
    for (const s of [-1, 1]) blob(c, [x + s * r * 0.98, y - r * 0.35, x + s * r * 0.75, y - r * 0.45, x + s * r * 0.72, y + r * 0.15, x + s * r * 0.95, y + r * 0.3], col, { lw: 3.5 });
    if (style === 'long' || style === 'flowing' || style === 'twintail') for (const s of [-1, 1]) blob(c, [x + s * r * 0.98, y - r * 0.2, x + s * r * 1.12, y + r * 0.9, x + s * r * 0.82, y + r * 0.85, x + s * r * 0.78, y], col, { lw: 3.5 });
    return;
  }
  switch (style) {
    case 'short':
    case 'ponytail':
    case 'topknot':
      cap(0.18, 3);
      break;
    case 'long':
    case 'flowing':
      cap(0.12, 3);
      for (const s of [-1, 1]) blob(c, [x + s * r * 1.0, y - r * 0.3, x + s * r * 1.12, y + r * 0.95, x + s * r * 0.78, y + r * 0.9, x + s * r * 0.76, y - r * 0.05], col, { lw: 3.5 });
      break;
    case 'twintail':
    case 'bob':
      cap(0.1, 4);
      for (const s of [-1, 1]) blob(c, [x + s * r * 1.02, y - r * 0.3, x + s * r * 1.05, y + r * 0.62, x + s * r * 0.78, y + r * 0.55, x + s * r * 0.75, y - r * 0.1], col, { lw: 3.5 });
      break;
    case 'bun':
      cap(0.3, 2);
      break;
    case 'spiky': {
      cap(0.2, 3);
      for (let i = -2; i <= 2; i++) {
        const bx = x + i * r * 0.36;
        poly(c, [bx - r * 0.24, y - r * 0.82 + Math.abs(i) * r * 0.12, bx + i * r * 0.08, y - r * 1.45 + Math.abs(i) * r * 0.18, bx + r * 0.24, y - r * 0.82 + Math.abs(i) * r * 0.12], col, { lw: 4 });
      }
      break;
    }
    case 'static': {
      for (let i = 0; i < 9; i++) {
        const a = Math.PI + 0.15 + (i / 8) * (Math.PI - 0.3);
        const bx = x + Math.cos(a) * r * 0.85;
        const by = y + Math.sin(a) * r * 0.85;
        poly(c, [bx + Math.cos(a + 1.4) * r * 0.2, by + Math.sin(a + 1.4) * r * 0.2, x + Math.cos(a) * r * 1.6, y + Math.sin(a) * r * 1.6, bx + Math.cos(a - 1.4) * r * 0.2, by + Math.sin(a - 1.4) * r * 0.2], col, { lw: 4 });
      }
      cap(0.25, 3);
      break;
    }
    case 'wild':
      cap(0.15, 4);
      blob(c, [x - r * 0.6, y - r * 0.95, x - r * 0.2, y - r * 1.35, x + r * 0.25, y - r * 1.05, x + r * 0.65, y - r * 1.3, x + r * 0.7, y - r * 0.8, x, y - r * 0.7], col, { lw: 4 });
      break;
    case 'mohawk':
      // 옆은 짧게 깎은 자국 + 가운데 볏
      paint(c, P.dome(x, y - r * 0.05, r * 0.98, 0.95), shade(h.look.skin, -0.18), { lw: 0, alpha: 0.6 });
      blob(c, [x - r * 0.22, y - r * 0.75, x - r * 0.18, y - r * 1.45, x + r * 0.05, y - r * 1.6, x + r * 0.25, y - r * 1.35, x + r * 0.22, y - r * 0.75], col, { lw: 4, cel: true, celOffset: 3 });
      break;
    case 'slick':
      cap(0.35, 1);
      stroke(c, [x - r * 0.2, y - r * 1.0, x - r * 0.35, y - r * 0.5], shade(col, 0.4), 3, 0.8);
      break;
    case 'tuft':
      blob(c, [x - r * 0.2, y - r * 0.92, x - r * 0.05, y - r * 1.45, x + r * 0.12, y - r * 1.15, x + r * 0.35, y - r * 1.38, x + r * 0.25, y - r * 0.88], col, { lw: 4 });
      break;
    case 'flame': {
      for (let i = -2; i <= 2; i++) flame(c, x + i * r * 0.32, y - r * 0.9 + Math.abs(i) * r * 0.15, r * (0.34 - Math.abs(i) * 0.04), col, '#FFFFFF');
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// 얼굴
// ---------------------------------------------------------------------------

function eye(c: Ctx, x: number, y: number, r: number, color: string, open = 1): void {
  ellipse(c, x, y, r * 0.11, r * 0.16 * open, color === OUTLINE ? OUTLINE : shade(color, -0.35), { lw: 0 });
  if (color !== OUTLINE) ellipse(c, x, y + r * 0.02, r * 0.075, r * 0.11 * open, color, { lw: 0 });
  circle(c, x + r * 0.04, y - r * 0.06 * open, r * 0.04, '#FFFFFF', { lw: 0 });
}

function lid(c: Ctx, x: number, y: number, r: number, down = true): void {
  stroke(c, down ? [x - r * 0.13, y - r * 0.02, x, y + r * 0.07, x + r * 0.13, y - r * 0.02] : [x - r * 0.13, y + r * 0.04, x, y - r * 0.07, x + r * 0.13, y + r * 0.04], OUTLINE, r * 0.055);
}

function brow(c: Ctx, x: number, y: number, r: number, tilt: number, col = OUTLINE): void {
  stroke(c, [x - r * 0.14, y - tilt * r * 0.06, x + r * 0.14, y + tilt * r * 0.06], col, r * 0.06);
}

export function drawFace(h: HeadCtx, face: FaceId): void {
  const { c, x, y, r } = h;
  const ec = h.look.eyeColor ?? OUTLINE;
  const ex = r * 0.36;
  const ey = y + r * 0.18;
  const blush = (): void => {
    ellipse(c, x - r * 0.6, y + r * 0.45, r * 0.15, r * 0.08, '#FF8A8A', { lw: 0, alpha: 0.5 });
    ellipse(c, x + r * 0.6, y + r * 0.45, r * 0.15, r * 0.08, '#FF8A8A', { lw: 0, alpha: 0.5 });
  };
  const smile = (w = 0.13, d = 0.08): void => stroke(c, [x - r * w, y + r * 0.44, x, y + r * (0.44 + d), x + r * w, y + r * 0.44], OUTLINE, r * 0.05);
  const openMouth = (w = 0.17, d = 0.17): void => {
    paint(
      c,
      (cc) => {
        cc.beginPath();
        cc.moveTo(x - r * w, y + r * 0.4);
        cc.quadraticCurveTo(x, y + r * (0.4 + d * 2), x + r * w, y + r * 0.4);
        cc.closePath();
      },
      '#7A2A2A',
      { lw: r * 0.045 },
    );
    ellipse(c, x, y + r * (0.4 + d * 0.95), r * w * 0.5, r * d * 0.35, '#FF7A7A', { lw: 0 });
  };
  switch (face) {
    case 'smile':
      eye(c, x - ex, ey, r, ec);
      eye(c, x + ex, ey, r, ec);
      blush();
      smile();
      break;
    case 'grin':
      eye(c, x - ex, ey, r, ec);
      eye(c, x + ex, ey, r, ec);
      blush();
      openMouth();
      break;
    case 'cheer':
      lid(c, x - ex, ey, r, false);
      lid(c, x + ex, ey, r, false);
      blush();
      openMouth(0.2, 0.2);
      break;
    case 'determined':
      eye(c, x - ex, ey, r, ec);
      eye(c, x + ex, ey, r, ec);
      brow(c, x - ex, ey - r * 0.24, r, 1.4);
      brow(c, x + ex, ey - r * 0.24, r, -1.4);
      stroke(c, [x - r * 0.1, y + r * 0.47, x + r * 0.1, y + r * 0.45], OUTLINE, r * 0.05);
      blush();
      break;
    case 'stern':
      eye(c, x - ex, ey, r, ec, 0.8);
      eye(c, x + ex, ey, r, ec, 0.8);
      brow(c, x - ex, ey - r * 0.2, r, 0.6);
      brow(c, x + ex, ey - r * 0.2, r, -0.6);
      stroke(c, [x - r * 0.12, y + r * 0.5, x, y + r * 0.46, x + r * 0.12, y + r * 0.5], OUTLINE, r * 0.05);
      break;
    case 'calm':
      eye(c, x - ex, ey, r, ec, 0.75);
      eye(c, x + ex, ey, r, ec, 0.75);
      stroke(c, [x - ex - r * 0.13, ey - r * 0.08, x - ex + r * 0.13, ey - r * 0.08], OUTLINE, r * 0.05);
      stroke(c, [x + ex - r * 0.13, ey - r * 0.08, x + ex + r * 0.13, ey - r * 0.08], OUTLINE, r * 0.05);
      blush();
      smile(0.1, 0.05);
      break;
    case 'closed':
      lid(c, x - ex, ey, r, true);
      lid(c, x + ex, ey, r, true);
      blush();
      smile(0.09, 0.04);
      break;
    case 'angry':
      eye(c, x - ex, ey, r, ec, 0.85);
      eye(c, x + ex, ey, r, ec, 0.85);
      brow(c, x - ex, ey - r * 0.2, r, 2.4);
      brow(c, x + ex, ey - r * 0.2, r, -2.4);
      rrect(c, x - r * 0.18, y + r * 0.4, r * 0.36, r * 0.14, r * 0.05, '#FFFFFF', { lw: r * 0.045 });
      stroke(c, [x, y + r * 0.4, x, y + r * 0.54], OUTLINE, 2);
      break;
    case 'wink':
      eye(c, x - ex, ey, r, ec);
      lid(c, x + ex, ey, r, false);
      blush();
      smile(0.14, 0.09);
      break;
    case 'smug':
      eye(c, x - ex, ey + r * 0.02, r, ec, 0.6);
      eye(c, x + ex, ey + r * 0.02, r, ec, 0.6);
      stroke(c, [x - ex - r * 0.13, ey - r * 0.04, x - ex + r * 0.13, ey - r * 0.06], OUTLINE, r * 0.06);
      stroke(c, [x + ex - r * 0.13, ey - r * 0.06, x + ex + r * 0.13, ey - r * 0.04], OUTLINE, r * 0.06);
      stroke(c, [x - r * 0.08, y + r * 0.46, x + r * 0.06, y + r * 0.48, x + r * 0.16, y + r * 0.4], OUTLINE, r * 0.05);
      blush();
      break;
    case 'focused':
      ellipse(c, x - ex, ey, r * 0.12, r * 0.07, shade(ec === OUTLINE ? '#5A3A22' : ec, -0.3), { lw: 0 });
      ellipse(c, x + ex, ey, r * 0.12, r * 0.07, shade(ec === OUTLINE ? '#5A3A22' : ec, -0.3), { lw: 0 });
      brow(c, x - ex, ey - r * 0.16, r, 1);
      brow(c, x + ex, ey - r * 0.16, r, -1);
      stroke(c, [x - r * 0.08, y + r * 0.46, x + r * 0.08, y + r * 0.46], OUTLINE, r * 0.045);
      break;
    case 'masked': {
      ellipse(c, x - ex, ey - r * 0.02, r * 0.13, r * 0.07, ec === OUTLINE ? '#2A2133' : ec, { lw: 0 });
      ellipse(c, x + ex, ey - r * 0.02, r * 0.13, r * 0.07, ec === OUTLINE ? '#2A2133' : ec, { lw: 0 });
      brow(c, x - ex, ey - r * 0.17, r, 1.4);
      brow(c, x + ex, ey - r * 0.17, r, -1.4);
      // 아래 얼굴 가리개
      paint(
        c,
        (cc) => {
          cc.beginPath();
          cc.moveTo(x - r * 0.98, y + r * 0.22);
          cc.quadraticCurveTo(x, y + r * 0.32, x + r * 0.98, y + r * 0.22);
          cc.arc(x, y, r * 1.0, 0.22, Math.PI - 0.22);
          cc.closePath();
        },
        h.look.colors[0] ?? '#2A2133',
        { lw: 4, cel: true, celOffset: 3 },
      );
      break;
    }
    case 'shadow': {
      paint(c, P.circle(x, y + r * 0.05, r * 0.88), '#120E1A', { lw: 0, alpha: 0.92 });
      const red = h.look.eyeColor && h.look.eyeColor !== OUTLINE ? h.look.eyeColor : '#FF3B5C';
      for (const s of [-1, 1]) {
        glow(c, x + s * ex, ey, r * 0.3, red, 0.7);
        poly(c, [x + s * ex - r * 0.14, ey - s * r * 0.0 - r * 0.04, x + s * ex + r * 0.14, ey + r * 0.04 * s - r * 0.02, x + s * ex - r * 0.1, ey + r * 0.06], red, { lw: 0 });
      }
      break;
    }
    case 'skull': {
      for (const s of [-1, 1]) {
        ellipse(c, x + s * ex, ey, r * 0.17, r * 0.2, '#1E1A26', { lw: 0 });
        glow(c, x + s * ex, ey, r * 0.18, '#7ED957', 0.9);
      }
      poly(c, [x, y + r * 0.3, x - r * 0.08, y + r * 0.42, x + r * 0.08, y + r * 0.42], '#1E1A26', { lw: 0 });
      for (let i = -2; i <= 2; i++) stroke(c, [x + i * r * 0.1, y + r * 0.55, x + i * r * 0.1, y + r * 0.68], '#1E1A26', 2.5);
      stroke(c, [x - r * 0.26, y + r * 0.6, x + r * 0.26, y + r * 0.6], '#1E1A26', 2.5);
      break;
    }
  }
  if (h.look.tusks) {
    for (const s of [-1, 1]) poly(c, [x + s * r * 0.24, y + r * 0.58, x + s * r * 0.3, y + r * 0.34, x + s * r * 0.14, y + r * 0.56], '#FFF6E0', { lw: 3 });
  }
  if (h.look.paint) {
    for (const s of [-1, 1]) {
      stroke(c, [x + s * r * 0.62, y + r * 0.02, x + s * r * 0.38, y + r * 0.06], '#B23A2E', r * 0.07);
      stroke(c, [x + s * r * 0.64, y + r * 0.14, x + s * r * 0.42, y + r * 0.18], '#B23A2E', r * 0.07);
    }
  }
}

export function drawEyewear(h: HeadCtx, ew: EyewearId): void {
  const { c, x, y, r } = h;
  const ey = y + r * 0.18;
  const ex = r * 0.36;
  switch (ew) {
    case 'glasses':
      for (const s of [-1, 1]) circle(c, x + s * ex, ey, r * 0.22, 'rgba(220,240,255,0.35)', { lw: 3.5 });
      stroke(c, [x - ex + r * 0.22, ey, x + ex - r * 0.22, ey], OUTLINE, 3.5);
      sparkle(c, x - ex + r * 0.08, ey - r * 0.08, r * 0.08);
      break;
    case 'sunglasses':
      for (const s of [-1, 1]) rrect(c, x + s * ex - r * 0.22, ey - r * 0.12, r * 0.44, r * 0.26, r * 0.1, '#1A1A22', { lw: 3.5 });
      stroke(c, [x - ex + r * 0.2, ey - r * 0.04, x + ex - r * 0.2, ey - r * 0.04], OUTLINE, 3.5);
      shine(c, x - ex - r * 0.06, ey - r * 0.04, r * 0.08, r * 0.04, 0.8);
      break;
    case 'goggles':
    case 'goggles_up': {
      const gy = ew === 'goggles' ? ey : y - r * 0.5;
      stroke(c, [x - r * 0.98, gy, x + r * 0.98, gy], '#4A3A2A', r * 0.12);
      for (const s of [-1, 1]) {
        circle(c, x + s * r * 0.34, gy, r * 0.22, '#C9A86A', { lw: 3.5 });
        circle(c, x + s * r * 0.34, gy, r * 0.14, '#7FD3E8', { lw: 2 });
        shine(c, x + s * r * 0.34 - r * 0.05, gy - r * 0.05, r * 0.05, r * 0.03, 0.9);
      }
      break;
    }
    case 'visor':
      rrect(c, x - r * 0.75, ey - r * 0.15, r * 1.5, r * 0.3, r * 0.15, 'rgba(90,240,255,0.55)', { lw: 3.5 });
      stroke(c, [x - r * 0.6, ey - r * 0.04, x + r * 0.2, ey - r * 0.04], '#E8FFFF', 2, 0.8);
      break;
    case 'third_eye':
      glow(c, x, y - r * 0.32, r * 0.35, '#FFE27A', 0.7);
      ellipse(c, x, y - r * 0.32, r * 0.13, r * 0.09, '#FFFFFF', { lw: 2.5 });
      circle(c, x, y - r * 0.32, r * 0.055, '#9B4DFF', { lw: 0 });
      break;
    case 'monocle':
      circle(c, x + ex, ey, r * 0.22, 'rgba(220,240,255,0.35)', { lw: 3.5, stroke: '#C9A227' });
      break;
    case 'none':
      break;
  }
}

export function drawBeard(h: HeadCtx, beard: BeardId): void {
  const { c, x, y, r } = h;
  const col = h.look.beardColor ?? h.look.hair;
  switch (beard) {
    case 'short':
      blob(c, [x - r * 0.75, y + r * 0.3, x - r * 0.55, y + r * 0.85, x, y + r * 1.0, x + r * 0.55, y + r * 0.85, x + r * 0.75, y + r * 0.3, x + r * 0.3, y + r * 0.62, x - r * 0.3, y + r * 0.62], col, { lw: 4, cel: true, celOffset: 3 });
      break;
    case 'braided':
      blob(c, [x - r * 0.8, y + r * 0.25, x - r * 0.6, y + r * 0.95, x, y + r * 1.05, x + r * 0.6, y + r * 0.95, x + r * 0.8, y + r * 0.25, x + r * 0.3, y + r * 0.6, x - r * 0.3, y + r * 0.6], col, { lw: 4, cel: true, celOffset: 3 });
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) ellipse(c, x + s * r * 0.22, y + r * (1.0 + i * 0.2), r * 0.13, r * 0.12, col, { lw: 3 });
        circle(c, x + s * r * 0.22, y + r * 1.6, r * 0.08, '#C9803A', { lw: 2.5 });
      }
      stroke(c, [x - r * 0.25, y + r * 0.5, x, y + r * 0.56, x + r * 0.25, y + r * 0.5], shade(col, -0.3), 3);
      break;
    case 'long':
      blob(c, [x - r * 0.8, y + r * 0.25, x - r * 0.65, y + r * 1.1, x - r * 0.2, y + r * 1.7, x + r * 0.2, y + r * 1.7, x + r * 0.65, y + r * 1.1, x + r * 0.8, y + r * 0.25, x + r * 0.3, y + r * 0.58, x - r * 0.3, y + r * 0.58], col, { lw: 4, cel: true, celOffset: 3 });
      stroke(c, [x - r * 0.15, y + r * 0.9, x - r * 0.1, y + r * 1.4], shade(col, -0.2), 2.5);
      stroke(c, [x + r * 0.15, y + r * 0.9, x + r * 0.1, y + r * 1.4], shade(col, -0.2), 2.5);
      break;
    case 'big':
    case 'big_braided':
      if (beard === 'big_braided') {
        // 크게 땋은 수염 (브론가 철수염): 큰 수염 아래로 굵은 땋은 가닥 둘 + 쇠고리
        for (const s of [-1, 1]) {
          for (let i = 0; i < 4; i++) ellipse(c, x + s * r * 0.34, y + r * (1.35 + i * 0.24), r * 0.17, r * 0.15, col, { lw: 3, cel: true, celOffset: 2 });
          rrect(c, x + s * r * 0.34 - r * 0.15, y + r * 1.62, r * 0.3, r * 0.12, r * 0.05, '#7A808A', { lw: 2.5 });
          poly(c, [x + s * r * 0.34 - r * 0.12, y + r * 2.25, x + s * r * 0.34, y + r * 2.45, x + s * r * 0.34 + r * 0.12, y + r * 2.25], col, { lw: 2.5 });
        }
      }
      blob(c, [x - r * 0.95, y + r * 0.1, x - r * 0.95, y + r * 0.9, x - r * 0.5, y + r * 1.45, x, y + r * 1.55, x + r * 0.5, y + r * 1.45, x + r * 0.95, y + r * 0.9, x + r * 0.95, y + r * 0.1, x + r * 0.35, y + r * 0.6, x - r * 0.35, y + r * 0.6], col, { lw: 4, cel: true, celOffset: 4 });
      stroke(c, [x - r * 0.3, y + r * 0.52, x, y + r * 0.6, x + r * 0.3, y + r * 0.52], shade(col, -0.35), 3.5);
      if (beard === 'big_braided') for (const s of [-1, 1]) stroke(c, [x + s * r * 0.6, y + r * 0.8, x + s * r * 0.4, y + r * 1.2], shade(col, -0.3), 2.5);
      break;
    case 'mustache':
      for (const s of [-1, 1]) blob(c, [x, y + r * 0.36, x + s * r * 0.4, y + r * 0.32, x + s * r * 0.55, y + r * 0.45, x + s * r * 0.3, y + r * 0.48], col, { lw: 3 });
      break;
    case 'none':
      break;
  }
}

// ---------------------------------------------------------------------------
// 머리 장식
// ---------------------------------------------------------------------------

/** 머리 장식이 머리카락을 덮는 정도 */
export type Cover = 'none' | 'top' | 'full';

interface HeadgearDef {
  cover: Cover;
  /** 머리 원보다 먼저 (두건 뒷면 등) */
  back?: (h: HeadCtx, col: string) => void;
  front: (h: HeadCtx, col: string) => void;
  /** 기본 색 (headColor가 없을 때) */
  color?: string;
}

const GOLD = '#F5C518';
const STEEL = '#C9D3DE';

function brim(h: HeadCtx, col: string, w: number, dy: number, ry = 0.16): void {
  ellipse(h.c, h.x, h.y - h.r * dy, h.r * w, h.r * ry, col, { lw: 4, cel: true, celOffset: 3 });
}

function hoodShape(h: HeadCtx, col: string, peak = 1.4, wide = 1.3): void {
  const { c, x, y, r } = h;
  blob(c, [x, y - r * peak, x + r * 0.9, y - r * 0.95, x + r * wide, y + r * 0.2, x + r * 1.15, y + r * 1.0, x - r * 1.15, y + r * 1.0, x - r * wide, y + r * 0.2, x - r * 0.9, y - r * 0.95], col, { cel: true, celOffset: 7 });
}

/** 두건 앞 테두리: 얼굴 위쪽을 덮는 띠 */
function hoodRim(h: HeadCtx, col: string, depth = 0.25): void {
  const { c, x, y, r } = h;
  paint(
    c,
    (cc) => {
      cc.beginPath();
      cc.arc(x, y, r * 1.08, Math.PI * 1.02, Math.PI * 1.98);
      cc.quadraticCurveTo(x + r * 0.5, y - r * depth - r * 0.25, x, y - r * depth);
      cc.quadraticCurveTo(x - r * 0.5, y - r * depth - r * 0.25, x - r * 1.08, y - r * 0.04);
      cc.closePath();
    },
    col,
    { lw: 4, cel: true, celOffset: 4 },
  );
}

function crownPoints(h: HeadCtx, col: string, n: number, height: number, baseDy = 0.62, width = 0.78): void {
  const { c, x, y, r } = h;
  const by = y - r * baseDy;
  const pts: number[] = [x - r * width, by + r * 0.16];
  for (let i = 0; i <= n * 2; i++) {
    const t = i / (n * 2);
    const px = x - r * width + t * r * width * 2;
    const py = i % 2 === 0 ? by - r * height : by - r * height * 0.35;
    pts.push(px, py);
  }
  pts.push(x + r * width, by + r * 0.16);
  poly(h.c, pts, col, { lw: 4, cel: true, celOffset: 3 });
  rrect(c, x - r * width, by - r * 0.02, r * width * 2, r * 0.2, 3, shade(col, -0.12), { lw: 3.5 });
}

function gemAt(c: Ctx, x: number, y: number, s: number, col: string): void {
  poly(c, [x, y - s, x + s * 0.8, y, x, y + s, x - s * 0.8, y], col, { lw: 2.5 });
  shine(c, x - s * 0.2, y - s * 0.3, s * 0.25, s * 0.15, 0.9);
}

export const HEADGEAR_DEFS: Readonly<Record<HeadgearId, HeadgearDef>> = {
  none: { cover: 'none', front: () => {} },
  mining_helmet: {
    cover: 'top',
    color: '#F2C230',
    front: (h, col) => {
      const { c, x, y, r } = h;
      // F10: 낮고 넓은 헬멧 + 밝은 헤드램프 (빛줄기까지 — 흑백에서도 가장 밝은 점)
      paint(c, P.dome(x, y - r * 0.12, r * 1.1, 0.78), col, { cel: true });
      brim(h, shade(col, -0.1), 1.32, 0.1, 0.16);
      rrect(c, x - r * 0.3, y - r * 0.76, r * 0.6, r * 0.18, 4, shade(col, -0.25), { lw: 3 });
      c.save();
      c.globalAlpha *= 0.35;
      poly(c, [x + r * 0.15, y - r * 0.66, x + r * 1.9, y - r * 1.05, x + r * 1.9, y - r * 0.15], '#FFF7C9', { lw: 0 });
      c.restore();
      glow(c, x, y - r * 0.55, r * 0.8, '#FFF3A8', 0.85);
      circle(c, x, y - r * 0.55, r * 0.26, '#FFF7C9', { lw: 3.5 });
      circle(c, x, y - r * 0.55, r * 0.14, '#FFFFFF', { lw: 0 });
    },
  },
  bone_headband: {
    cover: 'none',
    color: '#EFE6CF',
    front: (h, col) => {
      const { c, x, y, r } = h;
      for (let i = -2; i <= 2; i++) poly(c, [x + i * r * 0.32 - r * 0.1, y - r * 0.62, x + i * r * 0.32, y - r * 1.08 + Math.abs(i) * r * 0.1, x + i * r * 0.32 + r * 0.1, y - r * 0.62], col, { lw: 3 });
      rrect(c, x - r * 0.98, y - r * 0.72, r * 1.96, r * 0.2, r * 0.1, '#7A4A2A', { lw: 3.5 });
    },
  },
  wizard_hat: {
    cover: 'top',
    color: '#2E5AAC',
    front: (h, col) => {
      const { c, x, y, r } = h;
      brim(h, shade(col, -0.1), 1.4, 0.5, 0.22);
      // F10: 뾰족한 두건 모자 — 끝이 높이 솟아 뒤로 꺾인다 (흑백 실루엣의 뾰족한 삼각형)
      poly(c, [x - r * 0.8, y - r * 0.55, x - r * 0.2, y - r * 1.5, x + r * 0.35, y - r * 2.05, x + r * 0.95, y - r * 1.85, x + r * 0.45, y - r * 1.4, x + r * 0.8, y - r * 0.55], col, { lw: 4, cel: true, celOffset: 3 });
      rrect(c, x - r * 0.76, y - r * 0.76, r * 1.52, r * 0.2, 4, h.trim, { lw: 3.5 });
      circle(c, x + r * 0.98, y - r * 1.86, r * 0.13, '#F5D76E', { lw: 3 });
    },
  },
  kettle_helmet: {
    cover: 'top',
    color: STEEL,
    front: (h, col) => {
      const { c, x, y, r } = h;
      brim(h, shade(col, -0.15), 1.35, 0.42, 0.2);
      paint(c, P.dome(x, y - r * 0.42, r * 0.92, 0.85), col, { cel: true });
      shine(c, x - r * 0.35, y - r * 0.95, r * 0.2, r * 0.08, 0.8);
      stroke(c, [x, y - r * 1.2, x, y - r * 0.45], shade(col, -0.3), 3);
      // F10: 투구 볏 (위로 솟은 작은 날)
      poly(c, [x - r * 0.1, y - r * 1.22, x, y - r * 1.48, x + r * 0.1, y - r * 1.22], shade(col, -0.2), { lw: 3 });
    },
  },
  knight_helmet: {
    cover: 'top',
    color: STEEL,
    front: (h, col) => {
      const { c, x, y, r } = h;
      blob(c, [x - r * 0.1, y - r * 1.05, x + r * 0.2, y - r * 1.55, x + r * 0.75, y - r * 1.5, x + r * 0.95, y - r * 1.15, x + r * 0.5, y - r * 1.0], '#D84A4A', { lw: 4, cel: true, celOffset: 3 });
      paint(c, P.dome(x, y - r * 0.25, r * 1.06, 0.82), col, { cel: true });
      for (const s of [-1, 1]) rrect(c, x + s * r * 0.98 - r * 0.16, y - r * 0.3, r * 0.32, r * 0.75, r * 0.12, shade(col, -0.08), { lw: 3.5 });
      rrect(c, x - r * 1.0, y - r * 0.38, r * 2, r * 0.16, 4, h.trim, { lw: 3 });
      shine(c, x - r * 0.4, y - r * 0.85, r * 0.22, r * 0.08, 0.8);
    },
  },
  army_helmet: {
    cover: 'top',
    color: '#5E6B33',
    front: (h, col) => {
      const { c, x, y, r } = h;
      paint(c, P.dome(x, y - r * 0.2, r * 1.14, 0.9), col, { cel: true });
      ellipse(c, x, y - r * 0.2, r * 1.2, r * 0.13, shade(col, -0.15), { lw: 4 });
      stroke(c, [x - r * 0.4, y - r * 0.85, x + r * 0.5, y - r * 0.72], shade(col, -0.25), 2.5, 0.8);
      stroke(c, [x - r * 0.95, y - r * 0.1, x - r * 0.9, y + r * 0.55], '#3A2E22', 3);
    },
  },
  helmet_goggles: {
    cover: 'top',
    color: '#5E6B33',
    front: (h, col) => {
      const { c, x, y, r } = h;
      paint(c, P.dome(x, y - r * 0.22, r * 1.12, 0.9), col, { cel: true });
      ellipse(c, x, y - r * 0.22, r * 1.18, r * 0.12, shade(col, -0.15), { lw: 4 });
      stroke(c, [x - r * 1.05, y - r * 0.55, x + r * 1.05, y - r * 0.55], '#2A2A2A', r * 0.12);
      for (const s of [-1, 1]) {
        circle(c, x + s * r * 0.36, y - r * 0.58, r * 0.22, '#3A3A3A', { lw: 3.5 });
        circle(c, x + s * r * 0.36, y - r * 0.58, r * 0.14, '#F2A53A', { lw: 2 });
      }
    },
  },
  wide_hat: {
    cover: 'top',
    color: '#7A3E1D',
    front: (h, col) => {
      const { c, x, y, r } = h;
      brim(h, shade(col, -0.1), 1.55, 0.45, 0.24);
      paint(c, P.rrect(x - r * 0.7, y - r * 1.25, r * 1.4, r * 0.8, r * 0.35), col, { cel: true });
      rrect(c, x - r * 0.7, y - r * 0.68, r * 1.4, r * 0.18, 3, h.trim, { lw: 3 });
      blob(c, [x + r * 0.45, y - r * 0.7, x + r * 0.9, y - r * 1.5, x + r * 1.2, y - r * 1.55, x + r * 0.75, y - r * 0.85], '#FFFFFF', { lw: 3 });
    },
  },
  tribal_mask: {
    cover: 'none',
    color: '#C9A27A',
    front: (h, col) => {
      const { c, x, y, r } = h;
      for (let i = -1; i <= 1; i++) blob(c, [x + i * r * 0.4, y - r * 0.7, x + i * r * 0.55 - r * 0.12, y - r * 1.4, x + i * r * 0.55 + r * 0.12, y - r * 1.45], i === 0 ? '#E85A3A' : '#3D8BFD', { lw: 3 });
      blob(c, [x - r * 0.8, y - r * 0.6, x - r * 0.85, y + r * 0.3, x - r * 0.4, y + r * 0.85, x + r * 0.4, y + r * 0.85, x + r * 0.85, y + r * 0.3, x + r * 0.8, y - r * 0.6, x, y - r * 0.82], col, { cel: true });
      for (const s of [-1, 1]) {
        ellipse(c, x + s * r * 0.35, y + r * 0.0, r * 0.18, r * 0.14, '#2A1A10', { lw: 0 });
        circle(c, x + s * r * 0.35, y, r * 0.06, '#FFE27A', { lw: 0 });
        stroke(c, [x + s * r * 0.15, y - r * 0.4, x + s * r * 0.6, y - r * 0.3], '#B23A2E', 4);
      }
      rrect(c, x - r * 0.3, y + r * 0.4, r * 0.6, r * 0.16, 3, '#FFFFFF', { lw: 3 });
    },
  },
  feather_cap: {
    cover: 'top',
    color: '#6FB7E8',
    front: (h, col) => {
      const { c, x, y, r } = h;
      blob(c, [x - r * 1.05, y - r * 0.38, x - r * 0.75, y - r * 1.12, x + r * 0.3, y - r * 1.22, x + r * 1.15, y - r * 0.75, x + r * 1.05, y - r * 0.4], col, { cel: true });
      rrect(c, x - r * 1.0, y - r * 0.52, r * 2.0, r * 0.18, r * 0.09, h.trim, { lw: 3 });
      blob(c, [x + r * 0.55, y - r * 0.9, x + r * 0.95, y - r * 1.6, x + r * 1.3, y - r * 1.68, x + r * 0.85, y - r * 1.0], '#FFE27A', { lw: 3 });
      stroke(c, [x + r * 0.62, y - r * 0.95, x + r * 1.1, y - r * 1.58], '#C9A227', 2);
    },
  },
  cap: {
    cover: 'top',
    color: '#4F5A2A',
    front: (h, col) => {
      const { c, x, y, r } = h;
      ellipse(c, x - r * 0.55, y - r * 0.4, r * 0.85, r * 0.2, shade(col, -0.15), { lw: 4 }, 0.12);
      paint(c, P.dome(x, y - r * 0.36, r * 1.02, 0.78), col, { cel: true });
      circle(c, x, y - r * 1.12, r * 0.08, shade(col, -0.2), { lw: 2.5 });
      rrect(c, x - r * 0.22, y - r * 0.85, r * 0.44, r * 0.26, 3, h.trim, { lw: 2.5 });
    },
  },
  hood: {
    cover: 'full',
    color: '#4A2E6E',
    back: (h, col) => hoodShape(h, col),
    front: (h, col) => hoodRim(h, col),
  },
  bandana: {
    cover: 'top',
    color: '#B23A2E',
    front: (h, col) => {
      const { c, x, y, r } = h;
      blob(c, [x + r * 0.9, y - r * 0.4, x + r * 1.5, y - r * 0.15, x + r * 1.45, y + r * 0.2, x + r * 1.0, y - r * 0.1], shade(col, -0.1), { lw: 3.5 });
      paint(c, P.dome(x, y - r * 0.32, r * 1.04, 0.72), col, { cel: true });
      for (let i = 0; i < 4; i++) circle(c, x - r * 0.5 + i * r * 0.35, y - r * 0.68 + (i % 2) * r * 0.12, r * 0.06, '#FFFFFF', { lw: 0 });
    },
  },
  goggles_cap: {
    cover: 'top',
    color: '#6B4226',
    front: (h, col) => {
      const { c, x, y, r } = h;
      for (const s of [-1, 1]) rrect(c, x + s * r * 0.95 - r * 0.18, y - r * 0.2, r * 0.36, r * 0.65, r * 0.15, shade(col, -0.1), { lw: 3.5 });
      paint(c, P.dome(x, y - r * 0.18, r * 1.06, 0.92), col, { cel: true });
      stroke(c, [x - r * 1.05, y - r * 0.55, x + r * 1.05, y - r * 0.55], '#3A2A1E', r * 0.1);
      for (const s of [-1, 1]) {
        circle(c, x + s * r * 0.36, y - r * 0.62, r * 0.24, '#B8862E', { lw: 3.5 });
        circle(c, x + s * r * 0.36, y - r * 0.62, r * 0.15, '#9FE3FF', { lw: 2 });
      }
    },
  },
  circlet: {
    cover: 'none',
    color: GOLD,
    front: (h, col) => {
      const { c, x, y, r } = h;
      stroke(c, [x - r * 0.98, y - r * 0.35, x, y - r * 0.6, x + r * 0.98, y - r * 0.35], OUTLINE, r * 0.14);
      stroke(c, [x - r * 0.98, y - r * 0.35, x, y - r * 0.6, x + r * 0.98, y - r * 0.35], col, r * 0.08);
      gemAt(c, x, y - r * 0.6, r * 0.13, h.trim);
    },
  },
  tiara: {
    cover: 'none',
    color: '#DDE6F0',
    front: (h, col) => {
      const { c, x, y, r } = h;
      poly(c, [x - r * 0.6, y - r * 0.72, x - r * 0.35, y - r * 0.98, x - r * 0.15, y - r * 0.85, x, y - r * 1.2, x + r * 0.15, y - r * 0.85, x + r * 0.35, y - r * 0.98, x + r * 0.6, y - r * 0.72, x + r * 0.5, y - r * 0.62, x - r * 0.5, y - r * 0.62], col, { lw: 3.5, cel: true, celOffset: 2 });
      gemAt(c, x, y - r * 0.86, r * 0.12, h.trim === '#9AA0A6' ? '#B36BFF' : h.trim);
    },
  },
  fedora: {
    cover: 'top',
    color: '#3B2A55',
    front: (h, col) => {
      const { c, x, y, r } = h;
      ellipse(c, x, y - r * 0.48, r * 1.38, r * 0.22, shade(col, -0.1), { lw: 4, cel: true, celOffset: 2 }, -0.08);
      blob(c, [x - r * 0.72, y - r * 0.5, x - r * 0.65, y - r * 1.2, x - r * 0.1, y - r * 1.05, x + r * 0.15, y - r * 1.25, x + r * 0.7, y - r * 1.18, x + r * 0.72, y - r * 0.55], col, { cel: true });
      rrect(c, x - r * 0.72, y - r * 0.75, r * 1.44, r * 0.18, 3, h.trim, { lw: 3 });
      star(c, x + r * 0.45, y - r * 0.67, r * 0.1, '#FF4D6D', { lw: 1.5 }, 4, 0.5);
    },
  },
  headband: {
    cover: 'none',
    color: '#6B4226',
    front: (h, col) => {
      const { c, x, y, r } = h;
      blob(c, [x + r * 0.9, y - r * 0.45, x + r * 1.55, y - r * 0.2, x + r * 1.6, y + r * 0.1, x + r * 0.95, y - r * 0.2], col, { lw: 3 });
      rrect(c, x - r * 1.0, y - r * 0.58, r * 2.0, r * 0.22, r * 0.1, col, { lw: 3.5, cel: true, celOffset: 2 });
      circle(c, x, y - r * 0.47, r * 0.09, h.trim, { lw: 2 });
    },
  },
  feather_crown: {
    cover: 'none',
    color: '#E85A3A',
    front: (h, col) => {
      const { c, x, y, r } = h;
      const cols = [col, '#F5C518', '#3D8BFD', '#F5C518', col];
      for (let i = -2; i <= 2; i++) {
        const a = -Math.PI / 2 + i * 0.32;
        const bx = x + i * r * 0.3;
        const by = y - r * 0.7;
        blob(c, [bx - r * 0.1, by, bx + Math.cos(a) * r * 1.0 - r * 0.15, by + Math.sin(a) * r * 1.0, bx + Math.cos(a) * r * 1.1, by + Math.sin(a) * r * 1.1, bx + Math.cos(a) * r * 1.0 + r * 0.15, by + Math.sin(a) * r * 1.0, bx + r * 0.1, by], cols[i + 2] as string, { lw: 3 });
      }
      rrect(c, x - r * 0.95, y - r * 0.78, r * 1.9, r * 0.24, r * 0.1, '#8B5A2B', { lw: 3.5 });
      for (let i = -2; i <= 2; i++) circle(c, x + i * r * 0.36, y - r * 0.66, r * 0.05, '#EFE6CF', { lw: 0 });
    },
  },
  top_hat: {
    cover: 'top',
    color: '#2A2A2A',
    front: (h, col) => {
      const { c, x, y, r } = h;
      brim(h, shade(col, 0.1), 1.2, 0.55, 0.18);
      paint(c, P.rrect(x - r * 0.62, y - r * 1.62, r * 1.24, r * 1.1, r * 0.1), col, { cel: true });
      rrect(c, x - r * 0.62, y - r * 0.82, r * 1.24, r * 0.2, 2, h.trim === '#9AA0A6' ? '#C0392B' : h.trim, { lw: 3 });
      shine(c, x - r * 0.35, y - r * 1.35, r * 0.08, r * 0.2, 0.35);
    },
  },
  ghillie_hood: {
    cover: 'full',
    color: '#5B6B3A',
    back: (h, col) => {
      hoodShape(h, col, 1.3, 1.35);
      const { c, x, y, r } = h;
      for (let i = 0; i < 10; i++) {
        const a = Math.PI * 0.9 + (i / 9) * Math.PI * 1.2;
        blob(c, [x + Math.cos(a) * r * 1.1, y + Math.sin(a) * r * 1.1, x + Math.cos(a) * r * 1.5, y + Math.sin(a) * r * 1.45, x + Math.cos(a + 0.2) * r * 1.15, y + Math.sin(a + 0.2) * r * 1.15], i % 2 ? '#7A8C4A' : '#3F4D28', { lw: 2.5 });
      }
    },
    front: (h, col) => {
      hoodRim(h, col, 0.2);
      const { c, x, y, r } = h;
      for (let i = 0; i < 6; i++) blob(c, [x - r * 0.9 + i * r * 0.36, y - r * 0.55, x - r * 0.8 + i * r * 0.36, y - r * 0.3, x - r * 0.7 + i * r * 0.36, y - r * 0.58], i % 2 ? '#7A8C4A' : '#4A5A2E', { lw: 2 });
    },
  },
  ninja_hood: {
    cover: 'full',
    color: '#2A2133',
    back: (h, col) => {
      const { c, x, y, r } = h;
      blob(c, [x + r * 0.85, y - r * 0.2, x + r * 1.6, y + r * 0.1, x + r * 1.7, y + r * 0.45, x + r * 0.95, y + r * 0.15], shade(col, 0.1), { lw: 3.5 });
      circle(c, x, y - r * 0.02, r * 1.1, col, { cel: true });
    },
    front: (h, col) => {
      const { c, x, y, r } = h;
      paint(
        c,
        (cc) => {
          cc.beginPath();
          cc.arc(x, y, r * 1.1, Math.PI, 0);
          cc.lineTo(x + r * 0.98, y - r * 0.02);
          cc.quadraticCurveTo(x, y - r * 0.25, x - r * 0.98, y - r * 0.02);
          cc.closePath();
        },
        col,
        { lw: 4, cel: true, celOffset: 4 },
      );
      rrect(c, x - r * 1.0, y - r * 0.5, r * 2.0, r * 0.16, 3, h.trim, { lw: 3 });
    },
  },
  cowl: {
    cover: 'full',
    color: '#3B2A55',
    back: (h, col) => {
      const { c, x, y, r } = h;
      poly(c, [x - r * 1.35, y + r * 1.1, x - r * 1.25, y - r * 0.5, x - r * 0.6, y - r * 1.2, x, y - r * 1.55, x + r * 0.6, y - r * 1.2, x + r * 1.25, y - r * 0.5, x + r * 1.35, y + r * 1.1], col, { cel: true, celOffset: 8 });
    },
    front: (h, col) => {
      hoodRim(h, col, 0.3);
      const { c, x, y, r } = h;
      for (const s of [-1, 1]) poly(c, [x + s * r * 0.75, y + r * 0.95, x + s * r * 1.45, y + r * 0.15, x + s * r * 1.35, y + r * 1.1], shade(col, -0.1), { lw: 3.5 });
      gemAt(c, x, y - r * 0.55, r * 0.12, '#B36BFF');
    },
  },
  beret_headset: {
    cover: 'top',
    color: '#7A2E2E',
    front: (h, col) => {
      const { c, x, y, r } = h;
      blob(c, [x - r * 1.05, y - r * 0.45, x - r * 0.6, y - r * 1.1, x + r * 0.4, y - r * 1.15, x + r * 1.2, y - r * 0.7, x + r * 0.95, y - r * 0.4], col, { cel: true });
      circle(c, x - r * 0.45, y - r * 0.7, r * 0.12, GOLD, { lw: 2.5 });
      stroke(c, [x - r * 1.02, y + r * 0.1, x - r * 1.05, y - r * 0.45], '#2A2A2A', 4);
      rrect(c, x - r * 1.16, y - r * 0.05, r * 0.26, r * 0.4, r * 0.1, '#2A2A2A', { lw: 3 });
      stroke(c, [x - r * 1.0, y + r * 0.3, x - r * 0.55, y + r * 0.55], '#2A2A2A', 3.5);
      circle(c, x - r * 0.5, y + r * 0.56, r * 0.07, '#4A4A4A', { lw: 2 });
    },
  },
  beret: {
    cover: 'top',
    color: '#4F5A2A',
    front: (h, col) => {
      const { c, x, y, r } = h;
      blob(c, [x - r * 1.05, y - r * 0.45, x - r * 0.7, y - r * 1.12, x + r * 0.4, y - r * 1.15, x + r * 1.25, y - r * 0.72, x + r * 0.95, y - r * 0.4], col, { cel: true });
      rrect(c, x - r * 1.0, y - r * 0.55, r * 2.0, r * 0.14, r * 0.07, shade(col, -0.25), { lw: 3 });
      star(c, x - r * 0.45, y - r * 0.75, r * 0.13, GOLD, { lw: 2 });
    },
  },
  great_helm: {
    cover: 'full',
    color: '#DDE6F0',
    front: (h, col) => {
      const { c, x, y, r } = h;
      // 투구 깃: 위로 솟지 않고 뒤(왼쪽)로 흘러 등급 별 줄과 겹치지 않는다 (검토 반영)
      blob(c, [x + r * 0.15, y - r * 1.02, x - r * 0.3, y - r * 1.27, x - r * 0.95, y - r * 1.2, x - r * 1.38, y - r * 0.82, x - r * 0.55, y - r * 0.92], h.trim === '#9AA0A6' ? '#3D8BFD' : h.trim, { lw: 3.5 });
      paint(c, P.rrect(x - r * 1.04, y - r * 1.08, r * 2.08, r * 1.95, r * 0.95), col, { cel: true });
      rrect(c, x - r * 0.7, y + r * 0.02, r * 1.4, r * 0.2, r * 0.08, '#1E1A26', { lw: 3 });
      glow(c, x - r * 0.3, y + r * 0.12, r * 0.15, '#9BE7FF', 0.8);
      glow(c, x + r * 0.3, y + r * 0.12, r * 0.15, '#9BE7FF', 0.8);
      stroke(c, [x, y - r * 1.0, x, y + r * 0.0], shade(col, -0.25), 3.5);
      for (let i = -1; i <= 1; i++) circle(c, x + i * r * 0.22, y + r * 0.5, r * 0.04, '#1E1A26', { lw: 0 });
      shine(c, x - r * 0.55, y - r * 0.6, r * 0.12, r * 0.28, 0.6);
    },
  },
  horn_helmet: {
    cover: 'top',
    color: '#7A6A5A',
    front: (h, col) => {
      const { c, x, y, r } = h;
      for (const s of [-1, 1]) blob(c, [x + s * r * 0.75, y - r * 0.55, x + s * r * 1.35, y - r * 0.9, x + s * r * 1.55, y - r * 1.65, x + s * r * 1.25, y - r * 1.0, x + s * r * 0.85, y - r * 0.85], '#F0E6D0', { lw: 4, cel: true, celOffset: 3 });
      paint(c, P.dome(x, y - r * 0.25, r * 1.05, 0.88), col, { cel: true });
      rrect(c, x - r * 1.06, y - r * 0.4, r * 2.12, r * 0.2, 4, shade(col, -0.25), { lw: 3.5 });
      rrect(c, x - r * 0.1, y - r * 0.38, r * 0.2, r * 0.6, 3, shade(col, -0.25), { lw: 3 });
      for (let i = -3; i <= 3; i++) circle(c, x + i * r * 0.28, y - r * 0.3, r * 0.04, '#E8DCC0', { lw: 0 });
    },
  },
  star_hat: {
    cover: 'top',
    color: '#24357A',
    front: (h, col) => {
      const { c, x, y, r } = h;
      brim(h, shade(col, -0.1), 1.35, 0.48, 0.2);
      blob(c, [x - r * 0.75, y - r * 0.5, x - r * 0.4, y - r * 1.25, x - r * 0.15, y - r * 1.62, x + r * 0.45, y - r * 1.68, x + r * 0.95, y - r * 1.4, x + r * 0.6, y - r * 1.45, x + r * 0.3, y - r * 1.2, x + r * 0.75, y - r * 0.5], col, { cel: true });
      for (const [sx, sy, sr] of [
        [-0.3, -0.85, 0.13],
        [0.25, -1.1, 0.1],
        [-0.05, -1.35, 0.08],
        [0.4, -0.7, 0.07],
      ] as const)
        star(c, x + sx * r, y + sy * r, r * sr, '#FFE27A', { lw: 1.5 });
      circle(c, x + r * 0.98, y - r * 1.38, r * 0.12, '#FFE27A', { lw: 2.5 });
    },
  },
  deep_hood: {
    cover: 'full',
    color: '#1A1424',
    back: (h, col) => hoodShape(h, col, 1.55, 1.35),
    front: (h, col) => {
      hoodRim(h, col, 0.05);
      const { c, x, y, r } = h;
      for (const s of [-1, 1]) blob(c, [x + s * r * 0.95, y - r * 0.1, x + s * r * 1.15, y + r * 0.7, x + s * r * 0.75, y + r * 1.0, x + s * r * 0.7, y + r * 0.2], col, { lw: 3.5 });
    },
  },
  laurel: {
    cover: 'none',
    color: GOLD,
    front: (h, col) => {
      const { c, x, y, r } = h;
      for (const s of [-1, 1]) {
        for (let i = 0; i < 5; i++) {
          const a = Math.PI + (s < 0 ? 0.15 + i * 0.22 : Math.PI - 0.15 - i * 0.22);
          const lx = x + Math.cos(a) * r * 0.98;
          const ly = y - r * 0.15 + Math.sin(a) * r * 0.75;
          ellipse(c, lx, ly, r * 0.2, r * 0.09, col, { lw: 2.5 }, a + (s * Math.PI) / 2);
        }
      }
    },
  },
  veil: {
    cover: 'full',
    color: '#FFFFFF',
    back: (h, col) => {
      const { c, x, y, r } = h;
      blob(c, [x, y - r * 1.25, x + r * 1.05, y - r * 0.8, x + r * 1.3, y + r * 0.5, x + r * 1.4, y + r * 1.5, x - r * 1.4, y + r * 1.5, x - r * 1.3, y + r * 0.5, x - r * 1.05, y - r * 0.8], col, { cel: true, celOffset: 7 });
    },
    front: (h, col) => {
      hoodRim(h, col, 0.35);
      const { c, x, y, r } = h;
      stroke(c, [x - r * 1.02, y - r * 0.32, x, y - r * 0.56, x + r * 1.02, y - r * 0.32], GOLD, r * 0.08);
      star(c, x, y - r * 0.58, r * 0.13, GOLD, { lw: 2 }, 4, 0.4);
    },
  },
  sun_crown: {
    cover: 'none',
    color: GOLD,
    front: (h, col) => {
      const { c, x, y, r } = h;
      for (let i = 0; i < 9; i++) {
        const a = Math.PI + 0.2 + (i / 8) * (Math.PI - 0.4);
        const bx = x + Math.cos(a) * r * 0.82;
        const by = y - r * 0.2 + Math.sin(a) * r * 0.82;
        poly(c, [bx + Math.cos(a + 1.57) * r * 0.1, by + Math.sin(a + 1.57) * r * 0.1, x + Math.cos(a) * r * 1.45, y - r * 0.2 + Math.sin(a) * r * 1.45, bx - Math.cos(a + 1.57) * r * 0.1, by - Math.sin(a + 1.57) * r * 0.1], i % 2 ? '#FFE27A' : col, { lw: 3 });
      }
      stroke(c, [x - r * 0.95, y - r * 0.4, x, y - r * 0.65, x + r * 0.95, y - r * 0.4], OUTLINE, r * 0.14);
      stroke(c, [x - r * 0.95, y - r * 0.4, x, y - r * 0.65, x + r * 0.95, y - r * 0.4], col, r * 0.08);
      circle(c, x, y - r * 0.68, r * 0.12, '#FF7A2F', { lw: 2.5 });
    },
  },
  wheat_crown: {
    cover: 'none',
    color: '#E8C24A',
    front: (h, col) => {
      const { c, x, y, r } = h;
      for (let i = -3; i <= 3; i++) {
        const bx = x + i * r * 0.28;
        const by = y - r * 0.62 + Math.abs(i) * r * 0.06;
        stroke(c, [bx, by, bx + i * r * 0.05, by - r * 0.5], '#B8862E', 3);
        for (let k = 0; k < 3; k++) ellipse(c, bx + i * r * 0.04, by - r * (0.25 + k * 0.13), r * 0.08, r * 0.06, col, { lw: 1.8 }, i * 0.1);
      }
      stroke(c, [x - r * 0.98, y - r * 0.45, x, y - r * 0.66, x + r * 0.98, y - r * 0.45], '#7ED957', r * 0.08);
    },
  },
  thorn_crown: {
    cover: 'none',
    color: '#3A2A3A',
    front: (h, col) => {
      const { c, x, y, r } = h;
      for (let i = 0; i < 9; i++) {
        const t = i / 8;
        const bx = x - r * 0.95 + t * r * 1.9;
        const by = y - r * 0.5 - Math.sin(t * Math.PI) * r * 0.2;
        poly(c, [bx - r * 0.08, by, bx + (i % 2 ? 1 : -1) * r * 0.12, by - r * (0.35 + (i % 3) * 0.08), bx + r * 0.08, by], col, { lw: 2.5 });
      }
      stroke(c, [x - r * 0.98, y - r * 0.45, x, y - r * 0.72, x + r * 0.98, y - r * 0.45], OUTLINE, r * 0.14);
      stroke(c, [x - r * 0.98, y - r * 0.45, x, y - r * 0.72, x + r * 0.98, y - r * 0.45], col, r * 0.08);
      gemAt(c, x, y - r * 0.72, r * 0.12, '#9B4DFF');
    },
  },
  crown: {
    cover: 'none',
    color: GOLD,
    front: (h, col) => {
      crownPoints(h, col, 3, 0.62);
      const { c, x, y, r } = h;
      gemAt(c, x, y - r * 0.55, r * 0.12, '#FF4D6D');
      circle(c, x - r * 0.45, y - r * 0.52, r * 0.07, '#6FE3FF', { lw: 2 });
      circle(c, x + r * 0.45, y - r * 0.52, r * 0.07, '#6FE3FF', { lw: 2 });
      for (const px of [-0.78, -0.26, 0.26, 0.78]) circle(c, x + px * r, y - r * 1.25, r * 0.06, '#FFFFFF', { lw: 1.5 });
    },
  },
  winged_helm: {
    cover: 'top',
    color: GOLD,
    front: (h, col) => {
      const { c, x, y, r } = h;
      for (const s of [-1, 1]) blob(c, [x + s * r * 0.85, y - r * 0.5, x + s * r * 1.6, y - r * 1.25, x + s * r * 1.45, y - r * 0.8, x + s * r * 1.7, y - r * 0.75, x + s * r * 1.35, y - r * 0.45, x + s * r * 1.05, y - r * 0.3], '#FFFFFF', { lw: 3.5 });
      paint(c, P.dome(x, y - r * 0.25, r * 1.05, 0.88), col, { cel: true });
      rrect(c, x - r * 1.06, y - r * 0.42, r * 2.12, r * 0.2, 4, '#1E1E2A', { lw: 3.5 });
      gemAt(c, x, y - r * 0.75, r * 0.13, '#3D8BFD');
    },
  },
  skull_crown: {
    cover: 'none',
    color: '#EDE6D6',
    front: (h, col) => {
      const { c, x, y, r } = h;
      rrect(c, x - r * 0.9, y - r * 0.72, r * 1.8, r * 0.2, 4, '#3A2A3A', { lw: 3.5 });
      for (let i = -2; i <= 2; i++) skullIcon(c, x + i * r * 0.38, y - r * 0.9 - (2 - Math.abs(i)) * r * 0.08, r * (0.17 + (i === 0 ? 0.05 : 0)), col);
    },
  },
  party_crown: {
    cover: 'none',
    color: GOLD,
    front: (h, col) => {
      const { c, x, y, r } = h;
      for (const [s, cc] of [
        [-1, '#FF4D6D'],
        [1, '#3D8BFD'],
      ] as const)
        blob(c, [x + s * r * 0.6, y - r * 0.6, x + s * r * 1.2, y - r * 0.45, x + s * r * 1.35, y + r * 0.2, x + s * r * 0.95, y - r * 0.25], cc, { lw: 3 });
      crownPoints(h, col, 3, 0.55);
      for (const [px, cc] of [
        [-0.78, '#FF4D6D'],
        [0, '#7ED957'],
        [0.78, '#3D8BFD'],
      ] as const)
        circle(c, x + px * r, y - r * 1.2, r * 0.1, cc, { lw: 2 });
    },
  },
  flame_crown: {
    cover: 'none',
    color: '#FF9A2F',
    front: (h, col) => {
      const { c, x, y, r } = h;
      for (let i = -2; i <= 2; i++) flame(c, x + i * r * 0.36, y - r * 0.85 + Math.abs(i) * r * 0.1, r * (0.28 - Math.abs(i) * 0.03), col, '#FFE27A');
      rrect(c, x - r * 0.9, y - r * 0.72, r * 1.8, r * 0.2, 4, GOLD, { lw: 3.5 });
      gemAt(c, x, y - r * 0.62, r * 0.1, '#FF4D2F');
    },
  },
  ice_crown: {
    cover: 'none',
    color: '#BFF0FF',
    front: (h, col) => {
      const { c, x, y, r } = h;
      for (let i = -3; i <= 3; i++) {
        const hgt = 0.5 + (3 - Math.abs(i)) * 0.14;
        poly(c, [x + i * r * 0.27 - r * 0.11, y - r * 0.66, x + i * r * 0.27, y - r * (0.66 + hgt), x + i * r * 0.27 + r * 0.11, y - r * 0.66], i % 2 ? '#E8FAFF' : col, { lw: 3 });
      }
      rrect(c, x - r * 0.95, y - r * 0.74, r * 1.9, r * 0.18, 4, '#7FC8E8', { lw: 3.5 });
      glow(c, x, y - r * 1.0, r * 0.6, '#BFF0FF', 0.35);
    },
  },
  lightning_crown: {
    cover: 'none',
    color: '#FFE14A',
    front: (h, col) => {
      const { c, x, y, r } = h;
      for (let i = -2; i <= 2; i++) bolt(c, x + i * r * 0.38, y - r * (1.25 - Math.abs(i) * 0.12), r * 0.55, col, 3.5, Math.PI / 2 + i * 0.12);
      rrect(c, x - r * 0.95, y - r * 0.74, r * 1.9, r * 0.18, 4, '#2E5AAC', { lw: 3.5 });
      glow(c, x, y - r * 1.0, r * 0.7, '#FFF27A', 0.3);
    },
  },
  dragon_helm: {
    cover: 'top',
    color: '#8E2A22',
    front: (h, col) => {
      const { c, x, y, r } = h;
      for (const s of [-1, 1]) blob(c, [x + s * r * 0.7, y - r * 0.7, x + s * r * 1.1, y - r * 1.4, x + s * r * 1.7, y - r * 1.6, x + s * r * 1.25, y - r * 1.2, x + s * r * 0.95, y - r * 0.55], '#2A1A1A', { lw: 4, cel: true, celOffset: 3 });
      paint(c, P.dome(x, y - r * 0.25, r * 1.06, 0.92), col, { cel: true });
      poly(c, [x - r * 0.25, y - r * 1.05, x, y - r * 1.45, x + r * 0.25, y - r * 1.05], '#2A1A1A', { lw: 3.5 });
      rrect(c, x - r * 1.06, y - r * 0.4, r * 2.12, r * 0.2, 4, GOLD, { lw: 3.5 });
      gemAt(c, x, y - r * 0.68, r * 0.12, '#FF7A2F');
    },
  },
  leaf_hood: {
    cover: 'full',
    color: '#2F7D4A',
    back: (h, col) => {
      hoodShape(h, col, 1.45, 1.3);
      const { c, x, y, r } = h;
      ellipse(c, x + r * 0.3, y - r * 1.45, r * 0.3, r * 0.14, '#7ED957', { lw: 3 }, -0.6);
    },
    front: (h, col) => {
      hoodRim(h, col, 0.22);
      const { c, x, y, r } = h;
      for (let i = 0; i < 5; i++) ellipse(c, x - r * 0.8 + i * r * 0.4, y - r * 0.32 - Math.sin((i / 4) * Math.PI) * r * 0.2, r * 0.18, r * 0.09, '#7ED957', { lw: 2 }, 0.3);
    },
  },
  clover_crown: {
    cover: 'none',
    color: '#4CC26A',
    front: (h, col) => {
      const { c, x, y, r } = h;
      stroke(c, [x - r * 0.98, y - r * 0.4, x, y - r * 0.7, x + r * 0.98, y - r * 0.4], '#3A8A3A', r * 0.1);
      for (let i = -2; i <= 2; i++) clover(c, x + i * r * 0.42, y - r * (0.62 + (2 - Math.abs(i)) * 0.05), r * 0.2, i % 2 ? '#FFE27A' : col);
    },
  },
  clock_crown: {
    cover: 'none',
    color: GOLD,
    front: (h, col) => {
      crownPoints(h, col, 2, 0.45);
      const { c, x, y, r } = h;
      circle(c, x, y - r * 0.95, r * 0.32, '#FFF8E6', { lw: 3.5, stroke: shade(col, -0.4) });
      stroke(c, [x, y - r * 0.95, x, y - r * 1.15], OUTLINE, 3);
      stroke(c, [x, y - r * 0.95, x + r * 0.14, y - r * 0.9], OUTLINE, 3);
    },
  },
};

/** 머리 장식 위 덧붙임 (각성: 보석·별·달·여러 보석·깃털) */
export function drawHeadDeco(h: HeadCtx, deco: HeadDeco, head: HeadgearId): void {
  const { c, x, y, r } = h;
  const tall = head === 'wizard_hat' || head === 'star_hat' || head === 'top_hat';
  const fy = y - r * (tall ? 0.75 : head === 'none' ? 0.9 : 0.62);
  switch (deco) {
    case 'gem':
      glow(c, x, fy, r * 0.45, '#FF6BD5', 0.5);
      gemAt(c, x, fy, r * 0.2, '#FF4D9A');
      break;
    case 'stars':
      for (const [sx, sy, sr] of [
        [-0.35, tall ? -1.0 : -0.95, 0.15],
        [0.3, tall ? -1.3 : -1.05, 0.12],
        [0, tall ? -0.65 : -1.2, 0.1],
      ] as const) {
        star(c, x + sx * r, y + sy * r, r * sr, '#FFE27A', { lw: 2 });
        sparkle(c, x + sx * r + r * 0.15, y + sy * r - r * 0.1, r * 0.06);
      }
      break;
    case 'moon':
      paint(
        c,
        (cc) => {
          cc.beginPath();
          cc.arc(x, y - r * 1.22, r * 0.2, Math.PI * 0.3, Math.PI * 1.7, false);
          cc.arc(x + r * 0.1, y - r * 1.24, r * 0.16, Math.PI * 1.6, Math.PI * 0.4, true);
          cc.closePath();
        },
        '#FFE27A',
        { lw: 2.5 },
      );
      break;
    case 'jewels':
      for (let i = -2; i <= 2; i++) gemAt(c, x + i * r * 0.35, fy - r * 0.05 + Math.abs(i) * r * 0.05, r * 0.11, ['#FF4D6D', '#6FE3FF', '#7ED957', '#6FE3FF', '#FF4D6D'][i + 2] as string);
      break;
    case 'feather':
      blob(c, [x + r * 0.4, fy, x + r * 0.8, fy - r * 0.9, x + r * 1.0, fy - r * 0.95, x + r * 0.65, fy - r * 0.1], '#FFFFFF', { lw: 2.5 });
      break;
    case 'none':
      break;
  }
}

/** 머리 장식 색 (데이터 headColor > 장식 기본색 > 종족 주 색) */
export function headgearColor(look: HumanLook): string {
  return look.headColor ?? HEADGEAR_DEFS[look.head].color ?? look.colors[0] ?? '#888888';
}

/** 머리 전체 (뒤 머리카락 → 귀 → 얼굴 원 → 표정 → 안경 → 앞머리 → 수염 → 장식). */
export function drawHead(h: HeadCtx): void {
  const { c, x, y, r, look } = h;
  const def = HEADGEAR_DEFS[look.head];
  const col = headgearColor(look);
  const covered = def.cover === 'full';
  if (!covered) drawHairBack(h, look.hairStyle, covered);
  else if (look.hairStyle === 'long' || look.hairStyle === 'flowing') drawHairBack(h, look.hairStyle, covered);
  def.back?.(h, col);
  if (!covered) drawEars(h, look.ears);
  else if (look.ears === 'elf' || look.ears === 'darkelf' || look.ears === 'goblin') drawEars(h, look.ears);
  const face = look.body === 'stone' ? shade(look.skin, 0.05) : look.skin;
  if (look.body === 'stone') {
    blob(c, [x - r * 0.95, y - r * 0.5, x - r * 0.6, y - r * 1.0, x + r * 0.5, y - r * 1.05, x + r * 1.0, y - r * 0.4, x + r * 0.95, y + r * 0.6, x + r * 0.3, y + r * 0.95, x - r * 0.5, y + r * 0.9, x - r * 1.0, y + r * 0.4], face, { cel: true, celOffset: 7 });
    for (const [mx, my] of [
      [-0.45, -0.6],
      [0.55, 0.45],
    ] as const)
      ellipse(c, x + mx * r, y + my * r, r * 0.22, r * 0.12, '#6FA35A', { lw: 0, alpha: 0.8 });
  } else if (look.body === 'spirit') {
    glow(c, x, y, r * 1.5, look.skin, 0.5);
    circle(c, x, y, r, face, { cel: true, celOffset: 6, stroke: shade(look.skin, -0.5) });
  } else {
    circle(c, x, y, r, face, { cel: true, celOffset: 6 });
  }
  if (look.body === 'stone') {
    // 룬 눈 (빛남)
    const ec = look.eyeColor ?? '#5CFF8A';
    for (const s of [-1, 1]) {
      glow(c, x + s * r * 0.36, y + r * 0.08, r * 0.35, ec, 0.7);
      rrect(c, x + s * r * 0.36 - r * 0.14, y, r * 0.28, r * 0.14, 3, ec, { lw: 2.5 });
    }
    stroke(c, [x - r * 0.2, y + r * 0.5, x + r * 0.2, y + r * 0.5], OUTLINE, 3.5);
  } else {
    drawFace(h, look.face);
  }
  const onForehead = look.eyewear === 'third_eye' || look.eyewear === 'goggles_up';
  if (!onForehead) drawEyewear(h, look.eyewear);
  drawHairFront(h, look.hairStyle, def.cover);
  if (look.eyewear === 'goggles_up') drawEyewear(h, look.eyewear);
  drawBeard(h, look.beard);
  def.front(h, col);
  // 제3의 눈은 두건·관 테두리보다 위에 (검토 반영: 운명의 예언자 두건 테두리가 눈을 가렸다)
  if (look.eyewear === 'third_eye') drawEyewear(h, look.eyewear);
  if (look.headDeco && look.headDeco !== 'none') drawHeadDeco(h, look.headDeco, look.head);
}
