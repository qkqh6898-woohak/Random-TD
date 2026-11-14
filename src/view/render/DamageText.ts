/**
 * 떠오르는 숫자 (DEV_PLAN M2-9, GDD 5.4 '피해 숫자', ART.md 2.4 '숫자'): 피해(물리 흰색·마법 하늘색·고정 노란색), 돈(금색 +n원).
 *
 * - Phaser Text를 미리 만들어 돌려 쓴다 (매번 만들고 지우면 느림). 동시에 최대 MAX_ACTIVE개, 넘치면 가장 오래된 것을 다시 쓴다.
 * - 0.65초 동안 위로 떠오르며 마지막 40%에 사라진다 (fxModel.floatingTextFrame). 매 프레임 시각으로 계산.
 * - 깊이는 몹·타워·투사체 위.
 */
import Phaser from 'phaser';
import { COLORS } from '../../art/palette';
import { FONT_FAMILY } from '../config';
import { DAMAGE_TEXT_MS, floatingTextFrame } from './fxModel';

export const DAMAGE_TEXT_DEPTH = 6000;
/** 동시에 떠 있는 숫자 최대 수 */
export const MAX_ACTIVE = 48;

interface Active {
  text: Phaser.GameObjects.Text;
  x: number;
  y: number;
  start: number;
  dur: number;
  big: boolean;
}

export class FloatingTextLayer {
  private readonly free: Phaser.GameObjects.Text[] = [];
  private active: Active[] = [];
  private readonly fontPx: number;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly tile: number,
  ) {
    this.fontPx = Math.max(14, Math.round(tile * 0.36));
  }

  private take(): Phaser.GameObjects.Text {
    const t = this.free.pop();
    if (t) return t;
    if (this.active.length >= MAX_ACTIVE) {
      const oldest = this.active.shift() as Active;
      return oldest.text;
    }
    return this.scene.add
      .text(0, 0, '', {
        fontFamily: FONT_FAMILY,
        fontSize: `${this.fontPx}px`,
        fontStyle: '900',
        color: '#ffffff',
        stroke: COLORS.outline,
        strokeThickness: Math.max(3, Math.round(this.fontPx * 0.2)),
      })
      .setOrigin(0.5, 1)
      .setDepth(DAMAGE_TEXT_DEPTH)
      .setResolution(1);
  }

  /**
   * 숫자 하나 띄우기.
   * @param x 화면 px (가운데)
   * @param y 화면 px (아래 끝)
   * @param big 크게 (돈·치명타)
   */
  spawn(x: number, y: number, label: string, color: string, timeMs: number, big = false): void {
    const text = this.take();
    text.setText(label).setColor(color).setVisible(true).setAlpha(1);
    text.setFontSize(big ? Math.round(this.fontPx * 1.15) : this.fontPx);
    text.setPosition(x, y);
    this.active.push({ text, x, y, start: timeMs, dur: DAMAGE_TEXT_MS, big });
  }

  update(timeMs: number): void {
    const keep: Active[] = [];
    for (const a of this.active) {
      const k = (timeMs - a.start) / a.dur;
      if (k >= 1) {
        a.text.setVisible(false);
        this.free.push(a.text);
        continue;
      }
      const f = floatingTextFrame(k);
      a.text.setPosition(a.x, a.y - f.rise * this.tile * (a.big ? 0.8 : 1));
      a.text.setAlpha(f.alpha);
      a.text.setScale(f.scale);
      keep.push(a);
    }
    this.active = keep;
  }

  get activeCount(): number {
    return this.active.length;
  }

  /** E2E 확인용: 떠 있는 글자 목록 */
  get activeLabels(): string[] {
    return this.active.map((a) => a.text.text);
  }

  destroy(): void {
    for (const a of this.active) a.text.destroy();
    for (const t of this.free) t.destroy();
    this.active = [];
    this.free.length = 0;
  }
}
