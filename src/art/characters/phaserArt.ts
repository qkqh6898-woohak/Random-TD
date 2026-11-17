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
import { EXTERNAL_ART_MANIFEST, EXTERNAL_BOSS_SCALE, EXTERNAL_ENEMY_SCALE, externalArtKey, externalArtUrl, externalEntries, externalFigureScale } from './external';
import { assetUrl, currentAssetTable, embeddedAssetJson } from '../../assets';

export {
  EXTERNAL_ART_DIR,
  EXTERNAL_ART_MANIFEST,
  EXTERNAL_BOSS_SCALE,
  EXTERNAL_ENEMY_SCALE,
  EXTERNAL_FIGURE_MAX_W,
  EXTERNAL_FIGURE_UNITS,
  externalArtKey,
  externalArtUrl,
  externalEntries,
  externalFigureScale,
  parseExternalEntry,
  type ExternalArtManifest,
} from './external';

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

/** Phaser 캐시의 매니페스트 키 */
const EXTERNAL_MANIFEST_KEY = 'ext-char-manifest';

/**
 * 바깥 그림(힉스필드)을 Phaser 로더에 올린다 — Boot.preload에서 불러 타이틀이 뜨기 전에 다 받아 둔다 (그 뒤 만드는 캐릭터는 모두 그림 우선).
 * - 한 파일 빌드(window.__RTD_ASSETS__): 표에 든 매니페스트 객체와 data URI를 바로 쓴다 (file://에서는 fetch가 안 됨).
 * - 개발 서버·일반 빌드: manifest.json을 먼저 받고, 받자마자 같은 로딩 안에서 그림들을 이어서 올린다.
 * 파일 하나가 실패해도 그 캐릭터만 절차 그림 (Phaser 로더는 실패한 파일을 건너뛰고 끝낸다). 이미 있는 텍스처는 다시 받지 않는다.
 */
export function queueExternalCharacterArt(scene: Phaser.Scene): void {
  const queue = (manifest: unknown): void => {
    for (const e of externalEntries(manifest)) {
      const key = externalArtKey(e.group, e.id, e.awakened);
      if (!scene.textures.exists(key)) scene.load.image(key, assetUrl(externalArtUrl(e.group, e.id, e.awakened)));
    }
  };
  const embedded = embeddedAssetJson(EXTERNAL_ART_MANIFEST, currentAssetTable());
  if (embedded !== undefined) {
    queue(embedded);
    return;
  }
  if (scene.cache.json.exists(EXTERNAL_MANIFEST_KEY)) {
    queue(scene.cache.json.get(EXTERNAL_MANIFEST_KEY));
    return;
  }
  scene.load.once(`filecomplete-json-${EXTERNAL_MANIFEST_KEY}`, (_key: string, _type: string, data: unknown) => queue(data));
  scene.load.json(EXTERNAL_MANIFEST_KEY, assetUrl(EXTERNAL_ART_MANIFEST));
}

/** 기절 중 오라·입자 알파 (잿빛 몸 뒤에서 은은하게만) */
const TINT_GLOW_ALPHA = 0.35;

/** 바깥 그림 외곽선 두께 (그림 높이 대비) — 412px 휴대폰에서 약 1.2px (F10-4: 흑백에서도 풀밭과 캐릭터가 갈라지게) */
export const EXTERNAL_OUTLINE_OF_H = 0.022;
/** G-2: 진한 외곽선 바깥의 옅은 빛 테두리 두께 (그림 높이 대비) — 어두운 배경(밤·침공 밴드)에서도 실루엣이 읽히게 */
export const EXTERNAL_HALO_OF_H = 0.012;
/** 바깥 그림 외곽선 색 (palette outline 진한 갈색)·알파 */
const EXTERNAL_OUTLINE_RGBA = 'rgba(40, 24, 14, 0.9)';
/** G-2 바깥 빛 테두리 색 (따뜻한 흰빛) */
const EXTERNAL_HALO_RGBA = 'rgba(255, 244, 214, 0.5)';
/** 외곽선을 찍는 방향 수 (원 둘레) */
const EXTERNAL_OUTLINE_STEPS = 16;

/**
 * 바깥 그림(힉스필드)에 굵은 진한 외곽선을 두른 텍스처 키 (처음 한 번 굽는다). 문서 4장 '컬러 대비와 굵은 외곽선은 배경과 타워를 분리' —
 * 밝은 궁수·고블린이 흑백 캡처에서 풀밭과 섞이던 것 (F10-4 검토). 그림 둘레에 pad만큼 여백을 더한다.
 * G-2: 외곽선 바깥에 옅은 빛 테두리(halo) + 그림 위 왼쪽 위에서 오는 은은한 테두리 빛(rim light) → 어떤 배경에서도 캐릭터가 떠 보인다.
 * 그림 원본을 읽을 수 없으면(캔버스 없음 등) 원래 키 그대로.
 */
export function outlinedExternalTexture(scene: Phaser.Scene, key: string): { key: string; pad: number; w: number; h: number } {
  const src = scene.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const w = src.width;
  const h = src.height;
  const line = Math.max(2, Math.round(h * EXTERNAL_OUTLINE_OF_H));
  const pad = line + Math.max(1, Math.round(h * EXTERNAL_HALO_OF_H));
  const olKey = `${key}-ol`;
  if (scene.textures.exists(olKey)) return { key: olKey, pad, w, h };
  try {
    const sil = document.createElement('canvas');
    sil.width = w;
    sil.height = h;
    const sg = sil.getContext('2d');
    const tex = scene.textures.createCanvas(olKey, w + pad * 2, h + pad * 2);
    const g = tex?.getContext();
    if (!sg || !tex || !g) throw new Error('no canvas');
    const ring = (color: string, r: number): void => {
      sg.globalCompositeOperation = 'copy';
      sg.drawImage(src, 0, 0);
      sg.globalCompositeOperation = 'source-in';
      sg.fillStyle = color;
      sg.fillRect(0, 0, w, h);
      for (let i = 0; i < EXTERNAL_OUTLINE_STEPS; i++) {
        const a = (i / EXTERNAL_OUTLINE_STEPS) * Math.PI * 2;
        g.drawImage(sil, pad + Math.cos(a) * r, pad + Math.sin(a) * r);
      }
    };
    ring(EXTERNAL_HALO_RGBA, pad);
    ring(EXTERNAL_OUTLINE_RGBA, line);
    g.drawImage(src, pad, pad);
    // 테두리 빛: 그림 모양 안에서만(source-atop) 왼쪽 위가 살짝 밝다
    g.globalCompositeOperation = 'source-atop';
    const rim = g.createLinearGradient(pad, pad, pad + w * 0.7, pad + h * 0.7);
    rim.addColorStop(0, 'rgba(255, 246, 220, 0.22)');
    rim.addColorStop(0.35, 'rgba(255, 246, 220, 0.04)');
    rim.addColorStop(1, 'rgba(255, 246, 220, 0)');
    g.fillStyle = rim;
    g.fillRect(pad, pad, w, h);
    g.globalCompositeOperation = 'source-over';
    tex.refresh();
    return { key: olKey, pad, w, h };
  } catch {
    if (scene.textures.exists(olKey)) scene.textures.remove(olKey);
    return { key, pad: 0, w, h };
  }
}

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
  /** 바깥 그림 기본 배율 */
  private extScale = 1;
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
      // 바깥 그림: 몸 상자 높이에 맞춰 한 장 (발밑 = 그림 아래 가운데). 외곽선 텍스처는 둘레 여백만큼 커서 원점을 그만큼 옮긴다 — 크기·발밑은 그대로
      const ol = outlinedExternalTexture(scene, extKey);
      const img = scene.add.image(0, 0, ol.key).setOrigin(0.5, (ol.h + ol.pad) / (ol.h + ol.pad * 2));
      this.extScale = externalFigureScale(ol.w, ol.h);
      img.setScale(this.extScale);
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
          // 숨쉬기·대기 몸동작: 몸 파츠의 늘이기·기울기를 그림 한 장에 (발밑 기준)
          img.setPosition(op.x, op.y + 6).setRotation(op.rot * 0.5).setScale(this.extScale * op.sx, this.extScale * op.sy).setAlpha(op.alpha);
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

/** 적 텍스처: 외형 데이터가 있으면 새 그림 — 바깥 그림(WebP)이 있으면 그것, 없으면 SD 절차 그림 (외형 데이터가 없으면 null → 예전 art/mobs.ts 그림). */
export function enemyCharacterTexture(scene: Phaser.Scene, mobId: string, legionColor: number): { key: string; size: number; motion: MobMotion } | null {
  const look = enemyLook(mobId);
  if (!look) return null;
  const ext = externalArtKey('enemy', mobId, false);
  // 데이터 움직임 그대로 (walk·flap·float·slither — mobPose가 모두 그린다)
  const motion: MobMotion = look.motion;
  if (scene.textures.exists(ext)) {
    // G 통합: 하수인·대장·4천왕·군주 모두 바깥 그림(통통한 캐주얼 WebP) 우선, 파일이 없으면 아래 SD 절차 그림.
    // 바깥 그림은 캐릭터 경계로 잘려 정사각형이 아니다 → 긴 변을 크기로 (몹 지름에 맞춤)
    const img = scene.textures.get(ext).getSourceImage() as { width: number; height: number };
    // 몸 전체 그림은 둥근 절차 몹보다 같은 지름에서 작아 보인다 → EXTERNAL_ENEMY_SCALE배로 (보스는 이미 커서 EXTERNAL_BOSS_SCALE배)
    const mul = look.rank === 'minion' ? EXTERNAL_ENEMY_SCALE : EXTERNAL_BOSS_SCALE;
    return { key: ext, size: (Math.max(img.width, img.height) || 128) / mul, motion };
  }
  const t = ensureEnemyTexture(textureStore(scene), look, intToHex(legionColor));
  return { key: t.key, size: t.size, motion };
}
