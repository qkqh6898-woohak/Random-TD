/**
 * 앱 안 업데이트 (U-1): 안드로이드 앱의 자바 다리(`window.RandomTDNative`)와 이야기하는 작은 서비스.
 *
 * - 다리가 없으면(브라우저·PWA·아이폰 웹앱) 만들지 않는다 → 아무것도 하지 않음 (`UpdateService.fromWindow`가 null).
 * - 타이틀 화면이 보이면 한 번만 확인한다 (`checkOnce`, 이번 실행에서 한 번). [나중에]면 다음 실행까지 다시 묻지 않는다.
 * - 웹이 다리에 요청하는 것은 '확인·시작·설정 열기·취소'뿐 (인자 없음). 받을 주소·파일은 자바가 정한다.
 * - 결과는 자바가 `window.__rtdUpdate(사건)`으로 보낸다 → parseNativeEvent → reduceUpdate → 구독자(UpdateDialog).
 * - 다리 호출이 던지면 'bridge' 오류로 바꾸고 게임은 그대로 (업데이트 실패가 게임을 막지 않는다).
 */
import { parseNativeEvent, reduceUpdate, type UpdateAction, type UpdateState } from './updateModel';

/** 자바 다리 (GameActivity.NativeBridge — @JavascriptInterface, 인자 없음) */
export interface NativeUpdateBridge {
  checkUpdate(): void;
  startUpdate(): void;
  openInstallSettings(): void;
  cancelUpdate(): void;
}

export interface UpdateHost {
  RandomTDNative?: unknown;
  __rtdUpdate?: (payload: unknown) => void;
}

type Listener = (state: UpdateState, prev: UpdateState) => void;

const BRIDGE_METHODS = ['checkUpdate', 'startUpdate', 'openInstallSettings', 'cancelUpdate'] as const;

/** 창에 자바 다리가 있나 (네 메서드가 모두 함수) */
export function findBridge(host: UpdateHost): NativeUpdateBridge | null {
  const b = host.RandomTDNative;
  if ((typeof b !== 'object' && typeof b !== 'function') || b === null) return null;
  const rec = b as Record<string, unknown>;
  return BRIDGE_METHODS.every((m) => typeof rec[m] === 'function') ? (b as NativeUpdateBridge) : null;
}

export class UpdateService {
  private current: UpdateState = { kind: 'idle' };
  private readonly listeners = new Set<Listener>();
  private checked = false;
  private titleVisible = false;

  /** 다리가 있으면 서비스를 만들고 window.__rtdUpdate를 건다. 없으면 null (아무것도 하지 않음). */
  static fromWindow(host: UpdateHost): UpdateService | null {
    const bridge = findBridge(host);
    if (!bridge) return null;
    const service = new UpdateService(bridge);
    host.__rtdUpdate = (payload: unknown) => service.receive(payload);
    return service;
  }

  constructor(private readonly bridge: NativeUpdateBridge) {}

  get state(): UpdateState {
    return this.current;
  }

  /** 타이틀 화면이 보이는 중인가 (창은 타이틀에서만 띄운다 — 전투 중에는 띄우지 않음) */
  get onTitle(): boolean {
    return this.titleVisible;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** 타이틀이 보이거나 사라짐 (Boot 장면). 보이면 이번 실행에서 처음 한 번 확인한다. */
  setTitleVisible(visible: boolean): void {
    if (this.titleVisible === visible) return;
    this.titleVisible = visible;
    this.emit(this.current);
    if (visible) this.checkOnce();
  }

  /** 이번 실행에서 처음이면 확인을 시작한다 (true). 이미 했으면 false. */
  checkOnce(): boolean {
    if (this.checked) return false;
    this.checked = true;
    this.dispatch({ type: 'check' });
    this.call('checkUpdate');
    return true;
  }

  /** [지금 업데이트] */
  start(): void {
    const k = this.current.kind;
    if (k === 'available' || k === 'permission') this.call('startUpdate');
  }

  /** [설정 열기] ('출처를 알 수 없는 앱 설치') */
  openSettings(): void {
    if (this.current.kind === 'permission') this.call('openInstallSettings');
  }

  /** [나중에] · 설치 화면 [닫기] */
  later(): void {
    this.dispatch({ type: 'later' });
  }

  /** 내려받는 중 [취소] (자바가 받던 파일을 지운다) */
  cancel(): void {
    const k = this.current.kind;
    if (k === 'downloading' || k === 'verifying' || k === 'permission') this.call('cancelUpdate');
    this.dispatch({ type: 'cancel' });
  }

  /** 자바가 보낸 사건 (window.__rtdUpdate). 모양이 틀리면 무시. */
  receive(payload: unknown): void {
    const event = parseNativeEvent(payload);
    if (event) this.dispatch({ type: 'native', event });
  }

  private call(method: (typeof BRIDGE_METHODS)[number]): void {
    try {
      this.bridge[method]();
    } catch (e) {
      console.warn('업데이트 다리 호출 실패', method, e);
      this.dispatch({ type: 'native', event: { type: 'error', code: 'bridge' } });
    }
  }

  private dispatch(action: UpdateAction): void {
    const prev = this.current;
    const next = reduceUpdate(prev, action);
    if (next === prev) return;
    this.current = next;
    if (next.kind === 'error' && next.during === 'check') console.warn('업데이트 확인 실패', next.code);
    this.emit(prev);
  }

  private emit(prev: UpdateState): void {
    for (const fn of [...this.listeners]) fn(this.current, prev);
  }
}
