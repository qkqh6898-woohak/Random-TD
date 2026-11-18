/**
 * 피드백 #47 '영웅 누르면 작은 아이콘이 좌상단 승급 버튼, 우상단 x버튼은 팔기 버튼으로' (순수 함수, DOM 없음 → 단위 테스트).
 * 고른 타워 칸의 왼쪽 위 모서리에 [⬆](승급), 오른쪽 위 모서리에 [✕](판매) 작은 둥근 버튼을 띄운다.
 * 버튼 상태는 정보 패널 모델(towerPanelModel)의 값을 그대로 쓴다 — 승급 켜짐·판매 확인('한 번 더 누르면 판매') 규칙이 패널과 같다.
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
  sell: { x: number; y: number };
}

/**
 * 칸 모서리에 버튼 중심을 둔다 (왼쪽 위 = 승급, 오른쪽 위 = 판매). 무대 밖으로 나가지 않게 안쪽으로 당긴다.
 * @param cx,cy 칸 가운데 (CSS px) · @param tile 칸 너비 (CSS px) · @param stageW,stageH 무대 크기 (CSS px)
 */
export function quickPlacement(cx: number, cy: number, tile: number, stageW: number, stageH: number): QuickPlacement {
  const size = Math.round(Math.max(QUICK_MIN_PX, tile * QUICK_SIZE_RATIO));
  const r = size / 2;
  const clampX = (x: number): number => Math.min(Math.max(x, r), Math.max(r, stageW - r));
  const y = Math.min(Math.max(cy - tile / 2, r), Math.max(r, stageH - r));
  return {
    size,
    merge: { x: clampX(cx - tile / 2), y },
    sell: { x: clampX(cx + tile / 2), y },
  };
}

export interface QuickModel {
  mergeEnabled: boolean;
  sellConfirming: boolean;
  mergeLabel: string;
  sellLabel: string;
}

export function quickModel(m: Pick<TowerPanelModel, 'mergeEnabled' | 'sellConfirming' | 'sellPriceText'>): QuickModel {
  return {
    mergeEnabled: m.mergeEnabled,
    sellConfirming: m.sellConfirming,
    mergeLabel: m.mergeEnabled ? '승급' : '승급 (지금은 할 수 없어요)',
    sellLabel: m.sellConfirming ? '한 번 더 누르면 판매' : `판매 ${m.sellPriceText}`,
  };
}
