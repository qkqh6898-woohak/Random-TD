/**
 * 화면 설정 (판 밖, T-2): 저장소(KeyValueStorage) 키 'rtd.settings' = JSON { v: 2, tapMerge, effectsOff, revealHidden, … }.
 *
 * - tapMerge '눌러서 바로 승급' (기본 **꺼짐** — 피드백 #17 '3개 모였을 때 누르면 바로 승급하지 말고 정보창의 승급 버튼으로'):
 *   켜면 지금 승급할 수 있는 타워를 누르면 패널 없이 바로 승급. 꺼져 있으면 누르면 정보창이 열리고 [⬆ 승급]으로 승급한다.
 *   일시정지 메뉴·로비 설정에서 켤 수 있다. v1 저장값(예전 기본 켜짐)은 한 번 꺼짐으로 바꾼다 — v2로 저장된 값은 그대로 따른다.
 * - effectsOff '연출 끄기 (전체)' (개발자 도구): src/view/effects.ts 상태의 저장값. 개발자 모드가 아니면 읽어도 쓰지 않는다.
 * - revealHidden '히든 미션 조건 보기' (개발자 도구): 미션 시트가 히든 미션 이름·조건을 '???' 대신 보여 준다.
 * - autoSellNormal '노말 자동 판매' · autoSellRare '레어 이하 자동 판매' (피드백 #46, 기본 꺼짐): 방금 소환된 타워가 그 등급 이하면
 *   화면이 바로 sellTower 명령을 보낸다 (둘 다 켜면 레어 이하). 키가 없는 예전 값은 꺼짐.
 * 망가진 값은 버리고 기본값. 화면 설정이라 sim·리플레이와 무관하다.
 */
import type { KeyValueStorage } from '../save/storage';

export const SETTINGS_KEY = 'rtd.settings';
const VERSION = 2;

export interface Settings {
  tapMerge: boolean;
  effectsOff: boolean;
  revealHidden: boolean;
  /** G-1 '필살기 자동': 필살기가 차면 화면이 바로 ult 명령을 보낸다 (기본 꺼짐) */
  ultAuto: boolean;
  /** 피드백 #46 '노말 자동 판매' */
  autoSellNormal: boolean;
  /** 피드백 #46 '레어 이하 자동 판매' */
  autoSellRare: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({ tapMerge: false, effectsOff: false, revealHidden: false, ultAuto: false, autoSellNormal: false, autoSellRare: false });

/** 자동 판매 기준 등급 (이 등급 이하를 판다): 레어 이하가 켜져 있으면 'rare', 노말만이면 'normal', 둘 다 꺼짐이면 null. */
export function autoSellGrade(s: Readonly<Settings>): 'normal' | 'rare' | null {
  if (s.autoSellRare) return 'rare';
  return s.autoSellNormal ? 'normal' : null;
}

export interface SettingsStore {
  get(): Readonly<Settings>;
  set<K extends keyof Settings>(key: K, value: Settings[K]): void;
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
