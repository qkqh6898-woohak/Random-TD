import { describe, expect, it } from 'vitest';
import { DataError } from '../../src/data/load';
import { describeFatal, installFatalHandlers, type FatalTarget } from '../../src/ui/fatal';

/** window 대신 쓰는 가짜 이벤트 대상. */
function fakeTarget(): FatalTarget & { emit(type: 'error' | 'unhandledrejection', props: object): void; count(): number } {
  const listeners = new Map<string, Set<(ev: Event) => void>>();
  return {
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    emit(type, props) {
      for (const fn of listeners.get(type) ?? []) fn(props as unknown as Event);
    },
    count() {
      let n = 0;
      for (const set of listeners.values()) n += set.size;
      return n;
    },
  };
}

describe('치명적 오류 화면 문구', () => {
  it('데이터 오류는 시작 중이든 게임 중이든 데이터 문구', () => {
    const e = new DataError('towers.json', [{ path: 'factions.kingdom.color', message: '색은 #RRGGBB 형식' }]);
    expect(describeFatal(e, 'boot').title).toBe('데이터 파일에 문제가 있어요');
    expect(describeFatal(e, 'run').title).toBe('데이터 파일에 문제가 있어요');
    expect(describeFatal(e, 'run').detail).toContain('factions.kingdom.color');
  });

  it('그 밖의 오류는 단계별 문구, 내용은 메시지', () => {
    expect(describeFatal(new Error('x'), 'boot')).toEqual({ title: '게임을 시작하지 못했어요', detail: 'x' });
    expect(describeFatal(new TypeError('y'), 'run')).toEqual({ title: '게임 중 문제가 생겼어요', detail: 'y' });
    expect(describeFatal('문자열', 'run').detail).toBe('문자열');
  });
});

describe('전역 오류 처리기 (장면 create·update 안의 예외)', () => {
  it("'error' 이벤트의 예외를 받아 한 번만 알린다", () => {
    const t = fakeTarget();
    const got: unknown[] = [];
    installFatalHandlers(t, (e) => got.push(e));
    const boom = new Error('boom');
    t.emit('error', { error: boom, message: 'Uncaught Error: boom' });
    t.emit('error', { error: new Error('again'), message: 'again' }); // 매 프레임 반복돼도
    expect(got).toEqual([boom]);
  });

  it("'unhandledrejection'의 reason을 알린다", () => {
    const t = fakeTarget();
    const got: unknown[] = [];
    installFatalHandlers(t, (e) => got.push(e));
    t.emit('unhandledrejection', { reason: 'nope' });
    expect(got).toEqual(['nope']);
  });

  it('예외 객체가 없으면 메시지로, ResizeObserver 알림은 무시', () => {
    const t = fakeTarget();
    const got: unknown[] = [];
    installFatalHandlers(t, (e) => got.push(e));
    t.emit('error', { error: null, message: 'ResizeObserver loop completed with undelivered notifications.' });
    expect(got).toEqual([]);
    t.emit('error', { error: null, message: 'Script error.' });
    expect(got).toEqual(['Script error.']);
  });

  it('해제하면 더 받지 않는다', () => {
    const t = fakeTarget();
    const off = installFatalHandlers(t, () => {});
    expect(t.count()).toBe(2);
    off();
    expect(t.count()).toBe(0);
  });
});
