/**
 * 화면 설정 (판 밖, T-2): 저장소(KeyValueStorage) 키 'rtd.settings' = JSON { v: 2, tapMerge, effectsOff, revealHidden, … }.
 *
 * - tapMerge '눌러서 바로 승급' (기본 **꺼짐** — 피드백 #17 '3개 모였을 때 누르면 바로 승급하지 말고 정보창의 승급 버튼으로'):
 *   켜면 지금 승급할 수 있는 타워를 누르면 패널 없이 바로 승급. 꺼져 있으면 누르면 정보창이 열리고 [⬆ 승급]으로 승급한다.
 *   일시정지 메뉴·로비 설정에서 켤 수 있다. v1 저장값(예전 기본 켜짐)은 한 번 꺼짐으로 바꾼다 — v2로 저장된 값은 그대로 따른다.
 * - effectsOff (기본 false = 효과 보임): 화면 이름은 '✨ 화려한 효과'로 반대로 보인다(결정 M: 스위치 켜짐 = effectsOff false). src/view/effects.ts 상태의 저장값. 피드백 #75부터 일반 설정 — 일시정지 메뉴·로비 설정에서
 *   켜고 끄고(개발자 도구 '연출 끄기 (전체)'도 같은 값), 일반·개발자 모드 모두 따른다. 판 안 스위치가 아니라(MATCH_SETTING_KEYS에 없음) 새 판에도 남는다.
 *   저장 형식은 v2 그대로 (필드는 T-2부터 있었고, 키가 없는 예전 값은 꺼짐). 예전엔 개발자 주소(?debug=1·?dev=1)에서만 쓸 수 있던 값이라
 *   켜짐이 남아 있을 수 있는 건 개발자 주소를 열어 본 기기뿐이다 (앱은 주소를 바꿀 수 없음) → 따로 옮기거나 지우지 않는다
 *   (그런 기기는 메뉴에 '켜짐'으로 보이고 바로 끌 수 있다).
 * - revealHidden '히든 미션 조건 보기' (개발자 도구): 미션 시트가 히든 미션 이름·조건을 '???' 대신 보여 준다.
 * - autoSellNormal '노말 자동 판매' · autoSellRare '레어 이하 자동 판매' (피드백 #46, 기본 꺼짐): 방금 소환된 타워가 그 등급 이하면
 *   화면이 바로 sellTower 명령을 보낸다 (둘 다 켜면 레어 이하). 키가 없는 예전 값은 꺼짐.
 * - autoMergeNormal '노말' · autoMergeRare '레어 이하' · autoMergeUnique '유니크 이하' 자동 승급 (피드백 #63, 셋 중 하나만 고름,
 *   기본 = DEFAULT_AUTO_MERGE_GRADE '유니크 이하' — 사용자 결정 Q): 그 등급 이하의 가득 찬 무더기가 생기면 화면이 평소 mergeStack 명령을
 *   보낸다 (sim 규칙 그대로 — 연쇄도 손으로 누른 승급과 같다). 자동 판매와 겹치는 등급은 판매보다 승급이 먼저
 *   (autoSellMinRank: 그 등급은 팔지 않는다 → 기본값 그대로면 노말·레어 자동 판매는 팔 것이 없다). 키가 없는 v2 값은 기본값 (저장 형식 v2 그대로).
 * - 사용자 결정 (FB-AD · Q): 자동 승급(유니크 이하)·필살기 자동 기본 켜짐. 저장 형식·저장값은 그대로 — 이어 하는 판은 저장값을 따르고,
 *   다음 새 판부터(피드백 #62 초기화) 켜진 채 시작한다. 판 안에서 일시정지 메뉴로 끌 수 있다.
 * - 피드백 #62: 판 안 전략 스위치(MATCH_SETTING_KEYS = 필살기 자동·노말 자동 판매·레어 이하 자동 판매·자동 승급 셋)는 새 판을 시작하면
 *   기본값(자동 판매 꺼짐 · 자동 승급 유니크 이하 · 필살기 자동 켜짐)으로 돌아간다 (resetMatchSettings, 이어 하기는 그대로). 조작·화면 취향은 판을 넘어 남는다.
 * - 사용자 결정 R: 무엇을 새 판마다 기본값으로 돌릴지는 묶음별 체크 박스(로비 ⚙ 설정 '새 판을 시작하면 기본값으로') —
 *   resetUltAuto(필살기 자동) · resetAutoSell(자동 판매 둘) · resetAutoMerge(자동 승급 셋), 기본 모두 true(= #62 동작 그대로).
 *   끈 묶음은 지난 판에서 고른 값이 다음 새 판에도 남는다. 이 체크 값 자체는 계정 취향이라 초기화하지 않는다. 키가 없는 예전 값은 true.
 * 망가진 값은 버리고 기본값. 화면 설정이라 sim·리플레이와 무관하다.
 */
import type { KeyValueStorage } from '../save/storage';

export const SETTINGS_KEY = 'rtd.settings';
const VERSION = 2;

export interface Settings {
  tapMerge: boolean;
  /** 피드백 #75 효과 끔 (계정 설정, 새 판에도 남는다). 화면 스위치 '✨ 화려한 효과'는 이 값의 반대 (결정 M) */
  effectsOff: boolean;
  revealHidden: boolean;
  /** G-1 '필살기 자동': 필살기가 차면 화면이 바로 ult 명령을 보낸다 (기본 켜짐 — 사용자 결정 FB-AD, 예전 기본 꺼짐) */
  ultAuto: boolean;
  /** 피드백 #46 '노말 자동 판매' */
  autoSellNormal: boolean;
  /** 피드백 #46 '레어 이하 자동 판매' */
  autoSellRare: boolean;
  /** 피드백 #63 자동 승급 '노말' · '레어 이하' · '유니크 이하' (화면은 하나만 켠다, 여럿이 켜져 있으면 가장 높은 등급) */
  autoMergeNormal: boolean;
  autoMergeRare: boolean;
  autoMergeUnique: boolean;
  /** 사용자 결정 R: 새 판을 시작하면 필살기 자동을 기본값으로 (기본 true) */
  resetUltAuto: boolean;
  /** 사용자 결정 R: 새 판을 시작하면 자동 판매 둘을 기본값으로 (기본 true) */
  resetAutoSell: boolean;
  /** 사용자 결정 R: 새 판을 시작하면 자동 승급 셋을 기본값으로 (기본 true) */
  resetAutoMerge: boolean;
}

/** 자동 승급 기준 등급 (이 등급 이하를 승급한다) */
export type AutoMergeGrade = 'normal' | 'rare' | 'unique';

/** 자동 승급 설정 키 — 낮은 등급부터 (등급 번호 = 자리 + 1, sim rules.gradeRank와 같다: 노말 1 · 레어 2 · 유니크 3) */
export const AUTO_MERGE_KEYS = ['autoMergeNormal', 'autoMergeRare', 'autoMergeUnique'] as const satisfies readonly (keyof Settings)[];
const AUTO_MERGE_GRADES: readonly AutoMergeGrade[] = ['normal', 'rare', 'unique'];

/** 사용자 결정 Q: 새 판의 자동 승급 기본 등급 = 유니크 이하 */
export const DEFAULT_AUTO_MERGE_GRADE: AutoMergeGrade = 'unique';
/** 사용자 결정 (FB-AD): 새 판의 필살기 자동 기본값 = 켜짐 */
export const DEFAULT_ULT_AUTO = true;

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  tapMerge: false,
  effectsOff: false,
  revealHidden: false,
  ultAuto: DEFAULT_ULT_AUTO,
  autoSellNormal: false,
  autoSellRare: false,
  ...autoMergeChoice(DEFAULT_AUTO_MERGE_GRADE),
  resetUltAuto: true,
  resetAutoSell: true,
  resetAutoMerge: true,
});

/** 자동 승급 기준 등급 번호: 켜진 것 중 가장 높은 등급 (노말 1 · 레어 2 · 유니크 3), 모두 꺼짐이면 0. */
export function autoMergeRank(s: Readonly<Settings>): number {
  for (let i = AUTO_MERGE_KEYS.length - 1; i >= 0; i--) if (s[AUTO_MERGE_KEYS[i] as (typeof AUTO_MERGE_KEYS)[number]]) return i + 1;
  return 0;
}

/** 일시정지 메뉴에서 자동 승급 하나를 고른 값 (다른 둘은 꺼짐). null = 모두 꺼짐. */
export function autoMergeChoice(grade: AutoMergeGrade | null): Pick<Settings, (typeof AUTO_MERGE_KEYS)[number]> {
  const i = grade === null ? -1 : AUTO_MERGE_GRADES.indexOf(grade);
  return { autoMergeNormal: i === 0, autoMergeRare: i === 1, autoMergeUnique: i === 2 };
}

/**
 * 자동 판매가 팔기 시작하는 등급 번호 (피드백 #63 × #46): 자동 승급이 맡는 등급(autoMergeRank 이하)은 팔지 않는다 —
 * 3개를 모아 승급하려는 등급을 소환하자마자 팔면 승급이 영영 안 되기 때문. 판매 상한(autoSellGrade)은 그대로.
 */
export function autoSellMinRank(s: Readonly<Settings>): number {
  return autoMergeRank(s) + 1;
}

/** 자동 판매 기준 등급 (이 등급 이하를 판다): 레어 이하가 켜져 있으면 'rare', 노말만이면 'normal', 둘 다 꺼짐이면 null. */
export function autoSellGrade(s: Readonly<Settings>): 'normal' | 'rare' | null {
  if (s.autoSellRare) return 'rare';
  return s.autoSellNormal ? 'normal' : null;
}

/** 피드백 #62: 새 판을 시작하면 기본값으로 돌아갈 수 있는 판 안 스위치 */
export const MATCH_SETTING_KEYS = ['ultAuto', 'autoSellNormal', 'autoSellRare', ...AUTO_MERGE_KEYS] as const satisfies readonly (keyof Settings)[];

/** 사용자 결정 R: 판 안 스위치 묶음과 '새 판이면 기본값으로' 체크 키 (묶음을 합치면 MATCH_SETTING_KEYS) */
export type MatchSettingGroupId = 'ult' | 'autoSell' | 'autoMerge';
export const MATCH_SETTING_GROUPS = [
  { id: 'ult', flag: 'resetUltAuto', keys: ['ultAuto'] },
  { id: 'autoSell', flag: 'resetAutoSell', keys: ['autoSellNormal', 'autoSellRare'] },
  { id: 'autoMerge', flag: 'resetAutoMerge', keys: AUTO_MERGE_KEYS },
] as const satisfies readonly { id: MatchSettingGroupId; flag: keyof Settings; keys: readonly (typeof MATCH_SETTING_KEYS)[number][] }[];

export interface SettingsStore {
  get(): Readonly<Settings>;
  set<K extends keyof Settings>(key: K, value: Settings[K]): void;
}

/**
 * 피드백 #62: 새 판 시작 — 판 안 스위치를 기본값으로 (이미 기본값이면 저장하지 않는다).
 * 사용자 결정 R: '새 판이면 기본값으로' 체크가 꺼진 묶음은 건드리지 않는다 (지난 판 값이 남는다).
 */
export function resetMatchSettings(store: SettingsStore): void {
  for (const g of MATCH_SETTING_GROUPS) {
    if (!store.get()[g.flag]) continue;
    for (const k of g.keys) store.set(k, DEFAULT_SETTINGS[k]);
  }
}

export function parseSettings(raw: string | null): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  if (!raw) return out;
  try {
    const o = JSON.parse(raw) as Partial<Record<keyof Settings | 'v', unknown>>;
    for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
      if (typeof o[k] === 'boolean') out[k] = o[k] as boolean;
    }
    // v1(이전 버전, 기본 켜짐) → 피드백 #17: 한 번 꺼짐으로. v2부터는 플레이어가 고른 값을 그대로
    if (typeof o.v !== 'number' || o.v < 2) out.tapMerge = false;
  } catch {
    // 망가진 값: 기본값
  }
  return out;
}

export function createSettingsStore(storage: KeyValueStorage): SettingsStore {
  const cur = parseSettings(storage.getItem(SETTINGS_KEY));
  return {
    get: () => cur,
    set(key, value) {
      if (cur[key] === value) return;
      cur[key] = value;
      storage.setItem(SETTINGS_KEY, JSON.stringify({ v: VERSION, ...cur }));
    },
  };
}
