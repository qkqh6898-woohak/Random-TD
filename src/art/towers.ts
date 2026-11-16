/**
 * 게임 화면의 타워 그림 (DEV_PLAN M2-8).
 *
 * - 타워 id마다 캐릭터 텍스처(몸 = 종족 색, 소품, 머리 위 별 = 등급)를 한 번 구워 쓰고, 받침대는 등급마다 하나.
 *   (WebGL에서 Graphics는 매 프레임 다시 쪼개지므로 칸마다 Graphics를 두지 않는다.)
 * - 소품은 직업을 한눈에 (ART.md 1장): 광부 곡괭이, 고블린 단검, 궁수 활, 견습 마법사 지팡이, 전사 검.
 *   표에 없는 타워는 피해·공격 형태로 고른다 (마법 = 지팡이, 근접 = 검, 그 밖의 물리 = 활).
 * 색·모양은 화면 표현 상수라 코드에 둔다 (종족 색은 towers.json factions에서 읽는다).
 */
import Phaser from 'phaser';
import type { Grade } from '../data/load';
import { CHIBI_BOUNDS, PEDESTAL_BOUNDS, drawChibiFigure, drawGradeStars, drawPedestal } from './chibi';
import { COLORS, GRADE_COLORS, hexToInt, lerpColor } from './palette';
import { GRADE_STARS, HELMET_COLOR, MAGIC_HOOD, STAFF_GEMS, propFor, type TowerLookInput } from './towerLook';

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
  const illustration = scene.textures.get(`art-${key}`).getSourceImage();
  if (scene.textures.exists(`art-${key}`) && illustration instanceof HTMLImageElement) {
    const texture = scene.textures.createCanvas(key, FIGURE_TEX_W, FIGURE_TEX_H);
    if (texture) {
      texture.context.drawImage(illustration, 0, 0);
      g.translateCanvas(-CHIBI_BOUNDS.left, -CHIBI_BOUNDS.top);
      drawGradeStars(g, GRADE_STARS[t.grade]);
      g.generateTexture(texture.canvas, FIGURE_TEX_W, FIGURE_TEX_H);
      texture.refresh();
      g.destroy();
      return key;
    }
  }
  const body = hexToInt(factionColor);
  const prop = propFor(t);
  const cap = prop === 'pickaxe' ? HELMET_COLOR : t.damageType === 'magic' ? lerpColor(body, MAGIC_HOOD, 0.65) : undefined;
  drawChibiFigure(g, {
    job: t.id, faction: t.faction, body, prop, stars: GRADE_STARS[t.grade], cap, gem: STAFF_GEMS[t.id],
    trim: t.grade === 'hidden' ? hexToInt(COLORS.hiddenRim) : hexToInt(GRADE_COLORS[t.grade]),
  }, -CHIBI_BOUNDS.left, -CHIBI_BOUNDS.top);
  g.generateTexture(key, FIGURE_TEX_W, FIGURE_TEX_H);
  g.destroy();
  return key;
}

/** 받침대 텍스처 (등급마다 한 번). */
export function ensurePedestalTexture(scene: Phaser.Scene, grade: Grade): string {
  const key = `pedestal-${grade}`;
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  drawPedestal(g, hexToInt(GRADE_COLORS[grade]), -PEDESTAL_BOUNDS.left, -PEDESTAL_BOUNDS.top);
  g.generateTexture(key, PEDESTAL_TEX_W, PEDESTAL_TEX_H);
  g.destroy();
  return key;
}
