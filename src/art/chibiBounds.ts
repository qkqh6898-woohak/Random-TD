/**
 * 임시 SD 캐릭터·받침대의 그림 경계 (순수 상수, Phaser 없음). 그리기(chibi.ts)·텍스처 굽기(towers.ts)와
 * 화면 순수 계산(탭 판정 `view/render/towerGeom.ts`)이 같이 쓴다.
 */

/** 그림 크기 (발밑 원점 기준, 받침대·별 포함 바깥 경계). 텍스처를 구울 때 쓴다. */
export const CHIBI_BOUNDS = { left: -100, right: 120, top: -268, bottom: 6 } as const;
export const PEDESTAL_BOUNDS = { left: -98, right: 98, top: -26, bottom: 44 } as const;
