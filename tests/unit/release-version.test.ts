/**
 * U-1 자동 릴리스 버전 (tools/release-version.mjs): main 푸시마다 새 APK가 나가도록 package.json 기준 + 기존 android-v* 태그로 버전을 고른다.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  compareSemver,
  parseSemver,
  parseTag,
  planRelease,
  readManifestCode,
  rewriteManifest,
  versionCode,
  writeVersion,
} from '../../tools/release-version.mjs';

const ROOT = resolve(__dirname, '../..');
const SCRIPT = join(ROOT, 'tools/release-version.mjs');

describe('semver·태그 읽기', () => {
  it('x.y.z만 받는다 (앞자리 0·접미사·빈칸 거절)', () => {
    expect(parseSemver('0.1.9')).toEqual([0, 1, 9]);
    expect(parseSemver('10.20.300')).toEqual([10, 20, 300]);
    for (const bad of ['0.1', '0.1.9.1', 'v0.1.9', '01.2.3', '0.1.9-beta', '0.1.x', '', ' . . ']) expect(parseSemver(bad)).toBeNull();
  });

  it('숫자로 비교한다 (글자 비교가 아님: 0.1.10 > 0.1.9)', () => {
    expect(compareSemver([0, 1, 10], [0, 1, 9])).toBe(1);
    expect(compareSemver([0, 2, 0], [0, 1, 99])).toBe(1);
    expect(compareSemver([1, 0, 0], [0, 999, 999])).toBe(1);
    expect(compareSemver([0, 1, 9], [0, 1, 9])).toBe(0);
    expect(compareSemver([0, 1, 8], [0, 1, 9])).toBe(-1);
  });

  it('android-v<semver> 태그만 (refs/tags/ 앞머리 허용, 다른 태그·틀린 모양 무시)', () => {
    expect(parseTag('android-v0.1.9')).toEqual([0, 1, 9]);
    expect(parseTag('refs/tags/android-v0.1.10')).toEqual([0, 1, 10]);
    for (const bad of ['v0.1.9', 'android-v0.1', 'android-vX.Y.Z', 'android-v0.1.9-rc1', 'codex/android-apk-v0.1.7', 'android-0.1.9']) {
      expect(parseTag(bad)).toBeNull();
    }
  });
});

describe('versionCode', () => {
  it('major×1000000 + minor×1000 + patch', () => {
    expect(versionCode('0.1.10')).toBe(1010);
    expect(versionCode('0.2.0')).toBe(2000);
    expect(versionCode('1.0.0')).toBe(1000000);
    expect(versionCode([0, 999, 999])).toBe(999999);
  });

  it('minor·patch가 1000 이상이면 거절 (코드가 겹침)', () => {
    expect(() => versionCode('0.1.1000')).toThrow(/1000/);
    expect(() => versionCode('0.1000.0')).toThrow(/1000/);
    expect(() => versionCode('0.0.0')).toThrow(/범위/);
    expect(() => versionCode('2101.0.0')).toThrow(/범위/);
  });

  it('지금 버전 공식(0.1.9 → 1009)은 예전 손 번호 10보다 크다 — 다음 릴리스부터 늘 커진다', () => {
    expect(versionCode('0.1.10')).toBeGreaterThan(10);
  });
});

describe('planRelease', () => {
  const real = ['android-v0.1.7', 'android-v0.1.8', 'android-v0.1.9'];

  it('지금 저장소: package.json 0.1.9 + 태그 0.1.7~0.1.9 → 0.1.10 (versionCode 1010), 이전 태그 android-v0.1.9', () => {
    expect(planRelease('0.1.9', real, { currentCode: 10 })).toEqual({
      version: '0.1.10',
      versionCode: 1010,
      previousTag: 'android-v0.1.9',
      bumped: true,
    });
  });

  it('기준 버전의 태그가 없고 가장 높은 태그보다 크면 기준 그대로 (손으로 0.2.0으로 올림)', () => {
    expect(planRelease('0.2.0', real)).toMatchObject({ version: '0.2.0', versionCode: 2000, previousTag: 'android-v0.1.9', bumped: false });
  });

  it('태그가 하나도 없으면 기준 그대로, 이전 태그 없음', () => {
    expect(planRelease('0.1.9', [])).toMatchObject({ version: '0.1.9', previousTag: null, bumped: false });
  });

  it('자동으로 올린 뒤 다음 푸시: 0.1.10 태그가 생기면 0.1.11 (package.json은 0.1.9 그대로)', () => {
    expect(planRelease('0.1.9', [...real, 'android-v0.1.10']).version).toBe('0.1.11');
  });

  it('순서와 상관없이 가장 높은 태그 (글자 순서 아님), 틀린 태그는 무시', () => {
    const tags = ['android-v0.1.10', 'android-v0.1.9', 'android-v0.1.2', 'android-v9.9', 'android-vbad', 'v5.0.0', 'android-v0.1.99-rc'];
    expect(planRelease('0.1.0', tags)).toMatchObject({ version: '0.1.11', previousTag: 'android-v0.1.10' });
  });

  it('기준이 가장 높은 태그보다 낮아도 내려가지 않는다 (태그가 없는 낮은 버전이라도)', () => {
    expect(planRelease('0.1.5', real).version).toBe('0.1.10');
  });

  it('다음 patch가 1000이면 거절 → package.json을 다음 minor로', () => {
    expect(() => planRelease('0.1.0', ['android-v0.1.999'])).toThrow(/minor/);
  });

  it('지금 AndroidManifest versionCode보다 크지 않으면 거절', () => {
    expect(() => planRelease('0.0.5', [], { currentCode: 10 })).toThrow(/versionCode/);
    expect(planRelease('0.0.11', [], { currentCode: 10 }).versionCode).toBe(11);
  });
});

describe('파일 쓰기 (CI 작업 폴더에서만)', () => {
  const manifest = readFileSync(join(ROOT, 'android/AndroidManifest.xml'), 'utf8');

  it('AndroidManifest의 versionName·versionCode만 바꾼다', () => {
    const out = rewriteManifest(manifest, '0.1.10', 1010);
    expect(out).toContain('android:versionName="0.1.10"');
    expect(out).toContain('android:versionCode="1010"');
    expect(readManifestCode(out)).toBe(1010);
    expect(out.replace(/android:version(Name|Code)="[^"]*"/g, '')).toBe(manifest.replace(/android:version(Name|Code)="[^"]*"/g, ''));
    expect(() => rewriteManifest('<manifest/>', '0.1.10', 1010)).toThrow();
  });

  function tempRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), 'rtd-relver-'));
    mkdirSync(join(dir, 'android'));
    mkdirSync(join(dir, 'tools'));
    // 저장소 파일을 복사하되 버전은 0.1.9 / versionCode 10으로 고정한다 — CI는 테스트 전에 작업 폴더의 버전을 이미
    // 다음 릴리스(예: 0.1.10 / 1010)로 바꿔 두므로, 저장소의 지금 버전에 기대면 CI에서만 깨진다 (v0.1.10 첫 실행 실패)
    const pin = (text: string, count: number): string => {
      let n = 0;
      return text.replace(/"version": "[^"]*"/g, (m) => (n++ < count ? '"version": "0.1.9"' : m));
    };
    writeFileSync(join(dir, 'package.json'), pin(readFileSync(join(ROOT, 'package.json'), 'utf8'), 1));
    writeFileSync(join(dir, 'package-lock.json'), pin(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'), 2));
    writeFileSync(
      join(dir, 'android/AndroidManifest.xml'),
      readFileSync(join(ROOT, 'android/AndroidManifest.xml'), 'utf8')
        .replace(/android:versionName="[^"]*"/, 'android:versionName="0.1.9"')
        .replace(/android:versionCode="[^"]*"/, 'android:versionCode="10"'),
    );
    cpSync(SCRIPT, join(dir, 'tools/release-version.mjs'));
    return dir;
  }

  it('writeVersion: package.json · package-lock 맨 위 두 곳 · AndroidManifest, 나머지 글자는 그대로', () => {
    const dir = tempRepo();
    try {
      const lockBefore = readFileSync(join(dir, 'package-lock.json'), 'utf8');
      const pkgBefore = readFileSync(join(dir, 'package.json'), 'utf8');
      writeVersion(dir, '0.1.10', 1010);
      const pkg = readFileSync(join(dir, 'package.json'), 'utf8');
      const lock = readFileSync(join(dir, 'package-lock.json'), 'utf8');
      expect(JSON.parse(pkg).version).toBe('0.1.10');
      const lockJson = JSON.parse(lock) as { version: string; packages: Record<string, { version?: string }> };
      expect(lockJson.version).toBe('0.1.10');
      expect(lockJson.packages['']?.version).toBe('0.1.10');
      // 의존성 버전은 그대로, 바뀐 줄은 정확히 그 두 곳뿐
      const changed = (a: string, b: string): number => a.split('\n').filter((line, i) => line !== b.split('\n')[i]).length;
      expect(changed(lockBefore, lock)).toBe(2);
      expect(changed(pkgBefore, pkg)).toBe(1);
      expect(readFileSync(join(dir, 'android/AndroidManifest.xml'), 'utf8')).toContain('android:versionName="0.1.10"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('CLI: --tags-file + --write → key=value 출력, 파일이 바뀐다', () => {
    const dir = tempRepo();
    try {
      const tags = join(dir, 'tags.txt');
      writeFileSync(tags, 'android-v0.1.7\nandroid-v0.1.8\nandroid-v0.1.9\n');
      const out = execFileSync('node', [join(dir, 'tools/release-version.mjs'), '--tags-file', tags, '--write'], { encoding: 'utf8' });
      expect(out).toBe('version=0.1.10\nversionCode=1010\npreviousTag=android-v0.1.9\n');
      expect((JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { version: string }).version).toBe('0.1.10');
      expect(readFileSync(join(dir, 'android/AndroidManifest.xml'), 'utf8')).toContain('android:versionCode="1010"');
      // 저장소 파일은 그대로
      expect(readFileSync(join(ROOT, 'android/AndroidManifest.xml'), 'utf8')).toBe(manifest);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('CLI: 거절되면 종료 코드 1', () => {
    const dir = tempRepo();
    try {
      const tags = join(dir, 'tags.txt');
      writeFileSync(tags, 'android-v0.1.999\n');
      expect(() => execFileSync('node', [join(dir, 'tools/release-version.mjs'), '--tags-file', tags], { stdio: 'pipe' })).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
