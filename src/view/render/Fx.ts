/**
 * 짧은 연출 (DEV_PLAN M2-9, UI.md 10장, ART.md 2.4).
 *
 * - 소환: 칸에서 등급 색 빛 기둥 (0.45초).
 * - 돈 부족: 누른 칸이 빨갛게 깜빡이며 좌우로 흔들림 (UI.md 4.3 '칸이 흔들리고').
 * - 투사체 헛발: 그 자리에서 작은 연기. 맞음: 작은 불꽃.
 * - 동전: 처치 자리에서 살짝 튀어 오른 뒤 HUD 돈 쪽으로 날아간다 (도착하면 콜백 → HUD 돈 반짝 + '+n원').
 * - M3: 승급(빛 구슬이 빨려 들어간 뒤 빛 기둥), 광역 폭발 고리, 연쇄 번개.
 * - M3b 특색: 운석(불덩이가 떨어져 폭발), 진흙 웅덩이 튐, 도박꾼 주사위 눈, 시간 정지(화면 흑백 0.2초 + 시계 고리, TOWERS.md 11장).
 * - G-2 (사용자 요청 '너무 주사위에 의존하지 말고 캐릭터 위주로'): 소환하면 빛 기둥과 함께 발밑에 등급 색 **소환문**이 돌며 퍼지고,
 *   **빛 터짐** + 나타나는 캐릭터의 **하얀 실루엣 번쩍임**, 그리고 머리 위로 떠오르며 **뒤집히는 초상 카드**(뒷면 금테 소환문 → 앞면 캐릭터 초상 + 등급 테·별).
 *   승급하면 재료 칸의 빛 구슬이 결과 칸으로 빨려 든 뒤 결과 칸에서 더 큰 소환문·빛 터짐·실루엣·카드 + **등급 별**이 부채꼴로 튀어 오른다.
 *   동시에 떠 있는 카드는 MAX_SUMMON_CARDS개까지 (넘치면 빛 기둥만). 연출 끄기(T-2)면 아무것도,
 *   기기 '동작 줄이기'(prefers-reduced-motion)면 카드·소환문·실루엣·별 없이 예전 빛 기둥·빛 구슬만.
 *   (A-1·B-1의 굴러가는 주사위는 G-2에서 뺐다. 도박꾼 특색 주사위 눈(dicePop)은 실제 주사위라 그대로.)
 * 동전은 매 프레임 시각으로 위치를 계산하고(fxModel.coinPath), 나머지는 Phaser 트윈을 쓴다 (화면 전용, sim과 무관).
 */
import Phaser from 'phaser';
import { effectsOff } from '../effects';
import {
  CARD_TEX,
  CARD_WINDOW,
  TEX_BURST,
  TEX_CARD_BACK,
  TEX_COIN,
  TEX_GRADE_STAR,
  TEX_ORB,
  TEX_PILLAR,
  TEX_PORTAL,
  TEX_SPARK,
  cardFaceKey,
  cardRimKey,
  ensureFxTextures,
  ensureSummonFxTextures,
} from '../../art/fx';
import { diceKey, ensureStatusTextures } from '../../art/status';
import { GRADE_STARS } from '../../art/towerLook';
import type { Grade } from '../../data/load';
import { tileCenterPx, unitsToPx, type MapLayout } from '../layout';
import { prefersReducedMotion } from '../../ui/motion';
import { COIN_FLY_MS, cardFlip, coinPath, mergeStarCount } from './fxModel';
import { FOOT_OFFSET_TILES, cardApexTiles, towerFigureSpanTiles } from './towerGeom';

export const FX_DEPTH = 5500;
export const COIN_DEPTH = 7000;
/** 동시에 나는 동전 최대 수 (넘치면 바로 도착 처리) */
export const MAX_COINS = 24;
/** 승급 빛 구슬이 결과 칸으로 빨려 드는 시간 (ms) — UI.md 9장 '승급 연출 0.3초' */
export const MERGE_SUCK_MS = 300;
/** 동시에 떠 있는 초상 카드 연출 최대 수 (A-1 주사위 한도 그대로 — 꾹 눌러 연속 소환·모두 승급에도 화면이 덮이지 않게) */
export const MAX_SUMMON_CARDS = 12;
/** 카드 너비 (칸 배수): 소환 · 승급 */
const CARD_W_TILES = { summon: 0.78, merge: 0.96 } as const;

/** 소환·승급 연출 한 번의 입력 (G-2) */
export interface SummonFxInput {
  tx: number;
  ty: number;
  /** 등급 색 (0xRRGGBB) */
  color: number;
  grade: Grade;
  /** 나타난 타워 종류 (초상·실루엣). 모르면 소환문·빛만 */
  towerId?: string;
  kind?: 'summon' | 'merge';
}

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
  /** 지금 떠 있는 초상 카드 수 · 지금까지 띄운 카드 수 (E2E 확인용) */
  private cardLive = 0;
  cardShown = 0;
  /** 동시에 떠 있던 카드 최대 수 (E2E: MAX_SUMMON_CARDS를 넘지 않음) */
  cardPeak = 0;
  /** 지금까지 띄운 소환문 · 실루엣 번쩍임 · 등급 별 수 (E2E) */
  portalShown = 0;
  silhouetteShown = 0;
  starShown = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layout: MapLayout,
    private readonly reducedMotion: () => boolean = () => prefersReducedMotion(),
    /** 칸 (tx, ty) 타워 그림의 크기 배수 (B-1 전투 확대) — 초상 카드를 머리 위로 올리고 실루엣 크기를 맞춘다. 타워가 없으면 1 */
    private readonly figureScaleAt: (tx: number, ty: number) => number = () => 1,
    /** 타워 종류 → 캐릭터 한 장 그림 텍스처 키 (정보 패널 초상과 같은 것, G-2 실루엣·카드). 없으면 null */
    private readonly portraitOf: (towerId: string) => string | null = () => null,
  ) {
    ensureFxTextures(scene);
  }

  /** HUD 띠 아래 끝 (게임 px): 소환·승급 카드가 그보다 위로 올라가 HUD 밑에 숨지 않게 (검토 반영) */
  private topLimit = Number.NEGATIVE_INFINITY;
  setTopLimit(topLimit: number): void {
    this.topLimit = topLimit;
  }

  /** 캐릭터 연출(카드·소환문·실루엣·별)을 띄울 수 있는가 (연출 켜짐 + 동작 줄이기 아님 + 한도 안) */
  private cardAllowed(): boolean {
    return !effectsOff() && !this.reducedMotion() && this.cardLive < MAX_SUMMON_CARDS;
  }

  /**
   * 소환·승급 결과 칸 (G-2): 빛 기둥 + 등급 색 소환문 + 빛 터짐 + 캐릭터 실루엣 번쩍임 + 뒤집히는 초상 카드 (+ 승급이면 등급 별).
   * 캐릭터 연출을 못 띄우면(연출 끄기·동작 줄이기·한도) 빛 기둥만 (연출 끄기면 그것도 없음).
   */
  summonFx(input: SummonFxInput): void {
    const { tx, ty, color, grade } = input;
    const merge = input.kind === 'merge';
    this.summonPillar(tx, ty, color);
    if (!this.cardAllowed()) return;
    ensureSummonFxTextures(this.scene, grade, GRADE_STARS[grade] ?? 1);
    const L = this.layout;
    const { x, y } = tileCenterPx(L, tx, ty);
    const tile = L.tile;
    const footY = y + tile * FOOT_OFFSET_TILES;
    const scale = this.figureScaleAt(tx, ty);
    const portrait = input.towerId ? this.portraitOf(input.towerId) : null;
    const name = merge ? 'merge' : 'summon';

    // 1) 발밑 소환문: 눕힌 고리(컨테이너 세로 0.42배) 안에서 고리가 돌며 커졌다 사라진다
    const ringImg = this.scene.add.image(0, 0, TEX_PORTAL).setTint(color).setBlendMode(Phaser.BlendModes.ADD);
    const inner = this.scene.add.image(0, 0, TEX_PORTAL).setTint(0xffe7a0).setBlendMode(Phaser.BlendModes.ADD).setScale(0.72).setAlpha(0.85);
    const portal = this.track(this.scene.add.container(x, footY, [ringImg, inner]))
      .setName(`${name}-portal`)
      .setDepth(FX_DEPTH + 1);
    const ringPx = (tile * (merge ? 1.25 : 1.05)) / 256;
    portal.setScale(ringPx * 0.4, ringPx * 0.4 * 0.42);
    this.portalShown++;
    this.scene.tweens.add({ targets: ringImg, angle: 120, duration: 620 });
    this.scene.tweens.add({ targets: inner, angle: -150, duration: 620 });
    this.scene.tweens.add({
      targets: portal,
      scaleX: ringPx,
      scaleY: ringPx * 0.42,
      duration: 260,
      ease: 'Back.easeOut',
      onComplete: () => this.scene.tweens.add({ targets: portal, alpha: 0, delay: 160, duration: 200, onComplete: () => portal.destroy() }),
    });

    // 2) 빛 터짐 (등급 색, 몸 가운데)
    const bodyY = footY - tile * 0.45 * scale;
    const burst = this.track(this.scene.add.image(x, bodyY, TEX_BURST))
      .setName(`${name}-burst`)
      .setTint(color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(FX_DEPTH + 2)
      .setDisplaySize(tile * 0.4, tile * 0.4)
      .setAlpha(0.95);
    const burstTo = tile * (merge ? 1.9 : 1.45) * Math.min(1.6, Math.max(1, scale * 0.8));
    this.scene.tweens.add({ targets: burst, displayWidth: burstTo, displayHeight: burstTo, angle: 25, alpha: 0, duration: merge ? 480 : 380, ease: 'Cubic.easeOut', onComplete: () => burst.destroy() });

    // 3) 캐릭터 실루엣 번쩍임: 나타나는 캐릭터 모양 그대로 하얗게 빛났다 사라진다 (그림 위에 겹침)
    if (portrait && this.scene.textures.exists(portrait)) {
      const src = this.scene.textures.get(portrait).getSourceImage() as { width: number; height: number };
      const figH = tile * (FOOT_OFFSET_TILES - towerFigureSpanTiles(scale).top - 0.12);
      const k = figH / Math.max(1, src.height);
      const sil = this.track(this.scene.add.image(x, footY, portrait))
        .setName(`${name}-silhouette`)
        .setOrigin(0.5, 1)
        .setTintFill(0xfff1c0)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(FX_DEPTH + 3)
        .setScale(k * 0.92)
        .setAlpha(0.75);
      this.silhouetteShown++;
      this.scene.tweens.add({ targets: sil, scaleX: k * 1.1, scaleY: k * 1.1, alpha: 0, delay: 40, duration: 380, ease: 'Quad.easeOut', onComplete: () => sil.destroy() });
    }

    // 4) 초상 카드: 몸 가운데에서 머리 위로 떠오르며 뒤집힌다 (뒷면 금테 소환문 → 앞면 캐릭터 초상 + 등급 테·별)
    const cardW = tile * CARD_W_TILES[merge ? 'merge' : 'summon'];
    const cardScale = cardW / CARD_TEX.w;
    const cardH = CARD_TEX.h * cardScale;
    const back = this.scene.add.image(0, 0, TEX_CARD_BACK);
    const faceBg = this.scene.add.image(0, 0, cardFaceKey(grade)).setVisible(false);
    const rim = this.scene.add.image(0, 0, cardRimKey(grade)).setVisible(false);
    const parts: Phaser.GameObjects.GameObject[] = [back, faceBg];
    let face: Phaser.GameObjects.Image | null = null;
    if (portrait && this.scene.textures.exists(portrait)) {
      // 초상: 그림 위쪽(머리·어깨)을 카드 창에 맞춰 자른다
      const src = this.scene.textures.get(portrait).getSourceImage() as { width: number; height: number };
      const win = CARD_WINDOW;
      const cropW = src.width * 0.86;
      const cropH = Math.min(src.height * 0.62, (cropW * win.h) / win.w);
      const k = Math.max(win.w / cropW, win.h / cropH);
      const cx = (src.width - win.w / k) / 2;
      const cy = src.height * 0.02;
      face = this.scene.add
        .image(0, 0, portrait)
        .setOrigin(0, 0)
        .setCrop(cx, cy, win.w / k, win.h / k)
        .setScale(k)
        .setPosition(-CARD_TEX.w / 2 + win.x - cx * k, -CARD_TEX.h / 2 + win.y - cy * k)
        .setVisible(false);
      parts.push(face);
    }
    parts.push(rim);
    const startY = bodyY;
    // 머리 위 (B-1 높이 규칙). 맨 윗줄처럼 HUD 아래 끝에 막혀 얼굴을 가리게 되면 머리 옆(맵 가운데 쪽)으로 비켜 띄운다
    const wantY = y + tile * cardApexTiles(scale);
    const floorY = this.topLimit + cardH / 2;
    const blocked = wantY < floorY - tile * 0.1;
    const apexY = blocked ? Math.max(floorY, wantY + cardH * 0.7) : Math.max(wantY, floorY);
    const mapMidX = this.scene.scale.width / 2;
    const cardX = blocked ? x + (x <= mapMidX ? 1 : -1) * (tile * 0.38 * scale + cardW * 0.6) : x;
    const card = this.track(this.scene.add.container(x, startY, parts))
      .setName(`${name}-card`)
      .setDepth(FX_DEPTH + 12)
      .setScale(cardScale * 0.35);
    this.cardLive++;
    this.cardShown++;
    if (this.cardLive > this.cardPeak) this.cardPeak = this.cardLive;
    card.once(Phaser.GameObjects.Events.DESTROY, () => this.cardLive--);
    const flip = { p: 0, s: 0.35 };
    const applyFlip = (): void => {
      const f = cardFlip(flip.p);
      back.setVisible(!f.front);
      faceBg.setVisible(f.front);
      rim.setVisible(f.front);
      face?.setVisible(f.front);
      card.setScale(cardScale * flip.s * f.scaleX, cardScale * flip.s);
    };
    applyFlip();
    this.scene.tweens.add({ targets: card, x: cardX, y: apexY, duration: 280, ease: 'Back.easeOut' });
    this.scene.tweens.add({
      targets: flip,
      p: 1,
      s: 1,
      duration: 340,
      ease: 'Sine.easeInOut',
      onUpdate: applyFlip,
      onComplete: () => {
        applyFlip();
        this.scene.tweens.add({ targets: card, y: apexY - tile * 0.15, alpha: 0, delay: merge ? 360 : 260, duration: 200, onComplete: () => card.destroy() });
      },
    });

    // 5) 승급: 등급 별이 카드 위로 부채꼴로 튀어 오른다
    if (merge) {
      const n = mergeStarCount(grade);
      const starSize = tile * 0.3;
      // 카드 둘레 위쪽 반원에 부채꼴로 (맨 윗줄이면 HUD 밑으로 숨지 않게 HUD 아래 끝 아래로)
      const minY = this.topLimit + starSize / 2;
      for (let i = 0; i < n; i++) {
        const a = n === 1 ? -Math.PI / 2 : -Math.PI + ((i + 0.5) * Math.PI) / n;
        const st = this.track(this.scene.add.image(cardX, apexY, TEX_GRADE_STAR))
          .setName('merge-star')
          .setDepth(FX_DEPTH + 13)
          .setDisplaySize(starSize * 0.3, starSize * 0.3)
          .setAlpha(0);
        this.starShown++;
        const ty2 = Math.max(minY, apexY + Math.sin(a) * cardH * 0.62);
        this.scene.tweens.add({
          targets: st,
          x: cardX + Math.cos(a) * cardW * 0.9,
          y: ty2,
          displayWidth: starSize,
          displayHeight: starSize,
          alpha: 1,
          angle: 180,
          delay: 240 + i * 50,
          duration: 260,
          ease: 'Back.easeOut',
          onComplete: () => this.scene.tweens.add({ targets: st, alpha: 0, scale: st.scale * 1.3, delay: 220, duration: 220, onComplete: () => st.destroy() }),
        });
      }
    }
  }

  /** 지금 떠 있는 초상 카드 수 (E2E) */
  get cardActive(): number {
    return this.cardLive;
  }

  private track<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.objects.add(obj);
    obj.once(Phaser.GameObjects.Events.DESTROY, () => this.objects.delete(obj));
    return obj;
  }

  /** 소환 빛 기둥 (등급 색). */
  summonPillar(tx: number, ty: number, color: number): void {
    if (effectsOff()) return; // 연출 끄기 (T-2)
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
   * 승급 (UI.md 10장 '3개가 빨려 들어가 합쳐짐'): 사라진 칸들의 빛 구슬이 0.3초 동안 결과 칸으로 빨려 들어간 뒤 결과 칸 연출
   * (G-2: 새 캐릭터의 소환문·빛 터짐·실루엣·초상 카드 + 등급 별 — summonFx 'merge'. 동작 줄이기·한도면 결과 등급 색 빛 기둥만).
   */
  mergeSuck(from: readonly { tx: number; ty: number }[], to: SummonFxInput): void {
    if (effectsOff()) return; // 연출 끄기 (T-2)
    const L = this.layout;
    const end = tileCenterPx(L, to.tx, to.ty);
    const glow = this.cardAllowed();
    from.forEach((f) => {
      const start = tileCenterPx(L, f.tx, f.ty);
      const obj = this.track(this.scene.add.image(start.x, start.y - L.tile * 0.15, TEX_ORB))
        .setName('merge-material-orb')
        .setTint(glow ? to.color : 0xfff3c4)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(FX_DEPTH)
        .setDisplaySize(L.tile * 0.55, L.tile * 0.55);
      this.scene.tweens.add({
        targets: obj,
        x: end.x,
        y: end.y,
        displayWidth: L.tile * 0.25,
        displayHeight: L.tile * 0.25,
        duration: MERGE_SUCK_MS,
        ease: 'Cubic.easeIn',
        onComplete: () => obj.destroy(),
      });
    });
    this.scene.time.delayedCall(from.length > 0 ? MERGE_SUCK_MS : 0, () => this.summonFx({ ...to, kind: 'merge' }));
  }

  /** 광역 폭발 고리 (반경 = 단위). */
  blastRing(ux: number, uy: number, radiusUnits: number, color: number): void {
    if (effectsOff()) return; // 연출 끄기 (T-2)
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
    if (effectsOff()) return; // 연출 끄기 (T-2)
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
    if (effectsOff()) return; // 연출 끄기 (T-2)
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
    if (effectsOff()) return; // 연출 끄기 (T-2)
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
    if (effectsOff()) return; // 연출 끄기 (T-2)
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
    if (effectsOff()) return; // 연출 끄기 (T-2)
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

  /**
   * 돈 부족: 칸이 빨갛게 깜빡이며 흔들림. animate = false(화면 흔들림 끔·연출 끄기, A-1)면 자리를 움직이지 않고 빨간 칸만 잠깐.
   */
  shakeTile(tx: number, ty: number, animate = true): void {
    const L = this.layout;
    const c = tileCenterPx(L, tx, ty);
    const rect = this.track(this.scene.add.rectangle(c.x, c.y, L.tile * 0.9, L.tile * 0.9, 0xe53935, 0.28))
      .setStrokeStyle(Math.max(2, L.tile * 0.05), 0xff6b5e, 1)
      .setDepth(FX_DEPTH);
    if (!animate) {
      this.scene.tweens.add({ targets: rect, alpha: 0, delay: 250, duration: 200, onComplete: () => rect.destroy() });
      return;
    }
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
    if (effectsOff()) return; // 연출 끄기 (T-2)
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
    if (effectsOff()) return; // 연출 끄기 (T-2)
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

  /** 치명타: 짧은 하늘빛 별 + 대각선 타격선. 실제 시간 180ms, 흔들림 없음. */
  criticalImpact(ux: number, uy: number): void {
    // 동작 줄이기면 커지는 별·타격선도 없다 (숫자 색·크기만으로 치명타를 알린다)
    if (effectsOff() || this.reducedMotion()) return;
    const p = unitsToPx(this.layout, ux, uy);
    const size = this.layout.tile;
    const star = this.track(this.scene.add.image(p.x, p.y - size * 0.15, TEX_SPARK))
      .setTint(0x4fd8f0).setDepth(FX_DEPTH + 1).setDisplaySize(size * 0.7, size * 0.7);
    const slash = this.track(this.scene.add.rectangle(p.x, p.y - size * 0.15, size * 0.85, size * 0.07, 0xfff4cc))
      .setRotation(-0.65).setDepth(FX_DEPTH + 2);
    this.scene.tweens.add({ targets: star, scaleX: star.scaleX * 1.4, scaleY: star.scaleY * 1.4, alpha: 0, duration: 180, onComplete: () => star.destroy() });
    this.scene.tweens.add({ targets: slash, scaleX: 1.25, alpha: 0, duration: 120, onComplete: () => slash.destroy() });
  }

  /**
   * 동전: 처치 자리(단위)에서 HUD 돈 쪽(target, 화면 px)으로. 도착하면 onArrive.
   * 너무 많으면 날리지 않고 바로 도착 처리한다.
   */
  coin(ux: number, uy: number, timeMs: number, onArrive: () => void): void {
    // 연출 끄기 (T-2): 동전을 날리지 않고 돈 글자에 바로
    if (effectsOff()) {
      onArrive();
      return;
    }
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
