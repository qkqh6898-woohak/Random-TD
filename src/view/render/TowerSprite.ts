/**
 * 타워 그리기 (DEV_PLAN M2-8): 임시 SD 캐릭터 + 대기 동작 상시 반복.
 *
 * - 칸 중심 조금 아래에 받침대(등급 색), 그 위에 캐릭터(종족 색·소품·별). 그림은 art/towers.ts가 한 번 구운 텍스처.
 * - 대기 동작: 숨쉬기 1.5초 + 위아래 흔들림 + 3초마다 작은 고유 동작 자리 (towerPose.ts, 순수 함수).
 *   시작 위상은 타워마다 무작위 (화면 쪽 Math.random — sim과 무관) → 같은 타워 여러 개가 똑같이 움직이지 않는다.
 *   공격하지 않아도 계속 움직인다. 트윈 대신 매 프레임 시각으로 자세를 계산한다.
 * - 공격 사건이 오면 대상 쪽으로 몸을 내밀고(0.25초 또는 공격 간격의 60%) 대상 쪽을 바라본다.
 * - 소환 직후 0.52초 등장 동작.
 * - 깊이 = 발밑 화면 y (몹과 같은 기준) → 아래쪽이 위에 그려진다.
 * - M3-10: 이동·교환으로 칸이 바뀌면 0.14초 동안 새 칸으로 미끄러진다. 길게 눌러 끄는 동안은 손가락 위로 들려 따라온다.
 * - 캐릭터 다양화 (art/characters): 외형 데이터(characterLooks.json)가 있는 타워는 파츠 그림(등·몸·소품·동반자 + 오라·입자)으로 그리고,
 *   캐릭터별 대기 동작 프리셋(캐기·두드리기·저글링·날갯짓…)으로 파츠가 따로 움직인다. 데이터가 없는 타워만 예전 한 장 그림.
 *   각성 외형은 TowerArt.awakened(타워 종류)가 true일 때 (M8 타워 성장 Lv15가 연결할 자리).
 */
import Phaser from 'phaser';
import { effectsOff } from '../effects';
import {
  FIGURE_ORIGIN_X,
  FIGURE_ORIGIN_Y,
  FIGURE_TEX_H,
  PEDESTAL_ORIGIN_Y,
  PEDESTAL_TEX_W,
  SPECIAL_FACTION_COLORS,
  ensureContactShadowTexture,
  ensureFactionEmblemTexture,
  ensurePedestalTexture,
  ensureStarBadgeTexture,
  ensureTowerTexture,
  type TowerLookInput,
} from '../../art/towers';
import { TEX_SPARK, ensureFxTextures } from '../../art/fx';
import { EMBLEM_SIZE, STAR_BADGE } from '../../art/presentation';
import { prefersReducedMotion } from '../../ui/motion';
import { compose } from '../../art/characters/compose';
import { fxOf } from '../../art/characters/draw';
import { IDLE_PRESETS, idleParts, type IdlePreset } from '../../art/characters/idle';
import { lookScale, towerLook } from '../../art/characters/looks';
import { CharacterFigure, towerCharacterTexture, towerPortraitKey } from '../../art/characters/phaserArt';
import type { Tower } from '../../sim/entities/Tower';
import { tileCenterPx, unitsToPx, type MapLayout } from '../layout';
import { MOB_DEPTH_BASE } from './MobSprite';
import { attackAnimMs, towerPose } from './towerPose';
import { battleFigureScale, FIGURE_TILES, FOOT_OFFSET_TILES, fillOccupancy, isCrowded, occupancyKey, PEDESTAL_WIDTH_TILES, pedestalScaleFor, STAR_BADGE_W_TILES, STAR_BADGE_Y_TILES } from './towerGeom';
import { stackArtScale, stackSlot, type StackSlot } from './stackGeom';

/** 이동·교환 뒤 새 칸으로 미끄러지는 시간 (ms) */
const SLIDE_MS = 140;
/** 끄는 중인 타워는 몹·다른 타워 위에 그린다 */
const DRAG_DEPTH = 6500;

export interface TowerArt {
  look(towerId: string): TowerLookInput;
  factionColor(faction: string): string | undefined;
  /** 공격 간격 (ms) — 공격 동작 길이 계산용 */
  attackIntervalMs(towerId: string): number;
  /** 각성 외형으로 그리나 (타워 성장 Lv15, M8). 없으면 기본 외형 */
  awakened?(towerId: string): boolean;
}

/** 연출 끄기 (T-2) 때의 고정 자세 */
const STILL_POSE = Object.freeze({ bob: 0, sx: 1, sy: 1, angle: 0, lunge: 0, dx: 0, gesture: -1, attackK: 0, sway: 0, punch: 0, glint: 0, glintX: 0, glintY: 0 });

/**
 * G-2 캐릭터 겉모습 (칸 배수, 발밑 기준): 별 배지는 받침대 앞(칸 안), 종족 문장은 받침대 왼쪽 앞, 접지 그림자는 발밑.
 * 모두 칸 아래 끝(+0.5칸 = 발밑 +0.2칸) 안 → 탭 판정·정보 패널 배치(받침대 아래 +0.475칸)와 겹치지 않는다.
 */
// 별 배지 값은 towerGeom (순수, 단위 테스트) — FB-D1 #22 0.72칸. E2E(feedback-design)가 이 파일에서 읽으므로 다시 내보낸다.
export { STAR_BADGE_W_TILES, STAR_BADGE_Y_TILES };
export const EMBLEM_X_TILES = -0.36;
export const EMBLEM_Y_TILES = 0.05;
export const EMBLEM_D_TILES = 0.25;
/** 접지 그림자 너비 (칸 배수 × 그림 크기 배수, 상한 0.8칸) */
const CONTACT_SHADOW_TILES = 0.22;

export class TowerSprite {
  readonly id: number;
  /** 그림을 만든 타워 종류 (towers.json id). sim에서 같은 엔티티의 종류가 바뀌면(승급의 축복 [바꾸기]) TowerLayer가 다시 만든다 */
  readonly towerType: string;
  private readonly root: Phaser.GameObjects.Container;
  /** 캐릭터 (파츠 그림이면 컨테이너, 예전 한 장 그림이면 Image) — 변환(흔들림·크기·기울기)을 받는 쪽 */
  private readonly figure: Phaser.GameObjects.Container | Phaser.GameObjects.Image;
  /** 파츠 그림 (외형 데이터가 없는 타워는 null) */
  private readonly character: CharacterFigure | null;
  private readonly preset: IdlePreset | null;
  private readonly scale: number;
  private readonly lookScale: number;
  /** 캐릭터별 크기에 전투 확대와 위치를 반영한 배수. 터치와 정보 패널도 사용한다. */
  artScale: number;
  private readonly tile: number;
  private readonly seed: number;
  private readonly attackMs: number;
  private readonly layout: MapLayout;
  private baseX: number;
  private baseY: number;
  private tx: number;
  private ty: number;
  /** 이동·교환으로 칸이 바뀌면 이전 자리에서 미끄러져 온다 */
  private slideFrom: { x: number; y: number; at: number } | null = null;
  /** 끄는 중이면 손가락 위치 (화면 px) */
  private dragAt: { x: number; y: number } | null = null;
  private facing = 1;
  private attackAtMs: number | null = null;
  private appearAtMs: number | null = null;
  private lungeDx = 0;
  private lungeDy = 0;
  /** 혼돈의 용에게 기절 중 (M4-5): 잿빛 + 떨림 */
  private stunned = false;
  /** G-2: 발밑 접지 그림자 · 반짝임 · 공격 타격 빛 · 별 배지 · 종족 문장 */
  private readonly contactShadow: Phaser.GameObjects.Image;
  private readonly pedestal: Phaser.GameObjects.Image;
  private readonly pedestalBase: number;
  private readonly glintImg: Phaser.GameObjects.Image;
  private readonly punchImg: Phaser.GameObjects.Image;
  readonly starBadge: Phaser.GameObjects.Image;
  readonly emblem: Phaser.GameObjects.Image;
  /** G-1 칸 무더기: 같은 칸 안 자리 (칸 배수)와 크기 배수 — 1개면 0·0·1 */
  private slot: StackSlot = { dx: 0, dy: 0, scale: 1 };
  /** G-1: 같은 칸 다른 타워를 끄는 중이면 그 손가락 위치 (무더기를 통째로 든다) */
  private groupDragAt: { x: number; y: number } | null = null;

  constructor(scene: Phaser.Scene, tower: Tower, layout: MapLayout, art: TowerArt) {
    this.id = tower.id;
    this.towerType = tower.tower;
    const look = art.look(tower.tower);
    const pedKey = ensurePedestalTexture(scene, look.grade);
    this.tile = layout.tile;
    this.layout = layout;
    const charLook = towerLook(tower.tower);
    const awakened = art.awakened?.(tower.tower) ?? false;
    this.lookScale = lookScale(charLook, awakened);
    this.artScale = this.lookScale;
    this.scale = (layout.tile * FIGURE_TILES) / FIGURE_TEX_H;
    this.tx = tower.tx;
    this.ty = tower.ty;
    const c = tileCenterPx(layout, tower.tx, tower.ty);
    this.baseX = c.x;
    this.baseY = c.y + layout.tile * FOOT_OFFSET_TILES;
    const pedestal = scene.add.image(0, 0, pedKey).setOrigin(0.5, PEDESTAL_ORIGIN_Y);
    this.pedestalBase = (layout.tile * PEDESTAL_WIDTH_TILES) / PEDESTAL_TEX_W;
    pedestal.setScale(this.pedestalBase * pedestalScaleFor(this.artScale));
    this.pedestal = pedestal;
    if (charLook) {
      const tex = towerCharacterTexture(scene, charLook, awakened);
      this.character = new CharacterFigure(scene, tex);
      this.preset = IDLE_PRESETS[tex.render.look.idle ?? 'hop'];
      this.figure = scene.add.container(0, 0, [this.character.container]).setScale(this.scale);
    } else {
      const color = art.factionColor(look.faction) ?? SPECIAL_FACTION_COLORS[look.faction] ?? '#888888';
      const figKey = ensureTowerTexture(scene, look, color);
      this.character = null;
      this.preset = null;
      this.figure = scene.add.image(0, 0, figKey).setOrigin(FIGURE_ORIGIN_X, FIGURE_ORIGIN_Y).setScale(this.scale);
    }
    // G-2 겉모습: 접지 그림자(받침대 위·캐릭터 아래), 반짝임·타격 빛(캐릭터 위, 더하기 섞기), 별 배지·종족 문장(맨 앞)
    ensureFxTextures(scene);
    const t = layout.tile;
    this.contactShadow = scene.add.image(0, 0, ensureContactShadowTexture(scene));
    this.glintImg = scene.add.image(0, 0, TEX_SPARK).setBlendMode(Phaser.BlendModes.ADD).setTint(0xfff3c4).setVisible(false);
    this.punchImg = scene.add.image(0, 0, TEX_SPARK).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffe6a0).setVisible(false);
    this.starBadge = scene.add.image(0, t * STAR_BADGE_Y_TILES, ensureStarBadgeTexture(scene, look.grade)).setScale((t * STAR_BADGE_W_TILES) / STAR_BADGE.w);
    const factionColor = art.factionColor(look.faction) ?? SPECIAL_FACTION_COLORS[look.faction] ?? '#888888';
    this.emblem = scene.add
      .image(t * EMBLEM_X_TILES, t * EMBLEM_Y_TILES, ensureFactionEmblemTexture(scene, look.faction, factionColor))
      .setScale((t * EMBLEM_D_TILES) / EMBLEM_SIZE);
    this.root = scene.add.container(this.baseX, this.baseY, [pedestal, this.contactShadow, this.figure, this.glintImg, this.punchImg, this.emblem, this.starBadge]);
    this.root.setDepth(MOB_DEPTH_BASE + this.baseY);
    this.seed = Math.random();
    this.attackMs = attackAnimMs(art.attackIntervalMs(tower.tower));
    // 처음 바라보는 쪽도 무작위 (모두 같은 쪽을 보지 않게)
    this.facing = this.seed < 0.5 ? 1 : -1;
  }

  /** 소환 직후 등장 동작. */
  appear(timeMs: number): void {
    if (effectsOff()) return; // 연출 끄기 (T-2): 등장 동작 없이
    this.appearAtMs = timeMs;
  }

  /** 공격 동작: 대상(단위 좌표) 쪽으로 몸을 내밀고 바라본다. */
  attack(layout: MapLayout, targetUx: number, targetUy: number, timeMs: number): void {
    if (effectsOff()) return; // 연출 끄기 (T-2): 공격 몸짓 없이 (투사체는 그대로)
    const t = unitsToPx(layout, targetUx, targetUy);
    const dx = t.x - this.baseX;
    const dy = t.y - (this.baseY - layout.tile * 0.35);
    const len = Math.hypot(dx, dy) || 1;
    this.lungeDx = dx / len;
    this.lungeDy = dy / len;
    if (Math.abs(dx) > layout.tile * 0.05) this.facing = dx > 0 ? 1 : -1;
    this.attackAtMs = timeMs;
  }

  /** sim 타워의 칸이 바뀌었으면(이동·교환) 새 자리로 미끄러져 간다. */
  follow(tower: Tower, timeMs: number): void {
    if (tower.tx === this.tx && tower.ty === this.ty) return;
    this.slideFrom = { x: this.root.x, y: this.root.y, at: timeMs };
    this.tx = tower.tx;
    this.ty = tower.ty;
    const c = tileCenterPx(this.layout, tower.tx, tower.ty);
    this.baseX = c.x;
    this.baseY = c.y + this.layout.tile * FOOT_OFFSET_TILES;
  }

  /** 끌기: 손가락 위치(화면 px)로 들어 올림. null이면 지금 자리에서 칸으로 미끄러져 돌아간다. */
  setDrag(at: { x: number; y: number } | null, timeMs: number): void {
    if (at === null && this.dragAt !== null) this.slideFrom = { x: this.root.x, y: this.root.y, at: timeMs };
    this.dragAt = at;
  }

  /** 기절 표시 (바뀔 때만 색을 바꾼다). */
  setStunned(on: boolean): void {
    if (on === this.stunned) return;
    this.stunned = on;
    if (this.character) this.character.setTint(on ? 0x8c8c9e : null);
    else if (this.figure instanceof Phaser.GameObjects.Image) {
      if (on) this.figure.setTint(0x8c8c9e);
      else this.figure.clearTint();
    }
  }

  /** 기절 중인가 (E2E) */
  get isStunned(): boolean {
    return this.stunned;
  }

  /** G-1 칸 무더기: 자리·크기 (매 프레임 TowerLayer가 정한다). 받침대 크기는 update가 slot.scale을 곱해 정한다. */
  setSlot(slot: StackSlot, groupDrag: { x: number; y: number } | null): void {
    this.slot = slot;
    if (groupDrag === null && this.groupDragAt !== null) this.slideFrom = { x: this.root.x, y: this.root.y, at: 0 };
    this.groupDragAt = groupDrag;
  }

  /** @param reduced 기기 '동작 줄이기' (TowerLayer가 프레임마다 한 번 읽어 넘긴다) — 반짝임·타격 빛을 끈다 */
  update(timeMs: number, crowded: boolean, topLimit: number, reduced = false): void {
    // 연출 끄기 (T-2): 대기 동작·공격 몸짓·미끄러짐 없이 고정 자세
    const still = effectsOff();
    if (still) this.slideFrom = null;
    if (this.slideFrom && this.slideFrom.at === 0) this.slideFrom.at = timeMs;
    // 위치: 끄는 중 = 손가락 위, 이동 직후 = 미끄러짐(SLIDE_MS), 그 밖 = 칸 (+ G-1 무더기 안 자리)
    const ox = this.slot.dx * this.tile;
    const oy = this.slot.dy * this.tile;
    let rx = this.baseX + ox;
    let ry = this.baseY + oy;
    const held = this.dragAt ?? this.groupDragAt;
    if (held) {
      rx = held.x + (this.dragAt ? 0 : ox);
      ry = held.y + (this.dragAt ? 0 : oy);
    } else if (this.slideFrom) {
      const k = (timeMs - this.slideFrom.at) / SLIDE_MS;
      if (k >= 1) this.slideFrom = null;
      else {
        const e = 1 - (1 - k) * (1 - k);
        rx = this.slideFrom.x + (this.baseX + ox - this.slideFrom.x) * e;
        ry = this.slideFrom.y + (this.baseY + oy - this.slideFrom.y) * e;
      }
    }
    this.root.setPosition(rx, ry);
    this.root.setDepth(held ? DRAG_DEPTH + (this.dragAt ? 0 : -1) : MOB_DEPTH_BASE + ry);
    this.root.setAlpha(held ? 0.88 : 1);
    const preset = this.preset;
    const pose = still
      ? STILL_POSE
      : towerPose({
      timeMs,
      seed: this.seed,
      attackAtMs: this.attackAtMs,
      attackMs: this.attackMs,
      appearAtMs: reduced ? null : this.appearAtMs,
      gesture: preset?.gesture,
      gestureMs: preset?.gestureMs,
    });
    const soloScale = battleFigureScale(this.lookScale, crowded, (this.baseY - topLimit) / this.tile);
    this.artScale = stackArtScale(soloScale, this.slot);
    const s = this.scale * this.artScale;
    // 받침대: 혼자 있을 때 크기(G-2 하한·상한) × 무더기에서 줄어든 비율(G-1, 칸 너비 상한 포함)
    this.pedestal.setScale(this.pedestalBase * pedestalScaleFor(soloScale) * (this.artScale / soloScale));
    const fx = this.lungeDx * pose.lunge * this.tile + pose.dx * this.tile;
    const fy = pose.bob * this.tile + this.lungeDy * pose.lunge * this.tile;
    this.figure.setPosition(fx, fy);
    this.figure.setScale(s * pose.sx * this.facing, s * pose.sy);
    // 기절: 좌우로 작게 떨린다. G-2: 평소에는 아주 작은 살랑 흔들림을 더한다
    this.figure.setRotation(this.stunned ? Math.sin(timeMs * 0.03) * 0.06 : pose.angle + pose.sway);
    // 접지 그림자: 뛰면(bob 위) 작고 옅게 → 몸이 떠오른 게 보인다
    const lift = Math.max(0, -fy / this.tile);
    const shadowW = Math.min(0.8, CONTACT_SHADOW_TILES * this.artScale) * this.tile * Math.max(0.55, 1 - lift * 3);
    this.contactShadow.setDisplaySize(shadowW, shadowW * 0.31).setPosition(fx * 0.5, 0).setAlpha(Math.max(0.35, 1 - lift * 4));
    // 반짝임·타격 빛 (연출 끄기·동작 줄이기면 없음)
    const quiet = still || this.stunned || reduced;
    const figH = this.tile * FIGURE_TILES * this.artScale;
    if (!quiet && pose.glint > 0.02) {
      const gs = this.tile * 0.22 * pose.glint;
      this.glintImg
        .setVisible(true)
        .setPosition(fx + pose.glintX * figH * 0.5 * this.facing, fy - pose.glintY * figH)
        .setDisplaySize(gs, gs)
        .setRotation(pose.glint * 1.2)
        .setAlpha(pose.glint);
    } else this.glintImg.setVisible(false);
    if (!quiet && pose.punch > 0.02) {
      const ps = this.tile * (0.25 + 0.2 * pose.punch);
      this.punchImg
        .setVisible(true)
        .setPosition(fx + this.lungeDx * this.tile * 0.42, fy - figH * 0.42 + this.lungeDy * this.tile * 0.3)
        .setDisplaySize(ps, ps)
        .setAlpha(pose.punch * 0.9);
    } else this.punchImg.setVisible(false);
    if (this.character && preset) {
      // 파츠 대기 동작: 기절 중에는 멈춘다
      const r = this.character.tex.render;
      const look = r.look;
      const idle = idleParts({
        preset,
        gesture: pose.gesture,
        attack: pose.attackK,
        timeMs,
        seed: this.seed,
        body: look.body,
        prop: look.prop,
        back: look.back,
        pet: look.pet,
        fx: fxOf(look),
        grade: look.grade,
        play: !this.stunned && !still,
      });
      this.character.apply(compose(r, idle, still ? 0 : timeMs, this.seed, !this.character.external));
    }
  }

  /** G-2 겉모습 텍스처 키 (E2E): 받침대 · 별 배지 · 종족 문장 · 접지 그림자 · 몸 그림(피드백 #21 등급 테두리) */
  get presentation(): { pedestal: string; stars: string; emblem: string; shadow: string; pedestalScale: number; body: string | null } {
    return {
      body: this.character?.bodyKey ?? null,
      pedestal: this.pedestal.texture.key,
      stars: this.starBadge.texture.key,
      emblem: this.emblem.texture.key,
      shadow: this.contactShadow.texture.key,
      pedestalScale: this.pedestal.scaleX / this.pedestalBase,
    };
  }

  /** 파츠 그림 텍스처 키 (외형 데이터가 없으면 null) — E2E가 새 그림인지 확인 */
  get characterKey(): string | null {
    return this.character?.textureKey ?? null;
  }

  /** 끄는 중(손가락 위에 들려 있음)인가. */
  get dragging(): boolean {
    return this.dragAt !== null;
  }

  /** 끄는 중이면 손가락 위치 (그림을 다시 만들 때 이어 받기) */
  get dragPos(): { x: number; y: number } | null {
    return this.dragAt;
  }

  /** 지금 그려진 발밑 위치 (화면 px) — E2E·끌기 확인용. */
  get footPx(): { x: number; y: number } {
    return { x: this.root.x, y: this.root.y };
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
  private readonly occupied = new Set<number>();
  /** 소환 사건을 받았지만 아직 그림이 없는 타워 → 그림을 만들 때 등장 동작 */
  private readonly pendingAppear = new Set<number>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layout: MapLayout,
    private topLimit: number,
    private readonly art: TowerArt,
  ) {}

  /** HUD 띠 아래 끝 (게임 px)이 바뀜 — 맵 영역이 그대로여도 HUD가 커지면 머리가 HUD 밑으로 들어가지 않게 (검토 반영) */
  setTopLimit(topLimit: number): void {
    this.topLimit = topLimit;
  }

  /** 소환 사건: 다음 sync에서 그림이 생길 때 등장 동작. */
  noteSummoned(id: number): void {
    this.pendingAppear.add(id);
  }

  /** 공격 사건 → 그 타워 공격 동작. */
  attack(id: number, targetUx: number, targetUy: number, timeMs: number): void {
    this.sprites.get(id)?.attack(this.layout, targetUx, targetUy, timeMs);
  }

  /** @param tick 지금 sim 틱 (기절 표시: tick < stunUntil). 생략하면 기절 표시 없음 */
  sync(towers: readonly Tower[], timeMs: number, tick?: number): void {
    const seen = new Set<number>();
    const cols = this.layout.cols;
    fillOccupancy(this.occupied, towers, cols);
    const reduced = prefersReducedMotion();
    // G-1 칸 무더기: 칸마다 타워 수·끄는 그림 (ID 순이라 칸 안 순서 = 쌓인 순서)
    const perTile = new Map<number, number>();
    const dragOf = new Map<number, { x: number; y: number }>();
    for (const t of towers) {
      const k = occupancyKey(t.tx, t.ty, cols);
      perTile.set(k, (perTile.get(k) ?? 0) + 1);
      const d = this.sprites.get(t.id)?.dragPos;
      if (d && !dragOf.has(k)) dragOf.set(k, d);
    }
    const nth = new Map<number, number>();
    for (const t of towers) {
      seen.add(t.id);
      let sprite = this.sprites.get(t.id);
      if (sprite && sprite.towerType !== t.tower) {
        // 같은 엔티티의 타워 종류가 바뀜 (승급의 축복 [바꾸기] — sim pickMerge는 id·칸을 그대로 두고 종류만 바꾼다):
        // 새 그림(텍스처·공격 동작 간격)으로 다시 만들고 등장 동작. 예전엔 위치만 따라가 옛 그림이 남았다 (검토 반영)
        const drag = sprite.dragPos;
        sprite.destroy();
        sprite = new TowerSprite(this.scene, t, this.layout, this.art);
        this.sprites.set(t.id, sprite);
        if (drag) sprite.setDrag(drag, timeMs);
        sprite.appear(timeMs);
      } else if (!sprite) {
        sprite = new TowerSprite(this.scene, t, this.layout, this.art);
        this.sprites.set(t.id, sprite);
        if (this.pendingAppear.delete(t.id)) sprite.appear(timeMs);
      } else sprite.follow(t, timeMs);
      sprite.setStunned(tick !== undefined && tick < (t.stunUntil ?? 0));
      const key = occupancyKey(t.tx, t.ty, cols);
      const i = nth.get(key) ?? 0;
      nth.set(key, i + 1);
      sprite.setSlot(stackSlot(i, perTile.get(key) ?? 1), sprite.dragging ? null : (dragOf.get(key) ?? null));
      sprite.update(timeMs, isCrowded(this.occupied, t.tx, t.ty, cols), this.topLimit, reduced);
    }
    for (const [id, s] of this.sprites) {
      if (!seen.has(id)) {
        s.destroy();
        this.sprites.delete(id);
      }
    }
    this.pendingAppear.clear();
  }

  /** 기절 표시 중인 타워 그림 수 (E2E) */
  get stunnedCount(): number {
    let n = 0;
    for (const s of this.sprites.values()) if (s.isStunned) n++;
    return n;
  }

  get count(): number {
    return this.sprites.size;
  }

  /** 끌기: 그 타워를 손가락 위치(화면 px)로 들어 올린다. null이면 내려놓는다 (제자리로 미끄러져 돌아감). */
  setDrag(id: number, at: { x: number; y: number } | null, timeMs: number): void {
    this.sprites.get(id)?.setDrag(at, timeMs);
  }

  /**
   * keep 말고 들려 있는 타워는 모두 내려놓는다 (Game이 매 프레임 부른다). 끌기를 끝내는 길을 놓쳐도(두 손가락 등)
   * 그림이 놓은 자리에 유령처럼 남지 않게 하는 안전장치.
   */
  releaseDragsExcept(keep: number | null, timeMs: number): void {
    for (const [id, s] of this.sprites) if (id !== keep && s.dragging) s.setDrag(null, timeMs);
  }

  /** 들려 있는 타워 그림 수 (E2E). */
  get draggingCount(): number {
    let n = 0;
    for (const s of this.sprites.values()) if (s.dragging) n++;
    return n;
  }

  /** 그 타워 엔티티의 지금 그림이 어떤 타워 종류인가 (E2E가 sim 타워 종류와 비교). 그림이 없으면 null */
  towerTypeOf(id: number): string | null {
    return this.sprites.get(id)?.towerType ?? null;
  }

  /** 그 타워 종류의 캐릭터 텍스처 키 (없으면 굽는다) — 정보 패널 초상화용. 파츠 그림이면 한 장에 합친 텍스처. */
  textureKey(towerId: string): string {
    const charLook = towerLook(towerId);
    if (charLook) return towerPortraitKey(this.scene, charLook, this.art.awakened?.(towerId) ?? false);
    const look = this.art.look(towerId);
    const color = this.art.factionColor(look.faction) ?? SPECIAL_FACTION_COLORS[look.faction] ?? '#888888';
    return ensureTowerTexture(this.scene, look, color);
  }

  /** 그 타워 그림의 현재 크기 배수 */
  artScaleOf(id: number): number | null {
    return this.sprites.get(id)?.artScale ?? null;
  }

  /**
   * 그 타워 그림이 쓰는(그림이 아직 없으면 — 소환 직후 — 쓸) 크기 배수 (B-1): 캐릭터 크기 × 기본 2배 / 붙으면 1.4배, HUD 아래까지.
   * 소환 주사위를 머리 위로 올릴 때 쓴다. sync와 같은 계산.
   */
  expectedScale(t: Tower, towers: readonly Tower[]): number {
    const sprite = this.sprites.get(t.id);
    if (sprite) return sprite.artScale;
    const cols = this.layout.cols;
    const crowded = isCrowded(fillOccupancy(new Set<number>(), towers, cols), t.tx, t.ty, cols);
    const footY = tileCenterPx(this.layout, t.tx, t.ty).y + this.layout.tile * FOOT_OFFSET_TILES;
    return battleFigureScale(lookScale(towerLook(t.tower), this.art.awakened?.(t.tower) ?? false), crowded, (footY - this.topLimit) / this.layout.tile);
  }

  /** 그 타워의 지금 그려진 발밑 위치 (화면 px). */
  footPx(id: number): { x: number; y: number } | null {
    return this.sprites.get(id)?.footPx ?? null;
  }

  figureTransform(id: number): { y: number; scaleY: number; angle: number } | null {
    return this.sprites.get(id)?.figureTransform ?? null;
  }

  /** G-2 겉모습 텍스처 키 (E2E). 그림이 없으면 null */
  presentationOf(id: number): TowerSprite['presentation'] | null {
    return this.sprites.get(id)?.presentation ?? null;
  }

  /** 그 타워 그림의 파츠 텍스처 키 (E2E: 새 캐릭터 그림인지). 예전 한 장 그림이면 null */
  characterKeyOf(id: number): string | null {
    return this.sprites.get(id)?.characterKey ?? null;
  }

  /** 그려진 타워들의 파츠 텍스처 키 목록 (E2E) */
  get characterKeys(): string[] {
    const out: string[] = [];
    for (const s of this.sprites.values()) {
      const k = s.characterKey;
      if (k) out.push(k);
    }
    return out;
  }

  destroy(): void {
    for (const s of this.sprites.values()) s.destroy();
    this.sprites.clear();
  }
}
