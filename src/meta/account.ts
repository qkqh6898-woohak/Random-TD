/**
 * 계정 정보 (판 밖, M5에서는 최소한만): 계정 레벨과 히든 미션 영구 기록.
 *
 * - 계정 레벨: 예전 저장 자리. **정답은 이제 rtd.progress** (src/meta/progress.ts — G-3부터 처음 한 번 여기서 옮김). 도박 1000원(Lv7)·10000원(Lv20)
 *   테이블 해금에 쓴다 (배속은 모두 Lv1부터 — 예전 '×3 배속 Lv12'는 없다).
 *   판은 시작할 때 이 값을 MatchOptions.accountLevels로 받는다 (판 도중에는 바뀌지 않는 입력, 리플레이에 기록).
 * - 히든 미션 영구 기록 (GDD 8장 '히든은 ???로 표시, 달성 시 공개 + 영구 기록'): 한 번 달성한 히든 미션 id. 다음 판부터
 *   미션 시트 히든 탭에 이름이 보인다. 판 안 상태(sim)가 아니라 화면이 missionDone 사건을 받아 기록한다.
 * - 본 도움말 (F10 첫 승급 안내): 한 번 본(끝까지 보거나 닫은) 안내 id ('firstMerge' 등 · v0.1.22 'firstSummon' = 첫 판에서 타워를 놓음 → 다음 판부터 추천 칸 없음). 계정마다 한 번만 띄운다.
 *   일시정지 메뉴 [도움말 다시 보기]가 모두 지운다 (resetGuides).
 * 저장 형식: 키 'rtd.account' = JSON { v: 1, level, hidden: string[], guides: string[] }. 망가진 값은 버리고 기본값
 * (예전 저장에 guides가 없으면 빈 목록).
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
  /** 그 도움말을 이미 봤는가 (F10) */
  guideSeen(id: string): boolean;
  /** 도움말을 봤다고 기록. 새로 기록했으면 true */
  markGuide(id: string): boolean;
  /** 본 도움말 기록을 모두 지운다 ([도움말 다시 보기]) */
  resetGuides(): void;
  /** G-1 리미티드 도감: 발견한 조합(결과 타워 id) */
  codexFound(): ReadonlySet<string>;
  /** 조합 발견 기록. 새로 기록했으면 true */
  recordCodex(id: string): boolean;
}

/**
 * 리미티드 도감 한 칸 (G-1). 조합마다 객체로 두어 나중에 값을 더할 수 있게 한다
 * (G-3 '조각 모아 히든 영웅 해방'의 잠김/해방 표시 등 — 모르는 필드는 읽을 때 그대로 둔다).
 */
export interface CodexEntry {
  /** 발견함 (만들었거나 재료를 한꺼번에 가졌다) */
  found?: boolean;
  [extra: string]: unknown;
}

interface AccountSave {
  v: number;
  level: number;
  hidden: string[];
  guides: string[];
  /** G-1 리미티드 도감 (조합 id → 칸). 예전 저장에는 없다 → 빈 객체 */
  codex: Record<string, CodexEntry>;
}

function parse(raw: string | null): AccountSave {
  const empty: AccountSave = { v: VERSION, level: 1, hidden: [], guides: [], codex: {} };
  if (!raw) return empty;
  try {
    const o = JSON.parse(raw) as Partial<AccountSave>;
    const level = typeof o.level === 'number' && Number.isSafeInteger(o.level) && o.level >= 1 ? o.level : 1;
    const hidden = Array.isArray(o.hidden) ? o.hidden.filter((x): x is string => typeof x === 'string') : [];
    const guides = Array.isArray(o.guides) ? o.guides.filter((x): x is string => typeof x === 'string') : [];
    const codex: Record<string, CodexEntry> = {};
    if (o.codex && typeof o.codex === 'object' && !Array.isArray(o.codex)) {
      for (const [id, e] of Object.entries(o.codex)) if (e && typeof e === 'object' && !Array.isArray(e)) codex[id] = { ...(e as CodexEntry) };
    }
    return { v: VERSION, level, hidden, guides, codex };
  } catch {
    return empty;
  }
}

export function createAccountStore(storage: KeyValueStorage): AccountStore {
  const save = parse(storage.getItem(ACCOUNT_KEY));
  const found = new Set(save.hidden);
  const guides = new Set(save.guides);
  const codexFound = new Set(Object.entries(save.codex).filter(([, e]) => e.found === true).map(([id]) => id));
  const write = (): void => {
    const codex: Record<string, CodexEntry> = {};
    for (const id of Object.keys(save.codex).sort()) codex[id] = save.codex[id] as CodexEntry;
    storage.setItem(ACCOUNT_KEY, JSON.stringify({ v: VERSION, level: save.level, hidden: [...found].sort(), guides: [...guides].sort(), codex }));
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
    guideSeen: (id) => guides.has(id),
    markGuide(id) {
      if (guides.has(id)) return false;
      guides.add(id);
      write();
      return true;
    },
    resetGuides() {
      if (guides.size === 0) return;
      guides.clear();
      write();
    },
    codexFound: () => codexFound,
    recordCodex(id) {
      if (codexFound.has(id)) return false;
      codexFound.add(id);
      save.codex[id] = { ...(save.codex[id] ?? {}), found: true };
      write();
      return true;
    },
  };
}
