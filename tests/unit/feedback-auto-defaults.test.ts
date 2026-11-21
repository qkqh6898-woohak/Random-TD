/**
 * 사용자 결정 FB-AD · Q · R — '자동 승급과 필살기 자동 사용은 디폴트 값으로' · '자동 승급 기본 유니크 이하' ·
 * '차라리 새판마다 디폴트 하고 싶은건 체크 박스로 하게 하자'.
 * 화면 설정이라 sim·리플레이와 무관 (저장 형식 v2 그대로, 키가 없는 예전 값은 기본값).
 */
import { describe, expect, it } from 'vitest';
import {
  AUTO_MERGE_KEYS,
  DEFAULT_AUTO_MERGE_GRADE,
  DEFAULT_SETTINGS,
  DEFAULT_ULT_AUTO,
  MATCH_SETTING_GROUPS,
  MATCH_SETTING_KEYS,
  SETTINGS_KEY,
  autoMergeChoice,
  autoMergeRank,
  autoSellMinRank,
  createSettingsStore,
  parseSettings,
  resetMatchSettings,
} from '../../src/meta/settings';
import { MemoryStorage } from '../../src/save/storage';
import { autoSellDesc, matchDefaultText, matchResetLabel } from '../../src/ui/screens/PauseMenu';

describe('결정 FB-AD·Q: 자동 승급(유니크 이하)·필살기 자동 기본 켜짐', () => {
  it('새 저장소 기본값: 필살기 자동 켜짐 · 자동 승급 유니크 이하(등급 3) · 자동 판매 꺼짐', () => {
    expect(DEFAULT_ULT_AUTO).toBe(true);
    expect(DEFAULT_AUTO_MERGE_GRADE).toBe('unique');
    const s = createSettingsStore(new MemoryStorage()).get();
    expect(s.ultAuto).toBe(true);
    expect(autoMergeRank(s)).toBe(3);
    expect(s).toMatchObject({ autoSellNormal: false, autoSellRare: false, ...autoMergeChoice('unique') });
    // 기본값 그대로면 노말·레어 자동 판매는 팔 등급이 없다 (승급이 먼저)
    expect(autoSellMinRank({ ...s, autoSellRare: true })).toBe(4);
  });

  it('플레이어가 끈 뒤 새 판(resetMatchSettings) → 다시 켜짐', () => {
    const st = new MemoryStorage();
    const s = createSettingsStore(st);
    s.set('ultAuto', false);
    for (const k of AUTO_MERGE_KEYS) s.set(k, false);
    expect(autoMergeRank(s.get())).toBe(0);
    resetMatchSettings(s);
    expect(s.get().ultAuto).toBe(true);
    expect(autoMergeRank(s.get())).toBe(3);
    expect(createSettingsStore(st).get()).toMatchObject({ ultAuto: true, autoMergeUnique: true });
  });

  it('저장된 명시 값은 그대로 읽힌다 (이어 하는 판은 저장값을 따른다)', () => {
    const off = parseSettings(JSON.stringify({ v: 2, ultAuto: false, autoMergeNormal: false, autoMergeRare: false, autoMergeUnique: false }));
    expect(off.ultAuto).toBe(false);
    expect(autoMergeRank(off)).toBe(0);
    const normal = parseSettings(JSON.stringify({ v: 2, ultAuto: true, autoMergeNormal: true, autoMergeRare: false, autoMergeUnique: false }));
    expect(autoMergeRank(normal)).toBe(1);
  });

  it('일시정지 메뉴 자동 판매 설명은 자동 승급이 맡는 등급을 팔지 않는다고 알린다', () => {
    expect(autoSellDesc('normal', null)).toBe('소환된 노말을 바로 팔아요');
    expect(autoSellDesc('rare', null)).toBe('소환된 노말·레어를 바로 팔아요');
    expect(autoSellDesc('normal', 'normal')).toContain('팔지 않아요');
    expect(autoSellDesc('rare', 'normal')).toBe('소환된 레어만 팔아요 · 노말은 자동 승급');
    for (const g of ['rare', 'unique'] as const) {
      expect(autoSellDesc('normal', g)).toContain('팔지 않아요');
      expect(autoSellDesc('rare', g)).toContain('팔지 않아요');
    }
  });
});

describe('결정 R: 새 판마다 기본값으로 돌릴 묶음을 체크 박스로', () => {
  it('묶음 셋을 합치면 판 안 스위치 전부 · 체크 기본은 모두 켜짐 · 체크 값은 판 안 스위치가 아니다', () => {
    expect(MATCH_SETTING_GROUPS.map((g) => g.id)).toEqual(['ult', 'autoSell', 'autoMerge']);
    expect(MATCH_SETTING_GROUPS.flatMap((g) => [...g.keys]).sort()).toEqual([...MATCH_SETTING_KEYS].sort());
    for (const g of MATCH_SETTING_GROUPS) {
      expect(DEFAULT_SETTINGS[g.flag]).toBe(true);
      expect(MATCH_SETTING_KEYS as readonly string[]).not.toContain(g.flag);
    }
  });

  it('모두 체크(기본) = 예전 #62 동작: 판 안 스위치 전부 기본값으로', () => {
    const s = createSettingsStore(new MemoryStorage());
    s.set('ultAuto', false);
    s.set('autoSellNormal', true);
    s.set('autoSellRare', true);
    s.set('autoMergeUnique', false);
    s.set('autoMergeRare', true);
    resetMatchSettings(s);
    for (const k of MATCH_SETTING_KEYS) expect(s.get()[k]).toBe(DEFAULT_SETTINGS[k]);
  });

  it('체크를 끈 묶음은 새 판에도 지난 값이 남고, 켠 묶음만 기본값으로 · 체크 값 자체는 초기화되지 않는다', () => {
    const st = new MemoryStorage();
    const s = createSettingsStore(st);
    s.set('resetAutoMerge', false);
    s.set('resetAutoSell', false);
    s.set('ultAuto', false);
    s.set('autoSellNormal', true);
    for (const k of AUTO_MERGE_KEYS) s.set(k, false);
    resetMatchSettings(s);
    expect(s.get().ultAuto).toBe(true); // 필살기 자동 체크는 켜져 있음 → 기본값
    expect(s.get().autoSellNormal).toBe(true); // 자동 판매 체크 꺼짐 → 남음
    expect(autoMergeRank(s.get())).toBe(0); // 자동 승급 체크 꺼짐 → 끈 그대로
    expect(s.get()).toMatchObject({ resetUltAuto: true, resetAutoSell: false, resetAutoMerge: false });
    // 저장되고 다시 읽어도 같다
    const again = createSettingsStore(st);
    expect(again.get()).toMatchObject({ resetAutoSell: false, resetAutoMerge: false, autoSellNormal: true, autoMergeUnique: false, ultAuto: true });
    resetMatchSettings(again);
    expect(again.get()).toMatchObject({ resetAutoSell: false, resetAutoMerge: false });
  });

  it('체크 키가 없는 예전 저장값은 모두 켜짐으로 읽힌다 (저장 형식 v2 그대로) · 불리언이 아니면 기본값', () => {
    const old = parseSettings(JSON.stringify({ v: 2, tapMerge: true, ultAuto: false, autoSellRare: true }));
    expect(old).toMatchObject({ resetUltAuto: true, resetAutoSell: true, resetAutoMerge: true, tapMerge: true, ultAuto: false, autoSellRare: true });
    expect(parseSettings('{"v":2,"resetUltAuto":"no","resetAutoMerge":false}')).toMatchObject({ resetUltAuto: true, resetAutoMerge: false });
    const st = new MemoryStorage();
    createSettingsStore(st).set('resetUltAuto', false);
    expect(JSON.parse(st.getItem(SETTINGS_KEY) ?? '{}')).toMatchObject({ v: 2, resetUltAuto: false });
  });

  it('체크 박스 글자의 (기본 …)는 DEFAULT_SETTINGS에서 만든다', () => {
    expect(matchResetLabel('ult')).toBe('필살기 자동 (기본 켜짐)');
    expect(matchResetLabel('autoSell')).toBe('자동 판매 (기본 꺼짐)');
    expect(matchResetLabel('autoMerge')).toBe('자동 승급 (기본 유니크 이하)');
    const other = { ...DEFAULT_SETTINGS, ultAuto: false, autoSellNormal: true, ...autoMergeChoice('normal') };
    expect([matchDefaultText('ult', other), matchDefaultText('autoSell', other), matchDefaultText('autoMerge', other)]).toEqual(['꺼짐', '노말', '노말']);
    expect(matchDefaultText('autoMerge', { ...DEFAULT_SETTINGS, ...autoMergeChoice(null) })).toBe('꺼짐');
  });
});
