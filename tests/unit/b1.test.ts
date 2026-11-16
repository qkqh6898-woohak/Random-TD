/**
 * B-1 전투 화면 (Codex 패치 확인): 캐릭터 기본 2배·붙으면 1.4배·HUD 아래까지(battleFigureScale), 커진 머리 탭 판정(tapTile),
 * 굴러가는 주사위 눈(rollingDieFace). 화면 전용 순수 함수.
 */
import { describe, expect, it } from 'vitest';
import { tapTile } from '../../src/view/input/tap';
import type { MapLayout } from '../../src/view/layout';
import { DIE_ROLL_STEPS, rollingDieFace } from '../../src/view/render/fxModel';
import { battleFigureScale, dieApexTiles, fillOccupancy, FOOT_OFFSET_TILES, isCrowded, towerFigureSpanTiles } from '../../src/view/render/towerGeom';

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
  it('혼자 2배 · 붙으면 1.4배 · 머리가 HUD를 넘지 않게 줄이되 캐릭터 크기보다 작게는 안 함', () => {
    expect(battleFigureScale(1, false, 10)).toBe(2);
    expect(battleFigureScale(1, true, 10)).toBe(1.4);
    // 0번 줄: 발밑에서 HUD까지 1.3칸 → 머리 끝이 HUD 아래 끝에 딱 맞게
    const s = battleFigureScale(1, false, 1.3);
    expect(FOOT_OFFSET_TILES - towerFigureSpanTiles(s).top).toBeCloseTo(1.3, 6);
    // 자리가 아주 없어도 캐릭터 크기(HF-2 looks scale)는 지킨다
    expect(battleFigureScale(1.25, false, 0.2)).toBe(1.25);
  });
});

describe('B-1 주사위가 멈추는 높이', () => {
  it('크기 1은 예전(A-1) 그대로 칸 중심 0.94칸 위, 커지면 커진 머리 끝보다 위 (얼굴을 가리지 않음)', () => {
    expect(dieApexTiles(1)).toBeCloseTo(-0.94, 2);
    for (const s of [1.4, 2, 2.5]) {
      expect(dieApexTiles(s)).toBeLessThan(towerFigureSpanTiles(s).top);
      expect(towerFigureSpanTiles(s).top - dieApexTiles(s)).toBeCloseTo(towerFigureSpanTiles(1).top - dieApexTiles(1), 6);
    }
  });
});

describe('B-1 굴러가는 주사위 눈', () => {
  it('진행도 0~1 동안 1~6 사이로 바뀌다가 결과 눈으로 끝난다', () => {
    for (const revealed of [3, 5]) {
      const faces: number[] = [];
      for (let i = 0; i <= 100; i++) faces.push(rollingDieFace(i / 100, revealed));
      expect(faces.every((f) => f >= 1 && f <= 6)).toBe(true);
      expect(new Set(faces).size).toBe(6);
      expect(faces[faces.length - 1]).toBe(revealed);
      expect(rollingDieFace((DIE_ROLL_STEPS - 1) / DIE_ROLL_STEPS, revealed)).toBe(revealed);
      // 한 칸씩 바뀐다 (같은 눈이 이어서 두 칸 나오지 않음, 마지막 결과 칸 전까지)
      const steps = [...Array(DIE_ROLL_STEPS - 1).keys()].map((t) => rollingDieFace((t + 0.5) / DIE_ROLL_STEPS, revealed));
      for (let t = 1; t < steps.length; t++) expect(steps[t]).not.toBe(steps[t - 1]);
    }
    // 진행도가 범위를 넘어도 (Back.easeOut이 아니라 progress라 0~1이지만) 안전
    expect(rollingDieFace(1.2, 3)).toBe(3);
    expect(rollingDieFace(-0.1, 3)).toBe(4);
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
