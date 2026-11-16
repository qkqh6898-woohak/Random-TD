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

/** 브라우저 localStorage를 감싼 저장소. 읽기·쓰기 예외는 삼키고 메모리 사본으로 이어 간다. */
export class BrowserStorage implements KeyValueStorage {
  private readonly fallback = new MemoryStorage();
  lastWriteFailed = false;

  constructor(private readonly ls: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null) {}

  getItem(key: string): string | null {
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
      this.lastWriteFailed = false;
    } catch {
      // 용량 초과·접근 거부: 메모리 사본만
      this.lastWriteFailed = true;
    }
  }

  removeItem(key: string): void {
    this.fallback.removeItem(key);
    try {
      this.ls?.removeItem(key);
    } catch {
      // 무시
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
