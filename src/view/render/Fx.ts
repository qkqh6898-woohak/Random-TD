/**
 * 짧은 연출 (DEV_PLAN M2-9, UI.md 10장, ART.md 2.4).
 *
 * - 소환: 칸에서 등급 색 빛 기둥 (0.45초).
 * - 돈 부족: 누른 칸이 빨갛게 깜빡이며 좌우로 흔들림 (UI.md 4.3 '칸이 흔들리고').
 * - 투사체 헛발: 그 자리에서 작은 연기. 맞음: 작은 불꽃.
 * - 동전: 처치 자리에서 살짝 튀어 오른 뒤 HUD 돈 쪽으로 날아간다 (도착하면 콜백 → HUD 돈 반짝 + '+n원').
 * - M3: 승급(빛 구슬이 빨려 들어간 뒤 빛 기둥), 광역 폭발 고리, 연쇄 번개.
 * - M3b 특색: 운석(불덩이가 떨어져 폭발), 진흙 웅덩이 튐, 도박꾼 주사위 눈, 시간 정지(화면 흑백 0.2초 + 시계 고리, TOWERS.md 11장).
 * 동전은 매 프레임 시각으로 위치를 계산하고(fxModel.coinPath), 나머지는 Phaser 트윈을 쓴다 (화면 전용, sim과 무관).
 */
import Phaser from 'phaser';
import { TEX_COIN, TEX_ORB, TEX_PILLAR, TEX_SPARK, ensureFxTextures } from '../../art/fx';
import { diceKey, ensureStatusTextures } from '../../art/status';
import { tileCenterPx, unitsToPx, type MapLayout } from '../layout';
import { COIN_FLY_MS, coinPath } from './fxModel';

export const FX_DEPTH = 5500;
export const COIN_DEPTH = 7000;
/** 동시에 나는 동전 최대 수 (넘치면 바로 도착 처리) */
export const MAX_COINS = 24;
/** 승급 빛 구슬이 결과 칸으로 빨려 드는 시간 (ms) — UI.md 9장 '승급 연출 0.3초' */
export const MERGE_SUCK_MS = 300;

interface Coin {
  img: Phaser.GameObjects.Image;
  from: { x: number; y: number };
  start: number;
  onArrive: () => void;
}

export class FxLayer {
  private coins: Coin[] = [];
  private readonly freeCoins: Phaser.GameObjects.Image[] = [];
  private readonly objects = new Set<Phaser.GameObjects.GameObject>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layout: MapLayout,
  ) {
    ensureFxTextures(scene);
  }

  private track<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.objects.add(obj);
    obj.once(Phaser.GameObjects.Events.DESTROY, () => this.objects.delete(obj));
    return obj;
  }

  /** 소환 빛 기둥 (등급 색). */
  summonPillar(tx: number, ty: number, color: number): void {
    const L = this.layout;
    const c = tileCenterPx(L, tx, ty);
    const img = this.track(this.scene.add.image(c.x, c.y + L.tile * 0.35, TEX_PILLAR))
      .setOrigin(0.5, 1)
      .setTint(color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(FX_DEPTH)
      .setDisplaySize(L.tile * 0.8, L.tile * 1.7);
    const fullH = img.displayHeight;
    img.setDisplaySize(L.tile * 0.8, fullH * 0.2);
    this.scene.tweens.add({
      targets: img,
      displayHeight: fullH,
      duration: 160,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.scene.tweens.add({ targets: img, alpha: 0, displayWidth: L.tile * 0.3, duration: 300, onComplete: () => img.destroy() });
      },
    });
  }

  /**
   * 승급 (UI.md 10장 '3개가 빨려 들어가 합쳐짐'): 사라진 칸들에서 빛 구슬이 결과 칸으로 0.3초 동안 빨려 들어가고,
   * 도착하면 결과 등급 색의 빛 기둥.
   */
  mergeSuck(from: readonly { tx: number; ty: number }[], to: { tx: number; ty: number }, color: number): void {
    const L = this.layout;
    const end = tileCenterPx(L, to.tx, to.ty);
    for (const f of from) {
      const start = tileCenterPx(L, f.tx, f.ty);
      const orb = this.track(this.scene.add.image(start.x, start.y, TEX_ORB))
        .setTint(0xfff3c4)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(FX_DEPTH)
        .setDisplaySize(L.tile * 0.55, L.tile * 0.55);
      this.scene.tweens.add({
        targets: orb,
        x: end.x,
        y: end.y,
        displayWidth: L.tile * 0.25,
        displayHeight: L.tile * 0.25,
        duration: MERGE_SUCK_MS,
        ease: 'Cubic.easeIn',
        onComplete: () => orb.destroy(),
      });
    }
    this.scene.time.delayedCall(from.length > 0 ? MERGE_SUCK_MS : 0, () => this.summonPillar(to.tx, to.ty, color));
  }

  /** 광역 폭발 고리 (반경 = 단위). */
  blastRing(ux: number, uy: number, radiusUnits: number, color: number): void {
    const L = this.layout;
    const p = unitsToPx(L, ux, uy);
    const r = (radiusUnits / 1000) * L.tile;
    const ring = this.track(this.scene.add.circle(p.x, p.y, r, color, 0.18))
      .setStrokeStyle(Math.max(2, L.tile * 0.05), color, 0.85)
      .setDepth(FX_DEPTH)
      .setScale(0.4);
    this.scene.tweens.add({ targets: ring, scale: 1, alpha: 0, duration: 260, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
  }

  /** 연쇄 번개 한 구간 (단위 좌표). */
  chainBolt(x1: number, y1: number, x2: number, y2: number): void {
    const L = this.layout;
    const a = unitsToPx(L, x1, y1);
    const b = unitsToPx(L, x2, y2);
    const g = this.track(this.scene.add.graphics()).setDepth(FX_DEPTH);
    // 지그재그 4마디 (모양은 화면 전용 난수)
    const pts: { x: number; y: number }[] = [{ x: a.x, y: a.y - L.tile * 0.15 }];
    for (let i = 1; i < 4; i++) {
      const k = i / 4;
      pts.push({
        x: a.x + (b.x - a.x) * k + (Math.random() - 0.5) * L.tile * 0.3,
        y: a.y + (b.y - a.y) * k - L.tile * 0.15 + (Math.random() - 0.5) * L.tile * 0.3,
      });
    }
    pts.push({ x: b.x, y: b.y - L.tile * 0.15 });
    g.lineStyle(Math.max(2, L.tile * 0.05), 0xbfe6ff, 1);
    g.strokePoints(pts, false);
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 180, onComplete: () => g.destroy() });
  }

  /** 운석 (대마법사): 오른쪽 위에서 불덩이가 떨어져 그 자리에서 주황 폭발. */
  meteor(ux: number, uy: number): void {
    const L = this.layout;
    const p = unitsToPx(L, ux, uy);
    const ball = this.track(this.scene.add.image(p.x + L.tile * 0.9, p.y - L.tile * 3, TEX_ORB))
      .setTint(0xff7a2a)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(FX_DEPTH)
      .setDisplaySize(L.tile * 0.5, L.tile * 0.5);
    this.scene.tweens.add({
      targets: ball,
      x: p.x,
      y: p.y,
      duration: 260,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        ball.destroy();
        this.blastRing(ux, uy, 650, 0xff7a2a);
      },
    });
  }

  /** 진흙 웅덩이가 생김: 갈색 물결 고리. */
  splash(ux: number, uy: number, radiusUnits: number): void {
    const L = this.layout;
    const p = unitsToPx(L, ux, uy);
    const r = (radiusUnits / 1000) * L.tile;
    const ring = this.track(this.scene.add.ellipse(p.x, p.y, r * 2, r * 1.24))
      .setStrokeStyle(Math.max(2, L.tile * 0.05), 0x9c6b43, 0.9)
      .setDepth(FX_DEPTH)
      .setScale(0.3);
    this.scene.tweens.add({ targets: ring, scale: 1.15, alpha: 0, duration: 320, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
  }

  /** 도박꾼 주사위: 타워 머리 위에 나온 눈이 튀어 올랐다 사라진다. */
  dicePop(ux: number, uy: number, value: number): void {
    ensureStatusTextures(this.scene);
    const L = this.layout;
    const p = unitsToPx(L, ux, uy);
    const s = L.tile * 0.36;
    const img = this.track(this.scene.add.image(p.x + L.tile * 0.3, p.y - L.tile * 0.75, diceKey(Math.min(6, Math.max(1, value)))))
      .setDepth(FX_DEPTH + 10)
      .setDisplaySize(s * 0.4, s * 0.4)
      .setAngle(-25);
    this.scene.tweens.add({
      targets: img,
      displayWidth: s,
      displayHeight: s,
      angle: 0,
      y: img.y - L.tile * 0.25,
      duration: 180,
      ease: 'Back.easeOut',
      onComplete: () => this.scene.tweens.add({ targets: img, alpha: 0, delay: 260, duration: 200, onComplete: () => img.destroy() }),
    });
  }

  /** 시간 정지 (시간술사): 화면 흑백 0.2초 + 타워에서 퍼지는 시계 고리. WebGL이 아니면 회색 막만. */
  timeStop(ux: number, uy: number): void {
    const L = this.layout;
    const p = unitsToPx(L, ux, uy);
    const ring = this.track(this.scene.add.circle(p.x, p.y, L.tile * 4, 0xffffff, 0.06))
      .setStrokeStyle(Math.max(3, L.tile * 0.06), 0xdfe6ff, 0.9)
      .setDepth(FX_DEPTH)
      .setScale(0.1);
    this.scene.tweens.add({ targets: ring, scale: 1.4, alpha: 0, duration: 420, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
    const cam = this.scene.cameras.main;
    try {
      const fx = this.scene.game.renderer.type === Phaser.WEBGL ? cam.postFX?.addColorMatrix() : undefined;
      if (fx) {
        fx.grayscale(1);
        this.scene.time.delayedCall(200, () => cam.postFX?.remove(fx as unknown as Phaser.FX.Controller));
        return;
      }
    } catch {
      // 흑백 효과를 못 쓰는 기기: 회색 막으로
    }
    const veil = this.track(this.scene.add.rectangle(cam.midPoint.x, cam.midPoint.y, cam.width, cam.height, 0x9a9aa8, 0.35)).setDepth(FX_DEPTH - 1);
    this.scene.tweens.add({ targets: veil, alpha: 0, duration: 200, onComplete: () => veil.destroy() });
  }

  /** 돈 부족: 칸이 빨갛게 깜빡이며 흔들림. */
  shakeTile(tx: number, ty: number): void {
    const L = this.layout;
    const c = tileCenterPx(L, tx, ty);
    const rect = this.track(this.scene.add.rectangle(c.x, c.y, L.tile * 0.9, L.tile * 0.9, 0xe53935, 0.28))
      .setStrokeStyle(Math.max(2, L.tile * 0.05), 0xff6b5e, 1)
      .setDepth(FX_DEPTH);
    this.scene.tweens.add({
      targets: rect,
      x: { from: c.x - L.tile * 0.08, to: c.x + L.tile * 0.08 },
      duration: 55,
      yoyo: true,
      repeat: 3,
      onComplete: () => {
        rect.x = c.x;
        this.scene.tweens.add({ targets: rect, alpha: 0, duration: 200, onComplete: () => rect.destroy() });
      },
    });
  }

  /** 헛발: 작은 회색 연기. */
  missPuff(ux: number, uy: number): void {
    const L = this.layout;
    const p = unitsToPx(L, ux, uy);
    const img = this.track(this.scene.add.image(p.x, p.y, TEX_ORB))
      .setTint(0xb8b8c8)
      .setAlpha(0.7)
      .setDepth(FX_DEPTH)
      .setDisplaySize(L.tile * 0.15, L.tile * 0.15);
    this.scene.tweens.add({ targets: img, displayWidth: L.tile * 0.45, displayHeight: L.tile * 0.45, alpha: 0, duration: 260, onComplete: () => img.destroy() });
  }

  /** 맞은 자리 불꽃. */
  hitSpark(ux: number, uy: number, color: number): void {
    const L = this.layout;
    const p = unitsToPx(L, ux, uy);
    const img = this.track(this.scene.add.image(p.x, p.y - L.tile * 0.15, TEX_SPARK))
      .setTint(color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(FX_DEPTH)
      .setDisplaySize(L.tile * 0.2, L.tile * 0.2)
      .setRotation(Math.random() * Math.PI);
    this.scene.tweens.add({ targets: img, displayWidth: L.tile * 0.42, displayHeight: L.tile * 0.42, alpha: 0, duration: 140, onComplete: () => img.destroy() });
  }

  /**
   * 동전: 처치 자리(단위)에서 HUD 돈 쪽(target, 화면 px)으로. 도착하면 onArrive.
   * 너무 많으면 날리지 않고 바로 도착 처리한다.
   */
  coin(ux: number, uy: number, timeMs: number, onArrive: () => void): void {
    if (this.coins.length >= MAX_COINS) {
      onArrive();
      return;
    }
    const L = this.layout;
    const from = unitsToPx(L, ux, uy);
    const img = this.freeCoins.pop() ?? this.scene.add.image(0, 0, TEX_COIN).setDepth(COIN_DEPTH);
    img.setVisible(true).setAlpha(1).setDisplaySize(L.tile * 0.34, L.tile * 0.35).setPosition(from.x, from.y);
    this.coins.push({ img, from, start: timeMs, onArrive });
  }

  /** 동전 위치 갱신. target = HUD 돈 위치 (화면 px, 동전이 있을 때만 부른다). */
  update(timeMs: number, targetOf: () => { x: number; y: number }): void {
    if (this.coins.length === 0) return;
    const target = targetOf();
    const keep: Coin[] = [];
    const hop = this.layout.tile * 0.9;
    for (const c of this.coins) {
      const k = (timeMs - c.start) / COIN_FLY_MS;
      if (k >= 1) {
        c.img.setVisible(false);
        this.freeCoins.push(c.img);
        c.onArrive();
        continue;
      }
      const p = coinPath(c.from, target, k, hop);
      c.img.setPosition(p.x, p.y);
      c.img.setRotation(k * Math.PI * 3);
      keep.push(c);
    }
    this.coins = keep;
  }

  get activeCoins(): number {
    return this.coins.length;
  }

  destroy(): void {
    for (const c of this.coins) c.img.destroy();
    for (const img of this.freeCoins) img.destroy();
    this.coins = [];
    this.freeCoins.length = 0;
    for (const o of [...this.objects]) {
      this.scene.tweens.killTweensOf(o);
      o.destroy();
    }
    this.objects.clear();
  }
}
