// tools/build-single.mjs 의 타입 선언 (테스트에서 import할 때 사용)
export const OUT_DIR: string;
export const RELEASE_FILE: string;
export type FileTable = Record<string, string | Uint8Array>;
export function mimeOf(path: string): string;
export function escapeInlineScript(js: string): string;
export function escapeInlineStyle(css: string): string;
export function normalizeRef(ref: string): string;
export function buildAssetTable(files: FileTable, exclude?: Set<string>): Record<string, unknown>;
export function assetsScriptTag(table: Record<string, unknown>): string;
export function inlineSingleHtml(html: string, files: FileTable): string;
export function readTree(dir: string): Record<string, Buffer>;
export function singleDevBuild(value: string | undefined): boolean;
