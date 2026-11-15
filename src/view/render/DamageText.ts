/**
 * 떠오르는 숫자 (DEV_PLAN M2-9, GDD 5.4 '피해 숫자', ART.md 2.4 '숫자'): 피해(물리 흰색·마법 하늘색·고정 노란색), 돈(금색 +n원).
 *
 * - Phaser Text를 미리 만들어 돌려 쓴다 (매번 만들고 지우면 느림). 동시에 최대 MAX_ACTIVE개, 넘치면 가장 오래된 것을 다시 쓴다.
 * - 성능 (T-1 ×16 측정): 크기(보통·큰 글자)별로 따로 돌려 쓴다 — 글자 크기를 바꾸면 Phaser가 글꼴을 다시 재는데(캔버스 픽셀 읽기) 이것이
 *   후반 판 화면 시간의 대부분이었다. 색과 글자는 한 번에 바꿔 캔버스를 한 번만 다시 그린다 (예전: 글자·색·크기마다 세 번).
 *   높은 배속에서는 동시에 떠 있는 수를 더 줄인다 (setMaxActive, Game 장면의 배속별 정책).
 * - 0.65초 동안 일정한 속도로 떠오르며 마지막 40%에 사라진다 (fxModel.floatingTextFrame). 매 프레임 시각으로 계산.
 * - 겹침 방지: 새 숫자는 지금 떠 있는 숫자들과 겹치지 않는 가장 낮은 칸에 놓는다 (fxModel.stackSlot, 최대 MAX_STACK칸 위).
 *   빈 칸이 없으면 피해 숫자는 띄우지 않는다 ('7'과 '18'이 겹쳐 '188'처럼 읽히는 것보다 낫다). 큰 글자(돈 +n원·즉사!·치명타)는
 *   늘 띄운다: 다른 큰 글자와 겹치지 않는 가장 낮은 칸(최대 BIG_MAX_STACK칸)에 놓고, 그 자리를 가리는 작은 피해 숫자는 지운다
 *   (fxModel.bigTextSlot, 검토 반영 — 붐비는 자리에서 '즉사!'가 피해 숫자·처치 돈에 묻히던 것).
 * - 깊이는 몹·타워·투사체 위.
 */
import Phaser from 'phaser';
import { COLORS } from '../../art/palette';
import { FONT_FAMILY } from '../config';
import { DAMAGE_TEXT_MS, bigTextSlot, floatingTextFrame, stackSlot, type TextBox } from './fxModel';

export const DAMAGE_TEXT_DEPTH = 6000;
/** 동시에 떠 있는 숫자 최대 수 */
export const MAX_ACTIVE = 48;
/** 겹치지 않게 위로 쌓는 최대 칸 수 */
export const MAX_STACK = 4;
/** 큰 글자가 다른 큰 글자를 피해 올라가는 최대 칸 수 */
export const BIG_MAX_STACK = 6;
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
  /** 크기별 쉬는 글자 (보통 · 큰 글자) — 글자 크기를 바꾸지 않고 돌려 쓴다 */
  private readonly free: { normal: Phaser.GameObjects.Text[]; big: Phaser.GameObjects.Text[] } = { normal: [], big: [] };
  private active: Active[] = [];
  private readonly fontPx: number;
  private maxActive = MAX_ACTIVE;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly tile: number,
  ) {
    this.fontPx = Math.max(14, Math.round(tile * 0.36));
  }

  /** 동시에 떠 있을 최대 수 (1 ~ MAX_ACTIVE). 높은 배속에서 줄인다. 넘친 것은 가장 오래된 것부터 지운다. */
  setMaxActive(n: number): void {
    const v = Math.max(1, Math.min(MAX_ACTIVE, Math.floor(n)));
    if (v === this.maxActive) return;
    this.maxActive = v;
    while (this.active.length > this.maxActive) this.release(this.active.shift() as Active);
  }

  private release(a: Active): void {
    a.text.setVisible(false);
    (a.big ? this.free.big : this.free.normal).push(a.text);
  }

  private take(big: boolean): Phaser.GameObjects.Text {
    // 꽉 찼으면 가장 오래된 것을 지워 자리를 만든다 (그 글자는 제 크기 쉼터로)
    while (this.active.length >= this.maxActive) this.release(this.active.shift() as Active);
    const pool = big ? this.free.big : this.free.normal;
    const t = pool.pop();
    if (t) return t;
    const size = big ? Math.round(this.fontPx * BIG_SCALE) : this.fontPx;
    return this.scene.add
      .text(0, 0, '', {
        fontFamily: FONT_FAMILY,
        fontSize: `${size}px`,
        fontStyle: '900',
        color: '#ffffff',
        stroke: COLORS.outline,
        strokeThickness: Math.max(3, Math.round(this.fontPx * 0.2)),
      })
      .setOrigin(0.5, 1)
      .setDepth(DAMAGE_TEXT_DEPTH)
      .setResolution(1);
  }

  /** 글자·색을 바꾸되 캔버스는 한 번만 다시 그린다 (바뀐 것이 없으면 그리지 않음). */
  private static paint(text: Phaser.GameObjects.Text, label: string, color: string): void {
    const recolor = text.style.color !== color;
    if (recolor) text.style.color = color;
    if (text.text !== label) text.setText(label);
    else if (recolor) text.updateText();
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
    const text = this.take(big); // 꽉 찼으면 가장 오래된 것을 빼서 다시 쓴다 → 그 뒤에 남은 것들과 겹침을 본다
    const others = this.active.map((a) => this.boxOf(a, timeMs));
    FloatingTextLayer.paint(text, label, color);
    const box: TextBox = { cx: x, bottom: y, w: text.width, h: size * BOX_H_OF_FONT };
    let slot = stackSlot(box, others, MAX_STACK);
    if (slot < 0) {
      if (!big) {
        text.setVisible(false);
        this.free.normal.push(text);
        return false;
      }
      const plan = bigTextSlot(
        box,
        this.active.map((a, i) => ({ box: others[i] as TextBox, big: a.big })),
        BIG_MAX_STACK,
      );
      slot = plan.slot;
      if (plan.drop.length > 0) {
        const gone = new Set(plan.drop.map((i) => this.active[i]));
        for (const a of gone) if (a) this.release(a);
        this.active = this.active.filter((a) => !gone.has(a));
      }
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
        this.release(a);
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
    for (const t of [...this.free.normal, ...this.free.big]) t.destroy();
    this.active = [];
    this.free.normal.length = 0;
    this.free.big.length = 0;
  }
}
