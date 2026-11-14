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
 * - M2: 체력이 닳으면 머리 위 체력 바, 맞으면 0.1초 하얀 깜빡, 처치되면 0.3초 동안 납작해지며 사라짐 (ART.md 2.1).
 * - M3b 상태 이상 (statusModel.ts): 몸 색(빙결 하늘·정지 회색·기절 노랑·화상 주황·독 연두·둔화 갈색), 체력 바 위 아이콘 최대 4개,
 *   빙결이면 얼음 덩어리를 덧그림, 행동 불가(빙결·정지·기절) 동안은 걷기 흔들림을 멈춘다.
 */
import Phaser from 'phaser';
import { EYE_ICON_H, EYE_ICON_W, MOB_TEX_SIZE, SIZE_SCALE, MOB_LOOKS, ensureEyeIconTexture, ensureMobTexture } from '../../art/mobs';
import type { Mob } from '../../sim/entities/Mob';
import { directionAt, positionAt, type SimPath } from '../../sim/map';
import { unitsToPx, type MapLayout } from '../layout';
import { approachLean, leanTarget, mobPose, type MobMotion } from './mobPose';
import { ensureStatusTextures, statusIconKey } from '../../art/status';
import { MAX_STATUS_ICONS, NO_STATUS, type MobStatusView, type StatusIcon } from './statusModel';

/** 피격 깜빡 (ms) — ART.md 2.1 */
export const MOB_HIT_FLASH_MS = 100;
/** 사망 연출 (ms) — ART.md 2.1 */
export const MOB_DEATH_MS = 300;

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
  /** 피격 깜빡: 몸 위에 겹치는 하얀 그림 (몸 모양이 보이게 반투명) */
  private readonly flashImg: Phaser.GameObjects.Image;
  private readonly hpBg: Phaser.GameObjects.Rectangle;
  private readonly hpFill: Phaser.GameObjects.Rectangle;
  private readonly hpW: number;
  private readonly baseTint: number | null;
  private flashUntil = -1;
  private flashing = false;
  /** 처치 연출 시작 시각 (아니면 null) */
  private dyingAt: number | null = null;
  private facing = 1;
  /** 지금 기울기 (rad) — 목표 쪽으로 부드럽게 따라간다 */
  private lean = 0;
  private lastTimeMs: number | null = null;
  private readonly scene: Phaser.Scene;
  private readonly diameter: number;
  /** 상태 아이콘 (필요할 때 만든다, 최대 4개) */
  private readonly icons: Phaser.GameObjects.Image[] = [];
  private iconKeys: string = '';
  private readonly iconY: number;
  private readonly iconSize: number;
  /** 빙결 얼음 덩어리 (필요할 때 만든다) */
  private ice: Phaser.GameObjects.Rectangle | null = null;
  /** 지금 몸에 칠한 상태 색 (없으면 null) */
  private statusTint: number | null = null;
  /** 행동 불가로 걷기 흔들림을 멈춘 화면 시각 (아니면 null) */
  private pausedAt: number | null = null;
  /** 지금 상태 아이콘 수 (E2E) */
  iconCount = 0;

  constructor(scene: Phaser.Scene, mob: Mob, size: string, layout: MapLayout, art: MobArt) {
    this.id = mob.id;
    this.scene = scene;
    const key = ensureMobTexture(scene, mob.mob, art.legionColor(mob.legion));
    const diameter = layout.tile * (SIZE_SCALE[size] ?? 0.7);
    this.diameter = diameter;
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
    // 체력 바: 머리 위 (투명 몹은 👁 위). 체력이 닳았을 때만 보인다
    this.hpW = Math.max(diameter * 0.8, layout.tile * 0.5);
    const hpH = Math.max(4, layout.tile * 0.075);
    const hpY = (this.eyeIcon ? this.eyeY - eyeW * 0.45 : -diameter * 0.62) - hpH * 1.6;
    this.hpBg = scene.add.rectangle(0, hpY, this.hpW + 2, hpH + 2, 0x1a1020, 0.85).setVisible(false);
    this.hpFill = scene.add.rectangle(-this.hpW / 2, hpY, this.hpW, hpH, 0x5ee05e, 1).setOrigin(0, 0.5).setVisible(false);
    this.flashImg = scene.add.image(0, 0, key).setScale(this.baseScale).setOrigin(0.5, 0.62).setTintFill(0xffffff).setAlpha(0.6).setVisible(false);
    // 상태 아이콘 줄: 체력 바 바로 위
    this.iconSize = Math.max(16, layout.tile * 0.32);
    this.iconY = hpY - hpH - this.iconSize * 0.6;
    const parts: Phaser.GameObjects.GameObject[] = [this.shadow, this.body, this.flashImg];
    if (this.eyeIcon) parts.push(this.eyeIcon);
    parts.push(this.hpBg, this.hpFill);
    this.root = scene.add.container(0, 0, parts);
    // 황금비 위상: ID가 이웃해도 흔들림이 겹치지 않게
    this.phase = (mob.id * 2.399963) % (Math.PI * 2);
    const shape = MOB_LOOKS[mob.mob]?.shape;
    this.motion = shape === 'bat' ? 'flap' : shape === 'ghost' ? 'float' : 'walk';
    this.swarmOffset = mob.swarmIndex === 0 ? 0 : (mob.swarmIndex % 2 === 1 ? -1 : 1) * Math.ceil(mob.swarmIndex / 2) * SWARM_SPREAD * layout.tile;
    this.baseTint = this.invisible ? 0xd8c8ff : null;
    if (this.baseTint !== null) this.body.setTint(this.baseTint);
  }

  /** 맞음: 0.1초 하얀 깜빡. */
  flash(timeMs: number): void {
    this.flashUntil = timeMs + MOB_HIT_FLASH_MS;
  }

  /** 처치됨: 납작해지며 사라지는 연출 시작. */
  die(timeMs: number): void {
    if (this.dyingAt === null) this.dyingAt = timeMs;
    this.hpBg.setVisible(false);
    this.hpFill.setVisible(false);
    // 죽는 동안에는 상태 아이콘·얼음을 지운다 (사라지는 몸 위에 아이콘만 떠 있지 않게)
    for (const img of this.icons) img.setVisible(false);
    this.iconCount = 0;
    this.ice?.setVisible(false);
  }

  /** 처치 연출이 끝났는가. 연출 중이면 자세를 갱신한다. */
  updateDying(timeMs: number): boolean {
    if (this.dyingAt === null) return true;
    const k = (timeMs - this.dyingAt) / MOB_DEATH_MS;
    if (k >= 1) return true;
    const s = this.baseScale;
    this.flashImg.setVisible(true);
    this.body.setScale(s * (1 + 0.4 * k) * this.facing, s * (1 - 0.8 * k));
    this.flashImg.setScale(this.body.scaleX, this.body.scaleY).setPosition(this.body.x, this.body.y).setRotation(0);
    this.body.setRotation(0);
    this.root.setAlpha(1 - k);
    return false;
  }

  private setHp(ratio: number): void {
    const show = ratio < 1;
    if (this.hpBg.visible !== show) {
      this.hpBg.setVisible(show);
      this.hpFill.setVisible(show);
    }
    if (!show) return;
    const r = ratio < 0 ? 0 : ratio;
    this.hpFill.width = this.hpW * r;
    this.hpFill.fillColor = r > 0.5 ? 0x5ee05e : r > 0.25 ? 0xffc93c : 0xff5a4e;
  }

  /** 머리 위 👁가 있는가 (투명 몹) */
  get hasEyeIcon(): boolean {
    return this.eyeIcon !== null;
  }

  /**
   * @param progress 보간한 진행도 (단위, 소수 가능)
   * @param timeMs 화면 시간 (흔들림용)
   */
  /** 상태 이상 표시 (몸 색·아이콘·얼음). 바뀐 것만 다시 그린다. */
  private applyStatus(status: MobStatusView): void {
    const tint = status.tint;
    if (tint !== this.statusTint) {
      this.statusTint = tint;
      if (tint !== null) this.body.setTint(tint);
      else if (this.baseTint !== null) this.body.setTint(this.baseTint);
      else this.body.clearTint();
    }
    const keys = status.icons.join(',');
    if (keys !== this.iconKeys) {
      this.iconKeys = keys;
      this.layoutIcons(status.icons);
    }
    if (status.frozen && !this.ice) {
      const d = this.diameter;
      // 얼음 덩어리: 몸을 덮는 하늘색 반투명 네모 + 흰 테두리
      this.ice = this.scene.add.rectangle(0, -d * 0.14, d * 1.1, d * 1.1, 0x9fe8ff, 0.5).setStrokeStyle(Math.max(3, d * 0.07), 0xffffff, 0.95);
      this.root.addAt(this.ice, 3);
    }
    if (this.ice && this.ice.visible !== status.frozen) this.ice.setVisible(status.frozen);
  }

  private layoutIcons(list: readonly StatusIcon[]): void {
    const n = Math.min(list.length, MAX_STATUS_ICONS);
    while (this.icons.length < n) {
      ensureStatusTextures(this.scene);
      const img = this.scene.add.image(0, this.iconY, statusIconKey('slow')).setDisplaySize(this.iconSize, this.iconSize);
      this.icons.push(img);
      this.root.add(img);
    }
    const gap = this.iconSize * 1.05;
    for (let i = 0; i < this.icons.length; i++) {
      const img = this.icons[i] as Phaser.GameObjects.Image;
      if (i >= n) {
        img.setVisible(false);
        continue;
      }
      img
        .setTexture(statusIconKey(list[i] as StatusIcon))
        .setDisplaySize(this.iconSize, this.iconSize)
        .setPosition((i - (n - 1) / 2) * gap, this.iconY)
        .setVisible(true);
    }
    this.iconCount = n;
  }

  /** 상태 이상으로 몸 색이 바뀌었는가 (E2E) */
  get tinted(): boolean {
    return this.statusTint !== null;
  }

  update(path: SimPath, layout: MapLayout, progress: number, timeMs: number, hpRatio = 1, status: MobStatusView = NO_STATUS): void {
    this.applyStatus(status);
    // 행동 불가 동안은 걷기 자세를 멈춘 시각에 고정한다
    if (status.paused) this.pausedAt ??= timeMs;
    else this.pausedAt = null;
    const poseTime = this.pausedAt ?? timeMs;
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
    const pose = mobPose(this.motion, poseTime, this.phase);
    const s = this.baseScale;
    const bob = pose.bob * this.bobAmp;
    this.body.setPosition(0, bob);
    this.body.setScale(s * pose.sx * this.facing, s * pose.sy);
    this.body.setRotation(this.lean + pose.angle);
    this.shadow.setScale(1 + bob / (this.bobAmp * 12), 1);
    if (this.invisible) this.body.setAlpha(0.38 + 0.14 * Math.sin(timeMs * 0.006 + this.phase));
    if (this.eyeIcon) this.eyeIcon.setY(this.eyeY + bob);
    if (this.iconCount > 0) for (const img of this.icons) img.setY(this.iconY + bob);
    // 피격 깜빡
    const flash = timeMs < this.flashUntil;
    if (flash !== this.flashing) {
      this.flashing = flash;
      this.flashImg.setVisible(flash);
    }
    if (flash) {
      this.flashImg.setPosition(this.body.x, this.body.y);
      this.flashImg.setScale(this.body.scaleX, this.body.scaleY);
      this.flashImg.setRotation(this.body.rotation);
    }
    this.setHp(hpRatio);
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
  /** 처치 연출 중인 그림 (sim에서는 이미 사라짐) */
  private dying: MobSprite[] = [];
  /** 이번 프레임에 처치된 몹 id (sync에서 사라질 때 연출) */
  private readonly killed = new Set<number>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layout: MapLayout,
    private readonly path: SimPath,
    private readonly art: MobArt,
    private readonly sizeOf: (mobId: string) => string,
  ) {}

  /** 처치 사건: 다음 sync에서 사라질 때 납작해지는 연출. */
  markKilled(id: number): void {
    this.killed.add(id);
  }

  /** 피격 사건: 하얀 깜빡. */
  flash(id: number, timeMs: number): void {
    this.sprites.get(id)?.flash(timeMs);
  }

  /**
   * sim 몹 목록과 그림을 맞추고 위치·자세를 갱신한다.
   * @param prevProgress 직전 틱의 진행도 (id → 진행도). 없으면 보간 없이 지금 값
   * @param alpha 다음 틱까지 진행 비율 (0~1)
   */
  sync(mobs: readonly Mob[], prevProgress: ReadonlyMap<number, number>, alpha: number, timeMs: number, statusOf?: (mob: Mob) => MobStatusView): void {
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
      sprite.update(this.path, this.layout, progress, timeMs, mob.maxHp > 0 ? mob.hp / mob.maxHp : 1, statusOf ? statusOf(mob) : NO_STATUS);
    }
    for (const id of this.seen) {
      if (!seen.has(id)) {
        const sprite = this.sprites.get(id);
        this.sprites.delete(id);
        if (!sprite) continue;
        if (this.killed.has(id)) {
          sprite.die(timeMs);
          this.dying.push(sprite);
        } else sprite.destroy();
      }
    }
    this.killed.clear();
    this.seen = seen;
    if (this.dying.length > 0) {
      this.dying = this.dying.filter((s) => {
        if (!s.updateDying(timeMs)) return true;
        s.destroy();
        return false;
      });
    }
  }

  get count(): number {
    return this.sprites.size;
  }

  /** 상태 아이콘 전체 수 (E2E) */
  get statusIconCount(): number {
    let n = 0;
    for (const s of this.sprites.values()) n += s.iconCount;
    return n;
  }

  /** 상태 이상 색이 칠해진 몹 그림 수 (E2E) */
  get tintedCount(): number {
    let n = 0;
    for (const s of this.sprites.values()) if (s.tinted) n++;
    return n;
  }

  /** 머리 위 👁를 단 몹 그림 수 (E2E가 sim 투명 몹 수와 비교) */
  get eyeIconCount(): number {
    let n = 0;
    for (const s of this.sprites.values()) if (s.hasEyeIcon) n++;
    return n;
  }

  destroy(): void {
    for (const s of this.sprites.values()) s.destroy();
    for (const s of this.dying) s.destroy();
    this.sprites.clear();
    this.dying = [];
    this.seen.clear();
    this.killed.clear();
  }
}
