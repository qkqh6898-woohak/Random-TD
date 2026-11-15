/**
 * 계정 정보 (판 밖, M5에서는 최소한만): 계정 레벨과 히든 미션 영구 기록.
 *
 * - 계정 레벨: 도박 1000원 테이블(Lv7)·10000원 테이블(Lv20)·×3 배속(Lv12) 해금에 쓴다 (GDD 7.2, UI.md 4.2).
 *   경험치·레벨 오르기는 M8(계정 성장)에서 붙인다. 그 전에는 저장된 값이 없으면 1.
 *   판은 시작할 때 이 값을 MatchOptions.accountLevels로 받는다 (판 도중에는 바뀌지 않는 입력, 리플레이에 기록).
 * - 히든 미션 영구 기록 (GDD 8장 '히든은 ???로 표시, 달성 시 공개 + 영구 기록'): 한 번 달성한 히든 미션 id. 다음 판부터
 *   미션 시트 히든 탭에 이름이 보인다. 판 안 상태(sim)가 아니라 화면이 missionDone 사건을 받아 기록한다.
 * 저장 형식: 키 'rtd.account' = JSON { v: 1, level, hidden: string[] }. 망가진 값은 버리고 기본값.
 */
import type { KeyValueStorage } from '../save/storage';

export const ACCOUNT_KEY = 'rtd.account';
const VERSION = 1;

export interface AccountStore {
  /** 계정 레벨 (1 이상 정수) */
  level(): number;
  /** 지금까지 발견한 히든 미션 id */
  hiddenFound(): ReadonlySet<string>;
  /** 히든 미션 발견 기록. 새로 기록했으면 true */
  recordHidden(id: string): boolean;
}

interface AccountSave {
  v: number;
  level: number;
  hidden: string[];
}

function parse(raw: string | null): AccountSave {
  const empty: AccountSave = { v: VERSION, level: 1, hidden: [] };
  if (!raw) return empty;
  try {
    const o = JSON.parse(raw) as Partial<AccountSave>;
    const level = typeof o.level === 'number' && Number.isSafeInteger(o.level) && o.level >= 1 ? o.level : 1;
    const hidden = Array.isArray(o.hidden) ? o.hidden.filter((x): x is string => typeof x === 'string') : [];
    return { v: VERSION, level, hidden };
  } catch {
    return empty;
  }
}

export function createAccountStore(storage: KeyValueStorage): AccountStore {
  const save = parse(storage.getItem(ACCOUNT_KEY));
  const found = new Set(save.hidden);
  const write = (): void => {
    storage.setItem(ACCOUNT_KEY, JSON.stringify({ v: VERSION, level: save.level, hidden: [...found].sort() }));
  };
  return {
    level: () => save.level,
    hiddenFound: () => found,
    recordHidden(id) {
      if (found.has(id)) return false;
      found.add(id);
      write();
      return true;
    },
  };
}
