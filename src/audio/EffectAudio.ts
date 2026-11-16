const VOLUME_KEY = 'random-td.effect-volume';
const DEFAULT_VOLUME = 40;
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

const EFFECTS: Readonly<Record<SoundEffect, { spacing: number; notes: readonly Tone[] }>> = {
  summon: {
    spacing: 0.1,
    notes: [
      { wave: 'sine', hz: 300, endHz: 155, delay: 0, seconds: 0.055, level: 0.30 },
      { wave: 'triangle', hz: 523.25, endHz: 659.25, delay: 0.038, seconds: 0.13, level: 0.24 },
    ],
  },
  merge: {
    spacing: 0.22,
    notes: [
      { wave: 'triangle', hz: 392, endHz: 440, delay: 0, seconds: 0.14, level: 0.26 },
      { wave: 'triangle', hz: 523.25, endHz: 659.25, delay: 0.098, seconds: 0.17, level: 0.24 },
      { wave: 'sine', hz: 783.99, endHz: 1046.5, delay: 0.20, seconds: 0.20, level: 0.28 },
    ],
  },
};

/** 기기 볼륨을 적용해 짧은 효과음을 합성한다. 게임 시뮬레이션과 별도로 동작한다. */
export class EffectAudio {
  private value = DEFAULT_VOLUME;
  private context: AudioContext | undefined;
  private output: GainNode | undefined;
  private resuming: Promise<void> | undefined;
  private readonly nextAt: Record<SoundEffect, number> = { summon: 0, merge: 0 };

  constructor(private readonly storage: () => Pick<Storage, 'getItem' | 'setItem'>) {
    try {
      const value = this.storage().getItem(VOLUME_KEY);
      if (value !== null && /^(100|[0-9]{1,2})$/.test(value)) this.value = Number(value);
    } catch {
      // 저장소가 없어도 이 세션에서 볼륨을 바꿀 수 있다.
    }
  }

  get volume(): number {
    return this.value;
  }

  set volume(value: number) {
    if (!Number.isFinite(value)) return;
    const next = Math.max(0, Math.min(100, Math.round(value)));
    if (next === this.value) return;
    this.value = next;
    if (this.output) this.output.gain.value = this.value / 100;
    try {
      this.storage().setItem(VOLUME_KEY, String(this.value));
    } catch {
      // 열린 앱에는 변경한 볼륨을 그대로 적용한다.
    }
  }

  /** 브라우저가 재생을 허용하도록 사용자 입력 중에만 호출한다. */
  unlock(): void {
    if (this.value === 0) return;
    try {
      if (!this.context) {
        const context = new AudioContext({ latencyHint: 'interactive' });
        const output = context.createGain();
        output.gain.value = this.value / 100;
        output.connect(context.destination);
        this.context = context;
        this.output = output;
      }
      if (this.context.state !== 'running' && !this.resuming) {
        this.resuming = this.context.resume().catch(() => {}).finally(() => { this.resuming = undefined; });
      }
    } catch {
      // 오디오 출력을 쓸 수 없는 환경에서도 전투를 진행한다.
    }
  }

  play(effect: SoundEffect): void {
    if (this.value === 0) return;
    if (this.context?.state === 'running') {
      this.playReady(effect);
    } else if (this.resuming) {
      const requestedAt = performance.now();
      void this.resuming.then(() => {
        if (performance.now() - requestedAt <= MAX_RESUME_DELAY_MS) this.playReady(effect);
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
