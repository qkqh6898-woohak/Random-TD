/**
 * 지난 판 기록 (개발자 도구, F10-4 검토 — 결정 6): 판이 끝나거나(패배) 판을 떠날 때 '이번 판 기록' 줄을 최근 3판까지 남긴다.
 * 보스 시간 초과로 지면 패배 화면이 🛠를 덮고, [다시 하기]·새 판이 기록을 지워 실제 휴대폰 시험에서 값을 읽을 수 없었다.
 * 개발자 시험용이라 이 탭(세션)에만 둔다: sessionStorage (막혀 있으면 메모리만). 게임 저장(계정)과 섞지 않는다.
 */

export interface PastRun {
  /** 예: '10단계 패배 · 보스 시간 초과' */
  title: string;
  rows: { label: string; value: string }[];
}

const KEY = 'rtd.dev.pastRuns';
export const PAST_RUNS_MAX = 3;

let mem: PastRun[] | null = null;

function isRun(x: unknown): x is PastRun {
  const r = x as Partial<PastRun> | null;
  return !!r && typeof r.title === 'string' && Array.isArray(r.rows) && r.rows.every((w) => !!w && typeof w.label === 'string' && typeof w.value === 'string');
}

function load(): PastRun[] {
  if (mem) return mem;
  mem = [];
  try {
    const raw = globalThis.sessionStorage?.getItem(KEY);
    const v: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(v)) mem = v.filter(isRun).slice(0, PAST_RUNS_MAX);
  } catch {
    // 저장소가 막혀 있으면 메모리만
  }
  return mem;
}

/** 최근 판이 앞. */
export function pastRuns(): readonly PastRun[] {
  return load();
}

export function pushPastRun(run: PastRun): void {
  const list = [run, ...load()].slice(0, PAST_RUNS_MAX);
  mem = list;
  try {
    globalThis.sessionStorage?.setItem(KEY, JSON.stringify(list));
  } catch {
    // 무시
  }
}

/** 테스트용 */
export function clearPastRuns(): void {
  mem = [];
  try {
    globalThis.sessionStorage?.removeItem(KEY);
  } catch {
    // 무시
  }
}
