/**
 * 녹스 군단 적 32종 그림 (Canvas 2D, 128 단위 정사각형 — 기존 art/mobs.ts와 같은 좌표라 MobSprite 위치 계산이 그대로다).
 *
 * 계급 표현 (ART.md 1.5): 하수인 = 이마의 군단 색 녹스 문양 · 대장 = 은색 뿔 + 군단 깃발 + 은은한 군단 색 오라
 * · 4천왕 = 금색 왕관형 장식 + 강한 오라 + 바닥 문양 · 군주 = 높은 보라 가시 왕관 + 별빛 + 보라 테 별빛 망토 + 밝은 테의 어둠 오라 + 4천왕보다 큰 이중 바닥 문양.
 * 금관은 4천왕만 쓴다 (대장 킹 슬라임은 젤리 왕관).
 * 모든 적은 보라 눈(녹투르만 붉은 눈)과 뾰족한 실루엣 → 연합의 고블린·돌 골렘(초록·금빛 눈, 둥근 실루엣)과 한눈에 구별된다.
 */
import { OUTLINE, P, blob, circle, ellipse, flame, glow, line, paint, poly, rrect, shade, shine, skullIcon, sparkle, stroke, type Ctx } from './cv';
import type { CreatureId, RankId } from './library';
import type { EnemyLook } from './looks';

export const NOX_EYE = '#B36BFF';
export const RED_EYE = '#FF3B5C';

interface Anchor {
  /** 머리 중심·반지름 (뿔·왕관·문양 자리) */
  hx: number;
  hy: number;
  hr: number;
}

interface EnemyCtx {
  c: Ctx;
  body: string;
  accent: string;
  legion: string;
  eye: string;
}

function eyes(e: EnemyCtx, cx: number, cy: number, gap: number, r: number, angry = true): void {
  const { c } = e;
  for (const s of [-1, 1]) {
    circle(c, cx + s * gap, cy, r, '#FFFFFF', { lw: Math.max(1.5, r * 0.25) });
    glow(c, cx + s * gap, cy, r * 1.4, e.eye, 0.35);
    circle(c, cx + s * gap + r * 0.15, cy + r * 0.12, r * 0.62, e.eye, { lw: 0 });
    circle(c, cx + s * gap + r * 0.35, cy - r * 0.2, r * 0.22, '#FFFFFF', { lw: 0 });
    if (angry) stroke(c, [cx + s * gap - s * r * 1.1, cy - r * 1.35, cx + s * gap + s * r * 0.9, cy - r * 0.85], OUTLINE, Math.max(2, r * 0.35));
  }
}

function glowEyes(e: EnemyCtx, cx: number, cy: number, gap: number, r: number): void {
  for (const s of [-1, 1]) {
    glow(e.c, cx + s * gap, cy, r * 2.4, e.eye, 0.7);
    poly(e.c, [cx + s * gap - r, cy - r * 0.4 * s, cx + s * gap + r, cy + r * 0.4 * s - r * 0.2, cx + s * gap - r * 0.6, cy + r * 0.5], e.eye, { lw: 0 });
  }
}

/** 눈 하나 (모르가스의 여러 눈) */
function oneEye(e: EnemyCtx, x: number, y: number, r: number): void {
  const { c } = e;
  circle(c, x, y, r, '#FFFFFF', { lw: Math.max(1.5, r * 0.25) });
  glow(c, x, y, r * 1.4, e.eye, 0.35);
  circle(c, x + r * 0.15, y + r * 0.12, r * 0.6, e.eye, { lw: 0 });
  circle(c, x + r * 0.35, y - r * 0.2, r * 0.2, '#FFFFFF', { lw: 0 });
}

/** 슬라임 몸에서 솟은 젤리 (몸 색을 밝게) */
function mixJelly(body: string): string {
  return shade(body, 0.35);
}

function fangs(c: Ctx, cx: number, cy: number, gap: number, s: number): void {
  for (const k of [-1, 1]) poly(c, [cx + k * gap - s * 0.5, cy, cx + k * gap + s * 0.5, cy, cx + k * gap, cy + s * 1.1], '#FFFFFF', { lw: 1.5 });
}

function spikes(c: Ctx, pts: readonly number[], color: string): void {
  // pts: [x, y, ang, len] 반복
  for (let i = 0; i < pts.length; i += 4) {
    const x = pts[i] as number;
    const y = pts[i + 1] as number;
    const a = pts[i + 2] as number;
    const l = pts[i + 3] as number;
    poly(c, [x + Math.cos(a + 1.57) * l * 0.35, y + Math.sin(a + 1.57) * l * 0.35, x + Math.cos(a) * l, y + Math.sin(a) * l, x - Math.cos(a + 1.57) * l * 0.35, y - Math.sin(a + 1.57) * l * 0.35], color, { lw: 2.5 });
  }
}

type CreatureDraw = (e: EnemyCtx) => void;

const UP = -Math.PI / 2;

export const CREATURE_ANCHORS: Readonly<Record<CreatureId, Anchor>> = {
  slime: { hx: 64, hy: 74, hr: 30 },
  bat: { hx: 64, hy: 66, hr: 24 },
  dark_golem: { hx: 64, hy: 46, hr: 18 },
  crystal_turtle: { hx: 104, hy: 66, hr: 14 },
  sheet_ghost: { hx: 64, hy: 54, hr: 28 },
  split_slime: { hx: 64, hy: 72, hr: 32 },
  shadow_thief: { hx: 64, hy: 56, hr: 22 },
  spore_healer: { hx: 64, hy: 80, hr: 18 },
  skeleton_shield: { hx: 56, hy: 44, hr: 20 },
  smoke_wolf: { hx: 92, hy: 50, hr: 16 },
  goblin_pack: { hx: 64, hy: 64, hr: 16 },
  gem_golem: { hx: 64, hy: 58, hr: 18 },
  mini_golem: { hx: 64, hy: 64, hr: 16 },
  spike_knight: { hx: 62, hy: 42, hr: 20 },
  bat_queen: { hx: 64, hy: 56, hr: 24 },
  sand_worm: { hx: 72, hy: 36, hr: 20 },
  frost_wyrm: { hx: 92, hy: 40, hr: 15 },
  rune_giant: { hx: 64, hy: 30, hr: 16 },
  crystal_worm: { hx: 92, hy: 56, hr: 18 },
  steel_colossus: { hx: 64, hy: 36, hr: 16 },
  lava_giant: { hx: 64, hy: 40, hr: 18 },
  king_slime: { hx: 64, hy: 70, hr: 36 },
  rot_treant: { hx: 64, hy: 46, hr: 22 },
  abyss_jelly: { hx: 64, hy: 44, hr: 30 },
  wraith_lord: { hx: 60, hy: 38, hr: 20 },
  wraith_rider: { hx: 56, hy: 26, hr: 13 },
  chaos_dragon: { hx: 64, hy: 50, hr: 18 },
  blade_lady: { hx: 64, hy: 36, hr: 17 },
  rock_heart: { hx: 64, hy: 30, hr: 16 },
  rot_king: { hx: 64, hy: 46, hr: 28 },
  shadow_assassin: { hx: 64, hy: 40, hr: 20 },
  dark_lord: { hx: 64, hy: 34, hr: 17 },
};

function slimeBody(e: EnemyCtx, cx: number, cy: number, w: number, h: number, color: string): void {
  const { c } = e;
  spikes(c, [cx - w * 0.25, cy - h * 0.42, UP - 0.4, 14, cx, cy - h * 0.5, UP, 16, cx + w * 0.25, cy - h * 0.42, UP + 0.4, 14], shade(color, -0.1));
  blob(c, [cx - w * 0.5, cy + h * 0.45, cx - w * 0.52, cy, cx - w * 0.3, cy - h * 0.48, cx + w * 0.3, cy - h * 0.48, cx + w * 0.52, cy, cx + w * 0.5, cy + h * 0.45], color, { cel: true, celOffset: 7 });
  shine(c, cx - w * 0.22, cy - h * 0.2, w * 0.14, h * 0.08, 0.65);
}

export const CREATURE_DRAW: Readonly<Record<CreatureId, CreatureDraw>> = {
  slime: (e) => {
    slimeBody(e, 64, 82, 94, 64, e.body);
    eyes(e, 64, 80, 15, 8);
    fangs(e.c, 64, 94, 6, 5);
    circle(e.c, 92, 98, 4, e.accent, { lw: 1.5 });
  },
  bat: (e) => {
    const { c } = e;
    const wing = shade(e.body, -0.25);
    for (const s of [-1, 1]) poly(c, [64 + s * 10, 62, 64 + s * 58, 36, 64 + s * 48, 58, 64 + s * 62, 76, 64 + s * 36, 74, 64 + s * 24, 90], wing, { lw: 3.5 });
    for (const s of [-1, 1]) poly(c, [64 + s * 18, 48, 64 + s * 14, 24, 64 + s * 4, 44], e.body, { lw: 3 });
    circle(c, 64, 68, 26, e.body, { cel: true, celOffset: 5 });
    eyes(e, 64, 66, 10, 7);
    fangs(c, 64, 82, 5, 5);
  },
  dark_golem: (e) => {
    const { c } = e;
    spikes(c, [30, 50, UP - 0.7, 18, 98, 50, UP + 0.7, 18, 64, 28, UP, 14], shade(e.body, -0.2));
    for (const s of [-1, 1]) blob(c, [64 + s * 26, 54, 64 + s * 50, 58, 64 + s * 52, 92, 64 + s * 36, 98, 64 + s * 28, 80], shade(e.body, -0.08), { cel: true, celOffset: 4 });
    poly(c, [34, 108, 30, 62, 46, 36, 82, 36, 98, 62, 94, 108], e.body, { cel: true, celOffset: 7 });
    for (const pts of [
      [44, 70, 54, 82, 48, 96],
      [84, 66, 76, 80, 86, 94],
    ])
      stroke(c, pts, e.accent, 3.5);
    glow(c, 64, 82, 14, e.accent, 0.6);
    eyes(e, 64, 52, 11, 6);
  },
  crystal_turtle: (e) => {
    const { c } = e;
    for (const x of [34, 84]) ellipse(c, x, 102, 12, 9, shade(e.body, 0.2), { lw: 3 });
    blob(c, [92, 80, 100, 58, 116, 58, 120, 74, 108, 84], shade(e.body, 0.2), { cel: true, celOffset: 2 });
    paint(c, P.ellipse(58, 82, 46, 30), e.body, { cel: true, celOffset: 5 });
    for (const [x, h, a] of [
      [40, 30, -0.3],
      [58, 40, 0],
      [76, 30, 0.3],
      [48, 22, -0.1],
    ] as const) {
      c.save();
      c.translate(x, 70);
      c.rotate(a);
      poly(c, [-7, 0, 0, -h, 7, 0], e.accent, { lw: 3 });
      shine(c, -2, -h * 0.5, 2, h * 0.2, 0.8);
      c.restore();
    }
    eyes(e, 108, 66, 0.01, 5);
  },
  sheet_ghost: (e) => {
    const { c } = e;
    paint(c, P.blob([26, 112, 24, 60, 36, 30, 64, 18, 92, 30, 104, 60, 104, 112, 90, 98, 78, 114, 64, 100, 50, 114, 38, 100]), e.body, { cel: true, celOffset: 6, alpha: 0.95 });
    for (const s of [-1, 1]) {
      ellipse(c, 64 + s * 15, 56, 8, 11, '#2B2340', { lw: 0 });
      glow(c, 64 + s * 15, 58, 10, e.eye, 0.8);
      circle(c, 64 + s * 15, 58, 3.5, e.eye, { lw: 0 });
    }
    ellipse(c, 64, 78, 7, 6, '#2B2340', { lw: 0 });
  },
  split_slime: (e) => {
    const { c } = e;
    slimeBody(e, 64, 80, 104, 70, e.body);
    stroke(c, [64, 48, 60, 62, 68, 76, 62, 92, 64, 108], shade(e.body, -0.45), 3.5);
    eyes(e, 46, 78, 7, 6);
    eyes(e, 82, 78, 7, 6);
    shine(c, 92, 62, 6, 4, 0.7);
  },
  shadow_thief: (e) => {
    // 투명 도둑 (검토 반영 — 시트 'hooded shadow goblin thief, semi-transparent'): 반투명 그림자 몸(외곽선은 또렷) + 두건 옆으로 삐죽 나온 고블린 귀
    const { c } = e;
    blob(c, [90, 96, 108, 88, 112, 104, 96, 112], '#4A3A2A', { lw: 3 });
    for (const s2 of [-1, 1]) poly(c, [64 + s2 * 18, 50, 64 + s2 * 44, 36, 64 + s2 * 24, 62], e.accent, { lw: 2.5, alpha: 0.85 });
    const hood = P.poly([28, 112, 36, 66, 64, 22, 92, 66, 100, 112]);
    paint(c, hood, e.body, { lw: 0, alpha: 0.62 });
    paint(c, hood, null, { lw: 4 });
    paint(c, P.poly([64, 22, 74, 6, 78, 24]), e.body, { lw: 3, alpha: 0.8 });
    for (let i = 0; i < 3; i++) stroke(c, [40 + i * 16, 112, 44 + i * 16, 96], shade(e.accent, 0.2), 2, 0.6);
    ellipse(c, 64, 64, 22, 18, '#100C18', { lw: 0, alpha: 0.9 });
    glowEyes(e, 64, 64, 9, 5);
    rrect(c, 40, 92, 48, 6, 2, e.accent, { lw: 2 });
    poly(c, [94, 100, 118, 86, 114, 98], '#C8CCD6', { lw: 2.5 });
  },
  spore_healer: (e) => {
    const { c } = e;
    for (const s of [-1, 1]) blob(c, [64 + s * 14, 84, 64 + s * 38, 70, 64 + s * 40, 90, 64 + s * 20, 96], 'rgba(220,255,220,0.7)', { lw: 2.5 });
    rrect(c, 46, 70, 36, 38, 14, e.accent, { cel: true, celOffset: 3 });
    paint(c, P.dome(64, 72, 44, 0.85), e.body, { cel: true, celOffset: 5 });
    spikes(c, [30, 64, UP - 1.0, 10, 98, 64, UP + 1.0, 10], e.body);
    for (const [x, y, r] of [
      [46, 54, 7],
      [66, 42, 8],
      [86, 56, 6],
    ] as const)
      circle(c, x, y, r, '#FFFFFF', { lw: 0, alpha: 0.95 });
    eyes(e, 64, 86, 9, 5.5);
    for (const [x, y] of [
      [22, 44],
      [106, 40],
    ] as const) {
      rrect(c, x - 7, y - 2, 14, 5, 1, '#7ED957', { lw: 1.5 });
      rrect(c, x - 2, y - 7, 5, 14, 1, '#7ED957', { lw: 1.5 });
    }
  },
  skeleton_shield: (e) => {
    const { c } = e;
    for (const s of [-1, 1]) line(c, [56 + s * 8, 92, 56 + s * 12, 112], e.body, 6);
    rrect(c, 42, 64, 28, 30, 6, e.body, { lw: 3 });
    for (let i = 0; i < 3; i++) stroke(c, [45, 70 + i * 7, 67, 70 + i * 7], '#9A9080', 2);
    skullIcon(c, 56, 44, 22, e.body);
    for (const s of [-1, 1]) {
      glow(c, 56 + s * 8, 45, 8, e.eye, 0.9);
      circle(c, 56 + s * 8, 45, 3.5, e.eye, { lw: 0 });
    }
    glow(c, 98, 82, 34, '#8FD8FF', 0.45);
    paint(c, P.rrect(78, 56, 40, 52, 12), e.accent, { cel: true, celOffset: 3 });
    rrect(c, 78, 56, 40, 52, 12, null, { lw: 3, stroke: '#8FD8FF' });
    for (const x of [90, 104]) stroke(c, [x, 60, x, 104], shade(e.accent, -0.35), 2.5);
  },
  smoke_wolf: (e) => {
    const { c } = e;
    for (const [x, y, r] of [
      [26, 92, 16],
      [14, 76, 10],
      [104, 96, 12],
    ] as const)
      circle(c, x, y, r, e.accent, { lw: 0, alpha: 0.55 });
    poly(c, [18, 98, 26, 68, 50, 60, 70, 44, 80, 22, 88, 40, 102, 32, 100, 56, 116, 72, 100, 82, 86, 78, 82, 104, 66, 104, 60, 88, 40, 90, 36, 106], e.body, { cel: true, celOffset: 5 });
    spikes(c, [40, 62, UP - 0.3, 10, 54, 56, UP - 0.2, 10], e.body);
    glow(c, 94, 52, 10, e.eye, 0.8);
    poly(c, [88, 50, 100, 52, 92, 56], e.eye, { lw: 0 });
    poly(c, [104, 76, 110, 76, 107, 82], '#FFFFFF', { lw: 1 });
  },
  goblin_pack: (e) => {
    const { c } = e;
    const one = (x: number, y: number, s: number): void => {
      c.save();
      c.translate(x, y);
      c.scale(s, s);
      for (const k of [-1, 1]) poly(c, [k * 12, -6, k * 34, -20, k * 16, 2], e.body, { lw: 3 });
      rrect(c, -14, 12, 28, 22, 6, e.accent, { lw: 3 });
      circle(c, 0, 0, 16, e.body, { cel: true, celOffset: 3 });
      spikes(c, [0, -14, UP, 9], e.body);
      for (const k of [-1, 1]) {
        circle(c, k * 6, 0, 4, '#FFFFFF', { lw: 1.5 });
        circle(c, k * 6 + 0.6, 0.6, 2.6, e.eye, { lw: 0 });
      }
      fangs(c, 0, 8, 4, 3);
      c.restore();
    };
    one(34, 70, 0.8);
    one(94, 70, 0.8);
    one(64, 80, 1);
    poly(c, [84, 104, 106, 90, 110, 94, 88, 108], '#C8CCD6', { lw: 2 });
  },
  gem_golem: (e) => {
    // 보석 골렘 (검토 반영): 암흑 골렘의 각진 판 몸과 다르게 둥근 바위 몸 + 등·어깨에 솟은 수정 무리 + 가슴의 큰 보석
    const { c } = e;
    for (const [x, y, h, a] of [
      [32, 54, 26, -0.75],
      [44, 40, 32, -0.35],
      [64, 32, 26, 0],
      [84, 40, 32, 0.35],
      [96, 54, 26, 0.75],
    ] as const) {
      c.save();
      c.translate(x, y);
      c.rotate(a);
      poly(c, [-7, 4, -7, -h * 0.7, 0, -h, 7, -h * 0.7, 7, 4], shade(e.accent, 0.15), { lw: 2.5 });
      stroke(c, [0, 0, 0, -h * 0.8], '#FFFFFF', 1.5, 0.7);
      c.restore();
    }
    for (const s2 of [-1, 1]) {
      circle(c, 64 + s2 * 44, 86, 15, shade(e.body, -0.1), { cel: true, celOffset: 3 });
      ellipse(c, 64 + s2 * 18, 112, 13, 7, shade(e.body, -0.25), { lw: 3 });
    }
    paint(c, P.ellipse(64, 80, 40, 36), e.body, { cel: true, celOffset: 7 });
    for (const [x, y] of [
      [40, 70],
      [90, 96],
      [86, 64],
    ] as const)
      poly(c, [x, y - 6, x + 4, y, x, y + 6, x - 4, y], e.accent, { lw: 1.8 });
    glow(c, 64, 88, 26, e.accent, 0.75);
    poly(c, [64, 70, 80, 88, 64, 106, 48, 88], e.accent, { lw: 3.5 });
    poly(c, [64, 70, 72, 88, 64, 106], shade(e.accent, 0.35), { lw: 0 });
    shine(c, 58, 82, 3, 6, 0.9);
    eyes(e, 64, 60, 11, 5.5);
  },
  mini_golem: (e) => {
    const { c } = e;
    for (const s of [-1, 1]) poly(c, [64 + s * 16, 84, 64 + s * 32, 78, 64 + s * 36, 98, 64 + s * 20, 100], shade(e.body, -0.1), { lw: 3 });
    poly(c, [44, 108, 40, 76, 52, 56, 76, 56, 88, 76, 84, 108], e.body, { cel: true, celOffset: 5 });
    for (const [x, y, h, a] of [
      [52, 58, 18, -0.4],
      [64, 54, 22, 0],
      [76, 58, 18, 0.4],
    ] as const) {
      c.save();
      c.translate(x, y);
      c.rotate(a);
      poly(c, [-5, 0, 0, -h, 5, 0], e.accent, { lw: 2.5 });
      c.restore();
    }
    eyes(e, 64, 74, 8, 5);
  },
  spike_knight: (e) => {
    const { c } = e;
    line(c, [96, 112, 112, 10], '#7A808A', 5);
    poly(c, [112, 2, 118, 22, 106, 22], '#DDE6F0', { lw: 2.5 });
    for (const s of [-1, 1]) line(c, [62 + s * 10, 92, 62 + s * 12, 112], shade(e.body, -0.2), 9);
    poly(c, [38, 96, 36, 58, 50, 50, 74, 50, 88, 58, 86, 96], e.body, { cel: true, celOffset: 5 });
    poly(c, [52, 58, 72, 58, 68, 92, 56, 92], e.accent, { lw: 2.5 });
    for (const s of [-1, 1]) {
      ellipse(c, 62 + s * 28, 56, 14, 11, shade(e.body, 0.1), { lw: 3 });
      spikes(c, [62 + s * 28, 48, UP + s * 0.5, 14, 62 + s * 38, 56, UP + s * 1.2, 12], '#DDE6F0');
    }
    paint(c, P.rrect(44, 22, 36, 38, 14), shade(e.body, 0.15), { cel: true, celOffset: 3 });
    rrect(c, 48, 36, 28, 8, 3, '#100C18', { lw: 0 });
    glowEyes(e, 62, 40, 7, 3.5);
    spikes(c, [62, 22, UP, 14], '#DDE6F0');
    line(c, [96, 64, 88, 70], shade(e.body, -0.1), 8);
  },
  bat_queen: (e) => {
    const { c } = e;
    const wing = shade(e.body, -0.3);
    for (const s of [-1, 1]) poly(c, [64 + s * 14, 54, 64 + s * 62, 22, 64 + s * 54, 50, 64 + s * 64, 70, 64 + s * 44, 68, 64 + s * 46, 92, 64 + s * 24, 80], wing, { lw: 3.5 });
    paint(c, P.poly([40, 110, 46, 70, 82, 70, 88, 110]), '#4A1A3A', { cel: true, celOffset: 4 });
    stroke(c, [42, 110, 64, 104, 86, 110], e.accent, 3);
    for (const s of [-1, 1]) poly(c, [64 + s * 18, 40, 64 + s * 16, 14, 64 + s * 4, 36], e.body, { lw: 3 });
    circle(c, 64, 58, 26, e.body, { cel: true, celOffset: 5 });
    eyes(e, 64, 56, 10, 7);
    fangs(c, 64, 72, 6, 5);
  },
  sand_worm: (e) => {
    const { c } = e;
    blob(c, [8, 116, 18, 98, 44, 90, 84, 90, 110, 98, 120, 116], '#E8C98A', { cel: true, celOffset: 4 });
    for (let i = 3; i >= 0; i--) circle(c, 64 + i * 3, 90 - i * 16, 22 - i * 1, i % 2 ? shade(e.body, -0.1) : e.body, { lw: 3.5, cel: true, celOffset: 3 });
    paint(c, P.circle(72, 36, 22), e.body, { cel: true, celOffset: 4 });
    paint(c, P.ellipse(78, 40, 13, 10), '#5A1A1A', { lw: 3 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      poly(c, [78 + Math.cos(a) * 12, 40 + Math.sin(a) * 9, 78 + Math.cos(a + 0.25) * 6, 40 + Math.sin(a + 0.25) * 4, 78 + Math.cos(a - 0.25) * 6, 40 + Math.sin(a - 0.25) * 4], '#FFFFFF', { lw: 1 });
    }
    spikes(c, [56, 22, UP - 0.6, 12, 70, 14, UP - 0.2, 12], e.accent);
    for (const s of [-1, 1]) {
      circle(c, 66 + s * 9, 26, 3.6, e.eye, { lw: 1.5 });
    }
  },
  frost_wyrm: (e) => {
    const { c } = e;
    for (const s of [-1, 1]) poly(c, [60, 60, 60 + s * 52, 24, 60 + s * 44, 50, 60 + s * 58, 66, 60 + s * 30, 72], 'rgba(200,240,255,0.85)', { lw: 3 });
    line(c, [30, 92, 14, 104, 20, 112], e.body, 8);
    blob(c, [30, 92, 36, 70, 60, 62, 82, 70, 88, 92, 60, 104], e.body, { cel: true, celOffset: 5 });
    line(c, [76, 70, 88, 48], e.body, 12);
    blob(c, [80, 44, 88, 30, 106, 32, 114, 42, 100, 50], e.body, { cel: true, celOffset: 3 });
    spikes(c, [86, 32, UP - 0.5, 12, 96, 28, UP - 0.2, 12, 48, 64, UP, 9, 62, 60, UP, 9], '#FFFFFF');
    circle(c, 100, 38, 3.5, e.eye, { lw: 1.5 });
    for (let i = 0; i < 3; i++) circle(c, 116 + i * 4, 44 - i * 6, 3, '#E8FAFF', { lw: 0, alpha: 0.8 });
  },
  rune_giant: (e) => {
    // 고대 골렘 (검토 반영): 키 큰 돌기둥 몸 + 이끼 낀 바위 어깨 + 위쪽에 새긴 얼굴 + 가슴의 큰 룬 하나 (청회색)
    const { c } = e;
    for (const s2 of [-1, 1]) rrect(c, 64 + s2 * 14 - 11, 98, 22, 18, 5, shade(e.body, -0.25), { lw: 3 });
    for (const s2 of [-1, 1]) {
      paint(c, P.rrect(64 + s2 * 36 - 10, 48, 20, 54, 7), shade(e.body, -0.1), { cel: true, celOffset: 3 });
      circle(c, 64 + s2 * 36, 104, 9, shade(e.body, -0.2), { lw: 3 });
    }
    paint(c, P.rrect(42, 14, 44, 92, 10), e.body, { cel: true, celOffset: 6 });
    for (let i = 0; i < 3; i++) stroke(c, [44, 40 + i * 22, 84, 38 + i * 22], shade(e.body, -0.28), 2);
    for (const s2 of [-1, 1]) {
      circle(c, 64 + s2 * 30, 46, 16, shade(e.body, 0.08), { cel: true, celOffset: 3 });
      blob(c, [64 + s2 * 18, 40, 64 + s2 * 24, 31, 64 + s2 * 36, 30, 64 + s2 * 44, 38, 64 + s2 * 32, 40], '#6FA35A', { lw: 2 });
    }
    rrect(c, 46, 22, 36, 6, 2, shade(e.body, -0.35), { lw: 0 });
    eyes(e, 64, 34, 9, 5);
    stroke(c, [54, 46, 64, 49, 74, 46], OUTLINE, 3);
    glow(c, 64, 76, 22, e.accent, 0.8);
    circle(c, 64, 76, 13, null, { lw: 3.5, stroke: e.accent });
    stroke(c, [64, 66, 64, 86], e.accent, 3);
    stroke(c, [57, 72, 64, 78, 71, 72], e.accent, 3);
  },
  crystal_worm: (e) => {
    const { c } = e;
    for (let i = 0; i < 4; i++) circle(c, 28 + i * 18, 92 - i * 8, 18, i % 2 ? shade(e.body, -0.1) : e.body, { lw: 3.5, cel: true, celOffset: 3 });
    for (let i = 0; i < 3; i++) {
      c.save();
      c.translate(30 + i * 18, 76 - i * 8);
      poly(c, [-5, 0, 0, -18, 5, 0], e.accent, { lw: 2.5 });
      c.restore();
    }
    paint(c, P.circle(92, 56, 20), e.body, { cel: true, celOffset: 3 });
    paint(c, P.ellipse(106, 62, 9, 8), '#3A1A3A', { lw: 2.5 });
    poly(c, [110, 76, 122, 60, 124, 80], '#9BE7FF', { lw: 2.5 });
    eyes(e, 88, 48, 7, 4.5);
  },
  steel_colossus: (e) => {
    const { c } = e;
    for (const s of [-1, 1]) {
      rrect(c, 64 + s * 40 - 14, 26, 28, 26, 5, '#5A626E', { lw: 3 });
      for (let i = 0; i < 2; i++) circle(c, 64 + s * 40 - 6 + i * 12, 34, 4, e.accent, { lw: 1.5 });
      rrect(c, 64 + s * 44 - 10, 56, 20, 46, 6, shade(e.body, -0.1), { lw: 3 });
    }
    for (const s of [-1, 1]) rrect(c, 64 + s * 14 - 8, 92, 16, 22, 4, shade(e.body, -0.2), { lw: 3 });
    paint(c, P.rrect(36, 46, 56, 52, 10), e.body, { cel: true, celOffset: 4 });
    glow(c, 64, 70, 12, NOX_EYE, 0.7);
    circle(c, 64, 70, 7, NOX_EYE, { lw: 2.5 });
    rrect(c, 50, 22, 28, 26, 6, shade(e.body, 0.1), { lw: 3 });
    rrect(c, 54, 32, 20, 6, 2, '#100C18', { lw: 0 });
    glowEyes(e, 64, 35, 5, 2.6);
    for (let i = 0; i < 4; i++) circle(c, 42 + i * 15, 92, 2, '#3A3F44', { lw: 0 });
  },
  lava_giant: (e) => {
    // 용암 거인 (검토 반영): 판 몸 대신 흘러내리는 울퉁불퉁한 몸 + 팔·몸 아래로 떨어지는 용암 방울 + 발밑 용암 웅덩이
    const { c } = e;
    glow(c, 64, 72, 60, e.accent, 0.45);
    blob(c, [18, 116, 36, 106, 64, 110, 92, 104, 112, 116, 64, 122], e.accent, { lw: 3 });
    for (const s2 of [-1, 1])
      blob(c, [64 + s2 * 26, 44, 64 + s2 * 54, 48, 64 + s2 * 62, 74, 64 + s2 * 56, 94, 64 + s2 * 60, 108, 64 + s2 * 48, 102, 64 + s2 * 42, 84, 64 + s2 * 30, 70], e.body, { cel: true, celOffset: 4 });
    blob(c, [30, 104, 24, 72, 32, 46, 48, 28, 64, 22, 80, 28, 96, 46, 102, 72, 98, 104, 90, 98, 86, 112, 78, 100, 70, 112, 62, 100, 54, 114, 46, 100, 38, 110], e.body, { cel: true, celOffset: 6 });
    for (const pts of [
      [40, 52, 50, 66, 42, 82, 52, 98],
      [88, 50, 78, 64, 88, 80],
      [62, 70, 68, 86, 62, 100],
    ])
      line(c, pts, e.accent, 4, false);
    for (const [x, y, r] of [
      [118, 104, 4],
      [10, 106, 4],
      [86, 116, 3.5],
      [54, 118, 3],
    ] as const)
      ellipse(c, x, y, r, r * 1.5, '#FFB13B', { lw: 1.5 });
    for (let i = -1; i <= 1; i++) flame(c, 64 + i * 14, 22 - (1 - Math.abs(i)) * 4, 7, e.accent, '#FFE27A');
    eyes(e, 64, 44, 10, 5.5);
  },
  king_slime: (e) => {
    // 킹 슬라임 (검토 반영): 금관은 4천왕 계급 표시라 쓰지 않는다 → 몸에서 솟은 젤리 왕관 + 빨간 보석 (대장 은뿔은 계급 장식이 붙인다)
    const { c } = e;
    slimeBody(e, 64, 80, 112, 76, e.body);
    blob(c, [40, 52, 40, 32, 50, 42, 56, 20, 64, 36, 72, 20, 78, 42, 88, 32, 88, 52, 64, 48], mixJelly(e.body), { lw: 3, cel: true, celOffset: 2, alpha: 0.92 });
    for (const [x, y, r] of [
      [46, 40, 2.6],
      [74, 30, 2.2],
      [82, 44, 1.8],
    ] as const)
      circle(c, x, y, r, '#FFFFFF', { lw: 0, alpha: 0.85 });
    poly(c, [64, 34, 70, 42, 64, 50, 58, 42], '#FF4D6D', { lw: 2 });
    shine(c, 62, 39, 1.5, 3, 0.9);
    eyes(e, 64, 76, 17, 8.5);
    fangs(c, 64, 92, 7, 5);
    paint(c, P.circle(30, 102, 6), shade(e.body, 0.1), { lw: 2 });
  },
  rot_treant: (e) => {
    const { c } = e;
    for (const s of [-1, 1]) line(c, [64 + s * 22, 60, 64 + s * 46, 44, 64 + s * 54, 24], e.body, 8);
    for (const s of [-1, 1]) line(c, [64 + s * 46, 44, 64 + s * 58, 46], e.body, 5);
    for (const s of [-1, 1]) poly(c, [64 + s * 10, 104, 64 + s * 30, 116, 64 + s * 20, 100], shade(e.body, -0.15), { lw: 2.5 });
    paint(c, P.rrect(40, 34, 48, 76, 18), e.body, { cel: true, celOffset: 5 });
    for (let i = 0; i < 3; i++) stroke(c, [46 + i * 12, 40, 50 + i * 12, 104], shade(e.body, -0.3), 2);
    blob(c, [34, 40, 40, 14, 64, 6, 90, 14, 96, 40, 64, 34], '#5A3A6A', { cel: true, celOffset: 3 });
    for (const pts of [
      [36, 60, 50, 74, 42, 92],
      [92, 56, 80, 72, 90, 88],
    ])
      line(c, pts, e.accent, 3.5, true);
    for (const [x, y] of [
      [50, 74],
      [80, 72],
    ] as const)
      circle(c, x, y, 3.5, e.accent, { lw: 1.5 });
    glowEyes(e, 64, 52, 10, 5);
    ellipse(c, 64, 70, 8, 5, '#1E140E', { lw: 0 });
  },
  abyss_jelly: (e) => {
    const { c } = e;
    glow(c, 64, 50, 50, e.accent, 0.5);
    for (let i = 0; i < 5; i++) {
      const x = 40 + i * 12;
      stroke(c, [x, 64, x - 4, 84, x + 4, 100, x - 2, 116], e.accent, 4, 0.85);
    }
    paint(c, P.dome(64, 66, 42, 0.95), e.body, { cel: true, celOffset: 5, alpha: 0.92 });
    stroke(c, [24, 66, 104, 66], shade(e.body, 0.3), 4);
    for (const [x, y] of [
      [48, 40],
      [78, 36],
    ] as const)
      circle(c, x, y, 5, '#FFFFFF', { lw: 0, alpha: 0.5 });
    eyes(e, 64, 52, 12, 6.5);
  },
  wraith_lord: (e) => {
    const { c } = e;
    line(c, [100, 116, 96, 14], '#3A2A2A', 5);
    paint(c, (cc) => {
      cc.beginPath();
      cc.moveTo(96, 16);
      cc.quadraticCurveTo(72, 0, 50, 18);
      cc.quadraticCurveTo(72, 10, 96, 28);
      cc.closePath();
    }, '#DDE6F0', { lw: 3 });
    // 망령 군주 (검토 반영 — 시트 'translucent'): 비치는 유령 몸(외곽선은 또렷) + 안쪽 넋 줄기
    const robe = P.blob([30, 114, 28, 64, 40, 34, 60, 22, 80, 34, 92, 64, 92, 114, 80, 102, 70, 116, 60, 102, 48, 116, 40, 102]);
    glow(c, 60, 70, 46, e.accent, 0.35);
    paint(c, robe, e.body, { lw: 0, alpha: 0.6 });
    paint(c, robe, null, { lw: 4, stroke: shade(e.accent, -0.35) });
    for (let i = 0; i < 3; i++) stroke(c, [44 + i * 14, 108, 48 + i * 14, 80, 44 + i * 14, 62], e.accent, 2, 0.55);
    ellipse(c, 60, 44, 16, 14, '#100C18', { lw: 0 });
    glowEyes(e, 60, 44, 7, 4);
    for (const s of [-1, 1]) line(c, [60 + s * 24, 64, 60 + s * 34, 78], e.body, 7);
  },
  wraith_rider: (e) => {
    const { c } = e;
    c.save();
    c.globalAlpha = 0.92;
    for (const x of [38, 54, 78, 94]) line(c, [x, 88, x - 2, 112], '#7FE8F0', 6);
    blob(c, [26, 84, 32, 66, 66, 62, 96, 66, 102, 86, 70, 94, 36, 94], '#3C5A6E', { cel: true, celOffset: 4 });
    blob(c, [94, 70, 104, 46, 118, 40, 124, 52, 110, 66], '#3C5A6E', { cel: true, celOffset: 3 });
    for (let i = 0; i < 4; i++) poly(c, [96 + i * 4, 46 - i * 2, 90 + i * 4, 30 - i * 2, 102 + i * 4, 44 - i * 2], e.accent, { lw: 1.5 });
    line(c, [26, 76, 10, 90, 16, 104], e.accent, 5, false);
    c.restore();
    glow(c, 116, 48, 6, e.eye, 0.9);
    circle(c, 116, 48, 2.5, e.eye, { lw: 0 });
    paint(c, P.rrect(44, 30, 26, 38, 10), e.body, { cel: true, celOffset: 3 });
    paint(c, P.rrect(46, 14, 22, 22, 8), shade(e.body, 0.15), { cel: true, celOffset: 2 });
    glowEyes(e, 57, 26, 5, 2.6);
    line(c, [70, 44, 104, 18], '#DDE6F0', 3);
  },
  chaos_dragon: (e) => {
    const { c } = e;
    const wing = shade(e.body, -0.35);
    poly(c, [44, 64, 6, 30, 12, 60, 2, 78, 30, 74, 40, 84], wing, { lw: 3.5 });
    poly(c, [84, 64, 122, 30, 116, 60, 126, 78, 98, 74, 88, 84], wing, { lw: 3.5 });
    paint(c, P.ellipse(64, 88, 32, 22), e.body, { cel: true, celOffset: 4 });
    ellipse(c, 64, 94, 15, 12, '#E8B04A', { lw: 0, alpha: 0.85 });
    poly(c, [52, 74, 38, 46, 48, 42, 60, 70], e.body, { lw: 3.5 });
    poly(c, [76, 74, 90, 46, 80, 42, 68, 70], e.body, { lw: 3.5 });
    for (const [hx, flip] of [
      [38, -1],
      [90, 1],
    ] as const) {
      paint(c, P.ellipse(hx, 38, 13, 10), e.body, { cel: true, celOffset: 2 });
      poly(c, [hx - 6, 30, hx - 10 * flip - 6, 16, hx + 2, 28], '#F0E6D0', { lw: 2.5 });
      glow(c, hx + 4 * flip, 36, 6, e.eye, 0.9);
      circle(c, hx + 4 * flip, 36, 3, e.eye, { lw: 0 });
      flame(c, hx + 16 * flip, 42, 4, '#FF7A2F', '#FFE27A');
    }
    line(c, [92, 100, 120, 110, 112, 118], e.body, 7);
  },
  blade_lady: (e) => {
    const { c } = e;
    for (const s of [-1, 1])
      for (let i = 0; i < 4; i++) {
        const a = (s < 0 ? Math.PI : 0) - s * (0.9 - i * 0.32);
        c.save();
        c.translate(64 + s * 8, 52);
        c.rotate(a);
        poly(c, [0, -3, 50 - i * 6, -2, 60 - i * 6, 0, 50 - i * 6, 3, 0, 3], '#DDE6F0', { lw: 2.5 });
        c.restore();
      }
    paint(c, P.poly([48, 112, 52, 70, 76, 70, 80, 112, 64, 104]), e.body, { cel: true, celOffset: 3 });
    paint(c, P.rrect(48, 48, 32, 30, 10), e.accent, { cel: true, celOffset: 3 });
    blob(c, [46, 34, 50, 16, 64, 12, 80, 18, 84, 36, 76, 28, 52, 28], '#DDE6F0', { lw: 3 });
    circle(c, 64, 36, 16, '#C9B8E8', { cel: true, celOffset: 3 });
    eyes(e, 64, 38, 6, 3.6);
    line(c, [86, 70, 108, 40], '#DDE6F0', 4);
  },
  rock_heart: (e) => {
    const { c } = e;
    for (const s of [-1, 1]) {
      rrect(c, 64 + s * 44 - 12, 44, 24, 54, 8, shade(e.body, -0.1), { lw: 3 });
      circle(c, 64 + s * 44, 102, 11, shade(e.body, -0.2), { lw: 3 });
    }
    for (const s of [-1, 1]) rrect(c, 64 + s * 15 - 9, 92, 18, 24, 4, shade(e.body, -0.25), { lw: 3 });
    paint(c, P.poly([30, 50, 98, 50, 92, 98, 36, 98]), e.body, { cel: true, celOffset: 5 });
    glow(c, 64, 72, 26, e.accent, 0.8);
    blob(c, [52, 64, 62, 58, 76, 62, 78, 78, 64, 86, 50, 78], '#7A5A4A', { lw: 3 });
    stroke(c, [56, 66, 64, 74, 72, 66], e.accent, 3);
    stroke(c, [64, 74, 64, 82], e.accent, 3);
    paint(c, P.rrect(48, 18, 32, 30, 8), shade(e.body, 0.1), { cel: true, celOffset: 2 });
    glowEyes(e, 64, 32, 7, 3.5);
  },
  rot_king: (e) => {
    // 역병의 군단장 모르가스 (검토 반영): 썩은 보랏빛 갈색, 반쯤 녹아 흘러내린 몸 + 해골 거품 + 여러 개의 눈 + 떨어지는 점액 웅덩이
    const { c } = e;
    blob(c, [10, 116, 28, 104, 64, 108, 100, 102, 118, 116, 64, 124], shade(e.body, -0.25), { lw: 3 });
    blob(c, [22, 110, 18, 84, 26, 58, 40, 38, 56, 26, 76, 28, 92, 40, 102, 62, 108, 90, 108, 112, 98, 104, 94, 118, 84, 106, 74, 120, 64, 106, 52, 120, 42, 104, 32, 116], e.body, { cel: true, celOffset: 7 });
    for (const [x, y, rx, ry] of [
      [30, 72, 5, 13],
      [100, 80, 5, 15],
      [56, 98, 4, 10],
    ] as const) {
      ellipse(c, x, y, rx, ry, shade(e.body, -0.2), { lw: 2 });
      circle(c, x, y + ry + 4, rx * 0.8, e.accent, { lw: 1.5 });
    }
    skullIcon(c, 40, 92, 8, '#E8E0B0');
    skullIcon(c, 88, 96, 7, '#E8E0B0');
    for (const [x, y, r] of [
      [78, 76, 5],
      [34, 54, 4],
      [96, 60, 3.5],
      [62, 84, 3],
    ] as const)
      circle(c, x, y, r, e.accent, { lw: 1.8, alpha: 0.9 });
    oneEye(e, 52, 52, 7.5);
    oneEye(e, 76, 48, 9);
    oneEye(e, 64, 66, 5);
    oneEye(e, 88, 58, 4.5);
    paint(c, P.blob([46, 74, 60, 78, 74, 74, 82, 80, 72, 88, 58, 88]), '#2A1418', { lw: 2.5 });
    for (let i = 0; i < 3; i++) poly(c, [54 + i * 8, 76, 58 + i * 8, 76, 56 + i * 8, 82], '#E8E0B0', { lw: 0 });
  },
  shadow_assassin: (e) => {
    const { c } = e;
    glow(c, 64, 70, 54, '#2A1A3A', 0.6);
    paint(c, P.poly([24, 114, 34, 70, 64, 18, 94, 70, 104, 114, 84, 104, 64, 116, 44, 104]), e.body, { cel: true, celOffset: 6 });
    spikes(c, [40, 64, UP - 0.9, 12, 88, 64, UP + 0.9, 12, 64, 18, UP, 12], e.body);
    ellipse(c, 64, 42, 18, 15, '#06040A', { lw: 0 });
    glowEyes(e, 64, 42, 8, 4.5);
    for (const s of [-1, 1]) {
      c.save();
      c.translate(64 + s * 30, 86);
      c.rotate(s * 0.6);
      poly(c, [-3, 0, 0, -26, 3, 0], '#DDE6F0', { lw: 2 });
      c.restore();
    }
  },
  dark_lord: (e) => {
    const { c } = e;
    for (const s of [-1, 1]) line(c, [64 + s * 12, 90, 64 + s * 14, 114], '#1A1626', 10);
    paint(c, P.poly([38, 96, 34, 54, 50, 44, 78, 44, 94, 54, 90, 96]), e.body, { cel: true, celOffset: 5 });
    for (let i = 0; i < 7; i++) sparkle(c, 42 + ((i * 37) % 46), 52 + ((i * 23) % 40), 2.5, '#FFFFFF', 0.9);
    for (const s of [-1, 1]) {
      ellipse(c, 64 + s * 28, 52, 13, 10, '#2A2238', { lw: 3 });
      spikes(c, [64 + s * 32, 44, UP + s * 0.6, 12], '#2A2238');
    }
    line(c, [96, 100, 112, 30], '#2A2238', 6);
    glow(c, 112, 30, 12, e.accent, 0.8);
    poly(c, [112, 14, 118, 30, 112, 40, 106, 30], e.accent, { lw: 2 });
    paint(c, P.rrect(48, 18, 32, 32, 10), '#2A2238', { cel: true, celOffset: 3 });
    rrect(c, 52, 30, 24, 7, 3, '#06040A', { lw: 0 });
    glowEyes(e, 64, 33, 6, 3);
  },
};

/** 군단 깃발 (대장): 머리 뒤에 꽂은 작은 삼각 깃발 */
function legionFlag(c: Ctx, x: number, y: number, legion: string): void {
  line(c, [x, y + 26, x, y - 22], '#5A5F68', 3);
  poly(c, [x, y - 22, x + 20, y - 15, x, y - 7], legion, { lw: 2.5 });
  circle(c, x, y - 24, 2.5, '#DDE6F0', { lw: 1 });
}

function silverHorns(c: Ctx, a: Anchor): void {
  for (const s of [-1, 1]) {
    const bx = a.hx + s * a.hr * 0.7;
    const by = a.hy - a.hr * 0.7;
    paint(c, (cc) => {
      cc.beginPath();
      cc.moveTo(bx - s * 4, by + 3);
      cc.quadraticCurveTo(bx + s * a.hr * 0.5, by - a.hr * 0.2, bx + s * a.hr * 0.55, by - a.hr * 0.85);
      cc.quadraticCurveTo(bx + s * a.hr * 0.15, by - a.hr * 0.35, bx + s * 4, by + 3);
      cc.closePath();
    }, '#DDE6F0', { lw: 2.5 });
  }
}

function goldCrown(c: Ctx, a: Anchor, color: string, gem: string): void {
  const w = Math.max(14, a.hr * 0.9);
  const y = a.hy - a.hr * 0.95;
  poly(c, [a.hx - w, y + 8, a.hx - w, y - 6, a.hx - w * 0.5, y + 1, a.hx, y - 12, a.hx + w * 0.5, y + 1, a.hx + w, y - 6, a.hx + w, y + 8], color, { lw: 2.5, cel: true, celOffset: 1.5 });
  circle(c, a.hx, y + 2, 3, gem, { lw: 1.2 });
}

/** 군주의 왕관: 4천왕 금관과 다른 모양 — 높은 보라 가시 다섯 + 가운데 가시 끝 별빛 (가장 높은 계급) */
function lordCrown(c: Ctx, a: Anchor): void {
  const w = Math.max(16, a.hr * 1.05);
  const y = a.hy - a.hr * 0.95;
  glow(c, a.hx, y - 2, 16, '#C08BFF', 0.7);
  const pts = [a.hx - w, y + 8];
  for (let i = 0; i <= 4; i++) {
    const x = a.hx - w + (i * w) / 2;
    const h = i === 2 ? 17 : i % 2 ? 13 : 10;
    pts.push(x - (i === 0 ? 0 : 3), y, x, y - h, x + (i === 4 ? 0 : 3), y);
  }
  pts.push(a.hx + w, y + 8);
  poly(c, pts, '#8E44FF', { lw: 2.5, cel: true, celOffset: 1.5 });
  stroke(c, [a.hx - w + 2, y + 5, a.hx + w - 2, y + 5], '#E8C9FF', 2);
  for (const dx of [-w * 0.5, 0, w * 0.5]) circle(c, a.hx + dx, y + 2, 2.4, '#FFE27A', { lw: 1 });
  // 가운데 가시 끝의 별빛
  glow(c, a.hx, y - 17, 6, '#FFFFFF', 0.9);
  sparkle(c, a.hx, y - 17, 5.5, '#FFFFFF');
}

function noxSigil(c: Ctx, x: number, y: number, r: number, legion: string): void {
  poly(c, [x, y - r, x + r * 0.75, y, x, y + r, x - r * 0.75, y], legion, { lw: 2 });
  circle(c, x, y, r * 0.3, '#100C18', { lw: 0 });
}

/** 적 한 마리 (128×128 단위, 원점 = 왼쪽 위). legionColor = enemies.json 군단 색 (군주 직속은 보라). */
export function drawEnemy(c: Ctx, look: EnemyLook, legionColor: string): void {
  const a = CREATURE_ANCHORS[look.creature];
  const e: EnemyCtx = { c, body: look.colors[0] ?? '#888888', accent: look.colors[1] ?? '#CCCCCC', legion: legionColor, eye: look.eyes === 'red' ? RED_EYE : NOX_EYE };
  const rank: RankId = look.rank;
  // 뒤쪽 계급 장식
  if (rank === 'captain') {
    glow(c, 64, 72, 62, legionColor, 0.35);
    legionFlag(c, a.hx - a.hr - 8, a.hy - 4, legionColor);
  } else if (rank === 'commander') {
    glow(c, 64, 68, 66, legionColor, 0.6);
    c.save();
    c.translate(64, 112);
    c.scale(1, 0.3);
    circle(c, 0, 0, 52, null, { lw: 5, stroke: legionColor });
    paint(c, P.star(0, 0, 44, 6, 0.55), null, { lw: 3, stroke: legionColor });
    c.restore();
  } else if (rank === 'lord') {
    // 군주 (검토 반영: 어두운 배경에서 오라·망토가 사라져 4천왕보다 초라했다):
    // 밝은 보라 테의 오라 + 4천왕보다 큰 이중 바닥 문양 + 보라 테두리 빛이 도는 별빛 망토
    glow(c, 64, 66, 64, '#B36BFF', 0.55);
    glow(c, 64, 66, 52, '#2A0D4A', 0.9);
    c.save();
    c.translate(64, 112);
    c.scale(1, 0.3);
    circle(c, 0, 0, 60, null, { lw: 6, stroke: '#C08BFF' });
    circle(c, 0, 0, 50, null, { lw: 3, stroke: '#E8C9FF' });
    paint(c, P.star(0, 0, 50, 8, 0.6), null, { lw: 3, stroke: '#C08BFF' });
    c.restore();
    const cape = P.poly([24, 116, 38, 44, 90, 44, 104, 116, 64, 106]);
    paint(c, cape, '#1A1240', { cel: true, celOffset: 4, stroke: '#C08BFF' });
    stroke(c, [26, 112, 38, 48], '#E8C9FF', 2, 0.8);
    stroke(c, [102, 112, 90, 48], '#E8C9FF', 2, 0.8);
    for (let i = 0; i < 10; i++) sparkle(c, 32 + ((i * 41) % 64), 56 + ((i * 29) % 54), i % 3 ? 3 : 4.5, i % 2 ? '#FFFFFF' : '#E8C9FF');
    stroke(c, [26, 114, 64, 104, 102, 114], '#C08BFF', 3);
  }
  CREATURE_DRAW[look.creature](e);
  // 앞쪽 계급 장식
  if (rank === 'minion') noxSigil(c, a.hx, a.hy - a.hr * 0.62, Math.max(5, a.hr * 0.24), legionColor);
  else if (rank === 'captain') silverHorns(c, a);
  else if (rank === 'commander') goldCrown(c, a, '#F5C518', legionColor);
  else if (rank === 'lord') lordCrown(c, a);
}
