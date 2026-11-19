/**
 * 저장소 인터페이스 (CLAUDE.md 1장 '저장: Storage 인터페이스 뒤에 localStorage 구현').
 * 나중에 Capacitor Preferences로 바꿀 수 있게 판 밖 코드(meta·save)는 이 인터페이스만 쓴다.
 * localStorage는 사생활 보호 모드·용량 초과에서 예외를 던질 수 있어 모두 삼키고 메모리로 이어 간다 (게임에 영향 없음).
 */

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /** 마지막 setItem이 기기 저장소에 못 쓰고 메모리에만 남았는가 (A-1b: 자동 저장 실패 알림). 메모리 저장소는 없음 */
  readonly lastWriteFailed?: boolean;
}

/** 메모리 저장소 (테스트·localStorage를 못 쓸 때). */
export class MemoryStorage implements KeyValueStorage {
  private readonly map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }
}

/**
 * 브라우저 localStorage를 감싼 저장소. 읽기·쓰기 예외는 삼키고 메모리 사본으로 이어 간다.
 *
 * V2 검토 M1: 쓰기(또는 지우기)가 기기 저장소에서 실패한 키는 '메모리가 정답'으로 표시해 두고, 다음 쓰기·지우기가 성공할 때까지
 * getItem이 디스크의 옛 값이 아니라 메모리 사본을 돌려준다 — 예전엔 한 번 실패하면 옛 값이 보여 자동 저장(토큰 비교)이 판 내내 멈추고
 * 패배 뒤 지우기도 못 해 끝난 판이 타이틀에 되살아났다. 디스크에는 여전히 옛 값이 있을 수 있다(앱을 다시 켜면 마지막으로 써진 값).
 */
export class BrowserStorage implements KeyValueStorage {
  private readonly fallback = new MemoryStorage();
  /** 마지막 쓰기·지우기가 기기 저장소에 반영되지 않은 키 (메모리 사본이 정답) */
  private readonly memoryOnly = new Set<string>();
  lastWriteFailed = false;

  constructor(private readonly ls: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null) {}

  getItem(key: string): string | null {
    if (this.memoryOnly.has(key)) return this.fallback.getItem(key);
    try {
      const v = this.ls?.getItem(key);
      if (v !== null && v !== undefined) return v;
    } catch {
      // 접근 거부 (사생활 보호 모드 등)
    }
    return this.fallback.getItem(key);
  }

  setItem(key: string, value: string): void {
    this.fallback.setItem(key, value);
    try {
      this.ls?.setItem(key, value);
      this.memoryOnly.delete(key);
      this.lastWriteFailed = false;
    } catch {
      // 용량 초과·접근 거부: 메모리 사본만 (이 키는 메모리가 정답)
      this.memoryOnly.add(key);
      this.lastWriteFailed = true;
    }
  }

  removeItem(key: string): void {
    this.fallback.removeItem(key);
    try {
      this.ls?.removeItem(key);
      this.memoryOnly.delete(key);
    } catch {
      // 디스크에서 못 지움: 이번 실행 동안은 지운 것으로 본다 (옛 값이 되살아나지 않게)
      this.memoryOnly.add(key);
    }
  }
}

/** 이 환경에서 쓸 기본 저장소 (localStorage가 없으면 메모리). */
export function defaultStorage(): KeyValueStorage {
  let ls: Storage | null = null;
  try {
    ls = typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    ls = null;
  }
  return new BrowserStorage(ls);
}
