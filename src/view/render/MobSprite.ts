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
 * - M4 (statusModel.mobLookView): 드러난 투명 몹 = 보라 외곽선 + 덜 투명, 정예 = 금색 외곽선 + 1.3배, 보스 = 1.3칸 + 왕관 + 늘 보이는 굵은
 *   체력 바, 날아오른 박쥐 여왕 = 0.35칸 떠오르고 그림자 작게, 혼돈의 용 피해 감소 = 하늘색 보호막 고리, 방패병 보호막 = 체력 바 위 하늘색 줄,
 *   분열 조각 = 작게.
 * - 캐릭터 다양화 (art/characters/enemies.ts): 외형 데이터가 있는 적 32종은 새 그림(군단 색 강조·보라 눈·녹스 문양·계급 장식)으로,
 *   없는 적(도전 보스 등)은 예전 art/mobs.ts 그림으로 그린다. 같은 128단위 좌표라 크기·위치 계산은 그대로다.
 */
import Phaser from 'phaser';
import { effectsOff } from '../effects';
import { EYE_ICON_H, EYE_ICON_W, MOB_TEX_SIZE, SIZE_SCALE, MOB_LOOKS, ensureEyeIconTexture, ensureMobTexture } from '../../art/mobs';
import type { Mob } from '../../sim/entities/Mob';
import { directionAt, positionAt, type SimPath } from '../../sim/map';
import { unitsToPx, type MapLayout } from '../layout';
import { approachLean, bossPose, leanTarget, mobPose, type MobMotion } from './mobPose';
import { ensureStatusTextures, statusIconKey } from '../../art/status';
import { enemyCharacterTexture } from '../../art/characters/phaserArt';
import { enemyLook, lookScale } from '../../art/characters/looks';
import { MAX_STATUS_ICONS, NO_LOOK, NO_STATUS, type MobLookView, type MobStatusView, type StatusIcon } from './statusModel';

/** 피격 깜빡 (ms) — ART.md 2.1 */
export const MOB_HIT_FLASH_MS = 100;
/** 사망 연출 (ms) — ART.md 2.1 */
export const MOB_DEATH_MS = 300;

/** 떼 안 순번별 옆 간격 (칸) */
const SWARM_SPREAD = 0.24;
/** 몹 지름 상한 (칸, HF-2): 캐릭터별 크기 배수를 곱해도 보스 그림이 맵을 너무 덮지 않게 */
export const MOB_MAX_DIAMETER_TILES = 1.6;
/** 깊이: 맵 바닥(0)보다 위, HUD(DOM)는 따로 */
export const MOB_DEPTH_BASE = 1000;

export interface MobArt {
  legionColor(legion: string): number;
}

/** 드러난 투명 몹 외곽선 (보라) · 정예 외곽선 (금색) — ART.md 2.4 */
const OUTLINE_REVEALED = 0xb36bff;
const OUTLINE_ELITE = 0xffc93c;

export class MobSprite {
  readonly id: number;
  private readonly root: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  /** 투명 몹 머리 위 👁 (투명 몹만) */
  private readonly eyeIcon: Phaser.GameObjects.Image | null;
  private readonly eyeY: number;
  private readonly baseScale: number;
  /** 만들 때 쓴 크기 배율 (정예·작게·조각) — 바뀌면 MobLayer가 그림을 다시 만든다 (킹 슬라임 분열, 검토 반영) */
  readonly scaleMul: number;
  /** 캐릭터별 크기 배수 (HF-2, characterLooks.json scale; 외형 데이터가 없으면 1) */
  readonly artScale: number;
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
  /** M4: 외곽선 (드러난 투명 몹 보라 / 정예 금색) — 몸 뒤에 조금 크게 */
  private readonly outline: Phaser.GameObjects.Image;
  private outlineColor: number | null = null;
  /** M4: 보스·보호막 */
  private readonly boss: boolean;
  private readonly mobId: string;
  private readonly shieldBar: Phaser.GameObjects.Rectangle;
  private guardRing: Phaser.GameObjects.Ellipse | null = null;
  private look: MobLookView = NO_LOOK;
  /** 드러난 투명 몹 외곽선이 보이는가 (E2E) */
  revealedOutline = false;
  /** 새 캐릭터 그림(art/characters)으로 그렸는가 (E2E) */
  readonly newArt: boolean;

  constructor(scene: Phaser.Scene, mob: Mob, size: string, layout: MapLayout, art: MobArt, scaleMul = 1) {
    this.id = mob.id;
    this.scene = scene;
    this.boss = mob.boss;
    this.mobId = mob.mob;
    const legion = art.legionColor(mob.legion);
    const newArt = enemyCharacterTexture(scene, mob.mob, legion);
    const key = newArt ? newArt.key : ensureMobTexture(scene, mob.mob, legion);
    this.scaleMul = scaleMul;
    // 캐릭터별 크기 배수 (HF-2, characterLooks.json scale — 새 그림·절차 그림 모두): 몸집 분류 크기 × 배수, 상한 MOB_MAX_DIAMETER_TILES
    this.artScale = lookScale(enemyLook(mob.mob));
    const diameter = Math.min(layout.tile * (SIZE_SCALE[size] ?? 0.7) * this.artScale, layout.tile * MOB_MAX_DIAMETER_TILES) * scaleMul;
    this.diameter = diameter;
    this.baseScale = diameter / (newArt ? newArt.size : MOB_TEX_SIZE);
    this.newArt = newArt !== null;
    this.shadow = scene.add.ellipse(0, diameter * 0.36, diameter * 0.78, diameter * 0.26, 0x000000, 0.22);
    this.outline = scene.add.image(0, 0, key).setScale(this.baseScale * 1.16).setOrigin(0.5, 0.62).setTintFill(OUTLINE_REVEALED).setVisible(false);
    this.body = scene.add.image(0, 0, key).setScale(this.baseScale).setOrigin(0.5, 0.62);
    this.invisible = mob.invisible;
    this.bobAmp = layout.tile * 0.07;
    // 👁: 그림 위쪽 끝(원점 0.62 → 위로 0.62 × 지름)보다 조금 더 위, 지름의 60% 너비. 몸과 같이 튄다
    const eyeW = diameter * 0.6;
    this.eyeY = -diameter * 0.62 - eyeW * 0.2;
    this.eyeIcon = this.invisible
      ? scene.add.image(0, this.eyeY, ensureEyeIconTexture(scene)).setDisplaySize(eyeW, (eyeW * EYE_ICON_H) / EYE_ICON_W).setAlpha(0.95)
      : null;
    // 체력 바: 머리 위 (투명 몹은 👁 위). 체력이 닳았을 때만 보인다 (보스는 늘, 더 굵게)
    this.hpW = Math.max(diameter * 0.8, layout.tile * 0.5);
    const hpH = Math.max(4, layout.tile * (this.boss ? 0.11 : 0.075));
    const hpY = (this.eyeIcon ? this.eyeY - eyeW * 0.45 : -diameter * 0.62) - hpH * 1.6;
    this.hpBg = scene.add.rectangle(0, hpY, this.hpW + 2, hpH + 2, 0x1a1020, 0.85).setVisible(false);
    this.hpFill = scene.add.rectangle(-this.hpW / 2, hpY, this.hpW, hpH, 0x5ee05e, 1).setOrigin(0, 0.5).setVisible(false);
    // 보호막 줄 (방패병): 체력 바 바로 위 하늘색
    this.shieldBar = scene.add.rectangle(-this.hpW / 2, hpY - hpH, this.hpW, Math.max(3, hpH * 0.7), 0x8fd8ff, 1).setOrigin(0, 0.5).setVisible(false);
    this.flashImg = scene.add.image(0, 0, key).setScale(this.baseScale).setOrigin(0.5, 0.62).setTintFill(0xffffff).setAlpha(0.6).setVisible(false);
    // 상태 아이콘 줄: 체력 바 바로 위
    this.iconSize = Math.max(16, layout.tile * 0.32);
    this.iconY = hpY - hpH - this.iconSize * 0.6;
    const parts: Phaser.GameObjects.GameObject[] = [this.shadow, this.outline, this.body, this.flashImg];
    if (this.eyeIcon) parts.push(this.eyeIcon);
    parts.push(this.hpBg, this.hpFill, this.shieldBar);
    this.root = scene.add.container(0, 0, parts);
    // 황금비 위상: ID가 이웃해도 흔들림이 겹치지 않게
    this.phase = (mob.id * 2.399963) % (Math.PI * 2);
    const shape = MOB_LOOKS[mob.mob]?.shape;
    this.motion = newArt ? newArt.motion : shape === 'bat' ? 'flap' : shape === 'ghost' ? 'float' : 'walk';
    this.swarmOffset = mob.swarmIndex === 0 ? 0 : (mob.swarmIndex % 2 === 1 ? -1 : 1) * Math.ceil(mob.swarmIndex / 2) * SWARM_SPREAD * layout.tile;
    this.baseTint = this.invisible ? 0xd8c8ff : null;
    if (this.baseTint !== null) this.body.setTint(this.baseTint);
  }

  /** 맞음: 0.1초 하얀 깜빡. */
  flash(timeMs: number): void {
    if (effectsOff()) return; // 연출 끄기 (T-2)
    this.flashUntil = timeMs + MOB_HIT_FLASH_MS;
  }

  /** 처치됨: 납작해지며 사라지는 연출 시작. */
  die(timeMs: number): void {
    // 연출 끄기 (T-2): 납작해지는 연출 없이 바로 사라진다
    if (this.dyingAt === null) this.dyingAt = effectsOff() ? timeMs - MOB_DEATH_MS : timeMs;
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
    const show = ratio < 1 || this.boss;
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

  /** M4 겉모습: 외곽선(드러남 보라 > 정예 금색)·보호막 고리·보호막 줄. 바뀐 것만. */
  private applyLook(look: MobLookView): void {
    this.look = look;
    const color = look.revealed ? OUTLINE_REVEALED : look.elite ? OUTLINE_ELITE : null;
    if (color !== this.outlineColor) {
      this.outlineColor = color;
      if (color === null) this.outline.setVisible(false);
      else this.outline.setTintFill(color).setVisible(true);
    }
    this.revealedOutline = look.revealed;
    if (look.guard && !this.guardRing) {
      const d = this.diameter;
      this.guardRing = this.scene.add.ellipse(0, -d * 0.14, d * 1.3, d * 1.3, 0x8fd8ff, 0.18).setStrokeStyle(Math.max(3, d * 0.05), 0xbfeaff, 0.95);
      this.root.add(this.guardRing);
    }
    if (this.guardRing && this.guardRing.visible !== look.guard) this.guardRing.setVisible(look.guard);
    const showShield = look.shield > 0;
    if (this.shieldBar.visible !== showShield) this.shieldBar.setVisible(showShield);
    if (showShield) this.shieldBar.width = this.hpW * look.shield;
  }

  update(path: SimPath, layout: MapLayout, progress: number, timeMs: number, hpRatio = 1, status: MobStatusView = NO_STATUS, look: MobLookView = NO_LOOK): void {
    this.applyStatus(status);
    this.applyLook(look);
    // 행동 불가 동안은 걷기 자세를 멈춘 시각에 고정한다
    if (status.paused) this.pausedAt ??= timeMs;
    else this.pausedAt = null;
    // 연출 끄기 (T-2): 걷기 흔들림 없이 한 자세로
    const poseTime = effectsOff() ? 0 : (this.pausedAt ?? timeMs);
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
    const pose = this.boss ? bossPose(this.mobId, this.motion, poseTime, this.phase) : mobPose(this.motion, poseTime, this.phase);
    const s = this.baseScale;
    // 날아오른 박쥐 여왕: 0.35칸 떠오르고 그림자가 작아진다
    const lift = this.look.flying ? -layout.tile * 0.35 : 0;
    const bob = pose.bob * this.bobAmp + lift;
    this.body.setPosition(0, bob);
    this.body.setScale(s * pose.sx * this.facing, s * pose.sy);
    this.body.setRotation(this.lean + pose.angle);
    if (this.outline.visible) {
      this.outline.setPosition(0, bob);
      this.outline.setScale(s * 1.16 * pose.sx * this.facing, s * 1.16 * pose.sy);
      this.outline.setRotation(this.body.rotation);
    }
    this.shadow.setScale(this.look.flying ? 0.6 : 1 + (bob - lift) / (this.bobAmp * 12), this.look.flying ? 0.6 : 1);
    if (this.guardRing?.visible) this.guardRing.setY(-this.diameter * 0.14 + bob).setAlpha(0.75 + 0.25 * Math.sin(timeMs * 0.008));
    // 투명 몹: 드러나지 않으면 일렁이는 반투명(38±14%), 드러나면 85% + 보라 외곽선
    if (this.invisible) {
      const a = this.look.revealed ? 0.85 : 0.38 + 0.14 * Math.sin(timeMs * 0.006 + this.phase);
      this.body.setAlpha(a);
      this.outline.setAlpha(this.look.revealed ? 0.9 : 0);
    }
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
    /** 몹 그림 크기 배율 (정예·조각, statusModel.mobScaleMul) */
    private readonly scaleOf: (mob: Mob) => number = () => 1,
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
  sync(
    mobs: readonly Mob[],
    prevProgress: ReadonlyMap<number, number>,
    alpha: number,
    timeMs: number,
    statusOf?: (mob: Mob) => MobStatusView,
    lookOf?: (mob: Mob) => MobLookView,
  ): void {
    const seen = new Set<number>();
    for (const mob of mobs) {
      seen.add(mob.id);
      let sprite = this.sprites.get(mob.id);
      const scaleMul = this.scaleOf(mob);
      // 크기 배율이 바뀌면(킹 슬라임 분열 = 원래 보스 엔티티가 나중에 조각(part)이 됨) 그림을 다시 만든다 —
      // 만들 때만 계산하면 원래 몸만 크게 남아 같은 조각 둘의 크기가 달랐다 (검토 반영)
      if (sprite && sprite.scaleMul !== scaleMul) {
        sprite.destroy();
        sprite = undefined;
      }
      if (!sprite) {
        sprite = new MobSprite(this.scene, mob, this.sizeOf(mob.mob), this.layout, this.art, scaleMul);
        this.sprites.set(mob.id, sprite);
      }
      const prev = prevProgress.get(mob.id);
      const progress = prev === undefined ? mob.progress : prev + (mob.progress - prev) * alpha;
      sprite.update(
        this.path,
        this.layout,
        progress,
        timeMs,
        mob.maxHp > 0 ? mob.hp / mob.maxHp : 1,
        statusOf ? statusOf(mob) : NO_STATUS,
        lookOf ? lookOf(mob) : NO_LOOK,
      );
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

  /** 보라 외곽선(드러난 투명 몹)이 보이는 몹 그림 수 (E2E) */
  get revealedOutlineCount(): number {
    let n = 0;
    for (const s of this.sprites.values()) if (s.revealedOutline) n++;
    return n;
  }

  /** 그 몹 그림의 크기 배율 (E2E가 statusModel.mobScaleMul과 비교). 그림이 없으면 null */
  scaleMulOf(id: number): number | null {
    return this.sprites.get(id)?.scaleMul ?? null;
  }

  /** 그 몹 그림의 캐릭터별 크기 배수 (E2E, HF-2). 그림이 없으면 null */
  artScaleOf(id: number): number | null {
    return this.sprites.get(id)?.artScale ?? null;
  }

  /** 새 캐릭터 그림으로 그린 몹 수 (E2E) */
  get newArtCount(): number {
    let n = 0;
    for (const s of this.sprites.values()) if (s.newArt) n++;
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
