/**
 * 타워 그리기 (DEV_PLAN M2-8): 임시 SD 캐릭터 + 대기 동작 상시 반복.
 *
 * - 칸 중심 조금 아래에 받침대(등급 색), 그 위에 캐릭터(종족 색·소품·별). 그림은 art/towers.ts가 한 번 구운 텍스처.
 * - 대기 동작: 숨쉬기 1.5초 + 위아래 흔들림 + 3초마다 작은 고유 동작 자리 (towerPose.ts, 순수 함수).
 *   시작 위상은 타워마다 무작위 (화면 쪽 Math.random — sim과 무관) → 같은 타워 여러 개가 똑같이 움직이지 않는다.
 *   공격하지 않아도 계속 움직인다. 트윈 대신 매 프레임 시각으로 자세를 계산한다.
 * - 공격 사건이 오면 대상 쪽으로 몸을 내밀고(0.25초 또는 공격 간격의 60%) 대상 쪽을 바라본다.
 * - 소환 직후 0.4초 등장 동작.
 * - 깊이 = 발밑 화면 y (몹과 같은 기준) → 아래쪽이 위에 그려진다.
 */
import Phaser from 'phaser';
import {
  FIGURE_ORIGIN_X,
  FIGURE_ORIGIN_Y,
  FIGURE_TEX_H,
  PEDESTAL_ORIGIN_Y,
  PEDESTAL_TEX_W,
  SPECIAL_FACTION_COLORS,
  ensurePedestalTexture,
  ensureTowerTexture,
  type TowerLookInput,
} from '../../art/towers';
import type { Tower } from '../../sim/entities/Tower';
import { tileCenterPx, unitsToPx, type MapLayout } from '../layout';
import { MOB_DEPTH_BASE } from './MobSprite';
import { attackAnimMs, towerPose } from './towerPose';
import { FIGURE_TILES, FOOT_OFFSET_TILES } from './towerGeom';

export interface TowerArt {
  look(towerId: string): TowerLookInput;
  factionColor(faction: string): string | undefined;
  /** 공격 간격 (ms) — 공격 동작 길이 계산용 */
  attackIntervalMs(towerId: string): number;
}

export class TowerSprite {
  readonly id: number;
  private readonly root: Phaser.GameObjects.Container;
  private readonly figure: Phaser.GameObjects.Image;
  private readonly scale: number;
  private readonly tile: number;
  private readonly seed: number;
  private readonly attackMs: number;
  private readonly baseX: number;
  private readonly baseY: number;
  private facing = 1;
  private attackAtMs: number | null = null;
  private appearAtMs: number | null = null;
  private lungeDx = 0;
  private lungeDy = 0;

  constructor(scene: Phaser.Scene, tower: Tower, layout: MapLayout, art: TowerArt) {
    this.id = tower.id;
    const look = art.look(tower.tower);
    const color = art.factionColor(look.faction) ?? SPECIAL_FACTION_COLORS[look.faction] ?? '#888888';
    const figKey = ensureTowerTexture(scene, look, color);
    const pedKey = ensurePedestalTexture(scene, look.grade);
    this.tile = layout.tile;
    this.scale = (layout.tile * FIGURE_TILES) / FIGURE_TEX_H;
    const c = tileCenterPx(layout, tower.tx, tower.ty);
    this.baseX = c.x;
    this.baseY = c.y + layout.tile * FOOT_OFFSET_TILES;
    const pedestal = scene.add.image(0, 0, pedKey).setOrigin(0.5, PEDESTAL_ORIGIN_Y);
    pedestal.setScale((layout.tile * 0.78) / PEDESTAL_TEX_W);
    this.figure = scene.add.image(0, 0, figKey).setOrigin(FIGURE_ORIGIN_X, FIGURE_ORIGIN_Y).setScale(this.scale);
    this.root = scene.add.container(this.baseX, this.baseY, [pedestal, this.figure]);
    this.root.setDepth(MOB_DEPTH_BASE + this.baseY);
    this.seed = Math.random();
    this.attackMs = attackAnimMs(art.attackIntervalMs(tower.tower));
    // 처음 바라보는 쪽도 무작위 (모두 같은 쪽을 보지 않게)
    this.facing = this.seed < 0.5 ? 1 : -1;
  }

  /** 소환 직후 등장 동작. */
  appear(timeMs: number): void {
    this.appearAtMs = timeMs;
  }

  /** 공격 동작: 대상(단위 좌표) 쪽으로 몸을 내밀고 바라본다. */
  attack(layout: MapLayout, targetUx: number, targetUy: number, timeMs: number): void {
    const t = unitsToPx(layout, targetUx, targetUy);
    const dx = t.x - this.baseX;
    const dy = t.y - (this.baseY - layout.tile * 0.35);
    const len = Math.hypot(dx, dy) || 1;
    this.lungeDx = dx / len;
    this.lungeDy = dy / len;
    if (Math.abs(dx) > layout.tile * 0.05) this.facing = dx > 0 ? 1 : -1;
    this.attackAtMs = timeMs;
  }

  update(timeMs: number): void {
    const pose = towerPose({ timeMs, seed: this.seed, attackAtMs: this.attackAtMs, attackMs: this.attackMs, appearAtMs: this.appearAtMs });
    const s = this.scale;
    this.figure.setPosition(this.lungeDx * pose.lunge * this.tile, pose.bob * this.tile + this.lungeDy * pose.lunge * this.tile);
    this.figure.setScale(s * pose.sx * this.facing, s * pose.sy);
    this.figure.setRotation(pose.angle);
  }

  /** E2E 확인용: 지금 캐릭터 변환 (y, 세로 크기, 기울기). */
  get figureTransform(): { y: number; scaleY: number; angle: number } {
    return { y: this.figure.y, scaleY: this.figure.scaleY, angle: this.figure.rotation };
  }

  destroy(): void {
    this.root.destroy();
  }
}

/** 화면의 타워 그림 묶음: sim 타워 목록과 맞춰 만들고 지운다. */
export class TowerLayer {
  private readonly sprites = new Map<number, TowerSprite>();
  /** 소환 사건을 받았지만 아직 그림이 없는 타워 → 그림을 만들 때 등장 동작 */
  private readonly pendingAppear = new Set<number>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layout: MapLayout,
    private readonly art: TowerArt,
  ) {}

  /** 소환 사건: 다음 sync에서 그림이 생길 때 등장 동작. */
  noteSummoned(id: number): void {
    this.pendingAppear.add(id);
  }

  /** 공격 사건 → 그 타워 공격 동작. */
  attack(id: number, targetUx: number, targetUy: number, timeMs: number): void {
    this.sprites.get(id)?.attack(this.layout, targetUx, targetUy, timeMs);
  }

  sync(towers: readonly Tower[], timeMs: number): void {
    const seen = new Set<number>();
    for (const t of towers) {
      seen.add(t.id);
      let sprite = this.sprites.get(t.id);
      if (!sprite) {
        sprite = new TowerSprite(this.scene, t, this.layout, this.art);
        this.sprites.set(t.id, sprite);
        if (this.pendingAppear.delete(t.id)) sprite.appear(timeMs);
      }
      sprite.update(timeMs);
    }
    for (const [id, s] of this.sprites) {
      if (!seen.has(id)) {
        s.destroy();
        this.sprites.delete(id);
      }
    }
    this.pendingAppear.clear();
  }

  get count(): number {
    return this.sprites.size;
  }

  figureTransform(id: number): { y: number; scaleY: number; angle: number } | null {
    return this.sprites.get(id)?.figureTransform ?? null;
  }

  destroy(): void {
    for (const s of this.sprites.values()) s.destroy();
    this.sprites.clear();
  }
}
