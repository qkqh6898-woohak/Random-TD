/**
 * 게임 HUD (DOM). M0: 틱·게임 시간·배속 버튼·⏸(일시정지 메뉴, UI.md 4.2).
 * 단계·타이머·몹 수·목숨·돈(M1~M2)은 이 컴포넌트에 칸을 추가해 붙인다.
 * HUD는 값을 읽어 보여주기만 한다. 배속은 화면 설정(TickClock)이라 직접 바꾼다.
 */
import { h } from '../dom';
import type { UiView } from '../root';

export interface HudState {
  tick: number;
  elapsedMs: number;
  speed: number;
}

export interface HudOptions {
  onSpeed: () => void;
  /** ⏸: 일시정지 메뉴를 연다 (바로 나가지 않는다) */
  onPause: () => void;
}

export interface HudView extends UiView {
  update(state: HudState): void;
}

/** 게임 시간 표시: 0:00.0 형식. */
export function formatGameTime(ms: number): string {
  const totalTenths = Math.floor(ms / 100);
  const tenths = totalTenths % 10;
  const totalSec = Math.floor(totalTenths / 10);
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60);
  return `${min}:${String(sec).padStart(2, '0')}.${tenths}`;
}

export function createHud(opts: HudOptions): HudView {
  // 초당 20번 바뀌는 값이라 화면 읽기 프로그램이 저절로 읽지 않게 한다 (aria-live off, 시간은 role=timer)
  const tickEl = h('span', { class: 'hud-value', attrs: { 'data-testid': 'hud-tick', 'aria-live': 'off' }, text: '0' });
  const timeEl = h('span', {
    class: 'hud-value',
    attrs: { 'data-testid': 'hud-time', role: 'timer', 'aria-live': 'off', 'aria-label': '게임 시간' },
    text: '0:00.0',
  });
  const speedBtn = h('button', {
    class: 'btn btn-chip hud-speed',
    attrs: { type: 'button', 'data-action': 'speed', 'aria-label': '배속' },
    text: '×1',
    on: { click: () => opts.onSpeed() },
  });
  const pauseBtn = h('button', {
    class: 'btn btn-chip hud-pause',
    attrs: { type: 'button', 'data-action': 'pause', 'aria-label': '일시정지' },
    text: '⏸',
    on: { click: () => opts.onPause() },
  });
  const el = h(
    'div',
    { class: 'hud', attrs: { 'data-screen': 'game' } },
    h(
      'div',
      { class: 'hud-row' },
      h('span', { class: 'hud-item' }, h('span', { class: 'hud-label', text: '⏱' }), timeEl),
      h('span', { class: 'hud-item hud-tick' }, h('span', { class: 'hud-label', text: '틱' }), tickEl),
      h('span', { class: 'hud-spacer' }),
      speedBtn,
      pauseBtn,
    ),
  );

  let last: HudState = { tick: -1, elapsedMs: -1, speed: -1 };
  return {
    el,
    update(state) {
      if (state.tick !== last.tick) {
        tickEl.textContent = String(state.tick);
        timeEl.textContent = formatGameTime(state.elapsedMs);
      }
      if (state.speed !== last.speed) speedBtn.textContent = `×${state.speed}`;
      last = { ...state };
    },
  };
}
