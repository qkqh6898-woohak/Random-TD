/**
 * 인물 상반신 초상 (조언자 7명·부관 미오·총지휘관, 대화 상자용 — M11b 대화 UI가 쓴다). Canvas 2D.
 * 상자 200×220 단위, 원점 = 왼쪽 위. 표정 3종(보통·화남·웃음, ART.md 1.3).
 */
import { OUTLINE, P, blob, circle, ellipse, glow, line, paint, poly, rrect, shade, shine, sparkle, stroke, type Ctx } from './cv';
import { BACK_DRAW } from './back';
import { drawHead, type HeadCtx } from './head';
import type { FaceId } from './library';
import type { HumanLook } from './looks';
import { BODY_SPECS, PORTRAIT_BOX } from './rig';

export type Expression = 'normal' | 'angry' | 'happy';
export const EXPRESSIONS: readonly Expression[] = ['normal', 'angry', 'happy'];

const HX = 100;
const HY = 94;
const HR = 64;

function faceFor(look: HumanLook, ex: Expression): FaceId {
  if (ex === 'angry') return 'angry';
  if (ex === 'happy') return 'cheer';
  return look.face;
}

function shoulders(c: Ctx, look: HumanLook): void {
  const main = look.colors[0] ?? '#888888';
  const second = look.colors[1] ?? '#CCCCCC';
  const top = 150;
  const path = P.blob([10, 222, 16, top + 30, 50, top + 4, 100, top - 2, 150, top + 4, 184, top + 30, 190, 222]);
  switch (look.outfit) {
    case 'armor':
      paint(c, path, '#C9D3DE', { cel: true, celOffset: 6 });
      for (const s of [-1, 1]) ellipse(c, 100 + s * 66, top + 24, 26, 17, '#B8C2CC', { cel: true, celOffset: 3 });
      paint(c, P.poly([70, top + 10, 130, top + 10, 120, 222, 80, 222]), second, { lw: 4 });
      break;
    case 'coat':
      paint(c, path, main, { cel: true, celOffset: 6 });
      poly(c, [86, top, 114, top, 104, 222, 96, 222], second, { lw: 3 });
      for (const s of [-1, 1]) poly(c, [100 + s * 14, top, 100 + s * 50, top + 6, 100 + s * 20, top + 50], shade(main, -0.15), { lw: 3 });
      for (let i = 0; i < 2; i++) circle(c, 82, top + 40 + i * 18, 3, '#F5C518', { lw: 1.5 });
      break;
    case 'apron':
      paint(c, path, main, { cel: true, celOffset: 6 });
      paint(c, P.rrect(58, top + 20, 84, 80, 12), second, { lw: 4 });
      break;
    case 'fur':
      paint(c, path, look.skin, { cel: true, celOffset: 6 });
      paint(c, P.poly([60, 222, 70, top + 30, 130, top + 30, 140, 222]), main, { lw: 4 });
      break;
    case 'dress':
      paint(c, path, main, { cel: true, celOffset: 6 });
      paint(c, P.poly([70, top + 6, 130, top + 6, 100, top + 44]), second, { lw: 3 });
      break;
    default:
      paint(c, path, main, { cel: true, celOffset: 6 });
      poly(c, [84, top, 116, top, 100, top + 26], look.skin, { lw: 3 });
  }
}

function itemFront(c: Ctx, look: HumanLook): void {
  switch (look.item) {
    case 'tablet':
      rrect(c, 120, 168, 50, 40, 6, '#2F3338', { lw: 4 });
      rrect(c, 125, 173, 40, 30, 3, '#5EE0FF', { lw: 0 });
      for (let i = 0; i < 3; i++) stroke(c, [130, 180 + i * 8, 156 - i * 6, 180 + i * 8], '#FFFFFF', 2.5, 0.8);
      circle(c, 122, 196, 11, look.skin, { lw: 4 });
      break;
    case 'hammer':
      line(c, [150, 222, 172, 140], '#6B4226', 9);
      paint(c, P.rrect(150, 118, 46, 28, 6), '#7A808A', { cel: true, celOffset: 3 });
      break;
    case 'fur_mantle':
      blob(c, [6, 200, 14, 156, 52, 140, 100, 150, 148, 140, 186, 156, 194, 200, 160, 178, 100, 172, 40, 178], '#8B6B4A', { cel: true, celOffset: 5 });
      for (let i = 0; i < 6; i++) poly(c, [30 + i * 28, 170, 36 + i * 28, 186, 42 + i * 28, 170], '#F3EAD3', { lw: 2 });
      break;
    case 'crystal_tiara':
      glow(c, HX, HY - HR * 0.9, 40, '#B36BFF', 0.5);
      stroke(c, [56, 150, 100, 170, 144, 150], '#B36BFF', 4);
      poly(c, [100, 164, 108, 176, 100, 190, 92, 176], '#B36BFF', { lw: 2.5 });
      break;
    case 'baton':
      line(c, [150, 222, 176, 156], '#1E1E2A', 7);
      circle(c, 178, 152, 7, '#F1C40F', { lw: 2.5 });
      circle(c, 148, 206, 12, look.skin, { lw: 4 });
      // 일곱 종족 문양 (망토 깃)
      ['#6B7A3A', '#2E5AAC', '#A0522D', '#3A9D5D', '#5B3A8C', '#B23A2E', '#E58FC4'].forEach((col, i) => circle(c, 46 + i * 18, 214 - Math.sin((i / 6) * Math.PI) * 8, 5, col, { lw: 1.5 }));
      break;
    case 'sword':
      line(c, [36, 210, 24, 150], '#5A3A22', 7);
      rrect(c, 10, 144, 30, 8, 3, '#F5C518', { lw: 3 });
      break;
    default:
      break;
  }
}

function itemBack(c: Ctx, look: HumanLook): void {
  switch (look.item) {
    case 'golden_bow':
      // 오른쪽 어깨 너머로 보이는 금빛 장궁
      c.save();
      c.lineCap = 'round';
      for (const [col, w] of [
        [OUTLINE, 12],
        ['#F5C518', 7],
      ] as const) {
        c.strokeStyle = col;
        c.lineWidth = w;
        c.beginPath();
        c.arc(118, 128, 76, -1.25, 1.0);
        c.stroke();
      }
      c.restore();
      stroke(c, [118 + 76 * Math.cos(-1.25), 128 + 76 * Math.sin(-1.25), 118 + 76 * Math.cos(1.0), 128 + 76 * Math.sin(1.0)], '#FFF3A8', 2.5);
      sparkle(c, 186, 96, 7, '#FFE27A');
      break;
    case 'sword':
      line(c, [24, 150, 10, 40], '#DDE6F0', 12);
      break;
    case 'butterfly':
      // 나비 날개: 양갈래 머리 바깥으로 크게 (검토 반영: 머리카락 뒤에 숨어 끝만 보였다)
      for (const s of [-1, 1]) {
        blob(c, [HX + s * 44, 140, HX + s * 70, 34, HX + s * 108, 18, HX + s * 116, 92, HX + s * 86, 148], s < 0 ? '#FF9ED2' : '#8FD8FF', { cel: true, celOffset: 4, alpha: 0.9 });
        blob(c, [HX + s * 44, 158, HX + s * 92, 160, HX + s * 104, 204, HX + s * 60, 214], s < 0 ? '#8FD8FF' : '#FF9ED2', { cel: true, celOffset: 3, alpha: 0.9 });
        circle(c, HX + s * 92, 66, 10, '#FFFFFF', { lw: 0, alpha: 0.75 });
        circle(c, HX + s * 80, 184, 7, '#FFFFFF', { lw: 0, alpha: 0.65 });
      }
      for (let i = 0; i < 5; i++) sparkle(c, 20 + i * 40, 30 + ((i * 37) % 60), 5, '#FFFFFF');
      break;
    default:
      break;
  }
}

/** 부관 미오: 동그란 하얀 드론, LED 눈 (표정에 따라 모양이 바뀐다) */
function drawMio(c: Ctx, ex: Expression): void {
  const cx = 100;
  const cy = 112;
  glow(c, cx, cy + 70, 70, '#6BD5FF', 0.35);
  for (const s of [-1, 1]) {
    line(c, [cx + s * 56, cy - 20, cx + s * 82, cy - 40], '#C9D3DE', 6);
    ellipse(c, cx + s * 84, cy - 46, 26, 6, 'rgba(200,230,255,0.7)', { lw: 3 });
  }
  paint(c, P.circle(cx, cy, 66), '#F4F7FA', { cel: true, celOffset: 9 });
  rrect(c, cx - 46, cy - 24, 92, 50, 22, '#1E2A3A', { lw: 4 });
  const led = ex === 'angry' ? '#FF5A4E' : '#6BD5FF';
  glow(c, cx, cy, 50, led, 0.35);
  for (const s of [-1, 1]) {
    if (ex === 'happy') stroke(c, [cx + s * 20 - 10, cy + 4, cx + s * 20, cy - 8, cx + s * 20 + 10, cy + 4], led, 6);
    else if (ex === 'angry') poly(c, [cx + s * 20 - 11, cy - 8 * s * -1 - 4, cx + s * 20 + 11, cy + 4 * s - 2, cx + s * 20 - 9, cy + 8], led, { lw: 0 });
    else ellipse(c, cx + s * 20, cy, 7, 11, led, { lw: 0 });
  }
  stroke(c, [cx - 8, cy + 16, cx, cy + 19, cx + 8, cy + 16], led, 3);
  rrect(c, cx - 10, cy - 76, 20, 12, 4, '#C9D3DE', { lw: 3 });
  circle(c, cx, cy - 82, 6, ex === 'angry' ? '#FF5A4E' : '#7ED957', { lw: 2.5 });
  shine(c, cx - 34, cy - 36, 14, 8, 0.8);
}

/** 초상 하나 (200×220 단위). */
export function drawPortrait(c: Ctx, look: HumanLook, ex: Expression = 'normal'): void {
  // 배경 원 (종족 색)
  glow(c, 100, 110, 120, look.colors[0] ?? '#888888', 0.35);
  if (look.item === 'drone') {
    drawMio(c, ex);
    return;
  }
  if (look.back && look.back !== 'none' && look.item !== 'butterfly') {
    // 망토는 어깨 뒤로
    c.save();
    c.translate(100, 160);
    c.scale(1.25, 1.25);
    BACK_DRAW[look.back]({ c, look, spec: BODY_SPECS.normal, headY: -60, footY: 50, trim: '#F5C518' });
    c.restore();
  }
  itemBack(c, look);
  shoulders(c, look);
  const h: HeadCtx = { c, x: HX, y: HY, r: HR, look: { ...look, face: faceFor(look, ex) }, trim: look.colors[1] ?? '#F5C518' };
  drawHead(h);
  itemFront(c, look);
}

export { PORTRAIT_BOX };
