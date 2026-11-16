/**
 * 게임 HUD (DOM, UI.md 4.1·4.2, DEV_PLAN M1-8).
 *
 * 1줄: 단계(보스 단계는 👑) · ⏱ 단계 남은 시간 · 👾 몹 수/한도(무한) 또는 ❤ 목숨(캠페인) · ⏸
 * 2줄: 💰 돈 · 👷 일꾼 수/최대 (M4, 최대면 금색) · [💰+ 개발자] · [⏭ 개발자: 다음 단계로 즉시 이동] · 배속(개발자 ×16까지)
 * 그 아래: 보스 막대 자리 (UI.md 4.1 '보스가 있을 때만'). 자리는 늘 비워 두고 보스 단계에만 보인다
 *   → 보스 단계가 와도 HUD 높이가 그대로라 맵이 밀리거나 가려지지 않는다. 맵 위쪽 끝은 Game 장면이 이 높이를 재서 정한다.
 *   M4: 막대 = 군단·계급 이름표 「보스 이름」 + 체력만큼 채운 띠 + 남은 초 (10초 이하 빨간 깜빡). 보스를 잡으면 '보스 처치!'.
 *
 * 터치: HUD 띠 자체는 터치를 통과시키고(pointer-events: none) 버튼만 받는다 → HUD가 캔버스(맵 칸) 터치를 막지 않는다.
 * 경고 (UI.md 4.2): 남은 10초 이하 노란색 / 몹 120 이상 빨간색 깜빡 + 화면 가장자리 붉은 테두리 /
 *   목숨 5 이하 빨간색(깜빡이지 않음), 목숨이 줄 때마다 하트가 깨지는 연출.
 *
 * 아래 띠 (M2): 🗼 놓인 타워 수/배치 칸 수 · 소환 안내 · [👷 300원](M4 일꾼 고용) · [⬆ 승급 가능 n](M3, 누르면 그 타워의 정보 패널).
 *   맵 아래쪽 끝은 Game 장면이 이 띠의 위쪽 끝을 재서 정한다.
 *   M4 검토 반영: 접은 고르기 창의 [🃏 카드 고르기] 알약은 타워 수 옆 자리(choiceSlot)에 들어간다 — 맵 위에 떠 있으면
 *   배치 칸 3개를 덮어 소환 탭을 가로챘다. 알약이 보이는 동안 소환 안내는 숨긴다(CSS).
 * 돈이 들어오면 (동전이 도착하면) 돈 글자가 반짝이고 '+n원'이 떠오른다 (UI.md 4.2).
 * M5: 아래 띠 아래에 하단 메뉴 (UI.md 4.1): [⚔ 도전 · 1 가능] [⬆ 강화 · Lv 5] [📋 미션 · 2 받기] — 누르면 바텀 시트 (onMenu),
 *   열린 시트의 메뉴는 강조. 보스 막대 자리는 도전 보스 막대와 같이 쓴다: 하나만 있으면 그것이 자리를 다 쓰고,
 *   보스와 도전이 겹치면 반씩 두 줄 (UI.md 9장 '체력바 2줄') — 자리 높이는 그대로라 맵이 움직이지 않는다.
 *
 * 값 계산은 hudModel.ts(순수 함수, 단위 테스트)에서 하고, 여기서는 바뀐 글자만 DOM에 쓴다.
 * HUD는 sim을 읽기만 한다. 배속은 화면 설정(TickClock), 돈 추가·단계 건너뛰기(debug)는 명령으로 보낸다.
 * 루트의 data-tick 속성 = 지금 틱 (E2E가 게임 시간이 흐르는지 볼 때 쓴다, 화면에는 안 보임).
 */
import { h } from '../dom';
import { HOLD_DELAY_MS, attachHoldRepeat, skipRepeatDelay, type HoldHandle } from '../hold';
import type { UiView } from '../root';
import { livesDropped, withCommas, type HudModel } from './hudModel';
import type { SheetKind } from '../sheets/sheetModels';

/** 하트 깨짐 연출 길이 (ms) — styles.css `heart-break`와 같게 */
export const HEART_BREAK_MS = 600;
/** 돈 '+n원' 떠오름 길이 (ms) — styles.css `gold-gain`과 같게. 이 안에 또 들어오면 숫자를 합친다 */
export const GOLD_GAIN_MS = 700;

export interface HudOptions {
  onSpeed: () => void;
  /** ⏸: 일시정지 메뉴를 연다 (바로 나가지 않는다) */
  onPause: () => void;
  /** 개발자 모드만 (src/devMode.ts): ⏭ 다음 단계로 즉시 이동 (길게 누르면 초당 4번) */
  onSkipStage?: () => void;
  /** 개발자 모드만: 돈 추가 (CLAUDE.md 4장 개발용 치트) */
  onAddGold?: () => void;
  /** 아래 띠 '⬆ 승급 가능 n': 승급할 수 있는 타워를 골라 정보 패널을 연다 (M3) */
  onMergeReady?: () => void;
  /** 아래 띠 '👷 300원': 일꾼 고용 (M4) */
  onHire?: () => void;
  /** 하단 메뉴 (M5): 도전·강화·미션 바텀 시트 열기/닫기 */
  onMenu?: (kind: SheetKind) => void;
  /** 하단 메뉴 넷째 칸 [🛠 개발] (T-2, 개발자 모드만) */
  devMenu?: boolean;
  /**
   * 아래 띠 [🎲 소환 100원] (T-2): 짧게 누르면 자동 칸에 하나, 꾹 누르면 계속. 한 번 소환(또는 앞 명령 기다림)이면 true,
   * 돈 부족·빈 칸 없음이면 false (꾹 누르기 멈춤)
   */
  onSummon?: () => boolean;
  /** 꾹 눌러 연속 소환 간격 (ms) — 연출 끄기면 더 빠르다 */
  summonInterval?: () => number;
  /** [▶ 준비 완료] (F10): 준비 단계에서 1단계를 바로 시작 (Game이 readyNow 명령을 보낸다) */
  onReady?: () => void;
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
  /** 하단 메뉴 (M5) */
  readonly menuBar: HTMLElement;
  /** 하단 메뉴 위쪽 끝 = 무대 위쪽에서 잰 CSS px (바텀 시트 아래 끝) */
  menuTop(): number;
  /** 열린 시트의 메뉴 강조 (없으면 null) */
  setMenuActive(kind: SheetKind | null): void;
  /** 아래 띠 안 고르기 창 알약 자리 (ChoicePanel이 알약을 여기에 넣는다, M4 검토 반영) */
  readonly choiceSlot: HTMLElement;
  /** 돈 글자 가운데 (무대 기준 CSS px) — 동전이 날아갈 곳 */
  goldAnchor(): { x: number; y: number };
  /**
   * 돈이 들어옴: 돈 글자 반짝 + '+n원' (짧은 사이에 여러 번이면 합친다).
   * 같은 프레임에 여러 번 불려도 DOM은 다음 update()에서 한 번만 바꾼다 (높은 배속에 동전이 몰려도 강제 레이아웃 한 번, T-1).
   */
  gainGold(amount: number): void;
  update(model: HudModel): void;
  /** [▶ 준비 완료] 상태 (F10): hidden · ready · sent(눌렀고 시작을 기다림 — 다시 눌러도 아무 일 없음) */
  setReady(state: 'hidden' | 'ready' | 'sent'): void;
  /** 첫 승급 안내 (F10): [⬆ 승급 가능] 버튼을 반짝여 강조 */
  setMergeGuide(on: boolean): void;
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
  // 개발자 전용 ⏭는 2줄(배속 옆)에 둔다: 1줄에 넣으면 보스 배지·세 자리 몹 수와 함께 넘쳐 ⏸가 잘린다
  // 누를 때마다 다음 단계가 바로 시작되고, 길게 누르면 초당 4번 (T-1)
  const skipBtn = opts.onSkipStage
    ? h('button', {
        class: 'btn btn-chip hud-skip',
        attrs: { type: 'button', 'data-action': 'skip-stage', 'aria-label': '다음 단계로 즉시 이동', title: '다음 단계로 즉시 이동 (길게 누르면 계속)' },
        text: '⏭',
      })
    : null;
  let skipHold: HoldHandle | null = null;
  if (skipBtn) {
    skipHold = attachHoldRepeat(
      skipBtn,
      () => {
        opts.onSkipStage?.();
        return true;
      },
      { delay: skipRepeatDelay },
    );
  }
  const addGoldBtn = opts.onAddGold
    ? h('button', {
        class: 'btn btn-chip hud-add-gold',
        attrs: { type: 'button', 'data-action': 'add-gold', 'aria-label': '돈 추가 (디버그)' },
        text: '💰+',
        on: { click: () => opts.onAddGold?.() },
      })
    : null;
  // 보스 막대 자리: 숨길 때도 자리는 남긴다 (visibility). 빈 글자면 높이가 줄어드니 공백 하나
  // 채움(체력) → 이름표 글자 → 남은 초 순서로 겹친다 (막대 전체가 체력 바)
  const bannerFill = h('div', { class: 'hud-banner-fill', attrs: { 'data-testid': 'hud-boss-hp', 'aria-hidden': 'true' } });
  const bannerText = h('span', { class: 'hud-banner-text', attrs: { 'data-testid': 'hud-boss-name' }, text: ' ' });
  const bannerTime = h('span', { class: 'hud-banner-time', attrs: { 'data-testid': 'hud-boss-time', role: 'timer', 'aria-live': 'off' }, text: '' });
  // 일꾼 (2줄): 👷 3/10
  const workersEl = h('span', { class: 'hud-value', attrs: { 'data-testid': 'hud-workers', 'aria-label': '일꾼 수', ...off }, text: '0/0' });
  const workersItem = h('span', { class: 'hud-item hud-workers' }, h('span', { class: 'hud-label', text: '👷', attrs: { 'aria-hidden': 'true' } }), workersEl);
  const bannerEl = h('div', { class: 'hud-banner', attrs: { 'data-testid': 'hud-boss', hidden: '' } }, bannerFill, bannerText, bannerTime);
  // 도전 보스 막대 (M5): 보스 막대와 같은 자리
  const chalFill = h('div', { class: 'hud-banner-fill', attrs: { 'data-testid': 'hud-challenge-hp', 'aria-hidden': 'true' } });
  const chalText = h('span', { class: 'hud-banner-text', attrs: { 'data-testid': 'hud-challenge-name' }, text: ' ' });
  const chalTime = h('span', { class: 'hud-banner-time', attrs: { 'data-testid': 'hud-challenge-time', role: 'timer', 'aria-live': 'off' }, text: '' });
  const chalEl = h('div', { class: 'hud-banner hud-banner-challenge has-hp', attrs: { 'data-testid': 'hud-challenge', hidden: '' } }, chalFill, chalText, chalTime);
  // [▶ 준비 완료] (F10): 보스 막대 자리를 같이 쓴다 (준비 단계엔 보스가 없다). 누르는 영역은 위아래로 넓혀 44px 이상 (CSS ::after)
  const readyBtn = h('button', {
    class: 'btn hud-ready',
    attrs: { type: 'button', 'data-testid': 'hud-ready', 'data-action': 'ready', 'aria-label': '준비 완료 — 1단계 바로 시작', hidden: '' },
    text: '▶ 준비 완료 · 바로 시작',
    on: { click: () => opts.onReady?.() },
  });
  // F10-2: 보스 막대 아래 짧은 표시 (박쥐 여왕 비행 중). 자리를 차지하지 않게 막대 자리 밑에 겹쳐 띄운다 (HUD 높이·맵 위치 그대로)
  const bossNoteEl = h('div', { class: 'hud-boss-note', attrs: { 'data-testid': 'hud-boss-note', role: 'status', hidden: '' }, text: '' });
  const bannerSlot = h('div', { class: 'hud-banner-slot', attrs: { 'data-testid': 'hud-banner-slot' } }, bannerEl, chalEl, readyBtn, bossNoteEl);
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
  // [🎲 소환 100원] (T-2): 짧게 = 자동 칸에 하나, 꾹 = 계속 (초당 약 4번). 승급 가능 버튼이 보이면 '소환' 글자는 숨긴다 (CSS)
  const summonCost = h('span', { class: 'hud-summon-cost', text: '' });
  const summonBtn = h(
    'button',
    {
      class: 'btn btn-chip hud-summon',
      attrs: { type: 'button', 'data-action': 'summon', 'data-testid': 'hud-summon', 'aria-label': '소환 (꾹 누르면 연속)' },
    },
    h('span', { class: 'hud-summon-die', attrs: { 'aria-hidden': 'true' }, text: '🎲' }),
    h('span', { class: 'hud-summon-word', text: '소환' }),
    summonCost,
  );
  const summonHold: HoldHandle | null = opts.onSummon
    ? attachHoldRepeat(summonBtn, () => opts.onSummon?.() ?? false, {
        delay: (n) => (n <= 0 ? HOLD_DELAY_MS : (opts.summonInterval?.() ?? 250)),
      })
    : null;
  if (!opts.onSummon) summonBtn.hidden = true;
  const mergeReadyBtn = h('button', {
    class: 'btn btn-chip hud-merge-ready',
    attrs: { type: 'button', 'data-action': 'merge-ready', 'data-testid': 'hud-merge-ready', hidden: '' },
    text: '',
    on: { click: () => opts.onMergeReady?.() },
  });
  const hireBtn = h('button', {
    class: 'btn btn-chip hud-hire',
    attrs: { type: 'button', 'data-action': 'hire', 'data-testid': 'hud-hire', 'aria-label': '일꾼 고용' },
    text: '👷',
    on: { click: () => opts.onHire?.() },
  });
  // 접은 고르기 창의 알약 자리 (display: contents → 알약이 아래 띠의 flex 항목이 된다)
  const choiceSlot = h('span', { class: 'hud-choice-slot', attrs: { 'data-testid': 'hud-choice-slot' } });
  const bottomBand = h(
    'div',
    { class: 'hud-bottom' },
    h('span', { class: 'hud-item hud-towers' }, h('span', { class: 'hud-label', text: '🗼', attrs: { 'aria-hidden': 'true' } }), towersEl),
    choiceSlot,
    hintEl,
    // [⬆ 승급 가능]은 소환 앞(왼쪽)에: 나타나거나 사라져도 [🎲 소환]·[👷 일꾼]의 오른쪽 끝 자리는 그대로 (F10-4 검토 —
    // 예전엔 맨 오른쪽에 붙어 소환·일꾼이 왼쪽으로 밀려, 소환을 연타하던 손가락이 300원 일꾼을 샀다)
    mergeReadyBtn,
    summonBtn,
    hireBtn,
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
        workersItem,
        h('span', { class: 'hud-spacer' }),
        addGoldBtn,
        skipBtn,
        speedBtn,
      ),
    ),
    bannerSlot,
  );
  // 하단 메뉴 (M5, UI.md 4.1): 메뉴 이름 + 배지 두 줄
  const menuBtns = new Map<SheetKind, { btn: HTMLButtonElement; badge: HTMLElement }>();
  const menuItem = (kind: SheetKind, icon: string, label: string): HTMLButtonElement => {
    const badge = h('span', { class: 'hud-menu-badge', attrs: { 'data-testid': `menu-badge-${kind}`, ...off } });
    const btn = h(
      'button',
      {
        class: `btn hud-menu-btn is-${kind}`,
        attrs: { type: 'button', 'data-testid': `menu-${kind}`, 'data-action': `menu-${kind}`, 'aria-label': label },
        on: { click: () => opts.onMenu?.(kind) },
      },
      h('span', { class: 'hud-menu-label' }, h('span', { class: 'hud-menu-icon', text: icon, attrs: { 'aria-hidden': 'true' } }), label),
      badge,
    );
    menuBtns.set(kind, { btn, badge });
    return btn;
  };
  const menuBar = h(
    'div',
    { class: 'hud-menu', attrs: { role: 'toolbar', 'aria-label': '하단 메뉴' } },
    menuItem('challenge', '⚔', '도전'),
    menuItem('upgrade', '⬆', '강화'),
    menuItem('mission', '📋', '미션'),
    opts.devMenu ? menuItem('dev', '🛠', '개발') : null,
  );
  const dock = h('div', { class: 'hud-dock' }, bottomBand, menuBar);
  const el = h('div', { class: 'hud-root', attrs: { 'data-screen': 'game', 'data-tick': '0' } }, edgeEl, band, dock);

  let last: Partial<HudModel> = {};
  let readyState: 'hidden' | 'ready' | 'sent' = 'hidden';
  let breakTimer: ReturnType<typeof setTimeout> | undefined;
  let gainTimer: ReturnType<typeof setTimeout> | undefined;
  let gainSum = 0;
  /** 이번 프레임에 들어온 돈 (update()에서 한 번에 보여 준다) */
  let pendingGain = 0;
  const showGain = (amount: number): void => {
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
  };
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
    choiceSlot,
    menuBar,
    menuTop() {
      return menuBar.getBoundingClientRect().top - el.getBoundingClientRect().top;
    },
    setMenuActive(kind) {
      for (const [k, { btn }] of menuBtns) {
        const on = k === kind;
        btn.classList.toggle('is-on', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
    },
    goldAnchor() {
      const r = goldEl.getBoundingClientRect();
      const root = el.getBoundingClientRect();
      return { x: r.left + Math.min(r.width, 40) / 2 - root.left, y: r.top + r.height / 2 - root.top };
    },
    gainGold(amount) {
      if (!(amount > 0)) return;
      pendingGain += amount;
    },
    update(m) {
      if (pendingGain > 0) {
        showGain(pendingGain);
        pendingGain = 0;
      }
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
      setText(summonCost, 'summonCost', m.summonCost);
      if (last.summonAffordable !== m.summonAffordable) {
        hintEl.classList.toggle('is-short', !m.summonAffordable);
        summonBtn.classList.toggle('is-off', !m.summonAffordable);
      }
      if (last.mergeReady !== m.mergeReady) {
        // '⬆ 승급 가능 n' — 가운데 낱말은 따로 감싼다: 아래 띠가 붐비면(접은 고르기 알약까지) CSS가 '⬆ n'으로 줄인다 (글자 내용은 그대로)
        const parts = /^(\S+)( .+)( \d+)$/.exec(m.mergeReady);
        if (parts) mergeReadyBtn.replaceChildren(parts[1]!, h('span', { class: 'hud-mr-word', text: parts[2]! }), parts[3]!);
        else mergeReadyBtn.textContent = m.mergeReady;
        mergeReadyBtn.hidden = m.mergeReady === '';
      }
      setText(speedBtn, 'speed', m.speed);
      if (last.bossBanner !== m.bossBanner) {
        if (m.bossBanner) {
          bannerText.textContent = m.bossBanner;
          bannerEl.hidden = false;
        } else bannerEl.hidden = true;
      }
      if (last.bossHp !== m.bossHp) {
        bannerFill.style.width = m.bossHp < 0 ? '0%' : `${m.bossHp / 10}%`;
        bannerEl.classList.toggle('has-hp', m.bossHp >= 0);
      }
      setText(bannerTime, 'bossTime', m.bossTime);
      if (last.bossTimeWarn !== m.bossTimeWarn) bannerTime.classList.toggle('is-warn', m.bossTimeWarn);
      if (last.bossNote !== m.bossNote) {
        bossNoteEl.textContent = m.bossNote;
        bossNoteEl.hidden = m.bossNote === '';
      }
      setText(workersEl, 'workers', m.workers);
      if (last.workersFull !== m.workersFull) workersItem.classList.toggle('is-full', m.workersFull);
      if (last.hireLabel !== m.hireLabel) {
        hireBtn.textContent = m.hireLabel;
        hireBtn.setAttribute('aria-label', m.workersFull ? '일꾼 최대' : `일꾼 고용 ${m.hireLabel.replace('👷 ', '')}`);
      }
      if (last.hireReady !== m.hireReady) hireBtn.classList.toggle('is-off', !m.hireReady);
      // 도전 보스 막대 (M5): 보스와 겹치면 자리를 반씩
      if (last.challengeBanner !== m.challengeBanner) {
        if (m.challengeBanner) {
          chalText.textContent = m.challengeBanner;
          chalEl.hidden = false;
        } else chalEl.hidden = true;
      }
      if (last.challengeHp !== m.challengeHp) chalFill.style.width = m.challengeHp < 0 ? '0%' : `${m.challengeHp / 10}%`;
      setText(chalTime, 'challengeTime', m.challengeTime);
      if (last.challengeTimeWarn !== m.challengeTimeWarn) chalTime.classList.toggle('is-warn', m.challengeTimeWarn);
      const split = [m.bossBanner !== null, m.challengeBanner !== null, readyState !== 'hidden'].filter(Boolean).length >= 2;
      if (bannerSlot.classList.contains('is-split') !== split) bannerSlot.classList.toggle('is-split', split);
      // 하단 메뉴 배지
      const badges: [SheetKind, string, boolean][] = [
        ['challenge', m.menuChallenge, m.menuChallengeAlert],
        ['upgrade', m.menuUpgrade, false],
        ['mission', m.menuMission, m.menuMissionAlert],
      ];
      for (const [k, text, alert] of badges) {
        const b = menuBtns.get(k);
        if (!b) continue;
        if (b.badge.textContent !== text) b.badge.textContent = text;
        b.btn.classList.toggle('is-alert', alert);
      }
      last = { ...m };
      if (dropped) breakHeart();
    },
    setReady(state) {
      if (state === readyState) return;
      readyState = state;
      readyBtn.hidden = state === 'hidden';
      readyBtn.disabled = state === 'sent';
      readyBtn.textContent = state === 'sent' ? '▶ 시작!' : '▶ 준비 완료 · 바로 시작';
      readyBtn.dataset.state = state;
      const split = [!bannerEl.hidden, !chalEl.hidden, state !== 'hidden'].filter(Boolean).length >= 2;
      bannerSlot.classList.toggle('is-split', split);
    },
    setMergeGuide(on) {
      if (mergeReadyBtn.classList.contains('is-guide') !== on) mergeReadyBtn.classList.toggle('is-guide', on);
    },
    destroy() {
      skipHold?.detach();
      skipHold = null;
      summonHold?.detach();
      clearTimeout(breakTimer);
      breakTimer = undefined;
      clearTimeout(gainTimer);
      gainTimer = undefined;
    },
  };
}
