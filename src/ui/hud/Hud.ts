/**
 * 게임 HUD (DOM, UI.md 4.1·4.2, DEV_PLAN M1-8).
 *
 * 1줄: 단계(보스 단계는 👑) · ⏱ 단계 남은 시간 · 👾 몹 수/한도(무한) 또는 ❤ 목숨(캠페인) · ⏸
 * 2줄: 💰 돈 · [💰+ debug] · [⏭ debug] · 배속
 * 그 아래: 보스 막대 자리 (UI.md 4.1 '보스가 있을 때만'). 자리는 늘 비워 두고 보스 단계에만 보인다
 *   → 보스 단계가 와도 HUD 높이가 그대로라 맵이 밀리거나 가려지지 않는다. 맵 위쪽 끝은 Game 장면이 이 높이를 재서 정한다.
 *
 * 터치: HUD 띠 자체는 터치를 통과시키고(pointer-events: none) 버튼만 받는다 → HUD가 캔버스(맵 칸) 터치를 막지 않는다.
 * 경고 (UI.md 4.2): 남은 10초 이하 노란색 / 몹 120 이상 빨간색 깜빡 + 화면 가장자리 붉은 테두리 /
 *   목숨 5 이하 빨간색(깜빡이지 않음), 목숨이 줄 때마다 하트가 깨지는 연출.
 *
 * 아래 띠 (M2): 🗼 놓인 타워 수/배치 칸 수 · 소환 안내 · [⬆ 승급 가능 n](M3, 누르면 그 타워의 정보 패널).
 *   맵 아래쪽 끝은 Game 장면이 이 띠의 위쪽 끝을 재서 정한다.
 * 돈이 들어오면 (동전이 도착하면) 돈 글자가 반짝이고 '+n원'이 떠오른다 (UI.md 4.2).
 *
 * 값 계산은 hudModel.ts(순수 함수, 단위 테스트)에서 하고, 여기서는 바뀐 글자만 DOM에 쓴다.
 * HUD는 sim을 읽기만 한다. 배속은 화면 설정(TickClock), 돈 추가·단계 건너뛰기(debug)는 명령으로 보낸다.
 * 루트의 data-tick 속성 = 지금 틱 (E2E가 게임 시간이 흐르는지 볼 때 쓴다, 화면에는 안 보임).
 */
import { h } from '../dom';
import type { UiView } from '../root';
import { livesDropped, withCommas, type HudModel } from './hudModel';

/** 하트 깨짐 연출 길이 (ms) — styles.css `heart-break`와 같게 */
export const HEART_BREAK_MS = 600;
/** 돈 '+n원' 떠오름 길이 (ms) — styles.css `gold-gain`과 같게. 이 안에 또 들어오면 숫자를 합친다 */
export const GOLD_GAIN_MS = 700;

export interface HudOptions {
  onSpeed: () => void;
  /** ⏸: 일시정지 메뉴를 연다 (바로 나가지 않는다) */
  onPause: () => void;
  /** ?debug=1 일 때만: 다음 단계로 건너뛰기 */
  onSkipStage?: () => void;
  /** ?debug=1 일 때만: 돈 추가 (CLAUDE.md 4장 개발용 치트) */
  onAddGold?: () => void;
  /** 아래 띠 '⬆ 승급 가능 n': 승급할 수 있는 타워를 골라 정보 패널을 연다 (M3) */
  onMergeReady?: () => void;
}

export interface HudView extends UiView {
  /** 위쪽 HUD 띠 (2줄 + 보스 막대 자리). 크기가 바뀌면 맵 배치를 다시 한다 */
  readonly band: HTMLElement;
  /** HUD 띠 아래 끝 = 무대 위쪽에서 잰 CSS px */
  bandBottom(): number;
  /** 아래 띠 (타워 수·소환 안내). 크기가 바뀌면 맵 배치를 다시 한다 */
  readonly bottomBand: HTMLElement;
  /** 아래 띠 위쪽 끝 = 무대 위쪽에서 잰 CSS px */
  bottomTop(): number;
  /** 돈 글자 가운데 (무대 기준 CSS px) — 동전이 날아갈 곳 */
  goldAnchor(): { x: number; y: number };
  /** 돈이 들어옴: 돈 글자 반짝 + '+n원' (짧은 사이에 여러 번이면 합친다) */
  gainGold(amount: number): void;
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
  const countIcon = h('span', {
    class: 'hud-label hud-count-icon',
    text: '👾',
    attrs: { 'aria-hidden': 'true', 'data-testid': 'hud-count-icon' },
  });
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
  // debug 전용 ⏭는 2줄(배속 옆)에 둔다: 1줄에 넣으면 보스 배지·세 자리 몹 수와 함께 넘쳐 ⏸가 잘린다
  const skipBtn = opts.onSkipStage
    ? h('button', {
        class: 'btn btn-chip hud-skip',
        attrs: { type: 'button', 'data-action': 'skip-stage', 'aria-label': '단계 건너뛰기 (디버그)' },
        text: '⏭',
        on: { click: () => opts.onSkipStage?.() },
      })
    : null;
  const addGoldBtn = opts.onAddGold
    ? h('button', {
        class: 'btn btn-chip hud-add-gold',
        attrs: { type: 'button', 'data-action': 'add-gold', 'aria-label': '돈 추가 (디버그)' },
        text: '💰+',
        on: { click: () => opts.onAddGold?.() },
      })
    : null;
  // 보스 막대 자리: 숨길 때도 자리는 남긴다 (visibility). 빈 글자면 높이가 줄어드니 공백 하나
  const bannerEl = h('div', { class: 'hud-banner', attrs: { 'data-testid': 'hud-boss', hidden: '' }, text: ' ' });
  // 화면 가장자리 붉은 테두리 (몹 120 이상, 무한)
  const edgeEl = h('div', { class: 'hud-edge', attrs: { 'aria-hidden': 'true', 'data-testid': 'hud-edge' } });
  // 돈 '+n원' (돈 글자 옆에서 떠오름)
  const gainEl = h('span', { class: 'hud-gold-gain', attrs: { 'data-testid': 'hud-gold-gain', 'aria-hidden': 'true' } });
  const goldItem = h(
    'span',
    { class: 'hud-item hud-gold-item' },
    h('span', { class: 'hud-label', text: '💰', attrs: { 'aria-hidden': 'true' } }),
    goldEl,
    gainEl,
  );
  // 아래 띠: 타워 수 · 소환 안내
  const towersEl = h('span', { class: 'hud-value', attrs: { 'data-testid': 'hud-towers', 'aria-label': '놓인 타워 수', ...off }, text: '0/0' });
  const hintEl = h('span', { class: 'hud-hint', attrs: { 'data-testid': 'hud-hint', ...off }, text: '' });
  const mergeReadyBtn = h('button', {
    class: 'btn btn-chip hud-merge-ready',
    attrs: { type: 'button', 'data-action': 'merge-ready', 'data-testid': 'hud-merge-ready', hidden: '' },
    text: '',
    on: { click: () => opts.onMergeReady?.() },
  });
  const bottomBand = h(
    'div',
    { class: 'hud-bottom' },
    h('span', { class: 'hud-item hud-towers' }, h('span', { class: 'hud-label', text: '🗼', attrs: { 'aria-hidden': 'true' } }), towersEl),
    hintEl,
    mergeReadyBtn,
  );

  const band = h(
    'div',
    { class: 'hud' },
    h(
      'div',
      { class: 'hud-bar' },
      h(
        'div',
        { class: 'hud-row' },
        stageEl,
        h('span', { class: 'hud-item' }, h('span', { class: 'hud-label', text: '⏱', attrs: { 'aria-hidden': 'true' } }), timerEl),
        countItem,
        h('span', { class: 'hud-spacer' }),
        pauseBtn,
      ),
      h(
        'div',
        { class: 'hud-row' },
        goldItem,
        h('span', { class: 'hud-spacer' }),
        addGoldBtn,
        skipBtn,
        speedBtn,
      ),
    ),
    bannerEl,
  );
  const el = h('div', { class: 'hud-root', attrs: { 'data-screen': 'game', 'data-tick': '0' } }, edgeEl, band, bottomBand);

  let last: Partial<HudModel> = {};
  let breakTimer: ReturnType<typeof setTimeout> | undefined;
  let gainTimer: ReturnType<typeof setTimeout> | undefined;
  let gainSum = 0;
  const breakHeart = (): void => {
    countIcon.textContent = '💔';
    countIcon.classList.remove('is-break');
    void countIcon.offsetWidth; // 연달아 줄어도 애니메이션을 처음부터 다시
    countIcon.classList.add('is-break');
    clearTimeout(breakTimer);
    breakTimer = setTimeout(() => {
      breakTimer = undefined;
      countIcon.classList.remove('is-break');
      countIcon.textContent = last.countKind === 'lives' ? '❤' : '👾';
    }, HEART_BREAK_MS);
  };
  const setText = (node: HTMLElement, key: keyof HudModel, value: string): void => {
    if (last[key] !== value) node.textContent = value;
  };
  return {
    el,
    band,
    bandBottom() {
      return band.getBoundingClientRect().bottom - el.getBoundingClientRect().top;
    },
    bottomBand,
    bottomTop() {
      return bottomBand.getBoundingClientRect().top - el.getBoundingClientRect().top;
    },
    goldAnchor() {
      const r = goldEl.getBoundingClientRect();
      const root = el.getBoundingClientRect();
      return { x: r.left + Math.min(r.width, 40) / 2 - root.left, y: r.top + r.height / 2 - root.top };
    },
    gainGold(amount) {
      if (!(amount > 0)) return;
      gainSum = gainTimer === undefined ? amount : gainSum + amount;
      gainEl.textContent = `+${withCommas(gainSum)}원`;
      gainEl.classList.remove('is-on');
      goldEl.classList.remove('is-gain');
      void gainEl.offsetWidth; // 애니메이션을 처음부터 다시
      gainEl.classList.add('is-on');
      goldEl.classList.add('is-gain');
      clearTimeout(gainTimer);
      gainTimer = setTimeout(() => {
        gainTimer = undefined;
        gainSum = 0;
        gainEl.classList.remove('is-on');
        goldEl.classList.remove('is-gain');
      }, GOLD_GAIN_MS);
    },
    update(m) {
      if (last.tick !== m.tick) el.dataset.tick = String(m.tick);
      if (last.stage !== m.stage || last.boss !== m.boss) {
        stageEl.textContent = m.boss ? `👑 ${m.stage}` : m.stage;
        stageEl.classList.toggle('is-boss', m.boss);
      }
      setText(timerEl, 'timer', m.timer);
      if (last.timerWarn !== m.timerWarn) timerEl.classList.toggle('is-warn', m.timerWarn);
      const dropped = livesDropped(last, m);
      if (last.countKind !== m.countKind) {
        countIcon.textContent = m.countKind === 'lives' ? '❤' : '👾';
        countIcon.classList.toggle('hud-heart', m.countKind === 'lives');
        countEl.setAttribute('aria-label', m.countKind === 'lives' ? '목숨' : '맵 위 몹 수');
      }
      setText(countEl, 'count', m.count);
      if (last.countWarn !== m.countWarn) countItem.classList.toggle('is-danger', m.countWarn);
      if (last.countBlink !== m.countBlink) countItem.classList.toggle('is-blink', m.countBlink);
      if (last.edgeWarn !== m.edgeWarn) edgeEl.classList.toggle('is-on', m.edgeWarn);
      setText(goldEl, 'gold', m.gold);
      setText(towersEl, 'towers', m.towers);
      setText(hintEl, 'summonHint', m.summonHint);
      if (last.summonAffordable !== m.summonAffordable) hintEl.classList.toggle('is-short', !m.summonAffordable);
      if (last.mergeReady !== m.mergeReady) {
        mergeReadyBtn.textContent = m.mergeReady;
        mergeReadyBtn.hidden = m.mergeReady === '';
      }
      setText(speedBtn, 'speed', m.speed);
      if (last.bossBanner !== m.bossBanner) {
        if (m.bossBanner) {
          bannerEl.textContent = m.bossBanner;
          bannerEl.hidden = false;
        } else bannerEl.hidden = true;
      }
      last = { ...m };
      if (dropped) breakHeart();
    },
    destroy() {
      clearTimeout(breakTimer);
      breakTimer = undefined;
      clearTimeout(gainTimer);
      gainTimer = undefined;
    },
  };
}
