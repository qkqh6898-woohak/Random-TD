/**
 * 임시 몹 그림 (절차 생성, DEV_PLAN M1-7). M11에서 정식 몹 그래픽으로 바뀐다.
 *
 * - 몹마다 128×128 텍스처를 한 번 그려 굽는다 (WebGL에서 Graphics를 매 프레임 다시 쪼개지 않게).
 * - 모양은 ENEMIES.md 3장 '외형'을 따라 아주 단순하게: 젤리·박쥐·돌덩이·거북·천 유령·두건·버섯·해골·늑대·고블린.
 * - 녹스 군단 표식 (ART.md 1.5): 보라 눈 + 이마에 군단 색 문양(마름모). 군단 색은 enemies.json hierarchy.legions[].color.
 * 색·모양은 화면 표현 상수라 코드에 둔다 (게임 규칙 수치가 아님).
 */
import Phaser from 'phaser';
import { COLORS, hexToInt, shade } from './palette';

export type MobShape = 'blob' | 'bat' | 'rock' | 'shell' | 'ghost' | 'hood' | 'mushroom' | 'skull' | 'wolf' | 'goblin';

export interface MobLook {
  shape: MobShape;
  body: number;
  /** 보조 색 (보석·수정·방패·버섯 몸 등) */
  accent: number;
}

/** 몹 id → 모양·색. 없는 몹은 기본 젤리. */
export const MOB_LOOKS: Readonly<Record<string, MobLook>> = {
  slime: { shape: 'blob', body: 0x7ed957, accent: 0xc8f5a8 },
  bat: { shape: 'bat', body: 0x8e5ec7, accent: 0xc9a6f0 },
  golem: { shape: 'rock', body: 0x6d6875, accent: 0xb072ff },
  turtle: { shape: 'shell', body: 0x4f9d8a, accent: 0x9fe3ff },
  ghost: { shape: 'ghost', body: 0xf1f1f6, accent: 0xc7c7dd },
  splitter: { shape: 'blob', body: 0x4aa3df, accent: 0xb7e2ff },
  thief: { shape: 'hood', body: 0x3a3550, accent: 0x6b6390 },
  healer: { shape: 'mushroom', body: 0xe86f6f, accent: 0xf6e7c1 },
  shield: { shape: 'skull', body: 0xe6e0cf, accent: 0x9c6b3c },
  shadowwolf: { shape: 'wolf', body: 0x2c2a3a, accent: 0x5a5672 },
  goblin: { shape: 'goblin', body: 0x5b6b3a, accent: 0x8a9a5a },
  gemgolem: { shape: 'rock', body: 0x5c5470, accent: 0xe04fd0 },
  minigolem: { shape: 'rock', body: 0x7a7290, accent: 0xf08ae0 },
};

export const DEFAULT_LOOK: MobLook = { shape: 'blob', body: 0x9aa0a6, accent: 0xdddddd };

/** 크기 등급(enemies.json size) → 칸 대비 지름. */
export const SIZE_SCALE: Readonly<Record<string, number>> = { 소형: 0.62, 중형: 0.72, 대형: 0.86 };

export const MOB_TEX_SIZE = 128;
const OUTLINE = hexToInt(COLORS.outline);
const EYE = 0xb36bff; // 녹스 군단 보라 눈

export function mobTextureKey(mobId: string): string {
  return `mob-${mobId}`;
}

function v(points: number[]): Phaser.Math.Vector2[] {
  const out: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < points.length; i += 2) out.push(new Phaser.Math.Vector2(points[i], points[i + 1]));
  return out;
}

function fillPoly(g: Phaser.GameObjects.Graphics, pts: number[], color: number, outline = true): void {
  const p = v(pts);
  g.fillStyle(color, 1);
  g.fillPoints(p, true);
  if (outline) {
    g.lineStyle(4, OUTLINE, 1);
    g.strokePoints(p, true);
  }
}

function eyes(g: Phaser.GameObjects.Graphics, cx: number, cy: number, gap: number, r: number): void {
  g.fillStyle(0xffffff, 1);
  g.fillCircle(cx - gap, cy, r);
  g.fillCircle(cx + gap, cy, r);
  g.fillStyle(EYE, 1);
  g.fillCircle(cx - gap + r * 0.2, cy + r * 0.1, r * 0.62);
  g.fillCircle(cx + gap + r * 0.2, cy + r * 0.1, r * 0.62);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(cx - gap + r * 0.45, cy - r * 0.25, r * 0.22);
  g.fillCircle(cx + gap + r * 0.45, cy - r * 0.25, r * 0.22);
}

/** 이마의 녹스 문양 (군단 색 마름모). */
function sigil(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, legion: number): void {
  const p = v([cx, cy - r, cx + r * 0.75, cy, cx, cy + r, cx - r * 0.75, cy]);
  g.fillStyle(legion, 1);
  g.fillPoints(p, true);
  g.lineStyle(2.5, OUTLINE, 1);
  g.strokePoints(p, true);
}

function blob(g: Phaser.GameObjects.Graphics, l: MobLook, legion: number): void {
  g.fillStyle(l.body, 1);
  g.lineStyle(4, OUTLINE, 1);
  g.fillEllipse(64, 76, 96, 76);
  g.strokeEllipse(64, 76, 96, 76);
  g.fillStyle(shade(l.body, 0.35), 0.9);
  g.fillEllipse(48, 58, 30, 16);
  g.fillStyle(l.accent, 0.8);
  g.fillCircle(84, 92, 5);
  eyes(g, 64, 76, 16, 9);
  sigil(g, 64, 52, 8, legion);
}

function bat(g: Phaser.GameObjects.Graphics, l: MobLook, legion: number): void {
  const wing = shade(l.body, -0.25);
  fillPoly(g, [56, 62, 8, 40, 18, 66, 4, 82, 30, 80, 44, 92], wing);
  fillPoly(g, [72, 62, 120, 40, 110, 66, 124, 82, 98, 80, 84, 92], wing);
  fillPoly(g, [46, 46, 52, 26, 60, 44], l.body);
  fillPoly(g, [82, 46, 76, 26, 68, 44], l.body);
  g.fillStyle(l.body, 1);
  g.lineStyle(4, OUTLINE, 1);
  g.fillCircle(64, 68, 28);
  g.strokeCircle(64, 68, 28);
  eyes(g, 64, 66, 11, 7);
  g.fillStyle(0xffffff, 1);
  g.fillTriangle(58, 82, 62, 82, 60, 88);
  g.fillTriangle(66, 82, 70, 82, 68, 88);
  sigil(g, 64, 48, 6, legion);
}

function rock(g: Phaser.GameObjects.Graphics, l: MobLook, legion: number, gem: boolean): void {
  fillPoly(g, [22, 100, 16, 62, 34, 30, 64, 20, 96, 30, 112, 60, 106, 100], l.body);
  g.fillStyle(shade(l.body, 0.2), 1);
  g.fillTriangle(34, 34, 64, 24, 52, 52);
  g.fillStyle(shade(l.body, -0.25), 1);
  g.fillTriangle(106, 98, 112, 62, 86, 92);
  // 보라 룬 줄
  g.lineStyle(3, l.accent, 0.9);
  g.lineBetween(30, 92, 42, 80);
  g.lineBetween(94, 82, 100, 94);
  if (gem) {
    fillPoly(g, [64, 72, 80, 84, 64, 100, 48, 84], l.accent);
    g.fillStyle(0xffffff, 0.7);
    g.fillTriangle(58, 80, 64, 76, 62, 86);
  }
  eyes(g, 64, 56, 15, 8);
  sigil(g, 64, 36, 7, legion);
}

function shell(g: Phaser.GameObjects.Graphics, l: MobLook, legion: number): void {
  g.fillStyle(shade(l.body, 0.25), 1);
  g.lineStyle(4, OUTLINE, 1);
  g.fillEllipse(30, 98, 22, 16);
  g.fillEllipse(98, 98, 22, 16);
  g.fillCircle(102, 66, 16);
  g.strokeCircle(102, 66, 16);
  g.fillStyle(l.body, 1);
  g.fillEllipse(60, 74, 88, 64);
  g.strokeEllipse(60, 74, 88, 64);
  fillPoly(g, [48, 58, 58, 30, 68, 58], l.accent);
  fillPoly(g, [30, 70, 34, 48, 44, 68], l.accent);
  fillPoly(g, [70, 66, 80, 44, 86, 68], l.accent);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(106, 62, 5);
  g.fillStyle(EYE, 1);
  g.fillCircle(107, 63, 3);
  sigil(g, 60, 86, 6, legion);
}

function ghost(g: Phaser.GameObjects.Graphics, l: MobLook, legion: number): void {
  fillPoly(g, [24, 108, 24, 60, 34, 32, 64, 18, 94, 32, 104, 60, 104, 108, 90, 96, 78, 110, 64, 96, 50, 110, 38, 96], l.body);
  g.fillStyle(l.accent, 0.6);
  g.fillTriangle(80, 40, 96, 56, 92, 90);
  g.fillStyle(0x2b2340, 1);
  g.fillEllipse(50, 58, 14, 18);
  g.fillEllipse(78, 58, 14, 18);
  g.fillStyle(EYE, 1);
  g.fillCircle(51, 60, 4);
  g.fillCircle(79, 60, 4);
  g.fillStyle(0x2b2340, 1);
  g.fillEllipse(64, 80, 12, 9);
  sigil(g, 64, 38, 6, legion);
}

function hood(g: Phaser.GameObjects.Graphics, l: MobLook, legion: number): void {
  fillPoly(g, [26, 108, 34, 62, 64, 16, 94, 62, 102, 108], l.body);
  g.fillStyle(0x16131f, 1);
  g.fillEllipse(64, 70, 46, 36);
  g.fillStyle(EYE, 1);
  g.fillEllipse(54, 70, 10, 6);
  g.fillEllipse(74, 70, 10, 6);
  g.fillStyle(l.accent, 1);
  g.fillRect(40, 92, 48, 6);
  fillPoly(g, [92, 98, 112, 90, 108, 100], 0xc8ccd6);
  sigil(g, 64, 42, 6, legion);
}

function mushroom(g: Phaser.GameObjects.Graphics, l: MobLook, legion: number): void {
  g.fillStyle(l.accent, 1);
  g.lineStyle(4, OUTLINE, 1);
  g.fillRoundedRect(40, 60, 48, 48, 16);
  g.strokeRoundedRect(40, 60, 48, 48, 16);
  g.fillStyle(l.body, 1);
  g.beginPath();
  g.arc(64, 64, 46, Math.PI, 0, false);
  g.closePath();
  g.fillPath();
  g.strokePath();
  g.fillStyle(0xffffff, 0.95);
  g.fillCircle(44, 50, 7);
  g.fillCircle(66, 34, 8);
  g.fillCircle(88, 52, 6);
  eyes(g, 64, 80, 11, 7);
  // 회복 십자
  g.fillStyle(0x7ed957, 1);
  g.fillRect(96, 84, 16, 5);
  g.fillRect(101.5, 78.5, 5, 16);
  sigil(g, 64, 98, 5, legion);
}

function skull(g: Phaser.GameObjects.Graphics, l: MobLook, legion: number): void {
  g.fillStyle(l.body, 1);
  g.lineStyle(4, OUTLINE, 1);
  g.fillCircle(60, 54, 32);
  g.strokeCircle(60, 54, 32);
  g.fillRoundedRect(44, 74, 32, 22, 6);
  g.strokeRoundedRect(44, 74, 32, 22, 6);
  g.fillStyle(0x2b2340, 1);
  g.fillCircle(48, 54, 9);
  g.fillCircle(72, 54, 9);
  g.fillStyle(EYE, 1);
  g.fillCircle(48, 55, 4);
  g.fillCircle(72, 55, 4);
  g.fillStyle(0x2b2340, 1);
  g.fillTriangle(60, 64, 56, 72, 64, 72);
  // 나무 방패
  g.fillStyle(l.accent, 1);
  g.fillRoundedRect(78, 58, 38, 50, 10);
  g.strokeRoundedRect(78, 58, 38, 50, 10);
  g.lineStyle(3, shade(l.accent, -0.35), 1);
  g.lineBetween(90, 62, 90, 104);
  g.lineBetween(104, 62, 104, 104);
  sigil(g, 97, 82, 7, legion);
}

function wolf(g: Phaser.GameObjects.Graphics, l: MobLook, legion: number): void {
  g.fillStyle(l.accent, 0.45);
  g.fillCircle(30, 90, 18);
  g.fillCircle(100, 92, 14);
  fillPoly(g, [18, 96, 26, 66, 50, 58, 70, 40, 82, 22, 90, 40, 104, 34, 100, 56, 114, 72, 100, 82, 86, 78, 82, 100, 66, 100, 60, 86, 40, 88, 36, 104], l.body);
  g.fillStyle(0xff3b5c, 1);
  g.fillTriangle(88, 56, 98, 56, 94, 61);
  g.fillStyle(0xffffff, 1);
  g.fillTriangle(102, 74, 108, 74, 105, 80);
  sigil(g, 84, 44, 5, legion);
}

function goblin(g: Phaser.GameObjects.Graphics, l: MobLook, legion: number): void {
  fillPoly(g, [26, 50, 6, 30, 40, 44], l.body);
  fillPoly(g, [102, 50, 122, 30, 88, 44], l.body);
  g.fillStyle(l.body, 1);
  g.lineStyle(4, OUTLINE, 1);
  g.fillCircle(64, 56, 30);
  g.strokeCircle(64, 56, 30);
  g.fillStyle(0x3a2f4a, 1);
  g.fillRoundedRect(44, 82, 40, 28, 8);
  g.strokeRoundedRect(44, 82, 40, 28, 8);
  eyes(g, 64, 56, 12, 7);
  g.fillStyle(0xffffff, 1);
  g.fillTriangle(54, 72, 58, 72, 56, 78);
  g.fillTriangle(70, 72, 74, 72, 72, 78);
  // 단검
  fillPoly(g, [88, 96, 112, 80, 116, 84, 92, 102], 0xc8ccd6);
  sigil(g, 64, 36, 6, legion);
}

/** 몹 텍스처를 한 번 그려 굽는다 (이미 있으면 그대로). */
export function ensureMobTexture(scene: Phaser.Scene, mobId: string, legionColor: number): string {
  const key = mobTextureKey(mobId);
  if (scene.textures.exists(key)) return key;
  const look = MOB_LOOKS[mobId] ?? DEFAULT_LOOK;
  const g = scene.make.graphics({}, false);
  switch (look.shape) {
    case 'blob':
      blob(g, look, legionColor);
      break;
    case 'bat':
      bat(g, look, legionColor);
      break;
    case 'rock':
      rock(g, look, legionColor, mobId !== 'golem');
      break;
    case 'shell':
      shell(g, look, legionColor);
      break;
    case 'ghost':
      ghost(g, look, legionColor);
      break;
    case 'hood':
      hood(g, look, legionColor);
      break;
    case 'mushroom':
      mushroom(g, look, legionColor);
      break;
    case 'skull':
      skull(g, look, legionColor);
      break;
    case 'wolf':
      wolf(g, look, legionColor);
      break;
    case 'goblin':
      goblin(g, look, legionColor);
      break;
  }
  g.generateTexture(key, MOB_TEX_SIZE, MOB_TEX_SIZE);
  g.destroy();
  return key;
}

/** 투명 몹 머리 위 👁 아이콘 텍스처 (ENEMIES.md 5장 '화면 표시', ART.md 2.4) */
export const EYE_ICON_KEY = 'mob-eye-icon';
export const EYE_ICON_W = 64;
export const EYE_ICON_H = 44;

/**
 * 👁 아이콘: 흰 아몬드 눈 + 보라 눈동자 + 반짝임, 어두운 테두리 (글꼴 이모지에 기대지 않고 직접 그림 → 어느 기기에서나 같게).
 * 한 번 구워 모든 투명 몹이 같이 쓴다.
 */
export function ensureEyeIconTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(EYE_ICON_KEY)) return EYE_ICON_KEY;
  const g = scene.make.graphics({}, false);
  const cx = EYE_ICON_W / 2;
  const cy = EYE_ICON_H / 2;
  const hw = EYE_ICON_W / 2 - 4;
  const hh = EYE_ICON_H / 2 - 5;
  // 아몬드 모양: 위아래 호를 점으로 이어 붙인다
  const pts: number[] = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = cx - hw + t * hw * 2;
    pts.push(x, cy - Math.sin(t * Math.PI) * hh);
  }
  for (let i = n - 1; i > 0; i--) {
    const t = i / n;
    const x = cx - hw + t * hw * 2;
    pts.push(x, cy + Math.sin(t * Math.PI) * hh);
  }
  g.fillStyle(0x000000, 0.35);
  g.fillCircle(cx, cy + 3, hw * 0.9);
  fillPoly(g, pts, 0xffffff);
  g.fillStyle(EYE, 1);
  g.fillCircle(cx, cy, hh * 0.78);
  g.fillStyle(0x2a0b4d, 1);
  g.fillCircle(cx, cy, hh * 0.38);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(cx + hh * 0.3, cy - hh * 0.3, hh * 0.22);
  g.generateTexture(EYE_ICON_KEY, EYE_ICON_W, EYE_ICON_H);
  g.destroy();
  return EYE_ICON_KEY;
}
