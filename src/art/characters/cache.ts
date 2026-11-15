/**
 * 캐릭터 텍스처 캐시 (Phaser 없음 — 텍스처 저장소를 인터페이스로 받아 단위 테스트에서 가짜를 넣는다).
 *
 * - 사람형 캐릭터: (종류 묶음, id, 각성)마다 캔버스 한 장을 한 번만 그린다. 파츠는 그 캔버스의 프레임(back·body·prop·pet).
 *   등급은 타워 종류마다 정해져 있어 키에 따로 넣지 않는다 (받침대는 art/towers.ts의 등급별 텍스처를 그대로 쓴다).
 * - 적: (id, 군단 색)마다 한 장.  입자·오라: 종류(·색)마다 한 장을 모든 캐릭터가 같이 쓴다.
 * - 매 프레임 다시 그리지 않는다: 이미 있으면 키만 돌려준다 (bakeStats.count로 확인).
 * - 사람형·합친 그림은 큰 임시 캔버스에 그린 뒤 칠해진 부분만 작은 텍스처로 옮긴다(잘라 내기 + 다시 늘어놓기). 잘라 낸 배치·원점은
 *   텍스처 자체에 붙여 둔다(store.setData) — 모듈 전역 표가 아니라서 텍스처가 지워지면 배치도 같이 사라진다.
 */
import { prepareHuman, drawHumanComposed, renderHumanAtlas, type HumanRender } from './draw';
import type { Ctx } from './cv';
import { drawEnemy } from './enemies';
import { drawAura, drawParticle, PARTICLE_BOX } from './fxArt';
import type { AuraId, FxId } from './library';
import type { EnemyLook, HumanLook, LookGroup } from './looks';
import { drawPortrait, type Expression } from './portraits';
import { ENEMY_BOX, PORTRAIT_BOX, atlasLayout, composedBox, packLayout, trimLayout, type AtlasLayout } from './rig';

export interface TextureStore {
  has(key: string): boolean;
  /** w×h 픽셀 캔버스 텍스처를 만들고 그리기 컨텍스트를 돌려준다 */
  create(key: string, w: number, h: number): Ctx;
  /** 캔버스 안 사각형을 이름 붙은 프레임으로 */
  addFrame(key: string, frame: string, x: number, y: number, w: number, h: number): void;
  /** 다 그렸으면 반영 (Phaser: GPU로 올리기) */
  commit(key: string): void;
  /** 텍스처에 붙여 둔 정보 (파츠 배치·원점 — Phaser는 texture.customData). 없으면 undefined */
  getData(key: string): unknown;
  setData(key: string, data: unknown): void;
  /** 텍스처를 지운다 (굽다가 그리기가 실패하면 반쯤 만든 텍스처를 남기지 않는다) */
  remove(key: string): void;
  /**
   * 임시 캔버스 (선택): 여기에 크게 그린 뒤 칠해진 부분만 잘라 작은 텍스처로 옮긴다 → 투명한 빈 곳이 메모리에 남지 않는다.
   * 다음 호출에서 다시 쓰므로 돌려받은 뒤 곧바로 옮겨야 한다. 없으면(테스트용 가짜) 큰 캔버스에 바로 그린다.
   */
  scratch?(w: number, h: number): Ctx;
}

/** 게임 화면 해상도 (그림 단위당 픽셀). 캐릭터 높이 1.1칸 ≈ 기준 해상도 120px → 274단위 × 0.5 ≈ 137px (축소 비율 1:1에 가깝게) */
export const RES_GAME = 0.5;
/** 정보 패널 초상화 해상도 (패널 칸 ≈ 150~175 물리 px — 축소해서 보여 주도록 넉넉히) */
export const RES_PORTRAIT = 1;
/** 적: 128단위 → 160px */
export const RES_ENEMY = 1.25;
/** 입자·오라 */
export const RES_FX = 1;
/** 오라 텍스처 반지름 (그림 단위) — 쓸 때 늘이거나 줄인다 */
export const AURA_TEX_R = 64;

export const bakeStats = { count: 0 };

export function humanKey(group: LookGroup, id: string, awakened: boolean, res = RES_GAME): string {
  return `char-${group}-${id}-${awakened ? 'a' : 'n'}${res === RES_GAME ? '' : `@${res}`}`;
}

export function enemyKey(id: string, legionColor: string, res = RES_ENEMY): string {
  return `char-enemy-${id}-${legionColor.replace('#', '').toLowerCase()}${res === RES_ENEMY ? '' : `@${res}`}`;
}

export function fxKey(fx: FxId): string {
  return `charfx-${fx}`;
}

export function auraKey(aura: AuraId, color: string): string {
  return `charaura-${aura}-${color.replace('#', '').toLowerCase()}`;
}

export interface HumanTexture {
  key: string;
  render: HumanRender;
  layout: AtlasLayout;
  /** 구운 해상도 (그림 단위당 픽셀) — 그리는 쪽은 1/res로 늘인다 */
  res: number;
}

/** 텍스처 하나를 굽는다: 만들기 → 그리기 → 반영. 그리기가 실패하면 텍스처를 지우고 다시 던진다 (다음 요청이 반쪽 텍스처를 쓰지 않게). */
function bake(store: TextureStore, key: string, w: number, h: number, draw: (c: Ctx) => void): void {
  const ctx = store.create(key, w, h);
  try {
    draw(ctx);
    store.commit(key);
  } catch (e) {
    store.remove(key);
    throw e;
  }
  bakeStats.count++;
}

/**
 * 큰 배치(full)로 그린 뒤 칠해진 만큼 잘라 작은 캔버스에 다시 늘어놓아 굽는다. 돌려주는 배치 = 텍스처 안의 실제 프레임.
 * 저장소에 임시 캔버스가 없으면 큰 캔버스에 바로 그리고 프레임만 잘라 낸다.
 */
function bakeTrimmed(store: TextureStore, key: string, full: AtlasLayout, draw: (c: Ctx) => void): AtlasLayout {
  const scratch = store.scratch?.(full.width, full.height);
  if (scratch) {
    draw(scratch);
    const packed = packLayout(trimLayout(scratch, full));
    const out = packed.layout;
    bake(store, key, out.width, out.height, (c) => {
      out.frames.forEach((f, i) => {
        const src = packed.src[i] as { x: number; y: number };
        c.drawImage(scratch.canvas, src.x, src.y, f.w, f.h, f.x, f.y, f.w, f.h);
        store.addFrame(key, f.name, f.x, f.y, f.w, f.h);
      });
    });
    return out;
  }
  let out = full;
  bake(store, key, full.width, full.height, (c) => {
    draw(c);
    out = trimLayout(c, full);
    for (const f of out.frames) store.addFrame(key, f.name, f.x, f.y, f.w, f.h);
  });
  return out;
}

function isLayout(v: unknown): v is AtlasLayout {
  return typeof v === 'object' && v !== null && Array.isArray((v as AtlasLayout).frames);
}

/** 사람형 캐릭터 파츠 텍스처 (없을 때만 그린다). 잘라 낸 배치는 텍스처 자체에 붙여 둔다(store.setData). */
export function ensureHumanTexture(store: TextureStore, base: HumanLook, group: LookGroup, awakened: boolean, res = RES_GAME): HumanTexture {
  const render = prepareHuman(base, awakened);
  const key = humanKey(group, base.id, render.awakened, res);
  const saved = store.has(key) ? store.getData(key) : undefined;
  if (isLayout(saved)) return { key, render, layout: saved, res };
  // 처음이거나, 같은 키의 텍스처가 배치 정보 없이 있으면(다른 곳에서 만듦) 지우고 다시 굽는다
  if (store.has(key)) store.remove(key);
  const full = atlasLayout(render.rig.parts, res);
  const layout = bakeTrimmed(store, key, full, (c) => renderHumanAtlas(c, render, res));
  store.setData(key, layout);
  return { key, render, layout, res };
}

export interface ComposedTexture {
  key: string;
  /** 발밑의 텍스처 안 비율 */
  originX: number;
  originY: number;
  width: number;
  height: number;
}

/**
 * 한 장에 합친 그림 (정보 패널 초상화용, 기본 해상도 RES_PORTRAIT). 원점 비율을 함께 돌려준다.
 * 모든 파츠 상자의 합집합(떠 있는 높이 포함)에 그린 뒤 칠해진 만큼 잘라 내므로 키 큰 캐릭터도 잘리지 않고 칸을 꽉 채운다.
 */
export function ensureComposedTexture(store: TextureStore, base: HumanLook, group: LookGroup, awakened: boolean, res = RES_PORTRAIT): ComposedTexture {
  const render = prepareHuman(base, awakened);
  const key = `${humanKey(group, base.id, render.awakened, res)}-full`;
  const saved = store.has(key) ? (store.getData(key) as ComposedTexture | undefined) : undefined;
  if (saved && typeof saved.originX === 'number') return saved;
  if (store.has(key)) store.remove(key);
  // 여유 12단위: 파츠는 자기 상자 안 + 선 굵기만큼만 넘친다(단위 테스트) → 가장자리 줄이 늘 비어 있다 = 잘리지 않았다
  const b = composedBox(render.rig, 12);
  const w = Math.ceil(b.width * res);
  const h = Math.ceil(b.height * res);
  const full: AtlasLayout = { width: w, height: h, frames: [{ name: 'body', x: 0, y: 0, w, h, originX: -b.left / b.width, originY: -b.top / b.height }] };
  const out = bakeTrimmed(store, key, full, (c) => {
    c.save();
    c.translate(-b.left * res, -b.top * res);
    c.scale(res, res);
    drawHumanComposed(c, render, { aura: false });
    c.restore();
  });
  const f = out.frames[0] as AtlasLayout['frames'][number];
  const result: ComposedTexture = { key, originX: f.originX, originY: f.originY, width: f.w, height: f.h };
  store.setData(key, result);
  return result;
}

/** 적 텍스처 (128단위 정사각형). */
export function ensureEnemyTexture(store: TextureStore, look: EnemyLook, legionColor: string, res = RES_ENEMY): { key: string; size: number } {
  const key = enemyKey(look.id, legionColor, res);
  const size = Math.ceil(ENEMY_BOX * res);
  if (!store.has(key)) {
    bake(store, key, size, size, (ctx) => {
      ctx.save();
      ctx.scale(res, res);
      drawEnemy(ctx, look, legionColor);
      ctx.restore();
      store.addFrame(key, 'full', 0, 0, size, size);
    });
  }
  return { key, size };
}

/** 인물 초상 (200×220단위). */
export function ensurePortraitTexture(store: TextureStore, look: HumanLook, ex: Expression, res = 1): { key: string; width: number; height: number } {
  const key = `char-portrait-${look.id}-${ex}${res === 1 ? '' : `@${res}`}`;
  const width = Math.ceil(PORTRAIT_BOX.width * res);
  const height = Math.ceil(PORTRAIT_BOX.height * res);
  if (!store.has(key)) {
    bake(store, key, width, height, (ctx) => {
      ctx.save();
      ctx.scale(res, res);
      drawPortrait(ctx, look, ex);
      ctx.restore();
      store.addFrame(key, 'full', 0, 0, width, height);
    });
  }
  return { key, width, height };
}

/** 입자 텍스처 (종류마다 한 장, 모두 같이 씀). */
export function ensureFxTexture(store: TextureStore, fx: FxId, res = RES_FX): { key: string; size: number } {
  const key = fxKey(fx);
  const size = Math.ceil(PARTICLE_BOX * res);
  if (!store.has(key)) {
    bake(store, key, size, size, (ctx) => {
      ctx.save();
      ctx.scale(res, res);
      ctx.translate(PARTICLE_BOX / 2, PARTICLE_BOX / 2);
      drawParticle(ctx, fx);
      ctx.restore();
      store.addFrame(key, 'full', 0, 0, size, size);
    });
  }
  return { key, size };
}

/** 오라 텍스처 (종류·색마다 한 장). 반지름 AURA_TEX_R 단위로 그려 두고 쓸 때 늘인다. */
export function ensureAuraTexture(store: TextureStore, aura: AuraId, color: string, res = RES_FX): { key: string; size: number } {
  const key = auraKey(aura, color);
  const size = Math.ceil(AURA_TEX_R * 2 * res);
  if (!store.has(key)) {
    bake(store, key, size, size, (ctx) => {
      ctx.save();
      ctx.scale(res, res);
      ctx.translate(AURA_TEX_R, AURA_TEX_R);
      drawAura(ctx, aura, color, AURA_TEX_R);
      ctx.restore();
      store.addFrame(key, 'full', 0, 0, size, size);
    });
  }
  return { key, size };
}
