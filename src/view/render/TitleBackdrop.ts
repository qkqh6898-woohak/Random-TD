/**
 * 타이틀 배경 (절차 생성, 외부 이미지 없음): 테마 1 「국경 평원」 — 초원·성벽·풍차 (campaign.json themes[0].background).
 * 하늘 위쪽에는 녹스 군단이 열고 들어오는 보라색 균열.
 * 무작위 요소(별 위치)는 고정 시드의 간단한 LCG로 만들어 스크린샷이 매번 같다.
 */
import Phaser from 'phaser';
import { COLORS, hexToInt, lerpColor, shade } from '../../art/palette';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';

const OUTLINE = hexToInt(COLORS.outline);

/** 화면용 고정 시드 난수 (sim의 Rng와 무관). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function vGradient(g: Phaser.GameObjects.Graphics, y0: number, y1: number, stops: [number, number][]): void {
  const bands = 96;
  const h = (y1 - y0) / bands;
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1);
    let k = 0;
    while (k < stops.length - 2 && t > (stops[k + 1] as [number, number])[0]) k++;
    const [ta, ca] = stops[k] as [number, number];
    const [tb, cb] = stops[k + 1] as [number, number];
    const local = tb === ta ? 0 : Math.min(1, Math.max(0, (t - ta) / (tb - ta)));
    g.fillStyle(lerpColor(ca, cb, local), 1);
    g.fillRect(0, y0 + i * h, GAME_WIDTH, h + 1);
  }
}

function poly(g: Phaser.GameObjects.Graphics, pts: number[], color: number, alpha = 1, stroke = false): void {
  const v: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < pts.length; i += 2) v.push(new Phaser.Math.Vector2(pts[i], pts[i + 1]));
  g.fillStyle(color, alpha);
  g.fillPoints(v, true);
  if (stroke) {
    g.lineStyle(4, OUTLINE, 0.9);
    g.strokePoints(v, true);
  }
}

/**
 * 정적인 그림은 한 번만 그려 텍스처로 굽는다 (WebGL에서 Graphics는 매 프레임 다시 삼각형으로 쪼개져 느리다).
 * 장면을 다시 열 때는 이미 구운 텍스처를 재사용한다.
 */
function bake(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: (g: Phaser.GameObjects.Graphics) => void,
): string {
  if (!scene.textures.exists(key)) {
    const g = scene.make.graphics({}, false);
    draw(g);
    g.generateTexture(key, w, h);
    g.destroy();
  }
  return key;
}

function drawCastle(g: Phaser.GameObjects.Graphics, kingdomColor: number): void {
  const stone = 0x8d8fa3;
  const stoneDark = 0x6c6e84;
  const baseY = 1262;
  // 성벽
  g.fillStyle(stoneDark, 1);
  g.fillRect(70, 1150, 560, baseY - 1150);
  g.fillStyle(stone, 1);
  g.fillRect(70, 1150, 560, 26);
  for (let x = 70; x < 630; x += 56) {
    g.fillStyle(stone, 1);
    g.fillRect(x, 1122, 32, 30);
  }
  // 성문
  g.fillStyle(0x3a2a20, 1);
  g.fillRoundedRect(320, 1188, 80, 74, { tl: 40, tr: 40, bl: 0, br: 0 });
  // 탑 2개
  for (const tx of [110, 560]) {
    g.fillStyle(stone, 1);
    g.fillRect(tx - 46, 1030, 92, baseY - 1030);
    g.fillStyle(stoneDark, 1);
    g.fillRect(tx - 46, 1030, 18, baseY - 1030);
    g.fillStyle(0x2a2f45, 1);
    g.fillRoundedRect(tx - 12, 1080, 24, 40, 12);
    // 지붕 (왕국 파랑)
    g.fillStyle(kingdomColor, 1);
    g.fillTriangle(tx - 62, 1034, tx + 62, 1034, tx, 930);
    g.fillStyle(shade(kingdomColor, 0.25), 1);
    g.fillTriangle(tx - 62, 1034, tx - 10, 1034, tx, 930);
    // 깃발
    g.lineStyle(5, 0x4a3b2a, 1);
    g.lineBetween(tx, 930, tx, 872);
    g.fillStyle(0xe74c3c, 1);
    g.fillTriangle(tx, 872, tx + 48, 886, tx, 900);
  }
}

const BLADE_TEX = 320;

function drawWindmillBody(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  g.fillStyle(0xe8dcc6, 1);
  g.fillTriangle(x - 54, y + 170, x + 54, y + 170, x, y - 10);
  g.fillRect(x - 54, y + 150, 108, 24);
  g.fillStyle(0xb5533c, 1);
  g.fillTriangle(x - 40, y + 20, x + 40, y + 20, x, y - 44);
  g.fillStyle(0x6b4a33, 1);
  g.fillRoundedRect(x - 14, y + 120, 28, 50, { tl: 14, tr: 14, bl: 0, br: 0 });
}

function drawBlades(g: Phaser.GameObjects.Graphics): void {
  const c0 = BLADE_TEX / 2;
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    g.lineStyle(7, 0x6b4a33, 1);
    g.lineBetween(c0, c0, c0 + c * 150, c0 + s * 150);
    const px = -s;
    const py = c;
    g.fillStyle(0xf4efe4, 0.95);
    g.fillPoints(
      [
        new Phaser.Math.Vector2(c0 + c * 40 + px * 4, c0 + s * 40 + py * 4),
        new Phaser.Math.Vector2(c0 + c * 150 + px * 4, c0 + s * 150 + py * 4),
        new Phaser.Math.Vector2(c0 + c * 150 + px * 34, c0 + s * 150 + py * 34),
        new Phaser.Math.Vector2(c0 + c * 40 + px * 30, c0 + s * 40 + py * 30),
      ],
      true,
    );
  }
  g.fillStyle(0x4a3b2a, 1);
  g.fillCircle(c0, c0, 12);
}

export interface BackdropOptions {
  kingdomColor: string;
}

/** 타이틀 배경 전체를 그린다. */
export function drawTitleBackdrop(scene: Phaser.Scene, opts: BackdropOptions): void {
  const kingdom = hexToInt(opts.kingdomColor);

  // 하늘 + 먼 산 + 성벽 + 언덕 + 초원 (움직이지 않는 층)
  const skyKey = bake(scene, `title-sky-${kingdom.toString(16)}`, GAME_WIDTH, GAME_HEIGHT, (g) => {
    vGradient(g, 0, 1300, [
      [0, 0x111a3d],
      [0.42, 0x2d4c8e],
      [0.78, 0xd98f6a],
      [1, 0xf6cf88],
    ]);
    poly(g, [0, 1180, 120, 1060, 230, 1120, 360, 1000, 500, 1110, 640, 1030, 780, 1120, 900, 1040, 1080, 1130, 1080, 1300, 0, 1300], 0x4a4f86, 1);
    poly(g, [0, 1230, 160, 1150, 330, 1210, 520, 1140, 700, 1210, 880, 1150, 1080, 1220, 1080, 1300, 0, 1300], 0x5d6aa0, 1);
    drawCastle(g, kingdom);
    g.fillStyle(0x4f9d4a, 1);
    g.fillEllipse(900, 1330, 700, 260);
    drawWindmillBody(g, 900, 1060);
  });
  scene.add.image(0, 0, skyKey).setOrigin(0);

  // 별 (위쪽만, 반짝임)
  const starsKey = bake(scene, 'title-stars', GAME_WIDTH, 640, (g) => {
    const rand = lcg(20261114);
    for (let i = 0; i < 70; i++) {
      const x = rand() * GAME_WIDTH;
      const y = rand() * 620;
      const r = 1.5 + rand() * 2.5;
      g.fillStyle(0xffffff, 0.35 + rand() * 0.55);
      g.fillCircle(x, y, r);
    }
  });
  const stars = scene.add.image(0, 0, starsKey).setOrigin(0);
  scene.tweens.add({ targets: stars, alpha: { from: 1, to: 0.6 }, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

  // 녹스 군단의 하늘 균열 (맥동)
  const riftKey = bake(scene, 'title-rift', 400, 240, (g) => {
    for (let i = 6; i >= 1; i--) {
      g.fillStyle(0x8a3ffc, 0.05 + (6 - i) * 0.02);
      g.fillEllipse(200, 120, 70 + i * 46, 26 + i * 22);
    }
    poly(g, [140, 60, 185, 108, 170, 122, 222, 170, 210, 128, 252, 132, 192, 84, 206, 74], 0xf2e6ff, 0.95);
  });
  const rift = scene.add.image(820, 250, riftKey);
  scene.tweens.add({ targets: rift, alpha: { from: 1, to: 0.7 }, scale: { from: 1, to: 1.06 }, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

  // 풍차 날개 (천천히 회전)
  const bladesKey = bake(scene, 'title-blades', BLADE_TEX, BLADE_TEX, drawBlades);
  const blades = scene.add.image(900, 1064, bladesKey);
  scene.tweens.add({ targets: blades, angle: 360, duration: 14000, repeat: -1 });

  // 앞쪽 초원·흙길·풀·꽃 + 아래쪽 어둡게 (글자 가독성)
  const fieldKey = bake(scene, 'title-field', GAME_WIDTH, GAME_HEIGHT, (g) => {
    const rand = lcg(7);
    vGradient(g, 1255, GAME_HEIGHT, [
      [0, 0x6cc25f],
      [0.5, 0x4c9a48],
      [1, 0x2e6331],
    ]);
    poly(g, [345, 1262, 375, 1262, 470, 1460, 640, 1700, 720, 1920, 420, 1920, 430, 1700, 380, 1460], 0xc9a36b, 1);
    poly(g, [352, 1262, 362, 1262, 410, 1460, 470, 1700, 470, 1920, 420, 1920, 430, 1700, 380, 1460], 0xb08852, 1);
    for (let i = 0; i < 46; i++) {
      const x = rand() * GAME_WIDTH;
      const y = 1290 + rand() * 600;
      const sc = 0.6 + ((y - 1290) / 600) * 1.2;
      g.fillStyle(0x3f8a3c, 0.9);
      g.fillTriangle(x - 8 * sc, y, x, y - 26 * sc, x + 2 * sc, y);
      g.fillTriangle(x, y, x + 9 * sc, y - 20 * sc, x + 10 * sc, y);
    }
    for (let i = 0; i < 24; i++) {
      const x = rand() * GAME_WIDTH;
      const y = 1320 + rand() * 560;
      g.fillStyle([0xffe066, 0xff8fab, 0xffffff][i % 3] as number, 1);
      g.fillCircle(x, y, 5 + rand() * 4);
    }
    for (let i = 0; i < 12; i++) {
      g.fillStyle(0x0d1220, 0.035);
      g.fillRect(0, GAME_HEIGHT - 40 - i * 34, GAME_WIDTH, 40 + i * 34);
    }
  });
  scene.add.image(0, 0, fieldKey).setOrigin(0);
}
