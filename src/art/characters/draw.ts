/**
 * 캐릭터 그리기 조립 (Canvas 2D, Phaser 없음): 외형 데이터 → 파츠 그림 → 한 장의 캔버스(아틀라스)에 나란히.
 * 게임(Phaser 캔버스 텍스처)과 갤러리(DOM 캔버스)가 같은 함수를 쓴다.
 */
import { drawBackPart } from './back';
import { drawBodyPart, handColor, trimColor } from './body';
import { glow, type Ctx } from './cv';
import { drawAura, auraColor } from './fxArt';
import type { AuraId, FxId } from './library';
import { resolveLook, type HumanLook } from './looks';
import { drawPetPart } from './pets';
import { drawPropPart } from './props';
import { atlasLayout, rigFor, type AtlasLayout, type PartName, type Rig } from './rig';

export interface HumanRender {
  /** 각성을 덮어쓴 외형 */
  look: HumanLook;
  rig: Rig;
  trim: string;
  awakened: boolean;
}

/** 외형(+각성) → 그리기 준비 */
export function prepareHuman(base: HumanLook, awakened: boolean): HumanRender {
  const look = resolveLook(base, awakened && base.awaken !== undefined);
  return { look, rig: rigFor(look), trim: trimColor(look.grade), awakened: awakened && base.awaken !== undefined };
}

/** 오라 종류: 데이터에 있으면 그것, 없으면 등급 (유니크 이상 은은한 빛, 신 무지개, 히든 흑금 — ART.md 1장) */
export function auraOf(look: HumanLook, awakened = false): AuraId {
  if (look.aura) return look.aura;
  switch (look.grade) {
    case 'unique':
    case 'hero':
    case 'legend':
      return 'glow';
    case 'god':
      return 'rainbow';
    case 'hidden':
      return 'blackgold';
    default:
      return awakened ? 'gold' : 'none';
  }
}

/** 입자 종류: 데이터에 있으면 그것, 없으면 레전드 이상은 별빛 */
export function fxOf(look: HumanLook): FxId {
  if (look.fx) return look.fx;
  return look.grade === 'legend' || look.grade === 'god' || look.grade === 'hidden' ? 'stars' : 'none';
}

/** 오라 반지름 (그림 단위) — 레전드 이상은 크게 */
export function auraRadius(look: HumanLook): number {
  return look.grade === 'legend' || look.grade === 'god' || look.grade === 'hidden' ? 150 : 120;
}

export function auraColorOf(look: HumanLook, aura: AuraId): string {
  return auraColor(aura, trimColor(look.grade));
}

/** 파츠 하나 (원점 = 그 파츠의 회전 중심). */
export function drawHumanPart(c: Ctx, r: HumanRender, part: PartName): void {
  const { look, rig } = r;
  switch (part) {
    case 'body':
      drawBodyPart(c, look);
      break;
    case 'prop':
      drawPropPart(c, look, r.trim, handColor(look), rig.spec.handRad);
      break;
    case 'back':
      if (rig.back) drawBackPart(c, look, rig.spec, rig.back.y, r.trim);
      break;
    case 'pet':
      if (look.pet) drawPetPart(c, look.pet);
      break;
  }
}

/** 한 장에 합친 그림 (원점 = 발밑, 쉬는 자세). 정보 패널 초상화·대체 그림용. */
export function drawHumanComposed(c: Ctx, r: HumanRender, opts: { aura?: boolean } = {}): void {
  const { rig, look } = r;
  c.save();
  c.translate(0, -rig.lift);
  if (opts.aura) {
    const aura = auraOf(look, r.awakened);
    if (aura !== 'none') {
      c.save();
      c.translate(0, -110);
      drawAura(c, aura, auraColorOf(look, aura), auraRadius(look));
      c.restore();
    }
  }
  for (const part of rig.parts) {
    c.save();
    if (part === 'prop') c.translate(rig.hand.x, rig.hand.y);
    else if (part === 'back' && rig.back) c.translate(rig.back.x, rig.back.y);
    else if (part === 'pet' && rig.pet) c.translate(rig.pet.x, rig.pet.y);
    drawHumanPart(c, r, part);
    c.restore();
  }
  c.restore();
}

/** 파츠들을 캔버스에 가로로 늘어놓아 그린다 (각 칸은 잘라서 이웃으로 번지지 않게). 배치를 돌려준다. */
export function renderHumanAtlas(c: Ctx, r: HumanRender, res: number): AtlasLayout {
  const layout = atlasLayout(r.rig.parts, res);
  for (const f of layout.frames) {
    c.save();
    c.beginPath();
    c.rect(f.x, f.y, f.w, f.h);
    c.clip();
    c.translate(f.x + f.originX * f.w, f.y + f.originY * f.h);
    c.scale(res, res);
    drawHumanPart(c, r, f.name);
    c.restore();
  }
  return layout;
}

export { glow };
