/**
 * 게임 화면의 임시 타워 그림 (DEV_PLAN M2-8). M11에서 파츠 SVG + animations.json으로 바뀐다.
 *
 * - 타워 id마다 캐릭터 텍스처(몸 = 종족 색, 소품, 머리 위 별 = 등급)를 한 번 구워 쓰고, 받침대는 등급마다 하나.
 *   (WebGL에서 Graphics는 매 프레임 다시 쪼개지므로 칸마다 Graphics를 두지 않는다.)
 * - 소품은 직업을 한눈에 (ART.md 1장): 광부 곡괭이, 고블린 단검, 궁수 활, 견습 마법사 지팡이, 전사 검.
 *   표에 없는 타워는 피해·공격 형태로 고른다 (마법 = 지팡이, 근접 = 검, 그 밖의 물리 = 활).
 * 색·모양은 화면 표현 상수라 코드에 둔다 (종족 색은 towers.json factions에서 읽는다).
 */
import Phaser from 'phaser';
import type { Grade } from '../data/load';
import { CHIBI_BOUNDS, PEDESTAL_BOUNDS, drawChibiFigure, drawPedestal } from './chibi';
import { GRADE_COLORS, hexToInt, lerpColor } from './palette';
import { EMBLEM_SIZE, STAR_BADGE, drawFactionEmblem, drawGradePedestal, drawStarBadge } from './presentation';
import { GRADE_STARS, HELMET_COLOR, MAGIC_HOOD, propFor, type TowerLookInput } from './towerLook';

export { SPECIAL_FACTION_COLORS, type TowerLookInput } from './towerLook';

export const FIGURE_TEX_W = CHIBI_BOUNDS.right - CHIBI_BOUNDS.left;
export const FIGURE_TEX_H = CHIBI_BOUNDS.bottom - CHIBI_BOUNDS.top;
/** 텍스처 안 발밑 위치 비율 (Image origin) */
export const FIGURE_ORIGIN_X = -CHIBI_BOUNDS.left / FIGURE_TEX_W;
export const FIGURE_ORIGIN_Y = -CHIBI_BOUNDS.top / FIGURE_TEX_H;
export const PEDESTAL_TEX_W = PEDESTAL_BOUNDS.right - PEDESTAL_BOUNDS.left;
export const PEDESTAL_TEX_H = PEDESTAL_BOUNDS.bottom - PEDESTAL_BOUNDS.top;
export const PEDESTAL_ORIGIN_Y = -PEDESTAL_BOUNDS.top / PEDESTAL_TEX_H;

/** 캐릭터 텍스처 (타워 id마다 한 번). 키를 돌려준다. */
export function ensureTowerTexture(scene: Phaser.Scene, t: TowerLookInput, factionColor: string): string {
  const key = `tower-${t.id}`;
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const body = hexToInt(factionColor);
  const prop = propFor(t);
  const cap = prop === 'pickaxe' ? HELMET_COLOR : t.damageType === 'magic' ? lerpColor(body, MAGIC_HOOD, 0.65) : undefined;
  drawChibiFigure(g, { body, prop, stars: GRADE_STARS[t.grade], cap, lamp: prop === 'pickaxe' }, -CHIBI_BOUNDS.left, -CHIBI_BOUNDS.top);
  g.generateTexture(key, FIGURE_TEX_W, FIGURE_TEX_H);
  g.destroy();
  return key;
}

/** 텍스처 굽는 배율 (그림 단위 → 텍스처 px). 맵에서는 줄여 그리므로 1이면 충분 */
const BADGE_RES = 1;

/** 캔버스 텍스처 하나 굽기 (draw는 원점이 (ox, oy)로 옮겨진 컨텍스트에 그린다). 캔버스를 못 쓰면 false */
function bakeCanvas(scene: Phaser.Scene, key: string, w: number, h: number, ox: number, oy: number, draw: (c: CanvasRenderingContext2D) => void): boolean {
  const tex = scene.textures.createCanvas(key, Math.ceil(w * BADGE_RES), Math.ceil(h * BADGE_RES));
  const c = tex?.getContext();
  if (!tex || !c) {
    if (tex) scene.textures.remove(key);
    return false;
  }
  c.save();
  c.scale(BADGE_RES, BADGE_RES);
  c.translate(ox, oy);
  draw(c);
  c.restore();
  tex.refresh();
  return true;
}

/**
 * 받침대 텍스처 (등급마다 한 번). G-2: 등급마다 다른 장식 + 부드러운 땅 그림자 + 유니크 이상 빛 고리 (art/presentation.ts).
 * 크기·원점은 예전 그대로(PEDESTAL_BOUNDS) → 탭 판정·패널 배치 그대로. 캔버스를 못 쓰면 예전 Graphics 받침대.
 */
export function ensurePedestalTexture(scene: Phaser.Scene, grade: Grade): string {
  const key = `pedestal-${grade}`;
  if (scene.textures.exists(key)) return key;
  if (bakeCanvas(scene, key, PEDESTAL_TEX_W, PEDESTAL_TEX_H, -PEDESTAL_BOUNDS.left, -PEDESTAL_BOUNDS.top, (c) => drawGradePedestal(c, grade))) return key;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  drawPedestal(g, hexToInt(GRADE_COLORS[grade]), -PEDESTAL_BOUNDS.left, -PEDESTAL_BOUNDS.top);
  g.generateTexture(key, PEDESTAL_TEX_W, PEDESTAL_TEX_H);
  g.destroy();
  return key;
}

/** 별 배지 텍스처 (등급마다 한 번, 원점 가운데). G-2 */
export function ensureStarBadgeTexture(scene: Phaser.Scene, grade: Grade): string {
  const key = `badge-stars-${grade}`;
  if (!scene.textures.exists(key)) bakeCanvas(scene, key, STAR_BADGE.w, STAR_BADGE.h, STAR_BADGE.w / 2, STAR_BADGE.h / 2, (c) => drawStarBadge(c, grade));
  return key;
}

/** 종족 문장 배지 텍스처 (종족마다 한 번, 원점 가운데). G-2 */
export function ensureFactionEmblemTexture(scene: Phaser.Scene, faction: string, color: string): string {
  const key = `badge-faction-${faction}`;
  if (!scene.textures.exists(key)) bakeCanvas(scene, key, EMBLEM_SIZE, EMBLEM_SIZE, EMBLEM_SIZE / 2, EMBLEM_SIZE / 2, (c) => drawFactionEmblem(c, faction, color));
  return key;
}

/** 발밑 접지 그림자 (부드러운 타원, 한 번). 캐릭터가 뛰면 작아지고 옅어진다 (TowerSprite). G-2 */
export const CONTACT_SHADOW_KEY = 'fig-contact-shadow';
export function ensureContactShadowTexture(scene: Phaser.Scene): string {
  if (!scene.textures.exists(CONTACT_SHADOW_KEY)) {
    bakeCanvas(scene, CONTACT_SHADOW_KEY, 128, 40, 64, 20, (c) => {
      c.scale(1, 20 / 64);
      const g = c.createRadialGradient(0, 0, 4, 0, 0, 64);
      g.addColorStop(0, 'rgba(20,10,4,0.5)');
      g.addColorStop(0.6, 'rgba(20,10,4,0.22)');
      g.addColorStop(1, 'rgba(20,10,4,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(0, 0, 64, 0, Math.PI * 2);
      c.fill();
    });
  }
  return CONTACT_SHADOW_KEY;
}
