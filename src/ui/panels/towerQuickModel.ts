/**
 * 피드백 #47 '영웅 누르면 작은 아이콘이 좌상단 승급 버튼, 우상단 x버튼은 팔기 버튼으로' (순수 함수, DOM 없음 → 단위 테스트).
 * 고른 타워 칸의 왼쪽 위 모서리에 [⬆](승급) 작은 둥근 버튼을 띄운다. 버튼 상태는 정보 패널 모델(towerPanelModel) 값을 그대로 쓴다.
 * v0.1.14 통합: '우상단 판매'는 정보 패널 머리 줄 오른쪽 위 [판매][✕](디자인 PR #54, FB-D1 #30)가 맡는다 — 판매 버튼은 하나만 둔다.
 */
import type { TowerPanelModel } from './towerPanelModel';

/** 버튼 지름 = 칸 너비의 비율 */
export const QUICK_SIZE_RATIO = 0.4;
/** 버튼 지름 최소 (CSS px) — 작은 화면에서도 누를 수 있게 */
export const QUICK_MIN_PX = 28;

export interface QuickPlacement {
  /** 버튼 지름 (CSS px) */
  size: number;
  /** 버튼 중심 (무대 기준 CSS px) */
  merge: { x: number; y: number };
}

/**
 * 칸 왼쪽 위 모서리에 승급 버튼 중심을 둔다. 무대 밖으로 나가지 않게 안쪽으로 당긴다.
 * @param cx,cy 칸 가운데 (CSS px) · @param tile 칸 너비 (CSS px) · @param stageW,stageH 무대 크기 (CSS px)
 */
export function quickPlacement(cx: number, cy: number, tile: number, stageW: number, stageH: number): QuickPlacement {
  const size = Math.round(Math.max(QUICK_MIN_PX, tile * QUICK_SIZE_RATIO));
  const r = size / 2;
  const x = Math.min(Math.max(cx - tile / 2, r), Math.max(r, stageW - r));
  const y = Math.min(Math.max(cy - tile / 2, r), Math.max(r, stageH - r));
  return { size, merge: { x, y } };
}

export interface QuickModel {
  mergeEnabled: boolean;
  mergeLabel: string;
}

export function quickModel(m: Pick<TowerPanelModel, 'mergeEnabled'>): QuickModel {
  return {
    mergeEnabled: m.mergeEnabled,
    mergeLabel: m.mergeEnabled ? '승급' : '승급 (지금은 할 수 없어요)',
  };
}
