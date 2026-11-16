const KEY = 'random-td.screen-shake';

/** 한 기기에서 모든 판에 적용하는 화면 흔들림 설정. */
export class ScreenShake {
  private override: boolean | undefined;

  constructor(
    private readonly storage: () => Pick<Storage, 'getItem' | 'setItem'>,
    private readonly prefersReducedMotion: () => boolean,
  ) {
    try {
      const value = storage().getItem(KEY);
      if (value === 'on' || value === 'off') this.override = value === 'on';
    } catch {
      // 저장소가 없어도 시스템 설정을 따르고 세션 중에는 변경할 수 있다.
    }
  }

  get enabled(): boolean {
    return this.override ?? !this.prefersReducedMotion();
  }

  set enabled(value: boolean) {
    this.override = value;
    try {
      this.storage().setItem(KEY, value ? 'on' : 'off');
    } catch {
      // 저장 실패 시에도 열린 앱에 변경을 적용한다.
    }
  }
}
