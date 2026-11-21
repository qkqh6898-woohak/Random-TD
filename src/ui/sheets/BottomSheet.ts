/**
 * 하단 메뉴 바텀 시트 (DEV_PLAN M5-1, UI.md 4.5): 화면 높이 55%까지 올라오고, 손잡이를 위로 끌면 85%.
 *
 * - 게임은 계속 진행된다 (시간이 흐름). 맵 위를 터치하면 닫힌다 (Game 장면이 캔버스 누름에서 닫는다).
 * - 손잡이(머리줄)를 끌어 크기를 바꾼다: 위로 충분히 끌면 85%, 아래로 끌면 85% → 55% → 닫기. 짧게 누르면 55% ↔ 85%.
 * - 시트 아래 끝은 하단 메뉴 위 (sheet 층의 --sheet-bottom, Game 장면이 하단 메뉴 높이를 재서 넣는다) → 메뉴 탭은 보인다.
 *   같은 메뉴를 다시 누르면 닫고, 다른 메뉴를 누르면 그 시트로 바뀐다.
 * - 탭(있으면) 줄과 내용(스크롤) 영역을 만들어 주고, 내용은 각 시트(도전·강화·미션)가 채운다.
 * - Escape 키(나중에 안드로이드 뒤로 가기)로도 닫는다.
 * 바텀 시트는 하나만: 타워 정보 패널·고르기 창과 겹치지 않게 Game 장면이 서로 닫는다.
 */
import { h } from '../dom';
import type { UiView } from '../root';
import { uiIcon, type UiIconId } from '../uiIcons';

/** 시트 제목 앞 이모지 → V2 아이콘 (ART-2, 하단 메뉴와 같은 그림) */
const SHEET_TITLE_ICONS: Readonly<Record<string, UiIconId>> = {
  '🎰': 'hud-gamble',
  '⚔': 'hud-challenge',
  '📋': 'hud-mission',
  '💠': 'hud-limited',
  '⬆': 'hud-upgrade',
  '✨': 'hud-summon',
};

export type SheetSize = 'half' | 'full';

/** 크기마다 시트 위쪽 끝 (무대 높이 비율): 55% = 위에서 45%, 85% = 위에서 15% */
export const SHEET_TOP_RATIO: Readonly<Record<SheetSize, number>> = { half: 0.45, full: 0.15 };
/** 끌어서 크기를 바꾸는 최소 거리 (무대 높이 비율) */
export const SHEET_DRAG_RATIO = 0.06;
/** 이만큼 덜 움직이면 짧게 누름 (CSS px) */
const TAP_SLOP_PX = 6;

/** 끌기를 놓았을 때 다음 상태 (순수): 위로 충분히 → full, 아래로 충분히 → full이면 half, half면 닫기. 짧은 누름은 뒤집기. */
export function sheetDragResult(size: SheetSize, dyPx: number, stageHeightPx: number): SheetSize | 'close' {
  if (Math.abs(dyPx) < TAP_SLOP_PX) return size === 'half' ? 'full' : 'half';
  const need = stageHeightPx * SHEET_DRAG_RATIO;
  if (dyPx <= -need) return 'full';
  if (dyPx >= need) return size === 'full' ? 'half' : 'close';
  return size;
}

export interface SheetTab<T extends string> {
  id: T;
  label: string;
}

export interface BottomSheetOptions<T extends string> {
  kind: string;
  title: string;
  /** 탭 (없으면 탭 줄 없음) */
  tabs?: readonly SheetTab<T>[];
  /** 처음 고른 탭 */
  tab?: T;
  onTab?: (id: T) => void;
  onClose: () => void;
  size?: SheetSize;
}

export interface BottomSheetView<T extends string> extends UiView {
  readonly kind: string;
  /** 머리줄 오른쪽 (✕ 앞)에 놓을 자리 — 강화 시트의 '⚡×2.6', 미션 시트의 [모두 받기] */
  readonly extra: HTMLElement;
  /** 내용 영역 (스크롤) */
  readonly body: HTMLElement;
  readonly size: SheetSize;
  readonly tab: T | null;
  setSize(size: SheetSize): void;
  setTab(id: T): void;
  /** 탭 이름 바꾸기 */
  setTabLabel(id: T, label: string): void;
}

export function createBottomSheet<T extends string>(opts: BottomSheetOptions<T>): BottomSheetView<T> {
  let size: SheetSize = opts.size ?? 'half';
  let tab: T | null = opts.tab ?? opts.tabs?.[0]?.id ?? null;
  const extra = h('div', { class: 'bs-extra' });
  const close = h(
    'button',
    {
      class: 'btn bs-close',
      attrs: { type: 'button', 'aria-label': '닫기', 'data-testid': 'sheet-close' },
      on: { click: () => opts.onClose() },
    },
    uiIcon('ui-close'),
  );
  const grip = h('div', { class: 'bs-grip', attrs: { 'data-testid': 'sheet-grip', 'aria-hidden': 'true' } }, h('span', { class: 'bs-grip-bar' }));
  // ART-2: 제목 앞 이모지가 V2 아이콘이 있는 메뉴(🎰 도박·⚔ 도전·📋 미션·💠 리미티드·⬆ 강화·✨ 소환)면 그림으로. aria-label은 제목 글자 그대로
  const [titleGlyph, ...titleRest] = opts.title.split(' ');
  const titleIcon = titleRest.length > 0 ? SHEET_TITLE_ICONS[titleGlyph ?? ''] : undefined;
  const title = titleIcon
    ? h('div', { class: 'bs-title' }, uiIcon(titleIcon, { className: 'bs-title-icon', fallback: titleGlyph }), titleRest.join(' '))
    : h('div', { class: 'bs-title', text: opts.title });
  const head = h('div', { class: 'bs-head' }, title, extra, close);
  const tabButtons = new Map<T, HTMLButtonElement>();
  const tabBar = opts.tabs?.length
    ? h(
        'div',
        { class: 'bs-tabs', attrs: { role: 'tablist' } },
        ...opts.tabs.map((t) => {
          const b = h('button', {
            class: 'btn bs-tab',
            attrs: { type: 'button', role: 'tab', 'data-tab': t.id, 'data-testid': `sheet-tab-${t.id}` },
            text: t.label,
            on: { click: () => setTab(t.id) },
          });
          tabButtons.set(t.id, b);
          return b;
        }),
      )
    : null;
  const body = h('div', { class: 'bs-body' });
  const el = h(
    'div',
    { class: `bsheet is-${opts.kind}`, attrs: { role: 'dialog', 'aria-label': opts.title, 'data-testid': `sheet-${opts.kind}`, 'data-size': size } },
    grip,
    head,
    tabBar,
    body,
  );

  const applySize = (): void => {
    el.dataset.size = size;
    el.style.removeProperty('top');
  };
  const markTabs = (): void => {
    for (const [id, b] of tabButtons) {
      const on = id === tab;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    if (tab !== null) el.dataset.tab = tab;
  };
  function setTab(id: T): void {
    if (tab === id) return;
    tab = id;
    markTabs();
    body.scrollTop = 0;
    opts.onTab?.(id);
  }
  markTabs();

  // 손잡이·머리줄 끌기 (✕·머리줄 버튼 위에서 누른 것은 제외)
  let drag: { id: number; y0: number; top0: number; stageH: number } | null = null;
  const stageHeight = (): number => el.parentElement?.clientHeight ?? 0;
  const onDown = (ev: PointerEvent): void => {
    if ((ev.target as HTMLElement).closest('button')) return;
    const stageH = stageHeight();
    if (!(stageH > 0)) return;
    drag = { id: ev.pointerId, y0: ev.clientY, top0: el.offsetTop, stageH };
    try {
      (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    } catch {
      // 캡처 실패는 무시 (move가 밖으로 나가도 up은 받는다)
    }
    el.classList.add('is-dragging');
  };
  const onMove = (ev: PointerEvent): void => {
    if (!drag || ev.pointerId !== drag.id) return;
    const dy = ev.clientY - drag.y0;
    const minTop = drag.stageH * SHEET_TOP_RATIO.full;
    const top = Math.max(minTop, drag.top0 + dy);
    el.style.top = `${Math.round(top)}px`;
  };
  const onUp = (ev: PointerEvent): void => {
    if (!drag || ev.pointerId !== drag.id) return;
    const result = sheetDragResult(size, ev.clientY - drag.y0, drag.stageH);
    drag = null;
    el.classList.remove('is-dragging');
    if (result === 'close') {
      opts.onClose();
      return;
    }
    size = result;
    applySize();
  };
  for (const target of [grip, head]) {
    target.addEventListener('pointerdown', onDown);
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  }
  // Escape(안드로이드 뒤로 가기 자리)로 닫기 — 타워 정보 패널과 같게 (M5 검토 반영)
  const onKey = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') opts.onClose();
  };
  window.addEventListener('keydown', onKey);

  return {
    el,
    kind: opts.kind,
    extra,
    body,
    get size() {
      return size;
    },
    get tab() {
      return tab;
    },
    setSize(s) {
      size = s;
      applySize();
    },
    setTab,
    setTabLabel(id, label) {
      const b = tabButtons.get(id);
      if (b && b.textContent !== label) b.textContent = label;
    },
    destroy() {
      window.removeEventListener('keydown', onKey);
    },
  };
}
