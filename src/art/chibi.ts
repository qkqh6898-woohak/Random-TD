/**
 * 임시 SD 캐릭터 (절차 생성). M11에서 파츠 SVG + animations.json 해석기로 바뀐다.
 * 받침대 = 등급 색, 몸 = 종족 색, 머리 위 별 = 등급 (ART.md 1장).
 *
 * - `drawChibiFigure`·`drawPedestal`: Graphics에 그리기만 한다 (원점 = 발밑). 게임 화면의 타워는 이것을 텍스처로 한 번 구워 쓴다
 *   (`art/towers.ts`, WebGL에서 Graphics는 매 프레임 다시 쪼개지므로 칸마다 Graphics를 두지 않는다).
 * - `createChibi`: 타이틀용. 컨테이너 + 숨쉬기 트윈 (타이틀에는 3명뿐이라 Graphics 그대로).
 */
import Phaser from 'phaser';
import { COLORS, hexToInt, shade } from './palette';

export type ChibiProp = 'sword' | 'bow' | 'pickaxe' | 'staff' | 'dagger' | 'none';

export interface ChibiOptions {
  bodyColor: string;
  pedestalColor: string;
  prop: ChibiProp;
  stars: number;
  /** 대기 동작 시작 지연 (ms) */
  idleDelay?: number;
  scale?: number;
}

const OUTLINE = hexToInt(COLORS.outline);
const SKIN = 0xf6d7b0;

function drawStar(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number): void {
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(new Phaser.Math.Vector2(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr));
  }
  g.fillStyle(0xffd84a, 1);
  g.fillPoints(pts, true);
  g.lineStyle(3, OUTLINE, 1);
  g.strokePoints(pts, true);
}

function drawProp(g: Phaser.GameObjects.Graphics, prop: ChibiProp): void {
  g.lineStyle(5, OUTLINE, 1);
  switch (prop) {
    case 'sword':
      g.fillStyle(0xdfe6ee, 1);
      g.fillRect(52, -150, 14, 92);
      g.strokeRect(52, -150, 14, 92);
      g.fillStyle(0xc9a227, 1);
      g.fillRect(38, -62, 42, 12);
      g.strokeRect(38, -62, 42, 12);
      break;
    case 'bow':
      g.lineStyle(8, 0x8b5a2b, 1);
      g.beginPath();
      g.arc(46, -78, 52, -Math.PI / 2.2, Math.PI / 2.2, false);
      g.strokePath();
      g.lineStyle(3, 0xf5f0e0, 1);
      g.lineBetween(46 + 52 * Math.cos(-Math.PI / 2.2), -78 + 52 * Math.sin(-Math.PI / 2.2), 46 + 52 * Math.cos(Math.PI / 2.2), -78 + 52 * Math.sin(Math.PI / 2.2));
      break;
    case 'pickaxe':
      g.lineStyle(9, 0x8b5a2b, 1);
      g.lineBetween(40, -30, 74, -138);
      g.fillStyle(0xaab3bd, 1);
      g.fillTriangle(30, -130, 110, -150, 74, -138);
      g.lineStyle(4, OUTLINE, 1);
      g.strokeTriangle(30, -130, 110, -150, 74, -138);
      break;
    case 'dagger':
      g.fillStyle(0xdfe6ee, 1);
      g.fillTriangle(54, -118, 66, -118, 60, -150);
      g.fillRect(54, -118, 12, 40);
      g.lineStyle(4, OUTLINE, 1);
      g.strokeTriangle(54, -118, 66, -118, 60, -150);
      g.strokeRect(54, -118, 12, 40);
      g.fillStyle(0x8b5a2b, 1);
      g.fillRect(44, -82, 32, 10);
      g.strokeRect(44, -82, 32, 10);
      break;
    case 'staff':
      g.lineStyle(8, 0x7a4f2a, 1);
      g.lineBetween(60, -20, 60, -160);
      g.fillStyle(0x9be7ff, 1);
      g.fillCircle(60, -168, 14);
      g.lineStyle(3, OUTLINE, 1);
      g.strokeCircle(60, -168, 14);
      break;
    case 'none':
      break;
  }
}

/** 그림 크기 (발밑 원점 기준, 받침대·별 포함 바깥 경계). 텍스처를 구울 때 쓴다. */
export const CHIBI_BOUNDS = { left: -100, right: 120, top: -268, bottom: 6 } as const;
export const PEDESTAL_BOUNDS = { left: -98, right: 98, top: -26, bottom: 44 } as const;

/** 받침대 (등급 색). 원점 = 발밑 중심. */
export function drawPedestal(g: Phaser.GameObjects.Graphics, pedestal: number, ox = 0, oy = 0): void {
  g.fillStyle(0x000000, 0.25);
  g.fillEllipse(ox, oy + 14, 190, 54);
  g.fillStyle(shade(pedestal, -0.35), 1);
  g.fillEllipse(ox, oy + 8, 170, 50);
  g.fillStyle(pedestal, 1);
  g.fillEllipse(ox, oy, 170, 46);
  g.lineStyle(4, OUTLINE, 1);
  g.strokeEllipse(ox, oy, 170, 46);
}

/** 캐릭터 몸 + 소품 + 머리 위 별. 원점 = 발밑 중심 (ox, oy만큼 옮겨 그림). */
export function drawChibiFigure(
  g: Phaser.GameObjects.Graphics,
  opts: { body: number; prop: ChibiProp; stars: number; cap?: number; lamp?: boolean },
  ox = 0,
  oy = 0,
): void {
  const body = opts.body;
  g.save();
  g.translateCanvas(ox, oy);
  // 다리
  g.fillStyle(shade(body, -0.45), 1);
  g.fillRoundedRect(-30, -34, 24, 34, 8);
  g.fillRoundedRect(6, -34, 24, 34, 8);
  // 몸
  g.fillStyle(body, 1);
  g.fillRoundedRect(-44, -104, 88, 78, 26);
  g.lineStyle(5, OUTLINE, 1);
  g.strokeRoundedRect(-44, -104, 88, 78, 26);
  g.fillStyle(shade(body, 0.35), 1);
  g.fillRoundedRect(-30, -96, 26, 14, 7);
  // 팔
  g.fillStyle(SKIN, 1);
  g.fillCircle(-48, -58, 13);
  g.fillCircle(48, -58, 13);
  g.lineStyle(4, OUTLINE, 1);
  g.strokeCircle(-48, -58, 13);
  drawProp(g, opts.prop);
  g.fillStyle(SKIN, 1);
  g.fillCircle(48, -58, 13);
  g.lineStyle(4, OUTLINE, 1);
  g.strokeCircle(48, -58, 13);
  // 머리 (큰 머리 = SD)
  g.fillStyle(SKIN, 1);
  g.fillCircle(0, -158, 62);
  g.lineStyle(5, OUTLINE, 1);
  g.strokeCircle(0, -158, 62);
  // 모자/머리카락 (기본 = 종족 색, cap이 있으면 그 색: 마법사 두건·광부 헬멧)
  g.fillStyle(opts.cap ?? shade(body, -0.1), 1);
  g.beginPath();
  g.arc(0, -162, 64, Math.PI, 0, false);
  g.closePath();
  g.fillPath();
  if (opts.lamp) {
    // 광부 헬멧 이마 등
    g.fillStyle(0xfff3a8, 1);
    g.fillCircle(0, -196, 13);
    g.lineStyle(3, OUTLINE, 1);
    g.strokeCircle(0, -196, 13);
  }
  g.lineStyle(5, OUTLINE, 1);
  g.beginPath();
  g.arc(0, -162, 64, Math.PI, 0, false);
  g.closePath();
  g.strokePath();
  // 눈·볼
  g.fillStyle(OUTLINE, 1);
  g.fillEllipse(-22, -146, 12, 18);
  g.fillEllipse(22, -146, 12, 18);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(-20, -150, 3);
  g.fillCircle(24, -150, 3);
  g.fillStyle(0xff8a8a, 0.55);
  g.fillEllipse(-38, -128, 18, 10);
  g.fillEllipse(38, -128, 18, 10);
  g.lineStyle(3, OUTLINE, 1);
  g.beginPath();
  g.arc(0, -132, 8, 0.15 * Math.PI, 0.85 * Math.PI, false);
  g.strokePath();
  // 별 (등급)
  const n = Math.max(1, opts.stars);
  const r = n > 3 ? 12 : 15;
  const gap = n > 3 ? 27 : 34;
  for (let i = 0; i < n; i++) drawStar(g, (i - (n - 1) / 2) * gap, -246, r);
  g.restore();
}

/** (x, y) = 발밑 중심. 컨테이너를 돌려준다 (타이틀용). */
export function createChibi(scene: Phaser.Scene, x: number, y: number, opts: ChibiOptions): Phaser.GameObjects.Container {
  const base = scene.add.graphics();
  drawPedestal(base, hexToInt(opts.pedestalColor));
  const g = scene.add.graphics();
  drawChibiFigure(g, { body: hexToInt(opts.bodyColor), prop: opts.prop, stars: opts.stars });
  const figure = scene.add.container(0, 0, [g]);
  const root = scene.add.container(x, y, [base, figure]);
  root.setScale(opts.scale ?? 1);

  // 대기 동작: 숨쉬기(위아래 늘었다 줄었다) 1.5초 주기 + 살짝 뜨기
  scene.tweens.add({
    targets: figure,
    scaleY: { from: 1, to: 1.045 },
    scaleX: { from: 1, to: 0.985 },
    y: { from: 0, to: -8 },
    duration: 750,
    ease: 'Sine.easeInOut',
    yoyo: true,
    repeat: -1,
    delay: opts.idleDelay ?? 0,
  });
  return root;
}
