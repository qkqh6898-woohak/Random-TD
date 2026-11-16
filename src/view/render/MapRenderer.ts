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
  bgTop: 0x182d39,
  bgMid: 0x255550,
  bgBottom: 0x142b38,
  board: 0x172e32,
  grassA: 0x69977d,
  grassB: 0x5e8d76,
  grassLip: 0x3b6257,
  grassEdge: 0x243e41,
  grassShine: 0xa7d1a0,
  tuft: 0x477261,
  dirt: 0xd2a77b,
  dirtDark: 0x94684f,
  dirtLight: 0xf2ca94,
  pebble: 0xb08061,
  chevron: 0x7d5750,
  rift: 0xa758fa,
  riftCore: 0x361953,
  stone: 0x8895ac,
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
    // 판 가장자리의 이끼와 무너진 돌은 채도를 낮춰 HUD·타워보다 뒤로 물린다.
    for (let i = 0; i < 78; i++) {
      const x = rnd() * GAME_WIDTH;
      const y = rnd() * GAME_HEIGHT;
      const size = 13 + rnd() * 18;
      g.fillStyle(0x182d37, 0.38).fillEllipse(x, y + 7, size * 4, size * 1.7);
      g.fillStyle(0x518474, 0.22).fillEllipse(x - size * 0.55, y, size * 2, size * 0.95);
      g.lineStyle(3, 0x9cc5ac, 0.32).lineBetween(x + size * 0.4, y + size * 0.36, x + size * 0.76, y - size * 0.25);
      g.lineBetween(x + size * 0.4, y + size * 0.36, x + size * 0.17, y);
    }
    // 맵 아래 판 (테두리 그림자)
    const L = this.layout;
    const pad = L.tile * 0.22;
    const x = L.originX + L.minCol * L.tile - pad;
    const y = L.originY + L.minRow * L.tile - pad;
    const width = L.cols * L.tile + pad * 2;
    const height = L.rows * L.tile + pad * 2;
    g.fillStyle(0x0e1925, 0.65).fillRoundedRect(x, y + 13, width, height, pad);
    g.fillStyle(MEADOW.board, 1).fillRoundedRect(x, y, width, height, pad);
    g.lineStyle(Math.max(2, L.tile * 0.035), 0x8bb6a3, 0.56).strokeRoundedRect(x, y, width, height, pad);
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
          const cx = px + t * 0.5;
          g.fillStyle(0x182a33, 0.78).fillEllipse(cx, py + t * 0.76, t * 0.77, t * 0.24);
          g.fillStyle(0x6d6266, 1).fillRoundedRect(cx - t * 0.05, py + t * 0.48, t * 0.1, t * 0.26, 3);
          g.fillStyle(0x356753, 1).fillTriangle(cx, py + t * 0.12, cx - t * 0.3, py + t * 0.65, cx + t * 0.3, py + t * 0.65);
          g.lineStyle(4, MEADOW.grassEdge, 1).strokeTriangle(cx, py + t * 0.12, cx - t * 0.3, py + t * 0.65, cx + t * 0.3, py + t * 0.65);
          g.fillStyle(0x609272, 1).fillTriangle(cx, py + t * 0.18, cx - t * 0.17, py + t * 0.5, cx + t * 0.15, py + t * 0.47);
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
        g.fillStyle(MEADOW.grassEdge, 0.17).fillTriangle(px + t * 0.52, py + t * 0.9, px + t * 0.92, py + t * 0.37, px + t * 0.92, py + t * 0.87);
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
        if (rnd() < 0.32) {
          const cx = px + t * (0.2 + rnd() * 0.6);
          const cy = py + t * (0.25 + rnd() * 0.45);
          g.fillStyle(0xf0c88b, 0.8).fillCircle(cx, cy, t * 0.026).fillCircle(cx + t * 0.063, cy - t * 0.067, t * 0.018);
          g.fillStyle(0xe2eee0, 0.72).fillCircle(cx + t * 0.062, cy, t * 0.013);
        }
      }
    }

    // 2) 흙길 (맵 밖 등장·퇴장 칸 포함)
    for (const [i, c] of cells.entries()) {
      const px = layout.originX + c.x * t;
      const py = layout.originY + c.y * t;
      g.fillStyle(MEADOW.dirt, 1);
      g.fillRect(px, py, t, t);
      g.fillStyle(i % 2 === 0 ? MEADOW.dirtLight : MEADOW.pebble, 0.18);
      g.fillRect(px + t * 0.12, py + t * 0.12, t * 0.76, t * 0.76);
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
      // 사암 파편. 중앙은 방향 표시와 적의 몸이 또렷하도록 비워 둔다.
      for (let k = 0; k < 4; k++) {
        const x = px + t * (k % 2 === 0 ? 0.17 + rnd() * 0.13 : 0.7 + rnd() * 0.13);
        const y = py + t * (0.17 + rnd() * 0.66);
        g.fillStyle(k % 2 === 0 ? MEADOW.dirtLight : MEADOW.pebble, 0.64);
        g.fillRoundedRect(x, y, t * (0.06 + rnd() * 0.07), t * (0.032 + rnd() * 0.027), 3);
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
      g.lineStyle(4, 0x532c7d, 1).strokeCircle(c, c, 52);
      g.lineStyle(7, MEADOW.rift, 0.95);
      for (let k = 0; k < 3; k++) {
        const a0 = (k * Math.PI * 2) / 3;
        g.beginPath();
        g.arc(c, c, 30, a0, a0 + Math.PI * 0.75, false);
        g.strokePath();
      }
      g.lineStyle(4, 0xe2c7ff, 0.9);
      g.strokeCircle(c, c, 46);
      g.lineStyle(3, 0xffc17e, 0.88).strokeCircle(c, c, 57);
      g.fillStyle(0xf4b7ff, 1);
      g.fillTriangle(59, 13, 69, 13, 64, 3).fillTriangle(59, 115, 69, 115, 64, 125);
      g.fillTriangle(13, 59, 13, 69, 3, 64).fillTriangle(115, 59, 115, 69, 125, 64);
      g.fillStyle(0xd784ff, 1).fillTriangle(55, 64, 73, 64, 64, 46).fillTriangle(55, 64, 73, 64, 64, 82);
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
    g.fillStyle(0xb4b8c8, 1).fillRect(x - w * 0.45, y - h * 0.43, w * 0.9, h * 0.12);
    g.lineStyle(Math.max(2, t * 0.027), 0x59657e, 1);
    for (const row of [-0.22, 0.05, 0.28]) g.lineBetween(x - w * 0.48, y + h * row, x + w * 0.48, y + h * row);
    g.fillStyle(0x2a2230, 1);
    g.fillRoundedRect(x - w * 0.26, y - h * 0.1, w * 0.52, h * 0.6, { tl: w * 0.26, tr: w * 0.26, bl: 0, br: 0 });
    g.lineStyle(Math.max(2, t * 0.04), 0xd2a675, 1);
    g.strokeRoundedRect(x - w * 0.26, y - h * 0.1, w * 0.52, h * 0.6, { tl: w * 0.26, tr: w * 0.26, bl: 0, br: 0 });
    g.fillStyle(shade(MEADOW.stone, -0.25), 1);
    for (let i = 0; i < 4; i++) g.fillRect(x - w / 2 + (i * w) / 4 + w * 0.03, y - h / 2 - t * 0.12, w / 4 - w * 0.06, t * 0.12);
    g.fillStyle(this.opts.kingdomColor, 1);
    g.fillTriangle(x + w * 0.38, y - h / 2 - t * 0.42, x + w * 0.38, y - h / 2 - t * 0.18, x + w * 0.68, y - h / 2 - t * 0.3);
    g.lineStyle(Math.max(2, t * 0.03), OUTLINE, 1);
    g.lineBetween(x + w * 0.38, y - h / 2 - t * 0.45, x + w * 0.38, y - h / 2);
    this.objects.push(g);
  }
}
