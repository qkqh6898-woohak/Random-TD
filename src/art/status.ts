/**
 * 상태 이상·특색 연출용 작은 텍스처 (절차 생성, 한 번 굽기, M3b):
 * 상태 아이콘 9종(32×32), 주사위 눈 1~6(48×48), 소환 병사(64×64), 진흙 웅덩이(128×80).
 * 이모지 글꼴에 기대지 않고 도형으로 그린다 (기기마다 같은 모양). 색·모양은 화면 표현 상수.
 */
import Phaser from 'phaser';
import { COLORS, hexToInt } from './palette';
import type { StatusIcon } from '../view/render/statusModel';

const OUTLINE = hexToInt(COLORS.outline);
export const STATUS_ICON_SIZE = 32;

export function statusIconKey(s: StatusIcon): string {
  return `status-${s}`;
}
export function diceKey(n: number): string {
  return `fx-dice-${n}`;
}
export const TEX_SOLDIER = 'fx-soldier';
export const TEX_PUDDLE = 'fx-puddle';

/** 동그란 바탕 배지 + 그림. */
function badge(g: Phaser.GameObjects.Graphics, color: number): void {
  g.fillStyle(OUTLINE, 0.85);
  g.fillCircle(16, 16, 15);
  g.fillStyle(color, 1);
  g.fillCircle(16, 16, 12.5);
}

function drawIcon(g: Phaser.GameObjects.Graphics, s: StatusIcon): void {
  switch (s) {
    case 'freeze': {
      badge(g, 0x2f7fbf);
      g.lineStyle(3, 0xe6f8ff, 1);
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI) / 3;
        g.lineBetween(16 - Math.cos(a) * 9, 16 - Math.sin(a) * 9, 16 + Math.cos(a) * 9, 16 + Math.sin(a) * 9);
      }
      break;
    }
    case 'stop': {
      badge(g, 0x6b6b80);
      g.lineStyle(2.5, 0xf2f2f8, 1);
      g.strokeCircle(16, 16, 8);
      g.lineBetween(16, 16, 16, 10);
      g.lineBetween(16, 16, 20, 18);
      break;
    }
    case 'stun': {
      badge(g, 0xb8860b);
      g.fillStyle(0xfff3a0, 1);
      const pts: Phaser.Math.Vector2[] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 10 : 4.5;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        pts.push(new Phaser.Math.Vector2(16 + Math.cos(a) * r, 16 + Math.sin(a) * r));
      }
      g.fillPoints(pts, true);
      break;
    }
    case 'slow': {
      badge(g, 0x7a5232);
      g.fillStyle(0xd9b38c, 1);
      g.fillEllipse(16, 21, 18, 7);
      g.fillTriangle(12, 21, 16, 8, 20, 21);
      break;
    }
    case 'burn': {
      badge(g, 0xb4361c);
      g.fillStyle(0xffa23a, 1);
      g.fillTriangle(9, 22, 16, 6, 23, 22);
      g.fillCircle(16, 21, 7);
      g.fillStyle(0xffe08a, 1);
      g.fillCircle(16, 22, 3.5);
      break;
    }
    case 'poison': {
      badge(g, 0x3f7a2a);
      g.fillStyle(0xb4ec8e, 1);
      g.fillCircle(16, 19, 6.5);
      g.fillTriangle(10.5, 17, 16, 7, 21.5, 17);
      break;
    }
    case 'bleed': {
      badge(g, 0x8a1c1c);
      g.fillStyle(0xff6b6b, 1);
      g.fillCircle(16, 19, 6.5);
      g.fillTriangle(10.5, 17, 16, 7, 21.5, 17);
      break;
    }
    case 'mark': {
      badge(g, 0x9c2a2a);
      g.lineStyle(2.5, 0xffd6d6, 1);
      g.strokeCircle(16, 16, 8);
      g.strokeCircle(16, 16, 3.5);
      g.lineBetween(16, 5, 16, 9);
      g.lineBetween(16, 23, 16, 27);
      g.lineBetween(5, 16, 9, 16);
      g.lineBetween(23, 16, 27, 16);
      break;
    }
    case 'vuln': {
      badge(g, 0x6a2d9c);
      g.fillStyle(0xe6c8ff, 1);
      g.fillTriangle(8, 13, 24, 13, 16, 25);
      g.fillRect(13, 6, 6, 8);
      break;
    }
  }
}

/** 주사위 눈 n (1~6): 흰 둥근 네모 + 검은 점. */
function bakeDice(scene: Phaser.Scene, n: number): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(OUTLINE, 1);
  g.fillRoundedRect(2, 2, 44, 44, 9);
  g.fillStyle(0xffffff, 1);
  g.fillRoundedRect(4, 4, 40, 40, 8);
  const P: Record<number, [number, number][]> = {
    1: [[24, 24]],
    2: [[14, 14], [34, 34]],
    3: [[14, 14], [24, 24], [34, 34]],
    4: [[14, 14], [34, 14], [14, 34], [34, 34]],
    5: [[14, 14], [34, 14], [24, 24], [14, 34], [34, 34]],
    6: [[14, 13], [34, 13], [14, 24], [34, 24], [14, 35], [34, 35]],
  };
  g.fillStyle(n === 1 ? 0xd62828 : 0x1d1b2a, 1);
  for (const [x, y] of P[n] ?? []) g.fillCircle(x, y, n === 1 ? 6 : 4.5);
  g.generateTexture(diceKey(n), 48, 48);
  g.destroy();
}

/** 소환 병사: 다크 엘프 보라 망토의 작은 검사 (64×64, 오른쪽을 봄). */
function bakeSoldier(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0x000000, 0.25);
  g.fillEllipse(32, 58, 30, 8);
  // 몸·망토
  g.fillStyle(OUTLINE, 1);
  g.fillRoundedRect(19, 27, 26, 28, 9);
  g.fillStyle(0x5b3a8c, 1);
  g.fillRoundedRect(21, 29, 22, 24, 8);
  // 머리
  g.fillStyle(OUTLINE, 1);
  g.fillCircle(32, 20, 13);
  g.fillStyle(0xc9b6e8, 1);
  g.fillCircle(32, 20, 11);
  // 투구 깃·눈
  g.fillStyle(0x8e5ec7, 1);
  g.fillTriangle(22, 14, 32, 3, 42, 14);
  g.fillStyle(OUTLINE, 1);
  g.fillCircle(36, 21, 2.2);
  // 검
  g.lineStyle(4, OUTLINE, 1);
  g.lineBetween(42, 44, 58, 22);
  g.lineStyle(2.5, 0xe8edf2, 1);
  g.lineBetween(42, 44, 58, 22);
  g.fillStyle(0xffc93c, 1);
  g.fillRect(40, 40, 7, 5);
  g.generateTexture(TEX_SOLDIER, 64, 64);
  g.destroy();
}

/** 진흙 웅덩이: 갈색 타원 + 짙은 테두리 + 거품 (128×80, 크기는 displaySize로). */
function bakePuddle(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0x4a2f1a, 0.9);
  g.fillEllipse(64, 40, 126, 78);
  g.fillStyle(0x7a5232, 0.95);
  g.fillEllipse(64, 38, 112, 66);
  g.fillStyle(0x9c6b43, 0.9);
  g.fillEllipse(56, 32, 60, 26);
  g.fillStyle(0xd2ab82, 0.85);
  for (const [x, y, r] of [
    [40, 44, 5],
    [82, 30, 4],
    [90, 48, 6],
    [58, 52, 3],
  ] as const) {
    g.fillCircle(x, y, r);
  }
  g.generateTexture(TEX_PUDDLE, 128, 80);
  g.destroy();
}

/** 상태·특색 텍스처를 모두 준비 (이미 있으면 건너뜀). */
export function ensureStatusTextures(scene: Phaser.Scene): void {
  const icons: StatusIcon[] = ['freeze', 'stop', 'stun', 'slow', 'burn', 'poison', 'bleed', 'mark', 'vuln'];
  for (const s of icons) {
    const key = statusIconKey(s);
    if (scene.textures.exists(key)) continue;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    drawIcon(g, s);
    g.generateTexture(key, STATUS_ICON_SIZE, STATUS_ICON_SIZE);
    g.destroy();
  }
  for (let n = 1; n <= 6; n++) if (!scene.textures.exists(diceKey(n))) bakeDice(scene, n);
  if (!scene.textures.exists(TEX_SOLDIER)) bakeSoldier(scene);
  if (!scene.textures.exists(TEX_PUDDLE)) bakePuddle(scene);
}
