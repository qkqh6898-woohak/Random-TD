/**
 * Phaser 쪽 캐릭터 그림: 캔버스 텍스처 저장소 + 파츠 Image 묶음(CharacterFigure) + 바깥 그림(힉스필드 등) 연결 지점.
 *
 * - 텍스처는 cache.ts가 (종류·각성)마다 한 번만 굽는다. 매 프레임 하는 일은 Image 몇 장의 변환 값만 바꾸는 것.
 * - 바깥 그림: `public/assets/characters/manifest.json`에 id가 있으면 `assets/characters/<id>.webp`(각성 `<id>_awaken.webp`)를
 *   불러 와 절차 그림 대신 쓴다 (몸 한 장 + 숨쉬기·대기 몸동작). 목록이 비어 있거나 파일이 없으면 지금처럼 절차 그림.
 */
import Phaser from 'phaser';
import { AURA_TEX_R, RES_GAME, ensureAuraTexture, ensureComposedTexture, ensureEnemyTexture, ensureFxTexture, ensureHumanTexture, type HumanTexture, type TextureStore } from './cache';
import type { Composition } from './compose';
import type { Ctx } from './cv';
import { auraColorOf, auraOf, fxOf } from './draw';
import { fxCount } from './idle';
import { enemyLook, type HumanLook } from './looks';
import type { MobMotion } from '../../view/render/mobPose';
import { EXTERNAL_ART_MANIFEST, externalArtKey, externalArtUrl, parseExternalEntry, type ExternalArtManifest } from './external';

export { EXTERNAL_ART_DIR, EXTERNAL_ART_MANIFEST, externalArtKey, externalArtUrl, parseExternalEntry, type ExternalArtManifest } from './external';

/** Phaser 텍스처 관리자를 TextureStore로 */
export class PhaserTextureStore implements TextureStore {
  constructor(private readonly textures: Phaser.Textures.TextureManager) {}

  has(key: string): boolean {
    return this.textures.exists(key);
  }

  create(key: string, w: number, h: number): Ctx {
    const tex = this.textures.createCanvas(key, Math.max(1, w), Math.max(1, h));
    if (!tex) throw new Error(`캔버스 텍스처를 만들 수 없다: ${key}`);
    return tex.getContext();
  }

  addFrame(key: string, frame: string, x: number, y: number, w: number, h: number): void {
    this.textures.get(key).add(frame, 0, x, y, w, h);
  }

  commit(key: string): void {
    (this.textures.get(key) as Phaser.Textures.CanvasTexture).refresh();
  }

  getData(key: string): unknown {
    if (!this.textures.exists(key)) return undefined;
    return (this.textures.get(key).customData as Record<string, unknown>)[CHAR_DATA];
  }

  setData(key: string, data: unknown): void {
    (this.textures.get(key).customData as Record<string, unknown>)[CHAR_DATA] = data;
  }

  remove(key: string): void {
    if (this.textures.exists(key)) this.textures.remove(key);
  }

  private scratchCanvas: HTMLCanvasElement | null = null;

  scratch(w: number, h: number): Ctx {
    const c = (this.scratchCanvas ??= document.createElement('canvas'));
    // 크기를 다시 정하면 캔버스가 비워진다
    c.width = Math.max(1, w);
    c.height = Math.max(1, h);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('임시 2D 캔버스를 만들 수 없다');
    return ctx;
  }
}

/** texture.customData 안 캐릭터 배치 정보 자리 */
const CHAR_DATA = 'charLayout';

const stores = new WeakMap<Phaser.Textures.TextureManager, PhaserTextureStore>();

export function textureStore(scene: Phaser.Scene): PhaserTextureStore {
  let s = stores.get(scene.textures);
  if (!s) {
    s = new PhaserTextureStore(scene.textures);
    stores.set(scene.textures, s);
  }
  return s;
}

// ---------------------------------------------------------------------------
// 바깥 그림 연결 지점 (힉스필드 등으로 그린 그림이 생기면 그림 우선)
// ---------------------------------------------------------------------------

/**
 * 매니페스트를 읽어 바깥 그림을 불러 온다 (실패해도 게임에는 영향 없음 → 절차 그림).
 * 불러 온 뒤 새로 만드는 캐릭터부터 바깥 그림을 쓴다.
 */
export async function loadExternalCharacterArt(scene: Phaser.Scene, fetchFn: typeof fetch = fetch): Promise<number> {
  let manifest: ExternalArtManifest;
  try {
    const res = await fetchFn(EXTERNAL_ART_MANIFEST, { cache: 'no-cache' });
    if (!res.ok) return 0;
    manifest = (await res.json()) as ExternalArtManifest;
  } catch {
    return 0;
  }
  const entries = (manifest.characters ?? []).map(parseExternalEntry).filter((e): e is NonNullable<typeof e> => e !== null);
  if (entries.length === 0) return 0;
  for (const e of entries) scene.load.image(externalArtKey(e.group, e.id, e.awakened), externalArtUrl(e.group, e.id, e.awakened));
  await new Promise<void>((resolve) => {
    scene.load.once(Phaser.Loader.Events.COMPLETE, () => resolve());
    scene.load.start();
  });
  return entries.length;
}

/** 기절 중 오라·입자 알파 (잿빛 몸 뒤에서 은은하게만) */
const TINT_GLOW_ALPHA = 0.35;

/** 바깥 그림의 높이 (그림 단위): 절차 그림의 발밑~별 높이와 비슷하게 */
export const EXTERNAL_FIGURE_UNITS = 270;

// ---------------------------------------------------------------------------
// 캐릭터 그림 (파츠 Image 묶음)
// ---------------------------------------------------------------------------

/**
 * 사람형 캐릭터 한 명: 파츠 Image들을 담은 컨테이너. 부모 컨테이너는 그림 단위(발밑 원점)로 늘여 둔다.
 * apply(compose 결과)로 매 프레임 변환만 바꾼다.
 */
export class CharacterFigure {
  readonly container: Phaser.GameObjects.Container;
  readonly textureKey: string;
  readonly external: boolean;
  private readonly partImgs = new Map<string, Phaser.GameObjects.Image>();
  private readonly auraImg: Phaser.GameObjects.Image | null;
  private readonly fxImgs: Phaser.GameObjects.Image[] = [];
  private readonly res: number;
  private tinted = false;
  /** 기절 중 오라·입자 알파 배수 */
  private dim = 1;

  constructor(
    scene: Phaser.Scene,
    readonly tex: HumanTexture,
  ) {
    this.res = tex.res;
    const store = textureStore(scene);
    const look = tex.render.look;
    const extKey = externalArtKey('tower', look.id, tex.render.awakened);
    this.external = scene.textures.exists(extKey);
    this.textureKey = this.external ? extKey : tex.key;
    this.container = scene.add.container(0, 0);
    const aura = auraOf(look, tex.render.awakened);
    if (aura !== 'none') {
      const a = ensureAuraTexture(store, aura, auraColorOf(look, aura));
      this.auraImg = scene.add.image(0, 0, a.key);
      this.container.add(this.auraImg);
    } else this.auraImg = null;
    if (this.external) {
      // 바깥 그림: 몸 상자 높이에 맞춰 한 장 (발밑 = 그림 아래 가운데)
      const img = scene.add.image(0, 0, extKey).setOrigin(0.5, 1);
      const h = img.height || 1;
      img.setScale(EXTERNAL_FIGURE_UNITS / h);
      this.partImgs.set('body', img);
      this.container.add(img);
    } else {
      for (const f of tex.layout.frames) {
        const img = scene.add.image(0, 0, tex.key, f.name).setOrigin(f.originX, f.originY).setScale(1 / this.res);
        this.partImgs.set(f.name, img);
      }
      // 그리는 순서: 등 → 몸 → 동반자 → 소품
      for (const name of ['back', 'body', 'pet', 'prop']) {
        const img = this.partImgs.get(name);
        if (img) this.container.add(img);
      }
    }
    const fx = fxOf(look);
    const n = fxCount(look.grade, fx);
    if (n > 0) {
      const t = ensureFxTexture(store, fx);
      for (let i = 0; i < n; i++) {
        const img = scene.add.image(0, 0, t.key).setVisible(false);
        this.fxImgs.push(img);
        this.container.add(img);
      }
    }
  }

  apply(comp: Composition): void {
    this.container.setPosition(comp.rig.x, comp.rig.y);
    this.container.setRotation(comp.rig.rot);
    let fxi = 0;
    for (const op of comp.ops) {
      if (op.kind === 'aura') {
        if (!this.auraImg) continue;
        const s = (comp.auraR / AURA_TEX_R) * op.sx;
        this.auraImg.setPosition(op.x, op.y).setScale(s).setAlpha(op.alpha * this.dim);
      } else if (op.kind === 'fx') {
        const img = this.fxImgs[fxi++];
        if (!img) continue;
        img.setPosition(op.x, op.y).setScale(op.sx).setAlpha(op.alpha * this.dim).setVisible(op.alpha > 0.02);
      } else if (op.part) {
        const img = this.partImgs.get(op.part);
        if (!img) continue;
        if (this.external) {
          img.setPosition(op.x, op.y + 6).setAlpha(op.alpha);
          continue;
        }
        img.setPosition(op.x, op.y).setRotation(op.rot).setScale(op.sx / this.res, op.sy / this.res).setAlpha(op.alpha);
      }
    }
    for (; fxi < this.fxImgs.length; fxi++) this.fxImgs[fxi]?.setVisible(false);
  }

  /** 기절 등 색 덮기 (null = 원래 색). 오라·입자도 같이 잿빛으로 (검토 반영: 몸만 잿빛이고 신 무지개 빛·별빛은 그대로였다) */
  setTint(color: number | null): void {
    if (color === null && !this.tinted) return;
    this.tinted = color !== null;
    const imgs = [...this.partImgs.values(), ...this.fxImgs, ...(this.auraImg ? [this.auraImg] : [])];
    for (const img of imgs) {
      if (color === null) img.clearTint();
      else img.setTint(color);
    }
    this.dim = color === null ? 1 : TINT_GLOW_ALPHA;
  }

  /** 색 덮기 중인가 (E2E) */
  get isTinted(): boolean {
    return this.tinted;
  }

  /** 지금 보이는 파츠 수 (E2E) */
  get partCount(): number {
    return this.partImgs.size;
  }

  destroy(): void {
    this.container.destroy();
  }
}

/** 타워 캐릭터 텍스처 (각성 여부 포함, 한 번만 굽는다). res: 게임 맵은 RES_GAME, 크게 보이는 타이틀은 1 */
export function towerCharacterTexture(scene: Phaser.Scene, look: HumanLook, awakened: boolean, res = RES_GAME): HumanTexture {
  return ensureHumanTexture(textureStore(scene), look, 'tower', awakened, res);
}

/** 정보 패널 초상화: 한 장에 합친 텍스처 키 (바깥 그림이 있으면 그것) */
export function towerPortraitKey(scene: Phaser.Scene, look: HumanLook, awakened: boolean): string {
  const ext = externalArtKey('tower', look.id, awakened && look.awaken !== undefined);
  if (scene.textures.exists(ext)) return ext;
  return ensureComposedTexture(textureStore(scene), look, 'tower', awakened).key;
}

/** '#RRGGBB' ← 0xRRGGBB */
export function intToHex(n: number): string {
  return `#${(n & 0xffffff).toString(16).padStart(6, '0')}`;
}

/** 적 텍스처: 외형 데이터가 있으면 새 그림 (없으면 null → 예전 art/mobs.ts 그림). */
export function enemyCharacterTexture(scene: Phaser.Scene, mobId: string, legionColor: number): { key: string; size: number; motion: MobMotion } | null {
  const look = enemyLook(mobId);
  if (!look) return null;
  const ext = externalArtKey('enemy', mobId, false);
  // 데이터 움직임 그대로 (walk·flap·float·slither — mobPose가 모두 그린다)
  const motion: MobMotion = look.motion;
  if (scene.textures.exists(ext)) {
    const img = scene.textures.get(ext).getSourceImage() as { width: number };
    return { key: ext, size: img.width || 128, motion };
  }
  const t = ensureEnemyTexture(textureStore(scene), look, intToHex(legionColor));
  return { key: t.key, size: t.size, motion };
}
