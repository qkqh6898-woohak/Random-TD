/**
 * 연출용 작은 텍스처 (절차 생성, 한 번 굽기): 화살·마법구·동전·빛 기둥·불꽃.
 * 색·모양은 화면 표현 상수라 코드에 둔다.
 */
import Phaser from 'phaser';
import type { Grade } from '../data/load';
import { COLORS, GRADE_COLORS, hexToInt } from './palette';

const OUTLINE = hexToInt(COLORS.outline);

export const TEX_ARROW = 'fx-arrow';
export const TEX_ORB = 'fx-orb';
export const TEX_COIN = 'fx-coin';
export const TEX_PILLAR = 'fx-pillar';
export const TEX_SPARK = 'fx-spark';

/** 화살: 오른쪽(+x)을 향한 64×16 */
function bakeArrow(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.lineStyle(4, 0x7a4f2a, 1);
  g.lineBetween(6, 8, 50, 8);
  g.fillStyle(0xe8edf2, 1);
  g.fillTriangle(48, 2, 62, 8, 48, 14);
  g.lineStyle(2, OUTLINE, 1);
  g.strokeTriangle(48, 2, 62, 8, 48, 14);
  g.fillStyle(0xf5f0e0, 1);
  g.fillTriangle(2, 2, 12, 8, 2, 14);
  g.generateTexture(TEX_ARROW, 64, 16);
  g.destroy();
}

/** 마법구: 흰 바탕 둥근 빛 48×48 (색은 tint로) */
function bakeOrb(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  for (let r = 24; r > 0; r -= 3) {
    g.fillStyle(0xffffff, 0.12 + (1 - r / 24) * 0.6);
    g.fillCircle(24, 24, r);
  }
  g.fillStyle(0xffffff, 1);
  g.fillCircle(24, 24, 7);
  g.generateTexture(TEX_ORB, 48, 48);
  g.destroy();
}

/** 동전: 금색 원 + 테두리 + '원' 자리 무늬 48×48 */
function bakeCoin(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xb07d00, 1);
  g.fillCircle(24, 26, 20);
  g.fillStyle(hexToInt(COLORS.gold), 1);
  g.fillCircle(24, 23, 20);
  g.lineStyle(3, OUTLINE, 1);
  g.strokeCircle(24, 23, 20);
  g.lineStyle(3, 0xfff1b0, 1);
  g.strokeCircle(24, 23, 13);
  g.fillStyle(0xfff6cc, 1);
  g.fillRect(21, 14, 6, 18);
  g.generateTexture(TEX_COIN, 48, 50);
  g.destroy();
}

/** 빛 기둥: 아래가 밝고 위로 사라지는 세로 막대 64×256 (색은 tint로) */
function bakePillar(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const steps = 32;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * 0.85;
    g.fillStyle(0xffffff, a);
    g.fillRect(8, 256 - (i + 1) * 8, 48, 8);
  }
  g.fillStyle(0xffffff, 0.9);
  g.fillEllipse(32, 248, 64, 16);
  g.generateTexture(TEX_PILLAR, 64, 256);
  g.destroy();
}

/** 맞은 자리 불꽃: 네 갈래 별 32×32 */
function bakeSpark(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1);
  g.fillTriangle(16, 0, 19, 16, 13, 16);
  g.fillTriangle(16, 32, 19, 16, 13, 16);
  g.fillTriangle(0, 16, 16, 13, 16, 19);
  g.fillTriangle(32, 16, 16, 13, 16, 19);
  g.fillCircle(16, 16, 5);
  g.generateTexture(TEX_SPARK, 32, 32);
  g.destroy();
}

/** 연출 텍스처를 모두 준비 (이미 있으면 건너뜀). */
export function ensureFxTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(TEX_ARROW)) bakeArrow(scene);
  if (!scene.textures.exists(TEX_ORB)) bakeOrb(scene);
  if (!scene.textures.exists(TEX_COIN)) bakeCoin(scene);
  if (!scene.textures.exists(TEX_PILLAR)) bakePillar(scene);
  if (!scene.textures.exists(TEX_SPARK)) bakeSpark(scene);
}

// ---------------------------------------------------------------------------
// G-2 소환·승급 연출 (주사위 대신 캐릭터 위주): 소환문 고리 · 빛 터짐 · 초상 카드(뒷면·등급 테) · 등급 별
// ---------------------------------------------------------------------------

export const TEX_PORTAL = 'fx-portal';
export const TEX_BURST = 'fx-burst';
export const TEX_CARD_BACK = 'fx-card-back';
export const TEX_GRADE_STAR = 'fx-grade-star';
/** 초상 카드 크기 (텍스처 px): 바깥 96×128, 초상 창 = CARD_WINDOW */
export const CARD_TEX = { w: 96, h: 128 } as const;
export const CARD_WINDOW = { x: 10, y: 10, w: 76, h: 88 } as const;

/** 등급 카드 앞면 배경·테 텍스처 키 */
export function cardFaceKey(grade: Grade): string {
  return `fx-card-face-${grade}`;
}
export function cardRimKey(grade: Grade): string {
  return `fx-card-rim-${grade}`;
}

function canvasTex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  const c = tex?.getContext();
  if (!tex || !c) return;
  draw(c);
  tex.refresh();
}

function rrect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

function starPath(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, inner = 0.45): void {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * inner;
    if (i === 0) c.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    else c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  c.closePath();
}

const RAINBOW = ['#ff6b6b', '#ffb347', '#ffe66d', '#7ee081', '#6ec6ff', '#a78bfa', '#ff8ad8'];

/** 등급 테 색 (신 = 무지개 그라데이션, 신화(hidden) = 금) */
function gradeStroke(c: CanvasRenderingContext2D, grade: Grade, w: number): string | CanvasGradient {
  if (grade === 'god') {
    const g = c.createLinearGradient(0, 0, w, w);
    RAINBOW.forEach((col, i) => g.addColorStop(i / (RAINBOW.length - 1), col));
    return g;
  }
  if (grade === 'hidden') return '#f1c40f';
  return GRADE_COLORS[grade];
}

/** 소환문: 흰 룬 고리 256×256 (가로로 눕혀 그리고 색은 tint로) */
function bakePortal(scene: Phaser.Scene): void {
  canvasTex(scene, TEX_PORTAL, 256, 256, (c) => {
    c.translate(128, 128);
    const glow = c.createRadialGradient(0, 0, 40, 0, 0, 126);
    glow.addColorStop(0, 'rgba(255,255,255,0.0)');
    glow.addColorStop(0.62, 'rgba(255,255,255,0.35)');
    glow.addColorStop(0.8, 'rgba(255,255,255,0.08)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = glow;
    c.beginPath();
    c.arc(0, 0, 126, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#ffffff';
    c.lineWidth = 7;
    c.beginPath();
    c.arc(0, 0, 104, 0, Math.PI * 2);
    c.stroke();
    c.lineWidth = 3;
    c.beginPath();
    c.arc(0, 0, 82, 0, Math.PI * 2);
    c.stroke();
    // 룬 눈금 + 여섯 꼭짓점 별 (돌면 고리가 도는 게 보이게)
    for (let i = 0; i < 24; i++) {
      const a = (i * Math.PI) / 12;
      const r0 = i % 2 === 0 ? 86 : 90;
      c.lineWidth = i % 2 === 0 ? 5 : 3;
      c.beginPath();
      c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      c.lineTo(Math.cos(a) * 100, Math.sin(a) * 100);
      c.stroke();
    }
    c.lineWidth = 3;
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 - Math.PI / 2;
      const b = a + (Math.PI * 2) / 3;
      c.moveTo(Math.cos(a) * 78, Math.sin(a) * 78);
      c.lineTo(Math.cos(b) * 78, Math.sin(b) * 78);
    }
    c.stroke();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 + Math.PI / 6;
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.arc(Math.cos(a) * 116, Math.sin(a) * 116, 6, 0, Math.PI * 2);
      c.fill();
    }
  });
}

/** 빛 터짐: 가운데에서 뻗는 빛살 16개 192×192 (흰색, tint + 더하기 섞기) */
function bakeBurst(scene: Phaser.Scene): void {
  canvasTex(scene, TEX_BURST, 192, 192, (c) => {
    c.translate(96, 96);
    const core = c.createRadialGradient(0, 0, 0, 0, 0, 60);
    core.addColorStop(0, 'rgba(255,255,255,0.95)');
    core.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = core;
    c.beginPath();
    c.arc(0, 0, 60, 0, Math.PI * 2);
    c.fill();
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8;
      const len = i % 2 === 0 ? 94 : 66;
      const g = c.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(Math.cos(a - 0.09) * 10, Math.sin(a - 0.09) * 10);
      c.lineTo(Math.cos(a) * len, Math.sin(a) * len);
      c.lineTo(Math.cos(a + 0.09) * 10, Math.sin(a + 0.09) * 10);
      c.closePath();
      c.fill();
    }
  });
}

/** 카드 뒷면: 짙은 호두나무 + 금테 + 가운데 소환문 문양 (96×128) */
function bakeCardBack(scene: Phaser.Scene): void {
  canvasTex(scene, TEX_CARD_BACK, CARD_TEX.w, CARD_TEX.h, (c) => {
    rrect(c, 2, 2, 92, 124, 12);
    const bg = c.createLinearGradient(0, 0, 0, 128);
    bg.addColorStop(0, '#5a3822');
    bg.addColorStop(1, '#24150c');
    c.fillStyle = bg;
    c.fill();
    c.lineWidth = 4;
    c.strokeStyle = '#e8b64a';
    c.stroke();
    rrect(c, 9, 9, 78, 110, 8);
    c.lineWidth = 1.5;
    c.strokeStyle = 'rgba(255,231,163,0.7)';
    c.stroke();
    c.translate(48, 64);
    c.strokeStyle = '#ffe7a3';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(0, 0, 24, 0, Math.PI * 2);
    c.stroke();
    starPath(c, 0, 0, 16, 0.42);
    c.fillStyle = '#e8b64a';
    c.fill();
    c.lineWidth = 1.5;
    c.strokeStyle = '#2a170c';
    c.stroke();
  });
}

/** 카드 앞면 바탕 (등급 색 은은한 빛 + 초상 창 배경) */
function bakeCardFace(scene: Phaser.Scene, grade: Grade): void {
  canvasTex(scene, cardFaceKey(grade), CARD_TEX.w, CARD_TEX.h, (c) => {
    const base = grade === 'god' ? '#ffffff' : grade === 'hidden' ? '#3a3a52' : GRADE_COLORS[grade];
    rrect(c, 2, 2, 92, 124, 12);
    c.fillStyle = '#1b120c';
    c.fill();
    const w = CARD_WINDOW;
    const g = c.createRadialGradient(48, w.y + w.h * 0.45, 6, 48, w.y + w.h * 0.45, 64);
    g.addColorStop(0, '#fff6dc');
    g.addColorStop(0.35, base);
    g.addColorStop(1, '#140d08');
    rrect(c, w.x, w.y, w.w, w.h, 6);
    c.fillStyle = g;
    c.fill();
  });
}

/** 카드 앞면 테 (초상 위에 덮음): 등급 색 굵은 테 + 금 안쪽 줄 + 아래 이름 띠 자리 (별 = 등급) */
function bakeCardRim(scene: Phaser.Scene, grade: Grade, stars: number): void {
  canvasTex(scene, cardRimKey(grade), CARD_TEX.w, CARD_TEX.h, (c) => {
    const w = CARD_WINDOW;
    // 테: 바깥 둥근 사각형에서 초상 창을 뺀 영역
    c.beginPath();
    c.roundRect(2, 2, 92, 124, 12);
    c.roundRect(w.x, w.y, w.w, w.h, 6);
    c.fillStyle = '#2a170c';
    c.fill('evenodd');
    rrect(c, 2, 2, 92, 124, 12);
    c.lineWidth = 5;
    c.strokeStyle = gradeStroke(c, grade, 96);
    c.stroke();
    rrect(c, w.x, w.y, w.w, w.h, 6);
    c.lineWidth = 2;
    c.strokeStyle = '#e8b64a';
    c.stroke();
    // 아래 띠: 등급 별
    const n = Math.max(1, Math.min(5, stars));
    const r = n > 3 ? 6.5 : 7.5;
    const gap = n > 3 ? 14 : 17;
    for (let i = 0; i < n; i++) {
      starPath(c, 48 + (i - (n - 1) / 2) * gap, 112, r);
      c.fillStyle = grade === 'god' ? gradeStroke(c, grade, 96) : '#ffd84a';
      c.fill();
      c.lineWidth = 1.4;
      c.strokeStyle = '#2a170c';
      c.stroke();
    }
  });
}

/** 등급 별 (승급 연출에서 튀어 오름, 48×48 금별) */
function bakeGradeStar(scene: Phaser.Scene): void {
  canvasTex(scene, TEX_GRADE_STAR, 48, 48, (c) => {
    const g = c.createRadialGradient(24, 24, 2, 24, 24, 24);
    g.addColorStop(0, 'rgba(255,240,180,0.9)');
    g.addColorStop(1, 'rgba(255,240,180,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 48, 48);
    starPath(c, 24, 25, 17);
    c.fillStyle = '#ffd84a';
    c.fill();
    c.lineWidth = 2.5;
    c.strokeStyle = '#2a170c';
    c.stroke();
    starPath(c, 21, 21, 6.5);
    c.fillStyle = 'rgba(255,255,255,0.8)';
    c.fill();
  });
}

/** G-2 소환·승급 연출 텍스처 (등급 카드 포함). 이미 있으면 건너뜀 */
export function ensureSummonFxTextures(scene: Phaser.Scene, grade: Grade, stars: number): void {
  bakePortal(scene);
  bakeBurst(scene);
  bakeCardBack(scene);
  bakeGradeStar(scene);
  bakeCardFace(scene, grade);
  bakeCardRim(scene, grade, stars);
}
