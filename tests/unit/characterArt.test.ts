/**
 * 절차 생성 캐릭터 그림 — 라이브러리가 빠짐없이 그려지는지, 파츠가 자기 상자 안에 있는지, 텍스처 캐시가 같은 키를 다시 쓰는지,
 * 대기 동작 프리셋이 파츠를 실제로 움직이는지 (Phaser 없이, 기록용 가짜 캔버스로).
 */
import { describe, expect, it } from 'vitest';
import { BACK_DRAW } from '../../src/art/characters/back';
import {
  bakeStats,
  ensureAuraTexture,
  ensureComposedTexture,
  ensureEnemyTexture,
  ensureFxTexture,
  ensureHumanTexture,
  ensurePortraitTexture,
  humanKey,
  type TextureStore,
} from '../../src/art/characters/cache';
import { compose } from '../../src/art/characters/compose';
import { drawHumanPart, fxOf, prepareHuman } from '../../src/art/characters/draw';
import { CREATURE_ANCHORS, CREATURE_DRAW, drawEnemy } from '../../src/art/characters/enemies';
import { drawAura, drawParticle } from '../../src/art/characters/fxArt';
import { HEADGEAR_DEFS } from '../../src/art/characters/head';
import { IDLE_PRESETS, REST, defaultBackMotion, idleParts, type IdleParts } from '../../src/art/characters/idle';
import { AURAS, BACKS, CREATURES, FRONTS, FX, GROUNDS, HEADGEAR, IDLES, OFFHANDS, OUTFITS, PETS, PROPS } from '../../src/art/characters/library';
import { allLooks, isEnemyLook, towerLook, type EnemyLook, type HumanLook } from '../../src/art/characters/looks';
import { PET_DRAW } from '../../src/art/characters/pets';
import { parseExternalEntry, externalArtUrl } from '../../src/art/characters/external';
import { EXPRESSIONS, drawPortrait } from '../../src/art/characters/portraits';
import { PROP_META } from '../../src/art/characters/propMeta';
import { PROP_DRAW } from '../../src/art/characters/props';
import { BOXES, ENEMY_BOX, PORTRAIT_BOX, atlasLayout, composedBox, packLayout, rigFor, trimLayout, type PartName } from '../../src/art/characters/rig';
import { drawHumanComposed } from '../../src/art/characters/draw';
import { towerPose } from '../../src/view/render/towerPose';
import { MockCtx, maskIoU, mockCtx, silhouetteMask } from '../helpers/mockCanvas';

const looks = allLooks();
const humans = looks.filter((l): l is HumanLook => !isEnemyLook(l));
const towers = humans.filter((l) => l.kind === 'tower');
const enemies = looks.filter((l): l is EnemyLook => isEnemyLook(l));

/** 가짜 텍스처 저장소: 만든 키와 그린 횟수를 센다 */
class FakeStore implements TextureStore {
  readonly made = new Map<string, { w: number; h: number; frames: string[]; data?: unknown }>();
  creates = 0;
  /** 다음 create가 돌려줄 컨텍스트 (그리기 실패 흉내) */
  nextCtx: CanvasRenderingContext2D | null = null;
  has(key: string): boolean {
    return this.made.has(key);
  }
  create(key: string, w: number, h: number): CanvasRenderingContext2D {
    this.creates++;
    this.made.set(key, { w, h, frames: [] });
    const c = this.nextCtx ?? mockCtx();
    this.nextCtx = null;
    return c;
  }
  addFrame(key: string, frame: string): void {
    this.made.get(key)?.frames.push(frame);
  }
  commit(): void {}
  getData(key: string): unknown {
    return this.made.get(key)?.data;
  }
  setData(key: string, data: unknown): void {
    const m = this.made.get(key);
    if (m) m.data = data;
  }
  remove(key: string): void {
    this.made.delete(key);
  }
}

/** 임시 캔버스가 있는 가짜 저장소: 임시 캔버스에서 칠해진 사각형을 알려 주는 가짜 알파를 돌려준다 (잘라 내기 + 다시 늘어놓기 흐름) */
class ScratchStore extends FakeStore {
  copies: { sx: number; sy: number; w: number; h: number; dx: number; dy: number }[] = [];
  scratch(w: number, h: number): CanvasRenderingContext2D {
    const c = mockCtx();
    // 모든 픽셀이 칠해졌다고 답한다 → 잘라 내도 크기 그대로, 다시 늘어놓기만 확인
    const getImageData = (_x: number, _y: number, ww: number, hh: number) => ({ data: new Uint8ClampedArray(ww * hh * 4).fill(255) });
    Object.assign(c, { canvas: { width: w, height: h }, getImageData });
    return c;
  }
  override create(key: string, w: number, h: number): CanvasRenderingContext2D {
    const c = super.create(key, w, h);
    Object.assign(c, {
      drawImage: (_img: unknown, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number) => this.copies.push({ sx, sy, w: sw, h: sh, dx, dy }),
    });
    return c;
  }
}

describe('라이브러리: 목록의 모든 이름에 그리기 함수가 있다', () => {
  it('머리 장식 46 · 소품 76 · 등 35 · 동반자 11 · 적 32 · 대기 동작 · 입자 · 오라', () => {
    for (const id of HEADGEAR) expect(HEADGEAR_DEFS[id], id).toBeDefined();
    for (const id of PROPS) {
      expect(PROP_DRAW[id], id).toBeTypeOf('function');
      expect(PROP_META[id], id).toBeDefined();
    }
    for (const id of BACKS) expect(BACK_DRAW[id], id).toBeTypeOf('function');
    for (const id of PETS) expect(PET_DRAW[id], id).toBeTypeOf('function');
    for (const id of CREATURES) {
      expect(CREATURE_DRAW[id], id).toBeTypeOf('function');
      expect(CREATURE_ANCHORS[id], id).toBeDefined();
    }
    for (const id of IDLES) expect(IDLE_PRESETS[id], id).toBeDefined();
    expect(PROPS.length - 1).toBeGreaterThanOrEqual(40);
    expect(HEADGEAR.length - 1).toBeGreaterThanOrEqual(20);
    expect(CREATURES).toHaveLength(32);
  });

  it('입자 21종·오라 12종이 오류 없이 그려진다', () => {
    for (const fx of FX) {
      const c = mockCtx();
      drawParticle(c, fx);
      expect(c.bad, fx).toEqual([]);
      if (fx !== 'none') expect(c.draws, fx).toBeGreaterThan(0);
    }
    for (const a of AURAS) {
      const c = mockCtx();
      drawAura(c, a, '#FFD24A', 64);
      expect(c.bad, a).toEqual([]);
    }
  });
});

/** 파츠를 원점(회전 중심)에서 그렸을 때 상자 안에 들어가는가 (선 굵기 여유 8단위) */
function partBounds(look: HumanLook, awakened: boolean, part: PartName): { minX: number; minY: number; maxX: number; maxY: number; draws: number; bad: string[] } {
  const r = prepareHuman(look, awakened);
  const c = mockCtx();
  drawHumanPart(c, r, part);
  return { ...c.bounds, draws: c.draws, bad: c.bad };
}

describe('사람형 캐릭터 74명 × (기본·각성): 파츠가 자기 상자 안에 그려진다 (아틀라스 이웃 칸으로 번지지 않음)', () => {
  const PAD = 8;
  for (const look of humans) {
    for (const awakened of look.awaken ? [false, true] : [false]) {
      it(`${look.name}${awakened ? ' (각성)' : ''}`, () => {
        const r = prepareHuman(look, awakened);
        for (const part of r.rig.parts) {
          const b = partBounds(look, awakened, part);
          const box = BOXES[part];
          expect(b.bad, `${part} 좌표`).toEqual([]);
          expect(b.draws, part).toBeGreaterThan(0);
          expect(b.minX, `${part} 왼쪽`).toBeGreaterThanOrEqual(box.left - PAD);
          expect(b.maxX, `${part} 오른쪽`).toBeLessThanOrEqual(box.left + box.width + PAD);
          expect(b.minY, `${part} 위`).toBeGreaterThanOrEqual(box.top - PAD);
          expect(b.maxY, `${part} 아래`).toBeLessThanOrEqual(box.top + box.height + PAD);
        }
      });
    }
  }
});

describe('적 32종 · 인물 초상 9명 × 표정 3: 상자 안에 오류 없이 그려진다', () => {
  for (const e of enemies) {
    it(`${e.name} (${e.rank})`, () => {
      const c = mockCtx();
      drawEnemy(c, e, '#7FD3E8');
      expect(c.bad).toEqual([]);
      expect(c.draws).toBeGreaterThan(10);
      expect(c.bounds.minX).toBeGreaterThanOrEqual(-6);
      expect(c.bounds.maxX).toBeLessThanOrEqual(ENEMY_BOX + 6);
      expect(c.bounds.minY).toBeGreaterThanOrEqual(-6);
      expect(c.bounds.maxY).toBeLessThanOrEqual(ENEMY_BOX + 6);
    });
  }
  it('인물 초상 (보통·화남·웃음)', () => {
    for (const p of humans.filter((h) => h.kind !== 'tower')) {
      for (const ex of EXPRESSIONS) {
        const c = mockCtx();
        drawPortrait(c, p, ex);
        expect(c.bad, `${p.id} ${ex}`).toEqual([]);
        expect(c.draws).toBeGreaterThan(10);
        expect(c.bounds.minX, p.id).toBeGreaterThanOrEqual(-30);
        expect(c.bounds.maxX, p.id).toBeLessThanOrEqual(PORTRAIT_BOX.width + 30);
      }
    }
  });
});

describe('텍스처 캐시: 종류·각성·등급별 한 번만 그린다', () => {
  it('같은 타워를 두 번 요청하면 같은 키를 돌려주고 다시 그리지 않는다', () => {
    const store = new FakeStore();
    const miner = towerLook('miner') as HumanLook;
    const before = bakeStats.count;
    const a = ensureHumanTexture(store, miner, 'tower', false);
    const b = ensureHumanTexture(store, miner, 'tower', false);
    expect(b.key).toBe(a.key);
    expect(store.creates).toBe(1);
    expect(bakeStats.count - before).toBe(1);
    // 파츠 프레임 (광부: 몸 + 곡괭이)
    expect(store.made.get(a.key)?.frames).toEqual(['body', 'prop']);
    // 각성은 다른 키 → 한 번 더
    const c = ensureHumanTexture(store, miner, 'tower', true);
    expect(c.key).not.toBe(a.key);
    expect(c.key).toBe(humanKey('tower', 'miner', true));
    ensureHumanTexture(store, miner, 'tower', true);
    expect(store.creates).toBe(2);
  });

  it('각성 외형이 없는 히든 타워는 각성을 켜도 같은 키 (다시 그리지 않음)', () => {
    const store = new FakeStore();
    const king = towerLook('goldking') as HumanLook;
    const a = ensureHumanTexture(store, king, 'tower', false);
    const b = ensureHumanTexture(store, king, 'tower', true);
    expect(b.key).toBe(a.key);
    expect(store.creates).toBe(1);
  });

  it('96개 타워(타워 65종을 돌려 가며)를 만들어도 텍스처는 종류 수만큼, 입자·오라는 종류마다 하나', () => {
    const store = new FakeStore();
    for (let i = 0; i < 96; i++) {
      const t = towers[i % towers.length] as HumanLook;
      ensureHumanTexture(store, t, 'tower', false);
      const fx = fxOf(t);
      if (fx !== 'none') ensureFxTexture(store, fx);
      ensureAuraTexture(store, 'glow', '#9B59D0');
    }
    const charKeys = [...store.made.keys()].filter((k) => k.startsWith('char-tower-'));
    expect(charKeys).toHaveLength(65);
    expect([...store.made.keys()].filter((k) => k.startsWith('charaura-'))).toHaveLength(1);
    const fxKinds = new Set(towers.map((t) => fxOf(t)).filter((f) => f !== 'none'));
    expect([...store.made.keys()].filter((k) => k.startsWith('charfx-'))).toHaveLength(fxKinds.size);
  });

  it('적 180마리(13종 돌려 가며)도 (종류·군단 색)마다 한 장, 초상·합친 그림도 한 번', () => {
    const store = new FakeStore();
    const mobs = enemies.filter((e) => e.rank === 'minion');
    for (let i = 0; i < 180; i++) ensureEnemyTexture(store, mobs[i % mobs.length] as EnemyLook, '#7CB342');
    expect(store.creates).toBe(13);
    const lena = humans.find((h) => h.id === 'lena') as HumanLook;
    ensurePortraitTexture(store, lena, 'normal');
    ensurePortraitTexture(store, lena, 'normal');
    ensurePortraitTexture(store, lena, 'angry');
    const miner = towerLook('miner') as HumanLook;
    ensureComposedTexture(store, miner, 'tower', false);
    ensureComposedTexture(store, miner, 'tower', false);
    expect(store.creates).toBe(13 + 2 + 1);
  });

  it('파츠 프레임 잘라 내기: 칠해진 픽셀만 남기고 회전 중심은 같은 점을 가리킨다', () => {
    const layout = atlasLayout(['body', 'prop'], 0.1);
    const W = layout.width;
    const H = layout.height;
    const alpha = new Uint8ClampedArray(W * H * 4);
    // body 프레임 안 (10~14, 5~9) 사각형만 칠함
    const body = layout.frames[0]!;
    for (let y = 5; y <= 9; y++) for (let x = 10; x <= 14; x++) alpha[((body.y + y) * W + body.x + x) * 4 + 3] = 255;
    const reader = {
      getImageData: (x: number, y: number, w: number, h: number) => {
        const out = new Uint8ClampedArray(w * h * 4);
        for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) out[(yy * w + xx) * 4 + 3] = alpha[((y + yy) * W + x + xx) * 4 + 3]!;
        return { data: out };
      },
    };
    const t = trimLayout(reader, layout);
    const b = t.frames[0]!;
    expect([b.x - body.x, b.y - body.y, b.w, b.h]).toEqual([9, 4, 7, 7]);
    // 회전 중심의 캔버스 좌표가 그대로
    expect(b.x + b.originX * b.w).toBeCloseTo(body.x + body.originX * body.w, 6);
    expect(b.y + b.originY * b.h).toBeCloseTo(body.y + body.originY * body.h, 6);
    // 빈 프레임은 1×1
    expect([t.frames[1]!.w, t.frames[1]!.h]).toEqual([1, 1]);
    // 알파를 못 읽으면 그대로
    expect(trimLayout(mockCtx(), layout)).toBe(layout);
  });

  it('다시 늘어놓기(pack): 잘라 낸 프레임만 작은 캔버스에 — 크기·원점 비율 그대로, 겹침 없음', () => {
    const full = atlasLayout(['back', 'body', 'prop'], 0.5);
    const trimmed = { ...full, frames: full.frames.map((f, i) => ({ ...f, x: f.x + 10 + i, y: f.y + 20, w: 40 + i * 7, h: 60 - i * 5 })) };
    const { layout, src } = packLayout(trimmed);
    expect(layout.width).toBeLessThan(full.width);
    expect(layout.height).toBeLessThanOrEqual(full.height);
    layout.frames.forEach((f, i) => {
      const t = trimmed.frames[i]!;
      expect([f.w, f.h, f.originX, f.originY, f.name]).toEqual([t.w, t.h, t.originX, t.originY, t.name]);
      expect(src[i]).toEqual({ x: t.x, y: t.y });
      expect(f.x + f.w).toBeLessThanOrEqual(layout.width);
      expect(f.y + f.h).toBeLessThanOrEqual(layout.height);
      if (i > 0) expect(f.x).toBeGreaterThanOrEqual(layout.frames[i - 1]!.x + layout.frames[i - 1]!.w + 1);
    });
  });

  it('임시 캔버스가 있으면 그린 뒤 프레임만 작은 텍스처로 옮긴다 (원래 자리 → 새 자리 복사)', () => {
    const store = new ScratchStore();
    const t = ensureHumanTexture(store, towerLook('dragoncaller') as HumanLook, 'tower', false);
    const made = store.made.get(t.key)!;
    expect(made.frames).toEqual(['back', 'body', 'prop', 'pet']);
    expect([made.w, made.h]).toEqual([t.layout.width, t.layout.height]);
    expect(store.copies).toHaveLength(4);
    store.copies.forEach((cp, i) => expect([cp.dx, cp.dy, cp.w, cp.h]).toEqual([t.layout.frames[i]!.x, t.layout.frames[i]!.y, t.layout.frames[i]!.w, t.layout.frames[i]!.h]));
    expect(t.res).toBe(0.5);
    // 배치는 텍스처에 붙어 있다 → 두 번째 요청은 그 배치를 그대로
    expect(ensureHumanTexture(store, towerLook('dragoncaller') as HumanLook, 'tower', false).layout).toBe(t.layout);
    expect(store.creates).toBe(1);
  });

  it('그리기가 실패하면 반쯤 만든 텍스처를 지운다 → 다음 요청이 다시 굽는다 (잘라 내기 전 배치로 그리지 않음)', () => {
    const store = new FakeStore();
    const miner = towerLook('miner') as HumanLook;
    const broken = mockCtx();
    broken.fill = () => {
      throw new Error('그리기 실패');
    };
    store.nextCtx = broken;
    expect(() => ensureHumanTexture(store, miner, 'tower', false)).toThrow('그리기 실패');
    expect(store.has(humanKey('tower', 'miner', false))).toBe(false);
    const t = ensureHumanTexture(store, miner, 'tower', false);
    expect(store.made.get(t.key)?.frames).toEqual(['body', 'prop']);
    expect(store.creates).toBe(2);
    // 같은 키가 배치 정보 없이 있으면(다른 곳에서 만든 텍스처) 지우고 다시 굽는다
    store.made.set(humanKey('tower', 'archer', false), { w: 1, h: 1, frames: [] });
    const a = ensureHumanTexture(store, towerLook('archer') as HumanLook, 'tower', false);
    expect(store.made.get(a.key)?.frames).toEqual(['back', 'body', 'prop']);
  });

  it('합친 그림(정보 패널 초상화): 모든 파츠 상자 + 떠 있는 높이가 캔버스 안 — 키 큰 캐릭터도 위·옆이 잘리지 않는다', () => {
    for (const look of towers) {
      for (const awakened of look.awaken ? [false, true] : [false]) {
        const r = prepareHuman(look, awakened);
        const box = composedBox(r.rig, 12);
        const c = mockCtx();
        drawHumanComposed(c, r, { aura: false });
        const id = `${look.id}${awakened ? ' 각성' : ''}`;
        expect(c.bounds.minY, `${id} 위`).toBeGreaterThan(box.top);
        expect(c.bounds.minX, `${id} 왼쪽`).toBeGreaterThan(box.left);
        expect(c.bounds.maxX, `${id} 오른쪽`).toBeLessThan(box.left + box.width);
        expect(c.bounds.maxY, `${id} 아래`).toBeLessThan(box.top + box.height);
      }
    }
    // 예전 몸 상자만으로는 잘리던 캐릭터: 몸 상자 위(−268)보다 높이 그려진다
    for (const id of ['archmage', 'timelord', 'stormlord', 'infiniteblade']) {
      const c = mockCtx();
      drawHumanComposed(c, prepareHuman(towerLook(id) as HumanLook, false), { aura: false });
      expect(c.bounds.minY, id).toBeLessThan(BOXES.body.top);
    }
    const store = new FakeStore();
    const p = ensureComposedTexture(store, towerLook('archmage') as HumanLook, 'tower', false);
    expect(p.key).toBe(`${humanKey('tower', 'archmage', false, 1)}-full`);
    expect(store.getData(p.key)).toEqual(p);
  });

  it('아틀라스 배치: 프레임이 겹치지 않고 캔버스 안에 있다', () => {
    for (const t of towers) {
      const rig = rigFor(t);
      const layout = atlasLayout(rig.parts, 0.5);
      for (const f of layout.frames) {
        expect(f.x + f.w).toBeLessThanOrEqual(layout.width);
        expect(f.y + f.h).toBeLessThanOrEqual(layout.height);
      }
      for (let i = 1; i < layout.frames.length; i++) {
        const prev = layout.frames[i - 1]!;
        expect(layout.frames[i]!.x).toBeGreaterThanOrEqual(prev.x + prev.w + 1);
      }
    }
  });
});

describe('대기 동작 프리셋 (TOWERS.md 11장) — 파츠가 실제로 움직인다', () => {
  const sample = (look: HumanLook, seed: number, from = 0, to = 9000, step = 37): IdleParts[] => {
    const r = prepareHuman(look, false);
    const preset = IDLE_PRESETS[r.look.idle ?? 'hop'];
    const out: IdleParts[] = [];
    for (let t = from; t < to; t += step) {
      const pose = towerPose({ timeMs: t, seed, attackAtMs: null, attackMs: 250, appearAtMs: null, gesture: preset.gesture, gestureMs: preset.gestureMs });
      out.push(idleParts({ preset, gesture: pose.gesture, attack: 0, timeMs: t, seed, body: r.look.body, prop: r.look.prop, back: r.look.back, pet: r.look.pet, fx: fxOf(r.look), grade: r.look.grade }));
    }
    return out;
  };
  const spread = (xs: number[]): number => Math.max(...xs) - Math.min(...xs);

  it('소품 동작이 있는 프리셋은 몇 주기 안에 소품이 움직인다 (캐기·두드리기·돌리기·던지기·흔들기 …)', () => {
    for (const t of towers) {
      const preset = IDLE_PRESETS[t.idle!];
      if (!rigFor(t).parts.includes('prop') || (!preset.prop && !preset.propLoop)) continue;
      const s = sample(t, 0.31);
      const moved = spread(s.map((p) => p.prop.rot)) + spread(s.map((p) => p.prop.y)) + spread(s.map((p) => p.prop.x)) + spread(s.map((p) => p.prop.sx));
      expect(moved, t.id).toBeGreaterThan(0.05);
    }
  });

  it('날개는 늘 날갯짓, 망토는 펄럭임, 요정은 늘 떠 있다', () => {
    for (const t of towers) {
      const s = sample(t, 0.6, 0, 3000, 23);
      if (t.back && defaultBackMotion(t.back) === 'flap' && !IDLE_PRESETS[t.idle!].back) expect(spread(s.map((p) => p.back.sx)), t.id).toBeGreaterThan(0.1);
      if (t.back && defaultBackMotion(t.back) === 'flutter' && !IDLE_PRESETS[t.idle!].back) expect(spread(s.map((p) => p.back.rot)), t.id).toBeGreaterThan(0.02);
      if (t.body === 'fairy') expect(spread(s.map((p) => p.body.y)), t.id).toBeGreaterThan(5);
    }
  });

  it('동반자도 따로 움직인다 (군견 꼬리·드론 맴돌기·아기 용 깡총·정령 궤도)', () => {
    for (const t of towers.filter((x) => x.pet && x.pet !== 'none')) {
      const s = sample(t, 0.2, 0, 4000, 29);
      const moved = spread(s.map((p) => p.pet.y)) + spread(s.map((p) => p.pet.x)) + spread(s.map((p) => p.pet.rot));
      expect(moved, t.id).toBeGreaterThan(0.04);
    }
  });

  it('시작 위상이 다르면 같은 시각에 다른 자세, 멈춤(play=false)이면 쉬는 자세', () => {
    const k9 = towerLook('k9') as HumanLook;
    const a = sample(k9, 0.1, 1000, 1001, 1)[0]!;
    const b = sample(k9, 0.7, 1000, 1001, 1)[0]!;
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    const preset = IDLE_PRESETS.dig;
    const still = idleParts({ preset, gesture: 0.5, attack: 0, timeMs: 1234, seed: 0.4, body: 'stout', prop: 'pickaxe', play: false });
    expect(still.prop).toEqual(REST);
    expect(still.fx).toEqual([]);
  });

  it('공격하면 소품을 앞으로 휘두른다', () => {
    const p0 = idleParts({ preset: IDLE_PRESETS.swing, gesture: -1, attack: 0, timeMs: 0, seed: 0, body: 'normal', prop: 'short_sword' });
    const p1 = idleParts({ preset: IDLE_PRESETS.swing, gesture: -1, attack: 1, timeMs: 0, seed: 0, body: 'normal', prop: 'short_sword' });
    expect(p1.prop.rot - p0.prop.rot).toBeGreaterThan(0.4);
  });

  it('돌리는 소품(표창·수레바퀴)은 소품 중심을 축으로 돈다 (중심이 제자리)', () => {
    const preset = IDLE_PRESETS.spin_prop;
    const c = PROP_META.shuriken.spin!;
    for (const g of [0.2, 0.5, 0.8]) {
      const p = idleParts({ preset, gesture: g, attack: 0, timeMs: 0, seed: 0, body: 'slim', prop: 'shuriken' });
      // 소품 중심의 화면 자리 = 이동 + R·c 가 c와 같아야 한다
      const cx = p.prop.x + Math.cos(p.prop.rot) * c[0] - Math.sin(p.prop.rot) * c[1];
      const cy = p.prop.y + Math.sin(p.prop.rot) * c[0] + Math.cos(p.prop.rot) * c[1];
      expect(cx).toBeCloseTo(c[0], 6);
      expect(cy).toBeCloseTo(c[1], 6);
    }
  });

  it('towerPose: 프리셋 몸 동작은 고유 동작 창(0~1) 안에서만, 기본값은 예전과 같은 갸웃', () => {
    let inWindow = 0;
    for (let t = 0; t < 9000; t += 20) {
      const p = towerPose({ timeMs: t, seed: 0.5, attackAtMs: null, attackMs: 250, appearAtMs: null, gesture: 'hop2', gestureMs: 800 });
      if (p.gesture >= 0) {
        inWindow++;
        expect(p.gesture).toBeLessThan(1);
      } else expect(p.dx).toBe(0);
    }
    expect(inWindow).toBeGreaterThan(50);
    const a = towerPose({ timeMs: 777, seed: 0.3, attackAtMs: null, attackMs: 250, appearAtMs: null });
    const b = towerPose({ timeMs: 777, seed: 0.3, attackAtMs: null, attackMs: 250, appearAtMs: null, gesture: 'hopTilt' });
    expect(b).toEqual(a);
  });
});

describe('한 프레임 조립 (compose)', () => {
  it('그리는 순서: 오라 → 등 → 몸 → 동반자 → 소품 → 입자, 몸은 떠 있는 높이만큼 위', () => {
    const look = towerLook('dragoncaller') as HumanLook;
    const r = prepareHuman(look, false);
    const idle = idleParts({ preset: IDLE_PRESETS.play_pet, gesture: 0.5, attack: 0, timeMs: 500, seed: 0.5, body: r.look.body, prop: r.look.prop, back: r.look.back, pet: r.look.pet, fx: fxOf(r.look), grade: r.look.grade });
    const comp = compose(r, idle, 500, 0.5);
    const order = comp.ops.map((o) => (o.kind === 'part' ? o.part : o.kind));
    expect(order.slice(0, 5)).toEqual(['aura', 'back', 'body', 'pet', 'prop']);
    expect(order.slice(5).every((o) => o === 'fx')).toBe(true);
    const arch = prepareHuman(towerLook('archmage') as HumanLook, false);
    const c2 = compose(arch, { body: REST, prop: REST, back: REST, pet: REST, fx: [] }, 0, 0);
    const body = c2.ops.find((o) => o.part === 'body')!;
    expect(body.y).toBe(-arch.rig.lift);
    expect(arch.rig.lift).toBeGreaterThan(0);
  });
});

describe('바깥 그림 연결 지점 (힉스필드 그림이 생기면 그림 우선)', () => {
  it('매니페스트 항목 → 파일 이름', () => {
    expect(parseExternalEntry('miner')).toEqual({ group: 'tower', id: 'miner', awakened: false });
    expect(parseExternalEntry('miner_awaken')).toEqual({ group: 'tower', id: 'miner', awakened: true });
    expect(parseExternalEntry('enemy:slime')).toEqual({ group: 'enemy', id: 'slime', awakened: false });
    expect(parseExternalEntry('Bad Name')).toBeNull();
    expect(externalArtUrl('tower', 'miner', false)).toBe('assets/characters/miner.webp');
    expect(externalArtUrl('tower', 'miner', true)).toBe('assets/characters/miner_awaken.webp');
    expect(externalArtUrl('person', 'lena', false)).toBe('assets/characters/person_lena.webp');
  });
});

/** 파츠 하나를 기록용 가짜 캔버스에 그려 지문을 낸다 */
function partPrint(look: HumanLook, awakened: boolean, part: PartName): string {
  const r = prepareHuman(look, awakened);
  if (!r.rig.parts.includes(part)) return '-';
  const c = new MockCtx();
  drawHumanPart(c as unknown as CanvasRenderingContext2D, r, part);
  return c.fingerprint();
}

describe('그림이 데이터 값을 실제로 반영한다 (검토 반영: 조합 겹침 검사는 JSON만 봐서 그리기 함수가 필드를 무시해도 통과했다)', () => {
  it('타워 65명 × (기본·각성) 합친 그림 지문이 모두 다르다', () => {
    const seen = new Map<string, string>();
    for (const t of towers) {
      for (const awakened of t.awaken ? [false, true] : [false]) {
        const id = `${t.id}${awakened ? '*' : ''}`;
        const c = new MockCtx();
        drawHumanComposed(c as unknown as CanvasRenderingContext2D, prepareHuman(t, awakened), { aura: false });
        const fp = c.fingerprint();
        expect(seen.get(fp), `${id} = ${seen.get(fp)}`).toBeUndefined();
        seen.set(fp, id);
      }
    }
    expect(seen.size).toBe(65 + 53);
  });

  it('머리 장식·옷 모양·옷 색·머리카락 값 하나만 바꿔도 몸 파츠 지문이 바뀐다 (타워 65명 모두)', () => {
    for (const t of towers) {
      const base = partPrint(t, false, 'body');
      const variants: [string, Partial<HumanLook>][] = [
        ['head', { head: t.head === 'crown' ? 'cap' : 'crown' }],
        ['outfit', { outfit: t.outfit === 'robe' ? 'tunic' : 'robe' }],
        ['colors', { colors: ['#123456', '#654321'] }],
      ];
      // 머리카락: 머리를 다 덮는 장식(두건·투구)이면 긴 머리만 보인다
      const hidden = HEADGEAR_DEFS[t.head].cover === 'full' && t.hairStyle !== 'long' && t.hairStyle !== 'flowing';
      if (!hidden) variants.push(['hair', { hair: '#00FF66', hairStyle: t.hairStyle === 'none' ? 'short' : t.hairStyle }]);
      for (const [name, v] of variants) expect(partPrint({ ...t, ...v } as HumanLook, false, 'body'), `${t.id} ${name}`).not.toBe(base);
    }
  });

  it('라이브러리의 머리 장식·옷·몸 앞·발밑·왼손·등·소품·동반자는 종류마다 다른 그림을 그린다 (이름만 있고 그림이 같은 항목 없음)', () => {
    const miner = towerLook('miner') as HumanLook;
    const lists: [string, readonly string[], PartName, (v: string) => Partial<HumanLook>][] = [
      ['head', HEADGEAR, 'body', (v) => ({ head: v as HumanLook['head'], headColor: undefined })],
      ['outfit', OUTFITS, 'body', (v) => ({ outfit: v as HumanLook['outfit'] })],
      ['front', FRONTS, 'body', (v) => ({ front: v as HumanLook['front'] })],
      ['ground', GROUNDS, 'body', (v) => ({ ground: v as HumanLook['ground'] })],
      ['offhand', OFFHANDS, 'body', (v) => ({ offhand: v as HumanLook['offhand'] })],
      ['back', BACKS.filter((b) => b !== 'none'), 'back', (v) => ({ back: v as HumanLook['back'] })],
      ['prop', PROPS.filter((p) => PROP_META[p].pose === undefined && p !== 'none'), 'prop', (v) => ({ prop: v as HumanLook['prop'] })],
      ['pet', PETS.filter((p) => p !== 'none'), 'pet', (v) => ({ pet: v as HumanLook['pet'] })],
    ];
    for (const [name, list, part, make] of lists) {
      const seen = new Map<string, string>();
      for (const v of list) {
        const fp = partPrint({ ...miner, ...make(v) } as HumanLook, false, part);
        expect(seen.get(fp), `${name}: ${v} = ${seen.get(fp)}`).toBeUndefined();
        seen.set(fp, v);
      }
    }
  });

  it('적 32종의 몸 실루엣(칠한 면적)이 서로 충분히 다르다 — 검토에서 지적한 골렘 넷·킹 슬라임↔모르가스는 크게 다르다', () => {
    const masks = new Map<string, Uint8Array>();
    for (const e of enemies) {
      const c = new MockCtx();
      CREATURE_DRAW[e.creature]({ c: c as unknown as CanvasRenderingContext2D, body: e.colors[0] ?? '#888888', accent: e.colors[1] ?? '#CCCCCC', legion: '#888888', eye: '#B36BFF' });
      masks.set(e.id, silhouetteMask(c.log, ENEMY_BOX));
    }
    const iou = (a: string, b: string): number => maskIoU(masks.get(a)!, masks.get(b)!);
    for (let i = 0; i < enemies.length; i++)
      for (let j = i + 1; j < enemies.length; j++) {
        const a = enemies[i]!.id;
        const b = enemies[j]!.id;
        expect(iou(a, b), `${a}↔${b}`).toBeLessThan(0.89);
      }
    for (const [a, b] of [
      ['golem', 'ancientgolem'],
      ['golem', 'gemgolem'],
      ['gemgolem', 'ancientgolem'],
      ['gemgolem', 'lavagiant'],
      ['ancientgolem', 'lavagiant'],
      ['golem', 'lavagiant'],
      ['kingslime', 'morgath'],
    ] as const)
      expect(iou(a, b), `${a}↔${b}`).toBeLessThan(0.8);
  });
});
