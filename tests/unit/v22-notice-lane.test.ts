/**
 * v0.1.22 사용자 결정 A① 위쪽 알림 한 줄: 하나만 보이고, 새 알림이 바꿔 치며, 같은 종류는 합쳐 '×n'.
 * DOM 그리기는 e2e/v22-screens.spec.ts가 본다 (빠르게 3개 → 1개만 보임, 가장 최근 글자).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAX_VISIBLE_NOTICES, NOTICE_BANNER_HOLD_MS, NOTICE_MIN_FONT_PX, fitFontPx, nextNotice, noticeCountText, noticeWaitMs } from '../../src/ui/noticeLane';

describe('v0.1.22 알림 한 줄', () => {
  it('한 번에 하나만 보인다', () => {
    expect(MAX_VISIBLE_NOTICES).toBe(1);
  });
  it('다른 종류는 바꿔 치고(1부터), 같은 종류는 수를 더한다', () => {
    let s = nextNotice(null, '125원이 더 필요해요');
    expect(s).toEqual({ kind: '125원이 더 필요해요', count: 1 });
    s = nextNotice(s, '125원이 더 필요해요');
    expect(s.count).toBe(2);
    s = nextNotice(s, 'ult-nuke');
    expect(s).toEqual({ kind: 'ult-nuke', count: 1 });
    s = nextNotice(nextNotice(s, 'ult-nuke'), 'ult-nuke');
    expect(s.count).toBe(3);
    expect(noticeCountText(1)).toBe('');
    expect(noticeCountText(3)).toBe('×3');
  });
  it('글자 맞추기: 넘치면 줄이되 12px 아래로는 줄이지 않는다', () => {
    expect(fitFontPx(14, 200, 300)).toBe(14);
    expect(fitFontPx(14, 330, 300)).toBeCloseTo(12.7, 5);
    expect(fitFontPx(14, 1000, 300)).toBe(NOTICE_MIN_FONT_PX);
    expect(fitFontPx(12, 1000, 300)).toBe(12);
    expect(fitFontPx(18, 1000, 300)).toBe(12);
    expect(fitFontPx(40, 1000, 300)).toBe(24); // 원래의 60%가 12px보다 크면 그것
  });
  it('배너는 1.5초 동안 일반 알림에 밀리지 않는다 (배너끼리·같은 종류는 바로 바뀜)', () => {
    expect(NOTICE_BANNER_HOLD_MS).toBe(1500);
    const banner = { kind: '히든 미션 발견!', prio: 2, holdUntil: 1500 };
    expect(noticeWaitMs(null, 'x', 1, 0)).toBe(0);
    expect(noticeWaitMs(banner, '5단계 시작!', 1, 100)).toBe(1400);
    expect(noticeWaitMs(banner, '5단계 시작!', 1, 1600)).toBe(0);
    expect(noticeWaitMs(banner, '보스 등장!', 2, 100)).toBe(0);
    expect(noticeWaitMs(banner, '히든 미션 발견!', 1, 100)).toBe(0);
    expect(noticeWaitMs({ kind: 'a', prio: 1, holdUntil: 0 }, 'b', 1, 0)).toBe(0);
  });
  it('UiRoot는 알림과 배너 모두 한 줄 규칙을 쓰고, 필살기 알림은 종류로 합친다', () => {
    const root = readFileSync(new URL('../../src/ui/root.ts', import.meta.url), 'utf8');
    expect(root).toContain('MAX_VISIBLE_NOTICES');
    expect(root).not.toContain('MAX_TOASTS = 3');
    expect((root.match(/this\.pushNotice\(/g) ?? []).length).toBe(2);
    const game = readFileSync(new URL('../../src/view/scenes/Game.ts', import.meta.url), 'utf8');
    expect(game).toContain('`ult-${k}`');
  });
});
