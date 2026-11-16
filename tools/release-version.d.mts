// tools/release-version.mjs 의 타입 선언 (테스트에서 import할 때 사용)
export type Semver = [number, number, number];
export const TAG_PREFIX: string;
export const PART_LIMIT: number;
export const MAX_VERSION_CODE: number;
export function parseSemver(text: string): Semver | null;
export function compareSemver(a: Semver, b: Semver): number;
export function formatSemver(v: Semver): string;
export function parseTag(tag: string): Semver | null;
export function versionCode(v: string | Semver): number;
export function planRelease(
  base: string,
  tags: string[],
  opts?: { currentCode?: number },
): { version: string; versionCode: number; previousTag: string | null; bumped: boolean };
export function rewriteManifest(xml: string, version: string, code: number): string;
export function readManifestCode(xml: string): number | null;
export function writeVersion(root: string, version: string, code: number): void;
