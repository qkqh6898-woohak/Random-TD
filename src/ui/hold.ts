/**
 * 길게 눌러 연속 (GDD 7.1 '버튼을 길게 누르면 돈이 허락하는 만큼 연속 강화', UI.md 4.5).
 *
 * - 누르는 순간 한 번, HOLD_DELAY_MS 동안 누르고 있으면 그 뒤로 간격마다 다시 (점점 빨라져 HOLD_MIN_MS까지).
 * - fire()가 false를 돌려주면 (돈이 모자람·최대 레벨) 거기서 멈춘다. 손을 떼거나 버튼 밖으로 나가거나 터치가 취소돼도 멈춘다.
 * - 키보드(Enter·Space)로 누른 click은 한 번만. 포인터로 이미 쏜 뒤 따라오는 click은 무시한다 (두 번 쏘지 않게).
 * 시간 계산은 holdRepeatDelay(순수)로 단위 테스트한다. 게임 상태는 바꾸지 않고, fire 안에서 화면이 명령을 보낸다.
 */

/** 처음 누른 뒤 연속이 시작될 때까지 (ms) */
export const HOLD_DELAY_MS = 380;
/** 연속 첫 간격 (ms) — 로직 틱(50ms)보다 길어 명령 하나가 실행된 뒤 다음을 보낸다 */
export const HOLD_START_MS = 160;
/** 가장 빠른 간격 (ms) */
export const HOLD_MIN_MS = 60;

/** n번째 연속 발사(0부터) 전 기다릴 시간: 처음은 HOLD_DELAY_MS, 그 뒤 HOLD_START_MS에서 15%씩 줄어 HOLD_MIN_MS까지. */
export function holdRepeatDelay(n: number): number {
  if (n <= 0) return HOLD_DELAY_MS;
  let d = HOLD_START_MS;
  for (let i = 1; i < n && d > HOLD_MIN_MS; i++) d = Math.floor(d * 0.85);
  return d < HOLD_MIN_MS ? HOLD_MIN_MS : d;
}

export interface HoldHandle {
  /** 연속 중인가 (E2E·테스트) */
  readonly active: boolean;
  stop(): void;
  detach(): void;
}

/**
 * 버튼에 길게 눌러 연속을 붙인다. fire()는 한 번 실행하고 계속할지(true) 돌려준다.
 * 타이머는 setTimeout (화면 전용 — sim 시간과 무관, 명령은 fire 안에서 큐에 들어가 다음 틱에 실행된다).
 */
export function attachHoldRepeat(btn: HTMLElement, fire: () => boolean): HoldHandle {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let count = 0;
  let pointerFired = false;
  let active = false;
  const stop = (): void => {
    active = false;
    clearTimeout(timer);
    timer = undefined;
  };
  const schedule = (): void => {
    timer = setTimeout(() => {
      if (!active) return;
      if (!fire()) {
        stop();
        return;
      }
      count++;
      schedule();
    }, holdRepeatDelay(count));
  };
  const onDown = (ev: Event): void => {
    const pe = ev as PointerEvent;
    if (pe.button !== undefined && pe.button !== 0) return;
    stop();
    pointerFired = true;
    count = 0;
    if (!fire()) return;
    active = true;
    schedule();
  };
  const onClick = (): void => {
    // 포인터로 이미 쏜 click은 무시, 키보드 click만 한 번
    if (pointerFired) {
      pointerFired = false;
      return;
    }
    fire();
  };
  const onEnd = (): void => stop();
  btn.addEventListener('pointerdown', onDown);
  btn.addEventListener('click', onClick);
  btn.addEventListener('pointerup', onEnd);
  btn.addEventListener('pointerleave', onEnd);
  btn.addEventListener('pointercancel', onEnd);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
  return {
    get active() {
      return active;
    },
    stop,
    detach() {
      stop();
      btn.removeEventListener('pointerdown', onDown);
      btn.removeEventListener('click', onClick);
      btn.removeEventListener('pointerup', onEnd);
      btn.removeEventListener('pointerleave', onEnd);
      btn.removeEventListener('pointercancel', onEnd);
    },
  };
}
