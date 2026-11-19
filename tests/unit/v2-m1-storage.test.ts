/**
 * V2 검토 M1: 기기 저장소 쓰기가 한 번 실패하면(용량 초과·접근 거부) BrowserStorage.getItem이 디스크의 옛 값을 계속 돌려줘
 * MatchSaves 자동 저장이 그 판 내내 죽고(토큰 불일치), 패배 뒤 clear()도 못 해 끝난 판이 타이틀에 되살아나던 것.
 */
import { describe, expect, it } from 'vitest';
import { createMatch } from '../../src/sim/match';
import { MatchSaves, MATCH_SLOT } from '../../src/save/MatchSaves';
import { BrowserStorage } from '../../src/save/storage';
import { data } from '../helpers/match';

/** 가짜 localStorage: full이면 setItem이 용량 초과, denyRemove면 removeItem이 실패 */
function fakeLs() {
  const map = new Map<string, string>();
  const ctl = { full: false, denyRemove: false };
  const ls = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (ctl.full) throw new Error('QuotaExceededError');
      map.set(k, v);
    },
    removeItem: (k: string) => {
      if (ctl.denyRemove) throw new Error('막힘');
      map.delete(k);
    },
  };
  return { map, ctl, ls };
}

describe('M1 BrowserStorage: 실패한 쓰기 뒤 옛 디스크 값을 돌려주지 않는다', () => {
  it('쓰기 실패 → getItem은 메모리의 새 값, 나중 쓰기가 성공하면 디스크에도', () => {
    const { map, ctl, ls } = fakeLs();
    const st = new BrowserStorage(ls);
    st.setItem('k', 'v1');
    ctl.full = true;
    st.setItem('k', 'v2');
    expect(st.lastWriteFailed).toBe(true);
    expect(map.get('k')).toBe('v1');
    expect(st.getItem('k')).toBe('v2');
    ctl.full = false;
    st.setItem('k', 'v3');
    expect(st.lastWriteFailed).toBe(false);
    expect(map.get('k')).toBe('v3');
    expect(st.getItem('k')).toBe('v3');
  });

  it('다른 키는 영향 없음 (디스크 값 그대로 읽음)', () => {
    const { map, ctl, ls } = fakeLs();
    map.set('other', 'disk');
    const st = new BrowserStorage(ls);
    ctl.full = true;
    st.setItem('k', 'mem');
    expect(st.getItem('other')).toBe('disk');
  });

  it('지우기가 디스크에서 실패해도 getItem은 null (옛 값이 되살아나지 않음)', () => {
    const { ctl, ls } = fakeLs();
    const st = new BrowserStorage(ls);
    st.setItem('k', 'v1');
    ctl.denyRemove = true;
    st.removeItem('k');
    expect(st.getItem('k')).toBeNull();
  });
});

describe('M1 MatchSaves: 한 번 실패해도 자동 저장이 이어지고, 끝난 판은 되살아나지 않는다', () => {
  it('용량 초과 → 공간이 나면 다음 자동 저장이 된다 → clear() 뒤 슬롯 없음', () => {
    const { map, ctl, ls } = fakeLs();
    const saves = new MatchSaves(data, new BrowserStorage(ls), { version: 'test', dev: false });
    const m = createMatch(data, { seed: 3, mode: 'infinite' });
    let tok = saves.write(m, 1, null, 'run1');
    expect(tok).not.toBeNull();
    m.stepN(100);
    ctl.full = true;
    tok = saves.write(m, 1, tok, 'run1') ?? tok;
    expect(saves.persistFailed).toBe(true);
    ctl.full = false;
    m.stepN(100);
    const t3 = saves.write(m, 1, tok, 'run1');
    expect(t3).not.toBeNull();
    expect(saves.persistFailed).toBe(false);
    expect(saves.read()?.match.tick).toBe(200);
    saves.clear(t3!);
    expect(map.has(MATCH_SLOT)).toBe(false);
    expect(saves.read()).toBeNull();
  });

  it('용량 초과가 이어진 채 판이 끝나도 clear()가 디스크의 옛 저장을 지운다 (패배한 판이 타이틀에 안 뜸)', () => {
    const { map, ctl, ls } = fakeLs();
    const saves = new MatchSaves(data, new BrowserStorage(ls), { version: 'test', dev: false });
    const m = createMatch(data, { seed: 4, mode: 'infinite' });
    let tok = saves.write(m, 1, null, 'run2');
    m.stepN(50);
    ctl.full = true;
    tok = saves.write(m, 1, tok, 'run2') ?? tok;
    m.stepN(50);
    tok = saves.write(m, 1, tok, 'run2') ?? tok;
    expect(tok).not.toBeNull();
    saves.clear(tok!);
    expect(map.has(MATCH_SLOT)).toBe(false);
    expect(saves.read()).toBeNull();
  });
});
