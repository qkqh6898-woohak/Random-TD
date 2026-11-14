/**
 * 투사체 그리기 (DEV_PLAN M2-5): sim 투사체 목록과 맞춰 그림을 만들고 지운다.
 *
 * - 물리 = 화살 (나는 방향으로 돌림), 마법 = 하늘색 마법구, 고정 = 노란 마법구.
 * - 위치는 직전 틱 → 지금 틱 사이를 보간(alpha). 이번 틱에 새로 생긴 투사체는 쏜 타워 칸 중심에서 출발한 것으로 보간한다.
 * - 깊이는 몹·타워 위.
 */
import Phaser from 'phaser';
import { TEX_ARROW, TEX_ORB } from '../../art/fx';
import type { Projectile } from '../../sim/entities/Projectile';
import { unitsToPx, type MapLayout } from '../layout';

export const PROJECTILE_DEPTH = 5000;

/** 투사체 모양 */
export type ProjectileLook = 'arrow' | 'magic' | 'true';

export interface ProjectileArt {
  look(towerId: string): ProjectileLook;
}

const ORB_TINT: Record<Exclude<ProjectileLook, 'arrow'>, number> = { magic: 0x8fd8ff, true: 0xffd84a };

export class ProjectileLayer {
  private readonly sprites = new Map<number, Phaser.GameObjects.Image>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layout: MapLayout,
    private readonly art: ProjectileArt,
  ) {}

  /**
   * @param prev 직전 틱 위치 (id → 단위 좌표). 없으면 from(쏜 자리)에서 보간
   * @param from 투사체 id → 출발 위치 (쏜 타워 칸 중심). 없으면 지금 위치
   */
  sync(
    list: readonly Projectile[],
    prev: ReadonlyMap<number, { x: number; y: number }>,
    from: (p: Projectile) => { x: number; y: number } | null,
    alpha: number,
  ): void {
    const seen = new Set<number>();
    const L = this.layout;
    for (const p of list) {
      seen.add(p.id);
      let img = this.sprites.get(p.id);
      const look = this.art.look(p.tower);
      if (!img) {
        if (look === 'arrow') {
          img = this.scene.add.image(0, 0, TEX_ARROW).setDisplaySize(L.tile * 0.5, L.tile * 0.125);
        } else {
          img = this.scene.add.image(0, 0, TEX_ORB).setDisplaySize(L.tile * 0.34, L.tile * 0.34).setTint(ORB_TINT[look]);
          img.setBlendMode(Phaser.BlendModes.ADD);
        }
        img.setDepth(PROJECTILE_DEPTH);
        this.sprites.set(p.id, img);
      }
      const a = prev.get(p.id) ?? from(p) ?? p;
      const ux = a.x + (p.x - a.x) * alpha;
      const uy = a.y + (p.y - a.y) * alpha;
      const px = unitsToPx(L, ux, uy);
      img.setPosition(px.x, px.y);
      if (look === 'arrow' && (p.x !== a.x || p.y !== a.y)) img.setRotation(Math.atan2(p.y - a.y, p.x - a.x));
    }
    for (const [id, img] of this.sprites) {
      if (!seen.has(id)) {
        img.destroy();
        this.sprites.delete(id);
      }
    }
  }

  get count(): number {
    return this.sprites.size;
  }

  destroy(): void {
    for (const img of this.sprites.values()) img.destroy();
    this.sprites.clear();
  }
}
