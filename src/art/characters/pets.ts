/**
 * 동반자 라이브러리 (10종, Canvas 2D). 원점 = 동반자 자리 (rig.PET_ANCHORS — 땅 위 동물은 발밑, 드론·정령은 떠 있는 중심).
 * 동반자는 따로 움직인다 (idle.ts: 깡총·맴돌기·꼬리 흔들기·떠올랐다 내려오기).
 */
import { OUTLINE, blob, circle, ellipse, flame, glow, line, poly, rrect, shade, shine, skullIcon, sparkle, stroke, type Ctx } from './cv';
import type { PetId } from './library';

function dog(c: Ctx, x: number, s: number, armored: boolean): void {
  const fur = '#C98A4A';
  const dark = '#3A2A20';
  c.save();
  c.translate(x, 0);
  c.scale(s, s);
  // 꼬리
  line(c, [-30, -34, -44, -50, -40, -62], fur, 8);
  // 몸 (앉은 자세)
  blob(c, [-30, -6, -32, -36, -14, -48, 10, -46, 20, -20, 14, -2], fur, { cel: true, celOffset: 4 });
  blob(c, [-24, -30, -10, -44, 8, -42, 0, -26], dark, { lw: 0 });
  if (armored) {
    rrect(c, -26, -40, 40, 22, 6, '#5E6B33', { lw: 3.5 });
    rrect(c, -12, -36, 12, 8, 2, '#4A5058', { lw: 2 });
  }
  // 다리
  rrect(c, 4, -18, 10, 18, 4, fur, { lw: 3 });
  rrect(c, -22, -12, 12, 12, 4, fur, { lw: 3 });
  // 머리
  blob(c, [8, -46, 12, -66, 26, -72, 40, -62, 44, -50, 30, -40], fur, { cel: true, celOffset: 3 });
  poly(c, [14, -64, 14, -86, 26, -70], dark, { lw: 3 });
  poly(c, [28, -70, 36, -88, 38, -66], dark, { lw: 3 });
  ellipse(c, 42, -52, 8, 6, '#E8C9A0', { lw: 2.5 });
  circle(c, 48, -54, 3.5, OUTLINE, { lw: 0 });
  circle(c, 30, -60, 3, OUTLINE, { lw: 0 });
  circle(c, 31, -61, 1, '#FFFFFF', { lw: 0 });
  blob(c, [38, -44, 44, -44, 42, -36], '#FF7A8A', { lw: 2 });
  c.restore();
}

function drone(c: Ctx, x: number, y: number, s: number): void {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  for (const dx of [-26, 26]) {
    stroke(c, [0, 0, dx, -8], '#3A3F44', 4);
    ellipse(c, dx, -12, 18, 4, 'rgba(200,220,230,0.7)', { lw: 2.5 });
    circle(c, dx, -10, 3, '#3A3F44', { lw: 0 });
  }
  rrect(c, -16, -8, 32, 16, 6, '#5E6B33', { lw: 3.5 });
  circle(c, 0, 10, 6, '#2A2E33', { lw: 2.5 });
  circle(c, 0, 10, 2.5, '#FF5A4E', { lw: 0 });
  glow(c, 0, 10, 10, '#FF5A4E', 0.5);
  c.restore();
}

function spirit(c: Ctx, x: number, y: number, s: number, color = '#B36BFF'): void {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  glow(c, 0, 0, 34, color, 0.6);
  blob(c, [0, -22, 16, -10, 16, 8, 6, 18, 2, 30, -4, 18, -16, 8, -16, -10], shade(color, 0.35), { lw: 3, stroke: shade(color, -0.4) });
  circle(c, -5, -2, 3, '#2A1A3A', { lw: 0 });
  circle(c, 6, -2, 3, '#2A1A3A', { lw: 0 });
  sparkle(c, 12, -18, 5);
  c.restore();
}

function babyDragon(c: Ctx): void {
  const col = '#FF8A5B';
  // 날개
  poly(c, [-6, -26, -30, -52, -28, -30, -40, -26, -16, -16], shade(col, -0.2), { lw: 3 });
  // 꼬리
  line(c, [-12, -6, -32, 0, -38, -10], col, 7);
  poly(c, [-38, -10, -46, -16, -40, -2], '#FFE27A', { lw: 2 });
  // 몸
  blob(c, [-14, -4, -16, -24, 0, -32, 14, -22, 12, -2], col, { cel: true, celOffset: 3 });
  ellipse(c, 0, -12, 7, 8, '#FFE2A8', { lw: 0 });
  // 머리
  blob(c, [4, -30, 6, -46, 20, -52, 34, -44, 32, -32, 18, -26], col, { cel: true, celOffset: 3 });
  poly(c, [10, -48, 6, -62, 16, -50], '#F3EAD3', { lw: 2.5 });
  poly(c, [20, -50, 22, -64, 28, -50], '#F3EAD3', { lw: 2.5 });
  circle(c, 24, -40, 4, OUTLINE, { lw: 0 });
  circle(c, 25, -41, 1.5, '#FFFFFF', { lw: 0 });
  circle(c, 33, -36, 1.5, OUTLINE, { lw: 0 });
  flame(c, 42, -38, 4, '#FF9A2F', '#FFE27A');
}

function mudSpirit(c: Ctx): void {
  glow(c, 0, -24, 40, '#C9A060', 0.5);
  blob(c, [-26, 0, -28, -26, -12, -46, 8, -48, 26, -30, 26, 0], '#8B6A3E', { cel: true, celOffset: 4 });
  circle(c, -8, -26, 5, '#FFE27A', { lw: 2 });
  circle(c, 10, -26, 5, '#FFE27A', { lw: 2 });
  stroke(c, [-8, -12, 2, -8, 10, -12], OUTLINE, 3);
  line(c, [0, -48, 2, -60], '#5DBB63', 3);
  ellipse(c, 8, -62, 8, 4, '#7ED957', { lw: 2 }, -0.4);
}

function miniGoblin(c: Ctx, x: number, s: number): void {
  c.save();
  c.translate(x, 0);
  c.scale(s, s);
  const skin = '#9DCB5E';
  rrect(c, -10, -24, 20, 22, 6, '#7A5230', { lw: 3 });
  for (const sx of [-1, 1]) line(c, [sx * 8, -20, sx * 18, -38], skin, 6);
  for (const sx of [-1, 1]) poly(c, [sx * 12, -42, sx * 30, -50, sx * 14, -34], skin, { lw: 2.5 });
  circle(c, 0, -38, 14, skin, { lw: 3, cel: true, celOffset: 2 });
  for (const sx of [-1, 1]) circle(c, sx * 5, -40, 2.5, '#2A2A10', { lw: 0 });
  blob(c, [-6, -32, 6, -32, 0, -26], '#7A2A2A', { lw: 2 });
  c.restore();
}

function miniSkeleton(c: Ctx, x: number, s: number): void {
  c.save();
  c.translate(x, 0);
  c.scale(s, s);
  const bone = '#EDE6D6';
  for (const sx of [-1, 1]) line(c, [sx * 5, -16, sx * 7, 0], bone, 4);
  rrect(c, -9, -32, 18, 18, 4, bone, { lw: 3 });
  for (let i = 0; i < 3; i++) stroke(c, [-7, -28 + i * 5, 7, -28 + i * 5], '#9A9080', 1.5);
  for (const sx of [-1, 1]) line(c, [sx * 9, -28, sx * 16, -16], bone, 4);
  skullIcon(c, 0, -44, 11, bone);
  for (const sx of [-1, 1]) circle(c, sx * 4, -43, 1.8, '#7ED957', { lw: 0 });
  c.restore();
}

type PetDraw = (c: Ctx) => void;

export const PET_DRAW: Readonly<Record<PetId, PetDraw>> = {
  none: () => {},
  dog: (c) => dog(c, 0, 1, false),
  dogs_armored: (c) => {
    dog(c, -18, 0.85, true);
    dog(c, 12, 1, true);
  },
  drone: (c) => drone(c, 0, 0, 1),
  drones2: (c) => {
    drone(c, -18, 14, 0.8);
    drone(c, 22, -14, 0.9);
  },
  spirit: (c) => spirit(c, 0, 0, 1),
  spirits2: (c) => {
    spirit(c, -14, 12, 0.85);
    spirit(c, 18, -14, 0.85, '#5EE0FF');
  },
  baby_dragon: babyDragon,
  mud_spirit: mudSpirit,
  goblins: (c) => {
    miniGoblin(c, -26, 0.9);
    miniGoblin(c, 14, 1);
  },
  skeletons: (c) => {
    miniSkeleton(c, -24, 0.9);
    miniSkeleton(c, 14, 1.05);
  },
};

export function drawPetPart(c: Ctx, pet: PetId): void {
  PET_DRAW[pet](c);
  void shine;
}
