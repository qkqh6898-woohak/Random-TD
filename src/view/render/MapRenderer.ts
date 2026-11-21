/**
 * 맵 그리기 (DEV_PLAN M1-7): 테마 1 「국경 평원」·순환의 정원 색.
 *
 * - 배치 칸 바닥은 투명하다. 잔디는 이어지고 조작 중 칸 표시는 SelectionLayer에서만 그린다.
 *   힉스필드 전투 배경 그림(BattleBackground)이 판 뒤를 덮고, 그림이 없을 때는 절차 풀밭을 쓴다.
 * - 길(경로)은 언제나 또렷하게: 어두운 테두리 + 흙길 + 진행 방향 화살표. 칸을 이어 그려 꺾임·교차가 끊기지 않는다.
 * - 몹 등장 지점 = 녹스 군단의 보라 균열(빙글빙글 도는 소용돌이), 캠페인 출구 = 왕국 성문.
 * - 정적 그림은 한 번 그려 텍스처로 굽는다 (PROGRESS M0 결정). 길 텍스처는 판 크기만큼만(예전처럼 화면 전체가 아니라) → GPU 메모리 절약.
 *   절차 풀밭 배경은 화면 크기의 절반 해상도로 굽고 늘려 그린다 (흐린 풀밭이라 티가 나지 않음).
 * - 장식용 무작위(조약돌·풀·꽃)는 맵 id로 시드를 정한 간단한 난수 → 매번 같은 그림 (sim의 Rng와 무관).
 * - HF-2: 절차 풀밭(+ 옅은 땅)은 BACKDROP_DEPTH — 전투 배경 그림이 화면을 다 덮으면 숨긴다 (`setBackdropVisible`).
 * - T-3: 화면 크기는 지금 게임 크기(scene.scale, 가변 높이)를 읽는다.
 */
import Phaser from 'phaser';
import { COLORS, hexToInt, lerpColor, shade } from '../../art/palette';
import type { SimMap } from '../../sim/map';
import { pathCells, tileCenterPx, type MapLayout } from '../layout';

/** 테마 1 풀밭 색 (ART.md 1장: 땅 = 풀밭, 경로 = 흙길). */
export const MEADOW = {
  bgTop: 0x1f4a2a,
  bgMid: 0x2c6633,
  bgBottom: 0x1d4527,
  ground: 0x4f9a3f,
  groundLight: 0x67b24f,
  tuft: 0x5a9e45,
  dirt: 0xcaa46c,
  dirtDark: 0x7a5a34,
  dirtLight: 0xe2c592,
  pebble: 0xa8844f,
  chevron: 0x8f6a3d,
  rift: 0x9b4dff,
  riftCore: 0x2a0b4d,
  stone: 0x9aa0a6,
} as const;

const OUTLINE = hexToInt(COLORS.outline);
/** 절차 풀밭 배경 깊이 (전투 배경 그림 BattleBackground보다 아래, 맵 바닥 0보다 아래) */
export const BACKDROP_DEPTH = -50;
/** 절차 풀밭 배경을 굽는 해상도 (화면 크기 대비) */
const BACKDROP_RES = 0.5;
/** 길 너비 (칸 대비): 테두리 · 흙 */
const ROAD_EDGE = 0.9;
const ROAD_FILL = 0.76;

/** 화면용 고정 시드 난수. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export interface MapRendererOptions {
  /** 왕국 색 (성문 깃발) — towers.json factions.kingdom.color */
  kingdomColor: number;
}

/** 판(화면 밖 등장·퇴장 칸 포함)이 차지하는 화면 상자 (px, 여백 포함) */
export function boardRectPx(layout: MapLayout, marginTiles = 0.5): { x: number; y: number; w: number; h: number } {
  const m = Math.round(layout.tile * marginTiles);
  return {
    x: Math.floor(layout.originX + layout.minCol * layout.tile - m),
    y: Math.floor(layout.originY + layout.minRow * layout.tile - m),
    w: Math.ceil(layout.cols * layout.tile + m * 2),
    h: Math.ceil(layout.rows * layout.tile + m * 2),
  };
}

export class MapRenderer {
  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  /** 구운 길 텍스처 키 (배치가 같으면 다시 그리지 않고 같이 쓴다) */
  readonly textureKey: string;
  /** 판 자리의 옅은 땅 (배경 그림이 없을 때만) 텍스처 키 */
  private readonly groundKey: string;
  /** 절차 풀밭 배경 + 판 땅 (전투 배경 그림이 뜨면 숨긴다) */
  private backdrops: Phaser.GameObjects.Image[] = [];
  private backdropVisible = true;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly map: SimMap,
    private readonly layout: MapLayout,
    private readonly opts: MapRendererOptions,
  ) {
    // 칸 크기만이 아니라 위치도 키에 넣는다: HUD 높이에 따라 같은 칸 크기로 위아래만 달라질 수 있다
    this.textureKey = `map-natural-${map.id}-${layout.tile}-${layout.originX}-${layout.originY}`;
    this.groundKey = `${this.textureKey}-ground`;
  }

  /** 바닥 텍스처를 굽고 장면에 올린다. */
  draw(): void {
    const W = this.scene.scale.width;
    const H = this.scene.scale.height;
    // 맵 바깥 풀밭: 배치와 무관 → 맵·화면 크기마다 한 장 (전투 배경 그림이 없을 때의 대체). 다른 크기의 예전 것은 지운다
    const bw = Math.ceil(W * BACKDROP_RES);
    const bh = Math.ceil(H * BACKDROP_RES);
    const bgKey = `map-backdrop-${this.map.id}-${bw}x${bh}`;
    for (const k of this.scene.textures.getTextureKeys()) {
      if (k.startsWith(`map-backdrop-${this.map.id}-`) && k !== bgKey) this.scene.textures.remove(k);
    }
    if (!this.scene.textures.exists(bgKey)) {
      const g = this.scene.make.graphics({}, false);
      this.drawBackdrop(g, bw, bh);
      g.generateTexture(bgKey, bw, bh);
      g.destroy();
    }
    const board = boardRectPx(this.layout);
    if (!this.scene.textures.exists(this.groundKey)) {
      const g = this.scene.make.graphics({}, false);
      this.drawGround(g, board.w, board.h);
      g.generateTexture(this.groundKey, board.w, board.h);
      g.destroy();
    }
    this.backdrops = [
      this.scene.add.image(0, 0, bgKey).setOrigin(0).setDisplaySize(W, H).setDepth(BACKDROP_DEPTH),
      this.scene.add.image(board.x, board.y, this.groundKey).setOrigin(0).setDepth(BACKDROP_DEPTH + 1),
    ];
    for (const b of this.backdrops) {
      b.setVisible(this.backdropVisible);
      this.objects.push(b);
    }
    if (!this.scene.textures.exists(this.textureKey)) {
      const g = this.scene.make.graphics({}, false);
      this.drawRoad(g, board.x, board.y);
      g.generateTexture(this.textureKey, board.w, board.h);
      g.destroy();
    }
    this.objects.push(this.scene.add.image(board.x, board.y, this.textureKey).setOrigin(0).setDepth(0));
    this.drawSpawnRift();
    if (this.map.exit) this.drawExitGate(this.map.exit[0], this.map.exit[1]);
  }

  /**
   * 장면에서 내린다 (화면 크기가 바뀌어 다시 배치할 때).
   * @param removeTexture 구운 길·땅 텍스처도 지운다 (다른 배치로 바뀌어 다시 쓰지 않을 때)
   */
  destroy(removeTexture = false): void {
    for (const o of this.objects) {
      this.scene.tweens.killTweensOf(o);
      o.destroy();
    }
    this.objects.length = 0;
    this.backdrops = [];
    if (removeTexture) {
      for (const k of [this.textureKey, this.groundKey]) if (this.scene.textures.exists(k)) this.scene.textures.remove(k);
    }
  }

  /** 절차 풀밭 배경 보이기/숨기기 (전투 배경 그림이 화면을 다 덮으면 숨겨 그리는 비용을 아낀다) */
  setBackdropVisible(on: boolean): void {
    this.backdropVisible = on;
    for (const b of this.backdrops) b.setVisible(on);
  }

  /** 맵 바깥 풀밭 (w×h 텍스처 = 화면의 BACKDROP_RES 배) */
  private drawBackdrop(g: Phaser.GameObjects.Graphics, w: number, h: number): void {
    const bands = 64;
    const bandH = h / bands;
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      const c = t < 0.5 ? lerpColor(MEADOW.bgTop, MEADOW.bgMid, t * 2) : lerpColor(MEADOW.bgMid, MEADOW.bgBottom, (t - 0.5) * 2);
      g.fillStyle(c, 1);
      g.fillRect(0, i * bandH, w, bandH + 1);
    }
    const rnd = lcg(seedOf(`bg-${this.map.id}`));
    const s = BACKDROP_RES;
    // 짙은 풀 덩어리와 작은 꽃 (맵 바깥 풀밭)
    for (let i = 0; i < 70; i++) {
      g.fillStyle(shade(MEADOW.bgMid, -0.18 + rnd() * 0.1), 0.55);
      g.fillEllipse(rnd() * w, rnd() * h, (40 + rnd() * 90) * s, (18 + rnd() * 30) * s);
    }
    const flowers = [0xffffff, 0xffe066, 0xff9ec7, 0xb9a6ff];
    for (let i = 0; i < 90; i++) {
      g.fillStyle(flowers[i % flowers.length] as number, 0.75);
      g.fillCircle(rnd() * w, rnd() * h, (3 + rnd() * 3) * s);
    }
  }

  /**
   * 판 자리의 옅은 땅 한 덩어리 (배경 그림이 없을 때만 보임): 칸 구분 없이 이어진 밝은 풀밭, 가장자리는 여러 겹으로 부드럽게.
   * w×h = 판 상자 (boardRectPx) 크기, 좌표는 상자 왼쪽 위 기준.
   */
  private drawGround(g: Phaser.GameObjects.Graphics, w: number, h: number): void {
    const t = this.layout.tile;
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      const inset = (t * 0.42 * (steps - 1 - i)) / steps;
      g.fillStyle(MEADOW.ground, 0.16);
      g.fillRoundedRect(inset, inset, w - inset * 2, h - inset * 2, Math.max(4, t * 0.5 - inset * 0.5));
    }
    const rnd = lcg(seedOf(`ground-${this.map.id}`));
    const m = t * 0.5;
    // 밝은 풀 얼룩과 풀 포기 (칸과 무관한 자리)
    for (let i = 0; i < 26; i++) {
      g.fillStyle(MEADOW.groundLight, 0.18);
      g.fillEllipse(m + rnd() * (w - m * 2), m + rnd() * (h - m * 2), t * (0.8 + rnd() * 1.2), t * (0.35 + rnd() * 0.4));
    }
    g.lineStyle(Math.max(2, t * 0.022), MEADOW.tuft, 0.7);
    for (let i = 0; i < 40; i++) {
      const cx = m + rnd() * (w - m * 2);
      const cy = m + rnd() * (h - m * 2);
      const s = t * 0.06;
      g.lineBetween(cx - s, cy - s * 1.2, cx, cy);
      g.lineBetween(cx + s, cy - s * 1.3, cx, cy);
    }
  }

  /**
   * 길: 칸마다 가운데 네모 + 이웃 길 칸 쪽으로 이어지는 띠 → 꺾임·교차가 끊기지 않는 한 줄 길.
   * 1) 어두운 테두리(넓게) 2) 흙(좁게) 3) 조약돌 4) 진행 방향 화살표(두 칸마다). (ox, oy) = 텍스처 왼쪽 위의 화면 px.
   */
  private drawRoad(g: Phaser.GameObjects.Graphics, ox: number, oy: number): void {
    const { map, layout } = this;
    const t = layout.tile;
    const rnd = lcg(seedOf(`road-${map.id}`));
    const cells = pathCells(map);
    const isPath = new Set(cells.map((c) => `${c.x},${c.y}`));
    const centerOf = (x: number, y: number): { x: number; y: number } => {
      const c = tileCenterPx(layout, x, y);
      return { x: c.x - ox, y: c.y - oy };
    };
    const band = (width: number, color: number, alpha: number): void => {
      g.fillStyle(color, alpha);
      const half = width / 2;
      for (const c of cells) {
        const p = centerOf(c.x, c.y);
        g.fillRect(p.x - half, p.y - half, width, width);
        // 오른쪽·아래 이웃으로만 이으면 모든 이음이 한 번씩
        if (isPath.has(`${c.x + 1},${c.y}`)) g.fillRect(p.x, p.y - half, t, width);
        if (isPath.has(`${c.x},${c.y + 1}`)) g.fillRect(p.x - half, p.y, width, t);
      }
    };
    // 바닥 그림자 (배경 그림 위에서도 길이 떠 보이게)
    g.translateCanvas(0, Math.max(2, t * 0.05));
    band(t * ROAD_EDGE, 0x000000, 0.22);
    g.translateCanvas(0, -Math.max(2, t * 0.05));
    band(t * ROAD_EDGE, MEADOW.dirtDark, 1);
    band(t * ROAD_FILL, MEADOW.dirt, 1);
    // 조약돌·밝은 흙
    for (const c of cells) {
      const p = centerOf(c.x, c.y);
      for (let k = 0; k < 3; k++) {
        g.fillStyle(k === 0 ? MEADOW.dirtLight : MEADOW.pebble, 0.8);
        g.fillEllipse(p.x + t * (rnd() - 0.5) * 0.56, p.y + t * (rnd() - 0.5) * 0.56, t * (0.06 + rnd() * 0.06), t * (0.04 + rnd() * 0.04));
      }
    }
    // 진행 방향 화살표 (두 칸마다)
    g.lineStyle(Math.max(3, t * 0.05), MEADOW.chevron, 0.85);
    cells.forEach((c, i) => {
      if (i % 2 !== 1) return;
      const { x: cx, y: cy } = centerOf(c.x, c.y);
      const s = t * 0.13;
      const fx = c.dx * s;
      const fy = c.dy * s;
      // 화살표 끝 = 진행 방향, 양 날개 = 수직 방향
      g.lineBetween(cx + fx, cy + fy, cx - fx - fy, cy - fy + fx);
      g.lineBetween(cx + fx, cy + fy, cx - fx + fy, cy - fy - fx);
    });
  }

  /** 녹스 군단 균열: 등장 칸에 빙글빙글 도는 보라 소용돌이. */
  private drawSpawnRift(): void {
    const [sx, sy] = this.map.spawn;
    const { x, y } = tileCenterPx(this.layout, sx, sy);
    const t = this.layout.tile;
    const key = 'nox-rift';
    if (!this.scene.textures.exists(key)) {
      const g = this.scene.make.graphics({}, false);
      const c = 64;
      g.fillStyle(MEADOW.rift, 0.25);
      g.fillCircle(c, c, 62);
      g.fillStyle(MEADOW.riftCore, 0.9);
      g.fillCircle(c, c, 38);
      g.lineStyle(7, MEADOW.rift, 0.95);
      for (let k = 0; k < 3; k++) {
        const a0 = (k * Math.PI * 2) / 3;
        g.beginPath();
        g.arc(c, c, 30, a0, a0 + Math.PI * 0.75, false);
        g.strokePath();
      }
      g.lineStyle(4, 0xe2c7ff, 0.9);
      g.strokeCircle(c, c, 46);
      g.generateTexture(key, 128, 128);
      g.destroy();
    }
    const rift = this.scene.add.image(x, y, key).setDepth(10).setDisplaySize(t * 0.95, t * 0.95).setAlpha(0.85);
    this.scene.tweens.add({ targets: rift, angle: 360, duration: 4000, repeat: -1 });
    this.objects.push(rift);
  }

  /** 캠페인 출구: 왕국 성문 (돌 아치 + 왕국 색 깃발). */
  private drawExitGate(ex: number, ey: number): void {
    const { x, y } = tileCenterPx(this.layout, ex, ey);
    const t = this.layout.tile;
    const g = this.scene.add.graphics().setDepth(11);
    const w = t * 0.95;
    const h = t * 0.9;
    g.fillStyle(MEADOW.stone, 1);
    g.lineStyle(Math.max(2, t * 0.04), OUTLINE, 1);
    g.fillRect(x - w / 2, y - h / 2, w, h);
    g.strokeRect(x - w / 2, y - h / 2, w, h);
    g.fillStyle(0x2a2230, 1);
    g.fillRoundedRect(x - w * 0.26, y - h * 0.1, w * 0.52, h * 0.6, { tl: w * 0.26, tr: w * 0.26, bl: 0, br: 0 });
    g.fillStyle(shade(MEADOW.stone, -0.25), 1);
    for (let i = 0; i < 4; i++) g.fillRect(x - w / 2 + (i * w) / 4 + w * 0.03, y - h / 2 - t * 0.12, w / 4 - w * 0.06, t * 0.12);
    g.fillStyle(this.opts.kingdomColor, 1);
    g.fillTriangle(x + w * 0.38, y - h / 2 - t * 0.42, x + w * 0.38, y - h / 2 - t * 0.18, x + w * 0.68, y - h / 2 - t * 0.3);
    g.lineStyle(Math.max(2, t * 0.03), OUTLINE, 1);
    g.lineBetween(x + w * 0.38, y - h / 2 - t * 0.45, x + w * 0.38, y - h / 2);
    this.objects.push(g);
  }
}
