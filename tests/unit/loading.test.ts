import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { loadingProgress } from '../../src/ui/loading/model';
import { bindLoading } from '../../src/ui/loading/bindLoading';

it.each([[0, .62, .62], [.62, .4, .62], [0, -1, 0], [.6, 2, 1], [.3, NaN, .3], [NaN, .4, .4], [Infinity, 1, 1]])('loading progress %s → %s stays finite and monotonic', (before, next, expected) => {
  expect(loadingProgress(before, next)).toBe(expected);
});

describe('loading lifecycle adapter', () => {
  const controller = () => ({ setProgress: vi.fn(), completeStartup: vi.fn(), beginTransition: vi.fn(), endTransition: vi.fn(), destroy: vi.fn() });
  it('uses real loader and scene readiness events without controlling the game', () => {
    const events = new EventEmitter(); const ui = controller(); const unbind = bindLoading(events, ui);
    events.emit('rtd:loading-progress', .7); expect(ui.setProgress).toHaveBeenCalledWith(.7);
    events.emit('rtd:title-ready'); expect(ui.completeStartup).toHaveBeenCalledTimes(1); expect(ui.endTransition).toHaveBeenCalledTimes(1);
    events.emit('rtd:scene-loading'); expect(ui.beginTransition).toHaveBeenCalledTimes(1);
    events.emit('rtd:game-ready'); expect(ui.endTransition).toHaveBeenCalledTimes(2);
    unbind(); events.emit('rtd:scene-loading'); expect(ui.beginTransition).toHaveBeenCalledTimes(1);
    expect(events.eventNames()).toEqual([]);
  });
  it('destroys loading UI and unregisters listeners when the game is destroyed', () => {
    const events = new EventEmitter(); const ui = controller(); bindLoading(events, ui);
    events.emit('destroy'); events.emit('destroy'); events.emit('rtd:loading-progress', .8);
    expect(ui.destroy).toHaveBeenCalledTimes(1); expect(ui.setProgress).not.toHaveBeenCalled(); expect(events.eventNames()).toEqual([]);
  });
});
