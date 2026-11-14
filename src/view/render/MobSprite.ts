/**
 * 몹 그리기 (DEV_PLAN M1-7): 임시 도형 텍스처 + 걷기 흔들림 + 그림자.
 *
 * - 위치는 sim 진행도를 보간(alpha)해서 경로 위 점으로 바꾼다 → 모서리를 깎지 않고 경로를 그대로 따라간다.
 * - 걷기 (ART.md 2.1): 0.6초 주기로 통통 튀기 + 눌림 + 좌우 흔들림, 이동 방향(가로 성분) 쪽으로 몸 기울기.
 *   주기는 속도와 상관없이 같다. 박쥐는 날갯짓(가로 크기), 유령은 둥실둥실. 자세 계산은 mobPose.ts(순수 함수, 단위 테스트).
 *   몹마다 시작 위상이 달라 무리가 같이 출렁이지 않는다.
 * - 고블린 떼는 같은 진행도라 떼 안 순번(swarmIndex)으로 진행 방향의 옆으로 살짝 벌려 그린다 (화면만, sim과 무관).
 * - 투명 몹: 일렁이는 반투명 실루엣 + 머리 위 👁 아이콘 (ENEMIES.md 5장 '화면 표시'). 드러난 상태의 보라 외곽선은 M4.
 * - 아래쪽 몹이 위에 그려지게 깊이 = 화면 y.
 */
import Phaser from 'phaser';
import { EYE_ICON_H, EYE_ICON_W, MOB_TEX_SIZE, SIZE_SCALE, MOB_LOOKS, ensureEyeIconTexture, ensureMobTexture } from '../../art/mobs';
import type { Mob } from '../../sim/entities/Mob';
import { directionAt, positionAt, type SimPath } from '../../sim/map';
import { unitsToPx, type MapLayout } from '../layout';
import { approachLean, leanTarget, mobPose, type MobMotion } from './mobPose';

/** 떼 안 순번별 옆 간격 (칸) */
const SWARM_SPREAD = 0.24;
/** 깊이: 맵 바닥(0)보다 위, HUD(DOM)는 따로 */
export const MOB_DEPTH_BASE = 1000;

export interface MobArt {
  legionColor(legion: string): number;
}

export class MobSprite {
  readonly id: number;
  private readonly root: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  /** 투명 몹 머리 위 👁 (투명 몹만) */
  private readonly eyeIcon: Phaser.GameObjects.Image | null;
  private readonly eyeY: number;
  private readonly baseScale: number;
  private readonly phase: number;
  private readonly bobAmp: number;
  private readonly motion: MobMotion;
  private readonly invisible: boolean;
  private readonly swarmOffset: number;
  private facing = 1;
  /** 지금 기울기 (rad) — 목표 쪽으로 부드럽게 따라간다 */
  private lean = 0;
  private lastTimeMs: number | null = null;

  constructor(scene: Phaser.Scene, mob: Mob, size: string, layout: MapLayout, art: MobArt) {
    this.id = mob.id;
    const key = ensureMobTexture(scene, mob.mob, art.legionColor(mob.legion));
    const diameter = layout.tile * (SIZE_SCALE[size] ?? 0.7);
    this.baseScale = diameter / MOB_TEX_SIZE;
    this.shadow = scene.add.ellipse(0, diameter * 0.36, diameter * 0.78, diameter * 0.26, 0x000000, 0.22);
    this.body = scene.add.image(0, 0, key).setScale(this.baseScale).setOrigin(0.5, 0.62);
    this.invisible = mob.invisible;
    this.bobAmp = layout.tile * 0.07;
    // 👁: 그림 위쪽 끝(원점 0.62 → 위로 0.62 × 지름)보다 조금 더 위, 지름의 60% 너비. 몸과 같이 튄다
    const eyeW = diameter * 0.6;
    this.eyeY = -diameter * 0.62 - eyeW * 0.2;
    this.eyeIcon = this.invisible
      ? scene.add.image(0, this.eyeY, ensureEyeIconTexture(scene)).setDisplaySize(eyeW, (eyeW * EYE_ICON_H) / EYE_ICON_W).setAlpha(0.95)
      : null;
    this.root = scene.add.container(0, 0, this.eyeIcon ? [this.shadow, this.body, this.eyeIcon] : [this.shadow, this.body]);
    // 황금비 위상: ID가 이웃해도 흔들림이 겹치지 않게
    this.phase = (mob.id * 2.399963) % (Math.PI * 2);
    const shape = MOB_LOOKS[mob.mob]?.shape;
    this.motion = shape === 'bat' ? 'flap' : shape === 'ghost' ? 'float' : 'walk';
    this.swarmOffset = mob.swarmIndex === 0 ? 0 : (mob.swarmIndex % 2 === 1 ? -1 : 1) * Math.ceil(mob.swarmIndex / 2) * SWARM_SPREAD * layout.tile;
    if (this.invisible) this.body.setTint(0xd8c8ff);
  }

  /** 머리 위 👁가 있는가 (투명 몹) */
  get hasEyeIcon(): boolean {
    return this.eyeIcon !== null;
  }

  /**
   * @param progress 보간한 진행도 (단위, 소수 가능)
   * @param timeMs 화면 시간 (흔들림용)
   */
  update(path: SimPath, layout: MapLayout, progress: number, timeMs: number): void {
    const p = positionAt(path, progress);
    const dir = directionAt(path, progress);
    let { x, y } = unitsToPx(layout, p.x, p.y);
    if (this.swarmOffset !== 0) {
      // 진행 방향에 수직 (-dy, dx)으로 벌리고 살짝 뒤로
      x += -dir.dy * this.swarmOffset - dir.dx * Math.abs(this.swarmOffset) * 0.35;
      y += dir.dx * this.swarmOffset - dir.dy * Math.abs(this.swarmOffset) * 0.35;
    }
    if (dir.dx !== 0) this.facing = dir.dx > 0 ? 1 : -1;
    // 이동 방향 기울기: 모서리에서 뒤집힐 때 툭 바뀌지 않게 목표 쪽으로 따라간다 (처음 그릴 때는 바로 목표)
    const target = leanTarget(this.motion, dir.dx);
    this.lean = this.lastTimeMs === null ? target : approachLean(this.lean, target, timeMs - this.lastTimeMs);
    this.lastTimeMs = timeMs;
    const pose = mobPose(this.motion, timeMs, this.phase);
    const s = this.baseScale;
    const bob = pose.bob * this.bobAmp;
    this.body.setPosition(0, bob);
    this.body.setScale(s * pose.sx * this.facing, s * pose.sy);
    this.body.setRotation(this.lean + pose.angle);
    this.shadow.setScale(1 + bob / (this.bobAmp * 12), 1);
    if (this.invisible) this.body.setAlpha(0.38 + 0.14 * Math.sin(timeMs * 0.006 + this.phase));
    if (this.eyeIcon) this.eyeIcon.setY(this.eyeY + bob);
    this.root.setPosition(x, y);
    this.root.setDepth(MOB_DEPTH_BASE + y);
  }

  destroy(): void {
    this.root.destroy();
  }
}

/** 화면의 몹 그림 묶음: sim 몹 목록과 맞춰 만들고 지운다. */
export class MobLayer {
  private readonly sprites = new Map<number, MobSprite>();
  private seen = new Set<number>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layout: MapLayout,
    private readonly path: SimPath,
    private readonly art: MobArt,
    private readonly sizeOf: (mobId: string) => string,
  ) {}

  /**
   * @param prevProgress 직전 틱의 진행도 (id → 진행도). 없으면 보간 없이 지금 값
   * @param alpha 다음 틱까지 진행 비율 (0~1)
   */
  sync(mobs: readonly Mob[], prevProgress: ReadonlyMap<number, number>, alpha: number, timeMs: number): void {
    const seen = new Set<number>();
    for (const mob of mobs) {
      seen.add(mob.id);
      let sprite = this.sprites.get(mob.id);
      if (!sprite) {
        sprite = new MobSprite(this.scene, mob, this.sizeOf(mob.mob), this.layout, this.art);
        this.sprites.set(mob.id, sprite);
      }
      const prev = prevProgress.get(mob.id);
      const progress = prev === undefined ? mob.progress : prev + (mob.progress - prev) * alpha;
      sprite.update(this.path, this.layout, progress, timeMs);
    }
    for (const id of this.seen) {
      if (!seen.has(id)) {
        this.sprites.get(id)?.destroy();
        this.sprites.delete(id);
      }
    }
    this.seen = seen;
  }

  get count(): number {
    return this.sprites.size;
  }

  /** 머리 위 👁를 단 몹 그림 수 (E2E가 sim 투명 몹 수와 비교) */
  get eyeIconCount(): number {
    let n = 0;
    for (const s of this.sprites.values()) if (s.hasEyeIcon) n++;
    return n;
  }

  destroy(): void {
    for (const s of this.sprites.values()) s.destroy();
    this.sprites.clear();
    this.seen.clear();
  }
}
