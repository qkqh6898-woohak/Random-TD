/**
 * 맵 그리기 (DEV_PLAN M1-7): 테마 1 「국경 평원」·순환의 정원 색 — 잔디 단상(배치 칸) + 흙길(경로).
 *
 * - 바닥 전체(배경 풀밭 + 칸)는 한 번 그려 텍스처로 굽는다 (정적 그림은 generateTexture, PROGRESS M0 결정).
 * - 배치 칸 = 살짝 솟은 잔디 단상 (아랫단 그림자로 입체감, 체크무늬로 칸 구분), 경로 = 흙길 + 진행 방향 화살표.
 * - 몹 등장 지점 = 녹스 군단의 보라 균열(빙글빙글 도는 소용돌이), 캠페인 출구 = 왕국 성문.
 * - 장식용 무작위(조약돌·풀·꽃)는 맵 id로 시드를 정한 간단한 난수 → 매번 같은 그림 (sim의 Rng와 무관).
 */
import Phaser from 'phaser';
import { COLORS, hexToInt, lerpColor, shade } from '../../art/palette';
import type { SimMap } from '../../sim/map';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { pathCells, tileCenterPx, type MapLayout } from '../layout';

/** 테마 1 풀밭 색 (ART.md 1장: 블록 = 잔디 단상, 경로 = 흙길). */
export const MEADOW = {
  bgTop: 0x1f4a2a,
  bgMid: 0x2c6633,
  bgBottom: 0x1d4527,
  board: 0x173a20,
  grassA: 0x7cc35a,
  grassB: 0x72b952,
  grassLip: 0x3f7a33,
  grassEdge: 0x2f5e27,
  grassShine: 0xa6df7e,
  tuft: 0x5a9e45,
  dirt: 0xcaa46c,
  dirtDark: 0x9a7444,
  dirtLight: 0xe2c592,
  pebble: 0xa8844f,
  chevron: 0x9b7646,
  rift: 0x9b4dff,
  riftCore: 0x2a0b4d,
  stone: 0x9aa0a6,
} as const;

const OUTLINE = hexToInt(COLORS.outline);

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

export class MapRenderer {
  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  /** 구운 바닥 텍스처 키 (배치가 같으면 다시 그리지 않고 같이 쓴다) */
  readonly textureKey: string;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly map: SimMap,
    private readonly layout: MapLayout,
    private readonly opts: MapRendererOptions,
  ) {
    // 칸 크기만이 아니라 위치도 키에 넣는다: HUD 높이에 따라 같은 칸 크기로 위아래만 달라질 수 있다
    this.textureKey = `map-${map.id}-${layout.tile}-${layout.originX}-${layout.originY}`;
  }

  /** 바닥 텍스처를 굽고 장면에 올린다. */
  draw(): void {
    const key = this.textureKey;
    if (!this.scene.textures.exists(key)) {
      const g = this.scene.make.graphics({}, false);
      this.drawBackground(g);
      this.drawTiles(g);
      g.generateTexture(key, GAME_WIDTH, GAME_HEIGHT);
      g.destroy();
    }
    this.objects.push(this.scene.add.image(0, 0, key).setOrigin(0).setDepth(0));
    this.drawSpawnRift();
    if (this.map.exit) this.drawExitGate(this.map.exit[0], this.map.exit[1]);
  }

  /**
   * 장면에서 내린다 (화면 크기가 바뀌어 다시 배치할 때).
   * @param removeTexture 구운 바닥 텍스처도 지운다 (다른 배치로 바뀌어 다시 쓰지 않을 때)
   */
  destroy(removeTexture = false): void {
    for (const o of this.objects) {
      this.scene.tweens.killTweensOf(o);
      o.destroy();
    }
    this.objects.length = 0;
    if (removeTexture && this.scene.textures.exists(this.textureKey)) this.scene.textures.remove(this.textureKey);
  }

  private drawBackground(g: Phaser.GameObjects.Graphics): void {
    const bands = 64;
    const h = GAME_HEIGHT / bands;
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      const c = t < 0.5 ? lerpColor(MEADOW.bgTop, MEADOW.bgMid, t * 2) : lerpColor(MEADOW.bgMid, MEADOW.bgBottom, (t - 0.5) * 2);
      g.fillStyle(c, 1);
      g.fillRect(0, i * h, GAME_WIDTH, h + 1);
    }
    const rnd = lcg(seedOf(`bg-${this.map.id}`));
    // 짙은 풀 덩어리와 작은 꽃 (맵 바깥 풀밭)
    for (let i = 0; i < 70; i++) {
      g.fillStyle(shade(MEADOW.bgMid, -0.18 + rnd() * 0.1), 0.55);
      g.fillEllipse(rnd() * GAME_WIDTH, rnd() * GAME_HEIGHT, 40 + rnd() * 90, 18 + rnd() * 30);
    }
    const flowers = [0xffffff, 0xffe066, 0xff9ec7, 0xb9a6ff];
    for (let i = 0; i < 90; i++) {
      g.fillStyle(flowers[i % flowers.length] as number, 0.75);
      g.fillCircle(rnd() * GAME_WIDTH, rnd() * GAME_HEIGHT, 3 + rnd() * 3);
    }
    // 맵 아래 판 (테두리 그림자)
    const L = this.layout;
    const pad = L.tile * 0.22;
    g.fillStyle(0x000000, 0.22);
    g.fillRoundedRect(L.originX + L.minCol * L.tile - pad, L.originY + L.minRow * L.tile - pad + 10, L.cols * L.tile + pad * 2, L.rows * L.tile + pad * 2, pad);
    g.fillStyle(MEADOW.board, 0.9);
    g.fillRoundedRect(L.originX + L.minCol * L.tile - pad, L.originY + L.minRow * L.tile - pad, L.cols * L.tile + pad * 2, L.rows * L.tile + pad * 2, pad);
  }

  private drawTiles(g: Phaser.GameObjects.Graphics): void {
    const { map, layout } = this;
    const t = layout.tile;
    const rnd = lcg(seedOf(`tiles-${map.id}`));
    const cells = pathCells(map);
    const isPath = new Set(cells.map((c) => `${c.x},${c.y}`));

    // 1) 잔디 단상 (배치 칸)
    const inset = Math.max(2, Math.round(t * 0.035));
    const lip = Math.max(3, Math.round(t * 0.07));
    const radius = Math.round(t * 0.14);
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const kind = map.kinds[y * map.width + x];
        if (kind === 'path') continue;
        const px = layout.originX + x * t;
        const py = layout.originY + y * t;
        if (kind === 'decor') {
          g.fillStyle(shade(MEADOW.tuft, -0.2), 1);
          g.fillCircle(px + t / 2, py + t / 2, t * 0.36);
          continue;
        }
        g.fillStyle(MEADOW.grassEdge, 1);
        g.fillRoundedRect(px + inset, py + inset + lip * 0.4, t - inset * 2, t - inset * 2, radius);
        g.fillStyle(MEADOW.grassLip, 1);
        g.fillRoundedRect(px + inset, py + inset, t - inset * 2, t - inset * 2, radius);
        g.fillStyle((x + y) % 2 === 0 ? MEADOW.grassA : MEADOW.grassB, 1);
        g.fillRoundedRect(px + inset, py + inset, t - inset * 2, t - inset * 2 - lip, radius);
        g.fillStyle(MEADOW.grassShine, 0.5);
        g.fillRoundedRect(px + inset + radius * 0.6, py + inset + lip * 0.5, t - inset * 2 - radius * 1.2, Math.max(2, lip * 0.45), lip * 0.2);
        // 풀 포기 2~3개
        g.lineStyle(Math.max(2, t * 0.022), MEADOW.tuft, 0.9);
        const tufts = 2 + Math.floor(rnd() * 2);
        for (let k = 0; k < tufts; k++) {
          const cx = px + t * (0.2 + rnd() * 0.6);
          const cy = py + t * (0.25 + rnd() * 0.45);
          const s = t * 0.06;
          g.lineBetween(cx - s, cy - s * 1.2, cx, cy);
          g.lineBetween(cx + s, cy - s * 1.3, cx, cy);
        }
        if (map.mode === 'infinite' && rnd() < 0.18) {
          g.fillStyle(rnd() < 0.5 ? 0xffffff : 0xffe066, 0.9);
          g.fillCircle(px + t * (0.25 + rnd() * 0.5), py + t * (0.25 + rnd() * 0.4), t * 0.035);
        }
      }
    }

    // 2) 흙길 (맵 밖 등장·퇴장 칸 포함)
    for (const c of cells) {
      const px = layout.originX + c.x * t;
      const py = layout.originY + c.y * t;
      g.fillStyle(MEADOW.dirt, 1);
      g.fillRect(px, py, t, t);
    }
    // 길 가장자리 어두운 띠 (이웃이 길이 아닌 쪽만)
    const edge = Math.max(3, Math.round(t * 0.06));
    for (const c of cells) {
      const px = layout.originX + c.x * t;
      const py = layout.originY + c.y * t;
      g.fillStyle(MEADOW.dirtDark, 0.85);
      if (!isPath.has(`${c.x},${c.y - 1}`)) g.fillRect(px, py, t, edge);
      if (!isPath.has(`${c.x},${c.y + 1}`)) g.fillRect(px, py + t - edge, t, edge);
      if (!isPath.has(`${c.x - 1},${c.y}`)) g.fillRect(px, py, edge, t);
      if (!isPath.has(`${c.x + 1},${c.y}`)) g.fillRect(px + t - edge, py, edge, t);
      // 조약돌·밝은 흙
      for (let k = 0; k < 3; k++) {
        g.fillStyle(k === 0 ? MEADOW.dirtLight : MEADOW.pebble, 0.8);
        g.fillEllipse(px + t * (0.18 + rnd() * 0.64), py + t * (0.18 + rnd() * 0.64), t * (0.06 + rnd() * 0.06), t * (0.04 + rnd() * 0.04));
      }
    }
    // 진행 방향 화살표 (두 칸마다)
    g.lineStyle(Math.max(3, t * 0.045), MEADOW.chevron, 0.75);
    cells.forEach((c, i) => {
      if (i % 2 !== 1) return;
      const { x: cx, y: cy } = tileCenterPx(layout, c.x, c.y);
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
