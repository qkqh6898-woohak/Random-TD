/**
 * 짧은 연출 (DEV_PLAN M2-9, UI.md 10장, ART.md 2.4).
 *
 * - 소환: 칸에서 등급 색 빛 기둥 (0.45초).
 * - 돈 부족: 누른 칸이 빨갛게 깜빡이며 좌우로 흔들림 (UI.md 4.3 '칸이 흔들리고').
 * - 투사체 헛발: 그 자리에서 작은 연기. 맞음: 작은 불꽃.
 * - 동전: 처치 자리에서 살짝 튀어 오른 뒤 HUD 돈 쪽으로 날아간다 (도착하면 콜백 → HUD 돈 반짝 + '+n원').
 * 동전은 매 프레임 시각으로 위치를 계산하고(fxModel.coinPath), 나머지는 Phaser 트윈을 쓴다 (화면 전용, sim과 무관).
 */
import Phaser from 'phaser';
import { TEX_COIN, TEX_ORB, TEX_PILLAR, TEX_SPARK, ensureFxTextures } from '../../art/fx';
import { tileCenterPx, unitsToPx, type MapLayout } from '../layout';
import { COIN_FLY_MS, coinPath } from './fxModel';

export const FX_DEPTH = 5500;
export const COIN_DEPTH = 7000;
/** 동시에 나는 동전 최대 수 (넘치면 바로 도착 처리) */
export const MAX_COINS = 24;

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
