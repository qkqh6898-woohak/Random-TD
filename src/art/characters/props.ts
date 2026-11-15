/**
 * 주 소품 라이브러리 (76종, Canvas 2D). 원점 = 오른손 (prop 파츠 회전 중심), 캐릭터는 오른쪽(+x)을 본다.
 * 색은 look.propColor(각성 금빛 등)로 바꿀 수 있고, look.propGlow가 있으면 핵심 부분에 빛을 더한다.
 */
import { OUTLINE, P, blob, bolt, circle, clover, coin, ellipse, flame, glow, line, paint, poly, rainbow, rotated, rrect, shade, shine, skullIcon, sparkle, star, stroke, type Ctx } from './cv';
import type { PropId } from './library';
import type { HumanLook } from './looks';
import { PROP_META } from './propMeta';

export interface PropCtx {
  c: Ctx;
  look: HumanLook;
  /** 등급 색 */
  trim: string;
  /** 소품 주 재질 색 (propColor가 있으면 그것) */
  col: (fallback: string) => string;
  /** propGlow가 있을 때만 빛 */
  glow: (x: number, y: number, r: number) => void;
}

const STEEL = '#C9D3DE';
const WOOD = '#8B5A2B';
const GOLD = '#F5C518';

function shaft(c: Ctx, x0: number, y0: number, x1: number, y1: number, color = WOOD, w = 9): void {
  line(c, [x0, y0, x1, y1], color, w);
}

function blade(c: Ctx, len: number, w: number, color: string, tip = 0.22): void {
  // 위로 뻗은 칼날 (원점 = 칼날 뿌리)
  poly(c, [-w / 2, 0, -w / 2, -len * (1 - tip), 0, -len, w / 2, -len * (1 - tip), w / 2, 0], color, { lw: 4, cel: true, celOffset: 2 });
  stroke(c, [0, -6, 0, -len * 0.85], shade(color, 0.45), 2, 0.8);
}

function bowArc(c: Ctx, x: number, y: number, r: number, color: string, w = 8, span = 1.15): void {
  c.save();
  c.lineCap = 'round';
  c.strokeStyle = OUTLINE;
  c.lineWidth = w + 5;
  c.beginPath();
  c.arc(x, y, r, -span, span);
  c.stroke();
  c.strokeStyle = color;
  c.lineWidth = w;
  c.beginPath();
  c.arc(x, y, r, -span, span);
  c.stroke();
  c.restore();
  const tx = x + Math.cos(span) * r;
  const ty = Math.sin(span) * r;
  stroke(c, [tx, y - ty, tx, y + ty], '#F5F0E0', 2.5);
}

function orb(c: Ctx, x: number, y: number, r: number, color: string, inner = '#FFFFFF'): void {
  glow(c, x, y, r * 2, color, 0.55);
  circle(c, x, y, r, color, { lw: 4, cel: true, celOffset: r * 0.25 });
  circle(c, x - r * 0.15, y + r * 0.1, r * 0.45, inner, { lw: 0, alpha: 0.35 });
  shine(c, x - r * 0.4, y - r * 0.4, r * 0.3, r * 0.17, 0.85);
}

function staffTop(p: PropCtx, len: number, top: () => void, color = WOOD): void {
  shaft(p.c, 0, 42, 0, -len, color, 9);
  top();
}

function flag(c: Ctx, x: number, y: number, w: number, h: number, color: string, trim: string): void {
  paint(
    c,
    (cc) => {
      cc.beginPath();
      cc.moveTo(x, y);
      cc.quadraticCurveTo(x + w * 0.5, y - 10, x + w, y + 6);
      cc.lineTo(x + w * 0.82, y + h * 0.55);
      cc.lineTo(x + w, y + h);
      cc.quadraticCurveTo(x + w * 0.5, y + h - 12, x, y + h);
      cc.closePath();
    },
    color,
    { cel: true, celOffset: 4 },
  );
  stroke(c, [x + 3, y + h - 4, x + w * 0.5, y + h - 14, x + w - 6, y + h - 4], trim, 4);
}

function die(c: Ctx, x: number, y: number, s: number, color: string, pips: number, rot = 0.3): void {
  rotated(c, x, y, rot, () => {
    rrect(c, -s / 2, -s / 2, s, s, s * 0.22, color, { lw: 3, cel: true, celOffset: 2 });
    const dot = (dx: number, dy: number): void => circle(c, dx * s * 0.25, dy * s * 0.25, s * 0.09, color === GOLD ? '#7A3A00' : '#C0392B', { lw: 0 });
    if (pips === 1) dot(0, 0);
    if (pips >= 2) {
      dot(-1, -1);
      dot(1, 1);
    }
    if (pips === 3 || pips === 5) dot(0, 0);
    if (pips >= 4) {
      dot(1, -1);
      dot(-1, 1);
    }
    if (pips === 6) {
      dot(-1, 0);
      dot(1, 0);
    }
  });
}

function bomb(c: Ctx, x: number, y: number, r: number, color: string): void {
  circle(c, x, y, r, color, { lw: 3.5, cel: true, celOffset: 3 });
  rrect(c, x - r * 0.3, y - r - 4, r * 0.6, 6, 2, '#5A5A5A', { lw: 2.5 });
  stroke(c, [x, y - r - 4, x + 4, y - r - 12], '#8B6A3E', 2.5);
  glow(c, x + 5, y - r - 13, 9, '#FFB13B', 0.9);
  sparkle(c, x + 5, y - r - 13, 6, '#FFF3A8');
  shine(c, x - r * 0.35, y - r * 0.35, r * 0.25, r * 0.15, 0.7);
}

type PropDraw = (p: PropCtx) => void;

export const PROP_DRAW: Readonly<Record<PropId, PropDraw>> = {
  none: () => {},
  prayer: () => {},
  meditate: () => {},
  pickaxe: (p) => {
    const { c } = p;
    shaft(c, -10, 30, 16, -96);
    p.glow(14, -100, 40);
    paint(
      c,
      (cc) => {
        cc.beginPath();
        cc.moveTo(-40, -86);
        cc.quadraticCurveTo(14, -128, 66, -82);
        cc.quadraticCurveTo(16, -108, -40, -86);
        cc.closePath();
      },
      p.col(STEEL),
      { lw: 4.5, cel: true, celOffset: 2 },
    );
    rrect(c, 4, -110, 20, 22, 4, '#6B4226', { lw: 3.5 });
  },
  drumsticks: (p) => {
    const { c } = p;
    p.glow(28, -46, 24);
    line(c, [-4, 6, 28, -40], p.col('#F3EAD3'), 7);
    circle(c, 30, -44, 9, p.col('#F3EAD3'), { lw: 3.5 });
    line(c, [-14, 10, -36, -30], p.col('#F3EAD3'), 6);
    circle(c, -38, -33, 8, p.col('#F3EAD3'), { lw: 3.5 });
  },
  dagger: (p) => {
    const { c } = p;
    rotated(c, 0, -6, 0.35, () => {
      p.glow(0, -30, 24);
      blade(c, 48, 13, p.col(STEEL));
      rrect(c, -14, -2, 28, 7, 3, GOLD, { lw: 3 });
      rrect(c, -4, 4, 8, 16, 3, '#6B4226', { lw: 3 });
    });
  },
  twin_daggers: (p) => {
    const { c } = p;
    for (const a of [0.55, -0.5]) {
      rotated(c, a > 0 ? 4 : -4, -4, a, () => {
        p.glow(0, -30, 22);
        blade(c, 46, 12, p.col(STEEL));
        rrect(c, -12, -2, 24, 6, 3, '#6B4226', { lw: 3 });
      });
    }
  },
  longbow: (p) => {
    const { c } = p;
    p.glow(18, -40, 34);
    bowArc(c, -30, -10, 72, p.col('#A0703A'), 8, 1.2);
    line(c, [-8, -10, 74, -10], '#C9A86A', 3.5, true);
    poly(c, [74, -16, 88, -10, 74, -4], STEEL, { lw: 2.5 });
    poly(c, [-8, -10, -16, -16, -18, -10, -16, -4], '#7ED957', { lw: 2 });
  },
  wand: (p) => {
    const { c } = p;
    shaft(c, -6, 12, 18, -44, '#6B4226', 7);
    glow(c, 20, -50, 26, '#FFF3A8', 0.7);
    star(c, 20, -50, 11, '#FFE27A', { lw: 3 });
  },
  crystal_staff: (p) => {
    const { c } = p;
    staffTop(p, 118, () => {
      glow(c, 0, -134, 40, '#9BE7FF', 0.7);
      poly(c, [0, -162, 14, -134, 0, -112, -14, -134], '#9BE7FF', { lw: 3.5 });
      shine(c, -4, -142, 3, 8, 0.8);
      for (const s of [-1, 1]) stroke(c, [s * 10, -112, s * 16, -126], GOLD, 4);
    });
  },
  short_sword: (p) => {
    const { c } = p;
    rotated(c, 0, -6, 0.3, () => {
      p.glow(0, -45, 34);
      blade(c, 76, 15, p.col(STEEL));
      rrect(c, -18, -3, 36, 8, 3, GOLD, { lw: 3 });
      rrect(c, -4, 5, 8, 14, 3, '#6B4226', { lw: 3 });
      circle(c, 0, 21, 5, GOLD, { lw: 2.5 });
    });
  },
  longsword: (p) => {
    const { c } = p;
    rotated(c, 0, -6, 0.25, () => {
      glow(c, 0, -60, 46, '#DDE6F0', 0.5);
      blade(c, 108, 17, p.col('#E8EEF5'));
      poly(c, [-24, 0, 24, 0, 18, -8, -18, -8], GOLD, { lw: 3 });
      rrect(c, -4, 4, 8, 18, 3, '#2E5AAC', { lw: 3 });
      circle(c, 0, 24, 6, GOLD, { lw: 2.5 });
    });
  },
  spear: (p) => {
    const { c } = p;
    shaft(c, 0, 66, 0, -112, '#9B6B3A', 8);
    p.glow(0, -128, 30);
    poly(c, [0, -150, 10, -122, 0, -110, -10, -122], p.col(STEEL), { lw: 4, cel: true, celOffset: 2 });
    rrect(c, -6, -112, 12, 8, 2, p.trim, { lw: 2.5 });
  },
  spear_banner: (p) => {
    const { c } = p;
    shaft(c, 0, 66, 0, -112, '#9B6B3A', 8);
    flag(c, 2, -110, 46, 34, '#2E5AAC', GOLD);
    circle(c, 22, -94, 7, GOLD, { lw: 2 });
    glow(c, 0, -130, 30, '#DDE6F0', 0.6);
    poly(c, [0, -152, 11, -122, 0, -110, -11, -122], '#E8EEF5', { lw: 4 });
  },
  boulder: (p) => {
    const { c } = p;
    blob(c, [-30, -10, -26, -50, 0, -64, 30, -54, 36, -20, 12, 0, -14, 2], p.col('#8E8A80'), { cel: true, celOffset: 6 });
    stroke(c, [-8, -50, 0, -34, -10, -22], '#5E5A52', 3);
    ellipse(c, 16, -48, 9, 5, '#6FA35A', { lw: 0, alpha: 0.85 });
  },
  shuriken: (p) => {
    const { c } = p;
    line(c, [0, 0, 4, -20], p.look.skin, 7);
    glow(c, 4, -36, 26, p.look.propGlow ?? '#C9A6F0', p.look.propGlow ? 0.8 : 0.3);
    paint(c, P.star(4, -36, 20, 4, 0.32), p.col('#8E96A6'), { lw: 3.5, cel: true, celOffset: 2 });
    circle(c, 4, -36, 4, OUTLINE, { lw: 0 });
  },
  radio: (p) => {
    const { c } = p;
    rrect(c, -8, -34, 22, 40, 5, '#3A3A3A', { lw: 4, cel: true, celOffset: 2 });
    stroke(c, [9, -34, 9, -56], '#2A2A2A', 4);
    rrect(c, -4, -28, 14, 10, 2, '#7ED957', { lw: 2 });
    for (let i = 0; i < 3; i++) stroke(c, [-3, -12 + i * 5, 9, -12 + i * 5], '#1E1E1E', 2);
  },
  money_bag: (p) => {
    const { c } = p;
    blob(c, [-6, 2, -26, 22, -22, 48, 0, 56, 24, 48, 28, 22, 8, 2], p.col('#C9A86A'), { cel: true, celOffset: 5 });
    rrect(c, -10, -2, 20, 8, 3, '#7A4A2A', { lw: 3 });
    circle(c, 1, 30, 11, GOLD, { lw: 3 });
    stroke(c, [1, 22, 1, 38], '#7A3A00', 3);
    coin(c, -18, 6, 6);
    coin(c, 20, 8, 5);
  },
  scales: (p) => {
    const { c } = p;
    const g = p.col(GOLD);
    line(c, [0, 10, 0, -70], g, 7);
    line(c, [-36, -64, 36, -64], g, 6);
    circle(c, 0, -74, 6, g, { lw: 3 });
    for (const s of [-1, 1]) {
      stroke(c, [s * 36, -64, s * 26, -36], OUTLINE, 2);
      stroke(c, [s * 36, -64, s * 46, -36], OUTLINE, 2);
      paint(c, (cc) => {
        cc.beginPath();
        cc.ellipse(s * 36, -36, 14, 6, 0, 0, Math.PI);
        cc.closePath();
      }, g, { lw: 3 });
    }
    coin(c, -36, -42, 5);
    poly(c, [36, -48, 42, -40, 36, -36, 30, -40], '#FF4D9A', { lw: 2 });
  },
  mud_totem: (p) => {
    const { c } = p;
    staffTop(p, 96, () => {
      p.glow(0, -112, 40);
      blob(c, [-22, -100, -18, -126, 0, -134, 20, -126, 24, -100, 10, -90, -10, -90], '#8B6A3E', { cel: true, celOffset: 4 });
      for (const s of [-1, 1]) circle(c, s * 8, -114, 4, p.look.propGlow ? '#FFE27A' : '#2A1A10', { lw: 0 });
      stroke(c, [-8, -100, 0, -96, 8, -100], '#2A1A10', 3);
      for (const s of [-1, 1]) blob(c, [s * 18, -110, s * 34, -124, s * 30, -104], '#E85A3A', { lw: 2.5 });
    });
  },
  lute: (p) => {
    const { c } = p;
    const body = p.look.propColor === 'rainbow' ? rainbow(c, -60, 0, 0, 30) : (p.look.propColor ?? '#C9803A');
    rotated(c, -10, 0, -0.75, () => {
      line(c, [0, -10, 0, -84], '#6B4226', 9);
      rrect(c, -9, -96, 18, 16, 4, '#5A3A22', { lw: 3 });
      paint(c, P.blob([0, -14, 26, 2, 30, 30, 0, 46, -30, 30, -26, 2]), body, { cel: true, celOffset: 4 });
      circle(c, 0, 16, 7, '#3A2216', { lw: 2.5 });
      for (const dx of [-3, 0, 3]) stroke(c, [dx, -84, dx, 30], '#F5F0E0', 1.2);
    });
  },
  tablet: (p) => {
    const { c } = p;
    rotated(c, 6, -14, -0.15, () => {
      rrect(c, -18, -26, 36, 48, 6, '#2F3338', { lw: 4 });
      rrect(c, -13, -21, 26, 38, 3, '#5EE0FF', { lw: 0 });
      for (let i = 0; i < 3; i++) stroke(c, [-9, -15 + i * 9, 6 - i * 4, -15 + i * 9], '#FFFFFF', 2.5, 0.8);
      circle(c, 6, 8, 4, '#FF5A4E', { lw: 0 });
    });
  },
  sat_tablet: (p) => {
    const { c } = p;
    rotated(c, 6, -14, -0.15, () => {
      rrect(c, -20, -28, 40, 52, 6, '#2F3338', { lw: 4 });
      rrect(c, -15, -23, 30, 42, 3, '#123A4A', { lw: 0 });
      circle(c, 0, -2, 12, null, { lw: 2, stroke: '#5EE0FF' });
      stroke(c, [-12, -2, 12, -2], '#5EE0FF', 1.5);
      stroke(c, [0, -14, 0, 10], '#5EE0FF', 1.5);
    });
    glow(c, 14, -70, 26, '#5EE0FF', 0.6);
    paint(c, (cc) => {
      cc.beginPath();
      cc.ellipse(14, -70, 16, 8, -0.5, 0, Math.PI);
    }, 'rgba(94,224,255,0.6)', { lw: 2.5 });
    stroke(c, [14, -70, 24, -84], '#5EE0FF', 2.5);
  },
  fireball: (p) => {
    const { c } = p;
    glow(c, 2, -30, 40, '#FF8A2F', 0.75);
    flame(c, 2, -26, 17, '#FF6A1F', '#FFE27A');
    circle(c, 2, -24, 8, '#FFF7C9', { lw: 0 });
  },
  cleaver: (p) => {
    const { c } = p;
    rotated(c, 0, -4, 0.12, () => {
      p.glow(4, -80, 52);
      paint(c, P.poly([-16, -8, -18, -132, 6, -150, 26, -128, 22, -8]), p.col('#B8C2CC'), { cel: true, celOffset: 4 });
      stroke(c, [-12, -120, -12, -14], shade(p.col('#B8C2CC'), 0.4), 3);
      circle(c, 8, -118, 5, OUTLINE, { lw: 0 });
      rrect(c, -24, -10, 50, 10, 4, '#6B4226', { lw: 3.5 });
      rrect(c, -5, 0, 10, 20, 3, '#5A3A22', { lw: 3 });
    });
  },
  machine_gun: (p) => {
    const { c } = p;
    rrect(c, -28, -16, 70, 22, 5, '#3A3F44', { lw: 4, cel: true, celOffset: 2 });
    rrect(c, 40, -11, 52, 9, 3, '#2A2E33', { lw: 3.5 });
    rrect(c, -10, 6, 22, 16, 3, '#5E6B33', { lw: 3 });
    poly(c, [-28, -12, -48, -6, -48, 6, -28, 4], '#5A3A22', { lw: 3 });
    stroke(c, [70, -2, 62, 22], '#2A2E33', 3);
    stroke(c, [74, -2, 82, 22], '#2A2E33', 3);
    rrect(c, 6, -24, 20, 9, 2, '#2A2E33', { lw: 2.5 });
  },
  minigun: (p) => {
    const { c } = p;
    glow(c, 50, -8, 34, '#FF9A2F', 0.35);
    rrect(c, -30, -22, 56, 32, 8, '#4A5058', { lw: 4, cel: true, celOffset: 3 });
    for (let i = 0; i < 3; i++) rrect(c, 22, -18 + i * 9, 54, 7, 3, '#2A2E33', { lw: 2.5 });
    rrect(c, 70, -22, 10, 32, 3, '#3A3F44', { lw: 3 });
    rrect(c, -18, 10, 30, 18, 4, '#5E6B33', { lw: 3 });
    stroke(c, [-4, 28, -20, 44], '#D9A93A', 4);
  },
  bombs: (p) => {
    const col = p.col('#2A2A30');
    bomb(p.c, -24, -34, 13, col);
    bomb(p.c, 6, -66, 13, col);
    bomb(p.c, 30, -32, 13, col);
  },
  leaf_bow: (p) => {
    const { c } = p;
    p.glow(0, -10, 50);
    bowArc(c, -30, -10, 70, '#4C9A4A', 8, 1.15);
    for (let i = -3; i <= 3; i++) {
      const a = i * 0.32;
      ellipse(c, -30 + Math.cos(a) * 72, -10 + Math.sin(a) * 72, 10, 5, '#7ED957', { lw: 2 }, a + 0.6);
    }
    for (let i = 0; i < 2; i++) {
      c.save();
      c.translate(-30, -10);
      paint(c, (cc) => {
        cc.beginPath();
        cc.arc(0, 0, 90 + i * 14, -0.6 - i * 0.2, 0.5 + i * 0.2);
      }, null, { lw: 3.5, stroke: i ? '#FFFFFF' : '#BFE9FF' });
      c.restore();
    }
  },
  ice_staff: (p) => {
    const { c } = p;
    staffTop(p, 112, () => {
      glow(c, 0, -132, 46, '#BFF0FF', 0.75);
      for (const [dx, h, a] of [
        [0, 38, 0],
        [-12, 24, -0.4],
        [12, 26, 0.4],
      ] as const)
        rotated(c, dx * 0.4, -116, a, () => poly(c, [-7, 0, 0, -h, 7, 0], '#CFF6FF', { lw: 3 }));
    }, '#9CC9E0');
  },
  dice: (p) => {
    const col = p.col('#FFFFFF');
    glow(p.c, 6, -44, 34, col === GOLD ? '#FFE27A' : '#C9A6F0', 0.6);
    die(p.c, -6, -34, 22, col, 5, 0.3);
    die(p.c, 20, -58, 20, col, 3, -0.4);
  },
  hammer: (p) => {
    const { c } = p;
    rotated(c, 0, 0, 0.25, () => {
      shaft(c, 0, 24, 0, -66, '#6B4226', 9);
      p.glow(0, -80, 40);
      paint(c, P.rrect(-30, -94, 60, 30, 6), p.col('#7A808A'), { cel: true, celOffset: 3 });
      rrect(c, -34, -96, 10, 34, 3, shade(p.col('#7A808A'), -0.2), { lw: 3 });
      rrect(c, 24, -96, 10, 34, 3, shade(p.col('#7A808A'), -0.2), { lw: 3 });
      if (p.look.propGlow) stroke(c, [-12, -80, -2, -86, 8, -76, 16, -82], p.look.propGlow, 3);
    });
  },
  carved_staff: (p) => {
    const { c } = p;
    staffTop(p, 104, () => {
      rrect(c, -12, -128, 24, 30, 8, '#A0703A', { lw: 3.5 });
      for (const s of [-1, 1]) circle(c, s * 5, -116, 3, OUTLINE, { lw: 0 });
      stroke(c, [-5, -106, 5, -106], OUTLINE, 2.5);
      for (const [a, col] of [
        [-0.5, '#E85A3A'],
        [0, '#F5C518'],
        [0.5, '#3D8BFD'],
      ] as const)
        rotated(c, 0, -128, a, () => blob(c, [-5, 0, 0, -32, 5, 0], col, { lw: 2.5 }));
    }, '#8B5A2B');
  },
  skull_staff: (p) => {
    const { c } = p;
    staffTop(p, 100, () => {
      glow(c, 0, -118, 34, '#7ED957', 0.6);
      skullIcon(c, 0, -120, 17);
      for (const s of [-1, 1]) circle(c, s * 6, -119, 2.5, '#7ED957', { lw: 0 });
      for (const [a, col] of [
        [-0.6, '#E85A3A'],
        [0.6, '#F5C518'],
      ] as const)
        rotated(c, 0, -134, a, () => blob(c, [-5, 0, 0, -28, 5, 0], col, { lw: 2.5 }));
    }, '#5A3A22');
  },
  crystal_ball: (p) => {
    const { c } = p;
    const col = p.col('#B8A6FF');
    paint(c, P.poly([-16, -4, 16, -4, 10, 8, -10, 8]), '#C9A227', { lw: 3.5 });
    orb(c, 0, -26, 22, col, '#FFFFFF');
    for (const [x, y] of [
      [-6, -32],
      [7, -22],
      [2, -38],
    ] as const)
      sparkle(c, x, y, 4, '#FFFFFF');
  },
  ledger: (p) => {
    const { c } = p;
    const cov = p.col('#7A3E1D');
    rotated(c, -10, -16, -0.1, () => {
      rrect(c, -34, -20, 68, 40, 4, cov, { lw: 4 });
      rrect(c, -30, -18, 29, 34, 2, '#FFF8E6', { lw: 2.5 });
      rrect(c, 1, -18, 29, 34, 2, '#FFF8E6', { lw: 2.5 });
      for (let i = 0; i < 4; i++) {
        stroke(c, [-26, -10 + i * 7, -6, -10 + i * 7], '#9A8A70', 1.6);
        stroke(c, [5, -10 + i * 7, 24, -10 + i * 7], '#9A8A70', 1.6);
      }
      if (cov === GOLD) glow(c, 0, 0, 40, '#FFE27A', 0.5);
    });
    line(c, [10, -2, 34, -44], '#FFFFFF', 4);
    blob(c, [30, -40, 44, -62, 38, -38], '#FFFFFF', { lw: 2 });
  },
  sniper_rifle: (p) => {
    const { c } = p;
    rrect(c, -40, -8, 64, 14, 4, '#56663A', { lw: 4 });
    rrect(c, 20, -5, 96, 7, 3, '#2A2E33', { lw: 3.5 });
    poly(c, [-40, -6, -58, 2, -56, 12, -38, 6], '#56663A', { lw: 3 });
    rrect(c, -14, -24, 40, 11, 5, '#2A2E33', { lw: 3 });
    circle(c, 28, -18, 5, '#7FD3E8', { lw: 2 });
    stroke(c, [-4, 6, -10, 20], '#2A2E33', 3);
  },
  railgun: (p) => {
    const { c } = p;
    glow(c, 70, -2, 40, '#5EE0FF', 0.55);
    rrect(c, -40, -12, 70, 20, 5, '#DDE6F0', { lw: 4, cel: true, celOffset: 2 });
    rrect(c, 24, -9, 96, 13, 4, '#3A4A5A', { lw: 3.5 });
    for (let i = 0; i < 4; i++) rrect(c, 34 + i * 20, -12, 8, 19, 2, '#5EE0FF', { lw: 2 });
    poly(c, [-40, -8, -58, 2, -56, 12, -38, 6], '#DDE6F0', { lw: 3 });
    rrect(c, -14, -28, 40, 11, 5, '#2A2E33', { lw: 3 });
  },
  twin_axes: (p) => {
    const { c } = p;
    for (const s of [1, -1]) {
      rotated(c, 0, 0, s * 0.45, () => {
        shaft(c, 0, 16, 0, -62, '#6B4226', 8);
        p.glow(0, -60, 30);
        blob(c, [2, -76, 30, -84, 36, -60, 30, -40, 2, -50], p.col('#B8C2CC'), { lw: 4, cel: true, celOffset: 2 });
        if (p.look.propGlow) flame(c, 26, -72, 8, '#FF7A2F', '#FFE27A');
      });
    }
  },
  spark_orb: (p) => {
    const { c } = p;
    glow(c, 0, -32, 40, '#FFF27A', 0.7);
    circle(c, 0, -32, 13, '#FFFDE0', { lw: 3, stroke: '#E0B81A' });
    for (let i = 0; i < 5; i++) bolt(c, 0, -32, 26, '#FFF27A', 2.5, (i / 5) * Math.PI * 2 + 0.3);
  },
  venom_arrow: (p) => {
    const { c } = p;
    rotated(c, 0, 0, 0.2, () => {
      line(c, [0, 26, 0, -64], '#8B6A3E', 5);
      glow(c, 0, -74, 22, '#B36BFF', 0.8);
      poly(c, [0, -86, 8, -66, -8, -66], '#B36BFF', { lw: 3 });
      for (const s of [-1, 1]) poly(c, [0, 18, s * 9, 30, 0, 26], '#7ED957', { lw: 2 });
    });
    for (let i = 0; i < 3; i++) blob(c, [12 + i * 3, -54 + i * 14, 16 + i * 3, -46 + i * 14, 12 + i * 3, -42 + i * 14, 8 + i * 3, -46 + i * 14], '#B36BFF', { lw: 1.5 });
    rrect(c, -36, 4, 16, 22, 5, 'rgba(126,217,87,0.7)', { lw: 3 });
    rrect(c, -32, -2, 8, 7, 2, '#8B6A3E', { lw: 2 });
  },
  viper_bow: (p) => {
    const { c } = p;
    glow(c, -10, -10, 60, '#B36BFF', 0.45);
    bowArc(c, -30, -10, 72, '#4A8A3A', 9, 1.2);
    ellipse(c, -30 + Math.cos(-1.2) * 72, -10 + Math.sin(-1.2) * 72 - 6, 11, 8, '#4A8A3A', { lw: 3 });
    circle(c, -30 + Math.cos(-1.2) * 72 + 3, -10 + Math.sin(-1.2) * 72 - 8, 2.5, '#FF3B5C', { lw: 0 });
    line(c, [-8, -10, 70, -10], '#C9A86A', 3.5);
    poly(c, [70, -17, 86, -10, 70, -3], '#B36BFF', { lw: 2.5 });
  },
  rune_staff: (p) => {
    const { c } = p;
    staffTop(p, 108, () => {
      glow(c, 0, -126, 40, '#B36BFF', 0.6);
      circle(c, 0, -126, 18, null, { lw: 4, stroke: '#D9A6FF' });
      paint(c, P.star(0, -126, 18, 5, 0.38), null, { lw: 2.5, stroke: '#E8C9FF' });
      poly(c, [0, -140, 7, -126, 0, -112, -7, -126], '#B36BFF', { lw: 2.5 });
    }, '#3B2A55');
  },
  thick_book: (p) => {
    const { c } = p;
    const cov = p.col('#C0392B');
    p.glow(-6, -32, 48);
    rotated(c, -8, -30, -0.12, () => {
      rrect(c, -40, -26, 80, 48, 6, cov, { lw: 4 });
      rrect(c, -36, -24, 34, 40, 3, '#FFF8E6', { lw: 2.5 });
      rrect(c, 2, -24, 34, 40, 3, '#FFF8E6', { lw: 2.5 });
      rrect(c, -36, 16, 72, 8, 2, '#E8DCC0', { lw: 2.5 });
      for (let i = 0; i < 4; i++) {
        stroke(c, [-31, -16 + i * 8, -8, -16 + i * 8], '#9A8A70', 1.6);
        stroke(c, [7, -16 + i * 8, 30, -16 + i * 8], '#9A8A70', 1.6);
      }
    });
  },
  pocket_watch: (p) => {
    const { c } = p;
    stroke(c, [0, 0, 6, 14, 10, 20], GOLD, 2.5);
    circle(c, 12, 32, 15, GOLD, { lw: 3.5, cel: true, celOffset: 2 });
    circle(c, 12, 32, 11, '#FFF8E6', { lw: 2 });
    stroke(c, [12, 32, 12, 24], OUTLINE, 2.5);
    stroke(c, [12, 32, 18, 34], OUTLINE, 2.5);
    circle(c, 12, 15, 3.5, GOLD, { lw: 2 });
  },
  flask: (p) => {
    const { c } = p;
    const liq = p.col('#7ED957');
    glow(c, 2, -26, 34, p.look.propGlow ?? liq, 0.55);
    paint(c, P.blob([-4, -46, 4, -46, 5, -32, 20, -18, 16, 2, -14, 2, -18, -18, -5, -32]), 'rgba(230,248,255,0.75)', { lw: 4 });
    paint(c, P.blob([-15, -12, 17, -12, 15, 0, -13, 0]), liq, { lw: 0 });
    rrect(c, -6, -54, 12, 9, 3, '#8B6A3E', { lw: 3 });
    for (const [x, y, r] of [
      [0, -52, 3],
      [6, -62, 4],
      [-2, -72, 3],
    ] as const)
      circle(c, x, y, r, liq, { lw: 1.5 });
  },
  tower_shield: (p) => {
    const { c } = p;
    p.glow(6, -24, 70);
    paint(c, P.poly([-24, -82, 36, -82, 40, -70, 40, 18, 6, 44, -28, 18, -28, -70]), p.col('#2E5AAC'), { cel: true, celOffset: 6 });
    stroke(c, [-24, -82, 36, -82], STEEL, 6);
    stroke(c, [6, -74, 6, 34], STEEL, 7);
    stroke(c, [-22, -30, 34, -30], STEEL, 7);
    circle(c, 6, -30, 10, GOLD, { lw: 3 });
    stroke(c, [-26, -72, -26, 16, 6, 40, 38, 16, 38, -72], p.trim, 3.5);
  },
  skull: (p) => {
    const { c } = p;
    glow(c, 2, -24, 36, '#7ED957', 0.55);
    skullIcon(c, 2, -26, 17);
    for (const s of [-1, 1]) circle(c, 2 + s * 6, -25, 2.5, '#7ED957', { lw: 0 });
    flame(c, 2, -50, 8, '#7ED957', '#E8FFD0');
  },
  scythe: (p) => {
    const { c } = p;
    shaft(c, 0, 62, 0, -132, '#3A2A2A', 8);
    p.glow(-40, -132, 50);
    paint(c, (cc) => {
      cc.beginPath();
      cc.moveTo(4, -136);
      cc.quadraticCurveTo(-40, -168, -96, -128);
      cc.quadraticCurveTo(-44, -146, 2, -120);
      cc.closePath();
    }, p.col('#C9D3DE'), { lw: 4, cel: true, celOffset: 2 });
    rrect(c, -6, -138, 12, 14, 3, '#7ED957', { lw: 2.5 });
  },
  binoculars: (p) => {
    const { c } = p;
    for (const dx of [-10, 10]) {
      rrect(c, dx - 8, -40, 16, 30, 5, '#3A3F44', { lw: 3.5 });
      circle(c, dx, -42, 7, '#7FD3E8', { lw: 3 });
    }
    rrect(c, -4, -30, 8, 10, 2, '#2A2E33', { lw: 2.5 });
  },
  katana: (p) => {
    const { c } = p;
    p.glow(-40, 30, 50);
    line(c, [-4, -4, -78, 64], p.col('#2A2A30'), 10);
    stroke(c, [-20, 10, -60, 46], p.trim, 3);
    rrect(c, -9, -12, 18, 7, 3, GOLD, { lw: 3 });
    line(c, [0, -10, 12, -38], '#F3EAD3', 7);
    for (let i = 0; i < 3; i++) stroke(c, [3 + i * 3.5, -16 - i * 7, 8 + i * 3.5, -18 - i * 7], '#2A2A30', 2);
  },
  arrows: (p) => {
    const { c } = p;
    for (const a of [-0.32, -0.1, 0.12, 0.34]) {
      rotated(c, 0, 0, a, () => {
        line(c, [0, 20, 0, -70], '#8B6A3E', 4);
        p.glow(0, -76, 16);
        poly(c, [0, -84, 6, -70, -6, -70], STEEL, { lw: 2.5 });
        for (const s of [-1, 1]) poly(c, [0, 12, s * 7, 22, 0, 20], '#BFD9E0', { lw: 1.8 });
      });
    }
  },
  dragon_staff: (p) => {
    const { c } = p;
    staffTop(p, 100, () => {
      blob(c, [-6, -100, -14, -124, 0, -140, 22, -136, 30, -124, 14, -118, 6, -104], '#FF8A5B', { cel: true, celOffset: 3 });
      poly(c, [0, -138, -8, -152, 6, -140], '#F3EAD3', { lw: 2.5 });
      circle(c, 12, -128, 3, '#FFE27A', { lw: 0 });
      glow(c, 32, -124, 16, '#FFB13B', 0.8);
    }, '#8B5A2B');
  },
  war_banner: (p) => {
    const { c } = p;
    shaft(c, 0, 50, 0, -186, '#5A3A22', 9);
    p.glow(42, -150, 60);
    flag(c, 2, -182, 80, 64, p.col('#B23A2E'), p.trim);
    skullIcon(c, 40, -152, 12, '#F3EAD3');
    for (const s of [-1, 1]) poly(c, [40 + s * 6, -136, 40 + s * 12, -126, 40 + s * 4, -136], '#FFF6E0', { lw: 2 });
    poly(c, [-8, -186, 0, -204, 8, -186], STEEL, { lw: 3 });
  },
  spellbook: (p) => {
    const { c } = p;
    glow(c, -6, -40, 50, '#FFE27A', 0.55);
    rotated(c, -6, -40, -0.15, () => {
      paint(c, (cc) => {
        cc.beginPath();
        cc.moveTo(0, -16);
        cc.quadraticCurveTo(-20, -24, -40, -18);
        cc.lineTo(-40, 18);
        cc.quadraticCurveTo(-20, 12, 0, 20);
        cc.quadraticCurveTo(20, 12, 40, 18);
        cc.lineTo(40, -18);
        cc.quadraticCurveTo(20, -24, 0, -16);
        cc.closePath();
      }, '#FFF8E6', { lw: 4 });
      stroke(c, [0, -16, 0, 20], '#C9A86A', 3);
      for (let i = 0; i < 3; i++) {
        stroke(c, [-32, -8 + i * 8, -8, -8 + i * 8], '#7A5CFF', 2);
        stroke(c, [8, -8 + i * 8, 32, -8 + i * 8], '#7A5CFF', 2);
      }
    });
    for (const [x, y] of [
      [-30, -78],
      [10, -86],
      [26, -68],
    ] as const)
      sparkle(c, x, y, 6, '#FFE27A');
  },
  twin_blades: (p) => {
    const { c } = p;
    glow(c, 0, -20, 50, '#B36BFF', 0.4);
    for (const s of [1, -1]) {
      rotated(c, 0, 0, s * 0.6 + Math.PI * (s > 0 ? 0 : 0), () => {
        paint(c, (cc) => {
          cc.beginPath();
          cc.moveTo(-5, 0);
          cc.quadraticCurveTo(-14, -40, 4, -74);
          cc.quadraticCurveTo(4, -40, 6, 0);
          cc.closePath();
        }, '#3A2A55', { lw: 4 });
        stroke(c, [-2, -8, -4, -50], '#D9A6FF', 2);
        rrect(c, -9, 0, 18, 6, 2, '#5B3A8C', { lw: 2.5 });
      });
    }
  },
  clover: (p) => {
    const { c } = p;
    line(c, [0, 0, 6, -30], '#3A8A3A', 5);
    glow(c, 8, -46, 36, '#FFE27A', 0.6);
    clover(c, 8, -46, 22, p.col('#4CC26A'));
    sparkle(c, 30, -64, 6, '#FFE27A');
  },
  giant_spear: (p) => {
    const { c } = p;
    shaft(c, 0, 72, 0, -176, '#E8E0C8', 9);
    glow(c, 0, -200, 40, p.look.propGlow ?? '#FFFFFF', p.look.propGlow ? 0.8 : 0.3);
    poly(c, [0, -226, 16, -190, 6, -172, -6, -172, -16, -190], p.col('#E8EEF5'), { lw: 4, cel: true, celOffset: 2 });
    for (const s of [-1, 1]) poly(c, [s * 6, -176, s * 22, -184, s * 12, -168], GOLD, { lw: 2.5 });
    rrect(c, -7, -172, 14, 12, 3, GOLD, { lw: 3 });
  },
  storm_staff: (p) => {
    const { c } = p;
    staffTop(p, 104, () => {
      glow(c, 0, -128, 44, '#BFE9FF', 0.6);
      blob(c, [-30, -118, -24, -138, -6, -146, 14, -142, 30, -126, 18, -112, -18, -112], '#5A6A80', { cel: true, celOffset: 4 });
      bolt(c, 0, -114, 30, '#FFF27A', 3, Math.PI / 2);
    }, '#34495E');
  },
  fan: (p) => {
    const { c } = p;
    rotated(c, 6, -6, -0.5, () => {
      paint(c, (cc) => {
        cc.beginPath();
        cc.moveTo(0, 0);
        cc.arc(0, 0, 48, -Math.PI * 0.85, -Math.PI * 0.15);
        cc.closePath();
      }, p.col('#2F7D4A'), { lw: 4, cel: true, celOffset: 3 });
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI * 0.85 + (i / 5) * Math.PI * 0.7;
        stroke(c, [0, 0, Math.cos(a) * 46, Math.sin(a) * 46], GOLD, 2.5);
      }
      circle(c, 0, -32, 9, GOLD, { lw: 2.5 });
    });
  },
  portal: (p) => {
    const { c } = p;
    glow(c, 16, -28, 46, '#7A5CFF', 0.65);
    circle(c, 16, -28, 26, '#2A1A5A', { lw: 4, stroke: '#5EE0FF' });
    for (let i = 0; i < 3; i++) {
      c.save();
      c.translate(16, -28);
      paint(c, (cc) => {
        cc.beginPath();
        cc.arc(0, 0, 8 + i * 6, i * 2, i * 2 + Math.PI * 1.3);
      }, null, { lw: 3, stroke: i % 2 ? '#5EE0FF' : '#C9A6FF' });
      c.restore();
    }
    sparkle(c, 16, -28, 6, '#FFFFFF');
  },
  fate_wheel: (p) => {
    const { c } = p;
    glow(c, 0, 0, 56, p.look.propGlow ?? '#FFFFFF', 0.55);
    c.save();
    c.lineWidth = 9;
    c.strokeStyle = OUTLINE;
    c.beginPath();
    c.arc(0, 0, 38, 0, Math.PI * 2);
    c.stroke();
    c.lineWidth = 6;
    c.strokeStyle = rainbow(c, -38, -38, 38, 38);
    c.beginPath();
    c.arc(0, 0, 38, 0, Math.PI * 2);
    c.stroke();
    c.restore();
    circle(c, 0, 0, 32, 'rgba(255,248,230,0.85)', { lw: 0 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      stroke(c, [0, 0, Math.cos(a) * 32, Math.sin(a) * 32], '#C9A227', 3);
      star(c, Math.cos(a + 0.4) * 22, Math.sin(a + 0.4) * 22, 4, ['#FF5E5E', '#FFB547', '#6BE38A', '#5EC8FF'][i % 4] as string, { lw: 1 });
    }
    circle(c, 0, 0, 9, GOLD, { lw: 3 });
  },
  horn_of_plenty: (p) => {
    const { c } = p;
    paint(c, (cc) => {
      cc.beginPath();
      cc.moveTo(-26, 10);
      cc.quadraticCurveTo(-10, -20, 28, -34);
      cc.quadraticCurveTo(44, -16, 34, 2);
      cc.quadraticCurveTo(0, -2, -26, 10);
      cc.closePath();
    }, '#D9A441', { lw: 4, cel: true, celOffset: 3 });
    for (let i = 0; i < 4; i++) stroke(c, [-10 + i * 10, -8 - i * 6, -4 + i * 10, 4 - i * 4], '#B8862E', 2.5);
    circle(c, 36, -30, 9, '#E53935', { lw: 2.5 });
    circle(c, 44, -16, 8, '#7ED957', { lw: 2.5 });
    ellipse(c, 30, -44, 6, 9, '#9B59D0', { lw: 2.5 });
    coin(c, 48, -36, 6);
  },
  dark_orb: (p) => {
    const { c } = p;
    glow(c, 0, -32, 46, '#9B4DFF', 0.7);
    circle(c, 0, -32, 19, '#1A0E2A', { lw: 4, stroke: '#B36BFF' });
    for (let i = 0; i < 3; i++) {
      c.save();
      c.translate(0, -32);
      paint(c, (cc) => {
        cc.beginPath();
        cc.arc(0, 0, 6 + i * 4, i, i + Math.PI);
      }, null, { lw: 2.5, stroke: '#D9A6FF' });
      c.restore();
    }
  },
  element_orbs: (p) => {
    const { c } = p;
    glow(c, 0, -34, 50, '#FFFFFF', 0.3);
    flame(c, -22, -26, 10, '#FF6A1F', '#FFE27A');
    glow(c, 22, -30, 18, '#BFF0FF', 0.7);
    poly(c, [22, -46, 32, -30, 22, -16, 12, -30], '#CFF6FF', { lw: 3 });
    blob(c, [-6, -64, 8, -68, 12, -54, 2, -48, -8, -52], '#8B5A3A', { lw: 3 });
    flame(c, -14, -58, 5, '#FF9A2F', '#FFE27A');
  },
  juggle_mix: (p) => {
    const { c } = p;
    rotated(c, -26, -40, 0.6, () => {
      line(c, [0, 14, 0, -14], WOOD, 5);
      poly(c, [-14, -14, 0, -22, 14, -14, 0, -18], STEEL, { lw: 2.5 });
    });
    coin(c, 4, -70, 11);
    paint(c, P.blob([28, -50, 34, -50, 36, -40, 44, -32, 40, -22, 22, -22, 18, -32, 26, -40]), 'rgba(126,217,87,0.85)', { lw: 3 });
  },
  star_bow: (p) => {
    const { c } = p;
    glow(c, -20, -10, 70, '#FFE27A', 0.4);
    bowArc(c, -30, -10, 74, GOLD, 8, 1.2);
    star(c, -30 + Math.cos(-1.2) * 74, -10 + Math.sin(-1.2) * 74, 11, '#FFFFFF', { lw: 2.5 });
    star(c, -30 + Math.cos(1.2) * 74, -10 + Math.sin(1.2) * 74, 9, '#FFFFFF', { lw: 2.5 });
    line(c, [-8, -10, 72, -10], '#FFF3A8', 3.5);
    star(c, 78, -10, 8, '#FFE27A', { lw: 2 });
  },
  legion_banner: (p) => {
    const { c } = p;
    shaft(c, 0, 50, 0, -186, '#1E1E2A', 9);
    flag(c, 2, -182, 80, 66, '#1E1E2A', '#F1C40F');
    circle(c, 40, -150, 15, '#1E1E2A', { lw: 3, stroke: '#F1C40F' });
    star(c, 40, -150, 9, '#F1C40F', { lw: 1.5 });
    poly(c, [-9, -186, 0, -206, 9, -186], '#F1C40F', { lw: 3 });
  },
  gold_sword: (p) => {
    const { c } = p;
    rotated(c, 0, -6, 0.25, () => {
      glow(c, 0, -60, 50, '#FFE27A', 0.55);
      blade(c, 104, 17, '#FFE27A');
      poly(c, [-26, 0, 26, 0, 20, -9, -20, -9], '#1E1E2A', { lw: 3 });
      rrect(c, -4, 4, 8, 18, 3, '#1E1E2A', { lw: 3 });
      circle(c, 0, 24, 6, '#F1C40F', { lw: 2.5 });
    });
  },
  clock_staff: (p) => {
    const { c } = p;
    staffTop(p, 104, () => {
      glow(c, 0, -128, 40, '#FFE27A', 0.5);
      circle(c, 0, -128, 22, '#FFF8E6', { lw: 4, stroke: '#C9A227' });
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        circle(c, Math.cos(a) * 17, -128 + Math.sin(a) * 17, 1.6, OUTLINE, { lw: 0 });
      }
      stroke(c, [0, -128, 0, -142], OUTLINE, 3);
      stroke(c, [0, -128, 10, -122], OUTLINE, 3);
    }, '#1E1E2A');
  },
  goblin_scepter: (p) => {
    const { c } = p;
    staffTop(p, 90, () => {
      circle(c, 0, -104, 18, GOLD, { lw: 4, cel: true, celOffset: 3 });
      for (const s of [-1, 1]) poly(c, [s * 14, -110, s * 30, -118, s * 16, -100], GOLD, { lw: 3 });
      for (const s of [-1, 1]) circle(c, s * 6, -106, 3, '#7ED957', { lw: 0 });
      stroke(c, [-7, -96, 0, -92, 7, -96], OUTLINE, 2.5);
      gemAt(c, 0, -126, 7, '#FF4D6D');
    }, '#F1C40F');
  },
  gold_cannon: (p) => {
    const { c } = p;
    glow(c, 46, -40, 30, '#FFE27A', 0.5);
    rotated(c, 0, 20, -0.75, () => {
      paint(c, P.rrect(-22, -16, 76, 30, 12), '#F1C40F', { cel: true, celOffset: 3 });
      rrect(c, 46, -20, 14, 38, 5, '#D4A017', { lw: 3.5 });
      for (let i = 0; i < 3; i++) stroke(c, [0 + i * 14, -14, 0 + i * 14, 12], '#B8862E', 3);
    });
    circle(c, -2, 36, 18, '#5A3A22', { lw: 4 });
    circle(c, -2, 36, 6, '#F1C40F', { lw: 2.5 });
    coin(c, 58, -78, 7);
  },
  dice_orb: (p) => {
    const { c } = p;
    orb(c, 4, -30, 20, '#9B8CFF');
    die(c, -26, -50, 14, '#FFFFFF', 6, 0.4);
    die(c, 32, -54, 14, '#F5C518', 1, -0.3);
  },
  chain_lightning: (p) => {
    const { c } = p;
    glow(c, 30, -30, 54, '#FFF27A', 0.55);
    bolt(c, 0, -4, 70, '#FFF27A', 4, -0.6);
    bolt(c, 40, -46, 46, '#FFFFFF', 3, -1.4);
    bolt(c, 6, -10, 54, '#BFE9FF', 3, -1.9);
    circle(c, 0, -2, 10, '#FFFDE0', { lw: 0, alpha: 0.9 });
  },
  baton: (p) => {
    const { c } = p;
    rotated(c, 0, 0, 0.5, () => {
      line(c, [0, 14, 0, -44], '#1E1E2A', 7);
      circle(c, 0, -48, 6, '#F1C40F', { lw: 2.5 });
      circle(c, 0, 16, 5, '#F1C40F', { lw: 2.5 });
    });
  },
};

function gemAt(c: Ctx, x: number, y: number, s: number, col: string): void {
  poly(c, [x, y - s, x + s * 0.8, y, x, y + s, x - s * 0.8, y], col, { lw: 2.5 });
  shine(c, x - s * 0.2, y - s * 0.3, s * 0.25, s * 0.15, 0.9);
}

/** prop 파츠 (원점 = 오른손). 쥐는 소품이면 손을 위에 덮어 그린다. */
export function drawPropPart(c: Ctx, look: HumanLook, trim: string, handColor: string, handRad: number): void {
  const prop = look.prop ?? 'none';
  const p: PropCtx = {
    c,
    look,
    trim,
    col: (fallback) => (look.propColor && look.propColor !== 'rainbow' ? look.propColor : fallback),
    glow: (x, y, r) => {
      if (look.propGlow) glow(c, x, y, r, look.propGlow, 0.75);
    },
  };
  PROP_DRAW[prop](p);
  if (PROP_META[prop].grip) circle(c, 0, 0, handRad, handColor, { lw: 4, cel: true, celOffset: 2 });
}
