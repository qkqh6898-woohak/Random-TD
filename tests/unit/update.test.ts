/**
 * U-1 앱 안 업데이트 — 웹 쪽 규칙 (src/update): 자바 사건 읽기, 상태 기계(idle → checking → available → downloading → installing / error),
 * 한 실행에 한 번 확인, 다리가 없으면 아무것도 안 함, 다리 호출 실패는 오류 상태로(게임은 그대로).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { UPDATE_SAVE_NOTE } from '../../src/ui/messages';
import { UpdateService, findBridge, type NativeUpdateBridge, type UpdateHost } from '../../src/update/UpdateService';
import {
  cleanNotes,
  errorMessage,
  formatMb,
  parseNativeEvent,
  progressPercent,
  reduceUpdate,
  type NativeUpdateEvent,
  type UpdateAction,
  type UpdateState,
} from '../../src/update/updateModel';

const OFFER = { version: '0.1.10', current: '0.1.9', notes: '### 바뀐 점\n- 자동 릴리스', size: 14717353 };

function fakeBridge(): NativeUpdateBridge & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    checkUpdate: () => calls.push('check'),
    startUpdate: () => calls.push('start'),
    openInstallSettings: () => calls.push('settings'),
    cancelUpdate: () => calls.push('cancel'),
  };
}

function setup(): { host: UpdateHost; bridge: ReturnType<typeof fakeBridge>; service: UpdateService; seen: UpdateState['kind'][] } {
  const bridge = fakeBridge();
  const host: UpdateHost = { RandomTDNative: bridge };
  const service = UpdateService.fromWindow(host);
  if (!service) throw new Error('service');
  const seen: UpdateState['kind'][] = [];
  service.subscribe((s, prev) => {
    if (s !== prev) seen.push(s.kind);
  });
  return { host, bridge, service, seen };
}

describe('자바 사건 읽기 (parseNativeEvent)', () => {
  it('맞는 사건', () => {
    expect(parseNativeEvent({ type: 'available', ...OFFER })).toEqual({ type: 'available', ...OFFER });
    expect(parseNativeEvent({ type: 'progress', received: 5, total: 10 })).toEqual({ type: 'progress', received: 5, total: 10 });
    expect(parseNativeEvent({ type: 'installing', step: 'confirm' })).toEqual({ type: 'installing', confirm: true });
    expect(parseNativeEvent({ type: 'installing' })).toEqual({ type: 'installing', confirm: false });
    expect(parseNativeEvent({ type: 'error', code: 'digest' })).toEqual({ type: 'error', code: 'digest' });
    expect(parseNativeEvent({ type: 'none', current: '0.1.9' })).toEqual({ type: 'none', current: '0.1.9' });
  });

  it('모양이 틀리면 null (버전·크기·숫자), 모르는 오류 코드는 install', () => {
    expect(parseNativeEvent(null)).toBeNull();
    expect(parseNativeEvent('available')).toBeNull();
    expect(parseNativeEvent({ type: 'nope' })).toBeNull();
    expect(parseNativeEvent({ type: 'available', ...OFFER, version: '0.1' })).toBeNull();
    expect(parseNativeEvent({ type: 'available', ...OFFER, version: '<b>1.0.0</b>' })).toBeNull();
    expect(parseNativeEvent({ type: 'available', ...OFFER, current: undefined })).toBeNull();
    expect(parseNativeEvent({ type: 'available', ...OFFER, size: 0 })).toBeNull();
    expect(parseNativeEvent({ type: 'available', ...OFFER, size: 999 * 1024 * 1024 })).toBeNull();
    expect(parseNativeEvent({ type: 'progress', received: -1, total: 10 })).toBeNull();
    expect(parseNativeEvent({ type: 'progress', received: 1.5, total: 10 })).toBeNull();
    expect(parseNativeEvent({ type: 'progress', received: 20, total: 10 })).toEqual({ type: 'progress', received: 10, total: 10 });
    expect(parseNativeEvent({ type: 'error', code: 'whatever' })).toEqual({ type: 'error', code: 'install' });
  });

  it('노트는 4000자까지, 글자가 아니면 빈 글', () => {
    const long = parseNativeEvent({ type: 'available', ...OFFER, notes: 'x'.repeat(9000) });
    expect(long && long.type === 'available' && long.notes.length).toBe(4000);
    const none = parseNativeEvent({ type: 'available', ...OFFER, notes: 42 });
    expect(none && none.type === 'available' && none.notes).toBe('');
  });
});

describe('상태 기계 (reduceUpdate)', () => {
  const idle: UpdateState = { kind: 'idle' };
  const native = (event: NativeUpdateEvent): UpdateAction => ({ type: 'native', event });

  it('정상 흐름: idle → checking → available → downloading(진행) → verifying → installing(확인 창) → installed', () => {
    let s = reduceUpdate(idle, { type: 'check' });
    expect(s.kind).toBe('checking');
    s = reduceUpdate(s, native({ type: 'available', ...OFFER }));
    expect(s).toEqual({ kind: 'available', offer: OFFER });
    s = reduceUpdate(s, native({ type: 'progress', received: 0, total: 100 }));
    s = reduceUpdate(s, native({ type: 'progress', received: 40, total: 100 }));
    expect(s).toMatchObject({ kind: 'downloading', received: 40, total: 100 });
    s = reduceUpdate(s, native({ type: 'verifying' }));
    expect(s.kind).toBe('verifying');
    s = reduceUpdate(s, native({ type: 'installing', confirm: false }));
    s = reduceUpdate(s, native({ type: 'installing', confirm: true }));
    expect(s).toMatchObject({ kind: 'installing', confirm: true });
    expect(reduceUpdate(s, native({ type: 'installed' })).kind).toBe('installed');
  });

  it('V2 L6: 받는 중·설치 중에 웹이 다시 읽혀도 자바가 다시 보낸 사건(UpdateLogic.resyncEvents 순서)으로 지금 단계가 되살아난다', () => {
    // 자바 UpdateLogic.resyncEvents와 같은 JSON (android/test UpdateLogicTest가 같은 모양을 검사)
    const replay = (jsons: string[]): UpdateState =>
      jsons.reduce<UpdateState>((st, j) => {
        const ev = parseNativeEvent(JSON.parse(j));
        expect(ev, j).not.toBeNull();
        return reduceUpdate(st, native(ev!));
      }, reduceUpdate(idle, { type: 'check' }));
    const avail = JSON.stringify({ type: 'available', ...OFFER });
    const total = OFFER.size;
    expect(replay([avail, JSON.stringify({ type: 'progress', received: 40, total })])).toMatchObject({ kind: 'downloading', received: 40, total });
    expect(replay([avail, JSON.stringify({ type: 'progress', received: total, total }), '{"type":"verifying"}']).kind).toBe('verifying');
    expect(replay([avail, JSON.stringify({ type: 'progress', received: total, total }), '{"type":"installing","step":"confirm"}'])).toMatchObject({ kind: 'installing', confirm: true });
    expect(replay([avail, '{"type":"permission"}']).kind).toBe('permission');
    // 다시 보낸 뒤 이어지는 진행 사건도 받는다 (예전엔 'checking'에 멈춰 모두 버렸다)
    let s = replay([avail, JSON.stringify({ type: 'progress', received: 10, total })]);
    s = reduceUpdate(s, native({ type: 'progress', received: 20, total }));
    expect(s).toMatchObject({ kind: 'downloading', received: 20 });
  });

  it('권한: available → permission → (설정에서 돌아와) downloading', () => {
    let s: UpdateState = { kind: 'available', offer: OFFER };
    s = reduceUpdate(s, native({ type: 'permission' }));
    expect(s.kind).toBe('permission');
    s = reduceUpdate(s, native({ type: 'progress', received: 0, total: 10 }));
    expect(s.kind).toBe('downloading');
  });

  it('새 버전 없음 · 확인 실패(조용히) · 업데이트 중 실패(알림)', () => {
    const checking: UpdateState = { kind: 'checking' };
    expect(reduceUpdate(checking, native({ type: 'none', current: '0.1.9' })).kind).toBe('none');
    expect(reduceUpdate(checking, native({ type: 'error', code: 'network' }))).toEqual({ kind: 'error', code: 'network', during: 'check' });
    const dl: UpdateState = { kind: 'downloading', offer: OFFER, received: 1, total: 2 };
    expect(reduceUpdate(dl, native({ type: 'error', code: 'digest' }))).toEqual({ kind: 'error', code: 'digest', during: 'update' });
    const inst: UpdateState = { kind: 'installing', offer: OFFER, confirm: true };
    expect(reduceUpdate(inst, native({ type: 'error', code: 'aborted' }))).toEqual({ kind: 'error', code: 'aborted', during: 'update' });
  });

  it('나중에·취소 → dismissed, 그 뒤 늦게 온 사건은 무시', () => {
    const avail: UpdateState = { kind: 'available', offer: OFFER };
    const dismissed = reduceUpdate(avail, { type: 'later' });
    expect(dismissed.kind).toBe('dismissed');
    for (const e of [
      { type: 'progress', received: 1, total: 2 },
      { type: 'available', ...OFFER },
      { type: 'error', code: 'network' },
      { type: 'cancelled' },
      { type: 'installing', confirm: true },
    ] as const) {
      expect(reduceUpdate(dismissed, native(e))).toBe(dismissed);
    }
    const dl: UpdateState = { kind: 'downloading', offer: OFFER, received: 1, total: 2 };
    expect(reduceUpdate(dl, { type: 'cancel' }).kind).toBe('dismissed');
    // 받는 중에는 '나중에'가 아니라 취소만
    expect(reduceUpdate(dl, { type: 'later' })).toBe(dl);
  });

  it('맞지 않는 때 온 사건은 무시 (확인 전 available, 받기 전 verifying, 두 번째 check)', () => {
    expect(reduceUpdate(idle, native({ type: 'available', ...OFFER }))).toBe(idle);
    const avail: UpdateState = { kind: 'available', offer: OFFER };
    expect(reduceUpdate(avail, native({ type: 'verifying' }))).toBe(avail);
    expect(reduceUpdate(avail, native({ type: 'installed' }))).toBe(avail);
    expect(reduceUpdate(avail, { type: 'check' })).toBe(avail);
  });
});

describe('UpdateService (가짜 다리)', () => {
  it('다리가 없거나 메서드가 모자라면 만들지 않는다 (브라우저·PWA는 아무것도 안 함)', () => {
    expect(UpdateService.fromWindow({})).toBeNull();
    expect(UpdateService.fromWindow({ RandomTDNative: { checkUpdate() {} } })).toBeNull();
    expect(UpdateService.fromWindow({ RandomTDNative: 'x' })).toBeNull();
    expect(findBridge({ RandomTDNative: fakeBridge() })).not.toBeNull();
  });

  it('window.__rtdUpdate를 걸고, 타이틀이 보이면 한 번만 확인한다 (타이틀로 돌아와도 다시 안 함)', () => {
    const { host, bridge, service } = setup();
    expect(typeof host.__rtdUpdate).toBe('function');
    service.setTitleVisible(true);
    expect(bridge.calls).toEqual(['check']);
    expect(service.state.kind).toBe('checking');
    service.setTitleVisible(false);
    service.setTitleVisible(true);
    expect(service.checkOnce()).toBe(false);
    expect(bridge.calls).toEqual(['check']);
  });

  it('available → [지금 업데이트] → progress → installing, 상태가 차례로 바뀐다', () => {
    const { host, bridge, service, seen } = setup();
    service.setTitleVisible(true);
    host.__rtdUpdate?.({ type: 'available', ...OFFER });
    expect(service.state).toEqual({ kind: 'available', offer: OFFER });
    service.start();
    expect(bridge.calls).toEqual(['check', 'start']);
    host.__rtdUpdate?.({ type: 'progress', received: 0, total: 100 });
    host.__rtdUpdate?.({ type: 'progress', received: 50, total: 100 });
    host.__rtdUpdate?.({ type: 'verifying' });
    host.__rtdUpdate?.({ type: 'installing', step: 'confirm' });
    expect(seen).toEqual(['checking', 'available', 'downloading', 'downloading', 'verifying', 'installing']);
  });

  it('[지금 업데이트]는 available·permission에서만, [설정 열기]는 permission에서만 다리를 부른다', () => {
    const { host, bridge, service } = setup();
    service.start();
    service.openSettings();
    expect(bridge.calls).toEqual([]);
    service.checkOnce();
    host.__rtdUpdate?.({ type: 'available', ...OFFER });
    service.openSettings();
    expect(bridge.calls).toEqual(['check']);
    service.start();
    host.__rtdUpdate?.({ type: 'permission' });
    service.openSettings();
    expect(bridge.calls).toEqual(['check', 'start', 'settings']);
  });

  it('받는 중 [취소] → 다리 cancelUpdate + dismissed, [나중에]는 다리를 부르지 않는다', () => {
    const a = setup();
    a.service.checkOnce();
    a.host.__rtdUpdate?.({ type: 'available', ...OFFER });
    a.service.start();
    a.host.__rtdUpdate?.({ type: 'progress', received: 1, total: 10 });
    a.service.cancel();
    expect(a.bridge.calls).toEqual(['check', 'start', 'cancel']);
    expect(a.service.state.kind).toBe('dismissed');

    const b = setup();
    b.service.checkOnce();
    b.host.__rtdUpdate?.({ type: 'available', ...OFFER });
    b.service.later();
    expect(b.bridge.calls).toEqual(['check']);
    expect(b.service.state.kind).toBe('dismissed');
  });

  it('모양이 틀린 사건은 무시한다', () => {
    const { host, service } = setup();
    service.checkOnce();
    host.__rtdUpdate?.({ type: 'available', ...OFFER, version: 'javascript:alert(1)' });
    host.__rtdUpdate?.('garbage');
    expect(service.state.kind).toBe('checking');
  });

  it('다리 호출이 던지면 오류 상태 (확인 중이면 조용히) — 예외가 밖으로 나가지 않는다', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bridge = fakeBridge();
    bridge.checkUpdate = () => {
      throw new Error('boom');
    };
    const service = UpdateService.fromWindow({ RandomTDNative: bridge });
    expect(() => service?.checkOnce()).not.toThrow();
    expect(service?.state).toEqual({ kind: 'error', code: 'bridge', during: 'check' });
    warn.mockRestore();
  });
});

describe('화면 글', () => {
  it('릴리스 노트 정리: 설치 안내 줄·빈 줄 빼기, 제목·항목 모양, 30줄까지', () => {
    const body = [
      'Assets의 APK를 내려받아 설치하거나 기존 앱 위에 업데이트하세요 (v0.1.7과 같은 앱 ID·서명). 앱은 오프라인에서 동작합니다.',
      '',
      '### 바뀐 점',
      '- U-1 자동 릴리스·앱 안 업데이트',
      '* 맵 고침',
      '그냥 줄',
    ].join('\n');
    expect(cleanNotes(body)).toEqual(['바뀐 점', '• U-1 자동 릴리스·앱 안 업데이트', '• 맵 고침', '그냥 줄']);
    expect(cleanNotes('')).toEqual(['자잘한 개선이 들어 있어요.']);
    expect(cleanNotes(Array.from({ length: 50 }, (_, i) => `- ${i}`).join('\n'))).toHaveLength(30);
  });

  it('크기·진행률·실패 글', () => {
    expect(formatMb(14717353)).toBe('14.0MB');
    expect(progressPercent(50, 200)).toBe(25);
    expect(progressPercent(5, 0)).toBe(0);
    expect(progressPercent(300, 200)).toBe(100);
    expect(errorMessage('network')).toContain('인터넷');
    expect(errorMessage('aborted')).toBe('업데이트를 취소했어요');
    expect(errorMessage('digest')).toContain('지웠어요');
  });

  it('V2 M3: 업데이트 창 저장 안내는 진행 중 판이 끝날 수 있음을 말한다 (예전 \'저장한 판과 기록은 그대로\'는 거짓)', () => {
    expect(UPDATE_SAVE_NOTE).toContain('계정·기록은 그대로');
    expect(UPDATE_SAVE_NOTE).toContain('게임 규칙이 바뀐 업데이트면');
    expect(UPDATE_SAVE_NOTE).toContain('보상');
    const src = readFileSync(join(__dirname, '..', '..', 'src', 'ui', 'screens', 'UpdateDialog.ts'), 'utf8');
    expect(src).not.toContain('저장한 판과 기록은 그대로');
    expect(src.match(/UPDATE_SAVE_NOTE/g)?.length).toBe(3); // import 1 + 내려받기 전·설치 확인 2
  });
});
