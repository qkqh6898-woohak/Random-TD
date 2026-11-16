/**
 * 화면 흔들림 설정 (A-1, Codex 갈래 M6-10에서 옮김): 이 기기의 모든 판에 적용.
 *
 * - 저장값이 없으면 기기의 '동작 줄이기'(prefers-reduced-motion)를 따른다 (줄이기면 꺼짐). 일시정지 메뉴에서 바꾸면 기기에 저장.
 * - 키 `rtd.screenShake` ('on'·'off'). v0.1.7(Codex 갈래)의 `random-td.screen-shake`가 있으면 새 키가 없을 때 그것을 읽는다.
 * - 개발자 도구 '연출 끄기'(view/effects.ts)는 이 설정과 상관없이 모든 흔들림을 끈다 (부르는 쪽이 둘 다 본다).
 */
import type { KeyValueStorage } from './storage';

export const SCREEN_SHAKE_KEY = 'rtd.screenShake';
export const LEGACY_SCREEN_SHAKE_KEY = 'random-td.screen-shake';

export class ScreenShake {
  private override: boolean | undefined;

  constructor(
    private readonly storage: KeyValueStorage,
    private readonly prefersReducedMotion: () => boolean,
  ) {
    try {
      const v = storage.getItem(SCREEN_SHAKE_KEY) ?? storage.getItem(LEGACY_SCREEN_SHAKE_KEY);
      if (v === 'on' || v === 'off') this.override = v === 'on';
    } catch {
      // 저장소가 없어도 기기 설정을 따르고, 이번 실행 동안은 바꿀 수 있다
    }
  }

  get enabled(): boolean {
    return this.override ?? !this.prefersReducedMotion();
  }

  set enabled(value: boolean) {
    this.override = value;
    try {
      this.storage.setItem(SCREEN_SHAKE_KEY, value ? 'on' : 'off');
    } catch {
      // 저장이 안 돼도 열린 앱에는 적용
    }
  }
}
