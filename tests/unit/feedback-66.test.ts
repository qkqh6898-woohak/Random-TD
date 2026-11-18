/**
 * 피드백 #66 '유닛 크기 주변 유닛 유무에 따라 변하는거 없애기' (+ '일꾼 소환 버튼 꾹 누르면 계속 소환' — DOM 동작이라 e2e/fb66.spec.ts).
 * 이슈 본문·판 기록 JSON이 없어 리플레이 재현 테스트 대신 크기 규칙을 고정한다.
 * 예전(B-1): 혼자면 2배, 위·아래·옆에 타워가 붙으면 1.4배 → 옆에 소환·이동·판매할 때마다 이웃 그림 크기가 바뀌었다.
 * 이제: 이웃과 상관없이 늘 같은 배율(1.4배, 꽉 찬 판에서도 이웃 칸을 덮지 않는 크기) × 캐릭터 크기, HUD 아래까지만.
 */
import { describe, expect, it } from 'vitest';
import * as geom from '../../src/view/render/towerGeom';
import { battleFigureScale, BATTLE_FIGURE_SCALE, FOOT_OFFSET_TILES, towerFigureSpanTiles } from '../../src/view/render/towerGeom';

describe('피드백 #66 유닛 크기는 이웃과 무관', () => {
  it('크기 계산은 이웃 정보를 받지 않는다 (캐릭터 크기·HUD까지 거리만)', () => {
    expect(battleFigureScale.length).toBe(2);
    expect('isCrowded' in geom).toBe(false);
  });

  it('기본 배율은 1.4배 하나 (예전 붙음 크기 — 꽉 찬 판 그대로)', () => {
    expect(BATTLE_FIGURE_SCALE).toBe(1.4);
    expect(battleFigureScale(1, 10)).toBe(1.4);
    expect(battleFigureScale(1.25, 10)).toBe(1.75);
  });

  it('HUD 아래까지만 줄이는 규칙은 그대로, 캐릭터 크기보다 작게는 안 함', () => {
    const s = battleFigureScale(1, 1.3);
    expect(s).toBeLessThan(1.4);
    expect(FOOT_OFFSET_TILES - towerFigureSpanTiles(s).top).toBeCloseTo(1.3, 6);
    expect(battleFigureScale(1.25, 0.2)).toBe(1.25);
  });
});
