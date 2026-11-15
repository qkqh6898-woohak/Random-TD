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
 * - M3-10: 이동·교환으로 칸이 바뀌면 0.14초 동안 새 칸으로 미끄러진다. 길게 눌러 끄는 동안은 손가락 위로 들려 따라온다.
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
import { FIGURE_TILES, FOOT_OFFSET_TILES, PEDESTAL_WIDTH_TILES } from './towerGeom';

/** 이동·교환 뒤 새 칸으로 미끄러지는 시간 (ms) */
const SLIDE_MS = 140;
/** 끄는 중인 타워는 몹·다른 타워 위에 그린다 */
const DRAG_DEPTH = 6500;

export interface TowerArt {
  look(towerId: string): TowerLookInput;
  factionColor(faction: string): string | undefined;
  /** 공격 간격 (ms) — 공격 동작 길이 계산용 */
  attackIntervalMs(towerId: string): number;
}

export class TowerSprite {
  readonly id: number;
  /** 그림을 만든 타워 종류 (towers.json id). sim에서 같은 엔티티의 종류가 바뀌면(승급의 축복 [바꾸기]) TowerLayer가 다시 만든다 */
  readonly towerType: string;
  private readonly root: Phaser.GameObjects.Container;
  private readonly figure: Phaser.GameObjects.Image;
  private readonly scale: number;
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

  constructor(scene: Phaser.Scene, tower: Tower, layout: MapLayout, art: TowerArt) {
    this.id = tower.id;
    this.towerType = tower.tower;
    const look = art.look(tower.tower);
    const color = art.factionColor(look.faction) ?? SPECIAL_FACTION_COLORS[look.faction] ?? '#888888';
    const figKey = ensureTowerTexture(scene, look, color);
    const pedKey = ensurePedestalTexture(scene, look.grade);
    this.tile = layout.tile;
    this.layout = layout;
    this.scale = (layout.tile * FIGURE_TILES) / FIGURE_TEX_H;
    this.tx = tower.tx;
    this.ty = tower.ty;
    const c = tileCenterPx(layout, tower.tx, tower.ty);
    this.baseX = c.x;
    this.baseY = c.y + layout.tile * FOOT_OFFSET_TILES;
    const pedestal = scene.add.image(0, 0, pedKey).setOrigin(0.5, PEDESTAL_ORIGIN_Y);
    pedestal.setScale((layout.tile * PEDESTAL_WIDTH_TILES) / PEDESTAL_TEX_W);
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
    if (on) this.figure.setTint(0x8c8c9e);
    else this.figure.clearTint();
  }

  /** 기절 중인가 (E2E) */
  get isStunned(): boolean {
    return this.stunned;
  }

  update(timeMs: number): void {
    // 위치: 끄는 중 = 손가락 위, 이동 직후 = 미끄러짐(SLIDE_MS), 그 밖 = 칸
    let rx = this.baseX;
    let ry = this.baseY;
    if (this.dragAt) {
      rx = this.dragAt.x;
      ry = this.dragAt.y;
    } else if (this.slideFrom) {
      const k = (timeMs - this.slideFrom.at) / SLIDE_MS;
      if (k >= 1) this.slideFrom = null;
      else {
        const e = 1 - (1 - k) * (1 - k);
        rx = this.slideFrom.x + (this.baseX - this.slideFrom.x) * e;
        ry = this.slideFrom.y + (this.baseY - this.slideFrom.y) * e;
      }
    }
    this.root.setPosition(rx, ry);
    this.root.setDepth(this.dragAt ? DRAG_DEPTH : MOB_DEPTH_BASE + ry);
    this.root.setAlpha(this.dragAt ? 0.88 : 1);
    const pose = towerPose({ timeMs, seed: this.seed, attackAtMs: this.attackAtMs, attackMs: this.attackMs, appearAtMs: this.appearAtMs });
    const s = this.scale;
    this.figure.setPosition(this.lungeDx * pose.lunge * this.tile, pose.bob * this.tile + this.lungeDy * pose.lunge * this.tile);
    this.figure.setScale(s * pose.sx * this.facing, s * pose.sy);
    // 기절: 좌우로 작게 떨린다
    this.figure.setRotation(this.stunned ? Math.sin(timeMs * 0.03) * 0.06 : pose.angle);
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

  /** @param tick 지금 sim 틱 (기절 표시: tick < stunUntil). 생략하면 기절 표시 없음 */
  sync(towers: readonly Tower[], timeMs: number, tick?: number): void {
    const seen = new Set<number>();
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

  /** 그 타워 종류의 캐릭터 텍스처 키 (없으면 굽는다) — 정보 패널 초상화용. */
  textureKey(towerId: string): string {
    const look = this.art.look(towerId);
    const color = this.art.factionColor(look.faction) ?? SPECIAL_FACTION_COLORS[look.faction] ?? '#888888';
    return ensureTowerTexture(this.scene, look, color);
  }

  /** 그 타워의 지금 그려진 발밑 위치 (화면 px). */
  footPx(id: number): { x: number; y: number } | null {
    return this.sprites.get(id)?.footPx ?? null;
  }

  figureTransform(id: number): { y: number; scaleY: number; angle: number } | null {
    return this.sprites.get(id)?.figureTransform ?? null;
  }

  destroy(): void {
    for (const s of this.sprites.values()) s.destroy();
    this.sprites.clear();
  }
}
