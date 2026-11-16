/** A-1 화면 쪽 규칙: 효과음 볼륨·사람 입력 전 무음, 화면 흔들림 설정, 안드로이드 뒤로 가기 순서, 안드로이드 버전 = package.json. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_VOLUME, EFFECTS, EffectAudio, LEGACY_VOLUME_KEY, VOLUME_KEY, normalizeVolume, parseVolume } from '../../src/audio/EffectAudio';
import { LEGACY_SCREEN_SHAKE_KEY, SCREEN_SHAKE_KEY, ScreenShake } from '../../src/save/ScreenShake';
import { MemoryStorage } from '../../src/save/storage';
import { handleBack, setBackHandler } from '../../src/ui/nativeBack';
import { prefersReducedMotion } from '../../src/ui/motion';
import { volumeText } from '../../src/ui/screens/PauseMenu';

/** 가짜 AudioContext: 만든 소리(주파수)만 기록 */
function fakeAudio() {
  const notes: number[] = [];
  let made = 0;
  const param = () => ({ value: 0, setValueAtTime: (v: number) => notes.push(v), linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} });
  const node = () => ({ connect: (n: unknown) => n, disconnect: () => {}, gain: { value: 1, setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} } });
  const ctx = {
    state: 'running',
    currentTime: 0,
    destination: {},
    createGain: () => node(),
    createOscillator: () => ({ ...node(), type: 'sine', frequency: param(), start: () => {}, stop: () => {}, onended: null }),
    resume: () => Promise.resolve(),
  };
  const factory = () => {
    made++;
    return ctx as unknown as AudioContext;
  };
  return { notes, factory, made: () => made, ctx };
}

describe('효과음', () => {
  it('볼륨: 0~100, 5 단위, 기본 40, 저장값(새 키 → 옛 키) 읽기', () => {
    expect(normalizeVolume(42)).toBe(40);
    expect(normalizeVolume(43)).toBe(45);
    expect(normalizeVolume(-3)).toBe(0);
    expect(normalizeVolume(140)).toBe(100);
    expect(normalizeVolume(Number.NaN)).toBeNull();
    expect(parseVolume('95')).toBe(95);
    expect(parseVolume('101')).toBeNull();
    expect(parseVolume('abc')).toBeNull();
    const s = new MemoryStorage();
    expect(new EffectAudio(s, null).volume).toBe(DEFAULT_VOLUME);
    s.setItem(LEGACY_VOLUME_KEY, '70');
    expect(new EffectAudio(s, null).volume).toBe(70);
    s.setItem(VOLUME_KEY, '15');
    const a = new EffectAudio(s, null);
    expect(a.volume).toBe(15);
    a.volume = 62;
    expect(a.volume).toBe(60);
    expect(s.getItem(VOLUME_KEY)).toBe('60');
    expect(volumeText(0)).toBe('음소거');
    expect(volumeText(40)).toBe('40%');
  });

  it('사람 입력(unlock) 전에는 AudioContext를 만들지 않고 소리도 없다, 음소거면 unlock도 하지 않는다', () => {
    const f = fakeAudio();
    const a = new EffectAudio(new MemoryStorage(), f.factory);
    a.play('summon');
    expect(f.made()).toBe(0);
    expect(a.started).toBe(false);
    a.unlock();
    expect(f.made()).toBe(1);
    a.play('summon');
    expect(f.notes).toEqual(EFFECTS.summon.notes.map((n) => n.hz));
    // 연타는 하나로 (같은 currentTime)
    a.play('summon');
    expect(a.played).toBe(1);
    a.play('merge');
    expect(f.notes.slice(2)).toEqual([392, 523.25, 783.99]);

    const muted = fakeAudio();
    const b = new EffectAudio(new MemoryStorage(), muted.factory);
    b.volume = 0;
    b.unlock();
    b.play('merge');
    expect(muted.made()).toBe(0);
  });
});

describe('화면 흔들림', () => {
  it('저장값이 없으면 동작 줄이기를 따르고, 바꾸면 기기에 저장 (옛 키도 읽음)', () => {
    let reduce = true;
    const s = new MemoryStorage();
    const shake = new ScreenShake(s, () => reduce);
    expect(shake.enabled).toBe(false);
    reduce = false;
    expect(shake.enabled).toBe(true);
    shake.enabled = false;
    expect(s.getItem(SCREEN_SHAKE_KEY)).toBe('off');
    expect(new ScreenShake(s, () => false).enabled).toBe(false);
    const old = new MemoryStorage();
    old.setItem(LEGACY_SCREEN_SHAKE_KEY, 'on');
    expect(new ScreenShake(old, () => true).enabled).toBe(true);
  });

  it('prefersReducedMotion: matchMedia가 없으면 false', () => {
    expect(prefersReducedMotion({})).toBe(false);
    expect(prefersReducedMotion({ matchMedia: () => ({ matches: true }) })).toBe(true);
  });
});

describe('안드로이드 뒤로 가기', () => {
  it('열린 <dialog> 맨 위부터 닫고, 없으면 장면 처리기, 처리기도 없으면 false (앱이 닫힘)', () => {
    const closed: string[] = [];
    const dlg = (id: string) => ({ close: () => closed.push(id) });
    let open = [dlg('a'), dlg('b')];
    const doc = { querySelectorAll: () => open } as unknown as Document;
    expect(handleBack(doc)).toBe(true);
    expect(closed).toEqual(['b']);
    open = [];
    setBackHandler(null);
    expect(handleBack(doc)).toBe(false);
    let n = 0;
    setBackHandler(() => {
      n++;
      return true;
    });
    expect(handleBack(doc)).toBe(true);
    expect(n).toBe(1);
    setBackHandler(null);
  });
});

describe('안드로이드 버전', () => {
  const root = join(__dirname, '..', '..');
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };
  const manifest = readFileSync(join(root, 'android', 'AndroidManifest.xml'), 'utf8');

  it('AndroidManifest versionName = package.json version, versionCode는 v0.1.7(8)보다 크다, 앱 ID는 그대로', () => {
    const name = /android:versionName="([^"]+)"/.exec(manifest)?.[1];
    const code = Number(/android:versionCode="(\d+)"/.exec(manifest)?.[1]);
    expect(name).toBe(pkg.version);
    expect(Number.isSafeInteger(code)).toBe(true);
    expect(code).toBeGreaterThan(8);
    expect(manifest).toContain('package="com.woohak.randomtd"');
  });

  it('build-apk.sh가 dist 전체를 넣고(aapt2 -A dist) 버전이 맞는지 다시 확인한다', () => {
    const script = readFileSync(join(root, 'android', 'build-apk.sh'), 'utf8');
    expect(script).toContain('-A "$project/dist"');
    expect(script).toContain('versionName');
  });
});
