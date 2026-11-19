/**
 * 피드백 #62 — '새 게임을 시작했을 때 이전 게임 설정을 초기화하기(노말 자동판매, 레어 판매 등)'
 * (이슈 제목만, 본문·판 기록 JSON 없음 → 리플레이 재현 대상 없음. 화면 설정이라 sim·리플레이와 무관).
 * 새 판을 시작하면 판 안 전략 스위치(노말 자동 판매·레어 이하 자동 판매·필살기 자동)는 꺼짐으로 돌아가고,
 * 조작·화면 취향(눌러서 바로 승급·연출 끄기·히든 보기)은 그대로 남는다. 이어 하기는 이 함수를 부르지 않는다.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, MATCH_SETTING_KEYS, SETTINGS_KEY, createSettingsStore, resetMatchSettings } from '../../src/meta/settings';
import { MemoryStorage } from '../../src/save/storage';

describe('resetMatchSettings (새 판 시작)', () => {
  it('판 안 스위치는 기본값(꺼짐)으로 돌아가고 저장된다', () => {
    const st = new MemoryStorage();
    const s = createSettingsStore(st);
    s.set('autoSellNormal', true);
    s.set('autoSellRare', true);
    s.set('ultAuto', true);
    resetMatchSettings(s);
    expect(s.get()).toMatchObject({ autoSellNormal: false, autoSellRare: false, ultAuto: false });
    expect(createSettingsStore(st).get()).toMatchObject({ autoSellNormal: false, autoSellRare: false, ultAuto: false });
    expect(JSON.parse(st.getItem(SETTINGS_KEY) ?? '{}')).toMatchObject({ autoSellNormal: false, autoSellRare: false, ultAuto: false });
  });

  it('조작·화면 취향(눌러서 바로 승급·연출 끄기·히든 보기)은 그대로', () => {
    const s = createSettingsStore(new MemoryStorage());
    s.set('tapMerge', false);
    s.set('effectsOff', true);
    s.set('revealHidden', true);
    s.set('autoSellNormal', true);
    resetMatchSettings(s);
    expect(s.get()).toEqual({ ...DEFAULT_SETTINGS, tapMerge: false, effectsOff: true, revealHidden: true });
  });

  it('초기화 대상은 판 안 스위치 세 개, 기본값은 모두 꺼짐', () => {
    expect([...MATCH_SETTING_KEYS].sort()).toEqual(['autoSellNormal', 'autoSellRare', 'ultAuto']);
    for (const k of MATCH_SETTING_KEYS) expect(DEFAULT_SETTINGS[k]).toBe(false);
  });

  it('이미 기본값이면 저장소에 쓰지 않는다', () => {
    const st = new MemoryStorage();
    resetMatchSettings(createSettingsStore(st));
    expect(st.getItem(SETTINGS_KEY)).toBeNull();
  });
});
