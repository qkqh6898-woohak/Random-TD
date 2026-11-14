/**
 * 떠오르는 숫자 (DEV_PLAN M2-9, GDD 5.4 '피해 숫자', ART.md 2.4 '숫자'): 피해(물리 흰색·마법 하늘색·고정 노란색), 돈(금색 +n원).
 *
 * - Phaser Text를 미리 만들어 돌려 쓴다 (매번 만들고 지우면 느림). 동시에 최대 MAX_ACTIVE개, 넘치면 가장 오래된 것을 다시 쓴다.
 * - 0.65초 동안 일정한 속도로 떠오르며 마지막 40%에 사라진다 (fxModel.floatingTextFrame). 매 프레임 시각으로 계산.
 * - 겹침 방지: 새 숫자는 지금 떠 있는 숫자들과 겹치지 않는 가장 낮은 칸에 놓는다 (fxModel.stackSlot, 최대 MAX_STACK칸 위).
 *   빈 칸이 없으면 피해 숫자는 띄우지 않는다 ('7'과 '18'이 겹쳐 '188'처럼 읽히는 것보다 낫다). 돈(+n원)은 늘 띄운다.
 * - 깊이는 몹·타워·투사체 위.
 */
import Phaser from 'phaser';
import { COLORS } from '../../art/palette';
import { FONT_FAMILY } from '../config';
import { DAMAGE_TEXT_MS, floatingTextFrame, stackSlot, type TextBox } from './fxModel';

export const DAMAGE_TEXT_DEPTH = 6000;
/** 동시에 떠 있는 숫자 최대 수 */
export const MAX_ACTIVE = 48;
/** 겹치지 않게 위로 쌓는 최대 칸 수 */
export const MAX_STACK = 4;
/** 겹침 판정 상자 높이 = 쌓는 간격 (글자 크기 배수): 숫자 높이 + 테두리 + 등장 때 1.15배로 커지는 몫 */
const BOX_H_OF_FONT = 1.15;
/** 큰 숫자(돈·치명타) 글자 크기 배수 */
const BIG_SCALE = 1.15;

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

  /** 떠 있는 숫자 a의 timeMs 때 상자 (겹침 판정용, 화면 px). */
  private boxOf(a: Active, timeMs: number): TextBox {
    const f = floatingTextFrame((timeMs - a.start) / a.dur);
    const size = a.big ? Math.round(this.fontPx * BIG_SCALE) : this.fontPx;
    return { cx: a.x, bottom: a.y - f.rise * this.tile * (a.big ? 0.8 : 1), w: a.text.width, h: size * BOX_H_OF_FONT };
  }

  /**
   * 숫자 하나 띄우기. 떠 있는 숫자와 겹치지 않게 위로 쌓는다.
   * @param x 화면 px (가운데)
   * @param y 화면 px (아래 끝)
   * @param big 크게 (돈·치명타). 쌓을 자리가 없어도 띄운다
   * @returns 띄웠으면 true (피해 숫자는 쌓을 자리가 없으면 false)
   */
  spawn(x: number, y: number, label: string, color: string, timeMs: number, big = false): boolean {
    const size = big ? Math.round(this.fontPx * BIG_SCALE) : this.fontPx;
    const others = this.active.map((a) => this.boxOf(a, timeMs));
    const text = this.take();
    text.setText(label).setColor(color).setFontSize(size);
    const box: TextBox = { cx: x, bottom: y, w: text.width, h: size * BOX_H_OF_FONT };
    let slot = stackSlot(box, others, MAX_STACK);
    if (slot < 0) {
      if (!big) {
        text.setVisible(false);
        this.free.push(text);
        return false;
      }
      slot = 0;
    }
    const sy = y - slot * box.h;
    text.setVisible(true).setAlpha(1).setScale(floatingTextFrame(0).scale);
    text.setPosition(x, sy);
    this.active.push({ text, x, y: sy, start: timeMs, dur: DAMAGE_TEXT_MS, big });
    return true;
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

  /** E2E 확인용: 떠 있는 글자와 화면 상자 (Phaser 경계, 기준 px) */
  activeBounds(): { label: string; big: boolean; x: number; y: number; w: number; h: number }[] {
    return this.active.map((a) => {
      const b = a.text.getBounds();
      return { label: a.text.text, big: a.big, x: b.x, y: b.y, w: b.width, h: b.height };
    });
  }

  destroy(): void {
    for (const a of this.active) a.text.destroy();
    for (const t of this.free) t.destroy();
    this.active = [];
    this.free.length = 0;
  }
}
