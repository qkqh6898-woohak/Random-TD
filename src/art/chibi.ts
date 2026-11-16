/**
 * SD 캐릭터 (절차 생성). 받침대와 캐릭터는 같은 발밑 원점을 쓴다.
 * 받침대 = 등급 색, 몸 = 종족 색, 머리 위 별 = 등급 (ART.md 1장).
 *
 * - `drawChibiFigure`·`drawPedestal`: Graphics에 그리기만 한다 (원점 = 발밑). 게임 화면의 타워는 이것을 텍스처로 한 번 구워 쓴다
 *   (`art/towers.ts`, WebGL에서 Graphics는 매 프레임 다시 쪼개지므로 칸마다 Graphics를 두지 않는다).
 */
import Phaser from 'phaser';
import { COLORS, hexToInt, shade } from './palette';
import type { TowerProp } from './towerLook';

const OUTLINE = hexToInt(COLORS.outline);
const SKIN = 0xf6d7b0;

interface ChibiStyle {
  job: string;
  faction: string;
  body: number;
  trim: number;
  prop: TowerProp;
  stars: number;
  cap?: number;
  gem?: number;
}

function drawStar(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number): void {
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(new Phaser.Math.Vector2(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr));
  }
  g.fillStyle(0xffc64c, 1);
  g.fillPoints(pts, true);
  g.lineStyle(3, OUTLINE, 1);
  g.strokePoints(pts, true);
  g.fillStyle(0xfff4c4, 0.95).fillTriangle(cx, cy - r * 0.76, cx - r * 0.22, cy, cx + r * 0.16, cy - r * 0.16);
}

function drawProp(g: Phaser.GameObjects.Graphics, prop: TowerProp, job: string, gem = 0x9be7ff): void {
  g.lineStyle(5, OUTLINE, 1);
  switch (prop) {
    case 'sword':
      g.fillStyle(0xdfe6ee, 1);
      if (job === 'warrior') {
        g.fillTriangle(53, -138, 79, -138, 68, -158).fillRect(53, -138, 26, 74);
        g.strokeTriangle(53, -138, 79, -138, 68, -158).strokeRect(53, -138, 26, 74);
        g.fillStyle(0x9aabd3, 1).fillTriangle(68, -153, 76, -137, 68, -71).fillRect(69, -135, 7, 65);
        g.fillStyle(0xffd473, 1).fillRoundedRect(43, -70, 46, 12, 5);
        g.strokeRoundedRect(43, -70, 46, 12, 5);
        break;
      }
      g.fillRect(52, -150, 14, 92);
      g.strokeRect(52, -150, 14, 92);
      g.fillStyle(0xa4bee3, 1).fillRect(59, -147, 4, 79);
      g.fillStyle(0xc9a227, 1);
      g.fillRect(38, -62, 42, 12);
      g.strokeRect(38, -62, 42, 12);
      break;
    case 'bow':
      g.lineStyle(job === 'archer' ? 17 : 13, OUTLINE, 1);
      g.beginPath();
      g.arc(46, -78, 52, -Math.PI / 2.2, Math.PI / 2.2, false);
      g.strokePath();
      g.lineStyle(job === 'archer' ? 9 : 6, 0xe6a64e, 1);
      g.beginPath();
      g.arc(46, -78, 52, -Math.PI / 2.2, Math.PI / 2.2, false);
      g.strokePath();
      g.lineStyle(3, 0xffedbf, 1);
      g.lineBetween(46 + 52 * Math.cos(-Math.PI / 2.2), -78 + 52 * Math.sin(-Math.PI / 2.2), 46 + 52 * Math.cos(Math.PI / 2.2), -78 + 52 * Math.sin(Math.PI / 2.2));
      break;
    case 'pickaxe':
      g.lineStyle(14, OUTLINE, 1).lineBetween(40, -28, 76, -152);
      g.lineStyle(8, 0xd49249, 1).lineBetween(40, -28, 76, -152);
      g.fillStyle(0xddedff, 1).fillTriangle(26, -129, 113, -159, 72, -176);
      g.lineStyle(5, OUTLINE, 1).strokeTriangle(26, -129, 113, -159, 72, -176);
      g.fillStyle(0x8598bc, 1).fillTriangle(36, -136, 108, -159, 75, -154);
      break;
    case 'dagger':
      g.fillStyle(0xdfe6ee, 1);
      g.fillTriangle(54, -118, 66, -118, 60, -150);
      g.fillRect(54, -118, 12, 40);
      g.lineStyle(4, OUTLINE, 1);
      g.strokeTriangle(54, -118, 66, -118, 60, -150);
      g.strokeRect(54, -118, 12, 40);
      g.fillStyle(0xa2a8dc, 1).fillTriangle(60, -145, 63, -120, 60, -85);
      g.fillStyle(0x8b5a2b, 1);
      g.fillRect(44, -82, 32, 10);
      g.strokeRect(44, -82, 32, 10);
      break;
    case 'staff':
      g.lineStyle(13, OUTLINE, 1).lineBetween(60, -20, 60, -160);
      g.lineStyle(7, 0xd18c57, 1);
      g.lineBetween(60, -20, 60, -160);
      g.fillStyle(gem, 1).fillCircle(60, -168, 17);
      g.lineStyle(3, OUTLINE, 1);
      g.strokeCircle(60, -168, 17);
      if (job === 'apprentice') {
        g.fillStyle(0x9bfaef, 0.35).fillCircle(66, -180, 27);
        g.fillStyle(0xa5fff4, 1).fillTriangle(47, -177, 85, -177, 66, -206);
        g.fillTriangle(47, -177, 85, -177, 66, -156);
        g.lineStyle(4, OUTLINE, 1).strokeTriangle(47, -177, 85, -177, 66, -206);
        g.strokeTriangle(47, -177, 85, -177, 66, -156);
      } else g.fillStyle(shade(gem, 0.73), 1).fillCircle(55, -174, 6);
      break;
    case 'spear':
      g.lineStyle(13, OUTLINE, 1).lineBetween(40, -24, 88, -162);
      g.lineStyle(7, 0xda9a51, 1).lineBetween(40, -24, 88, -162);
      g.fillStyle(0xdaf6ff, 1).fillTriangle(71, -164, 96, -156, 107, -201);
      g.lineStyle(5, OUTLINE, 1).strokeTriangle(71, -164, 96, -156, 107, -201);
      g.fillStyle(0x82a3cb, 1).fillTriangle(86, -161, 94, -160, 102, -190);
      break;
    case 'rifle':
      g.fillStyle(0x576581, 1).fillRoundedRect(36, -88, 76, 24, 5);
      g.strokeRoundedRect(36, -88, 76, 24, 5);
      g.fillStyle(0xb8d0dc, 1).fillRect(79, -81, 31, 6);
      g.fillStyle(0xd29c4b, 1).fillRect(45, -78, 21, 15);
      g.fillStyle(0xf5d087, 1).fillRect(65, -94, 12, 9);
      break;
    case 'bomb':
      g.fillStyle(0x5b356d, 1).fillCircle(76, -74, 28);
      g.strokeCircle(76, -74, 28);
      g.fillStyle(0xb370c1, 1).fillEllipse(67, -85, 17, 9);
      g.lineStyle(6, 0xe6ac64, 1).lineBetween(80, -97, 92, -117);
      g.fillStyle(0xffd16b, 1).fillCircle(94, -118, 8);
      break;
    case 'book':
      g.fillStyle(0x8964b8, 1).fillRoundedRect(48, -98, 60, 50, 6);
      g.strokeRoundedRect(48, -98, 60, 50, 6);
      g.fillStyle(0xffe6a8, 1).fillRect(53, -93, 49, 6);
      g.fillTriangle(69, -71, 88, -71, 78, -84).fillTriangle(69, -71, 88, -71, 78, -59);
      break;
    case 'dice':
      g.fillStyle(0xede1ff, 1).fillRoundedRect(52, -104, 52, 50, 9);
      g.strokeRoundedRect(52, -104, 52, 50, 9);
      g.fillStyle(0xf64d73, 1).fillCircle(78, -79, 9);
      g.fillStyle(0xffffff, 0.8).fillRoundedRect(59, -98, 35, 6, 3);
      break;
    case 'drum':
      g.fillStyle(0xc05648, 1).fillRoundedRect(39, -78, 69, 48, 10);
      g.strokeRoundedRect(39, -78, 69, 48, 10);
      g.fillStyle(0xffdd91, 1).fillEllipse(73, -74, 68, 24);
      g.strokeEllipse(73, -74, 68, 24);
      g.lineStyle(4, 0xffca79, 1).lineBetween(52, -60, 67, -34).lineBetween(93, -60, 76, -34);
      break;
    case 'purse':
      g.fillStyle(0xf3b456, 1).fillEllipse(76, -56, 54, 53);
      g.strokeEllipse(76, -56, 54, 53);
      g.fillStyle(0xffe09a, 1).fillTriangle(60, -87, 92, -87, 76, -70);
      g.strokeTriangle(60, -87, 92, -87, 76, -70);
      g.fillStyle(0xb97545, 1).fillRoundedRect(61, -78, 28, 7, 3);
      break;
    case 'none':
      break;
  }
}

export { CHIBI_BOUNDS, PEDESTAL_BOUNDS } from './chibiBounds';

function drawGolemFace(g: Phaser.GameObjects.Graphics): void {
  const edge = [
    [-64, -159], [-48, -205], [-15, -221], [40, -214],
    [64, -174], [52, -118], [-42, -113],
  ].map(([x, y]) => new Phaser.Math.Vector2(x, y));
  g.fillStyle(0x798a83, 1).fillPoints(edge, true);
  g.lineStyle(6, OUTLINE, 1).strokePoints(edge, true);
  g.fillStyle(0xadbc90, 1).fillTriangle(-47, -197, -13, -215, 14, -183);
  g.fillStyle(0x455862, 1).fillTriangle(43, -201, 59, -169, 49, -126).fillTriangle(-39, -120, 17, -125, 40, -146);
  g.fillStyle(OUTLINE, 1).fillRoundedRect(-43, -168, 86, 25, 10);
  g.fillStyle(0xffcf69, 1).fillEllipse(-22, -156, 17, 11).fillEllipse(22, -156, 17, 11);
  g.fillStyle(0x9de7ad, 1).fillTriangle(-14, -188, 14, -188, 0, -206).fillTriangle(-14, -188, 14, -188, 0, -175);
}

function drawHead(g: Phaser.GameObjects.Graphics, opts: ChibiStyle): void {
  const { body, faction, job, trim } = opts;
  const headX = job === 'goblin' ? 7 : 0;
  g.translateCanvas(headX, 0);
  if (job === 'goblin' || faction === 'elf' || faction === 'darkelf') {
    g.fillStyle(0xedbb8a, 1).fillTriangle(-45, -181, -100, -201, -53, -138);
    g.fillTriangle(43, -180, 98, -198, 52, -138);
    g.lineStyle(5, OUTLINE, 1).strokeTriangle(-45, -181, -100, -201, -53, -138);
    g.strokeTriangle(43, -180, 98, -198, 52, -138);
    g.fillStyle(0xd48480, 1).fillTriangle(-55, -174, -85, -188, -56, -153);
    g.fillTriangle(54, -174, 85, -186, 56, -152);
  }
  g.fillStyle(SKIN, 1);
  g.fillCircle(0, -158, 62);
  g.lineStyle(5, OUTLINE, 1);
  g.strokeCircle(0, -158, 62);
  g.fillStyle(0xe99b79, 1).fillEllipse(0, -124, 98, 42);
  g.fillStyle(SKIN, 1).fillEllipse(0, -145, 109, 69);
  // 모자/머리카락 (기본 = 종족 색, cap이 있으면 그 색: 마법사 두건·광부 헬멧)
  g.fillStyle(opts.cap ?? shade(body, -0.1), 1);
  g.beginPath();
  g.arc(0, -162, 64, Math.PI, 0, false);
  g.closePath();
  g.fillPath();
  g.fillStyle(shade(opts.cap ?? body, 0.38), 0.9).fillEllipse(-18, -191, 61, 20);
  if (opts.prop === 'pickaxe') {
    // 광부 헬멧 이마 등
    g.fillStyle(0xffc650, 1).fillCircle(0, -196, 17);
    g.fillStyle(0xfff7bf, 1).fillCircle(0, -196, 12);
    g.lineStyle(3, OUTLINE, 1);
    g.strokeCircle(0, -196, 13);
  }
  g.lineStyle(5, OUTLINE, 1);
  g.beginPath();
  g.arc(0, -162, 64, Math.PI, 0, false);
  g.closePath();
  g.strokePath();
  if (job === 'apprentice' || job === 'archmage' || job === 'flamemage') {
    g.fillStyle(opts.cap ?? shade(body, -0.1), 1).fillTriangle(-65, -175, 40, -242, 64, -174);
    g.lineStyle(5, OUTLINE, 1).strokeTriangle(-65, -175, 40, -242, 64, -174);
    g.fillStyle(opts.gem ?? 0xb3f1fb, 1).fillCircle(7, -194, 9);
  } else if (job === 'warrior') {
    g.fillStyle(0x527fff, 1).fillTriangle(-8, -202, 17, -241, 45, -210);
    g.lineStyle(5, OUTLINE, 1).strokeTriangle(-8, -202, 17, -241, 45, -210);
    g.fillStyle(0xbad1df, 1).fillRoundedRect(-61, -200, 122, 28, 9);
    g.lineStyle(5, OUTLINE, 1).strokeRoundedRect(-61, -200, 122, 28, 9);
    g.fillStyle(0xe5f3fa, 1).fillRect(-22, -195, 41, 7);
  } else if (job === 'miner') {
    g.fillStyle(0xbd8035, 1).fillRoundedRect(-66, -174, 132, 14, 6);
    g.lineStyle(4, OUTLINE, 1).strokeRoundedRect(-66, -174, 132, 14, 6);
  } else if (faction === 'modern') {
    g.fillStyle(0xb1d7d2, 1).fillRoundedRect(-55, -183, 110, 22, 7);
    g.lineStyle(5, OUTLINE, 1).strokeRoundedRect(-55, -183, 110, 22, 7);
    g.lineStyle(3, 0x486b72, 1).lineBetween(0, -182, 0, -164);
  } else if (faction === 'ancient' || faction === 'alliance') {
    g.fillStyle(trim, 1).fillTriangle(-37, -184, 37, -184, 0, -219);
    g.lineStyle(5, OUTLINE, 1).strokeTriangle(-37, -184, 37, -184, 0, -219);
    g.fillStyle(0x857efa, 1).fillCircle(0, -190, 7);
  } else if (faction === 'elf' || faction === 'fairy') {
    g.fillStyle(0xffdd82, 1).fillEllipse(-30, -178, 38, 12).fillEllipse(30, -178, 38, 12);
    g.fillStyle(0xa8eac2, 1).fillCircle(0, -177, 8);
  }
  // 눈·볼
  g.fillStyle(OUTLINE, 1);
  g.fillEllipse(-22, -145, 14, 20);
  g.fillEllipse(22, -145, 14, 20);
  g.fillStyle(shade(body, 0.48), 1).fillEllipse(-21, -141, 8, 11).fillEllipse(23, -141, 8, 11);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(-20, -150, 3);
  g.fillCircle(24, -150, 3);
  g.fillStyle(0xfa7e88, 0.75);
  g.fillEllipse(-38, -128, 18, 10);
  g.fillEllipse(38, -128, 18, 10);
  if (job === 'miner') {
    g.fillStyle(0x9b4161, 1).fillEllipse(0, -116, 71, 37);
    g.fillStyle(0xf38a4d, 1).fillEllipse(0, -117, 59, 30).fillEllipse(-24, -127, 28, 13).fillEllipse(24, -127, 28, 13);
  }
  g.fillStyle(OUTLINE, 1).fillEllipse(0, -124, 25, 18);
  g.fillStyle(0xfb7390, 1).fillEllipse(0, -120, 15, 6);
  if (faction === 'orc') g.fillStyle(0xffedb8, 1).fillTriangle(-21, -125, -10, -124, -17, -137).fillTriangle(10, -124, 21, -125, 17, -137);
  g.translateCanvas(-headX, 0);
}

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
  g.fillStyle(shade(pedestal, 0.38), 1).fillEllipse(ox, oy - 4, 151, 28);
  g.fillStyle(shade(pedestal, -0.42), 1).fillEllipse(ox, oy - 2, 133, 19);
  g.fillStyle(0xffe2a0, 0.85).fillTriangle(ox - 9, oy + 14, ox + 9, oy + 14, ox, oy + 25);
}

/** 캐릭터 몸 + 소품 + 머리 위 별. 원점 = 발밑 중심 (ox, oy만큼 옮겨 그림). */
export function drawChibiFigure(
  g: Phaser.GameObjects.Graphics,
  opts: ChibiStyle,
  ox = 0,
  oy = 0,
): void {
  const { body, job, faction, trim } = opts;
  const gold = 0xffd785;
  g.save();
  g.translateCanvas(ox, oy);
  if (job === 'archer') {
    g.fillStyle(shade(body, -0.24), 1).fillTriangle(-38, -132, -94, -33, 5, -53);
    g.lineStyle(5, OUTLINE, 1).strokeTriangle(-38, -132, -94, -33, 5, -53);
    g.fillStyle(shade(body, 0.3), 1).fillTriangle(-40, -113, -80, -49, -25, -67);
  } else if (faction === 'fairy') {
    g.fillStyle(0xbcfff2, 1).fillEllipse(-61, -107, 60, 92).fillEllipse(58, -107, 59, 90);
    g.lineStyle(5, OUTLINE, 1).strokeEllipse(-61, -107, 60, 92).strokeEllipse(58, -107, 59, 90);
    g.lineStyle(4, 0xa675df, 1).lineBetween(-74, -132, -47, -82).lineBetween(72, -132, 44, -84);
  } else if (faction === 'darkelf' || faction === 'alliance' || faction === 'ancient') {
    g.fillStyle(shade(body, -0.26), 1).fillTriangle(-32, -134, -89, -37, 28, -44);
    g.lineStyle(5, trim, 1).lineBetween(-89, -37, 28, -44);
  }
  // 다리
  g.fillStyle(shade(body, -0.45), 1);
  g.fillRoundedRect(-30, -34, 24, 34, 8);
  g.fillRoundedRect(6, -34, 24, 34, 8);
  g.lineStyle(4, OUTLINE, 1).strokeRoundedRect(-30, -34, 24, 34, 8).strokeRoundedRect(6, -34, 24, 34, 8);
  g.fillStyle(shade(body, 0.42), 0.85).fillRoundedRect(-27, -15, 17, 7, 3).fillRoundedRect(10, -15, 17, 7, 3);
  // 몸
  g.fillStyle(body, 1);
  g.fillRoundedRect(-44, -104, 88, 78, 26);
  g.lineStyle(5, OUTLINE, 1);
  g.strokeRoundedRect(-44, -104, 88, 78, 26);
  g.fillStyle(shade(body, 0.35), 1);
  g.fillRoundedRect(-34, -96, 58, 18, 7);
  g.fillStyle(shade(body, -0.34), 1).fillRoundedRect(-38, -54, 76, 18, 6);
  g.fillStyle(trim, 1).fillRoundedRect(-13, -57, 26, 23, 5);
  g.lineStyle(4, OUTLINE, 1).strokeRoundedRect(-13, -57, 26, 23, 5);
  g.fillStyle(gold, 1).fillCircle(0, -46, 4);
  // 팔
  const hands = job === 'stonegolem' ? 0x80928b : SKIN;
  g.fillStyle(hands, 1);
  g.fillCircle(-48, -58, 13);
  g.fillCircle(48, -58, 13);
  g.lineStyle(4, OUTLINE, 1);
  g.strokeCircle(-48, -58, 13);
  drawProp(g, opts.prop, job, opts.gem);
  g.fillStyle(hands, 1);
  g.fillCircle(48, -58, 13);
  g.lineStyle(4, OUTLINE, 1);
  g.strokeCircle(48, -58, 13);
  if (job === 'warrior') {
    g.fillStyle(0xf8c75b, 1).fillEllipse(-54, -68, 84, 94);
    g.lineStyle(5, OUTLINE, 1).strokeEllipse(-54, -68, 84, 94);
    g.fillStyle(0x2a57a0, 1).fillEllipse(-54, -69, 65, 75);
    g.fillStyle(0x89baff, 1).fillEllipse(-60, -78, 32, 41);
    g.fillStyle(0xffdc75, 1).fillRoundedRect(-72, -85, 36, 31, 6);
    g.fillStyle(0x29234a, 1).fillCircle(-62, -78, 3.5).fillCircle(-54, -70, 3.5).fillCircle(-46, -62, 3.5);
  }
  if (job === 'stonegolem') drawGolemFace(g);
  else drawHead(g, opts);
  drawGradeStars(g, opts.stars);
  g.restore();
}

/** 발밑 원점을 기준으로 타워 머리 위에 등급 별을 그린다. */
export function drawGradeStars(g: Phaser.GameObjects.Graphics, stars: number): void {
  const n = Math.max(1, stars);
  const r = n > 3 ? 12 : 15;
  const gap = n > 3 ? 27 : 34;
  for (let i = 0; i < n; i++) drawStar(g, (i - (n - 1) / 2) * gap, -246, r);
}
