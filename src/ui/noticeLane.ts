/**
 * 위쪽 알림 줄 (v0.1.22 사용자 결정 A①): 알림은 **한 줄에 하나만** 보인다.
 *
 * - 새 알림은 지금 알림을 바꿔 친다 (예전엔 최대 3개가 쌓여 ×16에서 '필살 폭격!'·'전체 기절!'이 세 줄로 맵 위를 덮었다).
 *   단 배너(보스·보상·미션 등)는 NOTICE_BANNER_HOLD_MS 동안 다른 알림에 밀리지 않고, 그 사이 온 알림은 하나만 기다렸다 뜬다.
 * - 같은 종류(kind — 기본은 글자 그대로, 필살기는 'ult-nuke'처럼 화면이 정한다)가 떠 있는 동안 또 오면 한 알림으로 합치고 '×n'을 붙인다.
 *   글자는 가장 최근 것. 숫자는 '(6)'(필살기에 걸린 몹 수)와 헷갈리지 않게 '×n'으로 쓴다.
 * 순수 함수 (DOM 없음 → 단위 테스트). 그리기는 UiRoot.toast/banner.
 */

/** 한 번에 보이는 알림 수 */
export const MAX_VISIBLE_NOTICES = 1;

/** 알림 글자를 줄일 수 있는 가장 작은 크기 (CSS px) — 이보다 작게는 줄이지 않고 두 줄·말줄임 */
export const NOTICE_MIN_FONT_PX = 12;

export interface NoticeSlot {
  kind: string;
  count: number;
}

/** 지금 떠 있는 알림(없으면 null)에 kind 알림이 새로 올 때 다음 칸: 같은 종류면 수 +1, 아니면 1부터 (바꿔 침). */
export function nextNotice(current: NoticeSlot | null, kind: string): NoticeSlot {
  return current !== null && current.kind === kind ? { kind, count: current.count + 1 } : { kind, count: 1 };
}

/** 합친 수 글자: 1이면 '', 2 이상이면 '×n' */
export function noticeCountText(count: number): string {
  return count > 1 ? `×${count}` : '';
}

/**
 * 한 줄에 맞추는 글자 크기: 지금 크기 size에서 글자 폭 textW가 칸 폭 avail을 넘으면 비율대로 줄이되,
 * 원래의 minRatio배·NOTICE_MIN_FONT_PX(원래가 그보다 작으면 원래) 아래로는 줄이지 않는다. 0.1px 단위 내림.
 */
export function fitFontPx(size: number, textW: number, avail: number, minRatio = 0.6): number {
  if (!(size > 0) || !(avail > 0) || !(textW > avail)) return size;
  const floor = Math.max(size * minRatio, Math.min(size, NOTICE_MIN_FONT_PX));
  const fitted = Math.floor(((size * avail) / textW) * 10) / 10;
  return Math.max(floor, fitted);
}

/** 알림 무게: 일반 알림 1, 배너(보스·보상·미션·편대·도전·승급 결과) 2 */
export type NoticePriority = 1 | 2;
export const NOTICE_PRIORITY = { plain: 1, banner: 2 } as const;

/**
 * 배너가 다른 알림에 바로 밀려나지 않는 최소 시간 (ms). 같은 프레임에 '히든 미션 발견! +2,000원' 배너 뒤에 '5단계 시작!'이 오거나
 * 편대 예고 뒤에 보스 예고가 오면 앞 배너가 한 번도 안 보였다 (v0.1.22 E2E m5·m4) → 배너는 이만큼 보인 뒤에 다음 알림으로 바뀐다.
 * 그 사이 온 알림은 하나만 기다린다 (무게가 같거나 큰 새 알림이 기다리던 것을 바꿈 — 배너가 기다리는 동안 온 일반 알림은 버림).
 * 같은 종류는 바로 합친다. 일반 알림은 붙잡지 않는다 (일반 → 일반·배너는 바로 바뀜).
 */
export const NOTICE_BANNER_HOLD_MS = 1500;

export interface LaneHolder {
  kind: string;
  prio: number;
  /** 이 시각(ms)까지는 다른 알림에 밀리지 않는다 (일반 알림은 0) */
  holdUntil: number;
}

/** 새 알림(kind)이 지금 알림을 바꾸기까지 기다릴 시간 (ms, 0 = 바로 바꿈). 순수 함수. */
export function noticeWaitMs(current: LaneHolder | null, kind: string, now: number): number {
  if (current === null || current.kind === kind) return 0;
  return Math.max(0, current.holdUntil - now);
}

/** 기다리는 자리에 새 알림을 넣을까: 비었거나, 새 알림이 같거나 더 무거우면 (가장 최근 것). */
export function replacesPending(pendingPrio: number | null, prio: number): boolean {
  return pendingPrio === null || prio >= pendingPrio;
}
