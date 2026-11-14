// tools/check-determinism.mjs 의 타입 선언 (테스트에서 import할 때 사용)
export interface Violation {
  file: string;
  line: number;
  col: number;
  rule: string;
  why: string;
}
export const RULES: readonly { id: string; pattern: RegExp; why: string }[];
export function stripCommentsAndStrings(src: string): { code: string; strings: { value: string; index: number }[] };
export function scanSource(src: string, file: string, absPath?: string | null): Violation[];
export function scanDirs(dirs: string[]): { files: string[]; violations: Violation[] };
