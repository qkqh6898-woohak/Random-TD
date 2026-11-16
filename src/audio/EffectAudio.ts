/**
 * 효과음 (A-1, Codex 갈래 M6-11에서 옮김): 소환·승급 소리를 WebAudio로 합성한다 (소리 파일 없음 — CLAUDE.md 1장).
 *
 * - 볼륨 0~100%, 5% 단위, 기본 40%, 0 = 음소거. 기기에 저장 (키 `rtd.effectVolume`; v0.1.7의 `random-td.effect-volume`가 있으면
 *   새 키가 없을 때 그것을 읽는다).
 * - 브라우저 자동 재생 규칙: AudioContext는 사람이 누른 입력(click·touchend·keydown) 안에서 `unlock()`할 때 처음 만든다.
 *   그 전에는 아무 소리도 내지 않고 AudioContext도 만들지 않는다.
 * - 같은 효과를 아주 짧게 연달아(꾹 눌러 연속 소환) 부르면 하나로 묶는다 (spacing).
 * - sim과 무관 (화면 사건을 듣고 소리만 낸다).
 */
import type { KeyValueStorage } from '../save/storage';

export const VOLUME_KEY = 'rtd.effectVolume';
export const LEGACY_VOLUME_KEY = 'random-td.effect-volume';
export const DEFAULT_VOLUME = 40;
export const VOLUME_STEP = 5;
/** 깨우는 중(resume)에 부른 소리는 이만큼 늦어지면 버린다 (늦게 나는 소리는 엉뚱한 때 들린다) */
const MAX_RESUME_DELAY_MS = 180;

export type SoundEffect = 'summon' | 'merge';

interface Tone {
  wave: OscillatorType;
  hz: number;
  endHz: number;
  delay: number;
  seconds: number;
  level: number;
}

/** 효과별 음 (첫 음의 주파수가 E2E에서 확인하는 값). */
export const EFFECTS: Readonly<Record<SoundEffect, { spacing: number; notes: readonly Tone[] }>> = {
  summon: {
    spacing: 0.1,
    notes: [
      { wave: 'sine', hz: 300, endHz: 155, delay: 0, seconds: 0.055, level: 0.3 },
      { wave: 'triangle', hz: 523.25, endHz: 659.25, delay: 0.038, seconds: 0.13, level: 0.24 },
    ],
  },
  merge: {
    spacing: 0.22,
    notes: [
      { wave: 'triangle', hz: 392, endHz: 440, delay: 0, seconds: 0.14, level: 0.26 },
      { wave: 'triangle', hz: 523.25, endHz: 659.25, delay: 0.098, seconds: 0.17, level: 0.24 },
      { wave: 'sine', hz: 783.99, endHz: 1046.5, delay: 0.2, seconds: 0.2, level: 0.28 },
    ],
  },
};

/** 볼륨 값 정리: 0~100, 5 단위로 반올림. 숫자가 아니면 null (순수). */
export function normalizeVolume(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const clamped = Math.max(0, Math.min(100, value));
  return Math.round(clamped / VOLUME_STEP) * VOLUME_STEP;
}

/** 저장 글자 → 볼륨 (없거나 이상하면 null, 순수). */
export function parseVolume(raw: string | null): number | null {
  if (raw === null || !/^\d{1,3}$/.test(raw)) return null;
  const n = Number(raw);
  return n <= 100 ? normalizeVolume(n) : null;
}

type AudioContextFactory = () => AudioContext;

export class EffectAudio {
  private value = DEFAULT_VOLUME;
  private context: AudioContext | undefined;
  private output: GainNode | undefined;
  private resuming: Promise<void> | undefined;
  private readonly nextAt: Record<SoundEffect, number> = { summon: 0, merge: 0 };
  /** 낸 소리 수 (확인용) */
  played = 0;

  constructor(
    private readonly storage: KeyValueStorage,
    private readonly makeContext: AudioContextFactory | null = typeof AudioContext === 'function' ? () => new AudioContext({ latencyHint: 'interactive' }) : null,
  ) {
    try {
      const v = parseVolume(storage.getItem(VOLUME_KEY)) ?? parseVolume(storage.getItem(LEGACY_VOLUME_KEY));
      if (v !== null) this.value = v;
    } catch {
      // 저장소가 없어도 이번 실행 동안은 볼륨을 바꿀 수 있다
    }
  }

  get volume(): number {
    return this.value;
  }

  set volume(value: number) {
    const next = normalizeVolume(value);
    if (next === null || next === this.value) return;
    this.value = next;
    if (this.output) this.output.gain.value = next / 100;
    try {
      this.storage.setItem(VOLUME_KEY, String(next));
    } catch {
      // 열린 앱에는 그대로 적용
    }
  }

  /** AudioContext를 만들었는가 (사람 입력 전에는 false) */
  get started(): boolean {
    return this.context !== undefined;
  }

  /** 사람이 누른 입력 안에서만 부른다 (브라우저가 소리를 허락하게). 음소거면 아무것도 하지 않는다. */
  unlock(): void {
    if (this.value === 0 || !this.makeContext) return;
    try {
      if (!this.context) {
        const context = this.makeContext();
        const output = context.createGain();
        output.gain.value = this.value / 100;
        output.connect(context.destination);
        this.context = context;
        this.output = output;
      }
      if (this.context.state !== 'running' && !this.resuming) {
        this.resuming = this.context
          .resume()
          .catch(() => {})
          .finally(() => {
            this.resuming = undefined;
          });
      }
    } catch {
      // 소리를 낼 수 없는 환경이어도 게임은 계속
    }
  }

  play(effect: SoundEffect): void {
    if (this.value === 0 || !this.context) return;
    if (this.context.state === 'running') {
      this.playReady(effect);
    } else if (this.resuming) {
      const at = performance.now();
      void this.resuming.then(() => {
        if (performance.now() - at <= MAX_RESUME_DELAY_MS) this.playReady(effect);
      });
    }
  }

  private playReady(effect: SoundEffect): void {
    const { context, output } = this;
    if (this.value === 0 || !output || context?.state !== 'running') return;
    const now = context.currentTime;
    if (now < this.nextAt[effect]) return;
    const { spacing, notes } = EFFECTS[effect];
    this.nextAt[effect] = now + spacing;
    this.played++;
    for (const note of notes) {
      const start = now + 0.008 + note.delay;
      const end = start + note.seconds;
      const voice = context.createOscillator();
      const envelope = context.createGain();
      voice.type = note.wave;
      voice.frequency.setValueAtTime(note.hz, start);
      voice.frequency.exponentialRampToValueAtTime(note.endHz, end);
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(note.level, start + 0.012);
      envelope.gain.exponentialRampToValueAtTime(0.001, end);
      voice.connect(envelope).connect(output);
      voice.onended = () => {
        voice.disconnect();
        envelope.disconnect();
      };
      voice.start(start);
      voice.stop(end);
    }
  }
}
