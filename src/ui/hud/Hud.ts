/**
 * 게임 HUD (DOM, UI.md 4.1·4.2, DEV_PLAN M1-8).
 *
 * 1줄: 단계(보스 단계는 👑) · ⏱ 단계 남은 시간 · 👾 몹 수/한도(무한) 또는 ❤ 목숨(캠페인) · [⏭ debug] · ⏸
 * 2줄: 💰 돈 · 배속
 * 보스 단계에는 아래에 보스 배너.
 *
 * 값 계산은 hudModel.ts(순수 함수, 단위 테스트)에서 하고, 여기서는 바뀐 글자만 DOM에 쓴다.
 * HUD는 sim을 읽기만 한다. 배속은 화면 설정(TickClock), 단계 건너뛰기(debug)는 명령으로 보낸다.
 * 루트의 data-tick 속성 = 지금 틱 (E2E가 게임 시간이 흐르는지 볼 때 쓴다, 화면에는 안 보임).
 */
import { h } from '../dom';
import type { UiView } from '../root';
import type { HudModel } from './hudModel';

export interface HudOptions {
  onSpeed: () => void;
  /** ⏸: 일시정지 메뉴를 연다 (바로 나가지 않는다) */
  onPause: () => void;
  /** ?debug=1 일 때만: 다음 단계로 건너뛰기 */
  onSkipStage?: () => void;
}

export interface HudView extends UiView {
  update(model: HudModel): void;
}

/** 게임 시간 표시: 0:00.0 형식 (디버그·기록용). */
export function formatGameTime(ms: number): string {
  const totalTenths = Math.floor(ms / 100);
  const tenths = totalTenths % 10;
  const totalSec = Math.floor(totalTenths / 10);
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60);
  return `${min}:${String(sec).padStart(2, '0')}.${tenths}`;
}

export function createHud(opts: HudOptions): HudView {
  // 초당 여러 번 바뀌는 값은 화면 읽기 프로그램이 저절로 읽지 않게 (aria-live off, 시간은 role=timer)
  const off = { 'aria-live': 'off' };
  const stageEl = h('span', { class: 'hud-stage', attrs: { 'data-testid': 'hud-stage', ...off }, text: '준비' });
  const timerEl = h('span', {
    class: 'hud-value',
    attrs: { 'data-testid': 'hud-timer', role: 'timer', 'aria-label': '단계 남은 시간', ...off },
    text: '1:00',
  });
  const countIcon = h('span', { class: 'hud-label', text: '👾', attrs: { 'aria-hidden': 'true' } });
  const countEl = h('span', { class: 'hud-value', attrs: { 'data-testid': 'hud-count', ...off }, text: '0' });
  const countItem = h('span', { class: 'hud-item hud-count' }, countIcon, countEl);
  const goldEl = h('span', { class: 'hud-value hud-gold', attrs: { 'data-testid': 'hud-gold', ...off }, text: '0원' });
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
  const skipBtn = opts.onSkipStage
    ? h('button', {
        class: 'btn btn-chip hud-skip',
        attrs: { type: 'button', 'data-action': 'skip-stage', 'aria-label': '단계 건너뛰기 (디버그)' },
        text: '⏭',
        on: { click: () => opts.onSkipStage?.() },
      })
    : null;
  const bannerEl = h('div', { class: 'hud-banner', attrs: { 'data-testid': 'hud-boss', hidden: '' } });

  const el = h(
    'div',
    { class: 'hud', attrs: { 'data-screen': 'game', 'data-tick': '0' } },
    h(
      'div',
      { class: 'hud-row' },
      stageEl,
      h('span', { class: 'hud-item' }, h('span', { class: 'hud-label', text: '⏱', attrs: { 'aria-hidden': 'true' } }), timerEl),
      countItem,
      h('span', { class: 'hud-spacer' }),
      skipBtn,
      pauseBtn,
    ),
    h(
      'div',
      { class: 'hud-row' },
      h('span', { class: 'hud-item' }, h('span', { class: 'hud-label', text: '💰', attrs: { 'aria-hidden': 'true' } }), goldEl),
      h('span', { class: 'hud-spacer' }),
      speedBtn,
    ),
    bannerEl,
  );

  let last: Partial<HudModel> = {};
  const setText = (node: HTMLElement, key: keyof HudModel, value: string): void => {
    if (last[key] !== value) node.textContent = value;
  };
  return {
    el,
    update(m) {
      if (last.tick !== m.tick) el.dataset.tick = String(m.tick);
      if (last.stage !== m.stage || last.boss !== m.boss) {
        stageEl.textContent = m.boss ? `👑 ${m.stage}` : m.stage;
        stageEl.classList.toggle('is-boss', m.boss);
      }
      setText(timerEl, 'timer', m.timer);
      if (last.timerWarn !== m.timerWarn) timerEl.classList.toggle('is-warn', m.timerWarn);
      if (last.countKind !== m.countKind) {
        countIcon.textContent = m.countKind === 'lives' ? '❤' : '👾';
        countEl.setAttribute('aria-label', m.countKind === 'lives' ? '목숨' : '맵 위 몹 수');
      }
      setText(countEl, 'count', m.count);
      if (last.countWarn !== m.countWarn) countItem.classList.toggle('is-danger', m.countWarn);
      setText(goldEl, 'gold', m.gold);
      setText(speedBtn, 'speed', m.speed);
      if (last.bossBanner !== m.bossBanner) {
        if (m.bossBanner) {
          bannerEl.textContent = m.bossBanner;
          bannerEl.hidden = false;
        } else bannerEl.hidden = true;
      }
      last = { ...m };
    },
  };
}
