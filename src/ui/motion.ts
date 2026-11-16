/** 기기의 '동작 줄이기' 설정 (prefers-reduced-motion: reduce). matchMedia가 없으면 false. 화면 전용. */
export function prefersReducedMotion(win: { matchMedia?: (q: string) => { matches: boolean } } = globalThis as never): boolean {
  try {
    return typeof win.matchMedia === 'function' && win.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
