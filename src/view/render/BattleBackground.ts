/**
 * 전투 배경 그림 (HF-2): 힉스필드 배경(테마 × 하늘 밴드)을 Game 장면 맨 아래에 화면 전체를 덮게 그린다.
 * T-3: 논리 높이가 화면 비율대로 1920~2600이라 지금 게임 크기(scene.scale)를 덮고, 크기가 바뀌면 `resize()`로 다시 덮는다.
 * 넓은 화면의 무대 밖 띠에도 같은 그림을 흐리게 깔도록 바뀔 때마다 `onImage(주소)`를 부른다.
 *
 * - 어떤 그림인지는 artBand.ts(순수)가 정한다. 여기서는 불러오기·서서히 바꾸기·지우기만.
 * - 처음 쓰는 그림만 Phaser 로더로 그때 받는다 (assetUrl → 한 파일 빌드면 data URI). 밴드가 끝나기 몇 단계 전에 다음 그림을 미리 받는다.
 * - 바뀔 때 crossfadeMs 동안 서서히 (연출 끄기면 바로). 다 바뀌면 지금·다음 그림이 아닌 배경 텍스처는 지운다.
 * - 그림이 없거나 못 받으면 아무것도 그리지 않는다 → 맵 렌더러의 절차 풀밭 배경이 그대로 보인다 (onCover(false)).
 * - 위아래 끝에 옅은 어둠(scrim)을 깔아 성·성벽 위에 놓인 HUD 글자가 잘 보이게 한다.
 */
import Phaser from 'phaser';
import { assetUrl } from '../../assets';
import { effectsOff } from '../effects';
import { backgroundPath, backgroundTextureKey, coverScale, type BandKey } from '../artBand';

/** 배경 그림 깊이: 절차 풀밭(-50)보다 위, 맵 바닥(0)보다 아래 */
export const BATTLE_BG_DEPTH = -40;
const SCRIM_DEPTH = -39;
const SCRIM_KEY = 'bg-scrim';
/** 위·아래 어둠 높이 (화면 비율)와 가장 진한 알파 */
const SCRIM_TOP = 0.2;
const SCRIM_BOTTOM = 0.16;
const SCRIM_ALPHA = 0.5;
/** 덮기 배율 여유 (카메라 흔들림 몫) */
const COVER_BLEED = 1.02;

export interface BattleBackgroundOptions {
  crossfadeMs: number;
  /** 배경 그림이 화면을 다 덮었는가 (true면 절차 배경을 숨겨도 된다) */
  onCover?: (covered: boolean) => void;
  /** 지금 보이기 시작한 배경 그림 주소 (무대 밖 띠용, T-3) */
  onImage?: (url: string) => void;
}

export class BattleBackground {
  private current: { key: string; img: Phaser.GameObjects.Image } | null = null;
  private readonly leaving: Phaser.GameObjects.Image[] = [];
  private wantedKey: string | null = null;
  private nextKey: string | null = null;
  private readonly loading = new Set<string>();
  private readonly failed = new Set<string>();
  private scrim: Phaser.GameObjects.Image | null = null;
  private destroyed = false;
  private coveredFlag = false;
  /** 텍스처 키 → 그림 주소 (무대 밖 띠) */
  private readonly urls = new Map<string, string>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly opts: BattleBackgroundOptions,
  ) {
    scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, this.onLoadError, this);
  }

  /** 지금 보이는(또는 보이기 시작한) 배경 텍스처 키 (없으면 null) — E2E */
  get currentKey(): string | null {
    return this.current?.key ?? null;
  }

  /** 배경 그림이 화면을 다 덮었는가 (절차 배경을 숨겨도 되는가) */
  get covered(): boolean {
    return this.coveredFlag;
  }

  /** 서서히 바뀌는 중인가 */
  get fading(): boolean {
    return this.leaving.length > 0;
  }

  /**
   * 매 프레임 불러도 된다 (바뀔 때만 일한다).
   * @param want 지금 단계의 배경
   * @param next 미리 받아 둘 다음 배경 (없으면 null)
   */
  update(want: BandKey, next: BandKey | null): void {
    if (this.destroyed) return;
    const key = backgroundTextureKey(want);
    if (key !== this.wantedKey) {
      this.wantedKey = key;
      this.ensure(want);
    }
    const nk = next ? backgroundTextureKey(next) : null;
    if (nk !== this.nextKey) {
      this.nextKey = nk;
      if (next) this.ensure(next);
    }
  }

  private ensure(k: BandKey): void {
    const key = backgroundTextureKey(k);
    if (this.scene.textures.exists(key)) {
      if (key === this.wantedKey) this.show(key);
      return;
    }
    if (this.loading.has(key) || this.failed.has(key)) return;
    this.loading.add(key);
    this.scene.load.once(`filecomplete-image-${key}`, () => {
      this.loading.delete(key);
      if (!this.destroyed && key === this.wantedKey) this.show(key);
    });
    const url = assetUrl(backgroundPath(k));
    this.urls.set(key, url);
    this.scene.load.image(key, url);
    if (!this.scene.load.isLoading()) this.scene.load.start();
  }

  private onLoadError(file: Phaser.Loader.File): void {
    if (!this.loading.has(file.key)) return;
    this.loading.delete(file.key);
    this.failed.add(file.key);
  }

  private show(key: string): void {
    if (this.current?.key === key) return;
    const img = this.scene.add.image(0, 0, key).setDepth(BATTLE_BG_DEPTH);
    this.cover(img);
    this.ensureScrim();
    const url = this.urls.get(key);
    if (url) this.opts.onImage?.(url);
    const prev = this.current;
    this.current = { key, img };
    const fadeMs = effectsOff() ? 0 : this.opts.crossfadeMs;
    if (fadeMs <= 0) {
      if (prev) prev.img.destroy();
      for (const o of this.leaving.splice(0)) o.destroy();
      this.coveredFlag = true;
      this.opts.onCover?.(true);
      this.pruneTextures();
      return;
    }
    // 새 그림을 위에서 서서히 (예전 그림은 그 밑에 그대로 두었다가 다 덮이면 지운다)
    if (prev) this.leaving.push(prev.img);
    img.setAlpha(0);
    this.scene.tweens.add({
      targets: img,
      alpha: 1,
      duration: fadeMs,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        if (this.destroyed) return;
        this.coveredFlag = true;
        this.opts.onCover?.(true);
        // 이 그림보다 먼저 있던 것만 지운다 (그 사이 또 바뀌었으면 더 새 그림은 남김)
        const idx = this.leaving.indexOf(img);
        const old = idx >= 0 ? this.leaving.splice(0, idx) : this.leaving.splice(0);
        for (const o of old) o.destroy();
        this.pruneTextures();
      },
    });
  }

  /** 위아래 옅은 어둠 (세로 그라데이션 한 장, 한 번만 굽는다) */
  private ensureScrim(): void {
    if (this.scrim) return;
    if (!this.scene.textures.exists(SCRIM_KEY)) {
      const tex = this.scene.textures.createCanvas(SCRIM_KEY, 4, 256);
      if (tex) {
        const ctx = tex.getContext();
        const grad = ctx.createLinearGradient(0, 0, 0, 256);
        grad.addColorStop(0, `rgba(8, 10, 22, ${SCRIM_ALPHA})`);
        grad.addColorStop(SCRIM_TOP, 'rgba(8, 10, 22, 0)');
        grad.addColorStop(1 - SCRIM_BOTTOM, 'rgba(8, 10, 22, 0)');
        grad.addColorStop(1, `rgba(8, 10, 22, ${SCRIM_ALPHA})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 4, 256);
        tex.refresh();
      }
    }
    this.scrim = this.scene.add.image(0, 0, SCRIM_KEY).setOrigin(0).setDepth(SCRIM_DEPTH);
    this.scrim.setDisplaySize(this.scene.scale.width, this.scene.scale.height);
  }

  /** 그림 하나를 지금 게임 크기 가운데에 꽉 차게 (화면 흔들림(보스 등장·레전드 승급)에도 가장자리가 비지 않게 조금 크게) */
  private cover(img: Phaser.GameObjects.Image): void {
    const { width: w, height: h } = this.scene.scale;
    img.setPosition(w / 2, h / 2);
    img.setScale(coverScale(img.width, img.height, w, h) * COVER_BLEED);
  }

  /** 게임 크기가 바뀜 (T-3): 지금·사라지는 중인 그림과 어둠을 새 크기로 다시 덮는다 */
  resize(): void {
    if (this.destroyed) return;
    if (this.current) this.cover(this.current.img);
    for (const o of this.leaving) this.cover(o);
    this.scrim?.setDisplaySize(this.scene.scale.width, this.scene.scale.height);
  }

  /** 지금·다음·서서히 사라지는 중인 그림이 아닌 배경 텍스처를 지운다 (메모리) */
  private pruneTextures(): void {
    const keep = new Set<string>();
    if (this.current) keep.add(this.current.key);
    if (this.nextKey) keep.add(this.nextKey);
    for (const o of this.leaving) keep.add(o.texture.key);
    for (const key of this.scene.textures.getTextureKeys()) {
      if (/^bg-t\d\d-b\d+$/.test(key) && !keep.has(key) && !this.loading.has(key)) this.scene.textures.remove(key);
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.scene.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, this.onLoadError, this);
    if (this.current) {
      this.scene.tweens.killTweensOf(this.current.img);
      this.current.img.destroy();
    }
    for (const o of this.leaving.splice(0)) o.destroy();
    this.scrim?.destroy();
    this.current = null;
    this.scrim = null;
  }
}
