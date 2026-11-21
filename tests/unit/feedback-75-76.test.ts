/**
 * 피드백 #75 '이펙트 끄기 버튼 / 효과 끄기 버튼' + #76 '영웅모집 보상받고 창 안닫히게 · 10배 한번에 받기'.
 *
 * #75: 개발자 도구에만 있던 '연출 끄기'(effectsOff)를 일반 설정 '✨ 효과 끄기'로 — 계정 설정(rtd.settings v2) 그대로, 새 판에도 남는다.
 * #76: 모집 게이지는 목표를 넘어 쌓인다 → 받을 수 있는 횟수 = ⌊게이지 / goal⌋. [10번 한 번에 받기]는 그중 최대 multiClaim번을
 *      한 번 받기(claimRecruit)를 되풀이해 받고(같은 난수 순서), 보상을 합쳐 한 번 저장한다.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, MATCH_SETTING_KEYS, SETTINGS_KEY, createSettingsStore, parseSettings, resetMatchSettings } from '../../src/meta/settings';
import { MemoryStorage } from '../../src/save/storage';
import { effectsOff, onEffectsChange, saveEffectsOff, setEffectsOff } from '../../src/view/effects';

describe('피드백 #75 ✨ 효과 끄기 (계정 설정 effectsOff)', () => {
  it('기본 꺼짐(효과 켜짐) · 키가 없는 v1·v2 저장값도 꺼짐 · 저장된 켜짐은 그대로 읽힌다 (형식 v2 그대로, 지우지 않음)', () => {
    expect(DEFAULT_SETTINGS.effectsOff).toBe(false);
    expect(parseSettings(null).effectsOff).toBe(false);
    expect(parseSettings('{"tapMerge":true}').effectsOff).toBe(false); // v1 (버전 없음)
    expect(parseSettings('{"v":2,"tapMerge":true,"autoSellRare":true}')).toEqual({ ...DEFAULT_SETTINGS, tapMerge: true, autoSellRare: true });
    expect(parseSettings('{"v":2,"effectsOff":true}').effectsOff).toBe(true);
    expect(parseSettings('{"v":1,"effectsOff":true}').effectsOff).toBe(true);
    expect(parseSettings('{"v":2,"effectsOff":"yes"}').effectsOff).toBe(false);
    expect(parseSettings('망가짐').effectsOff).toBe(false);
  });

  it('바꾸면 rtd.settings에 저장되고 다시 열어도 남는다 · 다른 설정은 그대로', () => {
    const st = new MemoryStorage();
    st.setItem(SETTINGS_KEY, JSON.stringify({ v: 2, tapMerge: true, autoMergeRare: true }));
    const a = createSettingsStore(st);
    a.set('effectsOff', true);
    expect(JSON.parse(st.getItem(SETTINGS_KEY)!)).toMatchObject({ v: 2, effectsOff: true, tapMerge: true, autoMergeRare: true });
    expect(createSettingsStore(st).get().effectsOff).toBe(true);
    a.set('effectsOff', false);
    expect(createSettingsStore(st).get().effectsOff).toBe(false);
  });

  it('판 안 스위치가 아니다 — 새 판 시작(resetMatchSettings)에도 남는다', () => {
    expect(MATCH_SETTING_KEYS as readonly string[]).not.toContain('effectsOff');
    const st = new MemoryStorage();
    const store = createSettingsStore(st);
    store.set('effectsOff', true);
    store.set('autoSellNormal', true);
    resetMatchSettings(store);
    expect(store.get().effectsOff).toBe(true);
    expect(store.get().autoSellNormal).toBe(false);
    expect(createSettingsStore(st).get().effectsOff).toBe(true);
  });

  it('saveEffectsOff: 화면 상태(effectsOff)와 계정 설정을 함께 바꾸고 구독자에게 알린다 (일시정지·로비·개발자 도구가 같은 길)', () => {
    const st = new MemoryStorage();
    const store = createSettingsStore(st);
    const seen: boolean[] = [];
    const off = onEffectsChange((v) => seen.push(v));
    try {
      saveEffectsOff(store, true);
      expect(effectsOff()).toBe(true);
      expect(store.get().effectsOff).toBe(true);
      saveEffectsOff(store, false);
      expect(effectsOff()).toBe(false);
      expect(store.get().effectsOff).toBe(false);
      expect(seen).toEqual([true, false]);
    } finally {
      off();
      setEffectsOff(false);
    }
  });
});
