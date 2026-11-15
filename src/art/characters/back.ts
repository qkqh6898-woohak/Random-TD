/**
 * 등 뒤 라이브러리 (35종, Canvas 2D): 날개·망토·후광·등에 멘 무기·뒤의 분신/병사.
 * 원점 = 등 회전 중심 (rig.backPivot: 어깨 사이). 날갯짓은 이 파츠를 가로로 늘였다 줄인다 (idle.ts).
 */
import { OUTLINE, P, blob, bolt, circle, clover, ellipse, flame, glow, line, note, paint, poly, rainbow, rgba, rotated, rrect, shade, skullIcon, snowflake, sparkle, star, stroke, type Ctx } from './cv';
import type { BackId } from './library';
import type { HumanLook } from './looks';
import type { BodySpec } from './rig';

export interface BackCtx {
  c: Ctx;
  look: HumanLook;
  spec: BodySpec;
  /** 머리 중심 (원점 기준) */
  headY: number;
  /** 발 (원점 기준 y) */
  footY: number;
  trim: string;
}

function capeShape(b: BackCtx, color: string, edge: string, flare = 1): void {
  const { c, spec } = b;
  const hw = spec.torsoHW + 4;
  const bot = Math.min(b.footY - 4, 100);
  paint(c, P.poly([-hw, -16, hw, -16, hw + 26 * flare, bot - 8, hw * 0.5, bot, 0, bot - 6, -hw * 0.5, bot, -hw - 26 * flare, bot - 8]), color, { cel: true, celOffset: 8 });
  stroke(c, [hw + 24 * flare, bot - 10, hw * 0.5, bot - 2, 0, bot - 8, -hw * 0.5, bot - 2, -hw - 24 * flare, bot - 10], edge, 5);
}

function wingPair(_b: BackCtx, draw: (s: 1 | -1) => void): void {
  draw(-1);
  draw(1);
}

function featherWing(c: Ctx, s: number, color: string, span = 110, lift = 0): void {
  const pts = [s * 8, -10, s * 40, -60 - lift, s * span, -78 - lift, s * (span + 14), -50 - lift, s * (span - 4), -20, s * (span - 20), 6, s * (span - 44), 22, s * 26, 18];
  blob(c, pts, color, { cel: true, celOffset: 5 });
  for (let i = 0; i < 4; i++) stroke(c, [s * (36 + i * 16), -40 - lift * 0.5 + i * 6, s * (60 + i * 16), 6 + i * 4], shade(color, -0.2), 3, 0.8);
}

function butterflyWing(c: Ctx, s: number, upper: string, lower: string, alpha = 0.85): void {
  c.save();
  c.globalAlpha *= alpha;
  blob(c, [s * 6, -6, s * 30, -70, s * 74, -84, s * 92, -54, s * 70, -14], upper, { cel: true, celOffset: 4 });
  blob(c, [s * 6, 0, s * 54, 4, s * 70, 34, s * 50, 56, s * 20, 34], lower, { cel: true, celOffset: 3 });
  c.restore();
  circle(c, s * 60, -48, 9, '#FFFFFF', { lw: 0, alpha: 0.7 });
  circle(c, s * 44, 26, 6, '#FFFFFF', { lw: 0, alpha: 0.6 });
}

function batWing(c: Ctx, s: number, color: string, membrane: string, span = 120): void {
  poly(c, [s * 6, -8, s * 50, -76, s * span, -70, s * (span - 12), -36, s * (span - 30), -46, s * (span - 40), -8, s * (span - 62), -24, s * (span - 74), 14, s * 30, 6], membrane, { cel: true, celOffset: 5 });
  line(c, [s * 6, -8, s * 50, -76, s * span, -70], color, 6);
  stroke(c, [s * 50, -76, s * (span - 30), -46], color, 3);
  stroke(c, [s * 50, -76, s * (span - 62), -24], color, 3);
}

function haloRing(b: BackCtx, r: number, color: string, w = 7): void {
  const { c, headY } = b;
  glow(c, 0, headY, r * 1.6, color, 0.5);
  c.save();
  c.strokeStyle = OUTLINE;
  c.lineWidth = w + 4;
  c.beginPath();
  c.ellipse(0, headY - b.spec.headR * 1.45, r, r * 0.3, 0, 0, Math.PI * 2);
  c.stroke();
  c.strokeStyle = color;
  c.lineWidth = w;
  c.beginPath();
  c.ellipse(0, headY - b.spec.headR * 1.45, r, r * 0.3, 0, 0, Math.PI * 2);
  c.stroke();
  c.restore();
}

function silhouette(c: Ctx, x: number, y: number, s: number, color: string, alpha: number): void {
  c.save();
  c.globalAlpha *= alpha;
  circle(c, x, y - 70 * s, 26 * s, color, { lw: 0 });
  paint(c, P.rrect(x - 22 * s, y - 48 * s, 44 * s, 52 * s, 14 * s), color, { lw: 0 });
  c.restore();
}

type BackDraw = (b: BackCtx) => void;

export const BACK_DRAW: Readonly<Record<BackId, BackDraw>> = {
  none: () => {},
  quiver: (b) => {
    rotated(b.c, 22, -10, 0.45, () => {
      for (const dx of [-6, 0, 6]) {
        line(b.c, [dx, -40, dx, -62], '#8B6A3E', 3, false);
        poly(b.c, [dx, -72, dx + 5, -60, dx - 5, -60], '#F3EAD3', { lw: 2 });
      }
      rrect(b.c, -12, -44, 24, 70, 8, '#7A4A2A', { lw: 4, cel: true, celOffset: 2 });
      stroke(b.c, [-12, -30, 12, -30], b.trim, 3);
    });
  },
  quiver_leaf: (b) => {
    rotated(b.c, 22, -10, 0.45, () => {
      for (const dx of [-6, 0, 6]) poly(b.c, [dx, -74, dx + 5, -60, dx - 5, -60], '#F3EAD3', { lw: 2 });
      blob(b.c, [0, -50, 16, -30, 12, 20, 0, 30, -12, 20, -16, -30], '#5DBB63', { cel: true, celOffset: 3 });
      stroke(b.c, [0, -44, 0, 24], '#2F7D4A', 2.5);
    });
  },
  quiver_smoke: (b) => {
    glow(b.c, 30, -60, 40, '#B36BFF', 0.6);
    rotated(b.c, 22, -10, 0.45, () => {
      rrect(b.c, -12, -44, 24, 70, 8, '#2A2133', { lw: 4 });
      for (const dx of [-6, 0, 6]) poly(b.c, [dx, -72, dx + 5, -58, dx - 5, -58], '#B36BFF', { lw: 2 });
    });
    for (let i = 0; i < 3; i++) circle(b.c, 30 + i * 8, -70 - i * 12, 8 - i, '#B36BFF', { lw: 0, alpha: 0.5 });
  },
  cape: (b) => capeShape(b, b.look.backColor ?? b.look.colors[0] ?? '#2E5AAC', b.trim),
  cape_emblem: (b) => {
    capeShape(b, b.look.backColor ?? '#1E1E2A', '#F1C40F', 1.1);
    const { c, spec } = b;
    circle(c, spec.torsoHW + 18, 50, 11, '#1E1E2A', { lw: 3, stroke: '#F1C40F' });
    star(c, spec.torsoHW + 18, 50, 6, '#F1C40F', { lw: 1 });
  },
  cape_cards: (b) => {
    capeShape(b, '#2A2133', '#F5C518', 1.1);
    const { c, spec } = b;
    for (const [x, y, col] of [
      [-spec.torsoHW - 10, 40, '#E53935'],
      [spec.torsoHW + 14, 30, '#FFFFFF'],
      [spec.torsoHW + 6, 70, '#E53935'],
    ] as const)
      rotated(c, x, y, 0.3, () => rrect(c, -8, -11, 16, 22, 3, col, { lw: 2.5 }));
  },
  cape_storm: (b) => {
    capeShape(b, '#283A5A', '#FFE14A', 1.2);
    bolt(b.c, -b.spec.torsoHW - 12, 10, 50, '#FFF27A', 3, Math.PI / 2 + 0.3);
    bolt(b.c, b.spec.torsoHW + 16, 20, 44, '#FFF27A', 3, Math.PI / 2 - 0.3);
  },
  cape_gold: (b) => {
    glow(b.c, 0, 20, 90, '#FFE27A', 0.4);
    capeShape(b, '#F5C518', '#FFFFFF', 1.2);
  },
  cape_stars: (b) => {
    capeShape(b, '#1A1240', '#9B4DFF', 1.3);
    for (let i = 0; i < 8; i++) sparkle(b.c, -60 + ((i * 41) % 120), 10 + ((i * 29) % 80), 4, '#FFFFFF');
  },
  wings_butterfly: (b) => wingPair(b, (s) => butterflyWing(b.c, s, s < 0 ? '#FFC2E2' : '#BDE7FF', s < 0 ? '#BDE7FF' : '#FFC2E2')),
  wings_note: (b) => {
    wingPair(b, (s) => butterflyWing(b.c, s, '#FFE27A', '#9BE7FF', 0.6));
    const cols = ['#FF5E5E', '#FFB547', '#6BE38A', '#5EC8FF', '#9B7BFF'];
    for (let i = 0; i < 5; i++) {
      note(b.c, -86 + i * 10, -70 + (i % 2) * 30, 9, cols[i] as string);
      note(b.c, 50 + i * 10, -76 + (i % 2) * 30, 9, cols[4 - i] as string);
    }
  },
  wings_ice: (b) =>
    wingPair(b, (s) => {
      glow(b.c, s * 60, -40, 60, '#BFF0FF', 0.5);
      for (const [a, len] of [
        [-0.9, 110],
        [-0.55, 96],
        [-0.2, 80],
        [0.15, 60],
      ] as const)
        rotated(b.c, s * 8, -10, s < 0 ? Math.PI - a : a, () => poly(b.c, [0, -8, len, -2, len + 14, 4, len, 10, 0, 8], '#D8F7FF', { lw: 3.5 }));
      snowflake(b.c, s * 80, -50, 9);
    }),
  wings_star: (b) =>
    wingPair(b, (s) => {
      blob(b.c, [s * 6, -10, s * 40, -74, s * 100, -86, s * 110, -40, s * 80, 10, s * 30, 16], '#1E2A6A', { cel: true, celOffset: 5 });
      const pts = [s * 30, -40, s * 60, -64, s * 90, -60, s * 76, -20, s * 46, -6];
      stroke(b.c, pts, '#BFD4FF', 2, 0.8);
      for (let i = 0; i < pts.length; i += 2) star(b.c, pts[i] as number, pts[i + 1] as number, 5, '#FFE27A', { lw: 1 });
    }),
  wings_clock: (b) =>
    wingPair(b, (s) => {
      for (let i = 0; i < 5; i++) {
        const a = -0.95 + i * 0.32;
        rotated(b.c, s * 6, -8, s < 0 ? Math.PI - a : a, () => {
          poly(b.c, [0, -5, 92 - i * 10, -3, 108 - i * 10, 0, 92 - i * 10, 3, 0, 5], '#F5C518', { lw: 3 });
          circle(b.c, 94 - i * 10, 0, 4, '#FFF8E6', { lw: 2 });
        });
      }
      circle(b.c, s * 30, -24, 14, '#FFF8E6', { lw: 3, stroke: '#C9A227' });
    }),
  wings_clover: (b) =>
    wingPair(b, (s) => {
      glow(b.c, s * 60, -40, 60, '#FFE27A', 0.5);
      clover(b.c, s * 52, -52, 40, '#F5C518');
      clover(b.c, s * 40, 10, 24, '#7ED957');
    }),
  wings_feather: (b) => wingPair(b, (s) => featherWing(b.c, s, '#FFFFFF', 112, 6)),
  wings_bat: (b) => wingPair(b, (s) => batWing(b.c, s, '#1E1A26', '#3A2E4A', 124)),
  wings_storm: (b) =>
    wingPair(b, (s) => {
      blob(b.c, [s * 6, -10, s * 40, -70, s * 90, -84, s * 120, -50, s * 104, -10, s * 70, 14, s * 30, 12], '#4A5A78', { cel: true, celOffset: 6 });
      bolt(b.c, s * 50, -60, 56, '#FFF27A', 3, Math.PI / 2 - s * 0.6);
    }),
  wings_void: (b) =>
    wingPair(b, (s) => {
      glow(b.c, s * 60, -40, 70, '#9B4DFF', 0.45);
      batWing(b.c, s, '#0E0A16', '#1A1030', 132);
      for (let i = 0; i < 6; i++) sparkle(b.c, s * (50 + ((i * 23) % 60)), -60 + ((i * 31) % 60), 4, '#FFFFFF');
    }),
  wings_blade: (b) =>
    wingPair(b, (s) => {
      for (let i = 0; i < 4; i++) {
        const a = -0.8 + i * 0.3;
        rotated(b.c, s * 8, -10, s < 0 ? Math.PI - a : a, () => poly(b.c, [0, -6, 100 - i * 12, -2, 116 - i * 12, 0, 100 - i * 12, 6, 0, 6], '#DDE6F0', { lw: 3 }));
      }
    }),
  greatsword: (b) => {
    rotated(b.c, -8, -20, -0.6, () => {
      poly(b.c, [-11, -10, -11, -150, 0, -170, 11, -150, 11, -10], '#B8C2CC', { lw: 4, cel: true, celOffset: 2 });
      rrect(b.c, -24, -12, 48, 10, 4, '#5A3A22', { lw: 3.5 });
      rrect(b.c, -5, -2, 10, 26, 3, '#3A2418', { lw: 3 });
    });
  },
  storm_cloud: (b) => {
    // 머리 위·양옆으로 넓게 퍼진 먹구름 + 양쪽 번개 (머리카락으로 보이지 않게 머리보다 훨씬 넓고 높게)
    const y = b.headY - 78;
    glow(b.c, 0, y + 20, 96, '#8FA8C8', 0.45);
    for (const s of [-1, 1]) {
      bolt(b.c, s * 104, y + 26, 70, '#FFF27A', 4, Math.PI / 2 - s * 0.25);
      blob(b.c, [s * 150, y + 34, s * 132, y - 6, s * 96, y - 4, s * 84, y + 30, s * 112, y + 46], '#6A7A94', { cel: true, celOffset: 4 });
    }
    blob(b.c, [-120, y + 18, -104, y - 22, -56, y - 46, 0, y - 56, 56, y - 46, 104, y - 22, 120, y + 18, 70, y + 34, 0, y + 26, -70, y + 34], '#7C8CA6', { cel: true, celOffset: 7 });
    for (const x of [-60, 0, 60]) sparkle(b.c, x, y - 10, 6, '#FFF27A', 0.9);
  },
  halo: (b) => haloRing(b, b.spec.headR * 0.85, '#FFE27A', 8),
  light_halo: (b) => {
    glow(b.c, 0, b.headY, b.spec.headR * 2.2, '#FFF3A8', 0.75);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      stroke(b.c, [Math.cos(a) * b.spec.headR * 1.2, b.headY + Math.sin(a) * b.spec.headR * 1.2, Math.cos(a) * b.spec.headR * 1.8, b.headY + Math.sin(a) * b.spec.headR * 1.8], '#FFE27A', 4, 0.8);
    }
  },
  eye_halo: (b) => {
    const r = b.spec.headR * 1.45;
    glow(b.c, 0, b.headY, r * 1.4, '#FFF3A8', 0.7);
    circle(b.c, 0, b.headY, r, null, { lw: 6, stroke: '#FFE27A' });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ellipse(b.c, Math.cos(a) * r, b.headY + Math.sin(a) * r, 9, 6, '#FFFFFF', { lw: 2.5 });
      circle(b.c, Math.cos(a) * r, b.headY + Math.sin(a) * r, 3, '#9B4DFF', { lw: 0 });
    }
  },
  clock_halo: (b) => {
    const r = b.spec.headR * 1.6;
    const y = b.headY - 6;
    glow(b.c, 0, y, r * 1.3, '#FFE27A', 0.45);
    circle(b.c, 0, y, r, rgba('#FFF8E6', 0.92), { lw: 6, stroke: '#C9A227' });
    circle(b.c, 0, y, r * 0.86, null, { lw: 2, stroke: '#C9A227' });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      rrect(b.c, Math.cos(a) * r * 0.75 - 3, y + Math.sin(a) * r * 0.75 - 6, 6, 12, 2, '#3B2416', { lw: 0 });
    }
    line(b.c, [0, y, r * 0.55, y - r * 0.55], '#3B2416', 4, false);
    line(b.c, [0, y, -r * 0.2, y - r * 0.75], '#3B2416', 5, false);
  },
  ring_device: (b) => {
    const y = b.headY + 30;
    glow(b.c, 0, y, 120, '#5EE0FF', 0.35);
    for (const [rx, ry, rot, col] of [
      [118, 34, 0.25, '#5EE0FF'],
      [104, 30, -0.35, '#C9A6FF'],
    ] as const) {
      b.c.save();
      b.c.translate(0, y);
      b.c.rotate(rot);
      ellipse(b.c, 0, 0, rx, ry, null, { lw: 9, stroke: OUTLINE });
      ellipse(b.c, 0, 0, rx, ry, null, { lw: 5, stroke: col });
      for (let i = 0; i < 4; i++) rrect(b.c, Math.cos((i / 4) * Math.PI * 2) * rx - 5, Math.sin((i / 4) * Math.PI * 2) * ry - 5, 10, 10, 2, '#DDE6F0', { lw: 2 });
      b.c.restore();
    }
  },
  floating_blades: (b) => {
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.42;
      const bx = Math.cos(a) * 96;
      const by = b.headY + 30 + Math.sin(a) * 96;
      rotated(b.c, bx, by, a + Math.PI / 2, () => {
        glow(b.c, 0, -30, 26, '#FFE27A', 0.4);
        poly(b.c, [-6, 0, -6, -56, 0, -68, 6, -56, 6, 0], '#FFE27A', { lw: 3 });
        rrect(b.c, -12, 0, 24, 6, 2, '#1E1E2A', { lw: 2.5 });
        rrect(b.c, -3, 6, 6, 12, 2, '#1E1E2A', { lw: 2 });
      });
    }
  },
  ghost_soldiers: (b) => {
    for (const [x, s] of [
      [-92, 0.85],
      [92, 0.85],
      [-54, 0.7],
      [58, 0.7],
    ] as const) {
      silhouette(b.c, x, b.footY - 6, s, '#9FE8FF', 0.45);
      b.c.save();
      b.c.globalAlpha *= 0.55;
      line(b.c, [x + 22 * s, b.footY - 10, x + 22 * s, b.footY - 120 * s], '#DDE6F0', 4, false);
      poly(b.c, [x + 22 * s, b.footY - 132 * s, x + 28 * s, b.footY - 118 * s, x + 16 * s, b.footY - 118 * s], '#DDE6F0', { lw: 0 });
      b.c.restore();
    }
  },
  shadow_clones: (b) => {
    for (const x of [-84, 84]) {
      silhouette(b.c, x, b.footY - 4, 1.05, '#2A1A3A', 0.6);
      glow(b.c, x - 8, b.footY - 76, 8, '#FF3B5C', 0.9);
      glow(b.c, x + 8, b.footY - 76, 8, '#FF3B5C', 0.9);
    }
  },
  dragons: (b) =>
    wingPair(b, (s) => {
      // 양쪽 어깨 뒤로 목을 세운 다 자란 용 두 마리 (몸은 뒤, 머리는 바깥을 보며 위로)
      const x = s * 92;
      const y = b.headY + 50;
      batWing(b.c, s, '#7A2416', '#B8442A', 64);
      // 목과 몸
      blob(b.c, [x - s * 26, y + 70, x - s * 30, y + 20, x - s * 14, y - 18, x + s * 2, y - 46, x + s * 18, y - 40, x + s * 8, y - 10, x + s * 12, y + 30, x + s * 18, y + 70], '#E8642E', { cel: true, celOffset: 5 });
      // 배 비늘
      for (let i = 0; i < 4; i++) ellipse(b.c, x - s * 6, y + 2 + i * 16, 9, 5, '#FFD08A', { lw: 1.5 });
      // 머리 (바깥쪽을 봄)
      blob(b.c, [x - s * 8, y - 40, x - s * 4, y - 64, x + s * 18, y - 72, x + s * 44, y - 62, x + s * 46, y - 48, x + s * 20, y - 40], '#E8642E', { cel: true, celOffset: 3 });
      for (const dx of [0, 14]) poly(b.c, [x + s * dx, y - 66, x + s * (dx - 10), y - 90, x + s * (dx + 8), y - 70], '#F3EAD3', { lw: 2.5 });
      circle(b.c, x + s * 22, y - 58, 4.5, '#FFE27A', { lw: 2 });
      circle(b.c, x + s * 23, y - 58, 2, OUTLINE, { lw: 0 });
      stroke(b.c, [x + s * 30, y - 46, x + s * 44, y - 50], OUTLINE, 2.5);
      flame(b.c, x + s * 56, y - 54, 8, '#FF9A2F', '#FFE27A');
    }),
  meteors: (b) => {
    for (const [x, y, r] of [
      [-96, b.headY - 10, 14],
      [100, b.headY + 20, 12],
      [-70, b.headY + 90, 10],
    ] as const) {
      glow(b.c, x, y, r * 2.4, '#FF8A2F', 0.6);
      for (let i = 1; i <= 3; i++) circle(b.c, x - i * 9, y - i * 7, r * (1 - i * 0.22), '#FFB13B', { lw: 0, alpha: 0.5 });
      blob(b.c, [x - r, y, x - r * 0.4, y - r, x + r * 0.7, y - r * 0.8, x + r, y + r * 0.2, x + r * 0.2, y + r], '#7A4A3A', { lw: 3 });
    }
  },
  cathedral_halo: (b) => {
    wingPair(b, (s) => featherWing(b.c, s, '#FFFDF0', 120, 10));
    const r = b.spec.headR * 1.5;
    glow(b.c, 0, b.headY, r * 1.5, '#FFF3A8', 0.7);
    circle(b.c, 0, b.headY, r, null, { lw: 7, stroke: '#F5C518' });
    for (let i = 0; i < 6; i++) {
      const a = Math.PI + (i / 5) * Math.PI;
      rrect(b.c, Math.cos(a) * r - 4, b.headY + Math.sin(a) * r - 14, 8, 22, 3, '#FFF3A8', { lw: 2 });
    }
  },
  gold_wings: (b) => wingPair(b, (s) => featherWing(b.c, s, '#F5C518', 108, 4)),
};

/** back 파츠 (원점 = 등 회전 중심) */
export function drawBackPart(c: Ctx, look: HumanLook, spec: BodySpec, pivotY: number, trim: string): void {
  const back = look.back ?? 'none';
  BACK_DRAW[back]({ c, look, spec, headY: spec.headY - pivotY, footY: spec.footY - pivotY, trim });
  void rainbow;
  void skullIcon;
}
