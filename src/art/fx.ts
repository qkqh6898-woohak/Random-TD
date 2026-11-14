/**
 * 연출용 작은 텍스처 (절차 생성, 한 번 굽기): 화살·마법구·동전·빛 기둥·불꽃.
 * 색·모양은 화면 표현 상수라 코드에 둔다.
 */
import Phaser from 'phaser';
import { COLORS, hexToInt } from './palette';

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
