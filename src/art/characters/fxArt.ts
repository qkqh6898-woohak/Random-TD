/**
 * 떠다니는 작은 입자(21종)와 몸 뒤 오라(12종) 그림 (Canvas 2D). 캐릭터마다 굽지 않고 종류마다 한 번 굽는 공유 텍스처다.
 * 입자: 원점 = 가운데, 반지름 약 12 단위. 오라: 원점 = 가운데, 반지름 r.
 */
import { blob, bolt, circle, clover, coin, flame, glow, note, poly, rainbow, rgba, rrect, snowflake, sparkle, star, type Ctx } from './cv';
import type { AuraId, FxId } from './library';

export const PARTICLE_BOX = 32;

export function drawParticle(c: Ctx, fx: FxId): void {
  switch (fx) {
    case 'dust':
      circle(c, -3, 2, 7, '#C9BFA8', { lw: 0, alpha: 0.85 });
      circle(c, 4, -2, 6, '#DDD3BC', { lw: 0, alpha: 0.85 });
      break;
    case 'notes':
      note(c, -2, 6, 9, '#FFFFFF');
      break;
    case 'smoke':
      circle(c, -3, 2, 8, '#9A7AC0', { lw: 0, alpha: 0.7 });
      circle(c, 4, -3, 7, '#B89AE0', { lw: 0, alpha: 0.7 });
      break;
    case 'coins':
      coin(c, 0, 0, 9);
      break;
    case 'flames':
      flame(c, 0, 4, 7, '#FF7A2F', '#FFE27A');
      break;
    case 'leaves':
      blob(c, [-10, 4, -2, -8, 10, -6, 4, 6], '#7ED957', { lw: 2 });
      break;
    case 'snow':
      snowflake(c, 0, 0, 9);
      break;
    case 'sparks':
      glow(c, 0, 0, 12, '#FFF27A', 0.8);
      sparkle(c, 0, 0, 10, '#FFFDE0');
      break;
    case 'stars':
      glow(c, 0, 0, 12, '#FFE27A', 0.6);
      star(c, 0, 0, 9, '#FFE27A', { lw: 2 });
      break;
    case 'bubbles':
      circle(c, 0, 0, 8, 'rgba(160,240,140,0.55)', { lw: 2.5, stroke: '#3A8A3A' });
      circle(c, -3, -3, 2, '#FFFFFF', { lw: 0 });
      break;
    case 'steam':
      circle(c, -4, 2, 7, '#FFFFFF', { lw: 0, alpha: 0.8 });
      circle(c, 4, -2, 6, '#F0F0F0', { lw: 0, alpha: 0.8 });
      break;
    case 'green_flames':
      flame(c, 0, 4, 7, '#7ED957', '#E8FFD0');
      break;
    case 'petals':
      blob(c, [0, -9, 7, -2, 4, 8, -4, 8, -7, -2], '#FFB7D5', { lw: 2 });
      break;
    case 'lightning':
      bolt(c, -2, -11, 22, '#FFF27A', 3, Math.PI / 2 + 0.2);
      break;
    case 'clover':
      clover(c, 0, -2, 9);
      break;
    case 'fruit':
      circle(c, 0, 2, 8, '#E53935', { lw: 2.5 });
      poly(c, [0, -6, 6, -11, 2, -5], '#7ED957', { lw: 1.5 });
      break;
    case 'gold_fruit':
      glow(c, 0, 0, 13, '#FFE27A', 0.6);
      circle(c, 0, 2, 8, '#F5C518', { lw: 2.5 });
      poly(c, [0, -6, 6, -11, 2, -5], '#7ED957', { lw: 1.5 });
      break;
    case 'confetti':
      rrect(c, -8, -3, 7, 4, 1, '#FF4D6D', { lw: 1 });
      rrect(c, 1, -8, 4, 7, 1, '#3D8BFD', { lw: 1 });
      rrect(c, 0, 3, 7, 4, 1, '#7ED957', { lw: 1 });
      break;
    case 'mist':
      circle(c, -3, 1, 8, '#7ED957', { lw: 0, alpha: 0.5 });
      circle(c, 4, -3, 7, '#B8E986', { lw: 0, alpha: 0.5 });
      break;
    case 'meteors':
      glow(c, 0, 0, 13, '#FF8A2F', 0.7);
      circle(c, 0, 0, 6, '#7A4A3A', { lw: 2 });
      break;
    case 'hearts':
      blob(c, [0, 8, -8, -1, -5, -7, 0, -3, 5, -7, 8, -1], '#FF6B9A', { lw: 2 });
      break;
    case 'none':
      break;
  }
}

/** 오라 색 (glow = 등급 색) */
export function auraColor(aura: AuraId, gradeColor: string): string {
  switch (aura) {
    case 'glow':
      return gradeColor;
    case 'gold':
      return '#FFD24A';
    case 'silver':
      return '#E3ECF5';
    case 'frost':
      return '#9FE8FF';
    case 'flame':
      return '#FF8A2F';
    case 'shadow':
      return '#8A4AD0';
    case 'holy':
      return '#FFF3A8';
    case 'rainbow':
      return '#FFFFFF';
    case 'blackgold':
      return '#F1C40F';
    case 'storm':
      return '#8FD3F4';
    case 'poison':
      return '#9BE36B';
    case 'nox':
      return '#9B4DFF';
    case 'none':
      return '#000000';
  }
}

/** 오라 (몸 뒤 은은한 빛). 무지개는 색 고리를, 흑금은 검은 안쪽 + 금빛 테를 더한다. */
export function drawAura(c: Ctx, aura: AuraId, color: string, r: number): void {
  if (aura === 'none') return;
  if (aura === 'rainbow') {
    glow(c, 0, 0, r, '#FFFFFF', 0.55);
    c.save();
    c.globalAlpha = 0.55;
    c.lineWidth = r * 0.12;
    c.strokeStyle = rainbow(c, -r, -r, r, r);
    c.beginPath();
    c.arc(0, 0, r * 0.78, 0, Math.PI * 2);
    c.stroke();
    c.restore();
    return;
  }
  if (aura === 'blackgold') {
    glow(c, 0, 0, r, '#F1C40F', 0.5);
    glow(c, 0, 0, r * 0.7, '#1E1E2A', 0.45);
    c.save();
    c.globalAlpha = 0.6;
    c.lineWidth = r * 0.05;
    c.strokeStyle = rgba('#F1C40F', 0.9);
    c.beginPath();
    c.arc(0, 0, r * 0.8, 0, Math.PI * 2);
    c.stroke();
    c.restore();
    return;
  }
  glow(c, 0, 0, r, color, 0.6);
}
