/**
 * DOM 캔버스용 캐릭터 그리기 (갤러리·대화 UI): 텍스처 저장소를 오프스크린 캔버스로 구현하고,
 * compose() 결과를 2D 컨텍스트에 그대로 그린다 (게임의 CharacterFigure와 같은 배치·움직임).
 */
import { ensureAuraTexture, ensureFxTexture, type HumanTexture, type TextureStore } from './cache';
import { auraColorOf } from './draw';
import type { Composition } from './compose';
import { PARTICLE_BOX } from './fxArt';
import type { Ctx } from './cv';
import { P, glow, paint, rainbow, shade, type PathFn } from './cv';
import type { HumanLook } from './looks';
import { drawPortrait, type Expression } from './portraits';
import { PORTRAIT_BOX } from './rig';

interface Entry {
  canvas: HTMLCanvasElement;
  frames: Map<string, { x: number; y: number; w: number; h: number }>;
  data?: unknown;
}

export class DomTextureStore implements TextureStore {
  private readonly entries = new Map<string, Entry>();

  has(key: string): boolean {
    return this.entries.has(key);
  }

  create(key: string, w: number, h: number): Ctx {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, w);
    canvas.height = Math.max(1, h);
    this.entries.set(key, { canvas, frames: new Map() });
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D 캔버스를 만들 수 없다');
    return ctx;
  }

  addFrame(key: string, frame: string, x: number, y: number, w: number, h: number): void {
    this.entries.get(key)?.frames.set(frame, { x, y, w, h });
  }

  commit(): void {}

  getData(key: string): unknown {
    return this.entries.get(key)?.data;
  }

  setData(key: string, data: unknown): void {
    const e = this.entries.get(key);
    if (e) e.data = data;
  }

  remove(key: string): void {
    this.entries.delete(key);
  }

  private scratchCanvas: HTMLCanvasElement | null = null;

  scratch(w: number, h: number): Ctx {
    const c = (this.scratchCanvas ??= document.createElement('canvas'));
    c.width = Math.max(1, w);
    c.height = Math.max(1, h);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('임시 2D 캔버스를 만들 수 없다');
    return ctx;
  }

  get(key: string): Entry | undefined {
    return this.entries.get(key);
  }

  get size(): number {
    return this.entries.size;
  }
}

/** compose() 결과를 그린다. ctx는 '그림 단위' 좌표(발밑 원점)로 미리 옮기고 늘여 둔다. 파츠는 구운 해상도(tex.res)의 역수로 늘인다. */
export function drawComposition(c: CanvasRenderingContext2D, store: DomTextureStore, tex: HumanTexture, comp: Composition): void {
  const res = tex.res;
  const entry = store.get(tex.key);
  if (!entry) return;
  c.save();
  c.translate(comp.rig.x, comp.rig.y);
  c.rotate(comp.rig.rot);
  for (const op of comp.ops) {
    if (op.alpha <= 0.001) continue;
    c.save();
    c.globalAlpha *= Math.min(1, op.alpha);
    c.translate(op.x, op.y);
    c.rotate(op.rot);
    c.scale(op.sx, op.sy);
    if (op.kind === 'part' && op.part) {
      const f = tex.layout.frames.find((fr) => fr.name === op.part);
      if (f) c.drawImage(entry.canvas, f.x, f.y, f.w, f.h, (-f.originX * f.w) / res, (-f.originY * f.h) / res, f.w / res, f.h / res);
    } else if (op.kind === 'aura') {
      const a = ensureAuraTexture(store, comp.aura, auraColorOf(tex.render.look, comp.aura));
      const img = store.get(a.key);
      if (img) c.drawImage(img.canvas, -comp.auraR, -comp.auraR, comp.auraR * 2, comp.auraR * 2);
    } else if (op.kind === 'fx') {
      const fx = ensureFxTexture(store, comp.fx);
      const img = store.get(fx.key);
      if (img) c.drawImage(img.canvas, -PARTICLE_BOX / 2, -PARTICLE_BOX / 2, PARTICLE_BOX, PARTICLE_BOX);
    }
    c.restore();
  }
  c.restore();
}

/** 등급 받침대 (art/chibi.ts drawPedestal과 같은 모양, 2D 캔버스판). 신 = 무지개, 히든 = 검정 + 금 테. */
export function drawPedestal2D(c: Ctx, color: string, grade?: string): void {
  const el = (x: number, y: number, rx: number, ry: number): PathFn => P.ellipse(x, y, rx, ry);
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.25)';
  el(0, 14, 95, 27)(c);
  c.fill();
  c.restore();
  if (grade === 'god') {
    glow(c, 0, 0, 110, '#FFFFFF', 0.5);
    paint(c, el(0, 8, 85, 25), '#B9A3FF', { lw: 0 });
    paint(c, el(0, 0, 85, 23), rainbow(c, -85, 0, 85, 0), { lw: 4 });
    return;
  }
  if (grade === 'hidden') {
    paint(c, el(0, 8, 85, 25), '#0E0E16', { lw: 0 });
    paint(c, el(0, 0, 85, 23), '#1E1E2A', { lw: 5, stroke: '#F1C40F' });
    return;
  }
  paint(c, el(0, 8, 85, 25), shade(color, -0.35), { lw: 0 });
  paint(c, el(0, 0, 85, 23), color, { lw: 4 });
}

/**
 * 대화 UI용 인물 초상 캔버스 (M11b가 쓸 자리): 화면 너비(css px)·기기 배율에 맞춰 한 장 그린다.
 * 예: `box.append(portraitCanvas(personLook('lena')!, 'happy', 120))`
 */
export function portraitCanvas(look: HumanLook, ex: Expression, cssWidth: number, dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const scale = (cssWidth * dpr) / PORTRAIT_BOX.width;
  canvas.width = Math.round(PORTRAIT_BOX.width * scale);
  canvas.height = Math.round(PORTRAIT_BOX.height * scale);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${(cssWidth * PORTRAIT_BOX.height) / PORTRAIT_BOX.width}px`;
  const c = canvas.getContext('2d');
  if (c) {
    c.scale(scale, scale);
    drawPortrait(c, look, ex);
  }
  return canvas;
}
