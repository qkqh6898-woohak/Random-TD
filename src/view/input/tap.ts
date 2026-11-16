/**
 * 맵 탭 → 할 일 (DEV_PLAN M2-7, UI.md 4.3·8·9장). 순수 함수 (Phaser 없음 → 단위 테스트).
 *
 * - 빈 배치 칸: 소환 명령 (즉시 소환). 명령은 sim이 실행 틱에 다시 검사한다.
 * - 돈 부족: "100원이 필요해요" 토스트 + 칸 흔들림 (명령 보내지 않음).
 * - 배치 칸이 가득 참 (타워 칸을 눌렀을 때): "빈 칸이 없어요 — 승급으로 칸을 비워 보세요".
 * - 타워가 있는 칸 (빈 칸이 남아 있음): 아무 일 없음 (타워 정보 패널은 M3).
 * - 경로·장식·맵 밖: 아무 일 없음.
 * - 소환 연타는 0.1초 간격까지 받는다 (UI.md 9장).
 * - 탭 위치 → 칸 (`tapTile`): 타워 그림의 머리는 위 칸으로 삐져나와 있으므로, 아래 칸에 타워가 있고 그 머리 영역을 눌렀으면
 *   위 칸이 아니라 그 타워 칸을 누른 것으로 본다 (보이는 캐릭터를 눌렀는데 위 칸에 소환되던 문제).
 *   머리 영역은 캐릭터별 크기만큼 넓어지되, 위 칸에 타워가 있거나 위 칸이 빈 배치 칸이면 크기 1 기준 높이까지만
 *   (위 타워를 누르기 쉽게, F10 · 빈 위 칸 가운데를 누르면 소환되게, F10-4 검토).
 */
import type { SummonFail } from '../../sim/systems/Summon';
import { BOARD_FULL, needGoldForSummon } from '../../ui/messages';
import { pxToTile, type MapLayout } from '../layout';
import { towerHeadZone } from '../render/towerGeom';

/** 소환 탭 최소 간격 (ms) — UI.md 9장 '소환 연타 0.1초 간격까지 허용' */
export const TAP_MIN_INTERVAL_MS = 100;

export type TapAction =
  | { kind: 'summon'; x: number; y: number }
  | { kind: 'toast'; text: string; shake: boolean; x: number; y: number }
  | { kind: 'none' };

/** 소환 검사 결과(summonCheck) → 할 일. */
export function decideTap(fail: SummonFail | null, x: number, y: number, cost: number): TapAction {
  switch (fail) {
    case null:
      return { kind: 'summon', x, y };
    case 'gold':
      return { kind: 'toast', text: needGoldForSummon(cost), shake: true, x, y };
    case 'full':
      return { kind: 'toast', text: BOARD_FULL, shake: false, x, y };
    case 'occupied':
    case 'notBuildable':
    case 'phase':
      return { kind: 'none' };
  }
}

/** sim이 실행 틱에 거절한 소환(summonFail 사건) → 보여줄 글자 (없으면 null). 화면이 미리 검사한 뒤에도 같은 틱 연타 등으로 생길 수 있다. */
export function summonFailText(reason: string, cost: number): string | null {
  if (reason === 'gold') return needGoldForSummon(cost);
  if (reason === 'full') return BOARD_FULL;
  return null;
}

/** 연타 거르기: 마지막으로 받은 탭에서 0.1초가 지났는가. */
export function tapAllowed(lastAcceptedMs: number | null, nowMs: number): boolean {
  return lastAcceptedMs === null || nowMs - lastAcceptedMs >= TAP_MIN_INTERVAL_MS;
}

/**
 * 탭한 화면 px → 누른 칸. 소환 칸에서는 바로 아래 타워의 기존 머리 영역만 받는다.
 * 길·장식 칸에서는 큰 캐릭터가 최대 세 줄 위까지 보이고, 가장 앞에 그려진 아래 타워부터 검사한다.
 */
export function tapTile(
  layout: MapLayout,
  px: number,
  py: number,
  hasTower: (tx: number, ty: number) => boolean,
  /** 그 칸 타워의 캐릭터별 크기 배수 (HF-2 looks scale, F10). 생략하면 1 */
  scaleAt?: (tx: number, ty: number) => number,
  /** 그 칸이 배치 칸인가 (F10-4). 생략하면 아니라고 본다 (머리 영역을 크기만큼) */
  buildableAt?: (tx: number, ty: number) => boolean,
): { tx: number; ty: number } {
  const base = pxToTile(layout, px, py);
  const fx = (px - layout.originX) / layout.tile;
  const fy = (py - layout.originY) / layout.tile;
  const cap = hasTower(base.tx, base.ty) || (buildableAt?.(base.tx, base.ty) ?? false);
  for (let dy = cap ? 1 : 3; dy >= 1; dy--) {
    const ty = base.ty + dy;
    if (!hasTower(base.tx, ty)) continue;
    const z = towerHeadZone(base.tx, ty, scaleAt?.(base.tx, ty) ?? 1, cap);
    if (fx >= z.left && fx <= z.right && fy >= z.top) return { tx: base.tx, ty };
  }
  return base;
}
