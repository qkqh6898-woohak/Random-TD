/**
 * 피드백 #75 '이펙트 끄기 버튼 / 효과 끄기 버튼' + #76 '영웅모집 보상받고 창 안닫히게 · 10배 한번에 받기'.
 *
 * #75: 개발자 도구에만 있던 '연출 끄기'(effectsOff)를 일반 설정으로 — 계정 설정(rtd.settings v2) 그대로, 새 판에도 남는다.
 *      결정 M: 화면 이름은 '✨ 화려한 효과' (켜짐 = 효과 보임 = effectsOff false). 저장값은 그대로 effectsOff.
 * #76: 모집 게이지는 목표를 넘어 쌓인다 → 받을 수 있는 횟수 = ⌊게이지 / goal⌋. [10번 한 번에 받기]는 그중 최대 multiClaim번을
 *      한 번 받기(claimRecruit)를 되풀이해 받고(같은 난수 순서), 보상을 합쳐 한 번 저장한다.
 */
import { describe, expect, it } from 'vitest';
import { loadGameData } from '../../src/data/load';
import { loadProgression, parseProgression, type ProgressionData } from '../../src/meta/progressionData';
import { claimRecruit, claimRecruitMany, newProgress, recruitClaimable, recruitMultiCount, type Grant, type ProgressState } from '../../src/meta/progress';
import { ProgressStore, PROGRESS_KEY } from '../../src/meta/progressStore';
import { DEFAULT_SETTINGS, MATCH_SETTING_KEYS, SETTINGS_KEY, createSettingsStore, parseSettings, resetMatchSettings } from '../../src/meta/settings';
import { MemoryStorage } from '../../src/save/storage';
import { effectsOff, onEffectsChange, saveEffectsOff, setEffectsOff } from '../../src/view/effects';
import { grantView, recruitDialogModel, recruitReady, recruitResultText } from '../../src/ui/lobby/lobbyModel';
import { EFFECTS_DESC, EFFECTS_LABEL, effectsOffFromSwitch, fancyEffectsOn } from '../../src/ui/screens/PauseMenu';
import progressionJson from '../../src/data/progression.json';

const data = loadGameData();
const pd: ProgressionData = loadProgression(data);
const GOAL = pd.recruit.goal;
const fresh = (recruit = 0): ProgressState => {
  const s = newProgress(pd, data, 4242);
  s.recruit = recruit;
  return s;
};
const cardSum = (g: Grant): number => g.cards.reduce((a, c) => a + c.n, 0);

describe('피드백 #75 효과 끔 (계정 설정 effectsOff, 화면 이름 ✨ 화려한 효과)', () => {
  it("결정 M: 화면 이름 '✨ 화려한 효과' — 이중 부정 없음, 스위치 켜짐 = 효과 보임 = effectsOff false (기본은 켜짐으로 보인다)", () => {
    expect(EFFECTS_LABEL).toBe('✨ 화려한 효과');
    expect(EFFECTS_LABEL).not.toContain('끄기');
    expect(EFFECTS_DESC).not.toContain('꺼요');
    expect(fancyEffectsOn(DEFAULT_SETTINGS.effectsOff)).toBe(true);
    expect(fancyEffectsOn(false)).toBe(true);
    expect(fancyEffectsOn(true)).toBe(false);
    expect(effectsOffFromSwitch(true)).toBe(false);
    expect(effectsOffFromSwitch(false)).toBe(true);
    for (const off of [false, true]) expect(effectsOffFromSwitch(fancyEffectsOn(off))).toBe(off);
  });

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

describe('피드백 #76 영웅 모집 여러 번 받기 (모델)', () => {
  it('데이터: multiClaim = 10 (progression.json), 2 미만이면 데이터 오류', () => {
    expect(pd.recruit.multiClaim).toBe(10);
    const bad = structuredClone(progressionJson) as { recruit: { multiClaim: number } };
    bad.recruit.multiClaim = 1;
    expect(() => parseProgression(bad, data)).toThrow(/multiClaim/);
  });

  it('받을 수 있는 횟수 = ⌊게이지 / goal⌋, 이번에 받을 횟수는 최대 10 (0·1·3·10·15번)', () => {
    const cases: [number, number, number][] = [
      // [게이지, 받을 수 있음, 이번에 받음]
      [0, 0, 0],
      [GOAL - 1, 0, 0],
      [GOAL, 1, 1],
      [GOAL * 3 + 7, 3, 3],
      [GOAL * 10, 10, 10],
      [GOAL * 15 + 2, 15, 10],
    ];
    for (const [r, can, now] of cases) {
      const s = fresh(r);
      expect(recruitClaimable(s, pd), `게이지 ${r}`).toBe(can);
      expect(recruitMultiCount(s, pd), `게이지 ${r}`).toBe(now);
      expect(recruitReady(s, pd)).toBe(can > 0 ? 1 : 0);
    }
  });

  it('0번: 아무것도 바뀌지 않고 null', () => {
    const s = fresh(GOAL - 1);
    const before = JSON.stringify(s);
    expect(claimRecruitMany(s, pd, data)).toBeNull();
    expect(JSON.stringify(s)).toBe(before);
  });

  it('1·3·10·15번: 받은 횟수만큼 게이지가 줄고, 보상은 n번 합 (카드 5n장·보석 10n), 15번이면 10번만 받고 5번 남음', () => {
    const per = pd.recruit.reward;
    for (const [r, n, left] of [
      [GOAL, 1, 0],
      [GOAL * 3 + 7, 3, 7],
      [GOAL * 10, 10, 0],
      [GOAL * 15 + 2, 10, GOAL * 5 + 2],
    ] as const) {
      const s = fresh(r);
      const gems0 = s.gems;
      const got = claimRecruitMany(s, pd, data)!;
      expect(got.count).toBe(n);
      expect(s.recruit).toBe(left);
      expect(cardSum(got.grant)).toBe((per.cards ?? 0) * n);
      expect(got.grant.gems).toBe((per.gems ?? 0) * n);
      expect(s.gems - gems0).toBe((per.gems ?? 0) * n);
      // 같은 영웅 카드는 한 줄로 합쳐진다
      expect(new Set(got.grant.cards.map((c) => c.id)).size).toBe(got.grant.cards.length);
    }
  });

  it('n번 한 번에 = 한 번 받기를 n번 누른 것과 똑같다 (같은 계정 난수 순서 → 같은 카드·같은 저장 상태)', () => {
    const a = fresh(GOAL * 4);
    const b = fresh(GOAL * 4);
    const many = claimRecruitMany(a, pd, data)!;
    const singles: Grant[] = [];
    for (let i = 0; i < 4; i++) singles.push(claimRecruit(b, pd, data)!);
    expect(claimRecruit(b, pd, data)).toBeNull();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const total = new Map<string, number>();
    for (const g of singles) for (const c of g.cards) total.set(c.id, (total.get(c.id) ?? 0) + c.n);
    expect(new Map(many.grant.cards.map((c) => [c.id, c.n]))).toEqual(total);
  });

  it('ProgressStore.claimRecruitMany: 저장 한 번 · 다시 읽어도 같은 상태 · 알림 한 번', () => {
    const st = new MemoryStorage();
    const store = new ProgressStore(st, pd, data, { now: () => new Date(2026, 10, 20) });
    store.state.recruit = GOAL * 3;
    let writes = 0;
    const setItem = st.setItem.bind(st);
    st.setItem = (k: string, v: string) => {
      if (k === PROGRESS_KEY) writes++;
      setItem(k, v);
    };
    let notes = 0;
    store.subscribe(() => notes++);
    const got = store.claimRecruitMany()!;
    expect(got.count).toBe(3);
    expect([writes, notes]).toEqual([1, 1]);
    const again = new ProgressStore(st, pd, data, { now: () => new Date(2026, 10, 20) });
    expect(again.state.recruit).toBe(0);
    expect(JSON.stringify(again.state)).toBe(JSON.stringify(store.state));
    // 받을 것이 없으면 저장·알림 없음
    expect(store.claimRecruitMany()).toBeNull();
    expect([writes, notes]).toEqual([1, 1]);
  });

  it('창 모델: 버튼 글자 · 누를 수 있음 (2번 이상일 때만 [10번 한 번에 받기])', () => {
    const m0 = recruitDialogModel(fresh(17), pd);
    expect(m0).toMatchObject({ progressText: `17/${GOAL}`, claimable: 0, singleEnabled: false, singleText: '게이지를 채워 주세요', multiEnabled: false, multiText: '10번 한 번에 받기 (가능 0)' });
    const m1 = recruitDialogModel(fresh(GOAL + 4), pd);
    expect(m1).toMatchObject({ progressText: `${GOAL}/${GOAL}`, pct: 100, claimable: 1, singleEnabled: true, singleText: '모집 보상 받기', multiEnabled: false, multiText: '10번 한 번에 받기 (가능 1)' });
    const m3 = recruitDialogModel(fresh(GOAL * 3), pd);
    expect(m3).toMatchObject({ claimable: 3, multiEnabled: true, multiCount: 3, multiText: '10번 한 번에 받기 (가능 3)', multiAria: '10번 한 번에 받기 (가능 3) · 이번에 3번 받아요' });
    const m15 = recruitDialogModel(fresh(GOAL * 15), pd);
    expect(m15).toMatchObject({ claimable: 15, multiEnabled: true, multiCount: 10, multiText: '10번 한 번에 받기 (가능 15)' });
  });

  it('받은 보상 한 줄: 1번은 "영웅 카드 ×5 · 💎 +10", 여러 번은 "모집 n번 · …"', () => {
    const s1 = fresh(GOAL);
    const g1 = claimRecruit(s1, pd, data)!;
    expect(recruitResultText(1, grantView(g1, data))).toBe('영웅 카드 ×5 · 💎 +10');
    const s3 = fresh(GOAL * 3);
    const g3 = claimRecruitMany(s3, pd, data)!;
    expect(recruitResultText(g3.count, grantView(g3.grant, data))).toBe('모집 3번 · 영웅 카드 ×15 · 💎 +30');
  });
});
