/**
 * 일시정지 메뉴 (UI.md 4.6). HUD의 ⏸를 누르거나 앱이 백그라운드로 가면 열린다.
 * M0: [계속] [타이틀로]. 설정·도감·포기(정산)는 해당 마일스톤에서 붙인다.
 * T-2: 설정 한 줄 '눌러서 바로 승급' (켜짐: 승급할 수 있는 타워를 누르면 바로 승급 / 꺼짐: 패널을 연다). 저장은 Game 장면이 한다.
 * G-1: 설정 한 줄 '필살기 자동' (켜짐: 필살기가 차면 Game이 바로 ult 명령).
 * 피드백 #46: 설정 두 줄 '노말 자동 판매' · '레어 이하 자동 판매' (켜짐: 방금 소환된 그 등급 이하 타워를 Game이 바로 sellTower).
 * F10: [❔ 도움말 다시 보기] — 계정에 기록된 '본 도움말'(첫 승급 안내)을 지워, 다음에 승급할 수 있게 되면 다시 안내한다.
 * A-1 (Codex 갈래 M6-10·M6-11에서 옮김): '효과음 크기' 0~100% (5% 단위, 0 = 음소거) + [미리 듣기], '화면 흔들림' 켜짐/꺼짐 — 둘 다 기기에 저장.
 *   열 때 자동 저장했으면 아래 글을 '자동 저장했어요 · 로비에서 이어 할 수 있어요'로.
 * 피드백 #24: [📘 등급·조합 설명] — 등급 순서(색·별)와 승급·신화 조합 방법 창(<dialog>, GradeGuideDialog).
 * FB-1: [💬 피드백 보내기] — 피드백 창(<dialog>, 판 기록 첨부 기본 켜짐)은 메뉴 화면에 붙는다.
 * 메뉴가 열려 있는 동안 게임 시간은 멈춘다 (Game 장면이 TickClock 배속을 0으로).
 */
import { h } from '../dom';
import type { UiView } from '../root';
import { feedbackButton, type FeedbackDialogView } from './FeedbackDialog';
import { gradeGuideButton, type GradeGuideDialogView } from './GradeGuideDialog';

export interface PauseMenuOptions {
  onResume: () => void;
  onExit: () => void;
  /** '눌러서 바로 승급' 지금 값과 바꿀 때 (T-2). 없으면 줄도 없다 */
  tapMerge?: boolean;
  onTapMerge?: (on: boolean) => void;
  /** G-1 '필살기 자동' 지금 값과 바꿀 때. 없으면 줄도 없다 */
  ultAuto?: boolean;
  onUltAuto?: (on: boolean) => void;
  /** 피드백 #46 '노말 자동 판매' · '레어 이하 자동 판매' 지금 값과 바꿀 때. 없으면 줄도 없다 */
  autoSellNormal?: boolean;
  onAutoSellNormal?: (on: boolean) => void;
  autoSellRare?: boolean;
  onAutoSellRare?: (on: boolean) => void;
  /** [❔ 도움말 다시 보기] (F10). 없으면 버튼도 없다 */
  onHelpAgain?: () => void;
  /** 메뉴를 열며 자동 저장했다 (A-1) */
  saved?: boolean;
  /** 화면 흔들림 지금 값과 바꿀 때 (A-1). 없으면 줄도 없다 */
  screenShake?: boolean;
  onScreenShake?: (on: boolean) => void;
  /** 효과음 크기 0~100 (A-1). 없으면 줄도 없다 */
  effectVolume?: number;
  onEffectVolume?: (volume: number) => void;
  onPreviewAudio?: () => void;
  /** 💬 피드백 보내기 창 (FB-1). 없으면 버튼도 없다 */
  feedback?: FeedbackDialogView;
  /** 📘 등급·조합 설명 창 (피드백 #24). 없으면 버튼도 없다 */
  gradeGuide?: GradeGuideDialogView;
}

/** 볼륨 글자 ('음소거' · '40%') */
export function volumeText(volume: number): string {
  return volume === 0 ? '음소거' : `${volume}%`;
}

/** 켜고 끄는 설정 줄 (이름·설명 + [켜짐/꺼짐] 스위치). */
function switchRow(name: string, desc: string, value: boolean, testId: string, onChange: (on: boolean) => void): HTMLElement {
  const sw = h('button', {
    class: 'btn dv-switch pause-switch',
    attrs: { type: 'button', role: 'switch', 'aria-checked': String(value), 'data-testid': testId, 'aria-label': name },
    text: value ? '켜짐' : '꺼짐',
  });
  sw.classList.toggle('is-on', value);
  sw.addEventListener('click', () => {
    const v = sw.getAttribute('aria-checked') !== 'true';
    sw.setAttribute('aria-checked', String(v));
    sw.textContent = v ? '켜짐' : '꺼짐';
    sw.classList.toggle('is-on', v);
    onChange(v);
  });
  return h(
    'div',
    { class: 'pause-setting' },
    h('div', { class: 'pause-setting-main' }, h('div', { class: 'pause-setting-name', text: name }), h('div', { class: 'pause-setting-desc', text: desc })),
    sw,
  );
}

/** 효과음 크기 줄: 이름 + 지금 값, 밀대(0~100, 5 단위) + [🔊 미리 듣기]. */
function volumeRow(opts: PauseMenuOptions, initial: number): HTMLElement {
  const reading = h('output', { class: 'pause-volume-value', attrs: { for: 'pause-volume', 'aria-hidden': 'true', 'data-testid': 'pause-volume-value' } });
  const preview = h('button', {
    class: 'btn dv-switch pause-switch pause-preview',
    attrs: { type: 'button', 'aria-label': '효과음 미리 듣기', 'data-testid': 'pause-volume-preview' },
    text: '🔊 미리 듣기',
  });
  preview.addEventListener('click', () => opts.onPreviewAudio?.());
  const slider = h('input', {
    class: 'pause-volume',
    attrs: { id: 'pause-volume', type: 'range', min: '0', max: '100', step: '5', value: String(initial), 'aria-label': '효과음 크기', 'data-testid': 'pause-volume' },
  });
  const show = (v: number): void => {
    reading.textContent = volumeText(v);
    slider.setAttribute('aria-valuetext', volumeText(v));
    preview.disabled = v === 0;
  };
  slider.addEventListener('input', () => {
    const v = slider.valueAsNumber;
    opts.onEffectVolume?.(v);
    show(v);
  });
  show(initial);
  return h(
    'div',
    { class: 'pause-setting pause-setting-volume' },
    h('div', { class: 'pause-setting-main' }, h('div', { class: 'pause-setting-name' }, h('label', { text: '효과음 크기', attrs: { for: 'pause-volume' } }), ' ', reading), h('div', { class: 'pause-volume-controls' }, slider, preview)),
  );
}

export function createPauseMenu(opts: PauseMenuOptions): UiView {
  const resume = h(
    'button',
    {
      class: 'btn btn-primary pause-resume',
      attrs: { type: 'button', 'data-action': 'resume', 'aria-label': '계속' },
      on: { click: () => opts.onResume() },
    },
    h('span', { class: 'btn-icon', text: '▶', attrs: { 'aria-hidden': 'true' } }),
    h('span', { text: '계속' }),
  );
  const exit = h('button', {
    class: 'btn pause-exit',
    attrs: { type: 'button', 'data-action': 'exit', 'aria-label': '로비로' },
    text: '로비로',
    on: { click: () => opts.onExit() },
  });
  const tapRow =
    opts.tapMerge !== undefined ? switchRow('눌러서 바로 승급', '승급할 수 있는 타워를 누르면 바로 승급', opts.tapMerge, 'pause-tap-merge', (v) => opts.onTapMerge?.(v)) : null;
  const ultRow = opts.ultAuto !== undefined ? switchRow('필살기 자동', '필살기가 차면 바로 써요', opts.ultAuto, 'pause-ult-auto', (v) => opts.onUltAuto?.(v)) : null;
  const sellNormalRow =
    opts.autoSellNormal !== undefined
      ? switchRow('노말 자동 판매', '소환된 노말을 바로 팔아요', opts.autoSellNormal, 'pause-auto-sell-normal', (v) => opts.onAutoSellNormal?.(v))
      : null;
  const sellRareRow =
    opts.autoSellRare !== undefined
      ? switchRow('레어 이하 자동 판매', '소환된 노말·레어를 바로 팔아요', opts.autoSellRare, 'pause-auto-sell-rare', (v) => opts.onAutoSellRare?.(v))
      : null;
  const volume = opts.effectVolume !== undefined ? volumeRow(opts, opts.effectVolume) : null;
  const shakeRow =
    opts.screenShake !== undefined ? switchRow('화면 흔들림', '보스·큰 승급 때 화면을 흔들어요', opts.screenShake, 'pause-screen-shake', (v) => opts.onScreenShake?.(v)) : null;
  let help: HTMLButtonElement | null = null;
  if (opts.onHelpAgain) {
    const b = h('button', {
      class: 'btn pause-help',
      attrs: { type: 'button', 'data-testid': 'pause-help', 'aria-label': '도움말 다시 보기' },
      text: '❔ 도움말 다시 보기',
    });
    b.addEventListener('click', () => {
      opts.onHelpAgain?.();
      b.textContent = '✓ 안내를 다시 보여 드려요';
      b.disabled = true;
    });
    help = b;
  }
  const el = h(
    'div',
    { class: 'screen pause-screen', attrs: { 'data-screen': 'pause', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'pause-title' } },
    h(
      'div',
      { class: 'pause-panel' },
      h('h2', { class: 'pause-title', text: '일시정지', attrs: { id: 'pause-title' } }),
      resume,
      tapRow,
      ultRow,
      sellNormalRow,
      sellRareRow,
      volume,
      shakeRow,
      help,
      opts.gradeGuide ? gradeGuideButton(opts.gradeGuide) : null,
      opts.feedback ? feedbackButton(opts.feedback, 'pause-feedback') : null,
      exit,
      h('p', { class: 'pause-note', attrs: { 'data-testid': 'pause-note' }, text: opts.saved ? '자동 저장했어요 · 로비에서 이어 할 수 있어요' : '로비로 나가면 이 판은 끝나요' }),
    ),
    // 창은 패널 밖에 붙인다 (.pause-panel .btn 크기 규칙이 창 버튼에 번지지 않게)
    opts.feedback?.el ?? null,
    opts.gradeGuide?.el ?? null,
  );
  // 키보드 사용자를 위해 [계속]에 초점 (화면에 붙은 뒤)
  queueMicrotask(() => resume.focus({ preventScroll: true }));
  return { el };
}
