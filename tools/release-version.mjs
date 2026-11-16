#!/usr/bin/env node
/**
 * 릴리스 버전 정하기 (U-1): main에 푸시할 때마다 새 APK가 나가도록 버전을 자동으로 고른다.
 *
 * 입력: package.json version(기준) + 이미 있는 `android-v*` 태그 목록.
 * 규칙:
 *  - 기준 버전이 이미 나온 가장 높은 태그보다 크면(또는 태그가 하나도 없으면) 기준 그대로 (사람이 0.2.0처럼 올린 경우).
 *  - 아니면 가장 높은 태그의 다음 patch (0.1.9가 있으면 0.1.10). 기준이 태그보다 낮아도 내려가지 않는다 (versionCode는 늘 커져야 업데이트 설치).
 *  - 모양이 틀린 태그(android-v1.2, android-vX, android-v01.2.3 …)는 무시한다.
 *  - versionCode = major × 1,000,000 + minor × 1,000 + patch. minor·patch가 1000 이상이면 거절(코드가 겹침) → package.json을 손으로 올린다.
 *  - versionCode는 지금 AndroidManifest의 versionCode보다 커야 한다.
 *
 * 사용 (CI, .github/workflows/android.yml):
 *   git tag -l 'android-v*' > tags.txt
 *   node tools/release-version.mjs --tags-file tags.txt [--write]
 *   → 표준 출력에 `version=…` `versionCode=…` `previousTag=…` (GITHUB_OUTPUT에 그대로 붙임)
 *   --write: package.json · package-lock.json(맨 위 두 곳) · android/AndroidManifest.xml에 그 버전을 쓴다 (CI 작업 폴더에서만, 커밋하지 않음).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEMVER = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/;
export const TAG_PREFIX = 'android-v';
/** versionCode 자리 한계: minor·patch는 0~999 */
export const PART_LIMIT = 1000;
/** Google Play·안드로이드 versionCode 최대 */
export const MAX_VERSION_CODE = 2100000000;

/** 'x.y.z' → [x, y, z], 틀리면 null */
export function parseSemver(text) {
  const m = SEMVER.exec(String(text).trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function compareSemver(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}

export function formatSemver(v) {
  return `${v[0]}.${v[1]}.${v[2]}`;
}

/** 'android-v0.1.9' → [0, 1, 9], 아니면 null */
export function parseTag(tag) {
  const t = String(tag).trim().replace(/^refs\/tags\//, '');
  return t.startsWith(TAG_PREFIX) ? parseSemver(t.slice(TAG_PREFIX.length)) : null;
}

export function versionCode(v) {
  const parts = typeof v === 'string' ? parseSemver(v) : v;
  if (!parts) throw new Error(`버전이 x.y.z가 아니다: ${v}`);
  const [major, minor, patch] = parts;
  if (minor >= PART_LIMIT || patch >= PART_LIMIT) {
    throw new Error(`minor·patch는 ${PART_LIMIT} 미만이어야 한다 (${formatSemver(parts)}) — package.json version을 다음 minor/major로 올리세요`);
  }
  const code = major * 1000000 + minor * 1000 + patch;
  if (code < 1 || code > MAX_VERSION_CODE) throw new Error(`versionCode ${code}가 범위(1~${MAX_VERSION_CODE}) 밖이다`);
  return code;
}

/**
 * @param {string} base package.json version
 * @param {string[]} tags 태그 이름들 (android-v… 이외·모양이 틀린 것은 무시)
 * @param {{ currentCode?: number }} [opts] 지금 AndroidManifest versionCode (결과가 이보다 커야 함)
 * @returns {{ version: string, versionCode: number, previousTag: string | null, bumped: boolean }}
 */
export function planRelease(base, tags, opts = {}) {
  const baseV = parseSemver(base);
  if (!baseV) throw new Error(`package.json version이 x.y.z가 아니다: ${base}`);
  let highest = null;
  for (const tag of tags) {
    const v = parseTag(tag);
    if (v && (highest === null || compareSemver(v, highest) > 0)) highest = v;
  }
  let next;
  if (highest === null || compareSemver(baseV, highest) > 0) next = baseV;
  else next = [highest[0], highest[1], highest[2] + 1];
  const code = versionCode(next);
  const current = opts.currentCode;
  if (current !== undefined && current !== null && !(code > current)) {
    throw new Error(`새 versionCode ${code}가 지금 AndroidManifest versionCode ${current}보다 크지 않다`);
  }
  return {
    version: formatSemver(next),
    versionCode: code,
    previousTag: highest === null ? null : `${TAG_PREFIX}${formatSemver(highest)}`,
    bumped: compareSemver(next, baseV) !== 0,
  };
}

/** AndroidManifest의 versionName·versionCode를 바꾼 글 (속성이 정확히 하나씩 있어야 함) */
export function rewriteManifest(xml, version, code) {
  const name = /android:versionName="[^"]*"/g;
  const vc = /android:versionCode="[^"]*"/g;
  if ((xml.match(name) ?? []).length !== 1 || (xml.match(vc) ?? []).length !== 1) {
    throw new Error('AndroidManifest에 versionName·versionCode가 하나씩 있어야 한다');
  }
  return xml.replace(name, `android:versionName="${version}"`).replace(vc, `android:versionCode="${code}"`);
}

export function readManifestCode(xml) {
  const m = /android:versionCode="(\d+)"/.exec(xml);
  return m ? Number(m[1]) : null;
}

/** package.json·package-lock.json(맨 위 version + packages[""].version)·AndroidManifest에 버전을 쓴다 */
export function writeVersion(root, version, code) {
  const pkgPath = join(root, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.version = version;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

  const lockPath = join(root, 'package-lock.json');
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  lock.version = version;
  if (!lock.packages || !lock.packages['']) throw new Error('package-lock.json에 packages[""]가 없다');
  lock.packages[''].version = version;
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

  const manifestPath = join(root, 'android', 'AndroidManifest.xml');
  writeFileSync(manifestPath, rewriteManifest(readFileSync(manifestPath, 'utf8'), version, code));
}

function main(argv) {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  let tagsFile = null;
  let write = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tags-file') tagsFile = argv[++i] ?? null;
    else if (a === '--write') write = true;
    else throw new Error(`모르는 인자: ${a}`);
  }
  const tagsText = tagsFile ? readFileSync(tagsFile, 'utf8') : readFileSync(0, 'utf8');
  const tags = tagsText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const base = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  const currentCode = readManifestCode(readFileSync(join(root, 'android', 'AndroidManifest.xml'), 'utf8'));
  const plan = planRelease(base, tags, { currentCode: currentCode ?? undefined });
  if (write) writeVersion(root, plan.version, plan.versionCode);
  process.stdout.write(`version=${plan.version}\nversionCode=${plan.versionCode}\npreviousTag=${plan.previousTag ?? ''}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  }
}
