/**
 * 치명적 오류 처리: 시작 중 오류(동기)뿐 아니라 Phaser 게임 루프 안(장면 create·update)에서 나중에 터진 예외와
 * 처리되지 않은 Promise 거절도 오류 화면으로 보여준다. 콘솔에만 남고 화면이 멈춰 보이는 일을 막는다.
 */
import { DataError } from '../data/load';

export type FatalPhase = 'boot' | 'run';

/** 오류 → 화면에 보일 제목·내용. */
export function describeFatal(e: unknown, phase: FatalPhase): { title: string; detail: string } {
  const title =
    e instanceof DataError ? '데이터 파일에 문제가 있어요' : phase === 'boot' ? '게임을 시작하지 못했어요' : '게임 중 문제가 생겼어요';
  let detail: string;
  if (e instanceof Error) detail = e.message || e.name;
  else if (typeof e === 'string') detail = e;
  else detail = String(e);
  return { title, detail };
}

/** 오류로 보지 않는 브라우저 알림 (게임과 무관하고 해롭지 않다). */
function isBenign(message: string): boolean {
  return message.startsWith('ResizeObserver loop');
}

interface ErrorLike {
  error?: unknown;
  message?: string;
  reason?: unknown;
}

export interface FatalTarget {
  addEventListener(type: 'error' | 'unhandledrejection', listener: (ev: Event) => void): void;
  removeEventListener(type: 'error' | 'unhandledrejection', listener: (ev: Event) => void): void;
}

/**
 * window의 'error'·'unhandledrejection'을 받아 `onFatal`을 **한 번만** 부른다
 * (매 프레임 같은 예외가 나도 오류 화면을 계속 새로 그리지 않게). 해제 함수를 돌려준다.
 */
export function installFatalHandlers(target: FatalTarget, onFatal: (e: unknown) => void): () => void {
  let fired = false;
  const fire = (e: unknown): void => {
    if (fired) return;
    fired = true;
    onFatal(e);
  };
  const onError = (ev: Event): void => {
    const { error, message } = ev as unknown as ErrorLike;
    const text = typeof message === 'string' ? message : '';
    if (error === undefined || error === null) {
      if (isBenign(text)) return;
      fire(text || '알 수 없는 오류');
      return;
    }
    fire(error);
  };
  const onRejection = (ev: Event): void => fire((ev as unknown as ErrorLike).reason);
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
}
