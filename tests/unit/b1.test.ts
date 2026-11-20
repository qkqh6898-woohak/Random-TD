/**
 * B-1 전투 화면 (Codex 패치 확인): 캐릭터 기본 2배·붙으면 1.4배·HUD 아래까지(battleFigureScale), 커진 머리 탭 판정(tapTile),
 * 머리 위 연출 높이(G-2: 주사위 → 초상 카드 cardApexTiles, 뒤집기 cardFlip은 tests/unit/g2.test.ts). 화면 전용 순수 함수.
 */
import { describe, expect, it } from 'vitest';
import { tapTile } from '../../src/view/input/tap';
import type { MapLayout } from '../../src/view/layout';
import { battleFigureScale, CARD_ABOVE_HEAD_TILES, cardApexTiles, fillOccupancy, FOOT_OFFSET_TILES, isCrowded, towerFigureSpanTiles } from '../../src/view/render/towerGeom';

// 1칸 100px, 칸 (0, 0) 왼쪽 위 = (0, 0)
const L: MapLayout = { tile: 100, originX: 0, originY: 0, minCol: 0, minRow: 0, cols: 9, rows: 11 };
const at = (x: number, y: number) => (tx: number, ty: number) => tx === x && ty === y;

describe('B-1 큰 캐릭터 탭 판정: 빈 소환 칸이 먼저', () => {
  // 돌 골렘(×1.25) 혼자 → 2.5배: 머리가 칸 중심에서 약 2.5칸 위까지
  const golem = () => 2.5;

  it('바로 아래 큰 타워가 있어도 빈 소환 칸의 가운데·위쪽·아래쪽 좌우를 누르면 그 칸 (머리가 탭을 가져가지 않음)', () => {
    const pad = at(3, 3);
    for (const [x, y] of [
      [350, 350], // 가운데
      [350, 312], // 위쪽
      [310, 380], // 아래 왼쪽 (확대된 머리 옆)
      [390, 380], // 아래 오른쪽
      [350, 362], // 아래 가운데, 크기 1 머리 영역(위 칸 아래 약 1/3) 바로 위
    ] as const) {
      expect(tapTile(L, x, y, at(3, 4), golem, pad), `${x},${y}`).toEqual({ tx: 3, ty: 3 });
    }
    // 크기 1 머리 높이(위 칸 아래쪽 가운데)는 여전히 아래 타워 (F10)
    expect(tapTile(L, 350, 385, at(3, 4), golem, pad)).toEqual({ tx: 3, ty: 4 });
  });

  it('위 칸이 길·장식이면 두 줄 위·세 줄 위까지 올라온 큰 머리를 눌러도 그 타워, 가장 앞(아래) 타워가 이긴다', () => {
    const none = () => false;
    // (3, 4) 타워 ×2: 위 칸(3, 3) 가운데 → 타워
    expect(tapTile(L, 350, 350, at(3, 4), () => 2, none)).toEqual({ tx: 3, ty: 4 });
    // ×2.5: 세 줄 위 칸(3, 1)의 맨 아래 (머리 끝 ≈ 4.5 − 2.54 = 1.96)
    expect(tapTile(L, 350, 199, at(3, 4), golem, none)).toEqual({ tx: 3, ty: 4 });
    expect(tapTile(L, 350, 190, at(3, 4), golem, none)).toEqual({ tx: 3, ty: 1 });
    // (3, 4)·(3, 5) 둘 다 커서 (3, 3)에 머리가 겹치면 아래 (3, 5)
    const two = (tx: number, ty: number) => tx === 3 && (ty === 4 || ty === 5);
    expect(tapTile(L, 350, 380, two, golem, none)).toEqual({ tx: 3, ty: 5 });
  });

  it('타워가 있는 칸은 그 칸 (아래 타워 머리는 크기 1 높이까지만)', () => {
    const two = (tx: number, ty: number) => tx === 3 && (ty === 3 || ty === 4);
    expect(tapTile(L, 350, 330, two, golem, at(3, 3))).toEqual({ tx: 3, ty: 3 });
    expect(tapTile(L, 350, 360, two, golem, at(3, 3))).toEqual({ tx: 3, ty: 3 });
    // 위 칸 아래쪽 약 1/3(크기 1 머리 높이, ≈ 3.66칸 아래)부터는 아래 타워 — 2.5배여도 더 올라가지 않는다
    expect(tapTile(L, 350, 370, two, golem, at(3, 3))).toEqual({ tx: 3, ty: 4 });
  });
});

describe('B-1 전투 확대 배수', () => {
  it('V2.0 PR-A: 이웃과 무관하게 등급 배율로만 — 혼자 칸 너비 = 노말(0.7) 60% ~ 리미티드(1.5) 80% · HUD 앞에서 줄이는 규칙은 그대로', () => {
    expect(battleFigureScale(1, false, 10)).toBeCloseTo(0.675 / 0.92, 6); // 너비 0.6 + (0.3/0.8) × 0.2 = 0.675칸
    expect(battleFigureScale(1, true, 10)).toBeCloseTo(0.675 / 0.92, 6); // 이웃이 있어도 같다 (피드백 #36·#66)
    expect(battleFigureScale(1.5, false, 10)).toBeCloseTo(0.8 / 0.92, 6);
    expect(battleFigureScale(0.7, false, 10)).toBeCloseTo(0.6 / 0.92, 6);
    // 새 크기는 늘 캐릭터 크기(looks scale)보다 작아 HUD 앞에서도 줄지 않는다 (머리 끝 = 발밑 위 1.14칸 × 배율 < 1칸)
    expect(battleFigureScale(1, false, 0.5)).toBeCloseTo(0.675 / 0.92, 6);
    expect(FOOT_OFFSET_TILES - towerFigureSpanTiles(battleFigureScale(1.54, false, 10)).top).toBeLessThan(1.02);
    // 등급 배율이 1보다 큰 그림(예전 규칙)이면 HUD 아래 끝에 딱 맞게 줄인다 — 함수 규칙 자체는 그대로
    const s = Math.min(1.4, Math.max(1, 1.3 / (FOOT_OFFSET_TILES - towerFigureSpanTiles(1).top)));
    expect(FOOT_OFFSET_TILES - towerFigureSpanTiles(s).top).toBeCloseTo(1.3, 6);
  });
});

describe('B-1 머리 위 연출이 멈추는 높이 (G-2: 초상 카드)', () => {
  it('카드 가운데는 늘 지금 그림 크기의 머리 끝보다 일정하게 위 (커진 캐릭터의 얼굴을 가리지 않음)', () => {
    expect(cardApexTiles(1)).toBeCloseTo(towerFigureSpanTiles(1).top - CARD_ABOVE_HEAD_TILES, 6);
    expect(cardApexTiles(1)).toBeLessThan(-0.94); // 예전 주사위(−0.94칸)보다 위 — 카드가 주사위보다 크다
    for (const s of [1.4, 2, 2.5]) {
      expect(cardApexTiles(s)).toBeLessThan(towerFigureSpanTiles(s).top);
      expect(towerFigureSpanTiles(s).top - cardApexTiles(s)).toBeCloseTo(CARD_ABOVE_HEAD_TILES, 6);
    }
  });
});

describe('B-1 이웃 붙음 판정 (TowerLayer.sync·expectedScale 공용, 검토 반영)', () => {
  const cols = 9;
  const occ = (cells: [number, number][]) => fillOccupancy(new Set<number>(), cells.map(([tx, ty]) => ({ tx, ty })), cols);

  it('위·아래·왼쪽·오른쪽 이웃이면 붙음, 대각선·두 칸 떨어지면 아님', () => {
    for (const n of [[4, 5], [6, 5], [5, 4], [5, 6]] as [number, number][]) {
      expect(isCrowded(occ([[5, 5], n]), 5, 5, cols)).toBe(true);
    }
    for (const n of [[4, 4], [6, 6], [7, 5], [5, 3]] as [number, number][]) {
      expect(isCrowded(occ([[5, 5], n]), 5, 5, cols)).toBe(false);
    }
    expect(isCrowded(occ([[5, 5]]), 5, 5, cols)).toBe(false); // 자기 자신만
  });

  it('한 줄 끝(tx = cols−1)과 다음 줄 시작(tx = 0)은 이웃이 아니다', () => {
    expect(isCrowded(occ([[cols - 1, 2], [0, 3]]), cols - 1, 2, cols)).toBe(false);
    expect(isCrowded(occ([[cols - 1, 2], [0, 3]]), 0, 3, cols)).toBe(false);
    expect(isCrowded(occ([[0, 2], [cols - 1, 1]]), 0, 2, cols)).toBe(false);
  });

  it('fillOccupancy는 같은 Set을 비우고 다시 채운다', () => {
    const s = occ([[1, 1], [2, 1]]);
    fillOccupancy(s, [{ tx: 7, ty: 7 }], cols);
    expect(s.size).toBe(1);
    expect(isCrowded(s, 1, 1, cols)).toBe(false);
  });
});

describe('V2.0 PR-A 혼자 있는 유닛 = 2~3개 무더기 크기 (칸의 약 70%)', () => {
  it('등급 가운데 기준 노말 ≈60% → 리미티드 ≈80%, 평균 ≈70%, 등급이 높을수록 크다, 모두 칸 안', async () => {
    const { figureArtScale, soloWidthTiles, ART_WIDTH_PER_SCALE } = await import('../../src/view/render/towerGeom');
    const { STACK_HALF_W_PER_ART } = await import('../../src/view/render/stackGeom');
    expect(ART_WIDTH_PER_SCALE).toBeCloseTo(2 * STACK_HALF_W_PER_ART, 9);
    const looks = [0.7, 0.82, 0.94, 1.06, 1.18, 1.34, 1.5]; // 노말 … 리미티드 (characterLooks 등급 구간 가운데)
    const widths = looks.map(soloWidthTiles);
    for (let i = 1; i < widths.length; i++) expect(widths[i]!).toBeGreaterThan(widths[i - 1]!);
    expect(widths[0]).toBeCloseTo(0.6, 6);
    expect(widths[6]).toBeCloseTo(0.8, 6);
    const avg = widths.reduce((a, b) => a + b, 0) / widths.length;
    expect(avg).toBeGreaterThan(0.67);
    expect(avg).toBeLessThan(0.73);
    // 데이터 끝 값 (노말 0.66 · 리미티드 1.54)도 칸 안 (반폭 < 0.5칸)
    expect(figureArtScale(1.54) * STACK_HALF_W_PER_ART).toBeLessThan(0.5);
    expect(soloWidthTiles(0.66)).toBeGreaterThan(0.55);
  });

  it('무더기 2·3개도 칸 너비 상한 그대로(절대값) · 혼자보다 크지 않다', async () => {
    const { figureArtScale } = await import('../../src/view/render/towerGeom');
    const { stackArtScale, stackSlot, stackMaxArt } = await import('../../src/view/render/stackGeom');
    for (const look of [0.66, 0.9, 1.18, 1.54]) {
      const solo = figureArtScale(look);
      for (const n of [2, 3]) {
        for (let i = 0; i < n; i++) {
          const slot = stackSlot(i, n);
          const art = stackArtScale(solo, slot);
          expect(art).toBeLessThanOrEqual(solo + 1e-9);
          expect(art).toBeLessThanOrEqual(stackMaxArt(Math.abs(slot.dx)) + 1e-9);
        }
      }
    }
  });
});
