/**
 * 일시정지 메뉴 (UI.md 4.6). HUD의 ⏸를 누르거나 앱이 백그라운드로 가면 열린다.
 * [계속] [타이틀로]와 기기 효과음·화면 흔들림 설정.
 * 메뉴가 열려 있는 동안 게임 시간은 멈춘다 (Game 장면이 TickClock 배속을 0으로).
 */
import { h } from '../dom';
import type { UiView } from '../root';

export interface PauseMenuOptions {
  onResume: () => void;
  onExit: () => void;
  saved?: boolean;
  screenShake: boolean;
  onScreenShake: (value: boolean) => void;
  effectVolume: number;
  onEffectVolume: (value: number) => void;
  onPreviewAudio: () => void;
}

function effectVolumeControl(opts: PauseMenuOptions): HTMLElement {
  const reading = h('output', { attrs: { for: 'effect-volume', 'aria-hidden': 'true' } });
  const preview = h('button', {
    class: 'btn pause-audio-preview',
    text: '미리 듣기',
    attrs: { type: 'button', 'aria-label': '효과음 미리 듣기' },
    on: { click: opts.onPreviewAudio },
  });
  const slider = h('input', {
    attrs: { id: 'effect-volume', type: 'range', min: '0', max: '100', step: '5', value: String(opts.effectVolume) },
    on: { input: () => {
      const volume = slider.valueAsNumber;
      opts.onEffectVolume(volume);
      update(volume);
    } },
  });
  function update(volume: number): void {
    const text = volume === 0 ? '음소거' : `${volume}%`;
    reading.textContent = text;
    slider.setAttribute('aria-valuetext', text);
    preview.disabled = volume === 0;
  }
  update(opts.effectVolume);
  return h('div', { class: 'pause-audio' },
    h('div', { class: 'pause-audio-label' }, h('label', { text: '효과음 크기', attrs: { for: slider.id } }), reading),
    h('div', { class: 'pause-audio-controls' }, slider, preview),
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
    attrs: { type: 'button', 'data-action': 'exit', 'aria-label': '타이틀로' },
    text: '타이틀로',
    on: { click: () => opts.onExit() },
  });
  let shakeEnabled = opts.screenShake;
  const settingValue = h('span', { class: 'pause-setting-value', attrs: { 'aria-hidden': 'true' } });
  const shake = h('button', {
    class: 'btn pause-setting',
    attrs: { type: 'button', role: 'switch', 'aria-label': '화면 흔들림' },
    on: { click: () => {
      shakeEnabled = !shakeEnabled;
      opts.onScreenShake(shakeEnabled);
      showShakeState();
    } },
  }, '화면 흔들림', settingValue);
  function showShakeState(): void {
    shake.setAttribute('aria-checked', String(shakeEnabled));
    settingValue.textContent = shakeEnabled ? '켜짐' : '꺼짐';
  }
  showShakeState();
  const el = h(
    'div',
    { class: 'screen pause-screen', attrs: { 'data-screen': 'pause', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'pause-title' } },
    h(
      'div',
      { class: 'pause-panel' },
      h('h2', { class: 'pause-title', text: '일시정지', attrs: { id: 'pause-title' } }),
      resume,
      effectVolumeControl(opts),
      shake,
      exit,
      h('p', { class: 'pause-note', text: opts.saved ? '자동 저장했어요. 타이틀에서 이어 할 수 있어요.' : '타이틀로 나가면 이 판은 끝나요' }),
    ),
  );
  // 키보드 사용자를 위해 [계속]에 초점 (화면에 붙은 뒤)
  queueMicrotask(() => resume.focus({ preventScroll: true }));
  return { el };
}
