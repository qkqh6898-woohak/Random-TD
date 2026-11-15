/**
 * 캐릭터 텍스처 캐시 (Phaser 없음 — 텍스처 저장소를 인터페이스로 받아 단위 테스트에서 가짜를 넣는다).
 *
 * - 사람형 캐릭터: (종류 묶음, id, 각성)마다 캔버스 한 장을 한 번만 그린다. 파츠는 그 캔버스의 프레임(back·body·prop·pet).
 *   등급은 타워 종류마다 정해져 있어 키에 따로 넣지 않는다 (받침대는 art/towers.ts의 등급별 텍스처를 그대로 쓴다).
 * - 적: (id, 군단 색)마다 한 장.  입자·오라: 종류(·색)마다 한 장을 모든 캐릭터가 같이 쓴다.
 * - 매 프레임 다시 그리지 않는다: 이미 있으면 키만 돌려준다 (bakeStats.count로 확인).
 */
import { prepareHuman, drawHumanComposed, renderHumanAtlas, type HumanRender } from './draw';
import type { Ctx } from './cv';
import { drawEnemy } from './enemies';
import { drawAura, drawParticle, PARTICLE_BOX } from './fxArt';
import type { AuraId, FxId } from './library';
import type { EnemyLook, HumanLook, LookGroup } from './looks';
import { drawPortrait, type Expression } from './portraits';
import { BOXES, ENEMY_BOX, PORTRAIT_BOX, atlasLayout, type AtlasLayout } from './rig';

export interface TextureStore {
  has(key: string): boolean;
  /** w×h 픽셀 캔버스 텍스처를 만들고 그리기 컨텍스트를 돌려준다 */
  create(key: string, w: number, h: number): Ctx;
  /** 캔버스 안 사각형을 이름 붙은 프레임으로 */
  addFrame(key: string, frame: string, x: number, y: number, w: number, h: number): void;
  /** 다 그렸으면 반영 (Phaser: GPU로 올리기) */
  commit(key: string): void;
}

/** 게임 화면 해상도 (그림 단위당 픽셀). 캐릭터 높이 1.1칸 ≈ 기준 해상도 120px → 274단위 × 0.5 ≈ 137px (축소 비율 1:1에 가깝게) */
export const RES_GAME = 0.5;
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
}

/** 사람형 캐릭터 파츠 텍스처 (없을 때만 그린다). */
export function ensureHumanTexture(store: TextureStore, base: HumanLook, group: LookGroup, awakened: boolean, res = RES_GAME): HumanTexture {
  const render = prepareHuman(base, awakened);
  const key = humanKey(group, base.id, render.awakened, res);
  const layout = atlasLayout(render.rig.parts, res);
  if (!store.has(key)) {
    const ctx = store.create(key, layout.width, layout.height);
    renderHumanAtlas(ctx, render, res);
    for (const f of layout.frames) store.addFrame(key, f.name, f.x, f.y, f.w, f.h);
    store.commit(key);
    bakeStats.count++;
  }
  return { key, render, layout };
}

/** 한 장에 합친 그림 (정보 패널 초상화용). 원점 비율을 함께 돌려준다. */
export function ensureComposedTexture(
  store: TextureStore,
  base: HumanLook,
  group: LookGroup,
  awakened: boolean,
  res = RES_GAME,
): { key: string; originX: number; originY: number; width: number; height: number } {
  const render = prepareHuman(base, awakened);
  const key = `${humanKey(group, base.id, render.awakened, res)}-full`;
  const b = BOXES.body;
  const w = Math.ceil(b.width * res);
  const h = Math.ceil(b.height * res);
  if (!store.has(key)) {
    const ctx = store.create(key, w, h);
    ctx.save();
    ctx.translate(-b.left * res, -b.top * res);
    ctx.scale(res, res);
    drawHumanComposed(ctx, render, { aura: false });
    ctx.restore();
    store.addFrame(key, 'full', 0, 0, w, h);
    store.commit(key);
    bakeStats.count++;
  }
  return { key, originX: -b.left / b.width, originY: -b.top / b.height, width: w, height: h };
}

/** 적 텍스처 (128단위 정사각형). */
export function ensureEnemyTexture(store: TextureStore, look: EnemyLook, legionColor: string, res = RES_ENEMY): { key: string; size: number } {
  const key = enemyKey(look.id, legionColor, res);
  const size = Math.ceil(ENEMY_BOX * res);
  if (!store.has(key)) {
    const ctx = store.create(key, size, size);
    ctx.save();
    ctx.scale(res, res);
    drawEnemy(ctx, look, legionColor);
    ctx.restore();
    store.addFrame(key, 'full', 0, 0, size, size);
    store.commit(key);
    bakeStats.count++;
  }
  return { key, size };
}

/** 인물 초상 (200×220단위). */
export function ensurePortraitTexture(store: TextureStore, look: HumanLook, ex: Expression, res = 1): { key: string; width: number; height: number } {
  const key = `char-portrait-${look.id}-${ex}${res === 1 ? '' : `@${res}`}`;
  const width = Math.ceil(PORTRAIT_BOX.width * res);
  const height = Math.ceil(PORTRAIT_BOX.height * res);
  if (!store.has(key)) {
    const ctx = store.create(key, width, height);
    ctx.save();
    ctx.scale(res, res);
    drawPortrait(ctx, look, ex);
    ctx.restore();
    store.addFrame(key, 'full', 0, 0, width, height);
    store.commit(key);
    bakeStats.count++;
  }
  return { key, width, height };
}

/** 입자 텍스처 (종류마다 한 장, 모두 같이 씀). */
export function ensureFxTexture(store: TextureStore, fx: FxId, res = RES_FX): { key: string; size: number } {
  const key = fxKey(fx);
  const size = Math.ceil(PARTICLE_BOX * res);
  if (!store.has(key)) {
    const ctx = store.create(key, size, size);
    ctx.save();
    ctx.scale(res, res);
    ctx.translate(PARTICLE_BOX / 2, PARTICLE_BOX / 2);
    drawParticle(ctx, fx);
    ctx.restore();
    store.addFrame(key, 'full', 0, 0, size, size);
    store.commit(key);
    bakeStats.count++;
  }
  return { key, size };
}

/** 오라 텍스처 (종류·색마다 한 장). 반지름 AURA_TEX_R 단위로 그려 두고 쓸 때 늘인다. */
export function ensureAuraTexture(store: TextureStore, aura: AuraId, color: string, res = RES_FX): { key: string; size: number } {
  const key = auraKey(aura, color);
  const size = Math.ceil(AURA_TEX_R * 2 * res);
  if (!store.has(key)) {
    const ctx = store.create(key, size, size);
    ctx.save();
    ctx.scale(res, res);
    ctx.translate(AURA_TEX_R, AURA_TEX_R);
    drawAura(ctx, aura, color, AURA_TEX_R);
    ctx.restore();
    store.addFrame(key, 'full', 0, 0, size, size);
    store.commit(key);
    bakeStats.count++;
  }
  return { key, size };
}
