/**
 * 피드백 #22 — 제안 '유닛 아래 별을 조금 더 크게' (별 배지 크기만).
 * 판 기록 JSON이 없어 리플레이 재현 대신 별 배지 배치 값(순수 계산)을 고정한다.
 */
import { describe, expect, it } from 'vitest';
import { STAR_BADGE } from '../../src/art/presentation';
import { PEDESTAL_WIDTH_TILES, STAR_BADGE_W_TILES, STAR_BADGE_Y_TILES } from '../../src/view/render/towerGeom';

/** 바꾸기 전 값 (G-2) */
const OLD_W = 0.56;
const OLD_Y = 0.15;
/** 알약 높이 (그림 단위): drawStarBadge의 h = STAR_BADGE.h - 4 */
const PILL_H = STAR_BADGE.h - 4;
/** 레전드 별 5개 알약 너비 (그림 단위): 5 × 21 + 12 */
const PILL_W5 = 5 * 21 + 12;

const pillBottom = (w: number, y: number) => y + (w * PILL_H) / STAR_BADGE.w / 2;

describe('피드백 #22 별 배지 크기', () => {
  it('별 배지가 예전(0.56칸)보다 조금(10~30%) 더 크다', () => {
    expect(STAR_BADGE_W_TILES).toBeGreaterThanOrEqual(OLD_W * 1.1);
    expect(STAR_BADGE_W_TILES).toBeLessThanOrEqual(OLD_W * 1.3);
  });

  it('커져도 아래 끝은 예전보다 내려가지 않는다 (칸 아래 경계·정보 패널 배치 그대로)', () => {
    expect(pillBottom(STAR_BADGE_W_TILES, STAR_BADGE_Y_TILES)).toBeLessThanOrEqual(pillBottom(OLD_W, OLD_Y) + 1e-9);
  });

  it('별 5개 배지도 받침대 너비 안', () => {
    expect((STAR_BADGE_W_TILES * PILL_W5) / STAR_BADGE.w).toBeLessThanOrEqual(PEDESTAL_WIDTH_TILES);
  });
});
