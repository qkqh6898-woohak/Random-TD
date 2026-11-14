/**
 * 특색 능력이 만든 것 그리기 (M3b): 진흙 웅덩이(진흙 주술사), 소환 병사(소환사).
 *
 * - 웅덩이: 경로 위 갈색 타원 (반경 = sim 반경, 원근감으로 납작하게). 생길 때 0.2초 커지고 사라지기 0.5초 전부터 옅어진다.
 * - 병사: 작은 보라 검사. 진행도를 보간해 경로를 **거꾸로** 걷는다 (걷는 방향 = 경로 방향의 반대 → 좌우 뒤집기), 통통 걷기.
 *   sim에서 사라지면 0.2초 동안 옅어지며 사라진다.
 * 화면 전용 (sim을 읽기만 한다).
 */
import Phaser from 'phaser';
import { TEX_PUDDLE, TEX_SOLDIER, ensureStatusTextures } from '../../art/status';
import type { Puddle } from '../../sim/entities/Puddle';
import type { Soldier } from '../../sim/entities/Soldier';
import { directionAt, positionAt, type SimPath } from '../../sim/map';
import { TICK_MS } from '../../sim/World';
import { unitsToPx, type MapLayout } from '../layout';
import { MOB_DEPTH_BASE } from './MobSprite';
import { puddleLook } from './abilityModel';

/** 웅덩이는 바닥 위, 고른 타워 사거리 원(900) 아래 */
export const PUDDLE_DEPTH = 800;
export class PuddleLayer {
  private readonly imgs = new Map<number, Phaser.GameObjects.Image>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layout: MapLayout,
  ) {
    ensureStatusTextures(scene);
  }

  sync(puddles: readonly Puddle[], tick: number, alpha: number): void {
    const seen = new Set<number>();
    const L = this.layout;
    for (const p of puddles) {
      seen.add(p.id);
      let img = this.imgs.get(p.id);
      if (!img) {
        const c = unitsToPx(L, p.x, p.y);
        img = this.scene.add.image(c.x, c.y, TEX_PUDDLE).setDepth(PUDDLE_DEPTH);
        this.imgs.set(p.id, img);
      }
      const look = puddleLook(p, tick, alpha);
      const w = ((p.r * 2) / 1000) * L.tile * 1.1 * look.scale;
      img.setDisplaySize(w, w * 0.62).setAlpha(look.alpha);
    }
    for (const [id, img] of this.imgs) {
      if (seen.has(id)) continue;
      img.destroy();
      this.imgs.delete(id);
    }
  }

  get count(): number {
    return this.imgs.size;
  }

  destroy(): void {
    for (const img of this.imgs.values()) img.destroy();
    this.imgs.clear();
  }
}

/** 병사 걷기: 0.4초 주기 통통 (화면 표현 상수) */
const SOLDIER_STEP_MS = 400;
const SOLDIER_FADE_MS = 200;

export class SoldierLayer {
  private readonly imgs = new Map<number, Phaser.GameObjects.Image>();
  private readonly size: number;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layout: MapLayout,
    private readonly path: SimPath,
  ) {
    ensureStatusTextures(scene);
    this.size = layout.tile * 0.62;
  }

  /**
   * @param prevProgress 직전 틱 진행도 (보간용)
   * @param alpha 다음 틱까지 비율
   */
  sync(soldiers: readonly Soldier[], prevProgress: ReadonlyMap<number, number>, alpha: number, timeMs: number): void {
    const seen = new Set<number>();
    for (const s of soldiers) {
      seen.add(s.id);
      let img = this.imgs.get(s.id);
      if (!img) {
        img = this.scene.add.image(0, 0, TEX_SOLDIER).setOrigin(0.5, 0.85).setDisplaySize(this.size, this.size);
        this.imgs.set(s.id, img);
      }
      const prev = prevProgress.get(s.id);
      const progress = prev === undefined ? s.progress : prev + (s.progress - prev) * alpha;
      const p = positionAt(this.path, progress);
      const dir = directionAt(this.path, progress);
      const px = unitsToPx(this.layout, p.x, p.y);
      // 경로를 거꾸로 걷는다 → 가로 방향이 경로와 반대
      if (dir.dx !== 0) img.setFlipX(dir.dx > 0);
      const k = ((timeMs + s.id * 97) % SOLDIER_STEP_MS) / SOLDIER_STEP_MS;
      const bob = Math.abs(Math.sin(k * Math.PI)) * this.layout.tile * 0.06;
      img.setPosition(px.x, px.y + this.layout.tile * 0.2 - bob);
      img.setDepth(MOB_DEPTH_BASE + px.y);
    }
    for (const [id, img] of this.imgs) {
      if (seen.has(id)) continue;
      this.imgs.delete(id);
      this.scene.tweens.add({ targets: img, alpha: 0, y: img.y - this.layout.tile * 0.2, duration: SOLDIER_FADE_MS, onComplete: () => img.destroy() });
    }
  }

  get count(): number {
    return this.imgs.size;
  }

  destroy(): void {
    for (const img of this.imgs.values()) {
      this.scene.tweens.killTweensOf(img);
      img.destroy();
    }
    this.imgs.clear();
  }
}

/** 틱 → ms (화면 연출 길이 계산용) */
export function ticksToMs(ticks: number): number {
  return ticks * TICK_MS;
}
