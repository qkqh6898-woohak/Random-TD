/**
 * 게임 HUD (DOM, UI.md 4.1·4.2, DEV_PLAN M1-8).
 *
 * 1줄: 단계(보스 단계는 👑) · ⏱ 단계 남은 시간 · 👾 몹 수/한도(무한) 또는 ❤ 목숨(캠페인) · ⏸
 * 2줄: 💰 돈 · 🗼 놓인 타워 수/한도 (피드백 #25 → FB-D1 #25 위 HUD 자원 줄 `hud-resources`) — 그 아래 몹 수 막대 줄
 * 그 아래: 보스 막대 자리 (UI.md 4.1 '보스가 있을 때만'). 자리는 늘 비워 두고 보스 단계에만 보인다
 *   → 보스 단계가 와도 HUD 높이가 그대로라 맵이 밀리거나 가려지지 않는다. 맵 위쪽 끝은 Game 장면이 이 높이를 재서 정한다.
 *   M4: 막대 = 군단·계급 이름표 「보스 이름」 + 체력만큼 채운 띠 + 남은 초 (10초 이하 빨간 깜빡). 보스를 잡으면 '보스 처치!'.
 *
 * 터치: HUD 띠 자체는 터치를 통과시키고(pointer-events: none) 버튼만 받는다 → HUD가 캔버스(맵 칸) 터치를 막지 않는다.
 * 경고 (UI.md 4.2): 남은 10초 이하 노란색 / 몹 120 이상 빨간색 깜빡 + 화면 가장자리 붉은 테두리 /
 *   목숨 5 이하 빨간색(깜빡이지 않음), 목숨이 줄 때마다 하트가 깨지는 연출.
 *
 * 아래 띠 (M2): 🗼 놓인 타워 수/배치 칸 수 · 소환 안내 · [👷 300원](M4 일꾼 고용). 예전 [⬆ 승급 가능 n](M3)은 피드백 #65에서 없앴다.
 *   맵 아래쪽 끝은 Game 장면이 이 띠의 위쪽 끝을 재서 정한다.
 *   M4 검토 반영: 접은 고르기 창의 [🃏 카드 고르기] 알약은 타워 수 옆 자리(choiceSlot)에 들어간다 — 맵 위에 떠 있으면
 *   배치 칸 3개를 덮어 소환 탭을 가로챘다. 알약이 보이는 동안 소환 안내는 숨긴다(CSS).
 * 돈이 들어오면 (동전이 도착하면) 돈 글자가 반짝이고 '+n원'이 떠오른다 (UI.md 4.2).
 * M5: 아래 띠 아래에 하단 메뉴 (UI.md 4.1): [⚔ 도전 · 1 가능] [⬆ 강화 · Lv 5] [📋 미션 · 2 받기] — 누르면 바텀 시트 (onMenu),
 *   열린 시트의 메뉴는 강조. 보스 막대 자리는 도전 보스 막대와 같이 쓴다: 하나만 있으면 그것이 자리를 다 쓰고,
 *   보스와 도전이 겹치면 반씩 두 줄 (UI.md 9장 '체력바 2줄') — 자리 높이는 그대로라 맵이 움직이지 않는다.
 *
 * G-1: 하단 메뉴 = [💠 리미티드] [✨ 소환] [🎰 도박] [⬆ 강화] + 작은 [⚔] [📋] (+ 개발자 [🛠]) — 도전·미션은 아이콘·배지만 (좁은 화면 넘침 방지).
 *   피드백 #26: 위 띠 아래 맵 오른쪽 위에 [⏫ 모두 승급 n] (승급할 무더기가 있을 때만, onMergeAll).
 *   피드백 #65: 승급 버튼은 이것 하나 — 한 번 누르면 전체 승급, 꾹 누르면 누르는 동안 새로 찬 무더기도 계속 (mergeAllHoldDelay).
 *   1줄 ⏸ 앞 [⚡ n] 필살기 칩 (찬 캐릭터가 있을 때만): 누르면 찬 캐릭터 목록 + [모두 발동] (onUlt·onUltAll).
 * ART-2: 하단 메뉴·소환·일꾼·모두 승급·배속·⏸·돈 아이콘은 V2 힉스필드 그림(src/ui/uiIcons.ts) — 그림을 못 읽으면 같은 자리에 예전 이모지.
 * 값 계산은 hudModel.ts(순수 함수, 단위 테스트)에서 하고, 여기서는 바뀐 글자만 DOM에 쓴다.
 * HUD는 sim을 읽기만 한다. 배속은 화면 설정(TickClock), 돈 추가·단계 건너뛰기(debug)는 명령으로 보낸다.
 * 루트의 data-tick 속성 = 지금 틱 (E2E가 게임 시간이 흐르는지 볼 때 쓴다, 화면에는 안 보임).
 */
import { h } from '../dom';
import { HOLD_DELAY_MS, attachHoldRepeat, mergeAllHoldDelay, skipRepeatDelay, type HoldHandle } from '../hold';
import type { UiView } from '../root';
import { goldGainLabels, livesDropped, type HudModel } from './hudModel';
import type { SheetKind } from '../sheets/sheetModels';
import { uiIcon, type UiIconId } from '../uiIcons';

/** 하트 깨짐 연출 길이 (ms) — styles.css `heart-break`와 같게 */
export const HEART_BREAK_MS = 600;
/** 돈 '+n원' 떠오름 길이 (ms) — styles.css `gold-gain`과 같게 */
export const GOLD_GAIN_MS = 700;
/** 돈 '+n원'을 동시에 띄우는 최대 개수 (피드백 #45: 합치지 않고 하나씩 — 넘치면 가장 오래된 것을 지운다) */
export const GOLD_GAIN_MAX = 4;
/** 꾹 누르는 동안 승급할 무더기가 없을 때 [⏫ 모두 승급] 글자 (피드백 #65) */
const MERGE_ALL_HOLD_LABEL = '⏫ 모두 승급';
/** ART-2: 하단 메뉴 종류 → V2 아이콘 (없는 종류 = 개발 [🛠]는 글자 그대로) */
const MENU_ICONS: Partial<Record<SheetKind, UiIconId>> = {
  mythic: 'hud-limited',
  gamble: 'hud-gamble',
  upgrade: 'hud-upgrade',
  challenge: 'hud-challenge',
  mission: 'hud-mission',
};

export interface HudOptions {
  onSpeed: () => void;
  /** ⏸: 일시정지 메뉴를 연다 (바로 나가지 않는다) */
  onPause: () => void;
  /** 개발자 모드만 (src/devMode.ts): ⏭ 다음 단계로 즉시 이동 (길게 누르면 초당 4번) */
  onSkipStage?: () => void;
  /** 개발자 모드만: 돈 추가 (CLAUDE.md 4장 개발용 치트) */
  onAddGold?: () => void;
  /**
   * 아래 띠 '👷 300원': 일꾼 고용 (M4). 피드백 #66: 꾹 누르면 [🎲 소환]과 같은 간격으로 계속 —
   * 고용 명령을 보냈으면(또는 앞 명령이 실행되길 기다리면) true, 돈 부족·최대·일시정지면 false (꾹 누르기 멈춤)
   */
  onHire?: () => boolean;
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
  /** G-1 필살기: 목록의 캐릭터 하나 발동 (타워 엔티티 id) · 모두 발동 */
  onUlt?: (id: number) => void;
  onUltAll?: () => void;
  /**
   * 맵 오른쪽 위 [⏫ 모두 승급 n] (피드백 #26): 승급할 수 있는 무더기를 한 번에 모두 승급.
   * 피드백 #65: 꾹 누르면 되풀이 — false면 (일시정지·판 끝) 꾹 누르기를 멈춘다.
   */
  onMergeAll?: () => boolean;
}

/** G-1 필살기 목록 한 줄 (HUD [⚡ n] 칩을 누르면 보인다) */
export interface UltEntry {
  id: number;
  name: string;
  icon: string;
  ultName: string;
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
  /** 첫 승급 안내 (F10): [⏫ 모두 승급] 버튼을 반짝여 강조 (피드백 #65 전에는 아래 띠 [⬆ 승급 가능]) */
  setMergeGuide(on: boolean): void;
  /** G-1: 하단 메뉴 [리미티드]·[소환]·[도박] 배지 (alert = 강조) */
  setG1Badges(b: { mythic: string; mythicAlert: boolean; summon: string; summonAlert: boolean; gamble: string }): void;
  /** G-1: 필살기가 찬 캐릭터 (빈 배열이면 칩·목록 숨김) */
  setUlts(list: readonly UltEntry[]): void;
  /** 피드백 #26: 맵 오른쪽 위 [⏫ 모두 승급 n] 글자 (빈 글자면 숨김) */
  setMergeAll(text: string): void;
  /** G-1: 필살기 목록이 열려 있는가 (E2E) */
  readonly ultListOpen: boolean;
}

/**
 * 메뉴 배지 글자 (G-1): '2 받기' → 숫자 + 낱말 조각 — 좁은 메뉴 칸(도전·미션)은 CSS가 낱말을 숨겨 '2'만 보인다 (글자 내용은 그대로).
 */
function setBadge(el: HTMLElement, text: string): void {
  const i = text.indexOf(' ');
  if (i <= 0) {
    el.textContent = text;
    return;
  }
  el.replaceChildren(text.slice(0, i), h('span', { class: 'hud-menu-badge-word', text: text.slice(i) }));
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
  // G-1: 몹 수 막대 (n / 한도) — 위 HUD 가운데 아래 한 줄
  const countFill = h('span', { class: 'hud-count-fill', attrs: { 'data-testid': 'hud-count-fill', 'aria-hidden': 'true' } });
  const countBar = h('span', { class: 'hud-count-bar', attrs: { 'aria-hidden': 'true' } }, countFill);
  const countItem = h('span', { class: 'hud-item hud-count' }, countIcon, countBar, countEl);
  const goldEl = h('span', { class: 'hud-value hud-gold', attrs: { 'data-testid': 'hud-gold', ...off }, text: '0원' });
  // ART-2: [⏩ ×1] — 아이콘은 꾸밈, 글자(×n)는 따로 span (setText가 아이콘을 지우지 않게)
  const speedText = h('span', { class: 'hud-speed-text', text: '×1' });
  const speedBtn = h(
    'button',
    {
      class: 'btn btn-chip hud-speed',
      attrs: { type: 'button', 'data-action': 'speed', 'aria-label': '배속' },
      on: { click: () => opts.onSpeed() },
    },
    uiIcon('ui-speed', { className: 'hud-speed-icon' }),
    speedText,
  );
  // G-1 필살기 칩 + 목록 (찬 캐릭터가 있을 때만)
  const ultChip = h('button', {
    class: 'btn btn-chip hud-ult',
    attrs: { type: 'button', 'data-testid': 'hud-ult', 'data-action': 'ult', 'aria-label': '필살기', hidden: '' },
    text: '',
  });
  // 피드백 #26: 맵 오른쪽 위 [⏫ 모두 승급 n] — 위 띠 아래에 떠 있어(absolute) 띠 높이·맵 위치를 바꾸지 않는다
  // 피드백 #65: 하나뿐인 승급 버튼. 짧게 = 한 번 모두 승급, 꾹 = 누르는 동안 되풀이
  // ART-2: 아이콘(hud-merge) + 글자 span — 글자의 '⏫ '는 아이콘이 대신한다
  const mergeAllLabel = h('span', { class: 'hud-merge-all-label', text: '' });
  const mergeAllBtn = h(
    'button',
    {
      class: 'btn btn-chip hud-merge-all',
      attrs: { type: 'button', 'data-action': 'merge-all-stacks', 'data-testid': 'hud-merge-all', hidden: '' },
    },
    uiIcon('hud-merge', { className: 'hud-merge-icon' }),
    mergeAllLabel,
  );
  const mergeAllHold: HoldHandle | null = opts.onMergeAll
    ? attachHoldRepeat(mergeAllBtn, () => opts.onMergeAll?.() ?? false, { delay: mergeAllHoldDelay })
    : null;
  const ultList = h('div', { class: 'hud-ult-list', attrs: { 'data-testid': 'hud-ult-list', role: 'menu', hidden: '' } });
  let ultOpen = false;
  let ultKey = '';
  const setUltOpen = (on: boolean): void => {
    ultOpen = on;
    ultList.hidden = !on;
    ultChip.classList.toggle('is-on', on);
  };
  ultChip.addEventListener('click', () => setUltOpen(!ultOpen));
  const pauseBtn = h(
    'button',
    {
      class: 'btn btn-chip hud-pause',
      attrs: { type: 'button', 'data-action': 'pause', 'aria-label': '일시정지' },
      on: { click: () => opts.onPause() },
    },
    uiIcon('ui-pause', { className: 'hud-ctl-icon' }),
  );
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
  const workersItem = h('span', { class: 'hud-item hud-workers' }, uiIcon('hud-worker', { className: 'hud-worker-art' }), workersEl);
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
  // 돈 '+n원' (돈 글자 옆에서 떠오름) — 들어온 돈마다 글자 하나 (피드백 #45), 칸마다 한 줄씩 위로
  const gainSlots: ({ el: HTMLElement; timer: ReturnType<typeof setTimeout> } | null)[] = Array.from({ length: GOLD_GAIN_MAX }, () => null);
  const gainOrder: number[] = [];
  const gainLayer = h('span', { class: 'hud-gold-gains', attrs: { 'aria-hidden': 'true' } });
  const goldItem = h(
    'span',
    { class: 'hud-item hud-gold-item' },
    uiIcon('cur-gold', { className: 'hud-label hud-gold-icon' }),
    goldEl,
    gainLayer,
  );
  // 아래 띠: 타워 수 · 소환 안내
  const towersEl = h('span', { class: 'hud-value', attrs: { 'data-testid': 'hud-towers', 'aria-label': '놓인 타워 수', ...off }, text: '0/0' });
  const hintEl = h('span', { class: 'hud-hint', attrs: { 'data-testid': 'hud-hint', ...off }, text: '' });
  // [소환 100원] (T-2): 짧게 = 자동 칸에 하나, 꾹 = 계속 (초당 약 4번). 승급 가능 버튼이 보이면 '소환' 글자는 숨긴다 (CSS)
  // G-2: 주사위 🎲 대신 소환문 + 캐릭터 실루엣 아이콘 (theme.ts summonIconSvg → theme.css .hud-summon-icon)
  const summonCost = h('span', { class: 'hud-summon-cost', text: '' });
  // G-1: 소환 버튼 아래 줄 '천장 27' (setG1Badges가 채운다)
  const summonPity = h('span', { class: 'hud-summon-pity', attrs: { 'data-testid': 'hud-summon-pity' }, text: '' });
  const summonBtn = h(
    'button',
    {
      class: 'btn btn-chip hud-summon',
      attrs: { type: 'button', 'data-action': 'summon', 'data-testid': 'hud-summon', 'aria-label': '소환 (꾹 누르면 연속)' },
    },
    uiIcon('hud-summon', { className: 'hud-summon-character' }),
    h('span', { class: 'hud-summon-word', text: '소환' }),
    summonCost,
    summonPity,
  );
  const summonHold: HoldHandle | null = opts.onSummon
    ? attachHoldRepeat(summonBtn, () => opts.onSummon?.() ?? false, {
        delay: (n) => (n <= 0 ? HOLD_DELAY_MS : (opts.summonInterval?.() ?? 250)),
      })
    : null;
  if (!opts.onSummon) summonBtn.hidden = true;
  const hireLabel = h('span', { text: '' });
  // ART-2 (피드백 #18): 일꾼 초상 대신 V2 아이콘 (광부 모자·곡괭이)
  const hireArt = uiIcon('hud-worker', { className: 'hud-worker-art' });
  const hireBtn = h('button', {
    class: 'btn btn-chip hud-hire',
    attrs: { type: 'button', 'data-action': 'hire', 'data-testid': 'hud-hire', 'aria-label': '일꾼 고용' },
  }, hireArt, hireLabel);
  // 피드백 #66: 짧게 = 한 명, 꾹 = [🎲 소환]과 같은 간격(처음 0.38초, 그 뒤 초당 약 4번 · 연출 끄기면 약 10번)으로 계속.
  // 돈이 모자라거나 최대가 되면 onHire가 false → 멈춤 (키보드 click은 한 번)
  const hireHold: HoldHandle | null = opts.onHire
    ? attachHoldRepeat(hireBtn, () => opts.onHire?.() ?? false, {
        delay: (n) => (n <= 0 ? HOLD_DELAY_MS : (opts.summonInterval?.() ?? 250)),
      })
    : null;
  // 접은 고르기 창의 알약 자리 (display: contents → 알약이 아래 띠의 flex 항목이 된다)
  const choiceSlot = h('span', { class: 'hud-choice-slot', attrs: { 'data-testid': 'hud-choice-slot' } });
  const towersItem = h('span', { class: 'hud-item hud-towers' }, h('span', { class: 'hud-label', text: '🗼', attrs: { 'aria-hidden': 'true' } }), towersEl);
  // FB-25: 돈·인원은 위 HUD에 고정하고 아래에는 고용·승급·카드 조작만 둔다.
  // + 큰 버튼 묶음 [💠 리미티드] [🎲 소환] [🎰 도박] / 소환 아래 넓은 [⬆ 강화] — 도전·미션은 맵 오른쪽 둥근 버튼
  const bottomBand = h(
    'div',
    { class: 'hud-bottom is-g1' },
    workersItem,
    choiceSlot,
    hintEl,
    hireBtn,
  );

  const band = h(
    'div',
    { class: 'hud' },
    h(
      'div',
      { class: 'hud-bar' },
      // G-1 위 HUD: 왼쪽 배속(개발자 ⏭·💰+) · 가운데 'WAVE n' + 남은 시간 · 오른쪽 필살기·⏸ / 둘째 줄 몹 수 막대 (n / 한도)
      h(
        'div',
        { class: 'hud-row hud-top-row' },
        h('span', { class: 'hud-side-l' }, speedBtn, skipBtn, addGoldBtn),
        h('span', { class: 'hud-wave' }, stageEl, h('span', { class: 'hud-item hud-wave-timer' }, h('span', { class: 'hud-label', text: '⏱', attrs: { 'aria-hidden': 'true' } }), timerEl)),
        h('span', { class: 'hud-side-r' }, ultChip, pauseBtn),
      ),
      h('div', { class: 'hud-row hud-resources', attrs: { 'data-testid': 'hud-resources' } }, goldItem, towersItem),
      h('div', { class: 'hud-row hud-count-row' }, countItem),
    ),
    bannerSlot,
    mergeAllBtn,
    ultList,
  );
  // 하단 메뉴 (M5, UI.md 4.1): 메뉴 이름 + 배지 두 줄
  const menuBtns = new Map<SheetKind, { btn: HTMLButtonElement; badge: HTMLElement }>();
  // ART-2: 큰 칸은 캐릭터 크기 그림(hud-menu-character), 작은 둥근 버튼(도전·미션)은 버튼을 채우는 아이콘. 아이콘이 없는 종류(개발)는 글자
  const menuIcon = (kind: SheetKind, glyph: string, mini: boolean): HTMLElement => {
    const id = MENU_ICONS[kind];
    if (!id) return h('span', { class: 'hud-menu-icon', text: glyph, attrs: { 'aria-hidden': 'true' } });
    return uiIcon(id, { className: mini ? 'hud-menu-icon' : 'hud-menu-character', fallback: glyph });
  };
  const menuItem = (kind: SheetKind, icon: string, label: string, mini = false): HTMLButtonElement => {
    const badge = h('span', { class: 'hud-menu-badge', attrs: { 'data-testid': `menu-badge-${kind}`, ...off } });
    const btn = h(
      'button',
      {
        class: `btn hud-menu-btn is-${kind}${mini ? ' is-mini' : ''}`,
        attrs: { type: 'button', 'data-testid': `menu-${kind}`, 'data-action': `menu-${kind}`, 'aria-label': label },
        on: { click: () => opts.onMenu?.(kind) },
      },
      h('span', { class: 'hud-menu-label' }, menuIcon(kind, icon, mini), h('span', { class: 'hud-menu-word', text: label })),
      badge,
    );
    menuBtns.set(kind, { btn, badge });
    return btn;
  };
  // G-1 사용자 결정: [리미티드] [소환] [도박] [강화] 탭 + 도전·미션(·개발)은 작은 아이콘 버튼
  const menuBar = h(
    'div',
    { class: 'hud-menu is-g1', attrs: { role: 'toolbar', 'aria-label': '조작 버튼' } },
    menuItem('mythic', '💠', '리미티드'),
    summonBtn,
    menuItem('gamble', '🎰', '도박'),
    menuItem('upgrade', '⬆', '강화'),
  );
  // 맵 오른쪽 아래 둥근 버튼 (도전·미션·개발자) — 아래 묶음 바로 위에 떠 있다
  const sideBar = h(
    'div',
    { class: 'hud-side-btns', attrs: { role: 'toolbar', 'aria-label': '도전·미션' } },
    menuItem('challenge', '⚔', '도전', true),
    menuItem('mission', '📋', '미션', true),
    opts.devMenu ? menuItem('dev', '🛠', '개발', true) : null,
  );
  const dock = h('div', { class: 'hud-dock' }, sideBar, bottomBand, menuBar);
  const el = h('div', { class: 'hud-root', attrs: { 'data-screen': 'game', 'data-tick': '0' } }, edgeEl, band, dock);

  let last: Partial<HudModel> = {};
  let readyState: 'hidden' | 'ready' | 'sent' = 'hidden';
  let breakTimer: ReturnType<typeof setTimeout> | undefined;
  let goldPulseTimer: ReturnType<typeof setTimeout> | undefined;
  /** 이번 프레임에 들어온 돈들 (update()에서 하나씩 따로 보여 준다) */
  let pendingGains: number[] = [];
  const freeGainSlot = (slot: number): void => {
    const g = gainSlots[slot];
    if (!g) return;
    clearTimeout(g.timer);
    g.el.remove();
    gainSlots[slot] = null;
    const i = gainOrder.indexOf(slot);
    if (i >= 0) gainOrder.splice(i, 1);
  };
  const showGain = (label: string): void => {
    let slot = gainSlots.indexOf(null);
    if (slot < 0) {
      // 칸이 모두 찼으면 가장 오래된 글자를 지우고 그 칸을 쓴다
      slot = gainOrder[0] ?? 0;
      freeGainSlot(slot);
    }
    const node = h('span', { class: 'hud-gold-gain is-on', attrs: { 'data-testid': 'hud-gold-gain' }, text: label });
    node.dataset.slot = String(slot);
    // 0번은 돈 글자 아래(예전 자리), 1번부터는 돈 글자 줄을 건너뛰어 그 위로 (숫자와 겹치지 않게)
    node.style.setProperty('--row', String(slot === 0 ? 0 : slot + 1));
    // 위 HUD 자원 줄(FB-D1 #25)에서는 돈 글자 오른쪽에서 시작해 아래로 한 줄씩 (화면 위로 나가지 않게, feedback-design.css)
    node.style.setProperty('--slot', String(slot));
    gainLayer.append(node);
    gainSlots[slot] = { el: node, timer: setTimeout(() => freeGainSlot(slot), GOLD_GAIN_MS) };
    gainOrder.push(slot);
  };
  const pulseGold = (): void => {
    goldEl.classList.remove('is-gain');
    void goldEl.offsetWidth; // 애니메이션을 처음부터 다시
    goldEl.classList.add('is-gain');
    clearTimeout(goldPulseTimer);
    goldPulseTimer = setTimeout(() => {
      goldPulseTimer = undefined;
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
      pendingGains.push(amount);
    },
    update(m) {
      if (pendingGains.length > 0) {
        for (const label of goldGainLabels(pendingGains, GOLD_GAIN_MAX)) showGain(label);
        pendingGains = [];
        pulseGold();
      }
      if (last.tick !== m.tick) el.dataset.tick = String(m.tick);
      if (last.wave !== m.wave || last.boss !== m.boss) {
        stageEl.textContent = m.boss ? `👑 ${m.wave}` : m.wave;
        stageEl.classList.toggle('is-boss', m.boss);
      }
      setText(timerEl, 'timer', m.timer);
      if (last.timerWarn !== m.timerWarn) timerEl.classList.toggle('is-warn', m.timerWarn);
      const dropped = livesDropped(last, m);
      if (last.countFill !== m.countFill) countFill.style.width = `${m.countFill / 10}%`;
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
      setText(speedText, 'speed', m.speed);
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
        hireLabel.textContent = m.hireLabel.replace('👷 ', '');
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
        if (b.badge.textContent !== text) setBadge(b.badge, text);
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
    setG1Badges(b) {
      if (summonPity.textContent !== b.summon) summonPity.textContent = b.summon;
      summonBtn.classList.toggle('is-pity', b.summonAlert);
      const set = (k: SheetKind, text: string, alert: boolean): void => {
        const e = menuBtns.get(k);
        if (!e) return;
        if (e.badge.textContent !== text) setBadge(e.badge, text);
        if (e.btn.classList.contains('is-alert') !== alert) e.btn.classList.toggle('is-alert', alert);
      };
      set('mythic', b.mythic, b.mythicAlert);
      set('gamble', b.gamble, false);
    },
    setUlts(list) {
      const key = list.map((u) => `${u.id}:${u.name}`).join('|');
      if (key === ultKey) return;
      ultKey = key;
      ultChip.hidden = list.length === 0;
      ultChip.textContent = `⚡ ${list.length}`;
      ultChip.setAttribute('aria-label', `필살기 ${list.length}명 준비`);
      if (list.length === 0) setUltOpen(false);
      // 피드백 #43 '스킬창 너무 커서 화면 안보임': 머리 줄에 [모두 발동], 캐릭터 줄은 작은 스크롤 칸 안에
      ultList.replaceChildren(
        h(
          'div',
          { class: 'hud-ult-head' },
          h('span', { class: 'hud-ult-title', text: '⚡ 필살기' }),
          h('button', {
            class: 'btn hud-ult-all',
            attrs: { type: 'button', 'data-testid': 'hud-ult-all' },
            text: '모두 발동',
            on: {
              click: () => {
                opts.onUltAll?.();
                setUltOpen(false);
              },
            },
          }),
        ),
        h(
          'div',
          { class: 'hud-ult-items' },
          ...list.map((u) =>
            h(
              'button',
              {
                class: 'btn hud-ult-item',
                attrs: { type: 'button', role: 'menuitem', 'data-testid': `hud-ult-${u.id}` },
                on: {
                  click: () => {
                    opts.onUlt?.(u.id);
                  },
                },
              },
              h('span', { class: 'hud-ult-icon', text: u.icon, attrs: { 'aria-hidden': 'true' } }),
              h('span', { class: 'hud-ult-name', text: u.name }),
              h('span', { class: 'hud-ult-kind', text: u.ultName }),
            ),
          ),
        ),
      );
    },
    setMergeAll(text) {
      // 피드백 #65: 꾹 누르는 동안은 승급할 게 잠깐 없어도 버튼을 남긴다 (숨기면 손가락 아래에서 사라져 꾹 누르기가 끊긴다)
      const shown = text === '' && mergeAllHold?.active ? MERGE_ALL_HOLD_LABEL : text;
      // ART-2: '⏫ '는 아이콘이 보여 준다 → 글자 span에는 나머지만 (모델 글자 mergeAllButton은 그대로)
      const label = shown.replace(/^⏫\s*/, '');
      if (mergeAllLabel.textContent === label && mergeAllBtn.hidden === (shown === '')) return;
      mergeAllLabel.textContent = label;
      mergeAllBtn.setAttribute('aria-label', text === '' ? '모두 승급' : `모두 승급 (승급 가능 ${text.replace(/\D+/g, '')}칸)`);
      mergeAllBtn.hidden = shown === '';
    },
    get ultListOpen() {
      return ultOpen;
    },
    setMergeGuide(on) {
      if (mergeAllBtn.classList.contains('is-guide') !== on) mergeAllBtn.classList.toggle('is-guide', on);
    },
    destroy() {
      skipHold?.detach();
      skipHold = null;
      summonHold?.detach();
      hireHold?.detach();
      mergeAllHold?.detach();
      clearTimeout(breakTimer);
      breakTimer = undefined;
      clearTimeout(goldPulseTimer);
      goldPulseTimer = undefined;
      for (let i = 0; i < GOLD_GAIN_MAX; i++) freeGainSlot(i);
    },
  };
}
